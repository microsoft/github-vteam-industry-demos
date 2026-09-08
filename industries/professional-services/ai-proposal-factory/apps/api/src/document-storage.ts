import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve, sep } from "node:path";
import {
  prepareDocumentContent,
  type DocumentUploadRequest,
  type PreparedDocumentContent,
  type StoredDocumentContent
} from "@proposal-factory/azure-data";

export interface DocumentContentStorage {
  uploadDocument(request: DocumentUploadRequest): Promise<StoredDocumentContent>;
  deleteDocument(storageKey: string): Promise<void>;
}

export class DocumentUploadPersistenceError extends Error {
  constructor(public readonly storageKey: string, cause: unknown) {
    super(`Document metadata failed and stored object ${storageKey} could not be removed.`, { cause });
    this.name = "DocumentUploadPersistenceError";
  }
}

export class LocalDocumentStorage implements DocumentContentStorage {
  private readonly root: string;

  constructor(
    directory: string,
    private readonly maxUploadBytes: number,
    private readonly maxExtractedCharacters: number
  ) {
    this.root = resolve(directory);
  }

  async uploadDocument(request: DocumentUploadRequest): Promise<StoredDocumentContent> {
    const prepared = await prepareDocumentContent(request, {
      maxBytes: this.maxUploadBytes,
      maxExtractedCharacters: this.maxExtractedCharacters
    });
    const storageKey = `${request.opportunityId}/${request.documentId}/${request.documentId}${prepared.safeExtension}`;
    const target = this.resolveKey(storageKey);
    await mkdir(dirname(target), { recursive: true });
    const staged = `${target}.${randomUUID()}.pending`;
    try {
      await writeFile(staged, request.data, { flag: "wx" });
      await rename(staged, target);
    } finally {
      await rm(staged, { force: true });
    }
    return this.result(storageKey, prepared);
  }

  async deleteDocument(storageKey: string) {
    const target = this.resolveKey(storageKey);
    await rm(dirname(target), { recursive: true, force: true });
  }

  private resolveKey(storageKey: string) {
    if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(txt|md|markdown|docx|pdf)$/.test(storageKey)) {
      throw new Error("Stored document key is invalid.");
    }
    const target = resolve(this.root, ...storageKey.split("/"));
    if (!target.startsWith(`${this.root}${sep}`)) throw new Error("Stored document path escapes the upload root.");
    return target;
  }

  private result(storageKey: string, prepared: PreparedDocumentContent): StoredDocumentContent {
    return {
      ...prepared,
      storageProvider: "Local",
      container: "local-upload-directory",
      storageKey,
      created: true
    };
  }
}

export function uploadLimits(environment: Record<string, string | undefined> = process.env) {
  const integer = (name: string, fallback: number) => {
    const value = Number(environment[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
    return value;
  };
  return {
    maxBytes: integer("DOCUMENT_UPLOAD_MAX_BYTES", 10 * 1024 * 1024),
    maxExtractedCharacters: integer("DOCUMENT_EXTRACTED_TEXT_MAX_CHARACTERS", 40_000)
  };
}
