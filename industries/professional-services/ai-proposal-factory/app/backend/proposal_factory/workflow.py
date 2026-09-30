import asyncio
import logging
from uuid import uuid4

from .adapters import Agents, Search, Storage
from .config import Settings
from .models import AuditEvent, GenerationJob, Proposal, ProposalSection, utc_now

logger = logging.getLogger(__name__)


class ProposalWorkflow:
    def __init__(
        self,
        storage: Storage,
        search: Search,
        agents: Agents,
        settings: Settings,
    ) -> None:
        self.storage = storage
        self.search = search
        self.agents = agents
        self.delay = settings.generation_step_delay_ms / 1000

    async def queue(self, opportunity_id: str, document_ids: list[str]) -> GenerationJob:
        generation_id = f"gen-{uuid4().hex[:12]}"
        job = GenerationJob(
            id=generation_id,
            opportunityId=opportunity_id,
            status="queued",
            progressMessage="Proposal generation is queued.",
        )
        await self.storage.save_job(job)
        asyncio.create_task(self.run(job, document_ids))
        return job

    async def run(self, job: GenerationJob, document_ids: list[str]) -> None:
        try:
            opportunity = await self.storage.get_opportunity(job.opportunityId)
            if not opportunity:
                raise RuntimeError("The selected opportunity no longer exists.")
            documents = await self.storage.get_documents(job.opportunityId, document_ids)
            if len(documents) != len(set(document_ids)):
                raise RuntimeError("One or more selected meeting notes could not be found.")

            await self._update(job, "analysing_requirements", "Analysing customer requirements")
            analysis = await self.agents.analyse_requirements(opportunity, documents)

            await self._update(job, "searching_knowledge", "Searching reusable knowledge")
            query = " ".join(
                [opportunity.name, opportunity.businessProblem, *analysis.businessGoals]
            )
            knowledge = await self.search.retrieve(query, opportunity.industry)

            await self._update(job, "drafting_proposal", "Drafting the proposal")
            sections = await self.agents.write_proposal(
                opportunity, analysis, documents, knowledge
            )
            section_timestamp = utc_now()
            for section in sections:
                section.status = "Generated"
                section.approvedAt = None
                section.updatedAt = section_timestamp

            await self._update(job, "reviewing_risks", "Reviewing risks and open questions")
            risks = await self.agents.review_risks(opportunity, analysis, sections)

            await self._update(job, "saving", "Saving the generated proposal")
            proposal_id = f"prop-{uuid4().hex[:12]}"
            proposal = Proposal(
                id=proposal_id,
                opportunityId=opportunity.id,
                customer=opportunity.customer,
                opportunityName=opportunity.name,
                requirementsAnalysis=analysis,
                sections=sections,
                riskFindings=risks,
            )
            await self.storage.save_proposal(proposal)
            await self.storage.save_audit_event(
                AuditEvent(
                    id=f"audit-{uuid4().hex[:12]}",
                    eventType="generation.started",
                    opportunityId=proposal.opportunityId,
                    proposalId=proposal.id,
                    actorType="system",
                    actorId=None,
                    summary="Proposal generation started.",
                    createdAt=job.createdAt,
                    details={"generationId": job.id},
                )
            )
            await self.storage.save_audit_event(
                AuditEvent(
                    id=f"audit-{uuid4().hex[:12]}",
                    eventType="proposal.generated",
                    opportunityId=proposal.opportunityId,
                    proposalId=proposal.id,
                    actorType="system",
                    actorId=None,
                    summary="Proposal generated with twelve sections and risk review.",
                    details={"generationId": job.id},
                )
            )
            job.proposalId = proposal_id
            await self._update(job, "completed", "Proposal is ready")
        except Exception as exc:
            logger.exception("Proposal generation failed for %s", job.id)
            job.status = "failed"
            job.error = str(exc)
            job.progressMessage = "Proposal generation failed. Review the message and retry."
            job.updatedAt = utc_now()
            await self.storage.save_job(job)

    async def _update(self, job: GenerationJob, status: str, message: str) -> None:
        job.status = status  # type: ignore[assignment]
        job.progressMessage = message
        job.updatedAt = utc_now()
        await self.storage.save_job(job)
        if self.delay:
            await asyncio.sleep(self.delay)

    async def regenerate_section(
        self,
        proposal: Proposal,
        section: ProposalSection,
        instruction: str | None,
    ) -> ProposalSection:
        opportunity = await self.storage.get_opportunity(proposal.opportunityId)
        if not opportunity:
            raise RuntimeError("The proposal opportunity could not be found.")
        query = " ".join(
            [
                opportunity.name,
                section.title,
                section.content,
                instruction or "",
            ]
        )
        knowledge = await self.search.retrieve(query, opportunity.industry)
        return await self.agents.regenerate_section(
            opportunity, proposal, section, knowledge, instruction
        )
