import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import process from "node:process";
import { Blob, Buffer } from "node:buffer";
import { clearTimeout, setTimeout } from "node:timers";
import console from "node:console";

const { fetch, FormData } = globalThis;

const directory = resolve(".data", `auth-smoke-${process.pid}`);
const tenant = "33333333-3333-4333-8333-333333333333";
const client = "55555555-5555-4555-8555-555555555555";
const actor = "44444444-4444-4444-8444-444444444444";
const origin = "https://demo.example.test";
const environment = {
  ...process.env, HOST: "127.0.0.1", PORT: "0", NODE_ENV: "production", AUTH_MODE: "entra",
  AUTH_TRUSTED_PROXY: "container-apps", AUTH_TENANT_ID: tenant, AUTH_CLIENT_ID: client,
  AUTH_PUBLIC_ORIGIN: origin, DATA_PROVIDER: "local", AI_PROVIDER: "fixture",
  LOCAL_DATA_FILE: join(directory, "state.json"), LOCAL_UPLOAD_DIRECTORY: join(directory, "uploads")
};
delete environment.CONTAINER_APP_NAME;
delete environment.AUTH_DEVELOPMENT_ORIGINS;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const children = [];
function launch(env) {
  const child = spawn(process.execPath, [resolve("apps", "api", "dist", "server.js")], {
    env, stdio: ["ignore", "pipe", "pipe"]
  });
  children.push(child);
  let output = "";
  child.stdout.on("data", (data) => { output += data; });
  child.stderr.on("data", (data) => { output += data; });
  return { child, output: () => output };
}
async function ready(process) {
  for (let attempt = 0; attempt < 450; attempt++) {
    const address = process.output().match(/Server listening at (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
    if (address) return address;
    assert.equal(process.child.exitCode, null, process.output());
    await pause(200);
  }
  throw new Error("Built API startup timed out.");
}
function principal({ tenantId = tenant, role = "ProposalFactory.WorkspaceMember" } = {}) {
  return {
    "x-requested-with": "XMLHttpRequest",
    "x-ms-client-principal-id": actor, "x-ms-client-principal-idp": "aad",
    "x-ms-client-principal": Buffer.from(JSON.stringify({
      auth_typ: "aad", role_typ: "roles",
      claims: [
        { typ: "tid", val: tenantId }, { typ: "oid", val: actor }, { typ: "aud", val: client },
        { typ: "iss", val: `https://login.microsoftonline.com/${tenantId}/v2.0` },
        { typ: "name", val: "Smoke Reviewer" }, { typ: "roles", val: role }
      ]
    })).toString("base64")
  };
}

await mkdir(directory, { recursive: true });
try {
  const process = launch(environment);
  const base = await ready(process);
  const call = async (path, method = "GET", payload, headers = principal()) => {
    const response = await fetch(base + path, {
      method, headers: { ...headers, ...(payload ? { "content-type": "application/json" } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    });
    return response;
  };
  for (const [headers, status] of [
    [{}, 401], [{ ...principal(), "x-ms-client-principal": "malformed" }, 401],
    [principal({ tenantId: "66666666-6666-4666-8666-666666666666" }), 403],
    [principal({ role: "Unassigned" }), 403]
  ]) {
    for (const path of [
      "/api/opportunities", "/api/documents", "/api/content", "/api/generation-runs/unknown",
      "/api/proposals/unknown", "/api/proposals/unknown/export?format=pdf", "/api/audit"
    ]) {
      const denied = await call(path, "GET", undefined, headers);
      assert.equal(denied.status, status, `${path} denial`);
      assert.equal(denied.headers.get("access-control-allow-origin"), null);
    }
    assert.equal((await call("/api/proposals/unknown/approve", "POST", undefined, headers)).status, status);
  }
  assert.equal((await call("/api/opportunities", "GET", undefined, { ...principal(), origin: "https://evil.example.test" })).status, 403);
  assert.equal((await call("/api/opportunities", "GET", undefined, { ...principal(), cookie: "session=opaque", "x-requested-with": "" })).status, 403);
  const opportunities = await (await call("/api/opportunities")).json();
  assert.equal(opportunities.length, 10);
  const form = new FormData();
  form.append("kind", "Meeting Notes");
  form.append("file", new Blob(["# Delivery notes\nSponsor requires approved, grounded cloud modernization scope."], { type: "text/markdown" }), "auth-smoke.md");
  const upload = await fetch(base + "/api/opportunities/opp-01/documents", { method: "POST", headers: principal(), body: form });
  assert.equal(upload.status, 201);
  const document = await upload.json();
  assert.equal((await call("/api/opportunities/opp-01/documents/selection", "PUT", { documentIds: [document.id], actor: "Forged Actor" })).status, 200);
  const started = await call("/api/opportunities/opp-01/proposals/generate", "POST");
  assert.equal(started.status, 202);
  const run = await started.json();
  for (let index = 0; index < 4; index++) assert.equal((await call(`/api/generation-runs/${run.id}`)).status, 200);
  let proposal = await (await call(`/api/proposals/${run.proposalId}`)).json();
  assert.equal(proposal.sections.length, 12);
  proposal = await (await call(`/api/proposals/${proposal.id}/sections/scope`, "PATCH", { content: "Verified human-reviewed synthetic delivery scope." })).json();
  proposal = await (await call(`/api/proposals/${proposal.id}/sections/scope/regenerate`, "POST")).json();
  for (const section of proposal.sections) {
    assert.equal((await call(`/api/proposals/${proposal.id}/sections/${section.key}/approve`, "POST",
      { expectedRevisionId: section.currentRevisionId })).status, 200);
  }
  proposal = await (await call(`/api/proposals/${proposal.id}`)).json();
  assert.equal((await call(`/api/proposals/${proposal.id}/approve`, "POST",
    { expectedReviewVersion: proposal.reviewVersion })).status, 200);
  for (const format of ["markdown", "pdf"]) {
    const exported = await call(`/api/proposals/${proposal.id}/export?format=${format}`);
    assert.equal(exported.status, 200);
    assert.ok((await exported.arrayBuffer()).byteLength > 0);
  }
  const audit = await (await call("/api/audit")).json();
  assert.ok(audit.length >= 20);
  assert.ok(audit.every((event) => event.actorId === actor && event.actorTenantId === tenant && event.actor === "Smoke Reviewer"));
  const persisted = JSON.parse(await readFile(environment.LOCAL_DATA_FILE, "utf8"));
  assert.equal(persisted.auditEvents.length, audit.length);

  const local = launch({
    ...environment, NODE_ENV: "test", AUTH_MODE: "development",
    AUTH_DEVELOPMENT_ORIGINS: "http://127.0.0.1:5173,http://localhost:5173",
    LOCAL_DATA_FILE: join(directory, "local.json")
  });
  const localBase = await ready(local);
  assert.equal((await (await fetch(localBase + "/api/session")).json()).displayName, "Local Development Member");
  for (const override of [
    { AUTH_MODE: "" }, { AUTH_MODE: "development" }, { AUTH_CLIENT_ID: "" }, { HOST: "0.0.0.0" }
  ]) {
    const rejected = launch({ ...environment, ...override });
    const timeout = setTimeout(() => rejected.child.kill(), 90_000);
    const [exitCode] = await once(rejected.child, "exit");
    clearTimeout(timeout);
    assert.notEqual(exitCode, null, "Misconfigured startup timed out instead of failing fast.");
    assert.notEqual(exitCode, 0, "Misconfigured production unexpectedly started.");
    assert.ok(!rejected.output().includes("Server listening"));
  }
  console.log("PASS: built loopback API; 32 protected-resource denials; CORS/CSRF denial; upload/generation/edit/regeneration/approval/Markdown/PDF/audit; persisted verified actor; explicit local mode; 4 production fail-fast starts.");
  console.log("Headers emulate only the trusted platform boundary. No Azure login, provisioning, or deployed validation was performed.");
} finally {
  await Promise.all(children.filter((child) => child.exitCode === null && child.signalCode === null).map(async (child) => {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }));
  await rm(directory, { recursive: true, force: true });
}
