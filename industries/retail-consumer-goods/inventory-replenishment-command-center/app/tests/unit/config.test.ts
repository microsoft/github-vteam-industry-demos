import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/server/config.js";

describe("Azure authentication configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("does not silently fall back when Azure auth mode is missing", () => {
    vi.stubEnv("APP_AUTH_MODE", "");
    expect(() => loadConfig("azure")).toThrow(/explicit APP_AUTH_MODE/);
  });

  it("requires an exact HTTPS origin for public-demo mode", () => {
    vi.stubEnv("APP_AUTH_MODE", "public-demo");
    vi.stubEnv("PUBLIC_DEMO_ORIGIN", "");
    expect(() => loadConfig("azure")).toThrow(/PUBLIC_DEMO_ORIGIN is required/);
    vi.stubEnv("PUBLIC_DEMO_ORIGIN", "https://demo.example/path");
    expect(() => loadConfig("azure")).toThrow(/exact HTTPS origin/);
  });

  it("keeps the authenticated Azure rollback path separate", () => {
    vi.stubEnv("APP_AUTH_MODE", "azure");
    vi.stubEnv("APP_STATE_MODE", "blob");
    expect(loadConfig("azure").authMode).toBe("azure");
  });
});
