import { loadAiConfig } from "@proposal-factory/ai";
import { parseDataProviderConfiguration } from "@proposal-factory/azure-data";
import { seedAzureKnowledge } from "../apps/api/src/ai-seed.js";
import { createAzureApplicationRuntime } from "../apps/api/src/ai-azure-runtime.js";
import { seedAzureDemoData } from "../apps/api/src/azure-data/seed-demo.js";

const help = `AI Proposal Factory Azure seed/index job

Usage:
  node containers/dist/seed-entrypoint.js [--dry-run]

Options:
  --dry-run  Validate Azure configuration and exit without network calls.
  --help     Show this help.
`;

async function main(args: string[]) {
  if (args.includes("--help")) {
    process.stdout.write(help);
    return;
  }
  const unknown = args.filter((arg) => arg !== "--dry-run");
  if (unknown.length > 0) throw new Error(`Unknown seed option: ${unknown.join(", ")}`);

  const dataConfig = parseDataProviderConfiguration(process.env);
  const aiConfig = loadAiConfig(process.env);
  if (dataConfig.provider !== "azure" || aiConfig.provider !== "azure") {
    throw new Error("The production seed job requires DATA_PROVIDER=azure and AI_PROVIDER=azure.");
  }

  if (args.includes("--dry-run")) {
    console.log(JSON.stringify({
      mode: "dry-run",
      location: dataConfig.azure.location,
      database: dataConfig.azure.cosmos.database,
      searchIndex: aiConfig.searchIndex,
      generationDeployment: aiConfig.generationDeployment,
      embeddingDeployment: aiConfig.embeddingDeployment
    }));
    console.log("Dry run complete; no Azure calls were made.");
    return;
  }

  const runtime = createAzureApplicationRuntime(process.env);
  const dataReport = await seedAzureDemoData(runtime.data);
  const searchReport = await seedAzureKnowledge(runtime.store, runtime.ai.config);
  console.log(JSON.stringify({ data: dataReport, search: searchReport }));
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown seed failure.";
  console.error(`Seed job failed: ${message}`);
  process.exitCode = 1;
});
