import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import OpenAI from "openai";
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";
import type { Citation, DocumentMetadata, Opportunity, Proposal, ProposalSectionKey } from "@proposal-factory/contracts";
import type { AiConfig } from "./config.js";
import { AiError, withRetry } from "./errors.js";
import { prompts } from "./prompts.js";
import type { EmbeddingProvider, ModelProvider } from "./providers.js";
import {
  draftSchema, parseOutput, requirementsSchema, riskSchema, sectionSchema,
  validateDraft, validateRequirements, validateRisks, validateSection,
  type RequirementsAnalysis, type StructuredDraft
} from "./schemas.js";

export interface OpenAITransport {
  complete(request: ChatCompletionCreateParamsNonStreaming, signal: AbortSignal): Promise<ChatCompletion>;
  embed(text: string, signal: AbortSignal): Promise<number[]>;
}

export function createAzureCredential(config: AiConfig) {
  return new DefaultAzureCredential(config.managedIdentityClientId
    ? { managedIdentityClientId: config.managedIdentityClientId } : {});
}

export function createOpenAITransport(config: AiConfig): OpenAITransport {
  if (config.provider !== "azure") throw new AiError("WRONG_PROVIDER", "Azure transport requires AI_PROVIDER=azure.");
  const client = new OpenAI({
    baseURL: `${config.openaiEndpoint}/openai/v1/`,
    apiKey: getBearerTokenProvider(createAzureCredential(config), "https://ai.azure.com/.default"),
    maxRetries: 0,
    timeout: config.timeoutMs
  });
  return {
    complete: (request, signal) => client.chat.completions.create(request, { signal }),
    embed: async (text, signal) => {
      const response = await client.embeddings.create({
        model: config.embeddingDeployment, input: text,
        dimensions: config.embeddingDimensions, encoding_format: "float"
      }, { signal });
      return response.data[0]?.embedding ?? [];
    }
  };
}

export function validateVector(vector: number[], dimensions: number) {
  if (vector.length !== dimensions || vector.some((value) => !Number.isFinite(value)) ||
      vector.every((value) => value === 0)) {
    throw new AiError("INVALID_EMBEDDING", "Embedding vector does not match the configured index dimensions.");
  }
  return vector;
}

export class AzureEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly config: AiConfig, private readonly transport: OpenAITransport) {}

  async embed(text: string) {
    if (!text.trim() || Buffer.byteLength(text, "utf8") > 8000) {
      throw new AiError("INPUT_LIMIT", "Embedding text exceeds the conservative 8000-byte token bound.");
    }
    return validateVector(await withRetry((signal) => this.transport.embed(text, signal), this.config), this.config.embeddingDimensions);
  }
}

export class AzureModelProvider implements ModelProvider {
  readonly mode = "azure" as const;
  readonly generationDeployment: string;
  constructor(private readonly config: AiConfig, private readonly transport: OpenAITransport) {
    this.generationDeployment = config.generationDeployment;
  }

  private async structured<T>(stage: keyof typeof prompts, schema: z.ZodType<T>, data: unknown): Promise<T> {
    const content = JSON.stringify({ trust: "untrusted_input_data", data });
    // UTF-8 bytes deliberately overestimate text tokens; reserve budget for schema/message framing.
    const format = zodResponseFormat(schema, stage.replaceAll("-", "_"));
    const bytes = Buffer.byteLength(content + prompts[stage] + JSON.stringify(format), "utf8");
    if (bytes > this.config.inputTokens) throw new AiError("INPUT_LIMIT", "AI input exceeds the configured conservative context budget.");
    const response = await withRetry((signal) => this.transport.complete({
      model: this.config.generationDeployment,
      messages: [{ role: "system", content: prompts[stage] }, { role: "user", content }],
      response_format: format,
      max_completion_tokens: this.config.outputTokens,
      reasoning_effort: "none",
      store: false
    }, signal), this.config);
    const choice = response.choices[0];
    if (!choice || choice.message.refusal || choice.finish_reason !== "stop" || !choice.message.content) {
      throw new AiError("MODEL_REFUSAL_OR_TRUNCATION", "Model refused, filtered or did not complete the structured response.");
    }
    if (Buffer.byteLength(choice.message.content, "utf8") > this.config.outputTokens * 16) {
      throw new AiError("INVALID_MODEL_OUTPUT", "Model output exceeds the response size limit.");
    }
    return parseOutput(schema, choice.message.content);
  }

  async analyze(opportunity: Opportunity, documents: DocumentMetadata[]) {
    if (documents.length > 20 || documents.some((doc) => doc.opportunityId && doc.opportunityId !== opportunity.id)) {
      throw new AiError("INVALID_SOURCE", "Selected customer documents exceed the limit or belong to another opportunity.");
    }
    return validateRequirements(await this.structured("requirements", requirementsSchema, {
      opportunity,
      documents: documents.map(({ id, name, kind, summary, source }) => ({ id, name, kind, summary, source }))
    }), documents.map((doc) => doc.id));
  }

  async draft(opportunity: Opportunity, requirements: RequirementsAnalysis, citations: Citation[]) {
    return validateDraft(await this.structured("drafting", draftSchema, { opportunity, requirements, citations }), citations);
  }

  async review(opportunity: Opportunity, requirements: RequirementsAnalysis, draft: StructuredDraft, citations: Citation[]) {
    return validateRisks(await this.structured("risk-review", riskSchema, { opportunity, requirements, draft, citations }), citations);
  }

  async regenerate(opportunity: Opportunity, requirements: RequirementsAnalysis, proposal: Proposal,
    key: ProposalSectionKey, citations: Citation[]) {
    const currentSections = proposal.sections.map((section) => ({
      key: section.key,
      content: section.revisions.find((rev) => rev.id === section.currentRevisionId)?.content ?? ""
    }));
    return validateSection(await this.structured("regeneration", sectionSchema,
      { opportunity, requirements, requestedSection: key, currentSections, citations }), citations);
  }
}
