from threading import Thread
from uuid import uuid4

from app.backend.models.domain import (
    AuditEvent,
    InvestigationJob,
    InvestigationResult,
    KycCase,
    utc_now,
)
from app.backend.providers.base import (
    DocumentExtractionProvider,
    InvestigationReasoningProvider,
)
from app.backend.storage.base import DemoState

INVESTIGATION_STAGES = [
    "Reading submitted documents",
    "Extracting company information",
    "Building ownership profile",
    "Checking required evidence",
    "Investigating risk indicators",
    "Preparing analyst summary",
    "Saving investigation",
]


class InvestigationService:
    def __init__(
        self,
        state: DemoState,
        document_provider: DocumentExtractionProvider,
        reasoning_provider: InvestigationReasoningProvider,
    ) -> None:
        self.state = state
        self.document_provider = document_provider
        self.reasoning_provider = reasoning_provider

    def start(self, case_id: str) -> InvestigationJob | None:
        if not self.state.get_case(case_id):
            return None
        job = self._new_job(case_id)
        Thread(
            target=self._run_background,
            args=(case_id, job.id),
            daemon=True,
        ).start()
        return job

    def get_job(self, job_id: str) -> InvestigationJob | None:
        return self.state.get_investigation_job(job_id)

    def run(self, case_id: str) -> tuple[KycCase, InvestigationResult] | None:
        if not self.state.get_case(case_id):
            return None
        job = self._new_job(case_id)
        return self._execute(case_id, job.id)

    def _new_job(self, case_id: str) -> InvestigationJob:
        job = InvestigationJob(
            id=f"INV-{uuid4().hex[:12]}",
            case_id=case_id,
            status="Running",
            current_stage=INVESTIGATION_STAGES[0],
            updated_at=utc_now(),
        )
        self.state.save_investigation_job(job)
        return job

    def _run_background(self, case_id: str, job_id: str) -> None:
        try:
            self._execute(case_id, job_id)
        except Exception:
            return

    def _execute(
        self, case_id: str, job_id: str
    ) -> tuple[KycCase, InvestigationResult] | None:
        case = self.state.get_case(case_id)
        if not case:
            return None
        job = self.state.get_investigation_job(job_id)
        if not job:
            return None
        try:
            started_at = utc_now()
            case.audit.append(
                AuditEvent(
                    id=f"AUD-{case.id}-{len(case.audit) + 1:03d}",
                    timestamp=started_at,
                    actor_type="Human Analyst",
                    actor=case.assigned_analyst,
                    action="Investigation started",
                    detail="Analyst started live Azure investigation assistance.",
                )
            )
            self.state.save_case(case)
            facts = self.document_provider.extract(case.documents)
            self._complete_stage(job, INVESTIGATION_STAGES[0])
            interpretation = self.reasoning_provider.interpret_extraction(
                case, facts
            )
            facts = interpretation.facts
            job.partial_results["facts"] = [
                fact.model_dump(mode="json") for fact in facts
            ]
            job.partial_results["extraction_warnings"] = interpretation.warnings
            self._complete_stage(job, INVESTIGATION_STAGES[1])
            self._complete_stage(job, INVESTIGATION_STAGES[2])

            completeness = self.reasoning_provider.completeness(case, facts)
            case.completeness = completeness
            case.completeness_percent = round(
                100
                * sum(item.status == "Complete" for item in completeness)
                / len(completeness)
            )
            self.state.save_case(case)
            job.partial_results["completeness"] = [
                item.model_dump(mode="json") for item in completeness
            ]
            self._complete_stage(job, INVESTIGATION_STAGES[3])

            risks = self.reasoning_provider.risks(
                case, facts, self.state.screening_records()
            )
            case.risks = risks
            self.state.save_case(case)
            job.partial_results["risks"] = [
                item.model_dump(mode="json") for item in risks
            ]
            self._complete_stage(job, INVESTIGATION_STAGES[4])

            summary = self.reasoning_provider.summary(
                case, completeness, risks
            )
            case.summary = summary
            self.state.save_case(case)
            job.partial_results["summary"] = summary.model_dump(mode="json")
            self._complete_stage(job, INVESTIGATION_STAGES[5])

            completed_at = utc_now()
            case.last_modified = completed_at
            case.audit.append(
                AuditEvent(
                    id=f"AUD-{case.id}-{len(case.audit) + 1:03d}",
                    timestamp=completed_at,
                    actor_type="AI Assistance",
                    actor=(
                        "Microsoft Foundry managed agents"
                        if self.reasoning_provider.mode == "live-azure"
                        else "Deterministic demo provider"
                    ),
                    action="Live investigation assistance completed",
                    detail=(
                        f"{len(completeness)} completeness checks and "
                        f"{len(risks)} risk signals prepared. "
                        + (
                            "The live recommendation is advisory and did not "
                            "change case status."
                            if self.reasoning_provider.mode == "live-azure"
                            else "No live Azure AI call was made. The recommendation "
                            "is advisory and did not change case status."
                        )
                    ),
                )
            )
            self.state.save_case(case)
            result = InvestigationResult(
                stages=INVESTIGATION_STAGES,
                completeness=completeness,
                risks=risks,
                summary=summary,
                provider_mode=self.reasoning_provider.mode,
                completed_at=completed_at,
            )
            job.result = result
            job.status = "Succeeded"
            self._complete_stage(job, INVESTIGATION_STAGES[6])
            return case, result
        except Exception as error:
            job.status = "Failed"
            job.error = str(error)
            job.updated_at = utc_now()
            self.state.save_investigation_job(job)
            raise

    def _complete_stage(
        self, job: InvestigationJob, stage: str
    ) -> None:
        if stage not in job.completed_stages:
            job.completed_stages.append(stage)
        next_index = min(
            len(job.completed_stages), len(INVESTIGATION_STAGES) - 1
        )
        job.current_stage = INVESTIGATION_STAGES[next_index]
        job.updated_at = utc_now()
        self.state.save_investigation_job(job)
