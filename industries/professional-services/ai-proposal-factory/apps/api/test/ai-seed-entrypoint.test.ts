import type { Container } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import { SearchClient, SearchIndexClient, type SearchIndex } from "@azure/search-documents";
import { knowledgeIndexSchema, loadAiConfig, type KnowledgeChunk } from "@proposal-factory/ai";
import { createCosmosRepositoriesFromDatabase, parseDataProviderConfiguration } from "@proposal-factory/azure-data";
import { Embeddings } from "openai/resources/embeddings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryCosmosContainer } from "../../../packages/ai/test/mock-cosmos.js";
import type { ReturnTypeOfAzureRuntime } from "../src/azure-data/types.js";
import { createFixtureContent } from "../src/fixtures.js";
import { seedAzureKnowledge } from "../src/ai-seed.js";

const boundary = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("../src/azure-data/create-azure-data.js", () => ({
  createAzureDataRuntime: () => boundary.data
}));

const environment = {
  DATA_PROVIDER: "azure", AI_PROVIDER: "azure", AZURE_LOCATION: "swedencentral",
  AZURE_COSMOS_ENDPOINT: "https://offline.documents.azure.com",
  AZURE_STORAGE_BLOB_ENDPOINT: "https://offline.blob.core.windows.net",
  AZURE_STORAGE_QUEUE_ENDPOINT: "https://offline.queue.core.windows.net",
  AZURE_OPENAI_ENDPOINT: "https://offline.openai.azure.com",
  AZURE_SEARCH_ENDPOINT: "https://offline.search.windows.net",
  AZURE_CLIENT_ID: "11111111-1111-4111-8111-111111111111",
  AI_MAX_RETRIES: "0", AI_EMBEDDINGS_ENABLED: "true"
};
const config = loadAiConfig(environment);
const originalArgv = process.argv;
const originalExitCode = process.exitCode;

function offlineData() {
  const configuration = parseDataProviderConfiguration(environment);
  if (configuration.provider !== "azure") throw new Error("Expected Azure data configuration.");
  const containers = new Map<string, Container>();
  const database = { container: (name: string) => {
    if (!containers.has(name)) containers.set(name, memoryCosmosContainer().container);
    return containers.get(name)!;
  } };
  const blobs = new Set<string>();
  const store = (key: string) => {
    const created = !blobs.has(key);
    blobs.add(key);
    return created;
  };
  const data = {
    configuration,
    clients: { cosmos: { database: () => database } },
    repositories: createCosmosRepositoriesFromDatabase(database as never, configuration.azure.cosmos.containers),
    blobs: {
      documents: { uploadDocument: async (request: { documentId: string }) => ({ created: store(request.documentId) }) },
      content: { storeContent: async (request: { contentId: string }) => {
        const created = store(request.contentId);
        return {
          createdCount: created ? 2 : 0, skippedCount: created ? 0 : 2,
          extracted: { container: "reusable-content", storageKey: `${request.contentId}/extracted/content.txt` }
        };
      } }
    }
  } as unknown as ReturnTypeOfAzureRuntime;
  boundary.data = data;
  return data;
}

function offlineSearch(existing?: SearchIndex) {
  let persisted = existing ? structuredClone(existing) : undefined;
  let verified = false;
  const documents = new Map<string, KnowledgeChunk>();
  const events: string[] = [];
  const requireVerified = () => {
    if (!persisted || !verified) throw new Error("Document/model operation happened before index readback.");
  };
  const get = vi.spyOn(SearchIndexClient.prototype, "getIndex").mockImplementation(async (name) => {
    expect(name).toBe("proposal-knowledge-v1");
    events.push("get-index");
    if (!persisted) throw { statusCode: 404 };
    verified = true;
    return structuredClone(persisted);
  });
  const create = vi.spyOn(SearchIndexClient.prototype, "createIndex").mockImplementation(async (schema) => {
    events.push("create-index");
    expect(schema).toEqual(knowledgeIndexSchema(config));
    if (persisted) throw { statusCode: 409 };
    persisted = structuredClone(schema);
    verified = false;
    return structuredClone(persisted);
  });
  const search = vi.spyOn(SearchClient.prototype, "search").mockImplementation(async (query, options) => {
    requireVerified();
    events.push("query-documents");
    expect(query).toBe("*");
    const match = /^corpus eq 'synthetic-v1' and sourceId eq '((?:[^']|'')*)'$/.exec(options?.filter ?? "");
    if (!match) throw new Error("Unexpected seed query filter.");
    const id = match[1]!.replaceAll("''", "'");
    return { results: (async function* () {
      for (const document of documents.values()) {
        if (document.sourceId === id) yield { document: structuredClone(document), score: 1 };
      }
    })() } as never;
  });
  const upload = vi.spyOn(SearchClient.prototype, "uploadDocuments").mockImplementation(async (chunks) => {
    requireVerified();
    events.push("upload-documents");
    for (const chunk of chunks as KnowledgeChunk[]) documents.set(chunk.id, structuredClone(chunk));
    return { results: (chunks as KnowledgeChunk[]).map((chunk) => ({ key: chunk.id, succeeded: true, statusCode: 201 })) };
  });
  const remove = vi.spyOn(SearchClient.prototype, "deleteDocuments").mockResolvedValue({ results: [] });
  const embed = vi.spyOn(Embeddings.prototype, "create").mockImplementation((request) => {
    requireVerified();
    events.push("embed");
    expect(request).toMatchObject({ model: "proposal-embeddings", dimensions: 3072, encoding_format: "float" });
    return Promise.resolve({ data: [{ embedding: new Array(3072).fill(0.25) }] }) as ReturnType<Embeddings["create"]>;
  });
  return { get, create, search, upload, remove, embed, events, documents };
}

beforeEach(() => {
  for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
  process.exitCode = 0;
  vi.spyOn(DefaultAzureCredential.prototype, "getToken").mockRejectedValue(new Error("Azure network calls forbidden."));
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network calls forbidden.")));
});
afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  boundary.data = undefined;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function entrypoint(args: string[] = []) {
  vi.resetModules();
  process.argv = [process.execPath, "seed-entrypoint", ...args];
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  await import("../../../containers/seed-entrypoint.js");
  await vi.waitFor(() => expect(log.mock.calls.length + error.mock.calls.length + output.mock.calls.length).toBeGreaterThan(0));
  return { log, error, output };
}

describe("real production seed entrypoint with offline SDK/data boundaries", () => {
  it("bootstraps a fresh Search service then seeds twice without duplicate documents or embeddings", async () => {
    const data = offlineData();
    const search = offlineSearch();
    const first = await entrypoint();
    expect(first.error).not.toHaveBeenCalled();
    expect(JSON.parse(first.log.mock.calls[0]![0])).toMatchObject({
      data: { cosmosCreated: 65, cosmosSkipped: 0, blobsCreated: 100 },
      search: { sources: 45, uploaded: 45, skipped: 0, mode: "hybrid" }
    });
    expect(search.events.slice(0, 4)).toEqual(["get-index", "create-index", "get-index", "query-documents"]);
    expect(search.documents.size).toBe(45);
    expect(search.embed).toHaveBeenCalledTimes(45);
    const snapshot = [...search.documents.values()];
    expect(snapshot.every((chunk) => chunk.embeddingDimensions === 3072 && chunk.embedding?.length === 3072 &&
      chunk.embeddingVersion === "text-embedding-3-large:1")).toBe(true);

    first.log.mockClear();
    const second = await entrypoint();
    expect(second.error).not.toHaveBeenCalled();
    expect(JSON.parse(second.log.mock.calls[0]![0])).toMatchObject({
      data: { cosmosCreated: 0, cosmosSkipped: 65, blobsCreated: 0, blobsSkipped: 100 },
      search: { sources: 45, uploaded: 0, skipped: 45, deleted: 0 }
    });
    expect(search.documents.size).toBe(45);
    expect([...search.documents.values()]).toEqual(snapshot);
    expect(search.embed).toHaveBeenCalledTimes(45);
    expect(search.upload).toHaveBeenCalledTimes(45);
    expect(search.create).toHaveBeenCalledTimes(1);
    expect(search.get).toHaveBeenCalledTimes(3);
    expect(search.remove).not.toHaveBeenCalled();
    expect(await data.repositories.content.search("")).toHaveLength(45);
    expect(DefaultAzureCredential.prototype.getToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it("uses a compatible preexisting index without a schema write", async () => {
    offlineData();
    const search = offlineSearch(knowledgeIndexSchema(config));
    const result = await entrypoint();
    expect(result.error).not.toHaveBeenCalled();
    expect(search.create).not.toHaveBeenCalled();
    expect(search.events[0]).toBe("get-index");
    expect(search.documents.size).toBe(45);
  });

  it("fails the entrypoint clearly for an incompatible existing index before Search queries or embeddings", async () => {
    offlineData();
    const schema = knowledgeIndexSchema(config);
    Object.assign(schema.fields.find((field) => field.name === "embedding")!, { vectorSearchDimensions: 1536 });
    const search = offlineSearch(schema);
    const result = await entrypoint();
    expect(result.error).toHaveBeenCalledWith(expect.stringContaining("proposal-knowledge-v1"));
    expect(result.error).toHaveBeenCalledWith(expect.stringContaining("incompatible"));
    expect(search.create).not.toHaveBeenCalled();
    expect(search.search).not.toHaveBeenCalled();
    expect(search.embed).not.toHaveBeenCalled();
    expect(search.upload).not.toHaveBeenCalled();
    expect(search.remove).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("supports explicit keyword seeding, then backfills the same IDs once when embeddings are enabled", async () => {
    const search = offlineSearch();
    const content = {
      search: vi.fn().mockResolvedValue(createFixtureContent()),
      getContent: vi.fn(),
      getMany: vi.fn(),
      saveContent: vi.fn()
    };
    const first = await seedAzureKnowledge(content, { ...config, embeddingsEnabled: false });
    expect(first).toMatchObject({ uploaded: 45, mode: "keyword" });
    const ids = [...search.documents.keys()];
    expect(search.embed).not.toHaveBeenCalled();
    expect([...search.documents.values()].every((chunk) => chunk.embedding?.length === 0)).toBe(true);
    expect(await seedAzureKnowledge(content, config)).toMatchObject({ uploaded: 45, mode: "hybrid" });
    expect(await seedAzureKnowledge(content, config)).toMatchObject({ uploaded: 0, skipped: 45 });
    expect([...search.documents.keys()]).toEqual(ids);
    expect(search.documents.size).toBe(45);
    expect(search.embed).toHaveBeenCalledTimes(45);
  });

  it.each(["--help", "--dry-run"])("runs %s without constructing cloud data or calling any SDK operation", async (option) => {
    const search = offlineSearch();
    const result = await entrypoint([option]);
    expect(result.error).not.toHaveBeenCalled();
    if (option === "--help") expect(result.output).toHaveBeenCalledWith(expect.stringContaining("AI Proposal Factory Azure seed/index job"));
    else expect(result.log).toHaveBeenCalledWith("Dry run complete; no Azure calls were made.");
    expect(search.get).not.toHaveBeenCalled();
    expect(search.create).not.toHaveBeenCalled();
    expect(search.search).not.toHaveBeenCalled();
    expect(search.embed).not.toHaveBeenCalled();
    expect(DefaultAzureCredential.prototype.getToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects fixture provider selection rather than silently skipping Azure bootstrap", async () => {
    vi.stubEnv("AI_PROVIDER", "fixture");
    const search = offlineSearch();
    const result = await entrypoint();
    expect(result.error).toHaveBeenCalledWith(expect.stringContaining("requires DATA_PROVIDER=azure and AI_PROVIDER=azure"));
    expect(search.get).not.toHaveBeenCalled();
    expect(search.search).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
