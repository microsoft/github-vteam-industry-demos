from typing import Protocol

from app.backend.models.domain import (
    AnalystDecision,
    InvestigationJob,
    KycCase,
    ScreeningRecord,
)


class DemoState(Protocol):
    def list_cases(self) -> list[KycCase]: ...

    def get_case(self, case_id: str) -> KycCase | None: ...

    def save_case(self, case: KycCase) -> None: ...

    def screening_records(self) -> list[ScreeningRecord]: ...

    def get_document_content(
        self, case_id: str, document_id: str
    ) -> str | None: ...

    def save_investigation_job(self, job: InvestigationJob) -> None: ...

    def get_investigation_job(self, job_id: str) -> InvestigationJob | None: ...

    def record_decision(
        self, case_id: str, decision: AnalystDecision
    ) -> KycCase | None: ...
