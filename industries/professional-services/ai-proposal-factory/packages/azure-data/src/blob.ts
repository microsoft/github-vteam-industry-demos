import { createHash } from "node:crypto";
import type { ContainerClient } from "@azure/storage-blob";
import type { DocumentKind, ExportResult } from "@proposal-factory/contracts";
import type { AzureDataSettings } from "./config.js";
import { prepareDocumentContent, type PreparedDocumentContent } from "./document-content.js";
import { azureStatusCode, BlobValidationError } from "./errors.js";

export interface SafeBlobMetadata {
  container: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  etag?: string;
  versionId?: string;
  created?: boolean;
}

export interface DocumentUploadRequest {
  documentId: string;
  opportunityId: string;
  fileName: string;
  kind: DocumentKind;
  contentType: string;
  sizeBytes: number;
  data: Uint8Array;
  ifAbsent?: boolean;
}

export interface StoredDocumentContent extends SafeBlobMetadata, PreparedDocumentContent {
  storageProvider: "Local" | "Azure";
}

export interface ReusableContentUploadRequest {
  contentId: string;
  fileName: string;
  contentType: string;
  original: Uint8Array;
  extractedText: string;
}

function safeSegment(value: string, label: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw new BlobValidationError(`${label} contains unsupported characters.`);
  }
  return value;
}

function validateFileName(fileName: string, contentType: string) {
  const trimmed = fileName.trim();
  const hasControlCharacter = [...trimmed].some((character) => character.charCodeAt(0) < 32);
  if (!trimmed || trimmed.length > 180 || /[\\/]/.test(trimmed) || hasControlCharacter || trimmed === "." || trimmed === "..") {
    throw new BlobValidationError("File name is invalid.");
  }
  const allowedTypes = new Map<string, Set<string>>([
    ["application/pdf", new Set([".pdf"])],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", new Set([".docx"])],
    ["text/plain", new Set([".txt"])],
    ["text/markdown", new Set([".md", ".markdown"])],
    ["application/json", new Set([".json"])]
  ]);
  const allowedExtensions = allowedTypes.get(contentType.toLowerCase());
  if (!allowedExtensions) throw new BlobValidationError(`Content type ${contentType} is not allowed.`);
  const extensionIndex = trimmed.lastIndexOf(".");
  const extension = extensionIndex >= 0 ? trimmed.slice(extensionIndex).toLowerCase() : "";
  if (!allowedExtensions.has(extension)) {
    throw new BlobValidationError(`File extension does not match ${contentType}.`);
  }
  return trimmed.replace(/[^A-Za-z0-9._-]/g, "-");
}

function validateBytes(data: Uint8Array, expectedSize: number, maxBytes: number) {
  if (data.byteLength === 0) throw new BlobValidationError("Empty files are not accepted.");
  if (data.byteLength !== expectedSize) throw new BlobValidationError("Declared file size does not match uploaded data.");
  if (data.byteLength > maxBytes) throw new BlobValidationError(`File exceeds the ${maxBytes}-byte upload limit.`);
}

function hash(data: Uint8Array | string) {
  return createHash("sha256").update(data).digest("hex");
}

async function upload(
  container: ContainerClient,
  storageKey: string,
  data: Uint8Array,
  contentType: string,
  metadata: Record<string, string>,
  ifAbsent = false
) {
  try {
    const response = await container.getBlockBlobClient(storageKey).uploadData(data, {
      blobHTTPHeaders: { blobContentType: contentType },
      metadata,
      ...(ifAbsent ? { conditions: { ifNoneMatch: "*" } } : {})
    });
    return {
      ...(response.etag ? { etag: response.etag } : {}),
      ...(response.versionId ? { versionId: response.versionId } : {}),
      created: true
    };
  } catch (error) {
    if (ifAbsent && (azureStatusCode(error) === 409 || azureStatusCode(error) === 412)) {
      return { created: false };
    }
    throw error;
  }
}

export class AzureDocumentBlobStore {
  constructor(
    private readonly container: ContainerClient,
    private readonly maxUploadBytes: number,
    private readonly maxExtractedCharacters = 40_000
  ) {}

  async ensurePrivateContainer() {
    await this.container.createIfNotExists();
  }

  async uploadDocument(request: DocumentUploadRequest): Promise<StoredDocumentContent> {
    const opportunityId = safeSegment(request.opportunityId, "Opportunity ID");
    const documentId = safeSegment(request.documentId, "Document ID");
    validateBytes(request.data, request.sizeBytes, this.maxUploadBytes);
    const prepared = await prepareDocumentContent(request, {
      maxBytes: this.maxUploadBytes,
      maxExtractedCharacters: this.maxExtractedCharacters
    });
    const storageKey = `${opportunityId}/${documentId}/${documentId}${prepared.safeExtension}`;
    const result = await upload(
      this.container,
      storageKey,
      request.data,
      prepared.contentType,
      {
        opportunityId,
        documentId,
        kind: request.kind.replaceAll(" ", "-").toLowerCase(),
        sha256: prepared.sha256,
        originalName: Buffer.from(prepared.originalName, "utf8").toString("base64")
      },
      request.ifAbsent
    );
    return {
      ...prepared,
      storageProvider: "Azure",
      container: this.container.containerName,
      storageKey,
      created: result.created,
      ...(result.etag ? { etag: result.etag } : {}),
      ...(result.versionId ? { versionId: result.versionId } : {})
    };
  }

  async deleteDocument(storageKey: string) {
    if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(txt|md|markdown|docx|pdf)$/.test(storageKey)) {
      throw new BlobValidationError("Stored document key is invalid.");
    }
    await this.container.getBlockBlobClient(storageKey).deleteIfExists({ deleteSnapshots: "include" });
  }
}

export class AzureReusableContentBlobStore {
  constructor(private readonly container: ContainerClient) {}

  async ensurePrivateContainer() {
    await this.container.createIfNotExists();
  }

  async storeContent(request: ReusableContentUploadRequest) {
    const contentId = safeSegment(request.contentId, "Content ID");
    const fileName = validateFileName(request.fileName, request.contentType);
    if (!request.extractedText.trim()) throw new BlobValidationError("Extracted text cannot be empty.");
    const originalHash = hash(request.original);
    const extracted = new TextEncoder().encode(request.extractedText);
    const originalKey = `${contentId}/original/${fileName}`;
    const extractedKey = `${contentId}/extracted/content.txt`;
    const originalResult = await upload(
      this.container,
      originalKey,
      request.original,
      request.contentType,
      { contentId, variant: "original", sha256: originalHash },
      true
    );
    const extractedResult = await upload(
      this.container,
      extractedKey,
      extracted,
      "text/plain; charset=utf-8",
      { contentId, variant: "extracted", sha256: hash(extracted) },
      true
    );
    return {
      original: {
        container: this.container.containerName,
        storageKey: originalKey,
        contentType: request.contentType,
        sizeBytes: request.original.byteLength,
        sha256: originalHash
      } satisfies SafeBlobMetadata,
      extracted: {
        container: this.container.containerName,
        storageKey: extractedKey,
        contentType: "text/plain; charset=utf-8",
        sizeBytes: extracted.byteLength,
        sha256: hash(extracted)
      } satisfies SafeBlobMetadata,
      created: originalResult.created || extractedResult.created,
      createdCount: Number(originalResult.created) + Number(extractedResult.created),
      skippedCount: Number(!originalResult.created) + Number(!extractedResult.created)
    };
  }
}

export class AzureExportBlobStore {
  constructor(private readonly container: ContainerClient) {}

  async ensurePrivateContainer() {
    await this.container.createIfNotExists();
  }

  async storeExport(result: ExportResult, data: Uint8Array): Promise<SafeBlobMetadata> {
    const proposalId = safeSegment(result.proposalId, "Proposal ID");
    const exportId = safeSegment(result.id, "Export ID");
    const expectedType = result.format === "pdf" ? "application/pdf" : "text/markdown; charset=utf-8";
    if (!result.contentType.toLowerCase().startsWith(expectedType.split(";")[0]!)) {
      throw new BlobValidationError("Export content type does not match its format.");
    }
    if (data.byteLength === 0) throw new BlobValidationError("Empty exports are not accepted.");
    const extension = result.format === "pdf" ? "pdf" : "md";
    const storageKey = `${proposalId}/${exportId}/${exportId}.${extension}`;
    const sha256 = hash(data);
    const response = await upload(this.container, storageKey, data, result.contentType, {
      proposalId,
      exportId,
      format: result.format,
      sha256
    });
    return {
      container: this.container.containerName,
      storageKey,
      contentType: result.contentType,
      sizeBytes: data.byteLength,
      sha256,
      ...(response.etag ? { etag: response.etag } : {}),
      ...(response.versionId ? { versionId: response.versionId } : {})
    };
  }
}

export function createBlobStores(
  getContainer: (name: string) => ContainerClient,
  settings: AzureDataSettings
) {
  return {
    documents: new AzureDocumentBlobStore(
      getContainer(settings.blob.containers.uploads),
      settings.blob.maxUploadBytes,
      settings.blob.maxExtractedCharacters
    ),
    content: new AzureReusableContentBlobStore(getContainer(settings.blob.containers.content)),
    exports: new AzureExportBlobStore(getContainer(settings.blob.containers.exports))
  };
}
