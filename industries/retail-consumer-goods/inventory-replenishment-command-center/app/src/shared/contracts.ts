import { z } from "zod";

export const actionStatusSchema = z.enum([
  "proposed",
  "approved",
  "rejected",
  "dispatched",
  "received",
]);
export type ActionStatus = z.infer<typeof actionStatusSchema>;

export const actorRoleSchema = z.enum(["planner", "manager", "operations"]);
export type ActorRole = z.infer<typeof actorRoleSchema>;

export const actorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: actorRoleSchema,
  kind: z.enum(["public-demo", "entra", "local"]),
  authenticated: z.boolean(),
});
export type Actor = z.infer<typeof actorSchema>;

export const actionOptionSchema = z.object({
  id: z.string(),
  type: z.enum(["wait", "warehouse", "store-transfer"]),
  sourceLocationId: z.string().nullable(),
  destinationLocationId: z.string(),
  sku: z.string(),
  quantity: z.number().int().nonnegative(),
  arrivalDay: z.number().int().nonnegative(),
  costEur: z.number().nonnegative(),
  feasible: z.boolean(),
  constraints: z.array(z.string()),
  projectedDestinationCoverDays: z.number().nonnegative(),
  projectedSourceCoverDays: z.number().nonnegative().nullable(),
});
export type ActionOption = z.infer<typeof actionOptionSchema>;

export const createActionSchema = z.object({
  exceptionId: z.string(),
  optionId: z.string(),
  reason: z.string().min(3).max(500),
}).strict();

export const updateActionStatusSchema = z.object({
  status: z.enum(["approved", "rejected", "dispatched", "received"]),
  reason: z.string().min(3).max(500),
}).strict();

export const resetDemoSchema = z.object({
  reason: z.string().min(3).max(500).optional(),
}).strict();

export const investigationSchema = z.object({
  status: z.enum(["available", "unavailable"]),
  summary: z.string(),
  evidenceIds: z.array(z.string()),
  caveats: z.array(z.string()).max(9),
  agent: z.literal("Inventory Investigation"),
});
export type Investigation = z.infer<typeof investigationSchema>;

export const recommendationSchema = z.object({
  status: z.enum(["available", "unavailable"]),
  summary: z.string(),
  selectedOptionId: z.string().nullable(),
  consideredOptionIds: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  tradeoffs: z.array(z.string()).max(9),
  agent: z.literal("Replenishment Recommendation"),
});
export type Recommendation = z.infer<typeof recommendationSchema>;

export const investigationAgentOutputSchema = z.object({
  summary: z.string().min(1).max(1200),
  evidenceIds: z.array(z.string()).min(1),
  caveats: z.array(z.string()).max(8),
});

export const recommendationAgentOutputSchema = z.object({
  summary: z.string().min(1).max(1200),
  selectedOptionId: z.string(),
  consideredOptionIds: z.array(z.string()).min(1),
  evidenceIds: z.array(z.string()).min(1),
  tradeoffs: z.array(z.string()).max(8),
});

export interface ApiError {
  error: {
    code: string;
    message: string;
    correlationId: string;
    details?: unknown;
  };
}
