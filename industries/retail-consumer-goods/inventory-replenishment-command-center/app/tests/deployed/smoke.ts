import {
  PROMOTION_NON_CAUSATION_CAVEAT,
  hasUnsupportedPromotionCausation,
} from "../../src/server/foundry.js";

const baseUrl = process.env.DEPLOYED_BASE_URL?.replace(/\/$/, "");
if (!baseUrl) throw new Error("DEPLOYED_BASE_URL is required.");
const heroExceptionId = "exception:store-01:HL-KNT-EVD-FGN-M";
const heroOptionId = "store-02:exception:store-01:HL-KNT-EVD-FGN-M";

async function checkOk(path: string) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new Error(`${path} returned ${response.status}.`);
  if (response.headers.get("cache-control") !== "no-store" && path.startsWith("/api/")) {
    throw new Error(`${path} did not return Cache-Control: no-store.`);
  }
  return response;
}

async function jsonOk(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${text}`);
  return { response, body: JSON.parse(text) };
}

function mutationHeaders(etag?: string, idempotencyKey?: string) {
  return {
    origin: baseUrl!,
    "sec-fetch-site": "same-origin",
    "content-type": "application/json",
    ...(etag ? { "if-match": etag } : {}),
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
  };
}

function validateAgent(
  body: Record<string, unknown>,
  supportingField: "caveats" | "tradeoffs",
  evidenceIds: Set<string>,
) {
  const supportingText = body[supportingField];
  const citedEvidence = body.evidenceIds;
  if (
    body.status !== "available" ||
    typeof body.summary !== "string" ||
    !Array.isArray(supportingText) ||
    supportingText.length > 9 ||
    supportingText.some((item) => typeof item !== "string") ||
    !Array.isArray(citedEvidence) ||
    citedEvidence.some((id) => typeof id !== "string" || !evidenceIds.has(id))
  ) {
    throw new Error(`${String(body.agent)} was unavailable or schema/grounding-invalid.`);
  }
  const generatedText = [body.summary, ...supportingText] as string[];
  const canonicalCount =
    JSON.stringify(generatedText).split(PROMOTION_NON_CAUSATION_CAVEAT).length - 1;
  if (
    canonicalCount !== 1 ||
    !supportingText.includes(PROMOTION_NON_CAUSATION_CAVEAT) ||
    generatedText.some(hasUnsupportedPromotionCausation)
  ) {
    throw new Error(`${String(body.agent)} failed promotion-causation validation.`);
  }
}

await checkOk("/health/live");
await checkOk("/health/ready");
const bootstrapResponse = await checkOk("/api/v1/bootstrap");
const bootstrap = await bootstrapResponse.json();
if (
  bootstrap.actor?.id !== "anonymous-public-demo" ||
  bootstrap.actor?.authenticated !== false ||
  bootstrap.actor?.kind !== "public-demo"
) {
  throw new Error("Synthetic anonymous actor contract failed.");
}

const denied = await fetch(
  `${baseUrl}/api/v1/exceptions/exception%3Astore-01%3AHL-KNT-EVD-FGN-M/investigation`,
  {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://invalid.example" },
  },
);
if (denied.status !== 403 || (await denied.json()).error?.code !== "origin_not_allowed") {
  throw new Error("Cross-origin mutation protection failed.");
}

const heroPath = `/api/v1/exceptions/${encodeURIComponent(heroExceptionId)}`;
const hero = await jsonOk(heroPath);
const evidenceIds = new Set<string>(
  hero.body.evidence.map((item: { id: string }) => item.id),
);
const investigation = await jsonOk(`${heroPath}/investigation`, {
  method: "POST",
  headers: mutationHeaders(),
  body: "{}",
});
const recommendation = await jsonOk(`${heroPath}/recommendation`, {
  method: "POST",
  headers: mutationHeaders(),
  body: "{}",
});
validateAgent(investigation.body, "caveats", evidenceIds);
validateAgent(recommendation.body, "tradeoffs", evidenceIds);
if (
  recommendation.body.selectedOptionId !== heroOptionId ||
  recommendation.body.consideredOptionIds.some(
    (id: string) => !hero.body.options.some((option: { id: string }) => option.id === id),
  )
) {
  throw new Error("Recommendation exceeded the supplied option boundary.");
}

const key = Date.now();
let actions = await jsonOk("/api/v1/actions");
if (actions.body.actions.length > 0) {
  await jsonOk("/api/v1/demo/reset", {
    method: "POST",
    headers: mutationHeaders(actions.response.headers.get("etag") ?? undefined, `smoke-reset-${key}`),
    body: JSON.stringify({ reason: "Restore deployed smoke state." }),
  });
}

const freshBootstrap = await jsonOk("/api/v1/bootstrap");
const created = await jsonOk("/api/v1/actions", {
  method: "POST",
  headers: mutationHeaders(
    freshBootstrap.response.headers.get("etag") ?? undefined,
    `smoke-create-${key}`,
  ),
  body: JSON.stringify({
    exceptionId: heroExceptionId,
    optionId: heroOptionId,
    reason: "Validate deployed anonymous workflow.",
  }),
});
let current = created;
for (const status of ["approved", "dispatched", "received"]) {
  current = await jsonOk(`/api/v1/actions/${created.body.action.id}/status`, {
    method: "PATCH",
    headers: mutationHeaders(
      current.response.headers.get("etag") ?? undefined,
      `smoke-${status}-${key}`,
    ),
    body: JSON.stringify({ status, reason: `Validate deployed ${status} state.` }),
  });
}
actions = await jsonOk("/api/v1/actions");
if (
  current.body.action.status !== "received" ||
  actions.body.audit.length !== 4
) {
  throw new Error("Anonymous public-demo workflow validation failed.");
}
const reset = await jsonOk("/api/v1/demo/reset", {
  method: "POST",
  headers: mutationHeaders(actions.response.headers.get("etag") ?? undefined, `smoke-final-${key}`),
  body: JSON.stringify({ reason: "Reset deployed smoke state." }),
});
if (!reset.body.reset) throw new Error("Anonymous public-demo reset failed.");

console.log(
  JSON.stringify({
    anonymous: true,
    investigation: investigation.body.status,
    recommendation: recommendation.body.status,
    recommendationOption: recommendation.body.selectedOptionId,
    workflowAuditEvents: 4,
    reset: true,
  }),
);
