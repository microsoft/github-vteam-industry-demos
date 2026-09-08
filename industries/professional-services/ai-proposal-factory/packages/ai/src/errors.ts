import type { AiConfig } from "./config.js";

export class AiError extends Error {
  constructor(public readonly code: string, message: string, public readonly retryable = false) {
    super(message);
    this.name = "AiError";
  }
}

export function classifyFailure(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof AiError) return { code: error.code, retryable: error.retryable };
  const value = error as { status?: number; statusCode?: number; code?: string | number; name?: string } | null;
  const status = value?.status ?? value?.statusCode ?? (typeof value?.code === "number" ? value.code : undefined);
  if (status === 412 || value?.name === "ConcurrencyConflictError") return { code: "STALE_REVISION", retryable: false };
  if (status === 429) return { code: "THROTTLED", retryable: true };
  if (status === 408 || status === 409 || (status !== undefined && status >= 500 && status <= 599)) {
    return { code: "PROVIDER_UNAVAILABLE", retryable: true };
  }
  if (value?.name === "AbortError" || value?.name === "APIConnectionTimeoutError" ||
      value?.name === "APIConnectionError" || ["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"].includes(String(value?.code ?? ""))) {
    return { code: "PROVIDER_TIMEOUT", retryable: true };
  }
  if (status === 401 || status === 403) return { code: "PROVIDER_AUTHORIZATION", retryable: false };
  return { code: "PROVIDER_REJECTED", retryable: false };
}

function retryAfter(error: unknown): number | undefined {
  type ResponseHeaders = { get(name: string): string | null | undefined } | Record<string, string>;
  const value = error as { headers?: ResponseHeaders; response?: { headers?: ResponseHeaders } } | null;
  const headers = value?.headers ?? value?.response?.headers;
  const get = (key: string) => typeof headers?.get === "function" ? headers.get(key) : (headers as Record<string, string> | undefined)?.[key];
  const ms = get("retry-after-ms") ?? get("x-ms-retry-after-ms");
  if (ms && Number.isFinite(Number(ms))) return Math.max(0, Number(ms));
  const seconds = get("retry-after");
  if (!seconds) return undefined;
  if (Number.isFinite(Number(seconds))) return Math.max(0, Number(seconds) * 1000);
  const date = Date.parse(seconds);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

export async function withRetry<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  config: Pick<AiConfig, "timeoutMs" | "maxRetries" | "retryBaseMs" | "retryMaxMs">,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: () => number = Math.random
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new AiError("PROVIDER_TIMEOUT", "AI provider request timed out.", true));
          }, config.timeoutMs);
        })
      ]);
    } catch (error) {
      const failure = classifyFailure(error);
      if (!failure.retryable || attempt >= config.maxRetries) {
        throw error instanceof AiError ? error : new AiError(failure.code, `AI provider failed (${failure.code}).`, failure.retryable);
      }
      const instructedDelay = retryAfter(error);
      // Do not retry sooner than the service asks. Leave long cooldowns to the queue.
      if (instructedDelay !== undefined && instructedDelay > config.retryMaxMs) {
        throw new AiError(failure.code, "AI provider cooldown exceeds the request retry budget.", true);
      }
      const backoff = Math.min(config.retryMaxMs, config.retryBaseMs * 2 ** attempt);
      if (timer) clearTimeout(timer);
      await sleep(instructedDelay ?? Math.round(backoff * (0.5 + random() * 0.5)));
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
