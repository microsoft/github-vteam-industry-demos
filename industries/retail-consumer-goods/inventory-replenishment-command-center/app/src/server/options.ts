import type { ActionOption } from "../shared/contracts.js";
import type { ApplicationState, InventoryException, SeedData } from "../shared/domain.js";
import { averageDailyDemand, coverDays, exactInventory } from "./calculations.js";

export function generateOptions(
  data: SeedData,
  state: ApplicationState,
  exception: InventoryException,
): ActionOption[] {
  const destinationDemand = exception.dailyDemand;
  const horizon = exception.nextInboundDay ?? data.settings.criticalCoverDays;
  const wait: ActionOption = {
    id: `wait:${exception.id}`,
    type: "wait",
    sourceLocationId: null,
    destinationLocationId: exception.locationId,
    sku: exception.sku,
    quantity: 0,
    arrivalDay: horizon,
    costEur: 0,
    feasible: exception.projectedShortageUnits === 0,
    constraints:
      exception.projectedShortageUnits > 0
        ? [`Projected shortage of ${exception.projectedShortageUnits} units before inbound`]
        : [],
    projectedDestinationCoverDays: exception.coverDays,
    projectedSourceCoverDays: null,
  };

  const candidates: ActionOption[] = [];
  for (const route of data.routes.filter(
    (candidate) => candidate.destinationLocationId === exception.locationId,
  )) {
    const sourceInventory = exactInventory(data, state, route.sourceLocationId, exception.sku);
    const sourceDemand =
      route.sourceLocationId === "warehouse-dublin-central"
        ? 0
        : averageDailyDemand(data, route.sourceLocationId, exception.sku);
    const sourceAvailable = sourceInventory.onHand - sourceInventory.reserved;
    const protectedUnits =
      route.sourceLocationId === "warehouse-dublin-central"
        ? 20
        : Math.ceil(sourceDemand * data.settings.donorProtectionDays);
    const transferable = Math.max(0, sourceAvailable - protectedUnits);
    const destinationAtArrival = Math.max(
      0,
      exception.available - destinationDemand * route.leadDays,
    );
    const remainingDays = Math.max(0, horizon - route.leadDays);
    const required = Math.max(0, Math.ceil(destinationDemand * remainingDays));
    const quantity = Math.min(required, transferable);
    const projectedSourceAvailable = sourceAvailable - quantity;
    const feasible = quantity >= required && required > 0 && route.leadDays < horizon;
    candidates.push({
      id: `${route.sourceLocationId}:${exception.id}`,
      type:
        route.sourceLocationId === "warehouse-dublin-central" ? "warehouse" : "store-transfer",
      sourceLocationId: route.sourceLocationId,
      destinationLocationId: exception.locationId,
      sku: exception.sku,
      quantity,
      arrivalDay: route.leadDays,
      costEur: Math.round((route.baseCostEur + quantity * route.unitCostEur) * 100) / 100,
      feasible,
      constraints: [
        ...(quantity < required ? [`Only ${quantity} of ${required} required units available`] : []),
        ...(route.leadDays >= horizon ? ["Arrival is not before the risk horizon"] : []),
        `Donor protection floor: ${protectedUnits} units`,
      ],
      projectedDestinationCoverDays: coverDays(
        destinationAtArrival + quantity,
        destinationDemand,
      ),
      projectedSourceCoverDays:
        sourceDemand > 0 ? coverDays(projectedSourceAvailable, sourceDemand) : null,
    });
  }
  return [wait, ...candidates].sort((left, right) => {
    if (left.feasible !== right.feasible) return left.feasible ? -1 : 1;
    if (left.type === "store-transfer" && right.type !== "store-transfer") return -1;
    if (right.type === "store-transfer" && left.type !== "store-transfer") return 1;
    return left.arrivalDay - right.arrivalDay || left.costEur - right.costEur;
  });
}
