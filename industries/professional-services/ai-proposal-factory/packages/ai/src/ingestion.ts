import { SearchClient, SearchIndexClient, type SearchField, type SearchIndex, type SimpleField } from "@azure/search-documents";
import type { ReusableContent } from "@proposal-factory/contracts";
import type { AiConfig } from "./config.js";
import { createAzureCredential, validateVector } from "./azure-model.js";
import { AiError, withRetry } from "./errors.js";
import { chunkContent, CORPUS_VERSION, type KnowledgeChunk } from "./knowledge.js";
import type { EmbeddingProvider } from "./providers.js";
import { odataString } from "./retrieval.js";

export function knowledgeIndexSchema(config: AiConfig): SearchIndex {
  const filterable = ["sourceId", "sourceVersion", "corpus", "status", "sourceType", "kind", "scenario", "embeddingVersion"];
  const fields: SearchField[] = [
    { name: "id", type: "Edm.String", key: true, filterable: true },
    ...filterable.map((name): SearchField => ({ name, type: "Edm.String", filterable: true })),
    { name: "contentHash", type: "Edm.String" },
    { name: "title", type: "Edm.String", searchable: true },
    { name: "body", type: "Edm.String", searchable: true },
    { name: "industries", type: "Collection(Edm.String)", filterable: true },
    { name: "serviceTags", type: "Collection(Edm.String)", searchable: true, filterable: true },
    { name: "chunkOrdinal", type: "Edm.Int32", filterable: true },
    { name: "embeddingDimensions", type: "Edm.Int32", filterable: true },
    { name: "embedding", type: "Collection(Edm.Single)", searchable: true,
      vectorSearchDimensions: config.embeddingDimensions, vectorSearchProfileName: "proposal-vector-profile", hidden: true }
  ];
  return {
    name: config.searchIndex, fields,
    vectorSearch: {
      algorithms: [{ name: "proposal-hnsw", kind: "hnsw", parameters: { metric: "cosine" } }],
      profiles: [{ name: "proposal-vector-profile", algorithmConfigurationName: "proposal-hnsw" }]
    }
  };
}

export interface IndexedChunkState {
  id: string;
  contentHash: string;
  embeddingVersion: string;
  embeddingDimensions: number;
}
export interface SeedIndexPort {
  listSource(sourceId: string, signal: AbortSignal): Promise<IndexedChunkState[]>;
  upload(chunks: KnowledgeChunk[], signal: AbortSignal): Promise<void>;
  delete(ids: string[], signal: AbortSignal): Promise<void>;
}

function checkIndexResults(results: Array<{ succeeded: boolean; statusCode: number }>) {
  const failed = results.filter((result) => !result.succeeded);
  if (failed.length) {
    const retryable = failed.every((result) => result.statusCode === 429 || result.statusCode === 409 || result.statusCode >= 500);
    throw new AiError("INDEXING_FAILED", `${failed.length} index document actions failed.`, retryable);
  }
}

export function createSeedIndexPort(config: AiConfig): SeedIndexPort {
  if (config.provider !== "azure") throw new AiError("WRONG_PROVIDER", "Index writes require explicit azure mode.");
  const client = new SearchClient<KnowledgeChunk>(config.searchEndpoint, config.searchIndex, createAzureCredential(config), {
    serviceVersion: config.searchApiVersion, retryOptions: { maxRetries: 0 }
  });
  return {
    async listSource(sourceId, signal) {
      const response = await client.search("*", {
        filter: `corpus eq ${odataString(CORPUS_VERSION)} and sourceId eq ${odataString(sourceId)}`,
        select: ["id", "contentHash", "embeddingVersion", "embeddingDimensions"],
        abortSignal: signal
      });
      const rows: IndexedChunkState[] = [];
      for await (const row of response.results) {
        rows.push(row.document);
        if (rows.length > 1000) throw new AiError("INDEXING_LIMIT", "A seed source exceeds the chunk bound.");
      }
      return rows;
    },
    async upload(chunks, signal) {
      const result = await client.uploadDocuments(chunks, { abortSignal: signal });
      checkIndexResults(result.results);
    },
    async delete(ids, signal) {
      const result = await client.deleteDocuments("id", ids, { abortSignal: signal });
      checkIndexResults(result.results);
    }
  };
}

function isSimpleField(field: SearchField): field is SimpleField {
  return field.type !== "Edm.ComplexType" && field.type !== "Collection(Edm.ComplexType)";
}

export function verifyKnowledgeIndex(index: SearchIndex, config: AiConfig): void {
  const expected = knowledgeIndexSchema(config);
  const mismatches: string[] = [];
  if (index.name !== expected.name) mismatches.push("index name");
  for (const field of expected.fields) {
    const actual = index.fields.find((candidate) => candidate.name === field.name);
    if (!actual || actual.type !== field.type || !isSimpleField(actual) || !isSimpleField(field)) {
      mismatches.push(`${field.name}: missing field or wrong type`);
      continue;
    }
    if (Boolean(actual.key) !== Boolean(field.key)) mismatches.push(`${field.name}: key`);
    if (field.filterable && !actual.filterable) mismatches.push(`${field.name}: filterable`);
    if (field.searchable && !actual.searchable) mismatches.push(`${field.name}: searchable`);
    if ((actual.hidden ?? Boolean(actual.vectorSearchDimensions)) !== (field.hidden ?? false)) {
      mismatches.push(`${field.name}: retrievability`);
    }
    if (actual.normalizerName) mismatches.push(`${field.name}: unexpected normalizer`);
    if (field.vectorSearchDimensions !== undefined &&
        (actual.vectorSearchDimensions !== field.vectorSearchDimensions ||
         actual.vectorSearchProfileName !== field.vectorSearchProfileName)) {
      mismatches.push(`${field.name}: vector dimensions/profile`);
    }
  }
  const keys = index.fields.filter((field) => "key" in field && field.key);
  if (keys.length !== 1 || keys[0]?.name !== "id") mismatches.push("unique id key");
  const profile = index.vectorSearch?.profiles?.find((item) => item.name === "proposal-vector-profile");
  const algorithm = index.vectorSearch?.algorithms?.find((item) => item.name === "proposal-hnsw");
  if (profile?.algorithmConfigurationName !== "proposal-hnsw" || profile.compressionName || profile.vectorizerName) {
    mismatches.push("proposal-vector-profile: expected uncompressed proposal-hnsw");
  }
  if (algorithm?.kind !== "hnsw" || algorithm.parameters?.metric !== "cosine") {
    mismatches.push("proposal-hnsw: expected HNSW/cosine");
  }
  if (mismatches.length) {
    throw new AiError("INDEX_SCHEMA_INCOMPATIBLE",
      `Search index '${config.searchIndex}' is incompatible: ${mismatches.join("; ")}. ` +
      "No documents were indexed. Migrate explicitly to a compatible index; the seed job never overwrites or deletes an index.");
  }
}

function statusCode(error: unknown) {
  const value = error as { statusCode?: number; status?: number } | null;
  return value?.statusCode ?? value?.status;
}

// Explicit seed/bootstrap operation: runtime generation never creates or changes indexes.
export async function createKnowledgeIndex(config: AiConfig) {
  if (config.provider !== "azure") throw new AiError("WRONG_PROVIDER", "Index creation requires explicit azure mode.");
  const client = new SearchIndexClient(config.searchEndpoint, createAzureCredential(config), {
    serviceVersion: config.searchApiVersion, retryOptions: { maxRetries: 0 }
  });
  return withRetry(async (signal) => {
    let index: SearchIndex;
    try {
      index = await client.getIndex(config.searchIndex, { abortSignal: signal });
    } catch (error) {
      if (statusCode(error) !== 404) throw error;
      try {
        await client.createIndex(knowledgeIndexSchema(config), { abortSignal: signal });
      } catch (creationError) {
        // Another bootstrap may win, or an earlier successful create may have lost its response.
        if (![409, 412].includes(statusCode(creationError) ?? 0)) throw creationError;
      }
      try {
        index = await client.getIndex(config.searchIndex, { abortSignal: signal });
      } catch (readError) {
        if (statusCode(readError) !== 404) throw readError;
        throw new AiError("INDEX_NOT_READY", "Search index is not yet readable after creation; no documents were indexed.", true);
      }
    }
    verifyKnowledgeIndex(index, config);
    return index;
  }, config);
}

export class SeedIndexingService {
  constructor(private readonly config: AiConfig, private readonly index: SeedIndexPort,
    private readonly embeddings?: EmbeddingProvider) {}

  async seed(content: ReusableContent[]) {
    if (content.length > 1000 || new Set(content.map((item) => item.id)).size !== content.length) {
      throw new AiError("INVALID_SOURCE", "Seed sources must have unique IDs and a maximum count of 1000.");
    }
    if (this.config.embeddingsEnabled && !this.embeddings) {
      throw new AiError("EMBEDDINGS_NOT_CONFIGURED", "Seed embedding provider is required unless explicitly disabled.");
    }
    const report = { sources: content.length, uploaded: 0, skipped: 0, deleted: 0, mode: this.config.embeddingsEnabled ? "hybrid" : "keyword" };
    for (const source of [...content].sort((a, b) => a.id.localeCompare(b.id))) {
      const chunks = chunkContent(source);
      const existing = await withRetry((signal) => this.index.listSource(source.id, signal), this.config);
      const desiredVersion = this.config.embeddingsEnabled ? this.config.embeddingVersion : "";
      const desiredDimensions = this.config.embeddingsEnabled ? this.config.embeddingDimensions : 0;
      const changed: KnowledgeChunk[] = [];
      for (const chunk of chunks) {
        const old = existing.find((item) => item.id === chunk.id);
        if (old?.contentHash === chunk.contentHash && old.embeddingVersion === desiredVersion &&
            old.embeddingDimensions === desiredDimensions) { report.skipped++; continue; }
        const embedding = this.config.embeddingsEnabled && this.embeddings
          ? validateVector(await this.embeddings.embed(chunk.body), this.config.embeddingDimensions) : [];
        changed.push({ ...chunk, embedding, embeddingVersion: desiredVersion, embeddingDimensions: desiredDimensions });
      }
      for (let offset = 0; offset < changed.length; offset += 50) {
        await withRetry((signal) => this.index.upload(changed.slice(offset, offset + 50), signal), this.config);
        report.uploaded += changed.slice(offset, offset + 50).length;
      }
      const desiredIds = new Set(chunks.map((chunk) => chunk.id));
      const stale = existing.filter((item) => !desiredIds.has(item.id)).map((item) => item.id);
      for (let offset = 0; offset < stale.length; offset += 50) {
        await withRetry((signal) => this.index.delete(stale.slice(offset, offset + 50), signal), this.config);
        report.deleted += stale.slice(offset, offset + 50).length;
      }
    }
    return report;
  }
}
