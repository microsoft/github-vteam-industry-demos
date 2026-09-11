from copy import deepcopy
from threading import RLock

from app.backend.models.domain import (
    AnalystDecision,
    AuditEvent,
    InvestigationJob,
    KycCase,
    ScreeningRecord,
    utc_now,
)
from app.backend.seed.generator import fresh_seed


class MemoryDemoState:
    def __init__(self) -> None:
        cases, screening = fresh_seed()
        self._cases = {case.id: case for case in cases}
        self._screening = screening
        self._jobs: dict[str, InvestigationJob] = {}
        self._lock = RLock()

    def list_cases(self) -> list[KycCase]:
        with self._lock:
            return deepcopy(list(self._cases.values()))

    def get_case(self, case_id: str) -> KycCase | None:
        with self._lock:
            case = self._cases.get(case_id)
            return deepcopy(case) if case else None

    def save_case(self, case: KycCase) -> None:
        with self._lock:
            self._cases[case.id] = deepcopy(case)

    def screening_records(self) -> list[ScreeningRecord]:
        with self._lock:
            return deepcopy(self._screening)

    def get_document_content(
        self, case_id: str, document_id: str
    ) -> str | None:
        case = self.get_case(case_id)
        if not case:
            return None
        document = next(
            (item for item in case.documents if item.id == document_id), None
        )
        return document.preview if document else None

    def save_investigation_job(self, job: InvestigationJob) -> None:
        with self._lock:
            self._jobs[job.id] = deepcopy(job)

    def get_investigation_job(self, job_id: str) -> InvestigationJob | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return deepcopy(job) if job else None

    def record_decision(
        self, case_id: str, decision: AnalystDecision
    ) -> KycCase | None:
        with self._lock:
            case = self._cases.get(case_id)
            if not case:
                return None
            status_by_action = {
                "Approve": "Approved",
                "Request More Information": "Awaiting Information",
                "Escalate": "Escalated",
            }
            case.decisions.append(decision)
            case.status = status_by_action[decision.action]  # type: ignore[assignment]
            case.last_modified = decision.timestamp
            case.audit.append(
                AuditEvent(
                    id=f"AUD-{case.id}-{len(case.audit) + 1:03d}",
                    timestamp=decision.timestamp,
                    actor_type="Human Analyst",
                    actor=decision.analyst,
                    action=f"Decision recorded: {decision.action}",
                    detail=decision.reason,
                )
            )
            return deepcopy(case)
