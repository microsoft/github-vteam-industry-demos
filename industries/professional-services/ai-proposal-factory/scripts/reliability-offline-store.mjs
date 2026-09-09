import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { AzureStorageWorkQueue, createCosmosRepositoriesFromDatabase, parseDataProviderConfiguration } from "../packages/azure-data/src/index.ts";

const { structuredClone } = globalThis;
export const offlineEnvironment = {
  DATA_PROVIDER: "azure", AI_PROVIDER: "fixture",
  AZURE_COSMOS_ENDPOINT: "https://offline.documents.azure.com",
  AZURE_STORAGE_BLOB_ENDPOINT: "https://offline.blob.core.windows.net",
  AZURE_STORAGE_QUEUE_ENDPOINT: "https://offline.queue.core.windows.net",
  AZURE_SEARCH_ENDPOINT: "https://offline.search.windows.net"
};

// Deliberately offline SDK boundary, persisted between actual Node process restarts.
export function offlineData(path) {
  const state = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {
    version: 0, containers: {}, queue: [], poison: [], acknowledgements: 0, enqueues: 0, modelAnalyses: 0
  };
  const persist = () => writeFileSync(path, JSON.stringify(state));
  const containers = new Map();
  const database = { container: (name) => {
    if (containers.has(name)) return containers.get(name);
    const records = state.containers[name] ??= {};
    const key = (id, partition) => `${partition}|${id}`;
    const response = (value) => ({ resource: structuredClone(value), etag: value._etag });
    const save = (value) => {
      const next = structuredClone({ ...value, _etag: `etag-${++state.version}` });
      records[key(next.id, next.partitionKey)] = next;
      persist();
      return response(next);
    };
    const container = {
      item: (id, partition) => ({
        read: async () => {
          const record = records[key(id, partition)];
          if (!record) throw { code: 404 };
          return response(record);
        },
        replace: async (value, options) => {
          const existing = records[key(id, partition)];
          if (!existing) throw { code: 404 };
          if (existing._etag !== options?.accessCondition?.condition) throw { code: 412 };
          return save(value);
        }
      }),
      items: {
        create: async (value) => {
          if (records[key(value.id, value.partitionKey)]) throw { code: 409 };
          return save(value);
        },
        upsert: async (value) => save(value),
        query: ({ query, parameters = [] }) => ({ fetchAll: async () => {
          const filter = Object.fromEntries(parameters.map(({ name, value }) => [name, value]));
          let rows = Object.values(records);
          for (const parameter of ["@type", "@entityType"]) {
            if (filter[parameter]) rows = rows.filter((row) => row.entityType === filter[parameter]);
          }
          if (filter["@id"]) rows = rows.filter((row) => row.id === filter["@id"]);
          if (filter["@opportunityId"]) rows = rows.filter((row) =>
            row.partitionKey === filter["@opportunityId"] || row.partitionKey === filter["@shared"]);
          if (filter["@kind"]) rows = rows.filter((row) =>
            row.value?.kind === filter["@kind"] && !row.value.dispatched && !row.value.terminal);
          if (query.includes("TOP 1 ")) rows = rows.slice(0, 1);
          if (query.includes("TOP 20 ")) rows = rows.slice(0, 20);
          return { resources: structuredClone(rows) };
        } })
      }
    };
    containers.set(name, container);
    return container;
  } };
  const transport = {
    sendMessage: async (messageText) => {
      state.queue.push({
        messageId: `queue-${++state.enqueues}`, messageText, popReceipt: `receipt-${state.enqueues}`, dequeueCount: 0
      });
      persist();
    },
    receiveMessages: async () => {
      const message = state.queue[0];
      if (message) { message.dequeueCount++; persist(); }
      return { receivedMessageItems: message ? [structuredClone(message)] : [] };
    },
    updateMessage: async (id) => {
      const message = state.queue.find((item) => item.messageId === id);
      if (!message) throw { code: 404 };
      message.popReceipt += "-renewed";
      persist();
      return { popReceipt: message.popReceipt };
    },
    deleteMessage: async (id, receipt) => {
      const index = state.queue.findIndex((message) => message.messageId === id && message.popReceipt === receipt);
      if (index < 0) throw { code: 412 };
      state.queue.splice(index, 1);
      state.acknowledgements++;
      persist();
    }
  };
  const queue = new AzureStorageWorkQueue(transport, {
    sendMessage: async (messageText) => { state.poison.push(messageText); persist(); }
  }, { visibilityTimeoutSeconds: 60, maxDequeueCount: 5 });
  const configuration = parseDataProviderConfiguration(offlineEnvironment);
  const data = {
    configuration, queue,
    repositories: createCosmosRepositoriesFromDatabase(database, configuration.azure.cosmos.containers),
    clients: { cosmos: { database: () => database } }
  };
  return { data, state, persist };
}
