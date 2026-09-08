export interface AiConfig {
  provider: "fixture" | "azure";
  region: "swedencentral";
  openaiEndpoint: string;
  searchEndpoint: string;
  generationDeployment: string;
  embeddingDeployment: string;
  openaiApiVersion: "v1";
  searchApiVersion: "2025-09-01";
  searchIndex: string;
  embeddingsEnabled: boolean;
  embeddingDimensions: number;
  embeddingVersion: string;
  topK: number;
  vectorK: number;
  contextTokens: number;
  inputTokens: number;
  outputTokens: number;
  timeoutMs: number;
  maxRetries: number;
  retryBaseMs: number;
  retryMaxMs: number;
  managedIdentityClientId?: string;
}

export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

function integer(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number) {
  const raw = env[key] ?? String(fallback);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new AiConfigurationError(`${key} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function endpoint(value: string | undefined, key: string, suffixes: string[], required: boolean) {
  if (!value) {
    if (required) throw new AiConfigurationError(`${key} is required in azure mode.`);
    return "";
  }
  let url: URL;
  try { url = new URL(value); } catch { throw new AiConfigurationError(`${key} must be an Azure HTTPS resource endpoint.`); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      url.port || url.pathname !== "/" || !suffixes.some((suffix) => url.hostname.endsWith(suffix))) {
    throw new AiConfigurationError(`${key} must be an Azure HTTPS resource root, without path, credentials or query.`);
  }
  return url.origin;
}

export function loadAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const provider = env.AI_PROVIDER ?? "fixture";
  if (provider !== "fixture" && provider !== "azure") throw new AiConfigurationError("AI_PROVIDER must be fixture or azure.");
  if ((env.AZURE_LOCATION ?? "swedencentral") !== "swedencentral") {
    throw new AiConfigurationError("Only swedencentral is supported; no regional fallback is configured.");
  }
  if ((env.AZURE_OPENAI_API_VERSION ?? "v1") !== "v1") {
    throw new AiConfigurationError("AZURE_OPENAI_API_VERSION must be v1 (OpenAI 7.8.0 GA v1 client).");
  }
  if ((env.AZURE_SEARCH_API_VERSION ?? "2025-09-01") !== "2025-09-01") {
    throw new AiConfigurationError("AZURE_SEARCH_API_VERSION must be 2025-09-01 (@azure/search-documents 13.0.0).");
  }
  const generationDeployment = env.AZURE_OPENAI_GENERATION_DEPLOYMENT ?? "proposal-chat";
  const embeddingDeployment = env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT ?? "proposal-embeddings";
  for (const [key, value] of Object.entries({ generationDeployment, embeddingDeployment })) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value)) throw new AiConfigurationError(`Invalid ${key}.`);
  }
  const searchIndex = env.AZURE_SEARCH_INDEX ?? "proposal-knowledge-v1";
  if (!/^[a-z0-9][a-z0-9-]{0,126}[a-z0-9]$/.test(searchIndex) || searchIndex.includes("--")) {
    throw new AiConfigurationError("AZURE_SEARCH_INDEX must be a valid Search index name.");
  }
  const enabled = env.AI_EMBEDDINGS_ENABLED ?? "true";
  if (enabled !== "true" && enabled !== "false") throw new AiConfigurationError("AI_EMBEDDINGS_ENABLED must be true or false.");
  const config: AiConfig = {
    provider, region: "swedencentral",
    openaiEndpoint: endpoint(env.AZURE_OPENAI_ENDPOINT, "AZURE_OPENAI_ENDPOINT",
      [".openai.azure.com", ".cognitiveservices.azure.com", ".services.ai.azure.com"], provider === "azure"),
    searchEndpoint: endpoint(env.AZURE_SEARCH_ENDPOINT, "AZURE_SEARCH_ENDPOINT", [".search.windows.net"], provider === "azure"),
    generationDeployment, embeddingDeployment, searchIndex,
    openaiApiVersion: "v1", searchApiVersion: "2025-09-01",
    embeddingsEnabled: enabled === "true",
    embeddingDimensions: integer(env, "AI_EMBEDDING_DIMENSIONS", 3072, 256, 3072),
    embeddingVersion: "text-embedding-3-large:1",
    topK: integer(env, "AI_RETRIEVAL_TOP_K", 8, 1, 20),
    vectorK: integer(env, "AI_VECTOR_K", 30, 1, 50),
    contextTokens: integer(env, "AI_CONTEXT_TOKENS", 64000, 8192, 128000),
    inputTokens: integer(env, "AI_MAX_INPUT_TOKENS", 40000, 4096, 100000),
    outputTokens: integer(env, "AI_MAX_OUTPUT_TOKENS", 16000, 4096, 32000),
    timeoutMs: integer(env, "AI_REQUEST_TIMEOUT_MS", 120000, 1000, 300000),
    maxRetries: integer(env, "AI_MAX_RETRIES", 3, 0, 5),
    retryBaseMs: integer(env, "AI_RETRY_BASE_MS", 500, 1, 10000),
    retryMaxMs: integer(env, "AI_RETRY_MAX_MS", 30000, 100, 120000),
    ...(env.AZURE_CLIENT_ID ? { managedIdentityClientId: env.AZURE_CLIENT_ID } : {})
  };
  if (config.inputTokens + config.outputTokens + 2048 > config.contextTokens) {
    throw new AiConfigurationError("Input + output + 2048 safety tokens must fit AI_CONTEXT_TOKENS.");
  }
  if (config.vectorK < config.topK) throw new AiConfigurationError("AI_VECTOR_K must be at least AI_RETRIEVAL_TOP_K.");
  if (config.retryBaseMs > config.retryMaxMs) throw new AiConfigurationError("Retry base must not exceed retry maximum.");
  if (config.managedIdentityClientId && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(config.managedIdentityClientId)) {
    throw new AiConfigurationError("AZURE_CLIENT_ID must be a managed identity client UUID.");
  }
  return Object.freeze(config);
}
