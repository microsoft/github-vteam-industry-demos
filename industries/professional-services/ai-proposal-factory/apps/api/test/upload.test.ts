import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import type { DocumentMetadata } from "@proposal-factory/contracts";
import type { IdGenerator } from "@proposal-factory/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { DocumentContentStorage } from "../src/document-storage.js";
import { LocalStore } from "../src/local-store.js";

class TestIds implements IdGenerator {
  private sequence = 0;
  next(prefix: string) {
    return `${prefix}-upload-${++this.sequence}`;
  }
}

const clock = { now: () => "2026-09-07T11:00:00.000Z" };
const uploadRoot = resolve(process.cwd(), ".data", "upload-api-tests");
const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await rm(uploadRoot, { recursive: true, force: true });
});

function multipart(
  file: { name: string; contentType: string; data: Uint8Array },
  kind = "Meeting Notes"
) {
  const boundary = "----proposal-factory-test-boundary";
  const prefix =
    `--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\n${kind}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\n` +
    `Content-Type: ${file.contentType}\r\n\r\n`;
  const suffix = `\r\n--${boundary}--\r\n`;
  return {
    payload: Buffer.concat([Buffer.from(prefix), Buffer.from(file.data), Buffer.from(suffix)]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` }
  };
}

async function testApp(options: Parameters<typeof createApp>[0] = {}) {
  const result = await createApp({
    clock,
    ids: new TestIds(),
    uploadDirectory: uploadRoot,
    ...options
  });
  apps.push(result.app);
  return result;
}

describe("multipart document uploads", () => {
  it("persists actual bytes, extracted text, metadata, and selected generation input", async () => {
    const { app, application } = await testApp();
    const bytes = new TextEncoder().encode(
      "Customer workshop: prioritize resilient ordering and complete migration before peak season."
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/opportunities/opp-01/documents",
      ...multipart({ name: "customer notes.md", contentType: "text/markdown", data: bytes })
    });
    expect(response.statusCode).toBe(201);
    const document = response.json<DocumentMetadata>();
    expect(document).toMatchObject({
      name: "customer notes.md",
      source: "Upload",
      storageProvider: "Local",
      extractionMethod: "Plain Text"
    });
    expect(document.extractedText).toContain("resilient ordering");
    expect(await readFile(resolve(uploadRoot, ...document.storageKey!.split("/")), "utf8"))
      .toContain("complete migration before peak season");

    const selection = await app.inject({
      method: "PUT",
      url: "/api/opportunities/opp-01/documents/selection",
      payload: { documentIds: [document.id] }
    });
    expect(selection.statusCode).toBe(200);
    const generation = await app.inject({
      method: "POST",
      url: "/api/opportunities/opp-01/proposals/generate"
    });
    const job = await application.ai.state.loadJob(generation.json().id as string);
    expect(job?.documents[0]?.summary).toContain("complete migration before peak season");
    expect(job?.documents[0]?.id).toBe(document.id);
  });

  it("rejects empty, oversized, unsupported, and signature-mismatched uploads", async () => {
    const { app } = await testApp({ uploadMaxBytes: 12 });
    const empty = await app.inject({
      method: "POST",
      url: "/api/opportunities/opp-01/documents",
      ...multipart({ name: "empty.txt", contentType: "text/plain", data: new Uint8Array() })
    });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().message).toMatch(/Empty files/);

    const oversized = await app.inject({
      method: "POST",
      url: "/api/opportunities/opp-01/documents",
      ...multipart({
        name: "large.txt",
        contentType: "text/plain",
        data: new TextEncoder().encode("This text is over twelve bytes.")
      })
    });
    expect(oversized.statusCode).toBe(413);

    const unsupported = await app.inject({
      method: "POST",
      url: "/api/opportunities/opp-01/documents",
      ...multipart({ name: "notes.exe", contentType: "application/octet-stream", data: new Uint8Array([1, 2, 3]) })
    });
    expect(unsupported.statusCode).toBe(400);
    expect(unsupported.json().message).toMatch(/Supported file types/);

    const signature = await app.inject({
      method: "POST",
      url: "/api/opportunities/opp-01/documents",
      ...multipart({
        name: "notes.pdf",
        contentType: "application/pdf",
        data: new TextEncoder().encode("not a pdf")
      })
    });
    expect(signature.statusCode).toBe(400);
    expect(signature.json().message).toMatch(/signature/);
  });

  it("does not persist metadata after storage failure", async () => {
    const storage: DocumentContentStorage = {
      uploadDocument: vi.fn(async () => {
        throw new Error("storage unavailable");
      }),
      deleteDocument: vi.fn()
    };
    const { app, store } = await testApp({ documentStorage: storage });
    const before = await store.documents.list("opp-01");
    const response = await app.inject({
      method: "POST",
      url: "/api/opportunities/opp-01/documents",
      ...multipart({
        name: "notes.txt",
        contentType: "text/plain",
        data: new TextEncoder().encode("Customer notes")
      })
    });
    expect(response.statusCode).toBe(500);
    expect(await store.documents.list("opp-01")).toHaveLength(before.length);
  });

  it("removes stored bytes when metadata persistence fails", async () => {
    const store = new LocalStore();
    store.documents.save = vi.fn(async () => {
      throw new Error("metadata unavailable");
    });
    const deleteDocument = vi.fn(async () => {});
    const storage: DocumentContentStorage = {
      uploadDocument: vi.fn(async () => ({
        originalName: "notes.txt",
        safeExtension: ".txt",
        contentType: "text/plain",
        sizeBytes: 14,
        sha256: "a".repeat(64),
        extractedText: "Customer notes",
        extractionMethod: "Plain Text" as const,
        storageProvider: "Local" as const,
        container: "local-upload-directory",
        storageKey: "opp-01/doc-upload-1/doc-upload-1.txt"
      })),
      deleteDocument
    };
    const { app } = await testApp({ store, documentStorage: storage });
    const response = await app.inject({
      method: "POST",
      url: "/api/opportunities/opp-01/documents",
      ...multipart({
        name: "notes.txt",
        contentType: "text/plain",
        data: new TextEncoder().encode("Customer notes")
      })
    });
    expect(response.statusCode).toBe(500);
    expect(deleteDocument).toHaveBeenCalledWith("opp-01/doc-upload-1/doc-upload-1.txt");
  });

  it("surfaces the safe orphan key when metadata and cleanup both fail", async () => {
    const store = new LocalStore();
    store.documents.save = vi.fn(async () => {
      throw new Error("metadata unavailable");
    });
    const storage: DocumentContentStorage = {
      uploadDocument: vi.fn(async () => ({
        originalName: "notes.txt",
        safeExtension: ".txt",
        contentType: "text/plain",
        sizeBytes: 14,
        sha256: "a".repeat(64),
        extractedText: "Customer notes",
        extractionMethod: "Plain Text" as const,
        storageProvider: "Azure" as const,
        container: "uploaded-documents",
        storageKey: "opp-01/doc-upload-1/doc-upload-1.txt"
      })),
      deleteDocument: vi.fn(async () => {
        throw new Error("cleanup unavailable");
      })
    };
    const { app } = await testApp({ store, documentStorage: storage });
    const response = await app.inject({
      method: "POST",
      url: "/api/opportunities/opp-01/documents",
      ...multipart({
        name: "notes.txt",
        contentType: "text/plain",
        data: new TextEncoder().encode("Customer notes")
      })
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      error: "UPLOAD_ORPHANED",
      storageKey: "opp-01/doc-upload-1/doc-upload-1.txt"
    });
  });
});
