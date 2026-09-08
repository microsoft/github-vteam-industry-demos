import type { DocumentMetadata, Opportunity, ReusableContent } from "@proposal-factory/contracts";
import { describe, expect, it } from "vitest";
import type { AzureDocumentBlobStore, AzureReusableContentBlobStore, CosmosSeedWriter } from "../src/index.js";
import { AzureSeedService } from "../src/index.js";

describe("Azure seed service", () => {
  it("preserves stable IDs, avoids duplicates, and emits search-ready records", async () => {
    const cosmosKeys = new Set<string>();
    const blobKeys = new Set<string>();
    const cosmos = {
      putIfAbsent: async (collection: string, value: { id: string }, partition: string) => {
        const key = `${collection}:${partition}:${value.id}`;
        if (cosmosKeys.has(key)) return false;
        cosmosKeys.add(key);
        return true;
      }
    } as unknown as CosmosSeedWriter;
    const documents = {
      uploadDocument: async (request: { opportunityId: string; documentId: string }) => {
        const storageKey = `${request.opportunityId}/${request.documentId}/notes.md`;
        const created = !blobKeys.has(storageKey);
        blobKeys.add(storageKey);
        return {
          container: "uploaded-documents",
          storageKey,
          contentType: "text/markdown",
          sizeBytes: 10,
          sha256: "hash",
          created
        };
      }
    } as unknown as AzureDocumentBlobStore;
    const contentBlobs = {
      storeContent: async (request: { contentId: string }) => {
        const storageKey = `${request.contentId}/extracted/content.txt`;
        const created = !blobKeys.has(storageKey);
        blobKeys.add(storageKey);
        return {
          original: {
            container: "reusable-content",
            storageKey: `${request.contentId}/original/content.md`,
            contentType: "text/markdown",
            sizeBytes: 10,
            sha256: "hash"
          },
          extracted: {
            container: "reusable-content",
            storageKey,
            contentType: "text/plain",
            sizeBytes: 10,
            sha256: "hash"
          },
          created,
          createdCount: created ? 2 : 0,
          skippedCount: created ? 0 : 2
        };
      }
    } as unknown as AzureReusableContentBlobStore;

    const opportunity = {
      id: "opp-01",
      selectedDocumentIds: ["doc-01"]
    } as Opportunity;
    const document = {
      id: "doc-01",
      name: "notes.md",
      kind: "Meeting Notes",
      contentType: "text/markdown",
      sizeBytes: 10,
      source: "Fixture",
      summary: "Discovery notes",
      createdAt: "2026-09-07T09:00:00.000Z"
    } as DocumentMetadata;
    const content = {
      id: "content-01",
      title: "Cloud method",
      kind: "Delivery Methodology",
      scenario: "Cloud modernization",
      industries: ["Retail"],
      tags: ["cloud"],
      summary: "Phased cloud delivery",
      body: "Discover, establish, deliver, and enable.",
      updatedAt: "2026-09-07T09:00:00.000Z"
    } as ReusableContent;
    const service = new AzureSeedService(cosmos, documents, contentBlobs);
    const dataset = { opportunities: [opportunity], documents: [document], content: [content] };

    const first = await service.seed(dataset);
    const second = await service.seed(dataset);
    expect(first.cosmosCreated).toBe(3);
    expect(first.blobsCreated).toBe(3);
    expect(second.cosmosCreated).toBe(0);
    expect(second.cosmosSkipped).toBe(3);
    expect(second.blobsSkipped).toBe(3);
    expect(first.searchRecords[0]).toMatchObject({
      id: "content-01",
      sourceContainer: "reusable-content",
      sourceKey: "content-01/extracted/content.txt"
    });
  });
});
