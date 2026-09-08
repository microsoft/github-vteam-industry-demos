import { AzureSeedService, CosmosSeedWriter } from "@proposal-factory/azure-data";
import { createFixtureContent, createFixtureDocuments, createFixtureOpportunities } from "../fixtures.js";
import type { ReturnTypeOfAzureRuntime } from "./types.js";

export async function seedAzureDemoData(runtime: ReturnTypeOfAzureRuntime) {
  const service = new AzureSeedService(
    new CosmosSeedWriter(
      runtime.clients.cosmos.database(runtime.configuration.azure.cosmos.database),
      runtime.configuration.azure.cosmos.containers
    ),
    runtime.blobs.documents,
    runtime.blobs.content
  );
  return service.seed({
    opportunities: createFixtureOpportunities(),
    documents: createFixtureDocuments(),
    content: createFixtureContent()
  });
}
