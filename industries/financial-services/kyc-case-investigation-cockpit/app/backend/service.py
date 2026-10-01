from copy import deepcopy

from .documents import DocumentProcessor
from .storage import StateStore


class CaseService:
    def __init__(self, store: StateStore, processor: DocumentProcessor) -> None:
        self.store = store
        self.processor = processor

    def list_cases(self, status: str | None = None, risk: str | None = None, search: str | None = None) -> list[dict]:
        cases = self.store.load()["cases"]
        if status:
            cases = [case for case in cases if case["status"].lower() == status.lower()]
        if risk:
            cases = [case for case in cases if case["risk_level"].lower() == risk.lower()]
        if search:
            needle = search.lower()
            cases = [
                case
                for case in cases
                if needle in case["company"].lower()
                or needle in case["id"].lower()
                or needle in case["country"].lower()
            ]
        return [self._summary(case) for case in cases]

    def get_case(self, case_id: str) -> dict | None:
        return next((deepcopy(case) for case in self.store.load()["cases"] if case["id"] == case_id), None)

    def process_document(self, case_id: str, document_id: str) -> dict:
        state = self.store.load()
        case = next((item for item in state["cases"] if item["id"] == case_id), None)
        if not case:
            raise KeyError("case")
        document = next((item for item in case["documents"] if item["id"] == document_id), None)
        if not document:
            raise KeyError("document")
        document["processing_status"] = "processing"
        document["error"] = None
        self.store.save(state)
        try:
            extraction = self.processor.process(self.store.document_bytes(document["blob_name"]))
            document["extraction"] = extraction
            document["processing_status"] = "processed"
            document["confidence"] = 0.99
        except Exception as exc:
            document["processing_status"] = "failed"
            document["error"] = f"Document processing failed: {exc}"
            self.store.save(state)
            raise
        self.store.save(state)
        return deepcopy(document)

    @staticmethod
    def _summary(case: dict) -> dict:
        return {key: value for key, value in case.items() if key not in {"profile", "ownership", "completeness_items", "documents"}}

