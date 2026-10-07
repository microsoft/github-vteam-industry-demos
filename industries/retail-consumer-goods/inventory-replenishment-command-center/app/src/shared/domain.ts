import type { ActionOption, ActionStatus, Actor } from "./contracts.js";

export interface Location {
  id: string;
  name: string;
  type: "store" | "warehouse";
  city: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  colour: string;
  size: string;
  unitPriceEur: number;
}

export interface InventoryRecord {
  locationId: string;
  sku: string;
  onHand: number;
  reserved: number;
  incoming: Array<{ quantity: number; arrivalDay: number; reference: string }>;
}

export interface SaleDay {
  locationId: string;
  sku: string;
  day: number;
  units: number;
}

export interface Promotion {
  id: string;
  locationId: string;
  sku: string;
  name: string;
  startDay: number;
  endDay: number;
}

export interface Route {
  sourceLocationId: string;
  destinationLocationId: string;
  leadDays: number;
  baseCostEur: number;
  unitCostEur: number;
}

export interface SeedData {
  seed: number;
  generatedAt: string;
  locations: Location[];
  products: Product[];
  inventory: InventoryRecord[];
  sales: SaleDay[];
  promotions: Promotion[];
  routes: Route[];
  settings: {
    demandWindowDays: number;
    criticalCoverDays: number;
    donorProtectionDays: number;
  };
}

export interface EvidenceItem {
  id: string;
  kind: "inventory" | "sales" | "delivery" | "promotion" | "network";
  label: string;
  value: string | number;
}

export interface InventoryException {
  id: string;
  locationId: string;
  sku: string;
  productName: string;
  available: number;
  dailyDemand: number;
  coverDays: number;
  nextInboundDay: number | null;
  projectedShortageUnits: number;
  projectedRevenueExposureEur: number;
  priorityScore: number;
  evidence: EvidenceItem[];
  options: ActionOption[];
}

export interface AuditEntry {
  id: string;
  actionId: string;
  event: string;
  actor: Actor;
  at: string;
  reason: string;
}

export interface ReplenishmentAction {
  id: string;
  exceptionId: string;
  option: ActionOption;
  status: ActionStatus;
  simulated: true;
  createdBy: Actor;
  createdAt: string;
  updatedAt: string;
}

export interface IdempotencyRecord {
  requestHash: string;
  statusCode: number;
  body: unknown;
  etag: string;
}

export interface ApplicationState {
  schemaVersion: 1;
  resetCount: number;
  actions: ReplenishmentAction[];
  audit: AuditEntry[];
  idempotency: Record<string, IdempotencyRecord>;
}
