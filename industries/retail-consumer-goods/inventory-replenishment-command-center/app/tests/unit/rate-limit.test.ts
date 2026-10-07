import { describe, expect, it } from "vitest";
import {
  ConcurrencyGuard,
  SlidingWindowRateLimiter,
} from "../../src/server/rate-limit.js";
import { PUBLIC_DEMO_LIMITS } from "../../src/server/app.js";

describe("public demo rate primitives", () => {
  it("pins the approved public limits", () => {
    expect(PUBLIC_DEMO_LIMITS).toEqual({
      reads: { client: 120, global: 600, windowMs: 60_000 },
      ai: { client: 6, global: 30, windowMs: 600_000 },
      workflow: { client: 30, global: 150, windowMs: 600_000 },
      reset: { client: 3, global: 20, windowMs: 600_000 },
    });
  });

  it("uses deterministic sliding windows for client and global scopes", () => {
    let now = 1_000_000;
    const limiter = new SlidingWindowRateLimiter(() => now);
    const rules = [
      { bucket: "ai", scope: "client:a", limit: 2, windowMs: 10_000 },
      { bucket: "ai", scope: "global", limit: 3, windowMs: 10_000 },
    ];
    expect(limiter.attempt(rules)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.attempt(rules)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.attempt(rules)).toMatchObject({
      allowed: false,
      limit: 2,
      remaining: 0,
      retryAfterSeconds: 10,
    });
    now += 10_001;
    expect(limiter.attempt(rules)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("keeps a global fallback effective when client extraction is unavailable", () => {
    const limiter = new SlidingWindowRateLimiter(() => 5_000);
    const first = limiter.attempt([
      { bucket: "reset", scope: "client:unavailable", limit: 3, windowMs: 600_000 },
      { bucket: "reset", scope: "global", limit: 1, windowMs: 600_000 },
    ]);
    const second = limiter.attempt([
      { bucket: "reset", scope: "client:unavailable", limit: 3, windowMs: 600_000 },
      { bucket: "reset", scope: "global", limit: 1, windowMs: 600_000 },
    ]);
    expect(first.allowed).toBe(true);
    expect(second).toMatchObject({ allowed: false, limit: 1, remaining: 0 });
  });

  it("caps and safely releases concurrent work", () => {
    const guard = new ConcurrencyGuard(2);
    const releaseFirst = guard.tryAcquire();
    const releaseSecond = guard.tryAcquire();
    expect(releaseFirst).not.toBeNull();
    expect(releaseSecond).not.toBeNull();
    expect(guard.tryAcquire()).toBeNull();
    releaseFirst!();
    releaseFirst!();
    expect(guard.current).toBe(1);
    expect(guard.tryAcquire()).not.toBeNull();
  });
});
