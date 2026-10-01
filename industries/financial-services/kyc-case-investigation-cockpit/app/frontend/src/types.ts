export type CaseSummary = {
  id: string;
  company: string;
  country: string;
  onboarding_type: string;
  submitted_date: string;
  status: string;
  risk_level: string;
  completeness: number;
  assigned_analyst: string;
  last_modified: string;
  scenario: string;
};

export type Extraction = {
  model_id: string;
  processed_at: string;
  page_count: number;
  content_excerpt: string;
  fields: Record<string, { value: string; evidence: string; confidence: number }>;
};

export type CaseDetail = CaseSummary & {
  profile: Record<string, string | string[]>;
  ownership: Array<Record<string, string | number>>;
  completeness_items: Array<{ requirement: string; status: string; evidence: string }>;
  documents: Array<{
    id: string;
    type: string;
    file_name: string;
    processing_status: string;
    confidence: number | null;
    extraction: Extraction | null;
    error: string | null;
  }>;
};

export type Evidence = {
  evidence_id: string;
  source_type: string;
  source_id: string;
  document_id: string | null;
  document_type: string | null;
  page_number: number | null;
  field_name: string;
  excerpt: string;
  value: string;
  confidence: number | null;
  content_url: string | null;
  search_index: string | null;
  search_score: number | null;
  source_label?: string;
};

export type Investigation = {
  investigation_id: string;
  case_id: string;
  status: "queued" | "running" | "failed" | "completed_with_warnings" | "completed";
  attempt: number;
  current_stage: string;
  percent_complete: number;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
  stages: Array<{
    stage: string;
    label: string;
    status: "pending" | "running" | "completed" | "failed" | "completed_with_warning";
    started_at: string | null;
    completed_at: string | null;
    message: string;
    retryable: boolean;
  }>;
  profile: {
    legal_company_name: SourceFact | null;
    registration_number: SourceFact | null;
    incorporation_country: SourceFact | null;
    incorporation_date: SourceFact | null;
    registered_address: SourceFact | null;
    trading_address: SourceFact | null;
    directors: Person[];
    authorised_representatives: Person[];
    beneficial_owners: Person[];
    ownership_relationships: Array<{
      relationship_id: string;
      owner_name: string;
      owned_entity_name: string;
      relationship: string;
      ownership_percentage: number | null;
      jurisdiction: string | null;
      evidence_refs: string[];
    }>;
    review_flags: Array<{ flag_id: string; category: string; description: string; evidence_refs: string[] }>;
  } | null;
  completeness: {
    findings: Array<{
      finding_id: string;
      requirement_id: string;
      requirement: string;
      status: string;
      evidence_refs: string[];
      missing_information: string[];
      explanation: string;
    }>;
    counts: Record<string, number>;
    completeness_percent: number;
    open_questions: string[];
  } | null;
  risk: {
    findings: Array<{
      finding_id: string;
      category: string;
      severity: string;
      title: string;
      description: string;
      evidence_refs: string[];
      source_labels: string[];
      confidence: string;
      recommended_analyst_action: string;
      potential_match: boolean;
      analyst_review_required: boolean;
    }>;
    screening_status: string;
    limitations: string[];
    open_questions: string[];
  } | null;
  summary: {
    customer_overview: string;
    ownership_summary: string;
    evidence_summary: string;
    risk_summary: string;
    open_questions: string[];
    recommended_next_action: string;
    recommendation_rationale: string;
    evidence_refs: string[];
    limitations: string[];
    advisory_only: boolean;
  } | null;
  evidence: Evidence[];
  agent_runs: Array<{
    agent_name: string;
    agent_version: string;
    response_id: string;
    completed_at: string;
  }>;
  error: { stage: string; code: string; user_message: string; retryable: boolean } | null;
};

export type SourceFact = {
  fact_id: string;
  field: string;
  value: string;
  confidence: number | null;
  evidence_refs: string[];
};

export type Person = {
  person_id: string;
  full_name: string;
  roles: string[];
  ownership_percentage: number | null;
  nationality_or_country: string | null;
  date_of_birth: string | null;
  evidence_refs: string[];
};

export type AuditEvent = {
  event_id: string;
  event_type: string;
  actor_type: "System" | "AI" | "Human";
  title: string;
  detail: string;
  occurred_at: string;
  metadata: Record<string, string>;
};
