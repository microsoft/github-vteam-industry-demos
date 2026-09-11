from app.backend.providers import factory
from app.backend.providers.demo import DemoDocumentExtractionProvider


def test_factory_defaults_to_deterministic_provider(monkeypatch) -> None:
    monkeypatch.delenv("DOCUMENT_EXTRACTION_PROVIDER", raising=False)
    monkeypatch.delenv("FOUNDRY_REASONING_PROVIDER", raising=False)
    document_provider, reasoning_provider = factory.build_providers()
    assert isinstance(document_provider, DemoDocumentExtractionProvider)
    assert reasoning_provider.mode == "deterministic-demo"


def test_factory_selects_live_document_provider(monkeypatch) -> None:
    sentinel = object()
    monkeypatch.setenv("DOCUMENT_EXTRACTION_PROVIDER", "azure")
    monkeypatch.setenv(
        "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
        "https://example.cognitiveservices.azure.com/",
    )
    monkeypatch.setenv(
        "AZURE_DOCUMENT_INTELLIGENCE_MODEL",
        "prebuilt-layout",
    )
    monkeypatch.setattr(
        factory,
        "AzureDocumentIntelligenceProvider",
        lambda endpoint, model_id: sentinel,
    )

    document_provider, _ = factory.build_providers()

    assert document_provider is sentinel


def test_factory_selects_live_foundry_provider(monkeypatch) -> None:
    sentinel = object()
    monkeypatch.setenv("FOUNDRY_REASONING_PROVIDER", "azure")
    monkeypatch.setenv(
        "AZURE_AI_PROJECT_ENDPOINT",
        "https://example.services.ai.azure.com/api/projects/test",
    )
    monkeypatch.setattr(
        factory,
        "AzureFoundryReasoningProvider",
        lambda project_endpoint, agent_names, stage_delay_seconds: sentinel,
    )

    _, reasoning_provider = factory.build_providers()

    assert reasoning_provider is sentinel
