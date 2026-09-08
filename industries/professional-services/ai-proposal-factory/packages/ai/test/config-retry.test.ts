import { describe, expect, it, vi } from "vitest";
import { AiConfigurationError, loadAiConfig } from "../src/config.js";
import { AiError, classifyFailure, withRetry } from "../src/errors.js";

describe("explicit provider configuration", () => {
  it("defaults to deterministic fixture mode and the Sweden deployment baseline", () => {
    expect(loadAiConfig({})).toMatchObject({
      provider: "fixture", region: "swedencentral", generationDeployment: "proposal-chat",
      embeddingDeployment: "proposal-embeddings", searchIndex: "proposal-knowledge-v1"
    });
  });
  it.each([
    { AI_PROVIDER: "automatic" }, { AI_PROVIDER: "" }, { AI_PROVIDER: "azure" },
    { AZURE_LOCATION: "uksouth" }, { AZURE_OPENAI_API_VERSION: "2024-10-21" },
    { AZURE_SEARCH_API_VERSION: "preview" }, { AZURE_SEARCH_INDEX: "Wrong Index" },
    { AZURE_OPENAI_GENERATION_DEPLOYMENT: "" }, { AZURE_OPENAI_EMBEDDING_DEPLOYMENT: "../model" },
    { AI_EMBEDDINGS_ENABLED: "yes" }, { AI_EMBEDDING_DIMENSIONS: "4000" }, { AI_RETRIEVAL_TOP_K: "0" },
    { AI_VECTOR_K: "1" }, { AI_MAX_RETRIES: "99" }, { AI_REQUEST_TIMEOUT_MS: "NaN" },
    { AI_MAX_INPUT_TOKENS: "60000" }, { AI_RETRY_BASE_MS: "10000", AI_RETRY_MAX_MS: "500" },
    { AZURE_CLIENT_ID: "not-a-client-id" },
    { AZURE_OPENAI_ENDPOINT: "http://example.openai.azure.com" },
    { AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com/openai/v1/" },
    { AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com.evil.test" },
    { AZURE_OPENAI_ENDPOINT: "https://user:password@example.openai.azure.com" },
    { AZURE_SEARCH_ENDPOINT: "https://example.search.windows.net?key=not-a-key" }
  ])("rejects invalid configuration %j", (env) => {
    expect(() => loadAiConfig(env)).toThrow(AiConfigurationError);
  });
  it("accepts exact root endpoints without making network calls", () => {
    expect(loadAiConfig({
      AI_PROVIDER: "azure", AZURE_OPENAI_ENDPOINT: "https://demo.openai.azure.com/",
      AZURE_SEARCH_ENDPOINT: "https://demo.search.windows.net",
      AZURE_CLIENT_ID: "11111111-2222-3333-4444-555555555555"
    }).provider).toBe("azure");
  });
});

describe("bounded retries", () => {
  const config = { timeoutMs: 1000, maxRetries: 2, retryBaseMs: 10, retryMaxMs: 100 };
  it("classifies Cosmos throttling and stale revisions separately", () => {
    expect(classifyFailure({ code: 429 })).toEqual({ code: "THROTTLED", retryable: true });
    expect(classifyFailure({ code: 412 })).toEqual({ code: "STALE_REVISION", retryable: false });
  });
  it.each([429, 408, 409, 500, 503])("classifies HTTP %i as retryable", (status) => {
    expect(classifyFailure({ status }).retryable).toBe(true);
  });
  it.each([400, 401, 403, 404, 422])("does not retry HTTP %i", (statusCode) => {
    expect(classifyFailure({ statusCode }).retryable).toBe(false);
  });
  it("honors throttling headers, retries at one layer, and eventually succeeds", async () => {
    const operation = vi.fn().mockRejectedValueOnce({ status: 429, headers: new Headers({ "retry-after-ms": "50" }) }).mockResolvedValue("done");
    const sleep = vi.fn().mockResolvedValue(undefined);
    expect(await withRetry(operation, config, sleep, () => 0)).toBe("done");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(50);
  });
  it("does not retry sooner than a long provider cooldown", async () => {
    const operation = vi.fn().mockRejectedValue({ status: 429, headers: { "retry-after": "60" } });
    await expect(withRetry(operation, config)).rejects.toMatchObject({ code: "THROTTLED", retryable: true });
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it("honors Retry-After on Azure SDK RestError response headers", async () => {
    const operation = vi.fn().mockRejectedValueOnce({
      statusCode: 429, response: { headers: { get: (key: string) => key === "retry-after-ms" ? "75" : undefined } }
    }).mockResolvedValue("done");
    const sleep = vi.fn().mockResolvedValue(undefined);
    expect(await withRetry(operation, config, sleep)).toBe("done");
    expect(sleep).toHaveBeenCalledWith(75);
  });
  it("stops at the retry bound and redacts provider response details", async () => {
    const operation = vi.fn().mockRejectedValue({ status: 503, message: "sensitive uploaded text" });
    await expect(withRetry(operation, config, async () => {})).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(operation).toHaveBeenCalledTimes(3);
  });
  it("does not retry validation errors", async () => {
    const operation = vi.fn().mockRejectedValue(new AiError("INVALID_MODEL_OUTPUT", "invalid"));
    await expect(withRetry(operation, config)).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it("aborts a request that exceeds its timeout", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const result = withRetry((received) => { signal = received; return new Promise(() => {}); }, { ...config, maxRetries: 0 });
    const assertion = expect(result).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    expect(signal?.aborted).toBe(true);
    vi.useRealTimers();
  });
});
