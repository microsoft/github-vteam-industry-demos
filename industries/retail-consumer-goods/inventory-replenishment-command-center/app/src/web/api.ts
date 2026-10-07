import type {
  ApiError,
  Investigation,
  Recommendation,
  Actor,
} from "../shared/contracts.js";
import type {
  AuditEntry,
  InventoryException,
  Location,
  ReplenishmentAction,
} from "../shared/domain.js";

export interface BootstrapResponse {
  company: string;
  actor: Actor;
  locations: Location[];
  settings: {
    demandWindowDays: number;
    criticalCoverDays: number;
    donorProtectionDays: number;
  };
  hero: { exceptionId: string; sku: string };
  state: { resetCount: number };
}

export interface OverviewResponse {
  metrics: {
    stockoutRiskCount: number;
    projectedRevenueExposureEur: number;
    activeActions: number;
  };
  exceptions: InventoryException[];
}

export interface ActionsResponse {
  actions: ReplenishmentAction[];
  audit: AuditEntry[];
}

export interface SystemStatusResponse {
  status: string;
  environment: string;
  stateBackend: string;
  foundry: "configured" | "unavailable";
  agents: Array<{ id: string; displayName: string }>;
  simulatedOperations: boolean;
  actionCount: number;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly correlationId?: string,
    readonly retryAfterSeconds?: number,
    readonly rateLimitResetSeconds?: number,
    readonly rateLimitRemaining?: number,
  ) {
    super(message);
  }
}

let currentEtag = "";
const REQUEST_TIMEOUT_MS = 12_000;

function numericHeader(response: Response, name: string): number | undefined {
  const value = response.headers.get(name);
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function retryDelaySeconds(error: unknown): number | undefined {
  if (!(error instanceof ApiRequestError) || error.status !== 429) return undefined;
  return Math.max(
    1,
    Math.ceil(error.retryAfterSeconds ?? error.rateLimitResetSeconds ?? 1),
  );
}

function rememberEtag(response: Response) {
  const etag = response.headers.get("etag");
  if (etag) currentEtag = etag;
}

async function parse<T>(response: Response): Promise<T> {
  rememberEtag(response);
  if (response.ok) return (await response.json()) as T;
  let payload: ApiError | undefined;
  try {
    payload = (await response.json()) as ApiError;
  } catch {
    // The API normally returns structured errors; retain a safe fallback for proxy failures.
  }
  throw new ApiRequestError(
    response.status,
    payload?.error.code ?? "request_failed",
    payload?.error.message ?? `Request failed (${response.status}).`,
    payload?.error.correlationId,
    numericHeader(response, "retry-after"),
    numericHeader(response, "ratelimit-reset"),
    numericHeader(response, "ratelimit-remaining"),
  );
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`/api/v1${path}`, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiRequestError(
        0,
        "request_timeout",
        "The service did not respond within 12 seconds. Check connectivity and try again.",
      );
    }
    throw new ApiRequestError(
      0,
      "network_error",
      "The service could not be reached. Check connectivity and try again.",
    );
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function read<T>(path: string): Promise<T> {
  return parse<T>(await request(path, { headers: { Accept: "application/json" } }));
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  return parse<T>(
    await request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

async function mutate<T>(path: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  return parse<T>(
    await request(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        "If-Match": currentEtag,
      },
      body: JSON.stringify(body),
    }),
  );
}

export function isConcurrencyError(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.status === 409 ||
      error.status === 412 ||
      [
        "etag_mismatch",
        "active_action_exists",
        "option_no_longer_feasible",
        "reset_required",
      ].includes(error.code))
  );
}

export function isResetRequiredError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "reset_required";
}

const CANONICAL_REASON_REQUEST = "Use the canonical public-demo audit reason.";

export const api = {
  bootstrap: () => read<BootstrapResponse>("/bootstrap"),
  overview: (params: URLSearchParams) =>
    read<OverviewResponse>(`/overview${params.size ? `?${params.toString()}` : ""}`),
  exception: (id: string) => read<InventoryException>(`/exceptions/${encodeURIComponent(id)}`),
  investigate: (id: string) =>
    post<Investigation>(`/exceptions/${encodeURIComponent(id)}/investigation`),
  recommend: (id: string) =>
    post<Recommendation>(`/exceptions/${encodeURIComponent(id)}/recommendation`),
  actions: () => read<ActionsResponse>("/actions"),
  systemStatus: () => read<SystemStatusResponse>("/system/status"),
  createAction: (exceptionId: string, optionId: string) =>
    mutate<{ action: ReplenishmentAction }>("/actions", "POST", {
      exceptionId,
      optionId,
      reason: CANONICAL_REASON_REQUEST,
    }),
  transitionAction: (id: string, status: string) =>
    mutate<{ action: ReplenishmentAction; message: string }>(
      `/actions/${encodeURIComponent(id)}/status`,
      "PATCH",
      { status, reason: CANONICAL_REASON_REQUEST },
    ),
  reset: () =>
    mutate<{ reset: true; resetCount: number; message: string }>("/demo/reset", "POST", {
      reason: "Restore deterministic two-minute demo scenario.",
    }),
};

export function resetApiEtagForTests() {
  currentEtag = "";
}
