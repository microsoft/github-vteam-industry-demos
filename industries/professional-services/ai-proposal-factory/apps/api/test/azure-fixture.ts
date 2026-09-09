import { vi } from "vitest";
import type { Container } from "@azure/cosmos";
import { createCosmosRepositoriesFromDatabase, parseDataProviderConfiguration } from "@proposal-factory/azure-data";
import { createAzureApplicationRuntime } from "../src/ai-azure-runtime.js";
import type { ReturnTypeOfAzureRuntime } from "../src/azure-data/types.js";
import { createFixtureContent, createFixtureOpportunities } from "../src/fixtures.js";
import { createApp } from "../src/app.js";
import { GenerationWorkHandler } from "../../worker/src/index.js";
import { memoryCosmosContainer } from "../../../packages/ai/test/mock-cosmos.js";

export const environment = {
  DATA_PROVIDER: "azure", AI_PROVIDER: "fixture",
  AZURE_COSMOS_ENDPOINT: "https://offline.documents.azure.com",
  AZURE_STORAGE_BLOB_ENDPOINT: "https://offline.blob.core.windows.net",
  AZURE_STORAGE_QUEUE_ENDPOINT: "https://offline.queue.core.windows.net",
  AZURE_SEARCH_ENDPOINT: "https://offline.search.windows.net"
};

export async function setupAzureFixture(authEnvironment?: NodeJS.ProcessEnv) {
  const configuration = parseDataProviderConfiguration(environment);
  if (configuration.provider !== "azure") throw new Error("Expected Azure configuration.");
  const containers = new Map<string, Container>();
  const database = { container: (name: string) => {
    if (!containers.has(name)) containers.set(name, memoryCosmosContainer().container);
    return containers.get(name)!;
  } };
  const repositories = createCosmosRepositoriesFromDatabase(database as never, configuration.azure.cosmos.containers);
  await repositories.opportunities.save(createFixtureOpportunities()[0]!);
  for (const content of createFixtureContent()) await repositories.content.save(content);
  const data = {
    configuration, repositories,
    clients: { cosmos: { database: () => database } },
    queue: { enqueue: vi.fn().mockResolvedValue(undefined) },
    blobs: { exports: { storeExport: vi.fn().mockResolvedValue({
      container: "generated-exports", storageKey: "private-export", contentType: "application/pdf", sizeBytes: 1, sha256: "hash"
    }) } }
  } as unknown as ReturnTypeOfAzureRuntime;
  const runtime = createAzureApplicationRuntime(environment, { data });
  const result = await createApp({
    store: runtime.store, ai: runtime.ai, workflow: runtime.workflow,
    clock: runtime.clock, ids: runtime.ids, dataProvider: "azure",
    ...(authEnvironment ? { authEnvironment } : {})
  });
  const handler = new GenerationWorkHandler({ run: (job) => runtime.workflow.execute(job) }, runtime.workflow);
  const handle = async (id: string) => handler.handle({ id, type: "GenerateProposal", payload: { jobId: id } });
  return { ...result, runtime, data, handle, handler };
}
