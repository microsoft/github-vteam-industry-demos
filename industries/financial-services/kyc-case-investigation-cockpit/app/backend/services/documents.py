from app.backend.models.domain import DocumentExtractionResult
from app.backend.providers.base import DocumentExtractionProvider
from app.backend.storage.base import DemoState


class DocumentExtractionService:
    def __init__(
        self,
        state: DemoState,
        provider: DocumentExtractionProvider,
    ) -> None:
        self.state = state
        self.provider = provider

    def extract(
        self, case_id: str, document_id: str
    ) -> DocumentExtractionResult | None:
        case = self.state.get_case(case_id)
        if not case:
            return None
        document = next(
            (item for item in case.documents if item.id == document_id),
            None,
        )
        if not document:
            return None
        return self.provider.extract_document(document)
