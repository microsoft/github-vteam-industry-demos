import { afterEach, describe, expect, it, vi } from "vitest";
import {
  api,
  ApiRequestError,
  isConcurrencyError,
  isResetRequiredError,
  retryDelaySeconds,
} from "../../src/web/api.js";

describe("public demo API UI helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses Retry-After before the rate reset header and rounds up", () => {
    const error = new ApiRequestError(
      429,
      "public_demo_rate_limited",
      "Public demo rate limit exceeded.",
      "correlation",
      2.2,
      9,
      0,
    );
    expect(retryDelaySeconds(error)).toBe(3);
  });

  it("falls back to the rate reset header for shared AI cooldown", () => {
    const error = new ApiRequestError(
      429,
      "public_demo_rate_limited",
      "Public demo rate limit exceeded.",
      "correlation",
      undefined,
      8,
      0,
    );
    expect(retryDelaySeconds(error)).toBe(8);
  });

  it("treats reset-required as a refreshable terminal workflow state", () => {
    const error = new ApiRequestError(
      409,
      "reset_required",
      "Reset the public demo before creating another proposal.",
    );
    expect(isResetRequiredError(error)).toBe(true);
    expect(isConcurrencyError(error)).toBe(true);
  });

  it("turns a stalled startup request into an actionable timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        })),
    );

    const assertion = expect(api.bootstrap()).rejects.toMatchObject({
      code: "request_timeout",
      message: expect.stringContaining("did not respond"),
    });
    await vi.advanceTimersByTimeAsync(12_000);
    await assertion;
  });
});
