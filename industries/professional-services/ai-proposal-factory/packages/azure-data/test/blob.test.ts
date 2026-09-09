import type { ContainerClient } from "@azure/storage-blob";
import { describe, expect, it, vi } from "vitest";
import { AzureDocumentBlobStore, BlobValidationError } from "../src/index.js";

function container() {
  const uploadData = vi.fn(async () => ({ etag: "etag-1", versionId: "version-1" }));
  const deleteIfExists = vi.fn(async () => ({ succeeded: true }));
  const createIfNotExists = vi.fn(async () => ({ succeeded: true }));
  const client = {
    containerName: "uploaded-documents",
    createIfNotExists,
    getBlockBlobClient: vi.fn(() => ({ uploadData, deleteIfExists }))
  } as unknown as ContainerClient;
  return { client, uploadData, deleteIfExists, createIfNotExists };
}

describe("Blob document storage", () => {
  it("creates a private container and returns only safe storage metadata", async () => {
    const mock = container();
    const store = new AzureDocumentBlobStore(mock.client, 1024);
    await store.ensurePrivateContainer();
    expect(mock.createIfNotExists).toHaveBeenCalledWith();

    const data = new TextEncoder().encode("meeting notes");
    const result = await store.uploadDocument({
      documentId: "doc-01",
      opportunityId: "opp-01",
      fileName: "discovery notes.md",
      kind: "Meeting Notes",
      contentType: "text/markdown",
      sizeBytes: data.byteLength,
      data
    });
    expect(result.storageKey).toBe("opp-01/doc-01/doc-01.md");
    expect(result.extractedText).toBe("meeting notes");
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result).not.toHaveProperty("url");
    expect(mock.uploadData).toHaveBeenCalledWith(
      data,
      expect.objectContaining({
        blobHTTPHeaders: { blobContentType: "text/markdown" },
        metadata: expect.objectContaining({ opportunityId: "opp-01", documentId: "doc-01" })
      })
    );
  });

  it("deletes only validated opportunity-scoped stored keys", async () => {
    const mock = container();
    const store = new AzureDocumentBlobStore(mock.client, 1024);
    await store.deleteDocument("opp-01/doc-01/doc-01.md");
    expect(mock.deleteIfExists).toHaveBeenCalledWith({ deleteSnapshots: "include" });
    await expect(store.deleteDocument("../outside.txt")).rejects.toThrow(/key is invalid/);
  });

  it("rejects traversal, mismatched types, sizes, and oversized uploads before SDK calls", async () => {
    const mock = container();
    const store = new AzureDocumentBlobStore(mock.client, 4);
    const base = {
      documentId: "doc-01",
      opportunityId: "opp-01",
      kind: "Requirements" as const,
      contentType: "text/markdown",
      sizeBytes: 5,
      data: new TextEncoder().encode("hello")
    };
    await expect(store.uploadDocument({ ...base, fileName: "../notes.md" })).rejects.toBeInstanceOf(BlobValidationError);
    await expect(store.uploadDocument({ ...base, fileName: "notes.exe" })).rejects.toBeInstanceOf(BlobValidationError);
    await expect(store.uploadDocument({ ...base, fileName: "notes.md" })).rejects.toThrow(/exceeds/);
    expect(mock.uploadData).not.toHaveBeenCalled();
  });
});
