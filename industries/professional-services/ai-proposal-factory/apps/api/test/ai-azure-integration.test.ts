import { describe, expect, it, vi } from "vitest";
import type { AiCheckpoint, AiJob } from "@proposal-factory/ai";
import { setupAzureFixture as setup } from "./azure-fixture.js";

describe("Azure data + AI + queue composition without cloud calls", () => {
  it("queues generation, keeps progress GET read-only, publishes through the worker and protects approvals", async () => {
    const { app, runtime, data, handle } = await setup();
    const analyze = vi.spyOn(runtime.ai.orchestrator.provider, "analyze");
    try {
      expect((await app.inject("/health")).json()).toMatchObject({ dataProvider: "azure", aiProvider: "fixture" });
      const started = await app.inject({ method: "POST", url: "/api/opportunities/opp-01/proposals/generate" });
      expect(started.statusCode).toBe(202);
      const run = started.json();
      expect(data.queue.enqueue).toHaveBeenCalledWith({ id: run.id, type: "GenerateProposal", payload: { jobId: run.id } });
      expect((await app.inject(`/api/generation-runs/${run.id}`)).json().progress).toBe(0);
      expect(analyze).not.toHaveBeenCalled();
      await handle(run.id);
      await handle(run.id);
      expect(analyze).toHaveBeenCalledTimes(1);
      expect((await app.inject(`/api/generation-runs/${run.id}`)).json()).toMatchObject({
        status: "Complete",
        retrieval: { mode: "fixture" },
        providerEvidence: {
          provider: "fixture",
          successfulModelOperations: 0,
          successfulRetrievalOperations: 1,
          deterministicOperations: 4
        }
      });
      const proposal = (await app.inject("/api/opportunities/opp-01/proposal")).json();
      expect(proposal.sections).toHaveLength(12);
      expect((await app.inject({ method: "POST", url: `/api/proposals/${proposal.id}/sections/scope/regenerate` })).statusCode).toBe(200);
      for (const section of (await app.inject(`/api/proposals/${proposal.id}`)).json().sections) {
        expect((await app.inject({ method: "POST", url: `/api/proposals/${proposal.id}/sections/${section.key}/approve`,
          payload: { expectedRevisionId: section.currentRevisionId } })).statusCode).toBe(200);
      }
      expect((await app.inject({ method: "POST", url: `/api/proposals/${proposal.id}/approve`,
        payload: { expectedReviewVersion: (await app.inject(`/api/proposals/${proposal.id}`)).json().reviewVersion } })).statusCode).toBe(200);
      expect((await app.inject(`/api/proposals/${proposal.id}/export?format=markdown`)).statusCode).toBe(200);
      expect(data.blobs.exports.storeExport).toHaveBeenCalledTimes(1);
      expect(await data.repositories.exports.list(proposal.id)).toHaveLength(1);
      const events = await data.repositories.audit.list("opp-01");
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((event) => event.actorId === "11111111-1111-4111-8111-111111111111" &&
        event.actorType === "Development" && event.actor === "Local Development Member")).toBe(true);
    } finally { await app.close(); }
  });

  it("recovers publication after a partial failure without rerunning model stages or duplicating audit", async () => {
    const { app, runtime, data, handle } = await setup();
    const analyze = vi.spyOn(runtime.ai.orchestrator.provider, "analyze");
    try {
      const run = (await app.inject({ method: "POST", url: "/api/opportunities/opp-01/proposals/generate" })).json();
      const original = data.repositories.audit.append.bind(data.repositories.audit);
      vi.spyOn(data.repositories.audit, "append").mockRejectedValueOnce({ code: 503 }).mockImplementation(original);
      await expect(handle(run.id)).rejects.toEqual({ code: 503 });
      expect((await data.repositories.generationRuns.get(run.id))?.status).toBe("Running");
      expect((await runtime.state.record(run.id))?.publication).toBeDefined();
      await handle(run.id);
      expect(analyze).toHaveBeenCalledTimes(1);
      expect((await data.repositories.generationRuns.get(run.id))?.status).toBe("Complete");
      const audit = await data.repositories.audit.list("opp-01");
      expect(audit.filter((event) => event.type === "Proposal Generated")).toHaveLength(1);
    } finally { await app.close(); }
  });

  it("rejects stale proposal revisions and prevents approval of failed publication", async () => {
    const { app, data, handle } = await setup();
    try {
      const initial = (await app.inject({ method: "POST", url: "/api/opportunities/opp-01/proposals/generate" })).json();
      await handle(initial.id);
      const proposal = (await data.repositories.proposals.getByOpportunity("opp-01"))!;
      const next = (await app.inject({ method: "POST", url: "/api/opportunities/opp-01/proposals/generate" })).json();
      await data.repositories.proposals.save({ ...proposal, title: "External concurrent revision" });
      await expect(handle(next.id)).rejects.toMatchObject({ code: "STALE_REVISION" });
      expect((await data.repositories.proposals.get(proposal.id))?.title).toBe("External concurrent revision");
      expect((await app.inject({ method: "POST", url: `/api/proposals/${proposal.id}/sections/scope/approve`,
        payload: { expectedRevisionId: proposal.sections.find((section) => section.key === "scope")!.currentRevisionId } })).statusCode).toBe(409);
    } finally { await app.close(); }
  });

  it("recovers an enqueue failure from the durable outbox and blocks concurrent human mutations", async () => {
    const { app, runtime, data, handle } = await setup();
    try {
      vi.mocked(data.queue.enqueue).mockRejectedValueOnce({ code: 503 });
      expect((await app.inject({ method: "POST", url: "/api/opportunities/opp-01/proposals/generate" })).statusCode).toBe(500);
      const active = await runtime.state.readValue<{ jobId: string }>("opportunity:opp-01");
      expect(active?.jobId).toBeDefined();
      const selected = await app.inject({ method: "PUT", url: "/api/opportunities/opp-01/documents/selection", payload: { documentIds: [] } });
      expect(selected.statusCode).toBe(409);
      await runtime.workflow.dispatchPending();
      expect((await runtime.state.record(active!.jobId))?.dispatched).toBe(true);
      await handle(active!.jobId);
      expect(await runtime.workflow.isCommitted(active!.jobId)).toBe(true);
    } finally { await app.close(); }
  });

  it("never regresses stage progress when replicas report older completed checkpoints", async () => {
    const { app, runtime, data } = await setup();
    try {
      const run = (await app.inject({ method: "POST", url: "/api/opportunities/opp-01/proposals/generate" })).json();
      const job = (await runtime.state.loadJob(run.id))!;
      const first = await runtime.ai.orchestrator.advance(job);
      const second = await runtime.ai.orchestrator.advance(job);
      const progress = runtime.workflow as unknown as { recordProgress(job: AiJob, checkpoint: AiCheckpoint): Promise<void> };
      await progress.recordProgress(job, second);
      await progress.recordProgress(job, first);
      const persisted = (await data.repositories.generationRuns.get(run.id))!;
      expect(persisted.progress).toBe(50);
      expect(persisted.stages.filter((stage) => stage.status === "Complete")).toHaveLength(2);
      expect(persisted.retrievedContentIds.length).toBeGreaterThan(0);
    } finally { await app.close(); }
  });

  it("recovers a leftover terminal opportunity pointer before dispatching a new job", async () => {
    const { app, runtime, handle, data } = await setup();
    try {
      const first = (await app.inject({ method: "POST", url: "/api/opportunities/opp-01/proposals/generate" })).json();
      await handle(first.id);
      await runtime.state.exclusive("opportunity:opp-01",
        () => runtime.state.writeValue("opportunity:opp-01", { jobId: first.id }));
      const next = await app.inject({ method: "POST", url: "/api/opportunities/opp-01/proposals/generate" });
      expect(next.statusCode).toBe(202);
      expect(next.json().id).not.toBe(first.id);
      expect(data.queue.enqueue).toHaveBeenLastCalledWith(expect.objectContaining({ id: next.json().id }));
    } finally { await app.close(); }
  });
});
