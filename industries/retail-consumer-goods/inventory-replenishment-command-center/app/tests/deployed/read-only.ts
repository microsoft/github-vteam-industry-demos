import {
  PROMOTION_NON_CAUSATION_CAVEAT,
  hasUnsupportedPromotionCausation,
} from "../../src/server/foundry.js";

const configuredBaseUrl = process.env.DEPLOYED_BASE_URL?.replace(/\/$/, "");
if (!configuredBaseUrl) throw new Error("DEPLOYED_BASE_URL is required.");
const baseUrl: string = configuredBaseUrl;

const heroExceptionId = "exception:store-01:HL-KNT-EVD-FGN-M";
const heroOptionId = "store-02:exception:store-01:HL-KNT-EVD-FGN-M";

async function read(path: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${text}`);
  return { response, body: JSON.parse(text) as Record<string, any> };
}

async function nonMutatingPost(path: string, origin = baseUrl) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site": origin === baseUrl ? "same-origin" : "cross-site",
      "content-type": "application/json",
    },
    body: "{}",
  });
  const text = await response.text();
  return {
    response,
    body: text ? (JSON.parse(text) as Record<string, any>) : {},
  };
}

function validateAgent(
  body: Record<string, any>,
  supportingField: "caveats" | "tradeoffs",
  evidenceIds: Set<string>,
) {
  const supporting = body[supportingField];
  const text = [body.summary, ...(Array.isArray(supporting) ? supporting : [])];
  const canonicalCount =
    JSON.stringify(text).split(PROMOTION_NON_CAUSATION_CAVEAT).length - 1;
  if (
    body.status !== "available" ||
    !Array.isArray(body.evidenceIds) ||
    body.evidenceIds.some((id: string) => !evidenceIds.has(id)) ||
    !Array.isArray(supporting) ||
    supporting.length > 9 ||
    canonicalCount !== 1 ||
    !supporting.includes(PROMOTION_NON_CAUSATION_CAVEAT) ||
    text.some((item) => typeof item !== "string" || hasUnsupportedPromotionCausation(item))
  ) {
    throw new Error(`${String(body.agent)} failed schema, grounding, or caveat validation.`);
  }
}

await read("/health/live");
await read("/health/ready");

const spoofedBootstrap = await read("/api/v1/bootstrap", {
  cookie: "actor=spoofed",
  "x-demo-role": "operations",
  "x-demo-actor-id": "spoofed",
  "x-ms-client-principal": "spoofed",
  "x-forwarded-for": "198.51.100.10, 203.0.113.8",
});
if (
  spoofedBootstrap.body.actor?.id !== "anonymous-public-demo" ||
  spoofedBootstrap.body.actor?.role !== "planner" ||
  spoofedBootstrap.body.actor?.kind !== "public-demo" ||
  spoofedBootstrap.body.actor?.authenticated !== false
) {
  throw new Error("Public-demo identity spoofing protection failed.");
}

const heroPath = `/api/v1/exceptions/${encodeURIComponent(heroExceptionId)}`;
const hero = await read(heroPath);
const cork = hero.body.options?.find((option: Record<string, any>) => option.id === heroOptionId);
if (
  hero.body.available !== 12 ||
  hero.body.dailyDemand !== 8 ||
  hero.body.coverDays !== 1.5 ||
  hero.body.nextInboundDay !== 5 ||
  hero.body.projectedShortageUnits !== 28 ||
  cork?.quantity !== 32 ||
  cork?.arrivalDay !== 1 ||
  cork?.projectedSourceCoverDays !== 12 ||
  cork?.constraints?.[0] !== "Donor protection floor: 28 units"
) {
  throw new Error("Canonical Dublin calculation or donor protection changed.");
}

const actionsBefore = await read("/api/v1/actions");
const stateBefore = JSON.stringify(actionsBefore.body);
const denied = await nonMutatingPost(`${heroPath}/investigation`, "https://invalid.example");
if (
  denied.response.status !== 403 ||
  denied.body.error?.code !== "origin_not_allowed" ||
  denied.response.headers.has("access-control-allow-origin")
) {
  throw new Error("Cross-origin protection failed.");
}

const evidenceIds = new Set<string>(
  hero.body.evidence.map((item: { id: string }) => item.id),
);
const investigation = await nonMutatingPost(`${heroPath}/investigation`);
const recommendation = await nonMutatingPost(`${heroPath}/recommendation`);
if (!investigation.response.ok || !recommendation.response.ok) {
  throw new Error(
    `Grounded AI checks failed: ${investigation.response.status}/${recommendation.response.status}.`,
  );
}
validateAgent(investigation.body, "caveats", evidenceIds);
validateAgent(recommendation.body, "tradeoffs", evidenceIds);
if (
  recommendation.body.selectedOptionId !== heroOptionId ||
  recommendation.body.consideredOptionIds?.some(
    (id: string) => !hero.body.options.some((option: { id: string }) => option.id === id),
  )
) {
  throw new Error("Recommendation exceeded deterministic option boundaries.");
}

const actionsAfter = await read("/api/v1/actions");
if (JSON.stringify(actionsAfter.body) !== stateBefore) {
  throw new Error("Read-only validation changed persisted workflow or audit state.");
}
const system = await read("/api/v1/system/status");
if (
  system.body.stateBackend !== "blob" ||
  system.body.foundry !== "configured" ||
  system.body.simulatedOperations !== true
) {
  throw new Error("Deployed runtime status does not match the required recording-safe state.");
}

console.log(
  JSON.stringify({
    health: "ready",
    syntheticActor: true,
    hero: {
      available: hero.body.available,
      dailyDemand: hero.body.dailyDemand,
      coverDays: hero.body.coverDays,
      shortage: hero.body.projectedShortageUnits,
      corkQuantity: cork.quantity,
      corkDonorCoverDays: cork.projectedSourceCoverDays,
    },
    originProtection: true,
    investigation: investigation.body.status,
    recommendation: recommendation.body.status,
    recommendationOption: recommendation.body.selectedOptionId,
    persistedStateUnchanged: true,
    actionCount: actionsAfter.body.actions.length,
    auditCount: actionsAfter.body.audit.length,
  }),
);
