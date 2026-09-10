export type Opportunity = {
  id: string;
  customer: string;
  name: string;
  industry: string;
  estimated_value: string;
  delivery_duration: string;
  business_problem: string;
  expected_outcomes: string[];
  scope: string;
  stakeholders: string[];
  constraints: string[];
  target_timeline: string;
  budget_assumptions: string;
  notes: string;
  status: string;
  proposal_progress: number;
  proposal_id?: string;
  updated_at: string;
};

export type OpportunityCreate = Omit<
  Opportunity,
  "id" | "status" | "proposal_progress" | "proposal_id" | "updated_at"
>;

export type Document = {
  id: string;
  opportunity_id: string;
  filename: string;
  content_type: string;
  selected: boolean;
  seeded: boolean;
  created_at: string;
};

export type KnowledgeItem = {
  id: string;
  title: string;
  type: string;
  industry: string;
  tags: string[];
  content: string;
  source: string;
};

export type ProposalSection = {
  id: string;
  title: string;
  content: string;
  order: number;
  status: "Draft" | "Generated" | "In Review" | "Approved";
  source_references: string[];
};

export type RiskFinding = {
  id: string;
  severity: "Low" | "Medium" | "High";
  category: string;
  description: string;
  mitigation: string;
};

export type Proposal = {
  id: string;
  opportunity_id: string;
  title: string;
  status: "Draft" | "Generated" | "In Review" | "Approved";
  requirements_analysis: Record<string, unknown>;
  sections: ProposalSection[];
  risks: RiskFinding[];
  updated_at: string;
};

export type AuditEvent = {
  id: string;
  opportunity_id?: string;
  proposal_id?: string;
  event_type: string;
  message: string;
  timestamp: string;
};

export type GenerationJob = {
  id: string;
  opportunity_id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  current_step: string;
  proposal_id?: string;
  error?: string;
  retryable: boolean;
};
