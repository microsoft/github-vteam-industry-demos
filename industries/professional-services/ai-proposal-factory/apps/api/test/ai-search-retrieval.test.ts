import { DefaultAzureCredential } from "@azure/identity";
import { SearchClient } from "@azure/search-documents";
import {
  AzureSearchRetrievalAdapter, chunkContent, createSearchTransport, loadAiConfig, odataString,
  type KnowledgeChunk
} from "@proposal-factory/ai";
import type { Opportunity } from "@proposal-factory/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFixtureContent, createFixtureOpportunities } from "../src/fixtures.js";

const config = loadAiConfig({
  AI_PROVIDER: "azure", AZURE_OPENAI_ENDPOINT: "https://offline.openai.azure.com",
  AZURE_SEARCH_ENDPOINT: "https://offline.search.windows.net", AI_EMBEDDINGS_ENABLED: "false", AI_MAX_RETRIES: "0"
});
const content = createFixtureContent();
const scenarios = createFixtureOpportunities().filter((_, index) => index % 2 === 0);
const cases = scenarios.flatMap((opportunity) => [
  { label: `${opportunity.scenario}: seeded industry`, opportunity },
  { label: `${opportunity.scenario}: new industry`, opportunity: { ...opportunity, industry: "Aerospace" } }
]);

beforeEach(() => {
  vi.spyOn(DefaultAzureCredential.prototype, "getToken").mockRejectedValue(new Error("Network forbidden in offline tests."));
});
afterEach(() => vi.restoreAllMocks());

function expectedFilter(opportunity: Opportunity) {
  return `corpus eq 'synthetic-v1' and status eq 'published' and sourceType eq 'synthetic' and ` +
    `scenario eq ${odataString(opportunity.scenario)} and ` +
    `(industries/any(i: i eq ${odataString(opportunity.industry)}) or ` +
    `(industries/any(i: i eq 'Cross-industry') and serviceTags/any(t: t eq ${odataString(opportunity.scenario.toLowerCase())})))`;
}

function searchResults(documents: unknown[]) {
  return { results: (async function* () {
    for (const document of documents) yield { document, score: 1 };
  })() } as never;
}

describe("seeded corpus through the production Azure Search retrieval transport (offline)", () => {
  it.each(cases)("admits applicable shared methodology and pricing: $label", async ({ opportunity }) => {
    const eligible = content.filter((item) => item.scenario === opportunity.scenario &&
      (item.industries.includes(opportunity.industry) ||
        (item.industries.includes("Cross-industry") && item.tags.includes(opportunity.scenario.toLowerCase()))));
    const shared = eligible.filter((item) => item.kind === "Delivery Methodology" || item.kind === "Pricing Assumption");
    const others = eligible.filter((item) => !shared.includes(item));
    const documents = [...shared, ...others].flatMap(chunkContent).slice(0, config.topK);
    const search = vi.spyOn(SearchClient.prototype, "search").mockImplementation(async (_query, options) => {
      expect(options).toMatchObject({ filter: expectedFilter(opportunity), top: 8, queryType: "simple" });
      expect(options).not.toHaveProperty("vectorSearchOptions");
      return searchResults(documents);
    });
    const result = await new AzureSearchRetrievalAdapter(config, createSearchTransport(config)).retrieveEvidence(opportunity);
    expect(search).toHaveBeenCalledTimes(1);
    expect(shared.map((item) => item.kind).sort()).toEqual(["Delivery Methodology", "Pricing Assumption"]);
    expect(result.citations.map((citation) => citation.contentId)).toEqual(documents.map((chunk) => chunk.sourceId));
    for (const item of shared) {
      expect(result.citations).toContainEqual(expect.objectContaining({ contentId: item.id, excerpt: item.body }));
    }
    expect(result.citations.length).toBeLessThanOrEqual(config.topK);
    if (opportunity.industry === "Aerospace") {
      expect(result.citations.some((citation) => citation.kind === "Case Study")).toBe(false);
      expect(result.citations).toHaveLength(7);
    }
  });

  it("uses the same restricted applicability for hybrid prefiltering and escapes a new industry", async () => {
    const opportunity = { ...scenarios[0]!, industry: "O'Brien') or true or ('x" };
    const shared = content.find((item) => item.id === "method-1")!;
    const search = vi.spyOn(SearchClient.prototype, "search").mockResolvedValue(searchResults(chunkContent(shared)));
    const embeddings = { embed: vi.fn().mockResolvedValue(new Array(3072).fill(0.25)) };
    const result = await new AzureSearchRetrievalAdapter({ ...config, embeddingsEnabled: true },
      createSearchTransport(config), embeddings).retrieveEvidence(opportunity);
    expect(result.mode).toBe("hybrid");
    expect(result.citations[0]?.contentId).toBe("method-1");
    expect(search.mock.calls[0]![1]).toMatchObject({
      filter: expectedFilter(opportunity),
      vectorSearchOptions: { filterMode: "preFilter", queries: [
        { kind: "vector", fields: ["embedding"], kNearestNeighborsCount: 30, vector: expect.any(Array) }
      ] }
    });
    expect(embeddings.embed).toHaveBeenCalledTimes(1);
  });

  const method = content.find((item) => item.id === "method-1")!;
  const original = chunkContent(method)[0]!;
  const mismatches: Array<[string, unknown]> = [
    ["another industry without explicit sharing", chunkContent({ ...method, industries: ["Financial Services"] })[0]],
    ["shared marker without a service tag", chunkContent({ ...method, tags: ["discover", "deliver"] })[0]],
    ["shared marker with the wrong service", chunkContent({ ...method, tags: ["ai adoption"] })[0]],
    ["wrong scenario even with the matching service tag", chunkContent({ ...method, scenario: "AI adoption" })[0]],
    ["case-sensitive sharing marker", chunkContent({ ...method, industries: ["cross-industry"] })[0]],
    ["private/other corpus", { ...original, corpus: "tenant-other" }],
    ["unpublished source", { ...original, status: "draft" }],
    ["uploaded customer document", { ...original, sourceType: "uploaded" }],
    ["private source", { ...original, sourceType: "private" }],
    ["tampered provenance", { ...original, sourceId: "other-source" }],
    ["tampered body", { ...original, body: "Unverified customer commitment." }]
  ];
  it.each(mismatches)("rejects transport results violating isolation: %s", async (_label, document) => {
    const opportunity = scenarios[0]!;
    vi.spyOn(SearchClient.prototype, "search").mockImplementation(async (_query, options) => {
      expect(options?.filter).toBe(expectedFilter(opportunity));
      return searchResults([document]);
    });
    await expect(new AzureSearchRetrievalAdapter(config, createSearchTransport(config)).retrieveEvidence(opportunity))
      .rejects.toMatchObject({ code: "INVALID_SOURCE" });
  });

  it("keeps existing exact-industry sources eligible without demanding a new shared-content tag", async () => {
    const document = chunkContent({ ...method, industries: ["Retail"], tags: ["discover"] })[0]!;
    vi.spyOn(SearchClient.prototype, "search").mockResolvedValue(searchResults([document]));
    const citations = await new AzureSearchRetrievalAdapter(config, createSearchTransport(config)).retrieve(scenarios[0]!);
    expect(citations[0]?.contentId).toBe(method.id);
  });

  it("does not let an opportunity using the shared marker bypass service applicability", async () => {
    const opportunity = { ...scenarios[0]!, industry: "Cross-industry" };
    const search = vi.spyOn(SearchClient.prototype, "search").mockResolvedValue(searchResults([original]));
    const adapter = new AzureSearchRetrievalAdapter(config, createSearchTransport(config));
    expect((await adapter.retrieve(opportunity))[0]?.contentId).toBe(method.id);
    expect(search.mock.calls[0]![1]?.filter).toBe(
      "corpus eq 'synthetic-v1' and status eq 'published' and sourceType eq 'synthetic' and " +
      "scenario eq 'Cloud modernization' and " +
      "((industries/any(i: i eq 'Cross-industry') and serviceTags/any(t: t eq 'cloud modernization')))"
    );
    search.mockResolvedValue(searchResults(chunkContent({ ...method, tags: ["ai adoption"] })));
    await expect(adapter.retrieve(opportunity)).rejects.toMatchObject({ code: "INVALID_SOURCE" });
  });

  it("still rejects incompatible vector provenance on a shared source", async () => {
    const document: KnowledgeChunk = { ...original, embeddingVersion: "other-model", embeddingDimensions: 1536 };
    vi.spyOn(SearchClient.prototype, "search").mockResolvedValue(searchResults([document]));
    await expect(new AzureSearchRetrievalAdapter({ ...config, embeddingsEnabled: true }, createSearchTransport(config),
      { embed: async () => new Array(3072).fill(0.25) }).retrieve(scenarios[0]!))
      .rejects.toMatchObject({ code: "INVALID_SOURCE" });
  });
});
