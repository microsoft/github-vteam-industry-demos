from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class OpportunityCreate(BaseModel):
    customer: str = Field(min_length=2, max_length=120)
    name: str = Field(min_length=2, max_length=160)
    industry: str = Field(min_length=2, max_length=80)
    estimated_value: str = ""
    delivery_duration: str = ""
    business_problem: str = ""
    expected_outcomes: list[str] = Field(default_factory=list)
    scope: str = ""
    stakeholders: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    target_timeline: str = ""
    budget_assumptions: str = ""
    notes: str = ""


class OpportunityUpdate(BaseModel):
    customer: str | None = None
    name: str | None = None
    industry: str | None = None
    estimated_value: str | None = None
    delivery_duration: str | None = None
    business_problem: str | None = None
    expected_outcomes: list[str] | None = None
    scope: str | None = None
    stakeholders: list[str] | None = None
    constraints: list[str] | None = None
    target_timeline: str | None = None
    budget_assumptions: str | None = None
    notes: str | None = None


class Opportunity(OpportunityCreate):
    id: str
    status: str = "Discovery"
    proposal_progress: int = 0
    proposal_id: str | None = None
    created_at: str = Field(default_factory=utc_now)
    updated_at: str = Field(default_factory=utc_now)


class Document(BaseModel):
    id: str
    opportunity_id: str
    filename: str
    content_type: str
    content: str = ""
    selected: bool = True
    seeded: bool = False
    blob_name: str | None = None
    created_at: str = Field(default_factory=utc_now)


class KnowledgeItem(BaseModel):
    id: str
    title: str
    type: Literal[
        "Proposal Snippet",
        "Case Study",
        "Methodology",
        "Service Description",
        "Template",
        "Pricing & Effort",
    ]
    industry: str = "Cross-industry"
    tags: list[str] = Field(default_factory=list)
    content: str
    source: str


class ProposalSection(BaseModel):
    id: str
    title: str
    content: str
    order: int
    status: Literal["Draft", "Generated", "In Review", "Approved"] = "Generated"
    source_references: list[str] = Field(default_factory=list)
    updated_at: str = Field(default_factory=utc_now)


class RiskFinding(BaseModel):
    id: str
    severity: Literal["Low", "Medium", "High"]
    category: Literal[
        "Risk", "Assumption", "Dependency", "Missing Information", "Open Question"
    ]
    description: str
    mitigation: str


class Proposal(BaseModel):
    id: str
    opportunity_id: str
    title: str
    status: Literal["Draft", "Generated", "In Review", "Approved"] = "Generated"
    requirements_analysis: dict[str, object] = Field(default_factory=dict)
    sections: list[ProposalSection] = Field(default_factory=list)
    risks: list[RiskFinding] = Field(default_factory=list)
    created_at: str = Field(default_factory=utc_now)
    updated_at: str = Field(default_factory=utc_now)


class AuditEvent(BaseModel):
    id: str
    opportunity_id: str | None = None
    proposal_id: str | None = None
    event_type: str
    message: str
    timestamp: str = Field(default_factory=utc_now)


class GenerationJob(BaseModel):
    id: str
    opportunity_id: str
    status: Literal["queued", "running", "completed", "failed"] = "queued"
    progress: int = 0
    current_step: str = "Queued"
    proposal_id: str | None = None
    error: str | None = None
    retryable: bool = False
    updated_at: str = Field(default_factory=utc_now)
