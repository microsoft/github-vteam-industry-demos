const base = "http://127.0.0.1:8080";
const mode = process.argv[2] ?? "verify";
const publicOrigin = process.env.PUBLIC_DEMO_ORIGIN;
if (!publicOrigin) throw new Error("PUBLIC_DEMO_ORIGIN is required.");
const { hasUnsupportedPromotionCausation } = await import("../dist/server/foundry.js");
const promotionCaveat = "Promotion is supporting evidence, not proof of causation.";

function validatePromotionGuard(body, supportingField, allowedEvidenceIds) {
  const generatedText = [body.summary, ...(body[supportingField] ?? [])];
  const canonicalCount =
    JSON.stringify(generatedText).split(promotionCaveat).length - 1;
  if (
    typeof body.summary !== "string" ||
    !Array.isArray(body[supportingField]) ||
    body[supportingField].some((item) => typeof item !== "string") ||
    !Array.isArray(body.evidenceIds) ||
    body.evidenceIds.some((id) => !allowedEvidenceIds.has(id)) ||
    canonicalCount !== 1 ||
    !body[supportingField].includes(promotionCaveat) ||
    body[supportingField].length > 9 ||
    generatedText.some((text) => hasUnsupportedPromotionCausation(text))
  ) {
    throw new Error(
      `${body.agent ?? "Agent"} response failed grounded promotion-causation validation.`,
    );
  }
}

async function call(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init.method && init.method !== "GET"
        ? {
            origin: publicOrigin,
            "sec-fetch-site": "same-origin",
            "content-type": "application/json",
          }
        : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    // Validation failures include the original text below.
  }
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${text}`);
  }
  return { response, body };
}

async function reset(actions) {
  return call("/api/v1/demo/reset", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "if-match": actions.response.headers.get("etag"),
      "idempotency-key": `deployment-reset-${Date.now()}`,
    },
    body: JSON.stringify({ reason: "Restore deterministic deployed demo state." }),
  });
}

const bootstrap = await call("/api/v1/bootstrap");
if (
  bootstrap.body.actor?.id !== "anonymous-public-demo" ||
  bootstrap.body.actor?.authenticated !== false
) {
  throw new Error("Public demo synthetic actor contract was not returned.");
}
const heroPath = `/api/v1/exceptions/${encodeURIComponent(bootstrap.body.hero.exceptionId)}`;

if (mode === "write") {
  let actions = await call("/api/v1/actions");
  if (actions.body.actions.length) {
    await reset(actions);
  }
  const hero = await call(heroPath);
  const investigation = await call(`${heroPath}/investigation`, { method: "POST" });
  const recommendation = await call(`${heroPath}/recommendation`, { method: "POST" });
  const allowedEvidenceIds = new Set(hero.body.evidence?.map((item) => item.id));
  if (investigation.body.status !== "available") {
    throw new Error("Investigation was unavailable.");
  }
  validatePromotionGuard(investigation.body, "caveats", allowedEvidenceIds);
  if (
    recommendation.body.status !== "available" ||
    recommendation.body.selectedOptionId !==
      "store-02:exception:store-01:HL-KNT-EVD-FGN-M" ||
    recommendation.body.consideredOptionIds?.some(
      (id) => !hero.body.options?.some((option) => option.id === id),
    )
  ) {
    throw new Error("Recommendation was unavailable or exceeded supplied option boundaries.");
  }
  validatePromotionGuard(recommendation.body, "tradeoffs", allowedEvidenceIds);
  const key = Date.now();
  const created = await call("/api/v1/actions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "if-match": hero.response.headers.get("etag"),
      "idempotency-key": `deployment-create-${key}`,
    },
    body: JSON.stringify({
      exceptionId: bootstrap.body.hero.exceptionId,
      optionId: "store-02:exception:store-01:HL-KNT-EVD-FGN-M",
      reason: "Deployment persistence validation.",
    }),
  });
  let current = created;
  for (const status of ["approved", "dispatched", "received"]) {
    current = await call(`/api/v1/actions/${created.body.action.id}/status`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "if-match": current.response.headers.get("etag"),
        "idempotency-key": `deployment-${status}-${key}`,
      },
      body: JSON.stringify({ status, reason: `Planner validation ${status}.` }),
    });
  }
  console.log(
    JSON.stringify({
      mode,
      locationCount: bootstrap.body.locations.length,
      heroSku: bootstrap.body.hero.sku,
      available: hero.body.available,
      coverDays: hero.body.coverDays,
      quantity: created.body.action.option.quantity,
      finalStatus: current.body.action.status,
      investigationStatus: investigation.body.status,
      investigationEvidence: investigation.body.evidenceIds?.length ?? 0,
      investigationPromotionCaveat: true,
      recommendationStatus: recommendation.body.status,
      recommendationOption: recommendation.body.selectedOptionId,
      recommendationPromotionCaveat: true,
    }),
  );
} else {
  const actions = await call("/api/v1/actions");
  const received = actions.body.actions.find((action) => action.status === "received");
  if (!received) {
    throw new Error("Persisted received validation action was not found.");
  }
  if (mode === "reset") {
    const result = await reset(actions);
    console.log(JSON.stringify({ mode, reset: result.body.reset, resetCount: result.body.resetCount }));
  } else {
    console.log(
      JSON.stringify({
        mode,
        persistedStatus: received.status,
        quantity: received.option.quantity,
        auditEvents: actions.body.audit.length,
      }),
    );
  }
}
