import { createHash } from "node:crypto";
import type { DequeuedMessageItem, QueueClient } from "@azure/storage-queue";
import { QueueMessageError } from "./errors.js";

export interface WorkMessage {
  id: string;
  type: "GenerateProposal" | "RegenerateSection" | "ExportProposal";
  payload: Record<string, unknown>;
}

export interface WorkQueue {
  receive(): Promise<WorkMessage | undefined>;
  complete(message: WorkMessage): Promise<void>;
  fail(message: WorkMessage, reason: string, failure?: { retryable: boolean }): Promise<void>;
}

interface QueueEnvelope extends WorkMessage {
  schemaVersion: 1;
  attempt: number;
  enqueuedAt: string;
  lastError?: string;
}

interface Receipt {
  messageId: string;
  popReceipt: string;
  dequeueCount: number;
  envelope: QueueEnvelope;
  timer: ReturnType<typeof setInterval>;
  renewal: Promise<void>;
  lost?: Error;
}

const validTypes = new Set<WorkMessage["type"]>(["GenerateProposal", "RegenerateSection", "ExportProposal"]);

function encode(envelope: QueueEnvelope) {
  const encoded = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64");
  if (Buffer.byteLength(encoded, "utf8") > 64 * 1024) {
    throw new QueueMessageError("Queue message exceeds the Azure Storage Queue encoded size limit.");
  }
  return encoded;
}

function decode(value: string): QueueEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    throw new QueueMessageError("Queue message is not a valid encoded JSON envelope.");
  }
  if (!parsed || typeof parsed !== "object") throw new QueueMessageError("Queue envelope must be an object.");
  const candidate = parsed as Partial<QueueEnvelope>;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.id !== "string" ||
    !candidate.id ||
    !validTypes.has(candidate.type as WorkMessage["type"]) ||
    !candidate.payload ||
    typeof candidate.payload !== "object" ||
    Array.isArray(candidate.payload)
  ) {
    throw new QueueMessageError("Queue envelope is missing required fields.");
  }
  return {
    schemaVersion: 1,
    id: candidate.id,
    type: candidate.type as WorkMessage["type"],
    payload: candidate.payload as Record<string, unknown>,
    attempt: typeof candidate.attempt === "number" ? candidate.attempt : 0,
    enqueuedAt: typeof candidate.enqueuedAt === "string" ? candidate.enqueuedAt : new Date(0).toISOString(),
    ...(typeof candidate.lastError === "string" ? { lastError: candidate.lastError } : {})
  };
}

export class AzureStorageWorkQueue implements WorkQueue {
  private readonly receipts = new WeakMap<WorkMessage, Receipt>();

  constructor(
    private readonly workQueue: QueueClient,
    private readonly poisonQueue: QueueClient,
    private readonly options: {
      visibilityTimeoutSeconds: number;
      maxDequeueCount: number;
      now?: () => string;
    }
  ) {}

  async ensureQueues() {
    await this.workQueue.createIfNotExists();
    await this.poisonQueue.createIfNotExists();
  }

  async enqueue(message: WorkMessage) {
    const envelope: QueueEnvelope = {
      ...message,
      schemaVersion: 1,
      attempt: 0,
      enqueuedAt: (this.options.now ?? (() => new Date().toISOString()))()
    };
    await this.workQueue.sendMessage(encode(envelope));
  }

  async receive() {
    const response = await this.workQueue.receiveMessages({
      numberOfMessages: 1,
      visibilityTimeout: this.options.visibilityTimeoutSeconds
    });
    const item = response.receivedMessageItems[0];
    if (!item) return undefined;
    let envelope: QueueEnvelope;
    try {
      envelope = decode(item.messageText);
    } catch (error) {
      await this.quarantineMalformed(item, error instanceof Error ? error.message : "Malformed queue message.");
      return undefined;
    }
    const message: WorkMessage = { id: envelope.id, type: envelope.type, payload: envelope.payload };
    const receipt: Receipt = {
      messageId: item.messageId,
      popReceipt: item.popReceipt,
      dequeueCount: item.dequeueCount,
      envelope,
      timer: undefined as unknown as ReturnType<typeof setInterval>,
      renewal: Promise.resolve()
    };
    const renewalInterval = Math.max(1_000, Math.floor((this.options.visibilityTimeoutSeconds * 1000) / 3));
    receipt.timer = setInterval(() => {
      receipt.renewal = receipt.renewal.then(async () => {
        if (receipt.lost) return;
        try {
          const updated = await this.workQueue.updateMessage(
            receipt.messageId,
            receipt.popReceipt,
            undefined,
            this.options.visibilityTimeoutSeconds
          );
          if (!updated.popReceipt) throw new Error("Queue visibility renewal did not return a pop receipt.");
          receipt.popReceipt = updated.popReceipt;
        } catch (error) {
          receipt.lost = error instanceof Error ? error : new Error("Queue visibility renewal failed.");
        }
      });
    }, renewalInterval);
    receipt.timer.unref?.();
    this.receipts.set(message, receipt);
    return message;
  }

  async complete(message: WorkMessage) {
    const receipt = this.requiredReceipt(message);
    await this.finishRenewal(receipt);
    await this.workQueue.deleteMessage(receipt.messageId, receipt.popReceipt);
    this.receipts.delete(message);
  }

  async fail(message: WorkMessage, reason: string, failure?: { retryable: boolean }) {
    const receipt = this.requiredReceipt(message);
    await this.finishRenewal(receipt);
    const safeReason = reason.replace(/[\r\n]+/g, " ").slice(0, 512) || "Worker processing failed.";
    const dequeueCount = Math.max(receipt.dequeueCount, receipt.envelope.attempt + 1);
    const failedEnvelope: QueueEnvelope = {
      ...receipt.envelope,
      attempt: dequeueCount,
      lastError: safeReason
    };
    if (failure?.retryable === false || dequeueCount >= this.options.maxDequeueCount) {
      await this.poisonQueue.sendMessage(encode(failedEnvelope));
      await this.workQueue.deleteMessage(receipt.messageId, receipt.popReceipt);
      this.receipts.delete(message);
      return;
    }
    const retryDelay = Math.min(3600, this.options.visibilityTimeoutSeconds * 2 ** Math.max(0, dequeueCount - 1));
    await this.workQueue.updateMessage(
      receipt.messageId,
      receipt.popReceipt,
      encode(failedEnvelope),
      retryDelay
    );
    this.receipts.delete(message);
  }

  private requiredReceipt(message: WorkMessage) {
    const receipt = this.receipts.get(message);
    if (!receipt) throw new QueueMessageError(`No active queue receipt exists for message ${message.id}.`);
    return receipt;
  }

  deliveryAttempts(message: WorkMessage) {
    const receipt = this.requiredReceipt(message);
    return Math.max(receipt.dequeueCount, receipt.envelope.attempt + 1);
  }

  private async finishRenewal(receipt: Receipt) {
    clearInterval(receipt.timer);
    await receipt.renewal;
    if (receipt.lost) throw receipt.lost;
  }

  private async quarantineMalformed(item: DequeuedMessageItem, reason: string) {
    const fingerprint = createHash("sha256").update(item.messageText).digest("hex");
    const envelope: QueueEnvelope = {
      schemaVersion: 1,
      id: `malformed-${item.messageId}`,
      type: "GenerateProposal",
      payload: { malformed: true, fingerprint, reason: reason.slice(0, 512) },
      attempt: item.dequeueCount,
      enqueuedAt: item.insertedOn?.toISOString() ?? new Date(0).toISOString(),
      lastError: "Malformed queue message quarantined."
    };
    await this.poisonQueue.sendMessage(encode(envelope));
    await this.workQueue.deleteMessage(item.messageId, item.popReceipt);
  }
}
