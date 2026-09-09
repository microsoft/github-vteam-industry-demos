import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AuditEvent, GenerationRun, Proposal } from "@proposal-factory/contracts";
import { createApp } from "../src/app.js";
import { loadAuthConfiguration, workspaceRole } from "../src/auth.js";
import { LocalStore } from "../src/local-store.js";

const tenantId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const clientId = "55555555-5555-4555-8555-555555555555";
const otherTenant = "66666666-6666-4666-8666-666666666666";
const origin = "https://demo.example.test";
const developmentOrigins = "http://127.0.0.1:5173,http://localhost:5173";
const developmentEnvironment = {
  AUTH_MODE: "development", NODE_ENV: "test", HOST: "127.0.0.1",
  AUTH_DEVELOPMENT_ORIGINS: developmentOrigins
};
const environment = {
  AUTH_MODE: "entra", NODE_ENV: "production", HOST: "127.0.0.1", AUTH_TRUSTED_PROXY: "container-apps",
  AUTH_TENANT_ID: tenantId, AUTH_CLIENT_ID: clientId, AUTH_PUBLIC_ORIGIN: origin
};

function identity(options: { tenant?: string; role?: string; user?: string; name?: string; appOnly?: boolean } = {}) {
  const tenant = options.tenant ?? tenantId;
  const user = options.user ?? userId;
  const claims = [
    { typ: "tid", val: tenant }, { typ: "oid", val: user }, { typ: "aud", val: clientId },
    { typ: "iss", val: `https://login.microsoftonline.com/${tenant}/v2.0` },
    { typ: "name", val: options.name ?? "Verified Reviewer" },
    { typ: "roles", val: options.role ?? workspaceRole },
    ...(options.appOnly ? [{ typ: "idtyp", val: "app" }] : [])
  ];
  return {
    "x-requested-with": "XMLHttpRequest",
    "x-ms-client-principal": Buffer.from(JSON.stringify({ auth_typ: "aad", role_typ: "roles", claims })).toString("base64"),
    "x-ms-client-principal-id": user, "x-ms-client-principal-idp": "aad"
  };
}

function multipart() {
  const boundary = "----proposal-factory-origin-boundary";
  const payload = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\nMeeting Notes\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="boundary.txt"\r\n` +
    "Content-Type: text/plain\r\n\r\nBrowser upload through the documented Vite application proxy.\r\n" +
    `--${boundary}--\r\n`
  );
  return { payload, contentType: `multipart/form-data; boundary=${boundary}` };
}

let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); vi.restoreAllMocks(); });

const routes: ["GET" | "POST" | "PUT" | "PATCH" | "HEAD" | "OPTIONS", string][] = [
  ["GET", "/api/session"], ["GET", "/api/dashboard"], ["GET", "/api/opportunities"],
  ["GET", "/api/opportunities/opp-01"], ["POST", "/api/opportunities"],
  ["GET", "/api/documents"], ["GET", "/api/documents?opportunityId=opp-02"],
  ["POST", "/api/opportunities/opp-01/documents"], ["PUT", "/api/opportunities/opp-01/documents/selection"],
  ["GET", "/api/content"], ["GET", "/api/opportunities/opp-01/retrieval-preview"],
  ["POST", "/api/opportunities/opp-01/proposals/generate"], ["GET", "/api/generation-runs/private-run"],
  ["GET", "/api/opportunities/opp-01/proposal"], ["GET", "/api/proposals/private-proposal"],
  ["PATCH", "/api/proposals/private-proposal/sections/scope"],
  ["POST", "/api/proposals/private-proposal/sections/scope/regenerate"],
  ["POST", "/api/proposals/private-proposal/sections/scope/approve"],
  ["POST", "/api/proposals/private-proposal/approve"],
  ["GET", "/api/proposals/private-proposal/export?format=markdown"],
  ["GET", "/api/proposals/private-proposal/export?format=pdf"],
  ["GET", "/api/audit"], ["GET", "/api/audit?opportunityId=opp-02"],
  ["GET", "/api/a-future-route"], ["HEAD", "/api/opportunities"], ["OPTIONS", "/api/opportunities"]
];

describe("deny-by-default workspace boundary", () => {
  it("distinguishes an authorized ordinary user from wrong-tenant and unassigned users", async () => {
    ({ app } = await createApp({ authEnvironment: environment }));
    const authorized = await app.inject({ url: "/api/session", headers: identity() });
    expect(authorized.statusCode).toBe(200);
    expect(authorized.json()).toMatchObject({
      id: userId, tenantId, roles: [workspaceRole], mode: "entra"
    });

    const wrongTenant = await app.inject({ url: "/api/session", headers: identity({ tenant: otherTenant }) });
    expect(wrongTenant.statusCode).toBe(403);
    expect(wrongTenant.json()).toMatchObject({
      error: "WORKSPACE_ACCESS_DENIED",
      message: "This account is not a member of the demo workspace."
    });

    const unassigned = await app.inject({ url: "/api/session", headers: identity({ role: "Other.Role" }) });
    expect(unassigned.statusCode).toBe(403);
    expect(unassigned.json()).toMatchObject({
      error: "WORKSPACE_ACCESS_DENIED",
      message: "Ask an administrator to assign the Workspace Member role."
    });
  });

  it.each([
    ["anonymous", {}, 401],
    ["malformed", { ...identity(), "x-ms-client-principal": "not-base64" }, 401],
    ["wrong tenant", identity({ tenant: otherTenant }), 403],
    ["unassigned", identity({ role: "Other.Role" }), 403],
    ["service principal", identity({ appOnly: true }), 403]
  ] as const)("denies %s before any resource read or mutation across every route", async (_label, headers, status) => {
    const store = new LocalStore();
    const reads = [
      vi.spyOn(store, "list"), vi.spyOn(store, "get"), vi.spyOn(store, "save"),
      vi.spyOn(store.documents, "list"), vi.spyOn(store.documents, "save"),
      vi.spyOn(store.proposals, "get"), vi.spyOn(store.proposals, "save"),
      vi.spyOn(store.runs, "get"), vi.spyOn(store.runs, "save"),
      vi.spyOn(store.audit, "list"), vi.spyOn(store.audit, "append"), vi.spyOn(store, "search")
    ];
    ({ app } = await createApp({ store, authEnvironment: environment }));
    for (const [method, url] of routes) {
      const response = await app.inject({ method, url, headers });
      expect(response.statusCode, `${method} ${url}`).toBe(status);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
      expect(response.headers["cache-control"]).toBe("no-store");
    }
    for (const read of reads) expect(read).not.toHaveBeenCalled();
  });

  it("rejects forged identity envelopes and remote trusted-header bypass", async () => {
    ({ app } = await createApp({ authEnvironment: environment }));
    const valid = identity();
    const envelope = JSON.parse(Buffer.from(valid["x-ms-client-principal"], "base64").toString());
    const cases = [
      { ...valid, "x-ms-client-principal-id": otherTenant },
      { ...valid, "x-ms-client-principal-idp": "github" },
      { ...valid, "x-ms-client-principal": `${valid["x-ms-client-principal"]},${valid["x-ms-client-principal"]}` },
      ...[
        null, [], {}, { ...envelope, auth_typ: "github" }, { ...envelope, claims: "claims" },
        { ...envelope, claims: [...envelope.claims, { typ: "tid", val: otherTenant }] },
        { ...envelope, claims: envelope.claims.filter((claim: { typ: string }) => claim.typ !== "oid") },
        { ...envelope, claims: envelope.claims.map((claim: { typ: string; val: string }) =>
          claim.typ === "aud" ? { ...claim, val: otherTenant } : claim) }
      ].map((value) => ({ ...valid, "x-ms-client-principal": Buffer.from(JSON.stringify(value)).toString("base64") }))
    ];
    for (const headers of cases) {
      expect((await app.inject({ url: "/api/opportunities", headers })).statusCode).toBe(401);
    }
    expect((await app.inject({
      url: "/api/opportunities", headers: valid, remoteAddress: "10.0.0.2"
    })).statusCode).toBe(401);
    expect((await app.inject({
      url: "/api/opportunities",
      headers: {
        ...valid,
        origin: "https://evil.example.test",
        forwarded: "for=127.0.0.1;host=demo.example.test;proto=https",
        "x-forwarded-for": "127.0.0.1",
        "x-forwarded-host": "demo.example.test",
        "x-forwarded-proto": "https"
      }
    })).statusCode).toBe(403);
  });

  it("accepts mapped Entra claim names while retaining the immutable object ID as audit identity", async () => {
    ({ app } = await createApp({ authEnvironment: environment }));
    const headers = identity();
    const envelope = JSON.parse(Buffer.from(headers["x-ms-client-principal"], "base64").toString());
    const mapping: Record<string, string> = {
      tid: "http://schemas.microsoft.com/identity/claims/tenantid",
      oid: "http://schemas.microsoft.com/identity/claims/objectidentifier",
      roles: "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
    };
    envelope.role_typ = mapping.roles;
    envelope.claims = envelope.claims.map((claim: { typ: string; val: string }) => ({ ...claim, typ: mapping[claim.typ] ?? claim.typ }));
    envelope.claims.push({ typ: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier", val: "pairwise-subject" });
    headers["x-ms-client-principal"] = Buffer.from(JSON.stringify(envelope)).toString("base64");
    headers["x-ms-client-principal-id"] = "pairwise-subject";
    const response = await app.inject({ url: "/api/session", headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: userId, tenantId, mode: "entra" });
  });

  it("blocks cross-origin/cookie CSRF including stateful GET and never reflects CORS", async () => {
    ({ app } = await createApp({ authEnvironment: environment }));
    for (const headers of [
      { origin: "https://untrusted.example.test" }, { origin: "null" },
      { "sec-fetch-site": "cross-site" }, { cookie: "AppServiceAuthSession=opaque", "x-requested-with": "" },
      { "x-requested-with": "" }
    ]) {
      const response = await app.inject({ url: "/api/proposals/private/export", headers: { ...identity(), ...headers } });
      expect(response.statusCode).toBe(403);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    }
    const permitted = await app.inject({
      url: "/api/opportunities", headers: {
        ...identity(), origin, cookie: "AppServiceAuthSession=opaque", "x-requested-with": "XMLHttpRequest"
      }
    });
    expect(permitted.statusCode).toBe(200);
    expect(permitted.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("permits assigned workspace members and attributes authenticated mutations without cross-request leakage", async () => {
    const created = await createApp({ authEnvironment: environment });
    app = created.app;
    const first = identity();
    const secondId = "77777777-7777-4777-8777-777777777777";
    const second = identity({ user: secondId, name: "Second Reviewer" });
    const runResponse = await app.inject({ method: "POST", url: "/api/opportunities/opp-01/proposals/generate", headers: first });
    expect(runResponse.statusCode).toBe(202);
    const run = runResponse.json<GenerationRun>();
    for (let i = 0; i < 4; i++) await app.inject({ url: `/api/generation-runs/${run.id}`, headers: second });
    const proposal = (await app.inject({ url: `/api/proposals/${run.proposalId}`, headers: first })).json<Proposal>();
    expect(proposal.sections).toHaveLength(12);
    const denied = await app.inject({ url: `/api/proposals/${proposal.id}/export?format=pdf`, headers: identity({ role: "" }) });
    expect(denied.statusCode).toBe(403);
    for (const [method, url] of [
      ["GET", `/api/generation-runs/${run.id}`],
      ["GET", `/api/proposals/${proposal.id}`],
      ["POST", `/api/proposals/${proposal.id}/sections/scope/approve`],
      ["POST", `/api/proposals/${proposal.id}/approve`],
      ["GET", `/api/audit?opportunityId=${run.opportunityId}`]
    ] as const) {
      expect((await app.inject({ method, url, headers: identity({ role: "Unassigned" }) })).statusCode).toBe(403);
    }
    await Promise.all([
      app.inject({ method: "PUT", url: "/api/opportunities/opp-02/documents/selection", headers: first, payload: { documentIds: [] } }),
      app.inject({ method: "PUT", url: "/api/opportunities/opp-03/documents/selection", headers: second, payload: { documentIds: [] } })
    ]);
    const events = (await app.inject({ url: "/api/audit", headers: first })).json<AuditEvent[]>();
    expect(events.find((event) => event.type === "Proposal Generated")).toMatchObject({
      actor: "Verified Reviewer", actorId: userId, actorTenantId: tenantId, actorType: "User"
    });
    expect(events.find((event) => event.opportunityId === "opp-02")?.actorId).toBe(userId);
    expect(events.find((event) => event.opportunityId === "opp-03")?.actorId).toBe(secondId);
    expect(events.every((event) => event.actor !== "Demo User")).toBe(true);
    await created.store.documents.save({
      id: "private-document", opportunityId: "opp-02", name: "Private source", kind: "Meeting Notes",
      contentType: "text/plain", sizeBytes: 1, source: "Upload", summary: "Sensitive extracted content",
      extractedText: "Sensitive extracted content", createdAt: new Date().toISOString()
    });
    expect((await app.inject({
      method: "PUT", url: "/api/opportunities/opp-01/documents/selection",
      headers: first, payload: { documentIds: ["private-document"] }
    })).statusCode).toBe(403);
    const response = await app.inject({ url: "/api/documents", headers: identity({ role: "" }) });
    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain("Sensitive extracted content");
  });
});

describe("explicit configuration with no fallback", () => {
  it.each([
    {}, { AUTH_MODE: "unknown" }, { AUTH_MODE: "development", NODE_ENV: "production" },
    { AUTH_MODE: "development" }, { AUTH_MODE: "development", NODE_ENV: "test", CONTAINER_APP_NAME: "aca" },
    { AUTH_MODE: "development", NODE_ENV: "test", HOST: "127.0.0.1" },
    { ...developmentEnvironment, AUTH_DEVELOPMENT_ORIGINS: "http://0.0.0.0:5173" },
    { ...developmentEnvironment, AUTH_DEVELOPMENT_ORIGINS: "http://127.0.0.1:5173/path" },
    { ...developmentEnvironment, AUTH_DEVELOPMENT_ORIGINS: "https://127.0.0.1:5173" },
    { ...environment, HOST: "0.0.0.0" }, { ...environment, AUTH_TRUSTED_PROXY: "" },
    { ...environment, AUTH_DEVELOPMENT_ORIGINS: developmentOrigins },
    { ...environment, AUTH_TENANT_ID: "" }, { ...environment, AUTH_CLIENT_ID: "" },
    { ...environment, AUTH_CLIENT_ID: "00000000-0000-0000-0000-000000000000" },
    { ...environment, AUTH_PUBLIC_ORIGIN: "" }, { ...environment, AUTH_PUBLIC_ORIGIN: "http://demo.example.test" },
    { ...environment, AUTH_PUBLIC_ORIGIN: "https://demo.example.test/path" },
    { ...environment, AUTH_PUBLIC_ORIGIN: "https://*.example.test" }
  ])("fails before initializing any data store: %j", async (authEnvironment) => {
    const initialize = vi.spyOn(LocalStore.prototype, "initialize");
    expect(() => loadAuthConfiguration(authEnvironment)).toThrow();
    await expect(createApp({ authEnvironment })).rejects.toThrow();
    expect(initialize).not.toHaveBeenCalled();
  });

  it("uses only the explicit deterministic development principal and rejects forged headers/DNS rebinding", async () => {
    ({ app } = await createApp({ authEnvironment: developmentEnvironment }));
    expect((await app.inject("/api/session")).json()).toMatchObject({
      mode: "development", displayName: "Local Development Member"
    });
    expect((await app.inject({ url: "/api/session", headers: identity() })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/session", headers: { host: "rebinding.example.test" } })).statusCode).toBe(403);
  });

  it("serves development sessions and document endpoints locally without an Entra redirect", async () => {
    ({ app } = await createApp({ authEnvironment: developmentEnvironment }));
    for (const url of ["/api/session", "/api/documents?opportunityId=opp-01"]) {
      const response = await app.inject({ url, headers: { host: "localhost:5173" } });
      expect(response.statusCode).toBe(200);
      expect(response.headers.location).toBeUndefined();
      expect(response.headers["www-authenticate"]).toBeUndefined();
    }
  });

  it.each(["http://127.0.0.1:5173", "http://localhost:5173"])(
    "accepts the configured Vite application origin %s while the upstream Host remains the API",
    async (applicationOrigin) => {
      ({ app } = await createApp({ authEnvironment: developmentEnvironment }));
      const response = await app.inject({
        url: "/api/session",
        headers: {
          host: "127.0.0.1:3001",
          origin: applicationOrigin,
          "sec-fetch-site": "same-origin",
          "x-requested-with": "XMLHttpRequest"
        }
      });
      expect(response.statusCode).toBe(200);
    }
  );

  it("allows documented browser mutations through Vite and rejects foreign origins despite forged proxy headers", async () => {
    const documentStorage = {
      uploadDocument: vi.fn(async () => ({
        originalName: "boundary.txt",
        safeExtension: ".txt",
        contentType: "text/plain",
        sizeBytes: 61,
        sha256: "a".repeat(64),
        extractedText: "Browser upload through the documented Vite application proxy.",
        extractionMethod: "Plain Text" as const,
        storageProvider: "Local" as const,
        container: "local-upload-directory",
        storageKey: "opp-01/doc-boundary/doc-boundary.txt"
      })),
      deleteDocument: vi.fn(async () => {})
    };
    ({ app } = await createApp({ authEnvironment: developmentEnvironment, documentStorage }));
    const browserHeaders = {
      host: "127.0.0.1:3001",
      origin: "http://127.0.0.1:5173",
      "sec-fetch-site": "same-origin",
      "x-requested-with": "XMLHttpRequest"
    };
    const content = await app.inject({
      method: "POST",
      url: "/api/content",
      headers: browserHeaders,
      payload: {
        title: "Proxy boundary evidence",
        kind: "Proposal Snippet",
        scenario: "Cloud modernization",
        industries: ["Retail"],
        tags: ["proxy", "boundary"],
        summary: "Content created through the documented browser proxy boundary.",
        body: "Only configured loopback application origins may perform this mutation."
      }
    });
    expect(content.statusCode).toBe(201);

    const uploadBody = multipart();
    const upload = await app.inject({
      method: "POST",
      url: "/api/opportunities/opp-01/documents",
      headers: { ...browserHeaders, "content-type": uploadBody.contentType },
      payload: uploadBody.payload
    });
    expect(upload.statusCode).toBe(201);
    const documentId = upload.json().id as string;

    expect((await app.inject({
      method: "PUT",
      url: "/api/opportunities/opp-01/documents/selection",
      headers: browserHeaders,
      payload: { documentIds: [documentId] }
    })).statusCode).toBe(200);
    expect((await app.inject({
      method: "POST",
      url: "/api/opportunities/opp-01/proposals/generate",
      headers: browserHeaders
    })).statusCode).toBe(202);

    const denied = await app.inject({
      method: "POST",
      url: "/api/content",
      headers: {
        ...browserHeaders,
        origin: "http://evil.example.test",
        forwarded: "for=127.0.0.1;host=127.0.0.1:5173;proto=http",
        "x-forwarded-host": "127.0.0.1:5173",
        "x-forwarded-proto": "http"
      },
      payload: {
        title: "Denied",
        kind: "Proposal Snippet",
        scenario: "Cloud modernization",
        industries: ["Retail"],
        tags: ["denied"],
        summary: "Must not persist.",
        body: "Must not persist."
      }
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ error: "ORIGIN_DENIED" });
  });
});
