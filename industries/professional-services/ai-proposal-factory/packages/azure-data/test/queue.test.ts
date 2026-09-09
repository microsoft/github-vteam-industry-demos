import type { QueueClient } from "@azure/storage-queue";
import { describe, expect, it, vi } from "vitest";
import { AzureStorageWorkQueue, type WorkMessage } from "../src/index.js";

class MockQueue {
  sent: string[] = [];
  receivedMessageItems: Array<Record<string, unknown>> = [];
  updates: unknown[][] = [];
  deletes: unknown[][] = [];
  createIfNotExists = vi.fn(async () => ({}));
  sendMessage = vi.fn(async (message: string) => {
    this.sent.push(message);
    return {};
  });
  receiveMessages = vi.fn(async () => ({ receivedMessageItems: this.receivedMessageItems.splice(0, 1) }));
  updateMessage = vi.fn(async (...arguments_: unknown[]) => {
    this.updates.push(arguments_);
    return {};
  });
  deleteMessage = vi.fn(async (...arguments_: unknown[]) => {
    this.deletes.push(arguments_);
    return {};
  });
}

function received(messageText: string, dequeueCount: number) {
  return {
    messageId: "azure-message-1",
    popReceipt: "receipt-1",
    messageText,
    dequeueCount,
    insertedOn: new Date("2026-09-07T09:00:00.000Z")
  };
}

describe("Azure Storage work queue", () => {
  it("updates failed messages with delayed retry and only deletes completed work", async () => {
    const work = new MockQueue();
    const poison = new MockQueue();
    const queue = new AzureStorageWorkQueue(work as unknown as QueueClient, poison as unknown as QueueClient, {
      visibilityTimeoutSeconds: 30,
      maxDequeueCount: 3,
      now: () => "2026-09-07T09:00:00.000Z"
    });
    const message: WorkMessage = { id: "work-01", type: "GenerateProposal", payload: { opportunityId: "opp-01" } };
    await queue.enqueue(message);
    work.receivedMessageItems.push(received(work.sent[0]!, 1));
    const active = await queue.receive();
    expect(active).toEqual(message);
    expect(queue.deliveryAttempts(active!)).toBe(1);
    await queue.fail(active!, "temporary failure");
    expect(work.updateMessage).toHaveBeenCalledWith(
      "azure-message-1",
      "receipt-1",
      expect.any(String),
      30
    );
    expect(work.deleteMessage).not.toHaveBeenCalled();
    expect(poison.sendMessage).not.toHaveBeenCalled();
  });

  it("moves exhausted work to poison before deleting the original", async () => {
    const work = new MockQueue();
    const poison = new MockQueue();
    const queue = new AzureStorageWorkQueue(work as unknown as QueueClient, poison as unknown as QueueClient, {
      visibilityTimeoutSeconds: 30,
      maxDequeueCount: 3
    });
    const message: WorkMessage = { id: "work-02", type: "ExportProposal", payload: { proposalId: "proposal-01" } };
    await queue.enqueue(message);
    work.receivedMessageItems.push(received(work.sent[0]!, 3));
    const active = await queue.receive();
    expect(queue.deliveryAttempts(active!)).toBe(3);
    await queue.fail(active!, "permanent failure");
    expect(poison.sendMessage).toHaveBeenCalledOnce();
    expect(work.deleteMessage).toHaveBeenCalledWith("azure-message-1", "receipt-1");
    expect(work.updateMessage).not.toHaveBeenCalled();
  });

  it("moves permanent failures directly to poison", async () => {
    const work = new MockQueue();
    const poison = new MockQueue();
    const queue = new AzureStorageWorkQueue(work as unknown as QueueClient, poison as unknown as QueueClient, {
      visibilityTimeoutSeconds: 30,
      maxDequeueCount: 5
    });
    const message: WorkMessage = { id: "work-permanent", type: "RegenerateSection", payload: { jobId: "job-01" } };
    await queue.enqueue(message);
    work.receivedMessageItems.push(received(work.sent[0]!, 1));
    const active = await queue.receive();
    await queue.fail(active!, "INVALID_JOB", { retryable: false });
    expect(poison.sendMessage).toHaveBeenCalledOnce();
    expect(work.deleteMessage).toHaveBeenCalledOnce();
    expect(work.updateMessage).not.toHaveBeenCalled();
  });

  it("retains the original when poison queue delivery fails", async () => {
    const work = new MockQueue();
    const poison = new MockQueue();
    poison.sendMessage.mockRejectedValueOnce(new Error("poison queue unavailable"));
    const queue = new AzureStorageWorkQueue(work as unknown as QueueClient, poison as unknown as QueueClient, {
      visibilityTimeoutSeconds: 30,
      maxDequeueCount: 2
    });
    const message: WorkMessage = { id: "work-03", type: "GenerateProposal", payload: {} };
    await queue.enqueue(message);
    work.receivedMessageItems.push(received(work.sent[0]!, 2));
    const active = await queue.receive();
    await expect(queue.fail(active!, "permanent failure")).rejects.toThrow("poison queue unavailable");
    expect(work.deleteMessage).not.toHaveBeenCalled();
  });

  it("quarantines malformed envelopes without copying raw message content", async () => {
    const work = new MockQueue();
    const poison = new MockQueue();
    const queue = new AzureStorageWorkQueue(work as unknown as QueueClient, poison as unknown as QueueClient, {
      visibilityTimeoutSeconds: 30,
      maxDequeueCount: 3
    });
    work.receivedMessageItems.push(received("not-base64-json-sensitive-value", 1));
    expect(await queue.receive()).toBeUndefined();
    expect(poison.sendMessage).toHaveBeenCalledOnce();
    expect(Buffer.from(poison.sent[0]!, "base64").toString("utf8")).not.toContain("sensitive-value");
    expect(work.deleteMessage).toHaveBeenCalledOnce();
  });
});
