import { afterEach, describe, expect, it, vi } from "vitest";
import { AzureStorageWorkQueue } from "@proposal-factory/azure-data";
import { createAzureApplicationRuntime } from "../src/ai-azure-runtime.js";
import { GenerationWorkHandler, runWorker } from "../../worker/src/index.js";
import { environment, setupAzureFixture } from "./azure-fixture.js";

afterEach(() => vi.restoreAllMocks());

describe("autonomous empty-queue outbox recovery", () => {
  it("recovers API/worker restarts, a transient dispatcher failure and duplicate dispatch without a manual request", async () => {
    const { app, data, runtime } = await setupAzureFixture();
    const messages: Array<{ messageId: string; messageText: string; popReceipt: string; dequeueCount: number }> = [];
    let sequence = 0;
    const transport = {
      sendMessage: vi.fn(async (messageText: string) => {
        messages.push({ messageId: `message-${++sequence}`, messageText, popReceipt: `receipt-${sequence}`, dequeueCount: 0 });
      }),
      receiveMessages: vi.fn(async () => {
        const message = messages[0];
        if (message) message.dequeueCount++;
        return { receivedMessageItems: message ? [{ ...message }] : [] };
      }),
      deleteMessage: vi.fn(async (id: string) => {
        const index = messages.findIndex((message) => message.messageId === id);
        if (index >= 0) messages.splice(index, 1);
      }),
      updateMessage: vi.fn(async () => ({ popReceipt: "renewed-receipt" }))
    };
    const poison = { sendMessage: vi.fn() };
    const makeQueue = () => new AzureStorageWorkQueue(transport as never, poison as never, {
      visibilityTimeoutSeconds: 60, maxDequeueCount: 5
    });
    data.queue = makeQueue();
    transport.sendMessage.mockRejectedValueOnce({ code: 503 });
    const response = await app.inject({ method: "POST", url: "/api/opportunities/opp-01/proposals/generate" });
    expect(response.statusCode).toBe(500);
    const active = await runtime.state.readValue<{ jobId: string }>("opportunity:opp-01");
    const id = active!.jobId;
    expect((await runtime.state.record(id))?.dispatched).toBe(false);
    expect(messages).toHaveLength(0);
    await app.close(); // No further API request or explicit dispatch call rescues this job.

    data.queue = makeQueue();
    const restarted = createAzureApplicationRuntime(environment, { data });
    const immutableInput = structuredClone(await restarted.state.loadJob(id));
    const analyze = vi.spyOn(restarted.ai.orchestrator.provider, "analyze");
    const record = restarted.state.updateRecord.bind(restarted.state);
    let failAfterEnqueue = true;
    vi.spyOn(restarted.state, "updateRecord").mockImplementation(async (jobId, change) => {
      const current = (await restarted.state.record(jobId))!;
      if (failAfterEnqueue && change(current).dispatched && !current.dispatched) {
        failAfterEnqueue = false;
        throw { code: 503 }; // Enqueued but not acknowledged in Cosmos: duplicate dispatch is required.
      }
      return record(jobId, change);
    });
    transport.sendMessage.mockRejectedValueOnce({ code: 503 });
    const firstWorker = new AbortController();
    const errors = vi.fn();
    const receive = data.queue.receive.bind(data.queue);
    // Simulate worker exit after the next enqueue succeeded, before any queue delivery.
    vi.spyOn(data.queue, "receive").mockImplementation(async () => {
      if (messages.length) { firstWorker.abort(); return undefined; }
      return receive();
    });
    await runWorker(data.queue, new GenerationWorkHandler({
      run: (job) => restarted.workflow.execute(job)
    }, restarted.workflow), {
      signal: firstWorker.signal, idleMs: 100, dispatchIntervalMs: 100,
      dispatchPending: () => restarted.workflow.dispatchPending(), onError: errors
    });
    expect(errors).toHaveBeenCalledTimes(2);
    expect(messages).toHaveLength(1);
    expect((await restarted.state.record(id))?.dispatched).toBe(false);

    data.queue = makeQueue();
    const finalRuntime = createAzureApplicationRuntime(environment, { data });
    const finalAnalyze = vi.spyOn(finalRuntime.ai.orchestrator.provider, "analyze");
    const complete = data.queue.complete.bind(data.queue);
    const finalWorker = new AbortController();
    vi.spyOn(data.queue, "complete").mockImplementation(async (message) => {
      expect((await data.repositories.generationRuns.get(id))?.status).toBe("Complete");
      expect((await data.repositories.proposals.getByOpportunity("opp-01"))?.sections).toHaveLength(12);
      expect((await data.repositories.audit.list("opp-01")).filter((event) => event.type === "Proposal Generated")).toHaveLength(1);
      await complete(message);
      if (!messages.length) finalWorker.abort();
    });
    try {
      await runWorker(data.queue, new GenerationWorkHandler({
        run: (job) => finalRuntime.workflow.execute(job)
      }, finalRuntime.workflow), {
        signal: finalWorker.signal, idleMs: 100, dispatchIntervalMs: 100,
        dispatchPending: () => finalRuntime.workflow.dispatchPending(), onError: errors
      });
      expect(await finalRuntime.state.loadJob(id)).toEqual(immutableInput);
      expect(await finalRuntime.workflow.isCommitted(id)).toBe(true);
      expect(analyze).not.toHaveBeenCalled();
      expect(finalAnalyze).toHaveBeenCalledTimes(1);
      expect(transport.deleteMessage).toHaveBeenCalledTimes(2);
      expect(poison.sendMessage).not.toHaveBeenCalled();
      expect((await finalRuntime.state.record(id))?.terminal).toBe(true);
    } finally { finalWorker.abort(); }
  }, 15000);
});
