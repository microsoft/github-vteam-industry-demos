import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchClient } from "@azure/search-documents";
import { createSearchTransport } from "../src/retrieval.js";
import { createSeedIndexPort } from "../src/ingestion.js";
import { loadAiConfig } from "../src/config.js";
import { chunk } from "./fixtures.js";

const config = loadAiConfig({
  AI_PROVIDER: "azure", AZURE_OPENAI_ENDPOINT: "https://offline.openai.azure.com",
  AZURE_SEARCH_ENDPOINT: "https://offline.search.windows.net"
});
afterEach(() => vi.restoreAllMocks());

describe("installed Azure Search SDK wire boundary (offline)", () => {
  it("sends a prefiltered vector query with projection and simple keyword search", async () => {
    const search = vi.spyOn(SearchClient.prototype, "search").mockResolvedValue({
      results: (async function* () { yield { document: chunk, score: 1 }; })()
    } as never);
    const adapter = createSearchTransport(config);
    const signal = new AbortController().signal;
    await adapter.search({ query: "knowledge pilot", filter: "status eq 'published'", top: 8, vectorK: 30, vector: [0.25] }, signal);
    expect(search).toHaveBeenCalledWith("knowledge pilot", expect.objectContaining({
      abortSignal: signal, top: 8, queryType: "simple", filter: "status eq 'published'",
      vectorSearchOptions: {
        filterMode: "preFilter",
        queries: [{ kind: "vector", vector: [0.25], fields: ["embedding"], kNearestNeighborsCount: 30 }]
      }
    }));
    expect(search.mock.calls[0]![1]?.select).not.toContain("embedding");
  });
  it("classifies failed per-document indexing actions even after an HTTP success", async () => {
    const upload = vi.spyOn(SearchClient.prototype, "uploadDocuments").mockResolvedValue({
      results: [{ key: chunk.id, succeeded: false, statusCode: 429 }]
    });
    await expect(createSeedIndexPort(config).upload([chunk], new AbortController().signal))
      .rejects.toMatchObject({ code: "INDEXING_FAILED", retryable: true });
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
