from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

CaseStatus = Literal[
    "New",
    "Investigating",
    "Awaiting Information",
    "Ready for Decision",
    "Approved",
    "Escalated",
]
RiskLevel = Literal["Low", "Medium", "High"]


class ExtractedFact(BaseModel):
    field: str
    value: str
    source_document: str
    confidence: float = Field(ge=0, le=1)


class DocumentExtractionResult(BaseModel):
    document_id: str
    document_name: str
    model_id: str
    provider_mode: Literal["deterministic-demo", "live-azure"]
    content: str
    facts: list[ExtractedFact]


class ExtractionInterpretation(BaseModel):
    facts: list[ExtractedFact]
    warnings: list[str]


class FoundryStageResult(BaseModel):
    stage: Literal["extract", "complete", "risk", "summary"]
    agent_name: str
    provider_mode: Literal["live-azure"]
    result: dict


class Document(BaseModel):
    id: str
    name: str
    document_type: str
    submitted_at: str
    status: str = "Ready"
    confidence: float = Field(ge=0, le=1)
    preview: str
    extracted_facts: list[ExtractedFact] = []


class Person(BaseModel):
    name: str
    role: str
    country: str


class OwnershipRelationship(BaseModel):
    owner: str
    owned_entity: str
    percentage: float
    relationship: str
    jurisdiction: str
    source_document: str


class CompletenessFinding(BaseModel):
    requirement: str
    status: Literal["Complete", "Missing", "Needs Review", "Conflicting"]
    evidence: str
    explanation: str


class RiskFinding(BaseModel):
    category: str
    severity: RiskLevel
    description: str
    evidence: str
    source: str
    confidence: float = Field(ge=0, le=1)
    recommended_action: str


class AnalystSummary(BaseModel):
    customer_overview: str
    ownership_summary: str
    evidence_summary: str
    risk_summary: str
    open_questions: list[str]
    recommended_action: Literal["Approve", "Request More Information", "Escalate"]
    rationale: str
    provider_mode: Literal["deterministic-demo", "live-azure"]


class AuditEvent(BaseModel):
    id: str
    timestamp: str
    actor_type: Literal["System", "AI Assistance", "Human Analyst"]
    actor: str
    action: str
    detail: str


class AnalystDecision(BaseModel):
    action: Literal["Approve", "Request More Information", "Escalate"]
    reason: str = Field(min_length=1)
    analyst: str = Field(min_length=1)
    timestamp: str


class InvestigationResult(BaseModel):
    stages: list[str]
    completeness: list[CompletenessFinding]
    risks: list[RiskFinding]
    summary: AnalystSummary
    provider_mode: Literal["deterministic-demo", "live-azure"]
    completed_at: str


class InvestigationJob(BaseModel):
    id: str
    case_id: str
    status: Literal["Running", "Succeeded", "Failed"]
    current_stage: str
    completed_stages: list[str] = Field(default_factory=list)
    partial_results: dict = Field(default_factory=dict)
    result: InvestigationResult | None = None
    error: str | None = None
    updated_at: str


class CompanyProfile(BaseModel):
    legal_name: str
    registration_number: str
    incorporation_country: str
    incorporation_date: str
    registered_address: str
    trading_address: str
    directors: list[Person]


class KycCase(BaseModel):
    id: str
    company: str
    country: str
    onboarding_type: str
    submitted_date: str
    status: CaseStatus
    risk_level: RiskLevel
    completeness_percent: int
    assigned_analyst: str
    last_modified: str
    scenario: str
    profile: CompanyProfile
    documents: list[Document]
    ownership: list[OwnershipRelationship]
    completeness: list[CompletenessFinding] = []
    risks: list[RiskFinding] = []
    summary: AnalystSummary | None = None
    decisions: list[AnalystDecision] = []
    audit: list[AuditEvent] = []


class CaseListItem(BaseModel):
    id: str
    company: str
    country: str
    onboarding_type: str
    submitted_date: str
    status: CaseStatus
    risk_level: RiskLevel
    completeness_percent: int
    assigned_analyst: str
    last_modified: str
    scenario: str


class InvestigationListItem(BaseModel):
    case_id: str
    company: str
    case_status: CaseStatus
    investigation_status: Literal["Not Started", "Completed"]
    risk_level: RiskLevel
    latest_investigation_at: str | None
    latest_investigation_status: str
    recommended_action: (
        Literal["Approve", "Request More Information", "Escalate"] | None
    )


class DocumentListItem(BaseModel):
    case_id: str
    company: str
    document_id: str
    document_type: str
    name: str
    status: str
    submitted_at: str
    confidence: float = Field(ge=0, le=1)


class AuditListItem(BaseModel):
    case_id: str
    company: str
    event_id: str
    event_type: Literal["System", "AI Assistance", "Human Analyst"]
    timestamp: str
    actor: str
    action: str
    description: str


class DecisionRequest(BaseModel):
    action: Literal["Approve", "Request More Information", "Escalate"]
    reason: str = Field(min_length=1)
    analyst: str = Field(default="Alex Rivera", min_length=1)


class ScreeningRecord(BaseModel):
    id: str
    name: str
    aliases: list[str]
    country: str
    entity_type: Literal["Person", "Organisation"]
    category: str
    synthetic_risk_description: str


def utc_now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")
