import { describe, expect, it } from "vitest";
import { AzureDataConfigurationError, parseDataProviderConfiguration } from "../src/index.js";

describe("data provider configuration", () => {
  it("defaults to local and never silently falls back when azure is requested", () => {
    expect(parseDataProviderConfiguration({})).toEqual({
      provider: "local",
      localDataFile: ".data/proposal-factory.json"
    });
    expect(() => parseDataProviderConfiguration({ DATA_PROVIDER: "azure" })).toThrow(AzureDataConfigurationError);
  });

  it("validates the approved region and endpoint-based Azure settings", () => {
    const environment = {
      DATA_PROVIDER: "azure",
      AZURE_COSMOS_ENDPOINT: "https://aipf.documents.azure.com",
      AZURE_STORAGE_BLOB_ENDPOINT: "https://aipf.blob.core.windows.net",
      AZURE_STORAGE_QUEUE_ENDPOINT: "https://aipf.queue.core.windows.net",
      AZURE_SEARCH_ENDPOINT: "https://aipf.search.windows.net"
    };
    const configuration = parseDataProviderConfiguration(environment);
    expect(configuration.provider).toBe("azure");
    if (configuration.provider !== "azure") throw new Error("Expected Azure configuration.");
    expect(configuration.azure.location).toBe("swedencentral");
    expect(configuration.azure.resourceGroup).toBe("rg-aipf-dev-swc-001");
    expect(configuration.azure.search.indexName).toBe("proposal-knowledge-v1");
    expect(configuration.azure.queue.poisonQueue).toBe("proposal-jobs-poison");
    expect(() =>
      parseDataProviderConfiguration({ ...environment, AZURE_LOCATION: "northeurope" })
    ).toThrow(/swedencentral/);
  });
});
