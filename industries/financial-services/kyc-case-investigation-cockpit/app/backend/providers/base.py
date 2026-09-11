from typing import Protocol

from app.backend.models.domain import (
    AnalystSummary,
    CompletenessFinding,
    Document,
    DocumentExtractionResult,
    ExtractionInterpretation,
    ExtractedFact,
    KycCase,
    RiskFinding,
    ScreeningRecord,
)


class DocumentProcessingError(RuntimeError):
    """Retryable document-processing failure safe to expose through the API."""


class FoundryStageError(RuntimeError):
    def __init__(self, stage: str) -> None:
        self.stage = stage
        super().__init__(
            f"{stage.capitalize()} assistance is temporarily unavailable. "
            "Completed prior results were preserved; please retry this stage."
        )


class DocumentExtractionProvider(Protocol):
    """Hook for Azure AI Document Intelligence or deterministic local extraction."""

    mode: str
    model_id: str

    def extract(self, documents: list[Document]) -> list[ExtractedFact]: ...

    def extract_document(self, document: Document) -> DocumentExtractionResult: ...


class InvestigationReasoningProvider(Protocol):
    """Hook for Foundry agents or deterministic local KYC reasoning."""

    mode: str

    def interpret_extraction(
        self, case: KycCase, facts: list[ExtractedFact]
    ) -> ExtractionInterpretation: ...

    def completeness(
        self, case: KycCase, facts: list[ExtractedFact]
    ) -> list[CompletenessFinding]: ...

    def risks(
        self,
        case: KycCase,
        facts: list[ExtractedFact],
        screening_records: list[ScreeningRecord],
    ) -> list[RiskFinding]: ...

    def summary(
        self,
        case: KycCase,
        completeness: list[CompletenessFinding],
        risks: list[RiskFinding],
    ) -> AnalystSummary: ...
