export interface Opportunity {
  id: string;
  customer: string;
  name: string;
  industry: string;
  estimatedValue: string;
  duration: string;
  status: string;
  progress: number;
  modifiedAt: string;
  businessProblem: string;
  expectedOutcomes: string[];
  scope: string[];
  stakeholders: string[];
  constraints: string[];
  targetTimeline: string;
  budgetAssumptions: string;
  notes: string;
}

export interface Document {
  id: string;
  opportunityId: string;
  name: string;
  content: string;
  contentType: string;
}

export interface Generation {
  generation_id: string;
  status: string;
  progress_message: string;
  proposal_id?: string;
  error?: string;
}

export interface ProposalSection {
  id: string;
  title: string;
  order: number;
  content: string;
  sourceIds: string[];
  status: "Generated" | "In Review" | "Approved";
  updatedAt: string;
  approvedAt?: string;
  sources: KnowledgeSource[];
}

export interface KnowledgeSource {
  id: string;
  title: string;
  kind: string;
  industry: string;
  tags: string[];
  sourceBlobName: string;
  snippet: string;
}

export interface KnowledgeItem extends Omit<KnowledgeSource, "snippet"> {
  content: string;
}

export interface RiskFinding {
  id: string;
  severity: "Low" | "Medium" | "High";
  category: string;
  description: string;
  mitigationOrQuestion: string;
  status: "Open" | "Acknowledged";
  disposition?: string;
  acknowledgedAt?: string;
  relatedSectionIds: string[];
}

export interface Proposal {
  id: string;
  opportunityId: string;
  customer: string;
  opportunityName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  sections: ProposalSection[];
  riskFindings: RiskFinding[];
  requirementsAnalysis: {
    businessGoals: string[];
    openQuestions: string[];
    missingInformation: string[];
  };
}

export interface AuditEvent {
  id: string;
  eventType: string;
  proposalId?: string;
  sectionId?: string;
  actorType: "user" | "system";
  actorId?: string;
  summary: string;
  createdAt: string;
  details?: Record<string, unknown>;
}
