import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  createApp,
  PUBLIC_DEMO_AUDIT_REASONS,
} from "../../src/server/app.js";
import type { AppConfig } from "../../src/server/config.js";
import type { AgentInvoker } from "../../src/server/foundry.js";
import { MemoryStateStore } from "../../src/server/state.js";

const PUBLIC_ORIGIN = "https://demo.example";
const heroId = "exception:store-01:HL-KNT-EVD-FGN-M";
const optionId = "store-02:exception:store-01:HL-KNT-EVD-FGN-M";

const config: AppConfig = {
  port: 0,
  environment: "azure",
  authMode: "public-demo",
  publicDemoOrigin: PUBLIC_ORIGIN,
  stateMode: "memory",
  localStatePath: "",
  storageContainerName: "application-state",
  storageBlobName: "state.json",
  agentTimeoutMs: 50,
};

const agents: AgentInvoker = {
  configured: () => true,
  investigate: async (evidence) => ({
    status: "available",
    summary: "Dublin may sell out before the scheduled inbound.",
    evidenceIds: evidence.slice(0, 2).map((item) => item.id),
    caveats: ["Promotion is a signal, not proof of causation."],
    agent: "Inventory Investigation",
  }),
  recommend: async (evidence, options) => ({
    status: "available",
    summary: "Use the protected Cork transfer.",
    selectedOptionId: options.find((item) => item.sourceLocationId === "store-02")!.id,
    consideredOptionIds: options.map((item) => item.id),
    evidenceIds: evidence.slice(0, 2).map((item) => item.id),
    tradeoffs: ["Transfer cost versus waiting risk."],
    agent: "Replenishment Recommendation",
  }),
};

function publicPost(app: ReturnType<typeof createApp>, path: string) {
  return request(app)
    .post(path)
    .set("Origin", PUBLIC_ORIGIN)
    .set("Sec-Fetch-Site", "same-origin")
    .set("Content-Type", "application/json");
}

function publicPatch(app: ReturnType<typeof createApp>, path: string) {
  return request(app)
    .patch(path)
    .set("Origin", PUBLIC_ORIGIN)
    .set("Sec-Fetch-Site", "same-origin")
    .set("Content-Type", "application/json");
}

describe("anonymous public two-minute demo journey", () => {
  it("supports no-cookie hero workflow, canonical audit, reset, and shared AI limits", async () => {
    const app = createApp({ config, agents, store: new MemoryStateStore() });

    const bootstrap = await request(app).get("/api/v1/bootstrap");
    expect(bootstrap.status).toBe(200);
    expect(bootstrap.headers.location).toBeUndefined();
    expect(bootstrap.body.actor).toEqual({
      id: "anonymous-public-demo",
      name: "Anonymous Public Demo Actor (synthetic)",
      role: "planner",
      kind: "public-demo",
      authenticated: false,
    });

    const hero = await request(app).get(`/api/v1/exceptions/${heroId}`);
    expect(hero.body.productName).toBe("Everyday Knit — Forest Green — Size M");
    expect(hero.body.available).toBe(12);
    expect(hero.body.dailyDemand).toBe(8);
    expect(hero.body.nextInboundDay).toBe(5);

    const cork = hero.body.options.find(
      (option: { sourceLocationId: string }) => option.sourceLocationId === "store-02",
    );
    expect(cork.quantity).toBe(32);
    expect(cork.projectedSourceCoverDays).toBe(12);

    const investigation = await publicPost(
      app,
      `/api/v1/exceptions/${heroId}/investigation`,
    );
    const recommendation = await publicPost(
      app,
      `/api/v1/exceptions/${heroId}/recommendation`,
    );
    expect(investigation.body.agent).toBe("Inventory Investigation");
    expect(recommendation.body.agent).toBe("Replenishment Recommendation");
    expect(recommendation.body.selectedOptionId).toBe(cork.id);

    const proposed = await publicPost(app, "/api/v1/actions")
      .set("If-Match", hero.headers.etag!)
      .set("Idempotency-Key", "ui-propose")
      .send({
        exceptionId: heroId,
        optionId,
        reason: "Caller text must be ignored.",
      });
    expect(proposed.body.action.status).toBe("proposed");

    const approved = await publicPatch(
      app,
      `/api/v1/actions/${proposed.body.action.id}/status`,
    )
      .set("If-Match", proposed.headers.etag!)
      .set("Idempotency-Key", "ui-approve")
      .send({ status: "approved", reason: "Caller text must be ignored." });
    expect(approved.body.action.status).toBe("approved");
    expect(approved.body.message).toContain("reserved only");

    const dispatched = await publicPatch(
      app,
      `/api/v1/actions/${proposed.body.action.id}/status`,
    )
      .set("If-Match", approved.headers.etag!)
      .set("Idempotency-Key", "ui-dispatch")
      .send({ status: "dispatched", reason: "Caller text must be ignored." });
    expect(dispatched.body.action.status).toBe("dispatched");

    const received = await publicPatch(
      app,
      `/api/v1/actions/${proposed.body.action.id}/status`,
    )
      .set("If-Match", dispatched.headers.etag!)
      .set("Idempotency-Key", "ui-receive")
      .send({ status: "received", reason: "Caller text must be ignored." });
    expect(received.body.action.status).toBe("received");

    const history = await request(app).get("/api/v1/actions");
    expect(history.body.audit.map((entry: { reason: string }) => entry.reason)).toEqual([
      PUBLIC_DEMO_AUDIT_REASONS.proposed,
      PUBLIC_DEMO_AUDIT_REASONS.approved,
      PUBLIC_DEMO_AUDIT_REASONS.dispatched,
      PUBLIC_DEMO_AUDIT_REASONS.received,
    ]);

    const blocked = await publicPost(app, "/api/v1/actions")
      .set("If-Match", received.headers.etag!)
      .set("Idempotency-Key", "ui-reproposal")
      .send({
        exceptionId: heroId,
        optionId,
        reason: "Reset is required.",
      });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("reset_required");

    const reset = await publicPost(app, "/api/v1/demo/reset")
      .set("If-Match", received.headers.etag!)
      .set("Idempotency-Key", "ui-reset")
      .send({ reason: "Caller text must be ignored." });
    expect(reset.status).toBe(200);
    const cleared = await request(app).get("/api/v1/actions");
    expect(cleared.body).toEqual({ actions: [], audit: [] });

    for (let index = 0; index < 4; index += 1) {
      const route = index % 2 === 0 ? "investigation" : "recommendation";
      const response = await publicPost(app, `/api/v1/exceptions/${heroId}/${route}`);
      expect(response.status).toBe(200);
    }
    const limited = await publicPost(
      app,
      `/api/v1/exceptions/${heroId}/investigation`,
    );
    expect(limited.status).toBe(429);
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    expect(Number(limited.headers["ratelimit-reset"])).toBeGreaterThan(0);
    expect(limited.body.error.code).toBe("public_demo_rate_limited");
  });
});
