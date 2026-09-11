export type RiskLevel = "Low" | "Medium" | "High";

export type CaseStatus =
  | "New"
  | "Investigating"
  | "Awaiting Information"
  | "Ready for Decision"
  | "Approved"
  | "Escalated";

export interface CaseListItem {
  id: string;
  company: string;
  country: string;
  onboarding_type: string;
  submitted_date: string;
  status: CaseStatus;
  risk_level: RiskLevel;
  completeness_percent: number;
  assigned_analyst: string;
  last_modified: string;
  scenario: string;
}

export interface ExtractedFact {
  field: string;
  value: string;
  source_document: string;
  confidence: number;
}

export interface CaseDocument {
  id: string;
  name: string;
  document_type: string;
  submitted_at: string;
  status: string;
  confidence: number;
  preview: string;
  extracted_facts: ExtractedFact[];
}

export interface OwnershipRelationship {
  owner: string;
  owned_entity: string;
  percentage: number;
  relationship: string;
  jurisdiction: string;
  source_document: string;
}

export interface CompletenessFinding {
  requirement: string;
  status: "Complete" | "Missing" | "Needs Review" | "Conflicting";
  evidence: string;
  explanation: string;
}

export interface RiskFinding {
  category: string;
  severity: RiskLevel;
  description: string;
  evidence: string;
  source: string;
  confidence: number;
  recommended_action: string;
}

export interface AnalystSummary {
  customer_overview: string;
  ownership_summary: string;
  evidence_summary: string;
  risk_summary: string;
  open_questions: string[];
  recommended_action: "Approve" | "Request More Information" | "Escalate";
  rationale: string;
  provider_mode: "deterministic-demo" | "live-azure";
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor_type: "System" | "AI Assistance" | "Human Analyst";
  actor: string;
  action: string;
  detail: string;
}

export interface KycCase extends CaseListItem {
  profile: {
    legal_name: string;
    registration_number: string;
    incorporation_country: string;
    incorporation_date: string;
    registered_address: string;
    trading_address: string;
    directors: { name: string; role: string; country: string }[];
  };
  documents: CaseDocument[];
  ownership: OwnershipRelationship[];
  completeness: CompletenessFinding[];
  risks: RiskFinding[];
  summary: AnalystSummary | null;
  decisions: {
    action: string;
    reason: string;
    analyst: string;
    timestamp: string;
  }[];
  audit: AuditEvent[];
}

export interface InvestigationResult {
  stages: string[];
  completeness: CompletenessFinding[];
  risks: RiskFinding[];
  summary: AnalystSummary;
  provider_mode: "deterministic-demo" | "live-azure";
  completed_at: string;
}

export interface InvestigationJob {
  id: string;
  case_id: string;
  status: "Running" | "Succeeded" | "Failed";
  current_stage: string;
  completed_stages: string[];
  partial_results: Record<string, unknown>;
  result: InvestigationResult | null;
  error: string | null;
  updated_at: string;
}

export interface InvestigationListItem {
  case_id: string;
  company: string;
  case_status: CaseStatus;
  investigation_status: "Not Started" | "Completed";
  risk_level: RiskLevel;
  latest_investigation_at: string | null;
  latest_investigation_status: string;
  recommended_action:
    | "Approve"
    | "Request More Information"
    | "Escalate"
    | null;
}

export interface DocumentListItem {
  case_id: string;
  company: string;
  document_id: string;
  document_type: string;
  name: string;
  status: string;
  submitted_at: string;
  confidence: number;
}

export interface AuditListItem {
  case_id: string;
  company: string;
  event_id: string;
  event_type: "System" | "AI Assistance" | "Human Analyst";
  timestamp: string;
  actor: string;
  action: string;
  description: string;
}
