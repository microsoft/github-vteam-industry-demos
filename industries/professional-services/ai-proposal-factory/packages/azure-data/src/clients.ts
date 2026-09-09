import { CosmosClient } from "@azure/cosmos";
import type { TokenCredential } from "@azure/core-auth";
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { QueueServiceClient } from "@azure/storage-queue";
import type { AzureDataSettings } from "./config.js";

export function createManagedIdentityCredential() {
  return new DefaultAzureCredential();
}

export function createAzureDataClients(
  settings: AzureDataSettings,
  credential: TokenCredential = createManagedIdentityCredential()
) {
  const queueService = new QueueServiceClient(settings.queue.endpoint, credential);
  return {
    cosmos: new CosmosClient({ endpoint: settings.cosmos.endpoint, aadCredentials: credential }),
    blobs: new BlobServiceClient(settings.blob.endpoint, credential),
    workQueue: queueService.getQueueClient(settings.queue.workQueue),
    poisonQueue: queueService.getQueueClient(settings.queue.poisonQueue)
  };
}
