import type { InventoryRecord, Product, Route, SaleDay, SeedData } from "../../shared/domain.js";

const STORE_NAMES = [
  "Dublin Grafton Street",
  "Cork Patrick Street",
  "Galway Eyre Square",
  "Limerick Crescent",
  "Waterford City Square",
  "Kilkenny High Street",
  "Sligo O'Connell Street",
  "Athlone Towncentre",
  "Drogheda Scotch Hall",
  "Killarney Outlet",
];

const COLOURS = ["Forest Green", "Navy", "Cream", "Rust", "Charcoal"];
const SIZES = ["XS", "S", "M", "L", "XL"];
const CATEGORIES = ["Knitwear", "Shirts", "Outerwear", "Trousers", "Accessories"];

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function productAt(index: number): Product {
  if (index === 0) {
    return {
      id: "product-everyday-knit",
      sku: "HL-KNT-EVD-FGN-M",
      name: "Everyday Knit",
      category: "Knitwear",
      colour: "Forest Green",
      size: "M",
      unitPriceEur: 64,
    };
  }
  const category = CATEGORIES[index % CATEGORIES.length]!;
  const colour = COLOURS[index % COLOURS.length]!;
  const size = SIZES[Math.floor(index / COLOURS.length) % SIZES.length]!;
  return {
    id: `product-${String(index + 1).padStart(3, "0")}`,
    sku: `HL-${category.slice(0, 3).toUpperCase()}-${String(index + 1).padStart(3, "0")}-${colour
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()}-${size}`,
    name: `${["Coastal", "Heritage", "Everyday", "Harbour", "Lane"][index % 5]} ${category}`,
    category,
    colour,
    size,
    unitPriceEur: 25 + (index % 12) * 5,
  };
}

export function createSeedData(seed = 20261005): SeedData {
  const random = seeded(seed);
  const stores = STORE_NAMES.map((name, index) => ({
    id: `store-${String(index + 1).padStart(2, "0")}`,
    name,
    type: "store" as const,
    city: name.split(" ")[0]!,
  }));
  const warehouse = {
    id: "warehouse-dublin-central",
    name: "Dublin Central Warehouse",
    type: "warehouse" as const,
    city: "Dublin",
  };
  const products = Array.from({ length: 100 }, (_, index) => productAt(index));
  const inventory: InventoryRecord[] = [];
  const sales: SaleDay[] = [];

  for (const product of products) {
    inventory.push({
      locationId: warehouse.id,
      sku: product.sku,
      onHand: product.sku === "HL-KNT-EVD-FGN-M" ? 180 : 80 + Math.floor(random() * 180),
      reserved: 0,
      incoming: [],
    });
    for (const store of stores) {
      const heroDublin = product.sku === "HL-KNT-EVD-FGN-M" && store.id === "store-01";
      const heroCork = product.sku === "HL-KNT-EVD-FGN-M" && store.id === "store-02";
      inventory.push({
        locationId: store.id,
        sku: product.sku,
        onHand: heroDublin ? 12 : heroCork ? 80 : 10 + Math.floor(random() * 85),
        reserved: 0,
        incoming: heroDublin
          ? [{ quantity: 64, arrivalDay: 5, reference: "PO-HL-2026-1005" }]
          : [],
      });
      const base = heroDublin ? 8 : heroCork ? 4 : 1 + Math.floor(random() * 5);
      for (let day = -89; day <= 0; day += 1) {
        sales.push({
          locationId: store.id,
          sku: product.sku,
          day,
          units: base,
        });
      }
    }
  }

  const routes: Route[] = [];
  for (const source of [warehouse, ...stores]) {
    for (const destination of stores) {
      if (source.id !== destination.id) {
        routes.push({
          sourceLocationId: source.id,
          destinationLocationId: destination.id,
          leadDays:
            source.id === "store-02" && destination.id === "store-01"
              ? 1
              : source.type === "warehouse"
                ? 2
                : 2,
          baseCostEur: source.type === "warehouse" ? 10 : 15,
          unitCostEur: source.type === "warehouse" ? 0.3 : 0.5,
        });
      }
    }
  }

  return {
    seed,
    generatedAt: "2026-10-05T00:00:00.000Z",
    locations: [warehouse, ...stores],
    products,
    inventory,
    sales,
    promotions: [
      {
        id: "promo-dublin-autumn-knit",
        locationId: "store-01",
        sku: "HL-KNT-EVD-FGN-M",
        name: "Dublin Autumn Knit Edit",
        startDay: -7,
        endDay: 7,
      },
    ],
    routes,
    settings: {
      demandWindowDays: 28,
      criticalCoverDays: 5,
      donorProtectionDays: 7,
    },
  };
}
