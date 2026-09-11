from app.backend.models.domain import FoundryStageResult
from app.backend.providers.base import (
    DocumentExtractionProvider,
    InvestigationReasoningProvider,
)
from app.backend.providers.demo import DemoInvestigationReasoningProvider
from app.backend.providers.foundry_prompts import AGENT_NAMES
from app.backend.storage.base import DemoState


class FoundryDiagnosticsService:
    def __init__(
        self,
        state: DemoState,
        document_provider: DocumentExtractionProvider,
        reasoning_provider: InvestigationReasoningProvider,
    ) -> None:
        self.state = state
        self.document_provider = document_provider
        self.reasoning_provider = reasoning_provider
        self.demo_reasoning = DemoInvestigationReasoningProvider()

    def run(self, case_id: str, stage: str) -> FoundryStageResult | None:
        case = self.state.get_case(case_id)
        if not case:
            return None
        seeded_facts = [
            fact for document in case.documents for fact in document.extracted_facts
        ]
        if stage == "extract":
            live_document = self.document_provider.extract_document(
                case.documents[0]
            )
            result = self.reasoning_provider.interpret_extraction(
                case, live_document.facts
            )
        elif stage == "complete":
            result = self.reasoning_provider.completeness(case, seeded_facts)
        elif stage == "risk":
            result = self.reasoning_provider.risks(
                case, seeded_facts, self.state.screening_records()
            )
        elif stage == "summary":
            completeness = self.demo_reasoning.completeness(case, seeded_facts)
            risks = self.demo_reasoning.risks(
                case, seeded_facts, self.state.screening_records()
            )
            result = self.reasoning_provider.summary(
                case, completeness, risks
            )
        else:
            raise ValueError(f"Unknown Foundry stage: {stage}")
        if isinstance(result, list):
            body = {"items": [item.model_dump(mode="json") for item in result]}
        else:
            body = result.model_dump(mode="json")
        return FoundryStageResult(
            stage=stage,
            agent_name=AGENT_NAMES[stage],
            provider_mode="live-azure",
            result=body,
        )
