import { SearchClient, type SearchOptions } from "@azure/search-documents";
import type { Citation, Opportunity } from "@proposal-factory/contracts";
import type { RetrievalAdapter } from "@proposal-factory/domain";
import type { AiConfig } from "./config.js";
import { createAzureCredential, validateVector } from "./azure-model.js";
import { AiError, classifyFailure, withRetry } from "./errors.js";
import { CORPUS_VERSION, validateChunk, type KnowledgeChunk } from "./knowledge.js";
import type { EmbeddingProvider, KnowledgeRetriever, RetrievalResult } from "./providers.js";
import type { RequirementsAnalysis } from "./schemas.js";

export interface SearchRequest {
  query: string;
  filter: string;
  top: number;
  vector?: number[];
  vectorK: number;
}
export interface SearchTransport {
  search(request: SearchRequest, signal: AbortSignal): Promise<Array<{ document: unknown; score: number }>>;
}

const sourceFields = ["id", "sourceId", "sourceVersion", "contentHash", "corpus", "status", "sourceType",
  "title", "kind", "scenario", "industries", "serviceTags", "body", "chunkOrdinal",
  "embeddingVersion", "embeddingDimensions"] as const;

export function createSearchTransport(config: AiConfig): SearchTransport {
  if (config.provider !== "azure") throw new AiError("WRONG_PROVIDER", "Azure Search transport requires azure mode.");
  const client = new SearchClient<KnowledgeChunk>(config.searchEndpoint, config.searchIndex, createAzureCredential(config), {
    serviceVersion: config.searchApiVersion, retryOptions: { maxRetries: 0 }
  });
  return {
    async search(request, signal) {
      const options: SearchOptions<KnowledgeChunk> = {
        filter: request.filter, top: request.top, select: [...sourceFields],
        queryType: "simple", searchMode: "any", searchFields: ["title", "body", "serviceTags"],
        abortSignal: signal,
        ...(request.vector ? { vectorSearchOptions: {
          filterMode: "preFilter" as const,
          queries: [{ kind: "vector" as const, vector: request.vector, fields: ["embedding"], kNearestNeighborsCount: request.vectorK }]
        } } : {})
      };
      const result = await client.search(request.query, options);
      const rows: Array<{ document: unknown; score: number }> = [];
      for await (const row of result.results) {
        rows.push({ document: row.document, score: row.score });
        if (rows.length >= request.top) break;
      }
      return rows;
    }
  };
}

export const odataString = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sharedIndustry = "Cross-industry";

function sourceApplicability(opportunity: Opportunity) {
  const serviceTag = opportunity.scenario.toLowerCase();
  const industrySpecific = opportunity.industry !== sharedIndustry;
  return {
    filter: [
      `scenario eq ${odataString(opportunity.scenario)}`,
      `(${industrySpecific ? `industries/any(i: i eq ${odataString(opportunity.industry)}) or ` : ""}` +
        `(industries/any(i: i eq ${odataString(sharedIndustry)}) and ` +
        `serviceTags/any(t: t eq ${odataString(serviceTag)})))`
    ].join(" and "),
    accepts: (chunk: KnowledgeChunk) => chunk.scenario === opportunity.scenario &&
      ((industrySpecific && chunk.industries.includes(opportunity.industry)) ||
        (chunk.industries.includes(sharedIndustry) && chunk.serviceTags.includes(serviceTag)))
  };
}

export function retrievalQuery(opportunity: Opportunity, requirements?: RequirementsAnalysis) {
  const text = [opportunity.scenario, opportunity.industry, opportunity.businessProblem, opportunity.scope,
    ...(requirements?.businessGoals ?? [])].join(" ");
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}]{2,40}/gu) ?? [];
  return [...new Set(tokens)].slice(0, 50).join(" ").slice(0, 1000);
}

export class AzureSearchRetrievalAdapter implements KnowledgeRetriever, RetrievalAdapter {
  constructor(private readonly config: AiConfig, private readonly transport: SearchTransport,
    private readonly embeddings?: EmbeddingProvider) {}

  async retrieve(opportunity: Opportunity, limit?: number) {
    return (await this.retrieveEvidence(opportunity, undefined, limit)).citations;
  }

  async retrieveEvidence(opportunity: Opportunity, requirements?: RequirementsAnalysis, limit = this.config.topK): Promise<RetrievalResult> {
    if (!Number.isInteger(limit) || limit < 1 || limit > this.config.topK) throw new AiError("INVALID_LIMIT", "Retrieval limit exceeds the configured bound.");
    const query = retrievalQuery(opportunity, requirements);
    const warnings: string[] = [];
    const fallbacks: string[] = [];
    let vector: number[] | undefined;
    if (this.config.embeddingsEnabled && this.embeddings) {
      try { vector = validateVector(await this.embeddings.embed(query), this.config.embeddingDimensions); }
      catch (error) {
        if (!classifyFailure(error).retryable) throw error;
        const warning = "Embeddings temporarily unavailable; explicit keyword-only retrieval was used.";
        warnings.push(warning);
        fallbacks.push(warning);
      }
    } else warnings.push("Embeddings are disabled or not configured; explicit keyword-only retrieval was used.");
    const applicability = sourceApplicability(opportunity);
    const filter = [
      `corpus eq ${odataString(CORPUS_VERSION)}`, "status eq 'published'", "sourceType eq 'synthetic'",
      applicability.filter
    ].join(" and ");
    const rows = await withRetry((signal) => this.transport.search({
      query, filter, top: limit, vectorK: this.config.vectorK, ...(vector ? { vector } : {})
    }, signal), this.config);
    const citations: Citation[] = [];
    const seen = new Set<string>();
    for (const row of rows.slice(0, limit)) {
      const chunk = validateChunk(row.document);
      if (!applicability.accepts(chunk)) {
        throw new AiError("INVALID_SOURCE", "Search result violated application-owned source filters.");
      }
      if (vector && chunk.embeddingVersion && (chunk.embeddingVersion !== this.config.embeddingVersion ||
          chunk.embeddingDimensions !== this.config.embeddingDimensions)) {
        throw new AiError("INVALID_SOURCE", "Search evidence has incompatible embedding metadata; reindex before hybrid retrieval.");
      }
      if (!Number.isFinite(row.score) || row.score < 0) throw new AiError("INVALID_SOURCE", "Search relevance score is invalid.");
      if (seen.has(chunk.id)) continue;
      seen.add(chunk.id);
      citations.push({
        id: `citation-${chunk.id}-${chunk.contentHash.slice(0, 12)}`,
        contentId: chunk.sourceId, title: chunk.title, kind: chunk.kind,
        excerpt: chunk.body, relevance: Math.min(100, Math.round(row.score * 100) / 100)
      });
    }
    if (citations.length === 0) warnings.push("No matching organizational evidence was retrieved. Drafting must disclose this limitation.");
    return {
      citations,
      mode: vector ? "hybrid" : "keyword",
      warnings,
      activity: {
        successfulRetrievalOperations: 1,
        successfulEmbeddingOperations: vector ? 1 : 0,
        fallbacks,
        searchIndex: this.config.searchIndex,
        ...(vector ? { embeddingDeployment: this.config.embeddingDeployment } : {})
      }
    };
  }

  async preview(opportunity: Opportunity, limit?: number) {
    const { citations, mode, warnings } = await this.retrieveEvidence(opportunity, undefined, limit);
    return { citations, mode, warnings };
  }
}
