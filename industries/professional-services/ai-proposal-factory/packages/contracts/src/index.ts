export const proposalSectionKeys = [
  "executive-summary",
  "customer-challenges",
  "proposed-solution",
  "scope",
  "deliverables",
  "delivery-approach",
  "milestones",
  "assumptions",
  "dependencies",
  "risks",
  "success-criteria",
  "next-steps"
] as const;

export type ProposalSectionKey = (typeof proposalSectionKeys)[number];

export const proposalSectionTitles: Record<ProposalSectionKey, string> = {
  "executive-summary": "Executive Summary",
  "customer-challenges": "Customer Challenges",
  "proposed-solution": "Proposed Solution",
  scope: "Scope",
  deliverables: "Deliverables",
  "delivery-approach": "Delivery Approach",
  milestones: "Milestones",
  assumptions: "Assumptions",
  dependencies: "Dependencies",
  risks: "Risks",
  "success-criteria": "Success Criteria",
  "next-steps": "Next Steps"
};

export type ProposalStatus =
  | "Draft"
  | "Generating"
  | "Generated"
  | "In Review"
  | "Approved"
  | "Generation Failed";

export type OpportunityStatus = "Discovery" | "Qualified" | "Proposal" | "Negotiation" | "Won";
export type ScenarioCategory =
  | "Cloud modernization"
  | "AI adoption"
  | "Data platform modernization"
  | "Application modernization"
  | "Customer service transformation";

export interface OpportunityInput {
  customerName: string;
  name: string;
  industry: string;
  estimatedValue: number;
  expectedDurationWeeks: number;
  businessProblem: string;
  expectedOutcomes: string[];
  scope: string;
  stakeholders: string[];
  constraints: string[];
  targetTimeline: string;
  budgetAssumptions: string;
  additionalNotes: string;
  scenario: ScenarioCategory;
}

export interface Opportunity extends OpportunityInput {
  id: string;
  status: OpportunityStatus;
  proposalStatus: ProposalStatus;
  proposalProgress: number;
  selectedDocumentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type DocumentKind = "Meeting Notes" | "Requirements" | "Project Brief" | "Pricing";

export interface DocumentMetadata {
  id: string;
  opportunityId?: string;
  name: string;
  kind: DocumentKind;
  contentType: string;
  sizeBytes: number;
  source: "Fixture" | "Upload";
  summary: string;
  extractedText?: string;
  storageProvider?: "Local" | "Azure";
  storageKey?: string;
  sha256?: string;
  extractionMethod?: "Plain Text" | "DOCX" | "PDF";
  extractedTextCharacters?: number;
  createdAt: string;
}

export type ContentKind =
  | "Proposal Snippet"
  | "Case Study"
  | "Delivery Methodology"
  | "Service Description"
  | "Pricing Assumption";

export interface ReusableContent {
  id: string;
  title: string;
  kind: ContentKind;
  scenario: ScenarioCategory;
  industries: string[];
  tags: string[];
  summary: string;
  body: string;
  updatedAt: string;
}

export type ReusableContentInput = Omit<ReusableContent, "id" | "updatedAt">;

export interface ContentIndexingEvidence {
  provider: "local" | "azure";
  librarySearch: "available";
  retrievalIndex: "available" | "pending";
  message: string;
}

export interface ContentLibraryEntry extends ReusableContent {
  indexing: ContentIndexingEvidence;
}

export interface Citation {
  id: string;
  contentId: string;
  title: string;
  kind: ContentKind;
  excerpt: string;
  relevance: number;
}

export type RetrievalMode = "pending" | "fixture" | "hybrid" | "keyword" | "unknown";

export interface RetrievalPreview {
  citations: Citation[];
  mode: Exclude<RetrievalMode, "pending" | "unknown">;
  warnings: string[];
}

export interface OpportunityBriefDocument {
  id: string;
  name: string;
  kind: DocumentKind;
  contentType: string;
  sizeBytes: number;
  source: DocumentMetadata["source"];
  storageProvider?: DocumentMetadata["storageProvider"];
  extractionMethod?: DocumentMetadata["extractionMethod"];
  createdAt: string;
}

export interface OpportunityBrief {
  opportunityId: string;
  facts: OpportunityInput;
  selectedDocuments: OpportunityBriefDocument[];
}

export type RiskSeverity = "Low" | "Medium" | "High";
export type RiskCategory = "Assumption" | "Delivery Risk" | "Dependency" | "Missing Information" | "Open Question";

export interface RiskFinding {
  id: string;
  severity: RiskSeverity;
  category: RiskCategory;
  title: string;
  description: string;
  mitigation: string;
}

export type RevisionSource = "Generated" | "Manual Edit" | "Regenerated";

export interface ProposalSectionRevision {
  id: string;
  revision: number;
  content: string;
  source: RevisionSource;
  citationIds: string[];
  createdAt: string;
  approvedAt?: string;
  approvedBy?: AuditActor;
}

export interface SectionApprovalRequest {
  expectedRevisionId: string;
}

export interface ProposalApprovalRequest {
  expectedReviewVersion: string;
}

export interface ProposalSection {
  key: ProposalSectionKey;
  title: string;
  required: true;
  currentRevisionId: string;
  approvedRevisionId?: string;
  revisions: ProposalSectionRevision[];
}

export interface Proposal {
  id: string;
  opportunityId: string;
  title: string;
  status: ProposalStatus;
  /** Opaque review-set version, changed by generation, edits, regeneration and section approvals. */
  reviewVersion: string;
  generationRunId?: string;
  sections: ProposalSection[];
  risks: RiskFinding[];
  citations: Citation[];
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: AuditActor;
  approvedReviewVersion?: string;
}

export type GenerationStageKey = "requirements" | "retrieval" | "drafting" | "risk-review";
export type GenerationStageStatus = "Pending" | "Running" | "Complete" | "Failed";
export type GenerationExecutionMode = "not-executed" | "deterministic" | "model-backed" | "service-backed";

export interface GenerationStage {
  key: GenerationStageKey;
  label: string;
  detail: string;
  status: GenerationStageStatus;
  execution: GenerationExecutionMode;
  completedOperations: number;
}

export interface GenerationProviderEvidence {
  provider: "fixture" | "azure" | "unknown";
  successfulModelOperations: number;
  successfulRetrievalOperations: number;
  successfulEmbeddingOperations: number;
  deterministicOperations: number;
  fallbacks: string[];
  generationDeployment?: string;
  embeddingDeployment?: string;
  searchIndex?: string;
  legacyEvidenceUnavailable?: boolean;
}

export interface GenerationRun {
  requestedBy?: AuditActor;
  id: string;
  opportunityId: string;
  proposalId: string;
  status: "Running" | "Complete" | "Failed";
  progress: number;
  stages: GenerationStage[];
  retrievedContentIds: string[];
  opportunityBrief?: OpportunityBrief;
  retrieval: {
    mode: RetrievalMode;
    warnings: string[];
  };
  providerEvidence: GenerationProviderEvidence;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export function normalizeGenerationRun(run: GenerationRun): GenerationRun {
  const legacy = !run.providerEvidence;
  return {
    ...run,
    stages: run.stages.map((stage) => ({
      ...stage,
      execution: stage.execution ?? "not-executed",
      completedOperations: stage.completedOperations ?? 0
    })),
    retrieval: run.retrieval ?? { mode: "unknown", warnings: ["Retrieval evidence was not recorded for this legacy run."] },
    providerEvidence: run.providerEvidence ?? {
      provider: "unknown",
      successfulModelOperations: 0,
      successfulRetrievalOperations: 0,
      successfulEmbeddingOperations: 0,
      deterministicOperations: 0,
      fallbacks: [],
      legacyEvidenceUnavailable: true
    },
    ...(legacy && !run.opportunityBrief ? {} : { opportunityBrief: run.opportunityBrief })
  };
}

export type AuditEventType =
  | "Opportunity Created"
  | "Documents Selected"
  | "Document Uploaded"
  | "Proposal Generation Started"
  | "Proposal Generated"
  | "Proposal Generation Failed"
  | "Section Edited"
  | "Section Regenerated"
  | "Section Approved"
  | "Proposal Approved"
  | "Proposal Exported";

export interface AuditActor {
  actor: string;
  actorId: string;
  actorTenantId: string;
  actorType: "User" | "Development";
}

export interface AuditEvent {
  id: string;
  opportunityId: string;
  proposalId?: string;
  type: AuditEventType;
  actor: string;
  /** Historical seed events may lack identity; all new authenticated events include these fields. */
  actorId?: string;
  actorTenantId?: string;
  actorType?: AuditActor["actorType"];
  description: string;
  metadata: Record<string, string | number | boolean>;
  occurredAt: string;
}

export interface ExportResult {
  id: string;
  proposalId: string;
  format: "markdown" | "pdf";
  fileName: string;
  contentType: string;
  createdAt: string;
}

export interface DashboardSummary {
  opportunities: number;
  activeValue: number;
  proposalsInReview: number;
  approvedProposals: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
