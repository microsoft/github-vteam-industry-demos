import {
  AzureStorageWorkQueue,
  createAzureDataClients,
  createBlobStores,
  createCosmosRepositories,
  parseDataProviderConfiguration
} from "@proposal-factory/azure-data";

type AzureCredential = NonNullable<Parameters<typeof createAzureDataClients>[1]>;

export function createAzureDataRuntime(
  environment: Record<string, string | undefined> = process.env,
  credential?: AzureCredential
) {
  const configuration = parseDataProviderConfiguration(environment);
  if (configuration.provider !== "azure") {
    throw new Error("createAzureDataRuntime requires DATA_PROVIDER=azure; local fallback is not permitted.");
  }
  const clients = createAzureDataClients(configuration.azure, credential);
  const repositories = createCosmosRepositories(clients.cosmos, configuration.azure);
  const blobs = createBlobStores(
    (name) => clients.blobs.getContainerClient(name),
    configuration.azure
  );
  const queue = new AzureStorageWorkQueue(clients.workQueue, clients.poisonQueue, {
    visibilityTimeoutSeconds: configuration.azure.queue.visibilityTimeoutSeconds,
    maxDequeueCount: configuration.azure.queue.maxDequeueCount
  });
  return { configuration, clients, repositories, blobs, queue };
}
