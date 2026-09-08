import { AzureDataConfigurationError } from "./errors.js";

export interface CosmosContainerSettings {
  opportunities: string;
  documents: string;
  content: string;
  proposals: string;
  generationRuns: string;
  exports: string;
  auditEvents: string;
}

export interface AzureDataSettings {
  location: "swedencentral";
  regionCode: "swc";
  resourceGroup: "rg-aipf-dev-swc-001";
  cosmos: {
    endpoint: string;
    database: string;
    containers: CosmosContainerSettings;
  };
  blob: {
    endpoint: string;
    containers: {
      uploads: string;
      content: string;
      exports: string;
    };
    maxUploadBytes: number;
    maxExtractedCharacters: number;
  };
  queue: {
    endpoint: string;
    workQueue: string;
    poisonQueue: string;
    visibilityTimeoutSeconds: number;
    maxDequeueCount: number;
  };
  search: {
    endpoint: string;
    indexName: string;
  };
}

export type DataProviderConfiguration =
  | { provider: "local"; localDataFile: string }
  | { provider: "azure"; azure: AzureDataSettings };

type Environment = Record<string, string | undefined>;

function required(environment: Environment, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new AzureDataConfigurationError(`${name} is required when DATA_PROVIDER=azure.`);
  return value;
}

function endpoint(environment: Environment, name: string) {
  const value = required(environment, name);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AzureDataConfigurationError(`${name} must be a valid HTTPS endpoint.`);
  }
  if (url.protocol !== "https:" || !url.hostname) {
    throw new AzureDataConfigurationError(`${name} must be a valid HTTPS endpoint.`);
  }
  return url.toString().replace(/\/$/, "");
}

function positiveInteger(environment: Environment, name: string, fallback: number) {
  const raw = environment[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AzureDataConfigurationError(`${name} must be a positive integer.`);
  }
  return value;
}

function safeName(environment: Environment, name: string, fallback: string) {
  const value = environment[name]?.trim() || fallback;
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(value)) {
    throw new AzureDataConfigurationError(`${name} must contain lowercase letters, numbers, and hyphens only.`);
  }
  return value;
}

export function parseDataProviderConfiguration(environment: Environment = process.env): DataProviderConfiguration {
  const provider = (environment.DATA_PROVIDER?.trim().toLowerCase() || "local") as string;
  if (provider === "local") {
    return {
      provider: "local",
      localDataFile: environment.LOCAL_DATA_FILE?.trim() || ".data/proposal-factory.json"
    };
  }
  if (provider !== "azure") {
    throw new AzureDataConfigurationError("DATA_PROVIDER must be either local or azure.");
  }

  const location = environment.AZURE_LOCATION?.trim() || "swedencentral";
  const regionCode = environment.AZURE_REGION_CODE?.trim() || "swc";
  const resourceGroup = environment.AZURE_RESOURCE_GROUP?.trim() || "rg-aipf-dev-swc-001";
  if (location !== "swedencentral") {
    throw new AzureDataConfigurationError("AZURE_LOCATION must be swedencentral for the approved deployment baseline.");
  }
  if (regionCode !== "swc") {
    throw new AzureDataConfigurationError("AZURE_REGION_CODE must be swc.");
  }
  if (resourceGroup !== "rg-aipf-dev-swc-001") {
    throw new AzureDataConfigurationError("AZURE_RESOURCE_GROUP must be rg-aipf-dev-swc-001.");
  }

  return {
    provider: "azure",
    azure: {
      location: "swedencentral",
      regionCode: "swc",
      resourceGroup: "rg-aipf-dev-swc-001",
      cosmos: {
        endpoint: endpoint(environment, "AZURE_COSMOS_ENDPOINT"),
        database: safeName(environment, "AZURE_COSMOS_DATABASE", "proposal-factory"),
        containers: {
          opportunities: safeName(environment, "AZURE_COSMOS_OPPORTUNITIES_CONTAINER", "opportunities"),
          documents: safeName(environment, "AZURE_COSMOS_DOCUMENTS_CONTAINER", "documents"),
          content: safeName(environment, "AZURE_COSMOS_CONTENT_CONTAINER", "reusable-content"),
          proposals: safeName(environment, "AZURE_COSMOS_PROPOSALS_CONTAINER", "proposals"),
          generationRuns: safeName(environment, "AZURE_COSMOS_GENERATION_RUNS_CONTAINER", "generation-runs"),
          exports: safeName(environment, "AZURE_COSMOS_EXPORTS_CONTAINER", "exports"),
          auditEvents: safeName(environment, "AZURE_COSMOS_AUDIT_CONTAINER", "audit-events")
        }
      },
      blob: {
        endpoint: endpoint(environment, "AZURE_STORAGE_BLOB_ENDPOINT"),
        containers: {
          uploads: safeName(environment, "AZURE_BLOB_UPLOADS_CONTAINER", "uploaded-documents"),
          content: safeName(environment, "AZURE_BLOB_CONTENT_CONTAINER", "reusable-content"),
          exports: safeName(environment, "AZURE_BLOB_EXPORTS_CONTAINER", "generated-exports")
        },
        maxUploadBytes: positiveInteger(environment, "DOCUMENT_UPLOAD_MAX_BYTES", 10 * 1024 * 1024),
        maxExtractedCharacters: positiveInteger(environment, "DOCUMENT_EXTRACTED_TEXT_MAX_CHARACTERS", 40_000)
      },
      queue: {
        endpoint: endpoint(environment, "AZURE_STORAGE_QUEUE_ENDPOINT"),
        workQueue: safeName(environment, "AZURE_QUEUE_NAME", "proposal-jobs"),
        poisonQueue: safeName(environment, "AZURE_POISON_QUEUE_NAME", "proposal-jobs-poison"),
        visibilityTimeoutSeconds: positiveInteger(environment, "AZURE_QUEUE_VISIBILITY_TIMEOUT_SECONDS", 60),
        maxDequeueCount: positiveInteger(environment, "AZURE_QUEUE_MAX_DEQUEUE_COUNT", 5)
      },
      search: {
        endpoint: endpoint(environment, "AZURE_SEARCH_ENDPOINT"),
        indexName: safeName(environment, "AZURE_SEARCH_INDEX", "proposal-knowledge-v1")
      }
    }
  };
}
