import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { BlobServiceClient } from "@azure/storage-blob";
import { AzureCliCredential, ManagedIdentityCredential } from "@azure/identity";
import type { AppConfig } from "./config.js";
import type { ApplicationState } from "../shared/domain.js";

export interface StateSnapshot {
  state: ApplicationState;
  etag: string;
}

export class StateConflictError extends Error {}

export interface StateStore {
  read(): Promise<StateSnapshot>;
  write(state: ApplicationState, expectedEtag: string): Promise<StateSnapshot>;
}

export function initialState(resetCount = 0): ApplicationState {
  return { schemaVersion: 1, resetCount, actions: [], audit: [], idempotency: {} };
}

function localEtag(contents: string): string {
  return `"${createHash("sha256").update(contents).digest("hex")}"`;
}

export class MemoryStateStore implements StateStore {
  private state = initialState();
  private version = 1;

  async read(): Promise<StateSnapshot> {
    return { state: structuredClone(this.state), etag: `"memory-${this.version}"` };
  }

  async write(state: ApplicationState, expectedEtag: string): Promise<StateSnapshot> {
    if (expectedEtag !== `"memory-${this.version}"`) throw new StateConflictError("ETag mismatch");
    this.state = structuredClone(state);
    this.version += 1;
    return this.read();
  }
}

export class FileStateStore implements StateStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<StateSnapshot> {
    const absolute = resolve(this.filePath);
    try {
      const contents = await readFile(absolute, "utf8");
      return { state: JSON.parse(contents) as ApplicationState, etag: localEtag(contents) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(dirname(absolute), { recursive: true });
      const contents = JSON.stringify(initialState(), null, 2);
      await writeFile(absolute, contents, "utf8");
      return { state: initialState(), etag: localEtag(contents) };
    }
  }

  async write(state: ApplicationState, expectedEtag: string): Promise<StateSnapshot> {
    const current = await this.read();
    if (current.etag !== expectedEtag) throw new StateConflictError("ETag mismatch");
    const absolute = resolve(this.filePath);
    const next = JSON.stringify(state, null, 2);
    const staging = `${absolute}.next`;
    await writeFile(staging, next, "utf8");
    await rename(staging, absolute);
    return { state: structuredClone(state), etag: localEtag(next) };
  }
}

export class BlobStateStore implements StateStore {
  private readonly blob;

  constructor(config: AppConfig) {
    if (!config.storageAccountName) {
      throw new Error("AZURE_STORAGE_ACCOUNT_NAME is required for blob state.");
    }
    const credential =
      config.environment === "azure"
        ? config.managedIdentityClientId
          ? new ManagedIdentityCredential(config.managedIdentityClientId)
          : new ManagedIdentityCredential()
        : new AzureCliCredential();
    const service = new BlobServiceClient(
      `https://${config.storageAccountName}.blob.core.windows.net`,
      credential,
    );
    this.blob = service
      .getContainerClient(config.storageContainerName)
      .getBlockBlobClient(config.storageBlobName);
  }

  async read(): Promise<StateSnapshot> {
    try {
      const properties = await this.blob.getProperties();
      const response = await this.blob.downloadToBuffer(0, undefined, {
        conditions: { ifMatch: properties.etag },
      });
      return {
        state: JSON.parse(response.toString("utf8")) as ApplicationState,
        etag: properties.etag!,
      };
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 412) return this.read();
      if (statusCode !== 404) throw error;
      const contents = JSON.stringify(initialState());
      try {
        const result = await this.blob.upload(contents, Buffer.byteLength(contents), {
          conditions: { ifNoneMatch: "*" },
          blobHTTPHeaders: { blobContentType: "application/json" },
        });
        return { state: initialState(), etag: result.etag! };
      } catch (createError) {
        if ((createError as { statusCode?: number }).statusCode === 412) return this.read();
        throw createError;
      }
    }
  }

  async write(state: ApplicationState, expectedEtag: string): Promise<StateSnapshot> {
    const contents = JSON.stringify(state);
    try {
      const result = await this.blob.upload(contents, Buffer.byteLength(contents), {
        conditions: { ifMatch: expectedEtag },
        blobHTTPHeaders: { blobContentType: "application/json" },
      });
      return { state: structuredClone(state), etag: result.etag! };
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 412) {
        throw new StateConflictError("ETag mismatch");
      }
      throw error;
    }
  }
}

export function createStateStore(config: AppConfig): StateStore {
  if (config.stateMode === "blob") return new BlobStateStore(config);
  if (config.stateMode === "file") return new FileStateStore(config.localStatePath);
  return new MemoryStateStore();
}
