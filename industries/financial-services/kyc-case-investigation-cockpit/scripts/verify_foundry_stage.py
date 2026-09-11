import argparse
import json
import os

from app.backend.providers.azure_document_intelligence import (
    AzureDocumentIntelligenceProvider,
)
from app.backend.providers.azure_foundry import AzureFoundryReasoningProvider
from app.backend.providers.demo import DemoDocumentExtractionProvider
from app.backend.seed.generator import PRIMARY_CASE_ID
from app.backend.services.foundry_diagnostics import FoundryDiagnosticsService
from app.backend.storage.memory import MemoryDemoState


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--stage",
        required=True,
        choices=["extract", "complete", "risk", "summary"],
    )
    args = parser.parse_args()
    document_provider = (
        AzureDocumentIntelligenceProvider(
            os.environ["AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT"],
            os.getenv(
                "AZURE_DOCUMENT_INTELLIGENCE_MODEL", "prebuilt-layout"
            ),
        )
        if args.stage == "extract"
        else DemoDocumentExtractionProvider()
    )
    service = FoundryDiagnosticsService(
        MemoryDemoState(),
        document_provider,
        AzureFoundryReasoningProvider(
            os.environ["AZURE_AI_PROJECT_ENDPOINT"]
        ),
    )
    result = service.run(PRIMARY_CASE_ID, args.stage)
    print(json.dumps(result.model_dump(mode="json")))


if __name__ == "__main__":
    main()
