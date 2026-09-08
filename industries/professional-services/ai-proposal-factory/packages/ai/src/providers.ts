import type { Citation, DocumentMetadata, Opportunity, Proposal, ProposalSectionKey } from "@proposal-factory/contracts";
import type { DraftSection, RequirementsAnalysis, RiskReview, StructuredDraft } from "./schemas.js";

export interface ModelProvider {
  readonly mode: "fixture" | "azure";
  readonly generationDeployment?: string;
  analyze(opportunity: Opportunity, documents: DocumentMetadata[]): Promise<RequirementsAnalysis>;
  draft(opportunity: Opportunity, requirements: RequirementsAnalysis, citations: Citation[]): Promise<StructuredDraft>;
  review(opportunity: Opportunity, requirements: RequirementsAnalysis, draft: StructuredDraft, citations: Citation[]): Promise<RiskReview>;
  regenerate(opportunity: Opportunity, requirements: RequirementsAnalysis, proposal: Proposal,
    key: ProposalSectionKey, citations: Citation[]): Promise<DraftSection>;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

export interface RetrievalResult {
  citations: Citation[];
  mode: "fixture" | "hybrid" | "keyword";
  warnings: string[];
  activity?: {
    successfulRetrievalOperations: number;
    successfulEmbeddingOperations: number;
    fallbacks: string[];
    searchIndex?: string;
    embeddingDeployment?: string;
  };
}

export interface KnowledgeRetriever {
  retrieveEvidence(opportunity: Opportunity, requirements?: RequirementsAnalysis, limit?: number): Promise<RetrievalResult>;
}
