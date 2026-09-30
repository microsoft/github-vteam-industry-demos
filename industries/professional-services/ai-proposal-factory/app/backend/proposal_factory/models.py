from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


class Opportunity(BaseModel):
    id: str
    customer: str
    name: str
    industry: str
    estimatedValue: str
    duration: str
    status: str
    progress: int = Field(ge=0, le=100)
    modifiedAt: str
    businessProblem: str
    expectedOutcomes: list[str]
    scope: list[str]
    stakeholders: list[str]
    constraints: list[str]
    targetTimeline: str
    budgetAssumptions: str
    notes: str


class Document(BaseModel):
    id: str
    opportunityId: str
    name: str
    content: str
    contentType: str = "text/markdown"


class KnowledgeItem(BaseModel):
    id: str
    title: str
    content: str
    kind: str
    industry: str
    tags: list[str]
    sourceBlobName: str


GenerationStatus = Literal[
    "queued",
    "analysing_requirements",
    "searching_knowledge",
    "drafting_proposal",
    "reviewing_risks",
    "saving",
    "completed",
    "failed",
]


class GenerationJob(BaseModel):
    id: str
    opportunityId: str
    status: GenerationStatus
    progressMessage: str
    proposalId: str | None = None
    error: str | None = None
    createdAt: str = Field(default_factory=utc_now)
    updatedAt: str = Field(default_factory=utc_now)


class ProposalSection(BaseModel):
    id: str
    title: str
    order: int
    content: str
    sourceIds: list[str] = Field(default_factory=list)
    status: Literal["Generated", "In Review", "Approved"] = "Generated"
    updatedAt: str = Field(default_factory=utc_now)
    approvedAt: str | None = None


class RiskFinding(BaseModel):
    id: str
    severity: Literal["Low", "Medium", "High"]
    category: str
    description: str
    mitigationOrQuestion: str
    status: Literal["Open", "Acknowledged"] = "Open"
    disposition: str | None = None
    acknowledgedAt: str | None = None
    relatedSectionIds: list[str] = Field(default_factory=list)


class RequirementsAnalysis(BaseModel):
    businessGoals: list[str]
    businessProblems: list[str]
    expectedOutcomes: list[str]
    scope: list[str]
    stakeholders: list[str]
    constraints: list[str]
    successCriteria: list[str]
    timeline: str
    budgetEffortAssumptions: list[str]
    openQuestions: list[str]
    missingInformation: list[str]

    @field_validator("timeline", mode="before")
    @classmethod
    def normalise_timeline(cls, value):
        if isinstance(value, list):
            return "; ".join(str(item) for item in value)
        return value


class Proposal(BaseModel):
    id: str
    opportunityId: str
    customer: str
    opportunityName: str
    status: str = "Generated"
    createdAt: str = Field(default_factory=utc_now)
    updatedAt: str = Field(default_factory=utc_now)
    approvedAt: str | None = None
    requirementsAnalysis: RequirementsAnalysis
    sections: list[ProposalSection]
    riskFindings: list[RiskFinding]


class GenerateRequest(BaseModel):
    document_ids: list[str] = Field(min_length=1)


class GenerateResponse(BaseModel):
    generation_id: str
    status: str


class SectionUpdateRequest(BaseModel):
    content: str = Field(min_length=1)

    @field_validator("content")
    @classmethod
    def reject_blank_content(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Section content cannot be empty.")
        return value


class SectionRegenerateRequest(BaseModel):
    instruction: str | None = Field(default=None, max_length=2000)

    @field_validator("instruction")
    @classmethod
    def normalise_instruction(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class RiskActionRequest(BaseModel):
    acknowledged: bool = True
    disposition: str | None = Field(default=None, max_length=2000)

    @field_validator("disposition")
    @classmethod
    def normalise_disposition(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class AuditEvent(BaseModel):
    id: str
    eventType: str
    opportunityId: str
    proposalId: str | None = None
    sectionId: str | None = None
    actorType: Literal["user", "system"] = "user"
    actorId: str | None = "demo-user"
    summary: str
    createdAt: str = Field(default_factory=utc_now)
    details: dict[str, Any] | None = None
