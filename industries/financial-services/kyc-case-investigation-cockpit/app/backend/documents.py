import re
from datetime import datetime, timezone

from .config import Settings


class DocumentProcessor:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def process(self, content: bytes) -> dict:
        if not self.settings.document_intelligence_endpoint:
            raise RuntimeError("Azure AI Document Intelligence endpoint is not configured.")

        from azure.ai.documentintelligence import DocumentIntelligenceClient
        from azure.core.credentials import AzureKeyCredential
        from azure.identity import DefaultAzureCredential

        credential = DefaultAzureCredential(managed_identity_client_id=self.settings.azure_client_id or None)
        client = DocumentIntelligenceClient(self.settings.document_intelligence_endpoint, credential)
        poller = client.begin_analyze_document("prebuilt-layout", body=content, content_type="application/pdf")
        result = poller.result()
        text = result.content or ""
        fields = {}
        patterns = {
            "legal_name": r"Legal Name:\s*(.+)",
            "registration_number": r"Registration Number:\s*(.+)",
            "incorporation_country": r"Incorporation Country:\s*(.+)",
            "registered_address": r"Registered Address:\s*(.+)",
            "document_date": r"Document Date:\s*(.+)",
            "directors": r"Directors:\s*(.+)",
            "beneficial_owners": r"Beneficial Owners:\s*(.+)",
            "ownership_note": r"Ownership Note:\s*(.+)",
        }
        for name, pattern in patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                fields[name] = {
                    "value": match.group(1).strip(),
                    "evidence": match.group(0).strip(),
                    "confidence": 0.99,
                }
        return {
            "model_id": "prebuilt-layout",
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "page_count": len(result.pages or []),
            "content_excerpt": text[:1800],
            "fields": fields,
        }
