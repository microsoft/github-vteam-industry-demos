import os

from app.backend.providers.base import (
    DocumentExtractionProvider,
    InvestigationReasoningProvider,
)
from app.backend.providers.azure_document_intelligence import (
    AzureDocumentIntelligenceProvider,
)
from app.backend.providers.azure_foundry import AzureFoundryReasoningProvider
from app.backend.providers.demo import (
    DemoDocumentExtractionProvider,
    DemoInvestigationReasoningProvider,
)


def build_providers() -> tuple[
    DocumentExtractionProvider, InvestigationReasoningProvider
]:
    """Composition hook for swapping deterministic providers with Azure adapters."""
    document_mode = os.getenv(
        "DOCUMENT_EXTRACTION_PROVIDER", "demo"
    ).strip().lower()
    if document_mode == "azure":
        document_provider: DocumentExtractionProvider = (
            AzureDocumentIntelligenceProvider(
                endpoint=os.environ["AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT"],
                model_id=os.getenv(
                    "AZURE_DOCUMENT_INTELLIGENCE_MODEL", "prebuilt-layout"
                ),
            )
        )
    else:
        document_provider = DemoDocumentExtractionProvider()
    reasoning_mode = os.getenv(
        "FOUNDRY_REASONING_PROVIDER", "demo"
    ).strip().lower()
    if reasoning_mode == "azure":
        reasoning_provider: InvestigationReasoningProvider = (
            AzureFoundryReasoningProvider(
                project_endpoint=os.environ["AZURE_AI_PROJECT_ENDPOINT"],
                agent_names={
                    "extract": os.getenv(
                        "FOUNDRY_AGENT_EXTRACT", "agt-kyc-extract"
                    ),
                    "complete": os.getenv(
                        "FOUNDRY_AGENT_COMPLETE", "agt-kyc-complete"
                    ),
                    "risk": os.getenv(
                        "FOUNDRY_AGENT_RISK", "agt-kyc-risk"
                    ),
                    "summary": os.getenv(
                        "FOUNDRY_AGENT_SUMMARY", "agt-kyc-summary"
                    ),
                },
                stage_delay_seconds=float(
                    os.getenv("FOUNDRY_STAGE_DELAY_SECONDS", "0")
                ),
            )
        )
    else:
        reasoning_provider = DemoInvestigationReasoningProvider()
    return document_provider, reasoning_provider
