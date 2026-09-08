import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import type { Container } from "@azure/cosmos";
import { AiError } from "./errors.js";
import type { AiCheckpoint, CheckpointStore } from "./orchestration.js";

interface LeaseDocument {
  id: string;
  partitionKey: string;
  entityType: "ai-workflow-state";
  schemaVersion: 1;
  owner: string;
  expiresAt: number;
  fence: number;
  checkpoint?: AiCheckpoint;
  value?: unknown;
  _etag?: string | undefined;
}
interface Lease {
  key: string;
  record: LeaseDocument;
  serial: Promise<void>;
  lost?: AiError;
}
export interface CosmosLeaseOptions {
  durationMs?: number;
  acquireTimeoutMs?: number;
  clockSkewMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}
const status = (error: unknown) => {
  const value = error as { code?: number; statusCode?: number; status?: number } | null;
  return value?.statusCode ?? value?.status ?? value?.code;
};
const storageId = (key: string) => `ai-${createHash("sha256").update(key).digest("hex")}`;

/** Lease ownership and checkpoint data share a document, so If-Match fences every checkpoint write. */
export class CosmosCheckpointStore implements CheckpointStore {
  private readonly contexts = new AsyncLocalStorage<Map<string, Lease>>();
  private readonly duration: number;
  private readonly acquireTimeout: number;
  private readonly skew: number;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(private readonly container: Container, options: CosmosLeaseOptions = {}) {
    this.duration = options.durationMs ?? 60000;
    this.acquireTimeout = options.acquireTimeoutMs ?? 20000;
    this.skew = options.clockSkewMs ?? 5000;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    if (!Number.isInteger(this.duration) || this.duration < 15000 || this.duration > 300000 ||
        !Number.isInteger(this.acquireTimeout) || this.acquireTimeout < 0 || this.acquireTimeout > 120000 ||
        !Number.isInteger(this.skew) || this.skew < 0 || this.skew > 30000) {
      throw new AiError("INVALID_CONFIG", "Invalid Cosmos checkpoint lease duration, acquisition timeout, or clock-skew allowance.");
    }
  }

  private async read(key: string): Promise<LeaseDocument | undefined> {
    if (!key || key.length > 250) throw new AiError("INVALID_JOB", "Workflow state key must be 1–250 characters.");
    const id = storageId(key);
    try {
      const response = await this.container.item(id, id).read<LeaseDocument>();
      return response.resource;
    } catch (error) { if (status(error) === 404) return; throw error; }
  }

  async load(jobId: string) { return (await this.read(jobId))?.checkpoint; }
  async readValue<T>(key: string) { return (await this.read(key))?.value as T | undefined; }
  async save(checkpoint: AiCheckpoint) {
    await this.update(this.requiredLease(checkpoint.jobId), { checkpoint });
  }
  async writeValue<T>(key: string, value: T) {
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > 1_000_000) {
      throw new AiError("STATE_LIMIT", "Workflow state exceeds the 1MB application limit.");
    }
    await this.update(this.requiredLease(key), { value });
  }

  private requiredLease(key: string) {
    const lease = this.contexts.getStore()?.get(key);
    if (!lease) throw new AiError("LEASE_REQUIRED", "Workflow writes require exclusive lease ownership.");
    return lease;
  }

  /** Refresh ownership immediately before an external, independently ETag-protected side effect. */
  async assertLease(key: string) { await this.update(this.requiredLease(key), {}); }

  private update(lease: Lease, fields: Partial<Pick<LeaseDocument, "checkpoint" | "value">>): Promise<void> {
    const action = lease.serial.then(async () => {
      if (lease.lost) throw lease.lost;
      if (lease.record.expiresAt <= this.now()) {
        throw new AiError("LEASE_LOST", "Cosmos workflow lease expired before the write.", true);
      }
      const { _etag, ...previous } = lease.record;
      if (!_etag) throw new AiError("LEASE_LOST", "Cosmos did not supply a fencing ETag.", true);
      const next: LeaseDocument = { ...previous, ...fields, expiresAt: this.now() + this.duration };
      const response = await this.container.item(next.id, next.partitionKey).replace(next, {
        accessCondition: { type: "IfMatch", condition: _etag }
      });
      lease.record = { ...next, _etag: response.etag ?? response.resource?._etag };
    }).catch(() => {
      lease.lost ??= new AiError("LEASE_LOST", "Cosmos workflow lease could not be renewed or fenced.", true);
      throw lease.lost;
    });
    lease.serial = action.catch(() => {});
    return action;
  }

  async exclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (this.contexts.getStore()?.has(key)) {
      await this.assertLease(key);
      return operation();
    }
    const deadline = this.now() + this.acquireTimeout;
    let lease: Lease | undefined;
    for (;;) {
      const existing = await this.read(key);
      if (!existing || !existing.owner || existing.expiresAt + this.skew <= this.now()) {
        const id = storageId(key);
        const { _etag, ...base } = existing ?? {};
        const candidate: LeaseDocument = {
          ...base, id, partitionKey: id, entityType: "ai-workflow-state", schemaVersion: 1,
          owner: randomUUID(), expiresAt: this.now() + this.duration, fence: (existing?.fence ?? 0) + 1
        };
        try {
          const response = existing
            ? await this.container.item(id, id).replace(candidate, { accessCondition: { type: "IfMatch", condition: _etag! } })
            : await this.container.items.create(candidate);
          lease = { key, record: { ...candidate, _etag: response.etag ?? response.resource?._etag }, serial: Promise.resolve() };
          break;
        } catch (error) {
          if (status(error) !== 409 && status(error) !== 412) throw error;
        }
      }
      if (this.now() >= deadline) throw new AiError("LEASE_BUSY", "Another worker owns this workflow.", true);
      await this.sleep(Math.min(500, Math.max(1, deadline - this.now())));
    }
    const active = lease;
    const timer = setInterval(() => { void this.update(active, {}).catch(() => {}); }, Math.floor(this.duration / 3));
    timer.unref?.();
    const context = new Map(this.contexts.getStore() ?? []);
    context.set(key, active);
    try {
      const result = await this.contexts.run(context, operation);
      await active.serial;
      if (active.lost || active.record.expiresAt <= this.now()) {
        throw active.lost ?? new AiError("LEASE_LOST", "Workflow lease expired.", true);
      }
      return result;
    } finally {
      clearInterval(timer);
      await active.serial;
      if (!active.lost) {
        const { _etag, ...record } = active.record;
        try {
          await this.container.item(record.id, record.partitionKey).replace({ ...record, owner: "", expiresAt: 0 }, {
            accessCondition: { type: "IfMatch", condition: _etag! }
          });
        } catch { /* Expiry permits takeover; a stale owner must never overwrite a newer lease. */ }
      }
    }
  }
}
