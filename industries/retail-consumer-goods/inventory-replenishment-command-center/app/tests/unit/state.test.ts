import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileStateStore,
  StateConflictError,
  initialState,
} from "../../src/server/state.js";

const statePath = resolve("data", `unit-state-${process.pid}.json`);

afterEach(async () => {
  await rm(statePath, { force: true });
  await rm(`${statePath}.next`, { force: true });
});

describe("file state persistence", () => {
  it("persists deterministic reset state across store instances", async () => {
    const first = new FileStateStore(statePath);
    const initial = await first.read();
    const reset = initialState(initial.state.resetCount + 1);
    await first.write(reset, initial.etag);

    const reopened = await new FileStateStore(statePath).read();
    expect(reopened.state).toEqual(reset);
    expect(reopened.etag).not.toBe(initial.etag);
  });

  it("rejects a stale local ETag", async () => {
    const store = new FileStateStore(statePath);
    const initial = await store.read();
    await store.write(initialState(1), initial.etag);

    await expect(store.write(initialState(2), initial.etag)).rejects.toBeInstanceOf(
      StateConflictError,
    );
  });
});
