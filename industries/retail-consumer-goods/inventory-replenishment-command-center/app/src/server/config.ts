export interface AppConfig {
  port: number;
  environment: "local" | "test" | "azure";
  authMode: "local" | "azure" | "public-demo";
  publicDemoOrigin?: string;
  stateMode: "file" | "memory" | "blob";
  localStatePath: string;
  storageAccountName?: string;
  storageContainerName: string;
  storageBlobName: string;
  managedIdentityClientId?: string;
  foundryProjectEndpoint?: string;
  foundryModelDeployment?: string;
  agentTimeoutMs: number;
}

export function loadConfig(environment = process.env.APP_ENV): AppConfig {
  const resolvedEnvironment =
    environment === "azure" || process.env.AZURE_CONTAINER_APP_NAME
      ? "azure"
      : environment === "test" || process.env.NODE_ENV === "test"
        ? "test"
        : "local";
  const configuredAuthMode = process.env.APP_AUTH_MODE;
  const authMode =
    configuredAuthMode === "azure" ||
    configuredAuthMode === "local" ||
    configuredAuthMode === "public-demo"
      ? configuredAuthMode
      : resolvedEnvironment === "azure"
        ? undefined
        : "local";
  if (!authMode) {
    throw new Error(
      "Azure runtime requires explicit APP_AUTH_MODE=public-demo or APP_AUTH_MODE=azure.",
    );
  }
  if (resolvedEnvironment === "azure" && authMode === "local") {
    throw new Error("Local/demo header authentication is forbidden in Azure.");
  }
  const publicDemoOrigin = process.env.PUBLIC_DEMO_ORIGIN;
  if (authMode === "public-demo") {
    if (resolvedEnvironment !== "azure") {
      throw new Error("APP_AUTH_MODE=public-demo is permitted only in the Azure runtime.");
    }
    if (!publicDemoOrigin) {
      throw new Error("PUBLIC_DEMO_ORIGIN is required for public-demo mode.");
    }
    const parsedOrigin = new URL(publicDemoOrigin);
    if (
      parsedOrigin.protocol !== "https:" ||
      parsedOrigin.origin !== publicDemoOrigin ||
      parsedOrigin.pathname !== "/"
    ) {
      throw new Error("PUBLIC_DEMO_ORIGIN must be an exact HTTPS origin with no path.");
    }
  }
  const configuredState = process.env.APP_STATE_MODE;
  const stateMode =
    configuredState === "blob" || configuredState === "memory" || configuredState === "file"
      ? configuredState
      : resolvedEnvironment === "azure"
        ? "blob"
        : resolvedEnvironment === "test"
          ? "memory"
          : "file";
  if (resolvedEnvironment === "azure" && stateMode !== "blob") {
    throw new Error("Azure runtime requires APP_STATE_MODE=blob.");
  }
  return {
    port: Number(process.env.PORT ?? 8080),
    environment: resolvedEnvironment,
    authMode,
    publicDemoOrigin,
    stateMode,
    localStatePath: process.env.LOCAL_STATE_PATH ?? "data/local-state.json",
    storageAccountName: process.env.AZURE_STORAGE_ACCOUNT_NAME,
    storageContainerName: process.env.AZURE_STORAGE_CONTAINER_NAME ?? "application-state",
    storageBlobName: process.env.AZURE_STORAGE_BLOB_NAME ?? "state.json",
    managedIdentityClientId: process.env.AZURE_CLIENT_ID,
    foundryProjectEndpoint: process.env.FOUNDRY_PROJECT_ENDPOINT,
    foundryModelDeployment: process.env.FOUNDRY_MODEL_DEPLOYMENT,
    agentTimeoutMs: Number(process.env.FOUNDRY_TIMEOUT_MS ?? 8000),
  };
}
