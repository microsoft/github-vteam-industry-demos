import type {
  ApplicationState,
  InventoryException,
  InventoryRecord,
  SeedData,
} from "../shared/domain.js";

export function exactInventory(
  data: SeedData,
  state: ApplicationState,
  locationId: string,
  sku: string,
): InventoryRecord {
  const base = data.inventory.find(
    (record) => record.locationId === locationId && record.sku === sku,
  );
  if (!base) throw new Error(`Inventory not found for ${locationId}/${sku}`);
  let onHand = base.onHand;
  let reserved = base.reserved;
  for (const action of state.actions) {
    if (action.option.sku !== sku || action.option.type !== "store-transfer") continue;
    const source = action.option.sourceLocationId;
    const destination = action.option.destinationLocationId;
    if (action.status === "approved" && source === locationId) reserved += action.option.quantity;
    if (["dispatched", "received"].includes(action.status) && source === locationId) {
      onHand -= action.option.quantity;
    }
    if (action.status === "received" && destination === locationId) onHand += action.option.quantity;
  }
  return { ...base, onHand, reserved };
}

export function averageDailyDemand(
  data: SeedData,
  locationId: string,
  sku: string,
): number {
  const minimumDay = -(data.settings.demandWindowDays - 1);
  const values = data.sales.filter(
    (sale) => sale.locationId === locationId && sale.sku === sku && sale.day >= minimumDay,
  );
  if (values.length === 0) return 0;
  return values.reduce((sum, sale) => sum + sale.units, 0) / values.length;
}

export function coverDays(available: number, dailyDemand: number): number {
  if (dailyDemand <= 0) return 999;
  return available / dailyDemand;
}

export function calculateException(
  data: SeedData,
  state: ApplicationState,
  locationId: string,
  sku: string,
): InventoryException {
  const inventory = exactInventory(data, state, locationId, sku);
  const product = data.products.find((candidate) => candidate.sku === sku);
  if (!product) throw new Error(`Product not found for exact SKU ${sku}`);
  const available = inventory.onHand - inventory.reserved;
  const dailyDemand = averageDailyDemand(data, locationId, sku);
  const days = coverDays(available, dailyDemand);
  const nextInboundDay =
    inventory.incoming.length > 0
      ? Math.min(...inventory.incoming.map((incoming) => incoming.arrivalDay))
      : null;
  const horizon = nextInboundDay ?? data.settings.criticalCoverDays;
  const projectedShortageUnits = Math.max(0, Math.ceil(dailyDemand * horizon - available));
  const projectedRevenueExposureEur = projectedShortageUnits * product.unitPriceEur;
  const promotion = data.promotions.find(
    (candidate) => candidate.locationId === locationId && candidate.sku === sku,
  );
  const priorityScore =
    Math.round(
      (projectedRevenueExposureEur * 0.5 +
        Math.max(0, data.settings.criticalCoverDays - days) * 100 +
        (promotion ? 150 : 0)) *
        100,
    ) / 100;
  return {
    id: `exception:${locationId}:${sku}`,
    locationId,
    sku,
    productName: `${product.name} — ${product.colour} — Size ${product.size}`,
    available,
    dailyDemand,
    coverDays: days,
    nextInboundDay,
    projectedShortageUnits,
    projectedRevenueExposureEur,
    priorityScore,
    evidence: [
      { id: `inventory:${locationId}:${sku}`, kind: "inventory", label: "Available units", value: available },
      { id: `sales:${locationId}:${sku}`, kind: "sales", label: "28-day daily demand", value: dailyDemand },
      {
        id: `delivery:${locationId}:${sku}`,
        kind: "delivery",
        label: "Next scheduled inbound day",
        value: nextInboundDay ?? "None",
      },
      ...(promotion
        ? [
            {
              id: `promotion:${promotion.id}`,
              kind: "promotion" as const,
              label: "Local promotion signal",
              value: promotion.name,
            },
          ]
        : []),
    ],
    options: [],
  };
}

export function listExceptions(data: SeedData, state: ApplicationState): InventoryException[] {
  const exceptions = data.inventory
    .filter((record) => record.locationId.startsWith("store-"))
    .map((record) => calculateException(data, state, record.locationId, record.sku))
    .filter(
      (exception) =>
        exception.coverDays < data.settings.criticalCoverDays ||
        (exception.nextInboundDay !== null && exception.coverDays < exception.nextInboundDay),
    );
  return exceptions.sort(
    (left, right) =>
      right.priorityScore - left.priorityScore ||
      left.locationId.localeCompare(right.locationId) ||
      left.sku.localeCompare(right.sku),
  );
}
