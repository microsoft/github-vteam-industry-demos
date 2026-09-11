from types import SimpleNamespace

import pytest

from app.backend.models.domain import Document
from app.backend.providers.azure_document_intelligence import (
    AzureDocumentIntelligenceProvider,
)
from app.backend.providers.base import DocumentProcessingError


class FakePoller:
    def __init__(self, result: object) -> None:
        self._result = result

    def result(self) -> object:
        return self._result


class FakeClient:
    def __init__(self, result: object | None = None) -> None:
        self.result = result
        self.calls: list[tuple[str, object, dict[str, object]]] = []

    def begin_analyze_document(
        self, model_id: str, body: object, **kwargs: object
    ) -> FakePoller:
        self.calls.append((model_id, body, kwargs))
        if isinstance(self.result, Exception):
            raise self.result
        return FakePoller(self.result)


def sample_document() -> Document:
    return Document(
        id="DOC-001-01",
        name="certificate-of-incorporation.txt",
        document_type="Certificate of Incorporation",
        submitted_at="2026-09-08",
        confidence=0.99,
        preview=(
            "SYNTHETIC DOCUMENT\nCertificate of Incorporation\n"
            "Legal name: Northstar Components AB\n"
            "Registration number: SC-420001\n"
            "Issuing authority: Fictional Nordic Companies Office"
        ),
    )


def test_live_adapter_uses_layout_and_preserves_document_evidence() -> None:
    result = SimpleNamespace(
        content=sample_document().preview,
        pages=[
            SimpleNamespace(
                words=[
                    SimpleNamespace(confidence=0.98),
                    SimpleNamespace(confidence=0.96),
                ]
            )
        ],
    )
    client = FakeClient(result)
    provider = AzureDocumentIntelligenceProvider(
        "https://example.cognitiveservices.azure.com/",
        client=client,  # type: ignore[arg-type]
    )

    extraction = provider.extract_document(sample_document())

    assert extraction.provider_mode == "live-azure"
    assert extraction.model_id == "prebuilt-layout"
    assert client.calls[0][0] == "prebuilt-layout"
    assert client.calls[0][2]["content_type"].endswith(
        "wordprocessingml.document"
    )
    assert client.calls[0][1].getvalue().startswith(b"PK")
    assert {
        (fact.field, fact.value, fact.source_document)
        for fact in extraction.facts
    } >= {
        (
            "Legal company name",
            "Northstar Components AB",
            "Certificate of Incorporation",
        ),
        (
            "Registration number",
            "SC-420001",
            "Certificate of Incorporation",
        ),
    }
    assert all(fact.confidence == 0.97 for fact in extraction.facts)


def test_live_adapter_returns_retryable_safe_error() -> None:
    provider = AzureDocumentIntelligenceProvider(
        "https://example.cognitiveservices.azure.com/",
        client=FakeClient(RuntimeError("credential internals")),  # type: ignore[arg-type]
    )

    with pytest.raises(
        DocumentProcessingError,
        match="temporarily unavailable",
    ):
        provider.extract_document(sample_document())
