import { describe, expect, it } from "vitest";
import type { InventoryException, Location } from "../../src/shared/domain.js";
import {
  filterByRisk,
  formatEuro,
  locationName,
  recommendedOption,
  riskLevel,
} from "../../src/web/view-model.js";

const locations: Location[] = [
  { id: "store-01", name: "Dublin Grafton Street", city: "Dublin", type: "store" },
  { id: "store-02", name: "Cork Patrick Street", city: "Cork", type: "store" },
];

const hero: InventoryException = {
  id: "exception:store-01:HL-KNT-EVD-FGN-M",
  locationId: "store-01",
  sku: "HL-KNT-EVD-FGN-M",
  productName: "Everyday Knit — Forest Green — Size M",
  available: 12,
  dailyDemand: 8,
  coverDays: 1.5,
  nextInboundDay: 5,
  projectedShortageUnits: 28,
  projectedRevenueExposureEur: 1792,
  priorityScore: 2221,
  evidence: [],
  options: [
    {
      id: "wait",
      type: "wait",
      sourceLocationId: null,
      destinationLocationId: "store-01",
      sku: "HL-KNT-EVD-FGN-M",
      quantity: 0,
      arrivalDay: 5,
      costEur: 0,
      feasible: false,
      constraints: ["Projected shortage"],
      projectedDestinationCoverDays: 1.5,
      projectedSourceCoverDays: null,
    },
    {
      id: "cork",
      type: "store-transfer",
      sourceLocationId: "store-02",
      destinationLocationId: "store-01",
      sku: "HL-KNT-EVD-FGN-M",
      quantity: 32,
      arrivalDay: 1,
      costEur: 31,
      feasible: true,
      constraints: ["Donor protection floor: 28 units"],
      projectedDestinationCoverDays: 4,
      projectedSourceCoverDays: 12,
    },
  ],
};

describe("frontend view model", () => {
  it("keeps exact hero values and identifies critical risk", () => {
    expect(hero.productName).toBe("Everyday Knit — Forest Green — Size M");
    expect(hero.available).toBe(12);
    expect(hero.coverDays).toBe(1.5);
    expect(riskLevel(hero)).toBe("critical");
    expect(formatEuro(hero.projectedRevenueExposureEur)).toContain("1,792");
  });

  it("selects a feasible protected transfer and resolves store names", () => {
    expect(recommendedOption(hero.options)?.id).toBe("cork");
    expect(recommendedOption(hero.options)?.quantity).toBe(32);
    expect(recommendedOption(hero.options)?.projectedSourceCoverDays).toBe(12);
    expect(locationName(locations, "store-02")).toBe("Cork Patrick Street");
  });

  it("filters risk without altering the API-sorted collection", () => {
    const watch = { ...hero, id: "watch", coverDays: 3 };
    const source = [hero, watch];
    expect(filterByRisk(source, "critical")).toEqual([hero]);
    expect(filterByRisk(source, "watch")).toEqual([watch]);
    expect(source).toHaveLength(2);
  });
});
