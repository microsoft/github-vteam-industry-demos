import { describe, expect, it, vi } from "vitest";
import { loadAiConfig } from "../src/config.js";
import { AiError } from "../src/errors.js";
import { SeedIndexingService, knowledgeIndexSchema, type SeedIndexPort } from "../src/ingestion.js";
import { chunkContent, type KnowledgeChunk } from "../src/knowledge.js";
import { AzureSearchRetrievalAdapter, type SearchTransport } from "../src/retrieval.js";
import { chunk, opportunity, source } from "./fixtures.js";

const config = loadAiConfig({ AI_MAX_RETRIES: "0" });
const port = (rows: Array<{ document: unknown; score: number }> = [{ document: chunk, score: 0.8 }]): SearchTransport => ({ search: vi.fn().mockResolvedValue(rows) });
const embeddings = () => ({ embed: vi.fn().mockResolvedValue(new Array(3072).fill(0.2)) });

describe("bounded Azure Search retrieval", () => {
  it("uses server-side corpus, scenario and industry filters and bounded hybrid input", async () => {
    const search = port();
    const result = await new AzureSearchRetrievalAdapter(config, search, embeddings()).retrieveEvidence(opportunity);
    const request = vi.mocked(search.search).mock.calls[0]![0];
    expect(request).toMatchObject({ top: 8, vectorK: 30 });
    expect(request.filter).toContain("corpus eq 'synthetic-v1'");
    expect(request.filter).toContain("scenario eq 'AI adoption'");
    expect(request.filter).toContain("industries/any(i: i eq 'Consulting')");
    expect(request.vector).toHaveLength(3072);
    expect(result.mode).toBe("hybrid");
    expect(result.citations[0]).toMatchObject({ contentId: source.id, excerpt: source.body });
    expect(result.activity).toEqual({
      successfulRetrievalOperations: 1,
      successfulEmbeddingOperations: 1,
      fallbacks: [],
      searchIndex: "proposal-knowledge-v1",
      embeddingDeployment: "proposal-embeddings"
    });
  });
  it("quotes OData values and strips search syntax from customer input", async () => {
    const search = port([]);
    await new AzureSearchRetrievalAdapter(config, search).retrieveEvidence({
      ...opportunity, industry: "O'Brien' or true or 'x", businessProblem: '* OR title:(secret) "quoted"'
    });
    const request = vi.mocked(search.search).mock.calls[0]![0];
    expect(request.filter).toContain("O''Brien'' or true or ''x");
    expect(request.query).not.toMatch(/[*():"]/);
    expect(request.query.length).toBeLessThanOrEqual(1000);
  });
  it("explicitly reports keyword-only mode when embeddings are disabled", async () => {
    const search = port();
    const embedding = embeddings();
    const result = await new AzureSearchRetrievalAdapter({ ...config, embeddingsEnabled: false }, search, embedding).retrieveEvidence(opportunity);
    expect(result.mode).toBe("keyword");
    expect(result.warnings.join(" ")).toContain("disabled");
    expect(embedding.embed).not.toHaveBeenCalled();
    expect(vi.mocked(search.search).mock.calls[0]![0]).not.toHaveProperty("vector");
  });
  it("allows keyword fallback only for transient embedding failures", async () => {
    const embedding = { embed: vi.fn().mockRejectedValue(new AiError("THROTTLED", "rate limited", true)) };
    const fallback = await new AzureSearchRetrievalAdapter(config, port(), embedding).retrieveEvidence(opportunity);
    expect(fallback.mode).toBe("keyword");
    expect(fallback.activity).toMatchObject({
      successfulRetrievalOperations: 1,
      successfulEmbeddingOperations: 0,
      fallbacks: ["Embeddings temporarily unavailable; explicit keyword-only retrieval was used."]
    });
    expect(fallback.activity).not.toHaveProperty("embeddingDeployment");
    embedding.embed.mockRejectedValue(new AiError("PROVIDER_AUTHORIZATION", "forbidden"));
    const search = port();
    await expect(new AzureSearchRetrievalAdapter(config, search, embedding).retrieveEvidence(opportunity))
      .rejects.toMatchObject({ code: "PROVIDER_AUTHORIZATION" });
    expect(search.search).not.toHaveBeenCalled();
  });
  it("does not mask Search failures, malformed sources, or cross-scenario evidence", async () => {
    const search = port();
    vi.mocked(search.search).mockRejectedValue({ statusCode: 403 });
    await expect(new AzureSearchRetrievalAdapter(config, search).retrieveEvidence(opportunity)).rejects.toMatchObject({ code: "PROVIDER_AUTHORIZATION" });
    for (const document of [{ ...chunk, body: "tampered" }, { ...chunk, id: "untrusted" }, { ...chunk, corpus: "other" }]) {
      await expect(new AzureSearchRetrievalAdapter(config, port([{ document, score: 1 }])).retrieveEvidence(opportunity))
        .rejects.toMatchObject({ code: "INVALID_SOURCE" });
    }
    await expect(new AzureSearchRetrievalAdapter(config, port()).retrieveEvidence({ ...opportunity, industry: "Other" }))
      .rejects.toMatchObject({ code: "INVALID_SOURCE" });
  });
  it("returns empty evidence visibly and rejects an unbounded limit", async () => {
    const adapter = new AzureSearchRetrievalAdapter(config, port([]));
    expect(await adapter.retrieveEvidence(opportunity)).toMatchObject({ citations: [], mode: "keyword" });
    expect((await adapter.retrieveEvidence(opportunity)).warnings.join(" ")).toContain("No matching");
    await expect(adapter.retrieve(opportunity, 100)).rejects.toMatchObject({ code: "INVALID_LIMIT" });
  });
  it("bounds malicious transport rows and deduplicates chunk citations", async () => {
    const search: SearchTransport = { search: async () => Array.from({ length: 100 }, () => ({ document: chunk, score: 1 })) };
    expect(await new AzureSearchRetrievalAdapter(config, search).retrieve(opportunity)).toHaveLength(1);
  });
});

describe("idempotent synthetic indexing", () => {
  function indexPort() {
    const values = new Map<string, KnowledgeChunk>();
    const index: SeedIndexPort = {
      listSource: vi.fn(async (id) => [...values.values()].filter((item) => item.sourceId === id)),
      upload: vi.fn(async (chunks: KnowledgeChunk[]) => { chunks.forEach((item) => values.set(item.id, structuredClone(item))); }),
      delete: vi.fn(async (ids: string[]) => { ids.forEach((id) => values.delete(id)); })
    };
    return { index, values };
  }
  it("creates a matching nonsemantic Basic-compatible vector schema", () => {
    const schema = knowledgeIndexSchema(config);
    expect(schema.name).toBe("proposal-knowledge-v1");
    expect(schema.fields.find((field) => field.name === "embedding")).toMatchObject({
      vectorSearchDimensions: 3072, vectorSearchProfileName: "proposal-vector-profile"
    });
    expect(schema).not.toHaveProperty("semanticSearch");
  });
  it("preserves stable IDs, versioning and tags; skips unchanged embedding work", async () => {
    const { index, values } = indexPort();
    const embedding = embeddings();
    const service = new SeedIndexingService(config, index, embedding);
    expect(await service.seed([source])).toMatchObject({ uploaded: 1, skipped: 0, mode: "hybrid" });
    expect(await service.seed([source])).toMatchObject({ uploaded: 0, skipped: 1 });
    expect(embedding.embed).toHaveBeenCalledTimes(1);
    expect(values.get(chunk.id)).toMatchObject({
      sourceId: source.id, sourceVersion: source.updatedAt, industries: ["Consulting"],
      serviceTags: ["AI", "advisory"], embeddingVersion: "text-embedding-3-large:1", embeddingDimensions: 3072
    });
    expect(chunkContent(source)).toEqual(chunkContent(source));
  });
  it("reindexes changed content and deletes only stale chunks for that source", async () => {
    const { index, values } = indexPort();
    const service = new SeedIndexingService({ ...config, embeddingsEnabled: false }, index);
    await service.seed([{ ...source, body: "a".repeat(5000) }]);
    expect(values.size).toBeGreaterThan(1);
    expect(await service.seed([source])).toMatchObject({ uploaded: 1, deleted: 2, mode: "keyword" });
    expect(values.size).toBe(1);
    expect(values.get(chunk.id)?.embedding).toEqual([]);
  });
  it("fails closed for missing embeddings, duplicate seeds and partial indexing errors", async () => {
    const { index } = indexPort();
    await expect(new SeedIndexingService(config, index).seed([source])).rejects.toMatchObject({ code: "EMBEDDINGS_NOT_CONFIGURED" });
    await expect(new SeedIndexingService(config, index, embeddings()).seed([source, source])).rejects.toMatchObject({ code: "INVALID_SOURCE" });
    vi.mocked(index.upload).mockRejectedValue(new AiError("INDEXING_FAILED", "partial", true));
    await expect(new SeedIndexingService(config, index, embeddings()).seed([source])).rejects.toMatchObject({ code: "INDEXING_FAILED" });
    expect(index.delete).not.toHaveBeenCalled();
  });
});
