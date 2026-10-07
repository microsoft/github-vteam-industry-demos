import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import {
  createActionSchema,
  resetDemoSchema,
  updateActionStatusSchema,
  type ActorRole,
} from "../shared/contracts.js";
import type {
  ApplicationState,
  InventoryException,
  ReplenishmentAction,
  SeedData,
} from "../shared/domain.js";
import { authentication, requireRoles } from "./auth.js";
import { calculateException, listExceptions } from "./calculations.js";
import type { AppConfig } from "./config.js";
import { createSeedData } from "./data/seed.js";
import { FoundryAgentInvoker, type AgentInvoker } from "./foundry.js";
import { generateOptions } from "./options.js";
import { ConcurrencyGuard, SlidingWindowRateLimiter } from "./rate-limit.js";
import {
  StateConflictError,
  createStateStore,
  type StateSnapshot,
  type StateStore,
} from "./state.js";

interface AppDependencies {
  config: AppConfig;
  store?: StateStore;
  data?: SeedData;
  agents?: AgentInvoker;
  rateLimiter?: SlidingWindowRateLimiter;
  aiConcurrency?: ConcurrencyGuard;
}

interface MutationResult {
  statusCode: number;
  body: unknown;
}

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const HERO_EXCEPTION_ID = "exception:store-01:HL-KNT-EVD-FGN-M";
const HERO_OPTION_ID = "store-02:exception:store-01:HL-KNT-EVD-FGN-M";
const BOUNDED_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const PUBLIC_DEMO_AUDIT_REASONS = Object.freeze({
  proposed: "Anonymous public demo proposed the canonical Cork-to-Dublin transfer.",
  approved:
    "Anonymous public demo simulated planner approval; mitigation scheduled and stock reserved.",
  rejected: "Anonymous public demo simulated planner rejection.",
  dispatched: "Anonymous public demo simulated Cork dispatch.",
  received: "Anonymous public demo simulated Dublin receipt.",
});

export const PUBLIC_DEMO_LIMITS = Object.freeze({
  reads: { client: 120, global: 600, windowMs: 60_000 },
  ai: { client: 6, global: 30, windowMs: 600_000 },
  workflow: { client: 30, global: 150, windowMs: 600_000 },
  reset: { client: 3, global: 20, windowMs: 600_000 },
});

function hashRequest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function requireMutationHeaders(request: Request): { key: string; etag: string } {
  const key = request.header("idempotency-key");
  const etag = request.header("if-match");
  if (!key) throw new HttpError(428, "idempotency_key_required", "Idempotency-Key is required.");
  if (!BOUNDED_REQUEST_ID.test(key)) {
    throw new HttpError(
      400,
      "invalid_idempotency_key",
      "Idempotency-Key must be 1-128 safe ASCII characters.",
    );
  }
  if (!etag) throw new HttpError(428, "if_match_required", "If-Match is required.");
  return { key, etag };
}

function parseExceptionId(data: SeedData, state: ApplicationState, id: string): InventoryException {
  const match = /^exception:([^:]+):(.+)$/.exec(id);
  if (!match) throw new HttpError(404, "exception_not_found", "Exception was not found.");
  const exception = calculateException(data, state, match[1]!, match[2]!);
  if (
    exception.coverDays >= data.settings.criticalCoverDays &&
    (exception.nextInboundDay === null || exception.coverDays >= exception.nextInboundDay)
  ) {
    throw new HttpError(404, "exception_not_found", "Exception is no longer active.");
  }
  exception.options = generateOptions(data, state, exception);
  return exception;
}

function allowedTransition(
  current: ReplenishmentAction["status"],
  next: ReplenishmentAction["status"],
): boolean {
  return (
    (current === "proposed" && ["approved", "rejected"].includes(next)) ||
    (current === "approved" && next === "dispatched") ||
    (current === "dispatched" && next === "received")
  );
}

function roleCanTransition(role: ActorRole, status: ReplenishmentAction["status"]): boolean {
  return role === "planner" && ["approved", "rejected", "dispatched", "received"].includes(status);
}

export function createApp(dependencies: AppDependencies) {
  const { config } = dependencies;
  const store = dependencies.store ?? createStateStore(config);
  const data = dependencies.data ?? createSeedData();
  const agents = dependencies.agents ?? new FoundryAgentInvoker(config);
  const rateLimiter = dependencies.rateLimiter ?? new SlidingWindowRateLimiter();
  const aiConcurrency = dependencies.aiConcurrency ?? new ConcurrencyGuard(2);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.authMode === "public-demo" ? 1 : false);
  app.use(express.json({ limit: "256kb" }));
  app.use((request, response, next) => {
    const requestedCorrelationId = request.header("x-correlation-id");
    if (requestedCorrelationId && !BOUNDED_REQUEST_ID.test(requestedCorrelationId)) {
      response.status(400).json({
        error: {
          code: "invalid_correlation_id",
          message: "X-Correlation-ID must be 1-128 safe ASCII characters.",
        },
      });
      return;
    }
    const correlationId = requestedCorrelationId ?? randomUUID();
    response.setHeader("x-correlation-id", correlationId);
    next();
  });

  app.get("/health/live", (_request, response) => {
    response.json({ status: "live" });
  });
  app.get("/health/ready", async (_request, response, next) => {
    try {
      await store.read();
      response.json({ status: "ready" });
    } catch (error) {
      next(new HttpError(503, "state_unavailable", "State backend is unavailable.", error));
    }
  });

  const api = express.Router();
  api.use(authentication(config));
  if (config.authMode === "public-demo") {
    api.use((request, response, next) => {
      response.setHeader("cache-control", "no-store");
      if (!["POST", "PATCH"].includes(request.method)) {
        next();
        return;
      }
      const contentType = request.header("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      const fetchSite = request.header("sec-fetch-site");
      if (
        request.header("origin") !== config.publicDemoOrigin ||
        (fetchSite !== undefined && fetchSite !== "same-origin") ||
        contentType !== "application/json"
      ) {
        response.status(403).json({
          error: {
            code: "origin_not_allowed",
            message: "Public demo mutations require an exact same-origin JSON request.",
            correlationId: response.getHeader("x-correlation-id"),
          },
        });
        return;
      }
      next();
    });
  }

  function clientScope(request: Request): string {
    const value = request.ip?.trim();
    return value ? `client:${value}` : "client:unavailable";
  }

  function applyRateLimit(
    request: Request,
    response: Response,
    category: "reads" | "ai" | "workflow" | "reset",
  ): boolean {
    if (config.authMode !== "public-demo") return true;
    const definition = PUBLIC_DEMO_LIMITS[category];
    const decision = rateLimiter.attempt([
      {
        bucket: category,
        scope: clientScope(request),
        limit: definition.client,
        windowMs: definition.windowMs,
      },
      {
        bucket: category,
        scope: "global",
        limit: definition.global,
        windowMs: definition.windowMs,
      },
    ]);
    response.setHeader("ratelimit-limit", decision.limit);
    response.setHeader("ratelimit-remaining", decision.remaining);
    response.setHeader("ratelimit-reset", decision.resetSeconds);
    if (decision.allowed) return true;
    response.setHeader("retry-after", decision.retryAfterSeconds!);
    response.status(429).json({
      error: {
        code: "public_demo_rate_limited",
        message: "Public demo rate limit exceeded.",
        correlationId: response.getHeader("x-correlation-id"),
      },
    });
    return false;
  }

  const rateLimit =
    (category: "reads" | "ai" | "workflow" | "reset") =>
    (request: Request, response: Response, next: NextFunction): void => {
      if (applyRateLimit(request, response, category)) next();
    };

  api.use((request, response, next) => {
    if (request.method === "GET" && !applyRateLimit(request, response, "reads")) return;
    next();
  });

  async function snapshot(response?: Response): Promise<StateSnapshot> {
    const current = await store.read();
    response?.setHeader("etag", current.etag);
    return current;
  }

  async function mutate(
    request: Request,
    response: Response,
    operation: (state: ApplicationState) => MutationResult,
  ): Promise<void> {
    const headers = requireMutationHeaders(request);
    const current = await store.read();
    const scopedKey = `${request.actor.id}:${request.method}:${request.path}:${headers.key}`;
    const requestHash = hashRequest(request.body);
    const previous = current.state.idempotency[scopedKey];
    if (previous) {
      if (previous.requestHash !== requestHash) {
        throw new HttpError(
          422,
          "idempotency_key_reused",
          "Idempotency-Key was already used for a different request.",
        );
      }
      response.setHeader("etag", current.etag);
      response.setHeader("idempotency-replayed", "true");
      response.status(previous.statusCode).json(previous.body);
      return;
    }
    if (headers.etag !== current.etag) {
      throw new HttpError(409, "etag_mismatch", "State changed; refresh and retry.");
    }
    const nextState = structuredClone(current.state);
    const result = operation(nextState);
    nextState.idempotency[scopedKey] = {
      requestHash,
      statusCode: result.statusCode,
      body: result.body,
      etag: "",
    };
    try {
      const written = await store.write(nextState, current.etag);
      response.setHeader("etag", written.etag);
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      if (error instanceof StateConflictError) {
        throw new HttpError(409, "etag_mismatch", "State changed; refresh and retry.");
      }
      throw error;
    }
  }

  api.get("/bootstrap", async (request, response) => {
    const current = await snapshot(response);
    response.json({
      company: "Harbour & Lane",
      actor: request.actor,
      locations: data.locations,
      settings: data.settings,
      hero: {
        exceptionId: HERO_EXCEPTION_ID,
        sku: "HL-KNT-EVD-FGN-M",
      },
      state: { resetCount: current.state.resetCount },
    });
  });

  api.get("/overview", async (request, response) => {
    const current = await snapshot(response);
    let exceptions = listExceptions(data, current.state).map((exception) => ({
      ...exception,
      options: generateOptions(data, current.state, exception),
    }));
    const storeId = request.query.storeId?.toString();
    const category = request.query.category?.toString();
    const minExposure = Number(request.query.minExposureEur ?? 0);
    if (storeId) exceptions = exceptions.filter((item) => item.locationId === storeId);
    if (category) {
      const skus = new Set(
        data.products.filter((product) => product.category === category).map((product) => product.sku),
      );
      exceptions = exceptions.filter((item) => skus.has(item.sku));
    }
    exceptions = exceptions.filter(
      (item) => item.projectedRevenueExposureEur >= minExposure,
    );
    response.json({
      metrics: {
        stockoutRiskCount: exceptions.length,
        projectedRevenueExposureEur: exceptions.reduce(
          (sum, item) => sum + item.projectedRevenueExposureEur,
          0,
        ),
        activeActions: current.state.actions.filter(
          (action) => !["received", "rejected"].includes(action.status),
        ).length,
      },
      exceptions,
    });
  });

  api.get("/exceptions/:id", async (request, response) => {
    const current = await snapshot(response);
    response.json(parseExceptionId(data, current.state, request.params.id));
  });

  api.post(
    "/exceptions/:id/investigation",
    rateLimit("ai"),
    async (request, response) => {
      const exceptionId = String(request.params.id);
      if (config.authMode === "public-demo" && exceptionId !== HERO_EXCEPTION_ID) {
        throw new HttpError(
          403,
          "public_demo_operation_not_allowed",
          "Public demo AI is limited to the canonical hero exception.",
        );
      }
      if (
        config.authMode === "public-demo" &&
        request.body !== undefined &&
        (typeof request.body !== "object" ||
          request.body === null ||
          Object.keys(request.body as object).length > 0)
      ) {
        throw new HttpError(
          400,
          "validation_failed",
          "Public demo AI routes do not accept caller-supplied options.",
        );
      }
      const release =
        config.authMode === "public-demo" ? aiConcurrency.tryAcquire() : () => undefined;
      if (!release) {
        response.setHeader("ratelimit-limit", aiConcurrency.limit);
        response.setHeader("ratelimit-remaining", 0);
        response.setHeader("ratelimit-reset", 1);
        response.setHeader("retry-after", 1);
        response.status(429).json({
          error: {
            code: "public_demo_rate_limited",
            message: "Public demo rate limit exceeded.",
            correlationId: response.getHeader("x-correlation-id"),
          },
        });
        return;
      }
      try {
        const current = await snapshot(response);
        const exception = parseExceptionId(data, current.state, exceptionId);
        response.json(await agents.investigate(exception.evidence));
      } finally {
        release();
      }
    },
  );

  api.post(
    "/exceptions/:id/recommendation",
    rateLimit("ai"),
    async (request, response) => {
      const exceptionId = String(request.params.id);
      if (config.authMode === "public-demo" && exceptionId !== HERO_EXCEPTION_ID) {
        throw new HttpError(
          403,
          "public_demo_operation_not_allowed",
          "Public demo AI is limited to the canonical hero exception.",
        );
      }
      if (
        config.authMode === "public-demo" &&
        request.body !== undefined &&
        (typeof request.body !== "object" ||
          request.body === null ||
          Object.keys(request.body as object).length > 0)
      ) {
        throw new HttpError(
          400,
          "validation_failed",
          "Public demo AI routes do not accept caller-supplied options.",
        );
      }
      const release =
        config.authMode === "public-demo" ? aiConcurrency.tryAcquire() : () => undefined;
      if (!release) {
        response.setHeader("ratelimit-limit", aiConcurrency.limit);
        response.setHeader("ratelimit-remaining", 0);
        response.setHeader("ratelimit-reset", 1);
        response.setHeader("retry-after", 1);
        response.status(429).json({
          error: {
            code: "public_demo_rate_limited",
            message: "Public demo rate limit exceeded.",
            correlationId: response.getHeader("x-correlation-id"),
          },
        });
        return;
      }
      try {
        const current = await snapshot(response);
        const exception = parseExceptionId(data, current.state, exceptionId);
        response.json(await agents.recommend(exception.evidence, exception.options));
      } finally {
        release();
      }
    },
  );

  api.get("/actions", async (_request, response) => {
    const current = await snapshot(response);
    response.json({ actions: current.state.actions, audit: current.state.audit });
  });

  api.get("/actions/:id", async (request, response) => {
    const current = await snapshot(response);
    const action = current.state.actions.find((candidate) => candidate.id === request.params.id);
    if (!action) throw new HttpError(404, "action_not_found", "Action was not found.");
    response.json({
      action,
      audit: current.state.audit.filter((entry) => entry.actionId === action.id),
    });
  });

  api.post("/actions", rateLimit("workflow"), requireRoles("planner"), async (request, response) => {
    requireMutationHeaders(request);
    const input = createActionSchema.parse(request.body);
    if (
      config.authMode === "public-demo" &&
      (input.exceptionId !== HERO_EXCEPTION_ID || input.optionId !== HERO_OPTION_ID)
    ) {
      throw new HttpError(
        403,
        "public_demo_operation_not_allowed",
        "Public demo proposals are limited to the canonical hero transfer.",
      );
    }
    await mutate(request, response, (state) => {
      if (config.authMode === "public-demo" && state.actions.length > 0) {
        throw new HttpError(
          409,
          "reset_required",
          "Reset the public demo before creating another proposal.",
        );
      }
      const exception = parseExceptionId(data, state, input.exceptionId);
      const option = exception.options.find((candidate) => candidate.id === input.optionId);
      if (!option) throw new HttpError(400, "option_not_found", "Option was not found.");
      if (!option.feasible) throw new HttpError(409, "option_infeasible", "Option is not feasible.");
      if (
        state.actions.some(
          (action) =>
            action.exceptionId === exception.id &&
            !["rejected", "received"].includes(action.status),
        )
      ) {
        throw new HttpError(409, "active_action_exists", "An active action already exists.");
      }
      const now = new Date().toISOString();
      const action: ReplenishmentAction = {
        id: randomUUID(),
        exceptionId: exception.id,
        option,
        status: "proposed",
        simulated: true,
        createdBy: request.actor,
        createdAt: now,
        updatedAt: now,
      };
      state.actions.push(action);
      state.audit.push({
        id: randomUUID(),
        actionId: action.id,
        event: "proposed",
        actor: request.actor,
        at: now,
        reason:
          config.authMode === "public-demo"
            ? PUBLIC_DEMO_AUDIT_REASONS.proposed
            : input.reason,
      });
      return { statusCode: 201, body: { action } };
    });
  });

  api.patch("/actions/:id/status", rateLimit("workflow"), async (request, response) => {
    requireMutationHeaders(request);
    const input = updateActionStatusSchema.parse(request.body);
    await mutate(request, response, (state) => {
      const action = state.actions.find((candidate) => candidate.id === request.params.id);
      if (!action) throw new HttpError(404, "action_not_found", "Action was not found.");
      if (
        config.authMode === "public-demo" &&
        (action.exceptionId !== HERO_EXCEPTION_ID || action.option.id !== HERO_OPTION_ID)
      ) {
        throw new HttpError(
          403,
          "public_demo_operation_not_allowed",
          "Public demo transitions are limited to the canonical hero transfer.",
        );
      }
      if (!allowedTransition(action.status, input.status)) {
        throw new HttpError(
          409,
          "invalid_transition",
          `Cannot transition from ${action.status} to ${input.status}.`,
        );
      }
      if (!roleCanTransition(request.actor.role, input.status)) {
        throw new HttpError(403, "forbidden", "Actor role cannot perform this transition.");
      }
      if (input.status === "approved") {
        const exception = parseExceptionId(data, state, action.exceptionId);
        const currentOption = exception.options.find((option) => option.id === action.option.id);
        if (
          !currentOption?.feasible ||
          currentOption.quantity !== action.option.quantity ||
          currentOption.sourceLocationId !== action.option.sourceLocationId
        ) {
          throw new HttpError(
            409,
            "option_no_longer_feasible",
            "Option must be recalculated before approval.",
          );
        }
      }
      const now = new Date().toISOString();
      action.status = input.status;
      action.updatedAt = now;
      state.audit.push({
        id: randomUUID(),
        actionId: action.id,
        event: input.status,
        actor: request.actor,
        at: now,
        reason:
          config.authMode === "public-demo"
            ? PUBLIC_DEMO_AUDIT_REASONS[input.status]
            : input.reason,
      });
      return {
        statusCode: 200,
        body: {
          action,
          message:
            input.status === "approved"
              ? "Transfer approved — mitigation scheduled. Stock is reserved only."
              : `Simulated action ${input.status}.`,
        },
      };
    });
  });

  api.post("/demo/reset", rateLimit("reset"), requireRoles("planner"), async (request, response) => {
    requireMutationHeaders(request);
    resetDemoSchema.parse(request.body);
    await mutate(request, response, (state) => {
      const resetCount = state.resetCount + 1;
      state.actions = [];
      state.audit = [];
      state.idempotency = {};
      state.resetCount = resetCount;
      return {
        statusCode: 200,
        body: { reset: true, resetCount, message: "Deterministic demo state restored." },
      };
    });
  });

  api.get("/system/status", async (_request, response) => {
    const current = await snapshot(response);
    response.json({
      status: "ok",
      environment: config.environment,
      stateBackend: config.stateMode,
      foundry: agents.configured() ? "configured" : "unavailable",
      agents: [
        { id: "inventory-investigation", displayName: "Inventory Investigation" },
        { id: "replenishment-recommendation", displayName: "Replenishment Recommendation" },
      ],
      simulatedOperations: true,
      actionCount: current.state.actions.length,
    });
  });

  if (config.authMode === "public-demo") {
    api.use((request, _response, next) => {
      if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
        next(
          new HttpError(
            403,
            "public_demo_operation_not_allowed",
            "This mutation is not available in the public demo.",
          ),
        );
        return;
      }
      next();
    });
  }

  app.use("/api/v1", api);

  const webRoot = resolve(process.cwd(), "dist/web");
  if (existsSync(webRoot)) {
    app.use(express.static(webRoot, { index: false }));
    app.get("*path", (_request, response) => response.sendFile(resolve(webRoot, "index.html")));
  }

  app.use((_request, response) => {
    response.status(404).json({ error: { code: "not_found", message: "Route not found." } });
  });
  app.use(
    (error: unknown, request: Request, response: Response, _next: NextFunction): void => {
      const correlationId = response.getHeader("x-correlation-id")?.toString() ?? randomUUID();
      if (error instanceof ZodError) {
        response.status(400).json({
          error: {
            code: "validation_failed",
            message: "Request validation failed.",
            correlationId,
            details: error.issues,
          },
        });
        return;
      }
      if (error instanceof HttpError) {
        response.status(error.statusCode).json({
          error: { code: error.code, message: error.message, correlationId, details: error.details },
        });
        return;
      }
      console.error({ correlationId, path: request.path, error });
      response.status(500).json({
        error: { code: "internal_error", message: "Unexpected server error.", correlationId },
      });
    },
  );

  return app;
}
