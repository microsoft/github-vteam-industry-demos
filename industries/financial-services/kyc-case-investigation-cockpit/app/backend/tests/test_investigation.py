import pytest

from app.backend.providers.demo import (
    DemoDocumentExtractionProvider,
    DemoInvestigationReasoningProvider,
)
from app.backend.providers.base import FoundryStageError
from app.backend.seed.generator import PRIMARY_CASE_ID
from app.backend.services.investigation import (
    INVESTIGATION_STAGES,
    InvestigationService,
)
from app.backend.storage.memory import MemoryDemoState


def build_service() -> InvestigationService:
    return InvestigationService(
        MemoryDemoState(),
        DemoDocumentExtractionProvider(),
        DemoInvestigationReasoningProvider(),
    )


def test_primary_case_completeness_logic_and_advisory_summary() -> None:
    result = build_service().run(PRIMARY_CASE_ID)
    assert result is not None
    case, investigation = result
    findings = {item.requirement: item.status for item in case.completeness}

    assert findings["Beneficial ownership"] == "Needs Review"
    assert findings["Ownership percentages"] == "Conflicting"
    assert investigation.summary.recommended_action == "Request More Information"
    assert investigation.provider_mode == "deterministic-demo"
    assert any(risk.category == "Potential Name Similarity" for risk in case.risks)
    assert len(investigation.stages) == len(INVESTIGATION_STAGES) == 7


def test_investigation_never_changes_case_status_and_creates_ai_audit() -> None:
    state = MemoryDemoState()
    service = InvestigationService(
        state,
        DemoDocumentExtractionProvider(),
        DemoInvestigationReasoningProvider(),
    )
    before = state.get_case(PRIMARY_CASE_ID)
    assert before is not None

    result = service.run(PRIMARY_CASE_ID)
    assert result is not None
    case, _ = result

    assert case.status == before.status
    assert case.summary is not None
    assert case.audit[-1].actor_type == "AI Assistance"
    assert "No live Azure AI call" in case.audit[-1].detail
    assert len(case.audit) == len(before.audit) + 2


def test_later_stage_failure_preserves_completed_results() -> None:
    class RiskFailureProvider(DemoInvestigationReasoningProvider):
        def risks(self, case, facts, screening_records):
            raise FoundryStageError("risk")

    state = MemoryDemoState()
    service = InvestigationService(
        state,
        DemoDocumentExtractionProvider(),
        RiskFailureProvider(),
    )

    with pytest.raises(FoundryStageError, match="Risk assistance"):
        service.run(PRIMARY_CASE_ID)

    case = state.get_case(PRIMARY_CASE_ID)
    assert case is not None
    assert case.completeness
    assert case.risks == []
    assert case.summary is None
    assert case.status == "Investigating"
