import { afterEach, describe, expect, it, vi } from "vitest";
import { CosmosCheckpointStore } from "../src/cosmos-checkpoints.js";
import type { AiCheckpoint } from "../src/orchestration.js";
import { memoryCosmosContainer } from "./mock-cosmos.js";

const checkpoint: AiCheckpoint = {
  schemaVersion: 1, jobId: "job-01", inputHash: "hash", provider: "fixture", promptVersion: "test", completedStages: []
};
afterEach(() => vi.useRealTimers());

describe("Cosmos exclusive checkpoint leases", () => {
  it("requires lease ownership for writes and survives a new process instance", async () => {
    const { container } = memoryCosmosContainer();
    const first = new CosmosCheckpointStore(container);
    await expect(first.save(checkpoint)).rejects.toMatchObject({ code: "LEASE_REQUIRED" });
    await first.exclusive(checkpoint.jobId, () => first.save(checkpoint));
    expect(await new CosmosCheckpointStore(container).load(checkpoint.jobId)).toEqual(checkpoint);
  });
  it("excludes a second replica and releases ownership when the operation throws", async () => {
    const { container } = memoryCosmosContainer();
    const first = new CosmosCheckpointStore(container, { acquireTimeoutMs: 0 });
    const second = new CosmosCheckpointStore(container, { acquireTimeoutMs: 0 });
    await first.exclusive("job-01", async () => {
      await expect(second.exclusive("job-01", async () => "bad")).rejects.toMatchObject({ code: "LEASE_BUSY" });
    });
    await expect(first.exclusive("job-01", async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    expect(await second.exclusive("job-01", async () => "recovered")).toBe("recovered");
  });
  it("renews a long-running operation without changing its fencing generation", async () => {
    vi.useFakeTimers();
    const { container, records } = memoryCosmosContainer();
    const state = new CosmosCheckpointStore(container, { durationMs: 15000 });
    await state.exclusive("job-01", async () => {
      const before = [...records.values()][0]!;
      await vi.advanceTimersByTimeAsync(6000);
      const after = [...records.values()][0]!;
      expect(after.expiresAt).toBeGreaterThan(before.expiresAt);
      expect(after.fence).toBe(before.fence);
      await state.save(checkpoint);
    });
  });
  it("fences stale checkpoint writes after expiry and another replica takes over", async () => {
    vi.useFakeTimers();
    const { container } = memoryCosmosContainer();
    const first = new CosmosCheckpointStore(container, { durationMs: 15000, clockSkewMs: 0, acquireTimeoutMs: 0 });
    const second = new CosmosCheckpointStore(container, { durationMs: 15000, clockSkewMs: 0, acquireTimeoutMs: 0 });
    await expect(first.exclusive("job-01", async () => {
      vi.setSystemTime(Date.now() + 16000);
      await second.exclusive("job-01", () => second.save({ ...checkpoint, inputHash: "new-owner" }));
      await first.save(checkpoint);
    })).rejects.toMatchObject({ code: "LEASE_LOST" });
    expect((await second.load("job-01"))?.inputHash).toBe("new-owner");
  });
  it("supports nested distinct locks and keeps values with their own fenced record", async () => {
    const { container } = memoryCosmosContainer();
    const state = new CosmosCheckpointStore(container);
    await state.exclusive("opportunity-01", async () => {
      await state.writeValue("opportunity-01", { jobId: "job-01" });
      await state.exclusive("job-01", () => state.save(checkpoint));
      await state.assertLease("opportunity-01");
    });
    expect(await state.readValue("opportunity-01")).toEqual({ jobId: "job-01" });
  });
  it("fails closed when lease renewal fails and validates lease settings", async () => {
    const { container } = memoryCosmosContainer();
    expect(() => new CosmosCheckpointStore(container, { durationMs: 1 })).toThrow();
    const state = new CosmosCheckpointStore(container);
    await expect(state.exclusive("job-01", async () => {
      vi.spyOn(container, "item").mockReturnValue({
        replace: async () => { throw { code: 503 }; }
      } as never);
      await state.save(checkpoint);
    })).rejects.toMatchObject({ code: "LEASE_LOST", retryable: true });
  });
});
