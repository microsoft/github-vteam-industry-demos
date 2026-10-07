import type { ActionOption } from "../shared/contracts.js";
import type { InventoryException, Location } from "../shared/domain.js";

export type RiskFilter = "all" | "critical" | "watch";

export function formatEuro(value: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function riskLevel(item: InventoryException): "critical" | "watch" {
  return item.coverDays < 2 ? "critical" : "watch";
}

export function filterByRisk(
  exceptions: InventoryException[],
  filter: RiskFilter,
): InventoryException[] {
  return filter === "all" ? exceptions : exceptions.filter((item) => riskLevel(item) === filter);
}

export function locationName(locations: Location[], id: string | null): string {
  if (!id) return "No source";
  return locations.find((location) => location.id === id)?.name ?? id;
}

export function optionLabel(option: ActionOption, locations: Location[]): string {
  if (option.type === "wait") return "Wait for scheduled inbound";
  if (option.type === "warehouse") return `Replenish from ${locationName(locations, option.sourceLocationId)}`;
  return `Transfer from ${locationName(locations, option.sourceLocationId)}`;
}

export function recommendedOption(options: ActionOption[]): ActionOption | undefined {
  return options.find((option) => option.feasible && option.type === "store-transfer")
    ?? options.find((option) => option.feasible);
}
