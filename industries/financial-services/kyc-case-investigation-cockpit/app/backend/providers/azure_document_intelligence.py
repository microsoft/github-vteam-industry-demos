import re
from io import BytesIO
from collections.abc import Iterable

from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.identity import DefaultAzureCredential
from docx import Document as WordDocument

from app.backend.models.domain import (
    Document,
    DocumentExtractionResult,
    ExtractedFact,
)
from app.backend.providers.base import DocumentProcessingError


class AzureDocumentIntelligenceProvider:
    mode = "live-azure"

    def __init__(
        self,
        endpoint: str,
        model_id: str = "prebuilt-layout",
        *,
        client: DocumentIntelligenceClient | None = None,
    ) -> None:
        if not endpoint:
            raise ValueError("Azure Document Intelligence endpoint is required")
        self.endpoint = endpoint
        self.model_id = model_id
        self.client = client or DocumentIntelligenceClient(
            endpoint=endpoint,
            credential=DefaultAzureCredential(),
        )

    def extract(self, documents: list[Document]) -> list[ExtractedFact]:
        return [
            fact
            for document in documents
            for fact in self.extract_document(document).facts
        ]

    def extract_document(self, document: Document) -> DocumentExtractionResult:
        try:
            poller = self.client.begin_analyze_document(
                self.model_id,
                BytesIO(_render_text_docx(document.preview)),
                content_type=(
                    "application/vnd.openxmlformats-officedocument."
                    "wordprocessingml.document"
                ),
            )
            result = poller.result()
        except Exception as error:
            raise DocumentProcessingError(
                "Document processing is temporarily unavailable. Please retry."
            ) from error

        content = (result.content or "").strip()
        if not content:
            raise DocumentProcessingError(
                "Document processing returned no readable content. Please retry."
            )

        confidence = _average_word_confidence(
            page.words or []
            for page in (result.pages or [])
        )
        facts = _extract_labeled_facts(
            content,
            source_document=document.document_type,
            confidence=confidence or document.confidence,
        )
        if not facts:
            facts = [
                ExtractedFact(
                    field="Document content",
                    value=content[:500],
                    source_document=document.document_type,
                    confidence=confidence or document.confidence,
                )
            ]

        return DocumentExtractionResult(
            document_id=document.id,
            document_name=document.name,
            model_id=self.model_id,
            provider_mode=self.mode,
            content=content,
            facts=facts,
        )


def _extract_labeled_facts(
    content: str,
    *,
    source_document: str,
    confidence: float,
) -> list[ExtractedFact]:
    labels = {
        "legal name": "Legal company name",
        "registration number": "Registration number",
        "issuing authority": "Issuing authority",
        "organisation": "Organisation",
        "address": "Registered address",
        "document date": "Document date",
        "applicant": "Applicant",
        "purpose": "Purpose",
        "expected activity": "Expected activity",
    }
    facts: list[ExtractedFact] = []
    for line in content.splitlines():
        match = re.match(r"\s*([^:]+):\s*(.+?)\s*$", line)
        if not match:
            continue
        label = labels.get(match.group(1).strip().lower())
        if label:
            facts.append(
                ExtractedFact(
                    field=label,
                    value=match.group(2).strip(),
                    source_document=source_document,
                    confidence=confidence,
                )
            )
    return facts


def _average_word_confidence(word_groups: Iterable[Iterable[object]]) -> float:
    confidences = [
        float(confidence)
        for words in word_groups
        for word in words
        if (confidence := getattr(word, "confidence", None)) is not None
    ]
    return round(sum(confidences) / len(confidences), 4) if confidences else 0


def _render_text_docx(text: str) -> bytes:
    document = WordDocument()
    for line in text.splitlines():
        document.add_paragraph(line)
    output = BytesIO()
    document.save(output)
    return output.getvalue()
