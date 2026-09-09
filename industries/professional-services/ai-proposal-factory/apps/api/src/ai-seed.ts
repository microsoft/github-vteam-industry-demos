import {
  AzureEmbeddingProvider, SeedIndexingService, createKnowledgeIndex, createOpenAITransport, createSeedIndexPort,
  loadAiConfig, type AiConfig
} from "@proposal-factory/ai";
import type { ContentRepository } from "@proposal-factory/domain";

/** Production seed hook; never called by requests or local startup. */
export async function seedAzureKnowledge(content: ContentRepository, config: AiConfig = loadAiConfig()) {
  await createKnowledgeIndex(config);
  const index = createSeedIndexPort(config);
  const embeddings = config.embeddingsEnabled
    ? new AzureEmbeddingProvider(config, createOpenAITransport(config)) : undefined;
  return new SeedIndexingService(config, index, embeddings).seed(await content.search(""));
}
