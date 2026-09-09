import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AuditEvent, Proposal, ProposalSectionKey } from "@proposal-factory/contracts";
import { AiError } from "@proposal-factory/ai";
import { createApp } from "../src/app.js";
import { createAzureApplicationRuntime } from "../src/ai-azure-runtime.js";
import { LocalStore } from "../src/local-store.js";
import { environment, setupAzureFixture } from "./azure-fixture.js";

const tenant = "33333333-3333-4333-8333-333333333333";
const client = "55555555-5555-4555-8555-555555555555";
const reviewer = "44444444-4444-4444-8444-444444444444";
const editor = "77777777-7777-4777-8777-777777777777";
const authEnvironment = {
  AUTH_MODE: "entra", NODE_ENV: "production", HOST: "127.0.0.1", AUTH_TRUSTED_PROXY: "container-apps",
  AUTH_TENANT_ID: tenant, AUTH_CLIENT_ID: client, AUTH_PUBLIC_ORIGIN: "https://demo.example.test"
};
function identity(id = reviewer) {
  const claims = [
    { typ: "tid", val: tenant }, { typ: "oid", val: id }, { typ: "aud", val: client },
    { typ: "iss", val: `https://login.microsoftonline.com/${tenant}/v2.0` },
    { typ: "name", val: id === reviewer ? "Verified Reviewer" : "Verified Editor" },
    { typ: "roles", val: "ProposalFactory.WorkspaceMember" }
  ];
  return {
    "x-requested-with": "XMLHttpRequest",
    "x-ms-client-principal": Buffer.from(JSON.stringify({ auth_typ: "aad", role_typ: "roles", claims })).toString("base64"),
    "x-ms-client-principal-id": id, "x-ms-client-principal-idp": "aad"
  };
}
const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); vi.restoreAllMocks(); });

async function setup(provider: "local" | "azure") {
  const azure = provider === "azure" ? await setupAzureFixture(authEnvironment) : undefined;
  const first = azure ?? await createApp({ authEnvironment, store: new LocalStore() });
  const replica = azure ? createAzureApplicationRuntime(environment, { data: azure.data }) : undefined;
  const second = await createApp({
    authEnvironment, store: replica?.store ?? first.store,
    ...(replica ? { ai: replica.ai, workflow: replica.workflow, ids: replica.ids } : {})
  });
  apps.push(first.app, second.app);
  const run = (await first.app.inject({
    method: "POST", url: "/api/opportunities/opp-01/proposals/generate", headers: identity()
  })).json();
  if (azure) await azure.handle(run.id);
  else for (let index = 0; index < 4; index++) {
    await first.app.inject({ url: `/api/generation-runs/${run.id}`, headers: identity() });
  }
  const read = async () => (await first.app.inject({
    url: "/api/opportunities/opp-01/proposal", headers: identity()
  })).json<Proposal>();
  const proposal = await read();
  expect(proposal.sections).toHaveLength(12);
  const approveSection = (seen: Proposal, key: ProposalSectionKey = "scope", app = first.app, actor = reviewer) =>
    app.inject({
      method: "POST", url: `/api/proposals/${seen.id}/sections/${key}/approve`, headers: identity(actor),
      payload: {
        expectedRevisionId: seen.sections.find((section) => section.key === key)!.currentRevisionId,
        actor: "FORGED", actorId: "FORGED"
      }
    });
  const approveAll = async () => {
    let seen = await read();
    for (const section of seen.sections) {
      const response = await approveSection(seen, section.key);
      expect(response.statusCode).toBe(200);
      seen = response.json<Proposal>();
    }
    return seen;
  };
  const approveComplete = (seen: Proposal, actor = reviewer) => first.app.inject({
    method: "POST", url: `/api/proposals/${seen.id}/approve`, headers: identity(actor),
    payload: { expectedReviewVersion: seen.reviewVersion, actor: "FORGED" }
  });
  const change = (kind: "edit" | "regenerate" = "edit") => second.app.inject({
    method: kind === "edit" ? "PATCH" : "POST",
    url: `/api/proposals/${proposal.id}/sections/scope${kind === "edit" ? "" : "/regenerate"}`,
    headers: identity(editor), ...(kind === "edit" ? { payload: { content: "Unseen replacement scope" } } : {})
  });
  const events = async () => (await first.app.inject({ url: "/api/audit", headers: identity() })).json<AuditEvent[]>();
  return { ...first, azure, second, proposal, read, change, approveSection, approveAll, approveComplete, events };
}

describe.each(["local", "azure"] as const)("%s exact reviewed revision approvals", (provider) => {
  it("binds pre-upgrade snapshots without mutating on GET", async () => {
    const { store, azure, proposal, read, approveAll, approveComplete } = await setup(provider);
    const { reviewVersion, ...legacy } = proposal;
    void reviewVersion;
    const repository = azure?.data.repositories.proposals ?? store.proposals;
    await repository.save(legacy as Proposal);
    const seen = await read();
    expect(seen.reviewVersion).toMatch(/^legacy-/);
    expect((await read()).reviewVersion).toBe(seen.reviewVersion);
    expect((await repository.get(proposal.id))?.reviewVersion).toBeUndefined();
    const reviewed = await approveAll();
    expect((await approveComplete(reviewed)).statusCode).toBe(200);
  });
  it.each(["edit", "regenerate"] as const)("rejects two-client stale section approval after %s and requires preconditions", async (kind) => {
    const fixture = await setup(provider);
    const { app, proposal, change, approveSection, read, events } = fixture;
    expect((await app.inject({
      method: "POST", url: `/api/proposals/${proposal.id}/sections/scope/approve`, headers: identity()
    })).statusCode).toBe(400);
    expect((await app.inject({
      method: "POST", url: `/api/proposals/${proposal.id}/approve`, headers: identity()
    })).statusCode).toBe(400);
    expect((await change(kind)).statusCode).toBe(200);
    const rejected = await approveSection(proposal);
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error).toBe("STALE_REVIEW");
    expect((await read()).sections.find((section) => section.key === "scope")?.approvedRevisionId).toBeUndefined();
    expect((await events()).filter((event) => event.type === "Section Approved")).toEqual([]);
    expect((await approveSection(await read())).statusCode).toBe(200);
  });

  it("rejects a complete approval after approval-state changes, edits, regeneration and reapproval", async () => {
    const { proposal, approveAll, approveComplete, change, read } = await setup(provider);
    await approveAll();
    expect((await approveComplete(proposal)).statusCode).toBe(409);
    for (const kind of ["edit", "regenerate"] as const) {
      const seen = await read();
      expect((await change(kind)).statusCode).toBe(200);
      await approveAll();
      const rejected = await approveComplete(seen);
      expect(rejected.statusCode).toBe(409);
      expect(rejected.json().error).toBe("STALE_REVIEW");
    }
    expect((await approveComplete(await read())).statusCode).toBe(200);
  });

  it("invalidates the displayed review set after full regeneration even when all new sections are approved", async () => {
    const { app, azure, approveAll, approveComplete, read } = await setup(provider);
    const seen = await approveAll();
    const run = (await app.inject({
      method: "POST", url: "/api/opportunities/opp-01/proposals/generate", headers: identity(editor)
    })).json();
    if (azure) await azure.handle(run.id);
    else for (let index = 0; index < 4; index++) {
      await app.inject({ url: `/api/generation-runs/${run.id}`, headers: identity(editor) });
    }
    await approveAll();
    expect((await read()).id).toBe(seen.id);
    expect((await approveComplete(seen)).statusCode).toBe(409);
    expect((await approveComplete(await read())).statusCode).toBe(200);
  });

  it("serializes an edit with an overlapping stale approval across two application clients", async () => {
    const { proposal, change, approveSection, second, read } = await setup(provider);
    let release!: () => void;
    let entered!: () => void;
    const enteredSave = new Promise<void>((resolve) => { entered = resolve; });
    const pause = new Promise<void>((resolve) => { release = resolve; });
    const original = second.store.proposals.save.bind(second.store.proposals);
    vi.spyOn(second.store.proposals, "save").mockImplementationOnce(async (value) => {
      entered();
      await pause;
      return original(value);
    });
    const editing = change();
    await enteredSave;
    const approving = approveSection(proposal);
    release();
    expect((await editing).statusCode).toBe(200);
    expect((await approving).statusCode).toBe(409);
    expect((await read()).sections.find((section) => section.key === "scope")!.approvedRevisionId).toBeUndefined();
  });

  it("retries idempotently, repairs interrupted audit publication, and retains the authenticated approver", async () => {
    const { proposal, store, approveSection, approveAll, approveComplete, events, read, change } = await setup(provider);
    vi.spyOn(store.audit, "append").mockRejectedValueOnce(new Error("Audit unavailable after approval write"));
    expect((await approveSection(proposal)).statusCode).toBe(500);
    const retry = await approveSection(proposal, "scope", undefined, editor);
    expect(retry.statusCode).toBe(200);
    const once = retry.json<Proposal>();
    expect((await approveSection(proposal)).json<Proposal>()).toEqual(once);
    const ready = await approveAll();
    expect((await approveComplete(ready)).statusCode).toBe(200);
    const approved = await read();
    expect((await approveComplete(ready, editor)).json<Proposal>()).toEqual(approved);
    expect((await approveSection(ready)).json<Proposal>()).toEqual(approved);
    const audit = await events();
    const sectionEvents = audit.filter((event) => event.type === "Section Approved");
    expect(sectionEvents).toHaveLength(12);
    expect(sectionEvents.every((event) => event.actorId === reviewer && event.actorType === "User" &&
      event.actorTenantId === tenant && event.actor === "Verified Reviewer")).toBe(true);
    const section = approved.sections.find((item) => item.key === "scope")!;
    expect(sectionEvents.find((event) => event.metadata.section === "scope")!.metadata).toEqual({
      section: "scope", revisionId: section.currentRevisionId, revision: 1
    });
    const complete = audit.filter((event) => event.type === "Proposal Approved");
    expect(complete).toHaveLength(1);
    expect(complete[0]).toMatchObject({ actorId: reviewer, metadata: { reviewVersion: ready.reviewVersion } });
    expect(JSON.parse(complete[0]!.metadata.sectionRevisions as string)).toEqual(approved.sections.map((item) => ({
      key: item.key, revisionId: item.currentRevisionId,
      revision: item.revisions.find((revision) => revision.id === item.currentRevisionId)!.revision
    })));
    await change();
    expect((await approveSection(proposal)).statusCode).toBe(409);
    expect((await approveComplete(ready)).statusCode).toBe(409);
  });
});

describe("Azure review lease and ETag composition", () => {
  it("returns 412 rather than approving unseen content when an external write wins the proposal ETag", async () => {
    const { azure, proposal, approveSection, read, events } = await setup("azure");
    const repository = azure!.data.repositories.proposals;
    const save = repository.saveVersioned.bind(repository);
    vi.spyOn(repository, "saveVersioned").mockImplementationOnce(async (value, etag) => {
      await repository.save({ ...proposal, title: "External revision" });
      return save(value, etag);
    });
    const response = await approveSection(proposal);
    expect(response.statusCode).toBe(412);
    expect(response.json().error).toBe("STALE_REVIEW");
    expect((await read()).sections.find((section) => section.key === "scope")!.approvedRevisionId).toBeUndefined();
    expect((await events()).filter((event) => event.type === "Section Approved")).toEqual([]);
  });

  it("fences approval writes when lease renewal is lost", async () => {
    const { azure, proposal, approveSection, read } = await setup("azure");
    const save = vi.spyOn(azure!.data.repositories.proposals, "saveVersioned");
    vi.spyOn(azure!.runtime.state, "assertLease").mockRejectedValueOnce(new AiError("LEASE_LOST", "Lease lost", true));
    expect((await approveSection(proposal)).statusCode).toBe(503);
    expect(save).not.toHaveBeenCalled();
    expect((await read()).sections.find((section) => section.key === "scope")!.approvedRevisionId).toBeUndefined();
  });
});
