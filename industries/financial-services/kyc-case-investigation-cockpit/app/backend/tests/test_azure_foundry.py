import json
from types import SimpleNamespace

import pytest

from app.backend.models.domain import ExtractedFact
from app.backend.providers.azure_foundry import (
    AzureFoundryReasoningProvider,
    _local_screening_candidates,
)
from app.backend.providers.base import FoundryStageError
from app.backend.seed.generator import fresh_seed


class FakeResponses:
    def __init__(self, outputs: list[dict]) -> None:
        self.outputs = list(outputs)
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(output_text=json.dumps(self.outputs.pop(0)))


def primary_case():
    return fresh_seed()[0][0]


def test_four_foundry_stages_parse_strict_structured_outputs() -> None:
    fact = ExtractedFact(
        field="Legal company name",
        value="Northstar Components AB",
        source_document="Certificate of Incorporation",
        confidence=0.99,
    )
    responses = FakeResponses(
        [
            {"facts": [fact.model_dump()], "warnings": []},
            {
                "findings": [
                    {
                        "requirement": "Company registration",
                        "status": "Complete",
                        "evidence": "Certificate of Incorporation",
                        "explanation": "Registration evidence is present.",
                    }
                ]
            },
            {
                "findings": [
                    {
                        "category": "Potential Name Similarity",
                        "severity": "Medium",
                        "description": "Unconfirmed synthetic similarity.",
                        "evidence": "SCR-007",
                        "source": "Synthetic screening data",
                        "confidence": 0.64,
                        "recommended_action": "Analyst verification required.",
                    }
                ]
            },
            {
                "customer_overview": "Synthetic Swedish applicant.",
                "ownership_summary": "Indirect fictional ownership.",
                "evidence_summary": "Most evidence is available.",
                "risk_summary": "One unconfirmed similarity.",
                "open_questions": ["Verify the potential similarity."],
                "recommended_action": "Request More Information",
                "rationale": "Additional verification is required.",
                "provider_mode": "live-azure",
            },
        ]
    )
    provider = AzureFoundryReasoningProvider(
        "https://example.services.ai.azure.com/api/projects/test",
        responses=responses,
    )
    case = primary_case()

    interpreted = provider.interpret_extraction(case, [fact])
    completeness = provider.completeness(case, interpreted.facts)
    risks = provider.risks(
        case, interpreted.facts, fresh_seed()[1]
    )
    summary = provider.summary(case, completeness, risks)

    assert interpreted.facts[0].value == "Northstar Components AB"
    assert completeness[0].status == "Complete"
    assert "Unconfirmed" in risks[0].description
    assert summary.recommended_action == "Request More Information"
    assert summary.provider_mode == "live-azure"
    assert [
        call["extra_body"]["agent_reference"]["name"]
        for call in responses.calls
    ] == [
        "agt-kyc-extract",
        "agt-kyc-complete",
        "agt-kyc-risk",
        "agt-kyc-summary",
    ]
    request = json.loads(responses.calls[0]["input"])
    assert request["response_schema"]["additionalProperties"] is False
    assert request["response_rules"].startswith("Return one JSON object")
    summary_request = json.loads(responses.calls[-1]["input"])
    assert "explanation" not in summary_request["input"]["completeness"][0]
    assert "no more than three" in summary_request["response_rules"]
    assert responses.calls[-1]["max_output_tokens"] == 6000


def test_foundry_invalid_response_has_stage_specific_retry_error() -> None:
    provider = AzureFoundryReasoningProvider(
        "https://example.services.ai.azure.com/api/projects/test",
        responses=FakeResponses(
            [{"unexpected": True}, {"still_unexpected": True}]
        ),
    )

    with pytest.raises(FoundryStageError, match="Extract assistance"):
        provider.interpret_extraction(primary_case(), [])


def test_foundry_retries_one_invalid_response_before_succeeding() -> None:
    fact = ExtractedFact(
        field="Legal company name",
        value="Northstar Components AB",
        source_document="Certificate of Incorporation",
        confidence=0.99,
    )
    responses = FakeResponses(
        [
            {"unexpected": True},
            {"facts": [fact.model_dump()], "warnings": []},
        ]
    )
    provider = AzureFoundryReasoningProvider(
        "https://example.services.ai.azure.com/api/projects/test",
        responses=responses,
    )

    result = provider.interpret_extraction(primary_case(), [fact])

    assert result.facts[0].value == "Northstar Components AB"
    assert len(responses.calls) == 2


def test_local_screening_prefilter_scans_dataset_and_keeps_similarity() -> None:
    case = primary_case()
    candidates = _local_screening_candidates(case, fresh_seed()[1])

    assert len(candidates) == 5
    assert any(item["id"] == "SCR-007" for item in candidates)
    assert all("similarity" in item for item in candidates)
