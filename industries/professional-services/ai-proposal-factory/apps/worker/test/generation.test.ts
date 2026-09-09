import { describe, expect, it, vi } from "vitest";
import { AiError, FixtureModelProvider, MemoryCheckpointStore, ProposalOrchestrator, type AiJob } from "@proposal-factory/ai";
import { opportunity } from "../../../packages/ai/test/fixtures.js";
import { GenerationWorkHandler, processNextMessage, runWorker, startConfiguredWorker, type GenerationJobPersistence, type WorkQueue } from "../src/index.js";

const job: AiJob = { id: "job-01", type: "GenerateProposal", opportunity, documents: [] };
const message = { id: "queue-01", type: "GenerateProposal" as const, payload: { jobId: job.id } };

function setup() {
  const model = new FixtureModelProvider();
  const workflow = new ProposalOrchestrator(model, {
    retrieveEvidence: async () => ({ citations: [], mode: "fixture", warnings: [] })
  }, new MemoryCheckpointStore());
  let committed = false;
  const persistence: GenerationJobPersistence = {
    loadJob: vi.fn().mockResolvedValue(job),
    isCommitted: vi.fn(async () => committed),
    commitResult: vi.fn(async () => { committed = true; }),
    markFailed: vi.fn()
  };
  const queue: WorkQueue = { receive: vi.fn().mockResolvedValue(message), complete: vi.fn(), fail: vi.fn() };
  return { workflow, model, persistence, queue, handler: new GenerationWorkHandler(workflow, persistence) };
}

describe("generation worker", () => {
  it("keeps receiving queued work after a failed outbox scan and retries transport failures without exiting", async () => {
    vi.useFakeTimers();
    const { handler, queue } = setup();
    const controller = new AbortController();
    const report = vi.fn();
    const dispatch = vi.fn().mockRejectedValueOnce({ code: 503 }).mockResolvedValue(undefined);
    const now = vi.spyOn(Date, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(99)
      .mockReturnValueOnce(100)
      .mockReturnValue(100);
    vi.mocked(queue.receive).mockRejectedValueOnce({ code: 503 }).mockImplementation(async () => {
      controller.abort();
      return undefined;
    });
    const worker = runWorker(queue, handler, {
      signal: controller.signal, dispatchPending: dispatch, dispatchIntervalMs: 100, idleMs: 100, onError: report
    });
    try {
      await vi.advanceTimersByTimeAsync(100);
      await worker;
      expect(report).toHaveBeenCalledTimes(2);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(queue.receive).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
      vi.useRealTimers();
    }
  });
  it("does not dispatch early when an aborting receive finishes before the outbox deadline", async () => {
    const { handler, queue } = setup();
    const controller = new AbortController();
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const now = vi.spyOn(Date, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(99);
    vi.mocked(queue.receive).mockImplementation(async () => {
      controller.abort();
      return undefined;
    });
    try {
      await runWorker(queue, handler, {
        signal: controller.signal, dispatchPending: dispatch, dispatchIntervalMs: 100, idleMs: 100
      });
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(queue.receive).toHaveBeenCalledTimes(1);
    } finally {
      now.mockRestore();
    }
  });
  it("keeps local startup offline and rejects incomplete Azure startup", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await startConfiguredWorker({ DATA_PROVIDER: "local" });
      expect(log).toHaveBeenCalledWith(expect.stringContaining("no Azure queue"));
      await expect(startConfiguredWorker({ DATA_PROVIDER: "azure" })).rejects.toThrow(/required/);
    } finally { log.mockRestore(); }
  });
  it("publishes all sections before queue acknowledgement and ignores duplicate committed deliveries", async () => {
    const { handler, queue, persistence, model } = setup();
    const analyze = vi.spyOn(model, "analyze");
    expect(await processNextMessage(queue, handler)).toBe(true);
    expect(persistence.commitResult).toHaveBeenCalledWith(job, expect.objectContaining({ provider: "fixture" }));
    expect(queue.complete).toHaveBeenCalledWith(message);
    await processNextMessage(queue, handler);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(persistence.commitResult).toHaveBeenCalledTimes(1);
  });
  it("classifies retryable throttling without acknowledging failure", async () => {
    const { handler, queue, persistence, model } = setup();
    vi.spyOn(model, "analyze").mockRejectedValue(new AiError("THROTTLED", "sensitive text", true));
    await processNextMessage(queue, handler);
    expect(queue.fail).toHaveBeenCalledWith(message, "THROTTLED", { retryable: true });
    expect(persistence.markFailed).toHaveBeenCalledWith(job.id, { code: "THROTTLED", retryable: true });
    expect(queue.complete).not.toHaveBeenCalled();
  });
  it("rejects malformed work and mismatched persisted job types", async () => {
    const { handler, persistence } = setup();
    await expect(handler.handle({ ...message, payload: {} })).rejects.toMatchObject({ code: "INVALID_JOB" });
    await expect(handler.handle({ ...message, type: "ExportProposal" })).rejects.toMatchObject({ code: "UNSUPPORTED_WORK" });
    vi.mocked(persistence.loadJob).mockResolvedValue(undefined);
    await expect(handler.handle(message)).rejects.toMatchObject({ code: "INVALID_JOB" });
  });
  it("does not publish or acknowledge empty receives", async () => {
    const { handler, queue } = setup();
    vi.mocked(queue.receive).mockResolvedValue(undefined);
    expect(await processNextMessage(queue, handler)).toBe(false);
    expect(queue.complete).not.toHaveBeenCalled();
  });
  it("retries publication without rerunning completed model stages", async () => {
    const { handler, queue, persistence, model } = setup();
    const analyze = vi.spyOn(model, "analyze");
    vi.mocked(persistence.commitResult).mockRejectedValueOnce(new AiError("PERSISTENCE_UNAVAILABLE", "retry", true));
    await processNextMessage(queue, handler);
    await processNextMessage(queue, handler);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(persistence.commitResult).toHaveBeenCalledTimes(2);
    expect(queue.complete).toHaveBeenCalledTimes(1);
  });
});
