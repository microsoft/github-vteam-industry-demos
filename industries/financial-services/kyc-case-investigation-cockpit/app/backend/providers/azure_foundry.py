import json
import time
from difflib import SequenceMatcher
from threading import Lock
from typing import Any, Literal, TypeVar

from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential
from pydantic import BaseModel, ConfigDict, ValidationError

from app.backend.models.domain import (
    AnalystSummary,
    CompletenessFinding,
    ExtractedFact,
    ExtractionInterpretation,
    KycCase,
    RiskFinding,
    ScreeningRecord,
)
from app.backend.providers.base import FoundryStageError
from app.backend.providers.foundry_prompts import AGENT_NAMES

T = TypeVar("T", bound=BaseModel)


class ExtractionAgentResponse(ExtractionInterpretation):
    model_config = ConfigDict(extra="forbid")


class CompletenessAgentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    findings: list[CompletenessFinding]


class RiskAgentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    findings: list[RiskFinding]


class SummaryAgentResponse(AnalystSummary):
    model_config = ConfigDict(extra="forbid")
    provider_mode: Literal["live-azure"] = "live-azure"


class AzureFoundryReasoningProvider:
    mode = "live-azure"

    def __init__(
        self,
        project_endpoint: str,
        *,
        responses: Any | None = None,
        agent_names: dict[str, str] | None = None,
        stage_delay_seconds: float = 0,
    ) -> None:
        if not project_endpoint:
            raise ValueError("Microsoft Foundry project endpoint is required")
        self.project_endpoint = project_endpoint
        self.agent_names = agent_names or AGENT_NAMES
        self.stage_delay_seconds = stage_delay_seconds
        self._call_lock = Lock()
        self._last_call = 0.0
        if responses is None:
            project = AIProjectClient(
                endpoint=project_endpoint,
                credential=DefaultAzureCredential(),
            )
            responses = project.get_openai_client().responses
        self.responses = responses

    def interpret_extraction(
        self, case: KycCase, facts: list[ExtractedFact]
    ) -> ExtractionInterpretation:
        result = self._invoke(
            "extract",
            {
                "case_id": case.id,
                "company": case.company,
                "document_facts": [
                    fact.model_dump(mode="json") for fact in facts
                ],
            },
            ExtractionAgentResponse,
        )
        return ExtractionInterpretation(
            facts=result.facts,
            warnings=result.warnings,
        )

    def completeness(
        self, case: KycCase, facts: list[ExtractedFact]
    ) -> list[CompletenessFinding]:
        result = self._invoke(
            "complete",
            {
                "case": {
                    "id": case.id,
                    "company": case.company,
                    "profile": case.profile.model_dump(mode="json"),
                    "documents": [
                        {
                            "name": item.name,
                            "document_type": item.document_type,
                            "submitted_at": item.submitted_at,
                        }
                        for item in case.documents
                    ],
                },
                "facts": [fact.model_dump(mode="json") for fact in facts],
            },
            CompletenessAgentResponse,
        )
        return result.findings

    def risks(
        self,
        case: KycCase,
        facts: list[ExtractedFact],
        screening_records: list[ScreeningRecord],
    ) -> list[RiskFinding]:
        result = self._invoke(
            "risk",
            {
                "case": {
                    "id": case.id,
                    "company": case.company,
                    "country": case.country,
                    "profile": case.profile.model_dump(mode="json"),
                    "ownership": [
                        item.model_dump(mode="json") for item in case.ownership
                    ],
                    "previous_audit": [
                        item.model_dump(mode="json") for item in case.audit
                    ],
                },
                "facts": [fact.model_dump(mode="json") for fact in facts],
                "synthetic_screening": {
                    "dataset_count": len(screening_records),
                    "method": (
                        "All local records were compared by normalized name "
                        "similarity; highest-scoring candidates follow."
                    ),
                    "candidates": _local_screening_candidates(
                        case, screening_records
                    ),
                },
            },
            RiskAgentResponse,
        )
        return result.findings

    def summary(
        self,
        case: KycCase,
        completeness: list[CompletenessFinding],
        risks: list[RiskFinding],
    ) -> AnalystSummary:
        result = self._invoke(
            "summary",
            {
                "case": {
                    "id": case.id,
                    "company": case.company,
                    "profile": case.profile.model_dump(mode="json"),
                    "ownership": [
                        item.model_dump(mode="json") for item in case.ownership
                    ],
                },
                "completeness": [
                    {
                        "requirement": item.requirement,
                        "status": item.status,
                        "evidence": item.evidence[:240],
                    }
                    for item in completeness
                ],
                "risks": [
                    {
                        "category": item.category,
                        "severity": item.severity,
                        "description": item.description[:350],
                        "evidence": item.evidence[:350],
                        "source": item.source[:150],
                        "confidence": item.confidence,
                        "recommended_action": item.recommended_action[:250],
                    }
                    for item in risks
                ],
            },
            SummaryAgentResponse,
        )
        result.provider_mode = "live-azure"
        return result

    def _invoke(
        self,
        stage: str,
        payload: dict[str, Any],
        response_model: type[T],
    ) -> T:
        request_payload = {
            "input": payload,
            "response_schema": _strict_json_schema(response_model),
            "response_rules": (
                "Return one JSON object only. Do not use markdown fences. "
                "The object must validate against response_schema."
                + (
                    " Keep each narrative field under 600 characters and "
                    "return no more than three open_questions."
                    if stage == "summary"
                    else ""
                )
            ),
        }
        last_error: Exception | None = None
        for _ in range(2):
            try:
                with self._call_lock:
                    elapsed = time.monotonic() - self._last_call
                    delay = self.stage_delay_seconds - elapsed
                    if delay > 0:
                        time.sleep(delay)
                    try:
                        response = self.responses.create(
                            input=json.dumps(request_payload),
                            max_output_tokens=6000,
                            extra_body={
                                "agent_reference": {
                                    "name": self.agent_names[stage],
                                    "type": "agent_reference",
                                }
                            },
                        )
                    finally:
                        self._last_call = time.monotonic()
                output = response.output_text.strip()
                if output.startswith("```"):
                    output = output.removeprefix("```json").removeprefix("```")
                    output = output.removesuffix("```").strip()
                return response_model.model_validate_json(output)
            except Exception as error:
                last_error = error
        raise FoundryStageError(stage) from last_error


def _strict_json_schema(model: type[BaseModel]) -> dict[str, Any]:
    schema = model.model_json_schema()

    def close_objects(value: Any) -> None:
        if isinstance(value, dict):
            if value.get("type") == "object":
                value["additionalProperties"] = False
            for child in value.values():
                close_objects(child)
        elif isinstance(value, list):
            for child in value:
                close_objects(child)

    close_objects(schema)
    return schema


def _local_screening_candidates(
    case: KycCase,
    records: list[ScreeningRecord],
    limit: int = 5,
) -> list[dict[str, Any]]:
    subjects = [
        person.name for person in case.profile.directors
    ] + [relationship.owner for relationship in case.ownership]
    ranked: list[tuple[float, ScreeningRecord, str]] = []
    for record in records:
        names = [record.name, *record.aliases]
        best_score = 0.0
        best_subject = subjects[0] if subjects else case.company
        for subject in subjects:
            for name in names:
                score = SequenceMatcher(
                    None, subject.casefold(), name.casefold()
                ).ratio()
                if score > best_score:
                    best_score = score
                    best_subject = subject
        ranked.append((best_score, record, best_subject))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [
        {
            **record.model_dump(mode="json"),
            "matched_subject": subject,
            "similarity": round(score, 3),
        }
        for score, record, subject in ranked[:limit]
    ]
