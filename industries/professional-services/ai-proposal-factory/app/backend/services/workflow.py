from uuid import uuid4

from app.backend.models import Document, GenerationJob, Proposal, ProposalSection
from app.backend.models.domain import utc_now
from app.backend.services.agents import AgentService
from app.backend.services.core import AuditService, OpportunityService
from app.backend.services.retrieval import KnowledgeRetriever
from app.backend.storage import Store


class ProposalService:
    def __init__(
        self,
        store: Store,
        opportunities: OpportunityService,
        audit: AuditService,
        agents: AgentService,
        retriever: KnowledgeRetriever,
    ):
        self.store = store
        self.opportunities = opportunities
        self.audit = audit
        self.agents = agents
        self.retriever = retriever

    def get(self, proposal_id: str) -> Proposal | None:
        item = self.store.get("proposals", proposal_id)
        return Proposal(**item) if item else None

    def start(self, opportunity_id: str) -> GenerationJob:
        job = GenerationJob(id=f"job-{uuid4().hex[:12]}", opportunity_id=opportunity_id)
        self.store.upsert("jobs", job.id, job.model_dump())
        return job

    def get_job(self, job_id: str) -> GenerationJob | None:
        item = self.store.get("jobs", job_id)
        return GenerationJob(**item) if item else None

    def _update_job(self, job: GenerationJob, progress: int, step: str) -> GenerationJob:
        job = job.model_copy(
            update={"status": "running", "progress": progress, "current_step": step, "updated_at": utc_now()}
        )
        self.store.upsert("jobs", job.id, job.model_dump())
        return job

    def run(self, job_id: str) -> None:
        job = self.get_job(job_id)
        if not job:
            return
        opportunity = self.opportunities.get(job.opportunity_id)
        if not opportunity:
            self._fail(job, "The opportunity no longer exists.")
            return
        self.audit.record("generation.started", "Proposal generation started.", opportunity.id)
        try:
            job = self._update_job(job, 10, "Analysing requirements")
            documents = [
                Document(**item)
                for item in self.store.list("documents")
                if item["opportunity_id"] == opportunity.id and item.get("selected", True)
            ]
            analysis = self.agents.analyse_requirements(opportunity, documents)

            job = self._update_job(job, 35, "Searching reusable knowledge")
            query = " ".join(
                [opportunity.industry, opportunity.business_problem, opportunity.scope]
            )
            knowledge = self.retriever.search(query, limit=8)

            job = self._update_job(job, 55, "Drafting proposal")
            sections = self.agents.write_proposal(opportunity, analysis, knowledge)

            job = self._update_job(job, 78, "Reviewing risks")
            risks = self.agents.review_risks(opportunity, sections)

            job = self._update_job(job, 92, "Saving proposal")
            proposal = Proposal(
                id=f"proposal-{uuid4().hex[:12]}",
                opportunity_id=opportunity.id,
                title=f"{opportunity.name} Proposal",
                status="In Review",
                requirements_analysis=analysis,
                sections=sections,
                risks=risks,
            )
            self.store.upsert("proposals", proposal.id, proposal.model_dump())
            updated_opportunity = opportunity.model_copy(
                update={
                    "proposal_id": proposal.id,
                    "proposal_progress": 100,
                    "status": "Proposal ready",
                    "updated_at": utc_now(),
                }
            )
            self.store.upsert(
                "opportunities", updated_opportunity.id, updated_opportunity.model_dump()
            )
            completed = job.model_copy(
                update={
                    "status": "completed",
                    "progress": 100,
                    "current_step": "Proposal ready",
                    "proposal_id": proposal.id,
                    "updated_at": utc_now(),
                }
            )
            self.store.upsert("jobs", completed.id, completed.model_dump())
            self.audit.record(
                "proposal.generated",
                f"Generated {len(sections)} proposal sections and {len(risks)} review findings.",
                opportunity.id,
                proposal.id,
            )
        except Exception as exc:
            self._fail(
                job,
                "Proposal generation could not be completed. Your opportunity is safe; please retry. "
                f"Details: {type(exc).__name__}",
            )

    def _fail(self, job: GenerationJob, message: str) -> None:
        failed = job.model_copy(
            update={
                "status": "failed",
                "current_step": "Generation paused",
                "error": message,
                "retryable": True,
                "updated_at": utc_now(),
            }
        )
        self.store.upsert("jobs", failed.id, failed.model_dump())
        self.audit.record(
            "generation.failed",
            message,
            job.opportunity_id,
        )

    def update_section(
        self, proposal_id: str, section_id: str, content: str
    ) -> Proposal | None:
        proposal = self.get(proposal_id)
        if not proposal:
            return None
        found = False
        sections = []
        for section in proposal.sections:
            if section.id == section_id:
                section = section.model_copy(
                    update={"content": content, "status": "In Review", "updated_at": utc_now()}
                )
                found = True
            sections.append(section)
        if not found:
            return None
        proposal = proposal.model_copy(update={"sections": sections, "updated_at": utc_now()})
        self.store.upsert("proposals", proposal.id, proposal.model_dump())
        self.audit.record(
            "section.edited",
            f"Edited section {section_id}.",
            proposal.opportunity_id,
            proposal.id,
        )
        return proposal

    def regenerate_section(self, proposal_id: str, section_id: str) -> Proposal | None:
        proposal = self.get(proposal_id)
        if not proposal:
            return None
        opportunity = self.opportunities.get(proposal.opportunity_id)
        section = next((item for item in proposal.sections if item.id == section_id), None)
        if not opportunity or not section:
            return None
        knowledge = self.retriever.search(
            f"{opportunity.industry} {section.title} {opportunity.scope}", limit=4
        )
        regenerated = self.agents.regenerate_section(opportunity, section, knowledge)
        sections = [regenerated if item.id == section_id else item for item in proposal.sections]
        proposal = proposal.model_copy(
            update={"sections": sections, "status": "In Review", "updated_at": utc_now()}
        )
        self.store.upsert("proposals", proposal.id, proposal.model_dump())
        self.audit.record(
            "section.regenerated",
            f"Regenerated {section.title}.",
            proposal.opportunity_id,
            proposal.id,
        )
        return proposal

    def approve_section(self, proposal_id: str, section_id: str) -> Proposal | None:
        proposal = self.get(proposal_id)
        if not proposal:
            return None
        found = False
        sections: list[ProposalSection] = []
        for section in proposal.sections:
            if section.id == section_id:
                section = section.model_copy(
                    update={"status": "Approved", "updated_at": utc_now()}
                )
                found = True
            sections.append(section)
        if not found:
            return None
        proposal = proposal.model_copy(update={"sections": sections, "updated_at": utc_now()})
        self.store.upsert("proposals", proposal.id, proposal.model_dump())
        self.audit.record(
            "section.approved",
            f"Approved section {section_id}.",
            proposal.opportunity_id,
            proposal.id,
        )
        return proposal

    def approve(self, proposal_id: str) -> Proposal | None:
        proposal = self.get(proposal_id)
        if not proposal:
            return None
        proposal = proposal.model_copy(
            update={
                "status": "Approved",
                "sections": [
                    item.model_copy(update={"status": "Approved"})
                    for item in proposal.sections
                ],
                "updated_at": utc_now(),
            }
        )
        self.store.upsert("proposals", proposal.id, proposal.model_dump())
        self.audit.record(
            "proposal.approved",
            "Approved the complete proposal.",
            proposal.opportunity_id,
            proposal.id,
        )
        return proposal
