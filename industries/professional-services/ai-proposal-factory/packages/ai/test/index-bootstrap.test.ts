import { DefaultAzureCredential } from "@azure/identity";
import { SearchIndexClient, type SearchIndex, type SimpleField } from "@azure/search-documents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAiConfig } from "../src/config.js";
import { createKnowledgeIndex, knowledgeIndexSchema } from "../src/ingestion.js";

const config = loadAiConfig({
  AI_PROVIDER: "azure", AZURE_OPENAI_ENDPOINT: "https://offline.openai.azure.com",
  AZURE_SEARCH_ENDPOINT: "https://offline.search.windows.net", AI_MAX_RETRIES: "0"
});
beforeEach(() => {
  vi.spyOn(DefaultAzureCredential.prototype, "getToken").mockRejectedValue(new Error("Network forbidden in offline tests."));
});
afterEach(() => vi.restoreAllMocks());

describe("explicit idempotent Search schema bootstrap", () => {
  it("creates a missing index and verifies the persisted schema before returning", async () => {
    const schema = knowledgeIndexSchema(config);
    const get = vi.spyOn(SearchIndexClient.prototype, "getIndex")
      .mockRejectedValueOnce({ statusCode: 404 }).mockResolvedValue(schema);
    const create = vi.spyOn(SearchIndexClient.prototype, "createIndex").mockResolvedValue(schema);
    expect(await createKnowledgeIndex(config)).toEqual(schema);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledWith("proposal-knowledge-v1", { abortSignal: expect.any(AbortSignal) });
    expect(create).toHaveBeenCalledExactlyOnceWith(schema, { abortSignal: expect.any(AbortSignal) });
    expect(get.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]!);
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(get.mock.invocationCallOrder[1]!);
  });

  it("accepts reordered compatible fields, extra nonkey fields and materialized SDK defaults without writing", async () => {
    const schema = knowledgeIndexSchema(config);
    schema.fields = schema.fields.reverse().map((field) => ({ hidden: false, key: false, ...field }));
    schema.fields.push({ name: "optionalDescription", type: "Edm.String" });
    schema.etag = '"service-etag"';
    const get = vi.spyOn(SearchIndexClient.prototype, "getIndex").mockResolvedValue(schema);
    const create = vi.spyOn(SearchIndexClient.prototype, "createIndex");
    const update = vi.spyOn(SearchIndexClient.prototype, "createOrUpdateIndex");
    const remove = vi.spyOn(SearchIndexClient.prototype, "deleteIndex");
    await createKnowledgeIndex(config);
    await createKnowledgeIndex(config);
    expect(get).toHaveBeenCalledTimes(2);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  const changeField = (name: string, patch: Partial<SimpleField>) => (index: SearchIndex) => {
    Object.assign(index.fields.find((field) => field.name === name)!, patch);
  };
  const incompatible: Array<[string, (index: SearchIndex) => void, string]> = [
    ["wrong index", (index) => { index.name = "other-index"; }, "index name"],
    ["missing field", (index) => { index.fields = index.fields.filter((field) => field.name !== "sourceType"); }, "sourceType"],
    ["wrong type", changeField("contentHash", { type: "Edm.Int32" }), "contentHash"],
    ["wrong key", changeField("id", { key: false }), "key"],
    ["missing industry filter", changeField("industries", { filterable: false }), "industries"],
    ["missing service filter", changeField("serviceTags", { filterable: false }), "serviceTags"],
    ["missing full text", changeField("body", { searchable: false }), "body"],
    ["hidden provenance", changeField("contentHash", { hidden: true }), "retrievability"],
    ["normalized isolation filter", changeField("corpus", { normalizerName: "lowercase" }), "normalizer"],
    ["wrong vector size", changeField("embedding", { vectorSearchDimensions: 1536 }), "dimensions/profile"],
    ["wrong vector profile", changeField("embedding", { vectorSearchProfileName: "other" }), "dimensions/profile"],
    ["wrong algorithm binding", (index) => {
      index.vectorSearch!.profiles![0]!.algorithmConfigurationName = "other";
    }, "proposal-vector-profile"],
    ["wrong metric", (index) => {
      index.vectorSearch!.algorithms = [{ name: "proposal-hnsw", kind: "hnsw", parameters: { metric: "dotProduct" } }];
    }, "HNSW/cosine"],
    ["wrong algorithm", (index) => {
      index.vectorSearch!.algorithms = [{ name: "proposal-hnsw", kind: "exhaustiveKnn", parameters: { metric: "cosine" } }];
    }, "HNSW/cosine"]
  ];
  it.each(incompatible)("fails clearly and never overwrites an incompatible index: %s", async (_name, mutate, detail) => {
    const schema = knowledgeIndexSchema(config);
    mutate(schema);
    vi.spyOn(SearchIndexClient.prototype, "getIndex").mockResolvedValue(schema);
    const create = vi.spyOn(SearchIndexClient.prototype, "createIndex");
    const update = vi.spyOn(SearchIndexClient.prototype, "createOrUpdateIndex");
    const remove = vi.spyOn(SearchIndexClient.prototype, "deleteIndex");
    await expect(createKnowledgeIndex(config)).rejects.toMatchObject({
      code: "INDEX_SCHEMA_INCOMPATIBLE", retryable: false,
      message: expect.stringContaining(detail)
    });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([409, 412])("verifies the winning index after a concurrent create conflict (%i)", async (statusCode) => {
    const schema = knowledgeIndexSchema(config);
    vi.spyOn(SearchIndexClient.prototype, "getIndex")
      .mockRejectedValueOnce({ statusCode: 404 }).mockResolvedValue(schema);
    vi.spyOn(SearchIndexClient.prototype, "createIndex").mockRejectedValue({ statusCode });
    expect(await createKnowledgeIndex(config)).toEqual(schema);
  });

  it("does not trust the create response or an incompatible concurrent winner", async () => {
    const incompatible = knowledgeIndexSchema(config);
    changeField("embedding", { vectorSearchDimensions: 1536 })(incompatible);
    const get = vi.spyOn(SearchIndexClient.prototype, "getIndex");
    const create = vi.spyOn(SearchIndexClient.prototype, "createIndex");
    for (const conflict of [false, true]) {
      get.mockReset().mockRejectedValueOnce({ statusCode: 404 }).mockResolvedValue(incompatible);
      create.mockReset();
      if (conflict) create.mockRejectedValue({ statusCode: 409 });
      else create.mockResolvedValue(knowledgeIndexSchema(config));
      await expect(createKnowledgeIndex(config)).rejects.toMatchObject({ code: "INDEX_SCHEMA_INCOMPATIBLE" });
    }
  });

  it("reconciles an ambiguous successful create response and bounded read-after-create lag", async () => {
    const schema = knowledgeIndexSchema(config);
    const retryConfig = { ...config, maxRetries: 1, retryBaseMs: 1 };
    const get = vi.spyOn(SearchIndexClient.prototype, "getIndex");
    const create = vi.spyOn(SearchIndexClient.prototype, "createIndex");
    get.mockRejectedValueOnce({ statusCode: 404 }).mockResolvedValue(schema);
    create.mockRejectedValueOnce({ statusCode: 503 });
    expect(await createKnowledgeIndex(retryConfig)).toEqual(schema);
    expect(create).toHaveBeenCalledTimes(1);

    get.mockReset().mockRejectedValueOnce({ statusCode: 404 })
      .mockRejectedValueOnce({ statusCode: 404 }).mockResolvedValue(schema);
    create.mockReset().mockResolvedValue(schema);
    expect(await createKnowledgeIndex(retryConfig)).toEqual(schema);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 400, 500])("does not mistake provider failure %i for a missing index", async (statusCode) => {
    vi.spyOn(SearchIndexClient.prototype, "getIndex").mockRejectedValue({ statusCode });
    const create = vi.spyOn(SearchIndexClient.prototype, "createIndex");
    await expect(createKnowledgeIndex(config)).rejects.toMatchObject({
      code: statusCode === 401 || statusCode === 403 ? "PROVIDER_AUTHORIZATION" :
        statusCode === 500 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REJECTED"
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("never bootstraps in fixture mode", async () => {
    const get = vi.spyOn(SearchIndexClient.prototype, "getIndex");
    await expect(createKnowledgeIndex(loadAiConfig({}))).rejects.toMatchObject({ code: "WRONG_PROVIDER" });
    expect(get).not.toHaveBeenCalled();
  });
});
