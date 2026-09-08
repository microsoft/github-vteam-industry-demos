export class AzureDataConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AzureDataConfigurationError";
  }
}

export class ConcurrencyConflictError extends Error {
  constructor(public readonly resourceId: string) {
    super(`Resource ${resourceId} changed after it was read. Reload it before saving.`);
    this.name = "ConcurrencyConflictError";
  }
}

export class BlobValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlobValidationError";
  }
}

export class QueueMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueMessageError";
  }
}

export function azureStatusCode(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const value = error as { statusCode?: unknown; status?: unknown; code?: unknown };
  const statusCode = value.statusCode ?? value.status ?? value.code;
  return typeof statusCode === "number" ? statusCode : undefined;
}
