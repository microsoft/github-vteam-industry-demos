import { parseDataProviderConfiguration } from "@proposal-factory/azure-data";
import { createApp } from "./app.js";
import { createAzureApplicationRuntime } from "./ai-azure-runtime.js";
import { loadAuthConfiguration } from "./auth.js";
import { resolveRepositoryPath } from "./runtime-paths.js";

loadAuthConfiguration();
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";
const dataConfiguration = parseDataProviderConfiguration();
const { app } =
  dataConfiguration.provider === "local"
    ? await createApp({
        dataFile: resolveRepositoryPath(process.env.LOCAL_DATA_FILE, ".data/proposal-factory.json"),
        uploadDirectory: resolveRepositoryPath(process.env.LOCAL_UPLOAD_DIRECTORY, ".data/uploads"),
        logger: true,
        dataProvider: "local"
      })
    : await (async () => {
        const runtime = createAzureApplicationRuntime();
        return createApp({
          store: runtime.store, ai: runtime.ai, workflow: runtime.workflow,
          clock: runtime.clock, ids: runtime.ids, logger: true, dataProvider: "azure",
          documentStorage: runtime.data.blobs.documents
        });
      })();

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
