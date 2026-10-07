import { describe, expect, it } from "vitest";
import { calculateException, exactInventory } from "../../src/server/calculations.js";
import { createSeedData } from "../../src/server/data/seed.js";
import { generateOptions } from "../../src/server/options.js";
import { initialState } from "../../src/server/state.js";

describe("deterministic calculations", () => {
  it("preserves the approved hero values and transfer", () => {
    const data = createSeedData();
    const state = initialState();
    const exception = calculateException(data, state, "store-01", "HL-KNT-EVD-FGN-M");
    exception.options = generateOptions(data, state, exception);
    const cork = exception.options.find(
      (option) => option.sourceLocationId === "store-02",
    );

    expect(exception.available).toBe(12);
    expect(exception.dailyDemand).toBe(8);
    expect(exception.coverDays).toBe(1.5);
    expect(exception.nextInboundDay).toBe(5);
    expect(cork).toMatchObject({
      quantity: 32,
      arrivalDay: 1,
      feasible: true,
      projectedSourceCoverDays: 12,
    });
  });

  it("keeps inventory calculations isolated to the exact size/colour SKU", () => {
    const data = createSeedData();
    const state = initialState();
    const otherSku = data.products[1]!.sku;
    const other = data.inventory.find(
      (record) => record.locationId === "store-01" && record.sku === otherSku,
    )!;
    other.onHand = 999;

    expect(exactInventory(data, state, "store-01", "HL-KNT-EVD-FGN-M").onHand).toBe(12);
    expect(exactInventory(data, state, "store-01", otherSku).onHand).toBe(999);
  });

  it("protects donor cover and marks an understocked donor infeasible", () => {
    const data = createSeedData();
    const state = initialState();
    data.inventory.find(
      (record) =>
        record.locationId === "store-02" && record.sku === "HL-KNT-EVD-FGN-M",
    )!.onHand = 50;
    const exception = calculateException(data, state, "store-01", "HL-KNT-EVD-FGN-M");
    const cork = generateOptions(data, state, exception).find(
      (option) => option.sourceLocationId === "store-02",
    )!;

    expect(cork.quantity).toBe(22);
    expect(cork.feasible).toBe(false);
    expect(cork.projectedSourceCoverDays).toBe(7);
  });
});
