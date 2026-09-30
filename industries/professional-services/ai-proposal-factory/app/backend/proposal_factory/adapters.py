import asyncio
import json
import logging
import re
from abc import ABC, abstractmethod
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from .config import Settings
from .models import (
    AuditEvent,
    Document,
    GenerationJob,
    KnowledgeItem,
    Opportunity,
    Proposal,
    ProposalSection,
    RequirementsAnalysis,
    RiskFinding,
)

logger = logging.getLogger(__name__)

SECTION_TITLES = [
    "Executive Summary",
    "Customer Challenges",
    "Proposed Solution",
    "Scope",
    "Deliverables",
    "Delivery Approach",
    "Milestones",
    "Assumptions",
    "Dependencies",
    "Risks",
    "Success Criteria",
    "Next Steps",
]


class Storage(ABC):
    @abstractmethod
    async def list_opportunities(self) -> list[Opportunity]: ...

    @abstractmethod
    async def get_opportunity(self, opportunity_id: str) -> Opportunity | None: ...

    @abstractmethod
    async def list_documents(self, opportunity_id: str) -> list[Document]: ...

    @abstractmethod
    async def get_documents(self, opportunity_id: str, ids: list[str]) -> list[Document]: ...

    @abstractmethod
    async def save_job(self, job: GenerationJob) -> None: ...

    @abstractmethod
    async def get_job(self, generation_id: str) -> GenerationJob | None: ...

    @abstractmethod
    async def save_proposal(self, proposal: Proposal) -> None: ...

    @abstractmethod
    async def get_proposal(self, proposal_id: str) -> Proposal | None: ...

    @abstractmethod
    async def save_audit_event(self, event: AuditEvent) -> None: ...

    @abstractmethod
    async def list_audit_events(
        self, proposal_id: str | None = None, opportunity_id: str | None = None
    ) -> list[AuditEvent]: ...


class InMemoryStorage(Storage):
    def __init__(
        self,
        opportunities: Iterable[Opportunity] = (),
        documents: Iterable[Document] = (),
    ) -> None:
        self.opportunities = {item.id: item for item in opportunities}
        self.documents = {item.id: item for item in documents}
        self.jobs: dict[str, GenerationJob] = {}
        self.proposals: dict[str, Proposal] = {}
        self.audit_events: dict[str, AuditEvent] = {}

    @classmethod
    def from_seed_data(cls, root: Path) -> "InMemoryStorage":
        opportunities = [
            Opportunity.model_validate(item)
            for item in json.loads((root / "data" / "opportunities.json").read_text("utf-8"))
        ]
        documents = [
            Document.model_validate(item)
            for item in json.loads((root / "data" / "meeting-notes.json").read_text("utf-8"))
        ]
        return cls(opportunities, documents)

    async def list_opportunities(self) -> list[Opportunity]:
        return sorted(self.opportunities.values(), key=lambda item: item.modifiedAt, reverse=True)

    async def get_opportunity(self, opportunity_id: str) -> Opportunity | None:
        return self.opportunities.get(opportunity_id)

    async def list_documents(self, opportunity_id: str) -> list[Document]:
        return [item for item in self.documents.values() if item.opportunityId == opportunity_id]

    async def get_documents(self, opportunity_id: str, ids: list[str]) -> list[Document]:
        return [
            item
            for item_id in ids
            if (item := self.documents.get(item_id)) and item.opportunityId == opportunity_id
        ]

    async def save_job(self, job: GenerationJob) -> None:
        self.jobs[job.id] = job.model_copy(deep=True)

    async def get_job(self, generation_id: str) -> GenerationJob | None:
        return self.jobs.get(generation_id)

    async def save_proposal(self, proposal: Proposal) -> None:
        self.proposals[proposal.id] = proposal.model_copy(deep=True)

    async def get_proposal(self, proposal_id: str) -> Proposal | None:
        proposal = self.proposals.get(proposal_id)
        return proposal.model_copy(deep=True) if proposal else None

    async def save_audit_event(self, event: AuditEvent) -> None:
        self.audit_events[event.id] = event.model_copy(deep=True)

    async def list_audit_events(
        self, proposal_id: str | None = None, opportunity_id: str | None = None
    ) -> list[AuditEvent]:
        items = [
            item
            for item in self.audit_events.values()
            if (proposal_id is None or item.proposalId == proposal_id)
            and (opportunity_id is None or item.opportunityId == opportunity_id)
        ]
        return sorted(items, key=lambda item: item.createdAt, reverse=True)


class AzureStorage(Storage):
    def __init__(self, settings: Settings) -> None:
        from azure.data.tables import TableServiceClient
        from azure.identity import DefaultAzureCredential
        from azure.storage.blob import BlobServiceClient

        settings.validate_azure_runtime()
        credential = DefaultAzureCredential(managed_identity_client_id=settings.azure_client_id)
        self.tables = TableServiceClient(
            settings.azure_storage_table_endpoint,
            credential=credential,
        )
        self.blobs = BlobServiceClient(settings.azure_storage_blob_endpoint, credential)

    async def list_opportunities(self) -> list[Opportunity]:
        def operation() -> list[Opportunity]:
            entities = self.tables.get_table_client("opportunities").query_entities(
                "PartitionKey eq 'opportunity'"
            )
            return sorted(
                [
                    Opportunity.model_validate(
                        _decode_opportunity(_without_table_keys(dict(x)))
                    )
                    for x in entities
                ],
                key=lambda item: item.modifiedAt,
                reverse=True,
            )

        return await asyncio.to_thread(operation)

    async def get_opportunity(self, opportunity_id: str) -> Opportunity | None:
        from azure.core.exceptions import ResourceNotFoundError

        def operation() -> Opportunity | None:
            try:
                entity = self.tables.get_table_client("opportunities").get_entity(
                    "opportunity", opportunity_id
                )
                return Opportunity.model_validate(
                    _decode_opportunity(_without_table_keys(dict(entity)))
                )
            except ResourceNotFoundError:
                return None

        return await asyncio.to_thread(operation)

    async def list_documents(self, opportunity_id: str) -> list[Document]:
        def operation() -> list[Document]:
            container = self.blobs.get_container_client("meeting-notes")
            result: list[Document] = []
            prefix = f"{opportunity_id}/"
            for blob in container.list_blobs(name_starts_with=prefix):
                payload = json.loads(container.download_blob(blob.name).readall())
                result.append(Document.model_validate(payload))
            return result

        return await asyncio.to_thread(operation)

    async def get_documents(self, opportunity_id: str, ids: list[str]) -> list[Document]:
        documents = await self.list_documents(opportunity_id)
        selected = set(ids)
        return [item for item in documents if item.id in selected]

    async def save_job(self, job: GenerationJob) -> None:
        def operation() -> None:
            entity = job.model_dump()
            entity.update(PartitionKey=job.opportunityId, RowKey=job.id)
            self.tables.get_table_client("generationjobs").upsert_entity(entity)

        await asyncio.to_thread(operation)

    async def get_job(self, generation_id: str) -> GenerationJob | None:
        def operation() -> GenerationJob | None:
            entities = self.tables.get_table_client("generationjobs").query_entities(
                f"RowKey eq '{_odata(generation_id)}'"
            )
            entity = next(iter(entities), None)
            return (
                GenerationJob.model_validate(_without_table_keys(dict(entity))) if entity else None
            )

        return await asyncio.to_thread(operation)

    async def save_proposal(self, proposal: Proposal) -> None:
        def operation() -> None:
            blob_name = f"{proposal.opportunityId}/{proposal.id}.json"
            self.blobs.get_blob_client("proposals", blob_name).upload_blob(
                proposal.model_dump_json(), overwrite=True
            )
            self.tables.get_table_client("proposals").upsert_entity(
                {
                    "PartitionKey": proposal.opportunityId,
                    "RowKey": proposal.id,
                    "id": proposal.id,
                    "opportunityId": proposal.opportunityId,
                    "status": proposal.status,
                    "blobName": blob_name,
                    "createdAt": proposal.createdAt,
                    "updatedAt": proposal.updatedAt,
                }
            )

        await asyncio.to_thread(operation)

    async def get_proposal(self, proposal_id: str) -> Proposal | None:
        from azure.core.exceptions import ResourceNotFoundError

        def operation() -> Proposal | None:
            entities = self.tables.get_table_client("proposals").query_entities(
                f"RowKey eq '{_odata(proposal_id)}'"
            )
            entity = next(iter(entities), None)
            if not entity:
                return None
            try:
                payload = self.blobs.get_blob_client(
                    "proposals", entity["blobName"]
                ).download_blob().readall()
                return Proposal.model_validate_json(payload)
            except ResourceNotFoundError:
                return None

        return await asyncio.to_thread(operation)

    async def save_audit_event(self, event: AuditEvent) -> None:
        def operation() -> None:
            self.tables.create_table_if_not_exists("auditevents")
            entity = event.model_dump()
            entity["details"] = (
                json.dumps(event.details, ensure_ascii=False) if event.details else None
            )
            entity.update(
                PartitionKey=event.opportunityId,
                RowKey=f"{event.createdAt}-{event.id}",
            )
            entity = {key: value for key, value in entity.items() if value is not None}
            self.tables.get_table_client("auditevents").upsert_entity(entity)

        await asyncio.to_thread(operation)

    async def list_audit_events(
        self, proposal_id: str | None = None, opportunity_id: str | None = None
    ) -> list[AuditEvent]:
        def operation() -> list[AuditEvent]:
            table = self.tables.get_table_client("auditevents")
            filters: list[str] = []
            if opportunity_id:
                filters.append(f"PartitionKey eq '{_odata(opportunity_id)}'")
            if proposal_id:
                filters.append(f"proposalId eq '{_odata(proposal_id)}'")
            entities = (
                table.query_entities(" and ".join(filters))
                if filters
                else table.list_entities()
            )
            result = []
            for raw in entities:
                entity = _without_table_keys(dict(raw))
                details = entity.get("details")
                if isinstance(details, str):
                    entity["details"] = json.loads(details)
                result.append(AuditEvent.model_validate(entity))
            return sorted(result, key=lambda item: item.createdAt, reverse=True)

        try:
            return await asyncio.to_thread(operation)
        except Exception as exc:
            if exc.__class__.__name__ == "ResourceNotFoundError":
                return []
            raise


class Search(ABC):
    @abstractmethod
    async def retrieve(self, query: str, industry: str, top: int = 6) -> list[KnowledgeItem]: ...

    @abstractmethod
    async def browse(
        self,
        query: str | None = None,
        kind: str | None = None,
        industry: str | None = None,
        top: int = 50,
    ) -> list[KnowledgeItem]: ...

    @abstractmethod
    async def get_by_ids(self, ids: list[str]) -> list[KnowledgeItem]: ...


class LocalSearch(Search):
    def __init__(self, items: Iterable[KnowledgeItem]) -> None:
        self.items = list(items)

    @classmethod
    def from_seed_data(cls, root: Path) -> "LocalSearch":
        items = [
            KnowledgeItem.model_validate(item)
            for item in json.loads((root / "data" / "knowledge.json").read_text("utf-8"))
        ]
        return cls(items)

    async def retrieve(self, query: str, industry: str, top: int = 6) -> list[KnowledgeItem]:
        terms = set(re.findall(r"[a-z0-9]+", query.lower()))

        def score(item: KnowledgeItem) -> tuple[int, int]:
            haystack = f"{item.title} {item.content} {' '.join(item.tags)}".lower()
            return (
                sum(term in haystack for term in terms),
                int(item.industry.lower() in {industry.lower(), "cross-industry"}),
            )

        return sorted(self.items, key=score, reverse=True)[:top]

    async def browse(
        self,
        query: str | None = None,
        kind: str | None = None,
        industry: str | None = None,
        top: int = 50,
    ) -> list[KnowledgeItem]:
        terms = set(re.findall(r"[a-z0-9]+", (query or "").lower()))
        items = [
            item
            for item in self.items
            if (not kind or item.kind == kind)
            and (not industry or item.industry == industry)
            and (
                not terms
                or all(
                    term
                    in f"{item.title} {item.content} {' '.join(item.tags)}".lower()
                    for term in terms
                )
            )
        ]
        return sorted(items, key=lambda item: (item.kind, item.title))[:top]

    async def get_by_ids(self, ids: list[str]) -> list[KnowledgeItem]:
        wanted = set(ids)
        return [item for item in self.items if item.id in wanted]


class AzureSearch(Search):
    def __init__(self, settings: Settings) -> None:
        from azure.identity import DefaultAzureCredential
        from azure.search.documents import SearchClient

        settings.validate_azure_runtime()
        credential = DefaultAzureCredential(managed_identity_client_id=settings.azure_client_id)
        self.client = SearchClient(
            settings.azure_search_endpoint,
            settings.azure_search_index_name,
            credential,
        )

    async def retrieve(self, query: str, industry: str, top: int = 6) -> list[KnowledgeItem]:
        def operation() -> list[KnowledgeItem]:
            results = self.client.search(
                search_text=query,
                filter=f"industry eq '{_odata(industry)}' or industry eq 'Cross-industry'",
                select=["id", "title", "content", "kind", "industry", "tags", "sourceBlobName"],
                top=top,
            )
            return [KnowledgeItem.model_validate(dict(item)) for item in results]

        return await asyncio.to_thread(operation)

    async def browse(
        self,
        query: str | None = None,
        kind: str | None = None,
        industry: str | None = None,
        top: int = 50,
    ) -> list[KnowledgeItem]:
        def operation() -> list[KnowledgeItem]:
            filters = []
            if kind:
                filters.append(f"kind eq '{_odata(kind)}'")
            if industry:
                filters.append(f"industry eq '{_odata(industry)}'")
            results = self.client.search(
                search_text=query or "*",
                filter=" and ".join(filters) if filters else None,
                select=["id", "title", "content", "kind", "industry", "tags", "sourceBlobName"],
                top=top,
            )
            return [KnowledgeItem.model_validate(dict(item)) for item in results]

        return await asyncio.to_thread(operation)

    async def get_by_ids(self, ids: list[str]) -> list[KnowledgeItem]:
        if not ids:
            return []

        def operation() -> list[KnowledgeItem]:
            from azure.core.exceptions import ResourceNotFoundError

            items = []
            for item_id in ids:
                try:
                    item = self.client.get_document(
                        key=item_id,
                        selected_fields=[
                            "id",
                            "title",
                            "content",
                            "kind",
                            "industry",
                            "tags",
                            "sourceBlobName",
                        ],
                    )
                    items.append(KnowledgeItem.model_validate(dict(item)))
                except ResourceNotFoundError:
                    continue
            return items

        return await asyncio.to_thread(operation)


class Agents(ABC):
    @abstractmethod
    async def analyse_requirements(
        self, opportunity: Opportunity, documents: list[Document]
    ) -> RequirementsAnalysis: ...

    @abstractmethod
    async def write_proposal(
        self,
        opportunity: Opportunity,
        analysis: RequirementsAnalysis,
        documents: list[Document],
        knowledge: list[KnowledgeItem],
    ) -> list[ProposalSection]: ...

    @abstractmethod
    async def review_risks(
        self,
        opportunity: Opportunity,
        analysis: RequirementsAnalysis,
        sections: list[ProposalSection],
    ) -> list[RiskFinding]: ...

    @abstractmethod
    async def regenerate_section(
        self,
        opportunity: Opportunity,
        proposal: Proposal,
        section: ProposalSection,
        knowledge: list[KnowledgeItem],
        instruction: str | None,
    ) -> ProposalSection: ...


class LocalAgents(Agents):
    async def analyse_requirements(
        self, opportunity: Opportunity, documents: list[Document]
    ) -> RequirementsAnalysis:
        return RequirementsAnalysis(
            businessGoals=opportunity.expectedOutcomes,
            businessProblems=[opportunity.businessProblem],
            expectedOutcomes=opportunity.expectedOutcomes,
            scope=opportunity.scope,
            stakeholders=opportunity.stakeholders,
            constraints=opportunity.constraints,
            successCriteria=[
                "Agreed outcomes are measurable within the target timeline",
                "Delivery milestones are accepted by business and technology stakeholders",
            ],
            timeline=opportunity.targetTimeline,
            budgetEffortAssumptions=[opportunity.budgetAssumptions],
            openQuestions=["Confirm executive sponsor availability for milestone reviews."],
            missingInformation=(
                []
                if documents
                else ["No discovery meeting notes were selected for requirements analysis."]
            ),
        )

    async def write_proposal(
        self,
        opportunity: Opportunity,
        analysis: RequirementsAnalysis,
        documents: list[Document],
        knowledge: list[KnowledgeItem],
    ) -> list[ProposalSection]:
        sources = [item.id for item in knowledge[:3]]
        context = knowledge[0].content if knowledge else "industry-aligned delivery practices"
        contents = [
            f"{opportunity.customer} can accelerate {opportunity.name.lower()} through a focused "
            f"engagement that connects measurable outcomes with {context.lower()}",
            f"The current challenge is {opportunity.businessProblem.lower()} The programme must "
            f"also respect {', '.join(opportunity.constraints).lower()}.",
            f"We propose a collaborative, outcome-led solution covering "
            f"{', '.join(opportunity.scope).lower()}, supported by reusable delivery assets.",
            "In scope: " + "; ".join(opportunity.scope) + ".",
            "Deliverables include a validated target design, prioritized implementation backlog, "
            "working increments, knowledge transfer, and an outcome measurement plan.",
            "Delivery uses discover, design, deliver, and adopt stages with weekly governance, "
            "demonstrations, and decision checkpoints.",
            f"Mobilisation begins immediately. The target delivery duration is "
            f"{opportunity.duration}, with value demonstrated in each increment.",
            f"Commercial planning assumes {opportunity.budgetAssumptions.lower()} "
            "Customer subject-matter experts will be available for validation.",
            "Dependencies include timely environment access, customer data owners, architecture "
            "decisions, and participation from the named business stakeholders.",
            "Primary risks are ambiguous requirements, delayed access, adoption capacity, and "
            "scope expansion. Mitigations are captured in the separate risk review.",
            "Success will be measured by: " + "; ".join(analysis.successCriteria) + ".",
            "Confirm scope and sponsors, close the open questions, agree the mobilisation date, "
            "and schedule the first discovery workshop.",
        ]
        return [
            ProposalSection(
                id=f"section-{index:02d}",
                title=title,
                order=index,
                content=contents[index - 1],
                sourceIds=sources if index in {1, 3, 6} else [],
            )
            for index, title in enumerate(SECTION_TITLES, start=1)
        ]

    async def review_risks(
        self,
        opportunity: Opportunity,
        analysis: RequirementsAnalysis,
        sections: list[ProposalSection],
    ) -> list[RiskFinding]:
        return [
            RiskFinding(
                id="risk-01",
                severity="High",
                category="Missing Information",
                description="Decision ownership and escalation paths are not fully defined.",
                mitigationOrQuestion=(
                    "Confirm the executive sponsor and decision forum before kickoff."
                ),
            ),
            RiskFinding(
                id="risk-02",
                severity="Medium",
                category="Dependency",
                description=f"Delivery depends on customer access and stakeholder availability "
                f"within {opportunity.targetTimeline}.",
                mitigationOrQuestion="Agree named owners and access dates during mobilisation.",
            ),
            RiskFinding(
                id="risk-03",
                severity="Medium",
                category="Assumption",
                description=analysis.budgetEffortAssumptions[0],
                mitigationOrQuestion="Validate the commercial assumption before final contracting.",
            ),
        ]

    async def regenerate_section(
        self,
        opportunity: Opportunity,
        proposal: Proposal,
        section: ProposalSection,
        knowledge: list[KnowledgeItem],
        instruction: str | None,
    ) -> ProposalSection:
        grounding = knowledge[0].content if knowledge else "validated delivery practices"
        direction = (
            f" Reviewer direction: {instruction.rstrip('.')}." if instruction else ""
        )
        return section.model_copy(
            update={
                "content": (
                    f"{section.title} for {opportunity.customer} is refreshed using "
                    f"{grounding.lower()}.{direction}"
                ),
                "sourceIds": [item.id for item in knowledge[:3]],
            }
        )


class FoundryAgents(Agents):
    def __init__(self, settings: Settings) -> None:
        from azure.ai.projects import AIProjectClient
        from azure.identity import DefaultAzureCredential

        settings.validate_azure_runtime()
        credential = DefaultAzureCredential(managed_identity_client_id=settings.azure_client_id)
        self.project_client = AIProjectClient(
            endpoint=settings.foundry_project_endpoint,
            credential=credential,
        )
        self.openai_client = self.project_client.get_openai_client()
        self.settings = settings
        self._resolved_agents: dict[str, tuple[str, str]] = {}

    async def analyse_requirements(
        self, opportunity: Opportunity, documents: list[Document]
    ) -> RequirementsAnalysis:
        payload = await self._invoke(
            "requirements",
            self.settings.foundry_requirements_agent_id,
            self.settings.foundry_requirements_agent_name,
            {
                "task": "Analyse the opportunity and notes. Return only JSON matching the schema.",
                "schema": RequirementsAnalysis.model_json_schema(),
                "opportunity": opportunity.model_dump(),
                "meetingNotes": [item.model_dump() for item in documents],
            },
        )
        return RequirementsAnalysis.model_validate(payload)

    async def write_proposal(
        self,
        opportunity: Opportunity,
        analysis: RequirementsAnalysis,
        documents: list[Document],
        knowledge: list[KnowledgeItem],
    ) -> list[ProposalSection]:
        payload = await self._invoke(
            "proposal",
            self.settings.foundry_proposal_writer_agent_id,
            self.settings.foundry_proposal_writer_agent_name,
            {
                "task": "Write exactly twelve ordered proposal sections. Return only a JSON array.",
                "sectionTitles": SECTION_TITLES,
                "sectionSchema": ProposalSection.model_json_schema(),
                "opportunity": opportunity.model_dump(),
                "requirementsAnalysis": analysis.model_dump(),
                "meetingNotes": [item.model_dump() for item in documents],
                "retrievedKnowledge": [item.model_dump() for item in knowledge],
            },
        )
        if isinstance(payload, dict):
            payload = payload.get("sections")
        sections = [ProposalSection.model_validate(item) for item in payload]
        if len(sections) != 12:
            raise RuntimeError(f"Proposal Writer returned {len(sections)} sections; expected 12.")
        return sorted(sections, key=lambda item: item.order)

    async def review_risks(
        self,
        opportunity: Opportunity,
        analysis: RequirementsAnalysis,
        sections: list[ProposalSection],
    ) -> list[RiskFinding]:
        payload = await self._invoke(
            "risk",
            self.settings.foundry_risk_reviewer_agent_id,
            self.settings.foundry_risk_reviewer_agent_name,
            {
                "task": "Review without rewriting. Return only a JSON array of risk findings.",
                "schema": RiskFinding.model_json_schema(),
                "opportunity": opportunity.model_dump(),
                "requirementsAnalysis": analysis.model_dump(),
                "proposalSections": [item.model_dump() for item in sections],
            },
        )
        if isinstance(payload, dict):
            payload = payload.get("riskFindings")
        return [RiskFinding.model_validate(item) for item in payload]

    async def regenerate_section(
        self,
        opportunity: Opportunity,
        proposal: Proposal,
        section: ProposalSection,
        knowledge: list[KnowledgeItem],
        instruction: str | None,
    ) -> ProposalSection:
        payload = await self._invoke(
            "proposal",
            self.settings.foundry_proposal_writer_agent_id,
            self.settings.foundry_proposal_writer_agent_name,
            {
                "task": "Regenerate exactly one section and return only its JSON object.",
                "taskMode": "single_section",
                "sectionSchema": ProposalSection.model_json_schema(),
                "opportunity": opportunity.model_dump(),
                "requirementsAnalysis": proposal.requirementsAnalysis.model_dump(),
                "proposalContext": [
                    {
                        "id": item.id,
                        "title": item.title,
                        "order": item.order,
                        "content": item.content,
                    }
                    for item in proposal.sections
                ],
                "currentSection": section.model_dump(),
                "reviewerInstruction": instruction,
                "retrievedKnowledge": [item.model_dump() for item in knowledge],
            },
        )
        if isinstance(payload, dict) and "section" in payload:
            payload = payload["section"]
        regenerated = ProposalSection.model_validate(payload)
        if regenerated.id != section.id or regenerated.order != section.order:
            raise RuntimeError(
                "Proposal Writer returned a different section identity during regeneration."
            )
        regenerated.title = section.title
        return regenerated

    async def _invoke(
        self, role: str, explicit_id: str | None, agent_name: str, payload: dict[str, Any]
    ) -> Any:
        resolved_name, resolved_version = await self._resolve_agent(
            role, explicit_id, agent_name
        )

        def operation() -> Any:
            response = self.openai_client.responses.create(
                input=[
                    {
                        "role": "user",
                        "content": json.dumps(payload, ensure_ascii=False),
                    }
                ],
                extra_body={
                    "agent_reference": {
                        "name": resolved_name,
                        "version": resolved_version,
                        "type": "agent_reference",
                    }
                },
            )
            output_text = getattr(response, "output_text", None)
            if not output_text:
                raise RuntimeError(f"Foundry {agent_name} completed without a text response.")
            return _parse_json(output_text)

        try:
            return await asyncio.to_thread(operation)
        except Exception as exc:
            logger.exception("Foundry agent invocation failed for %s", agent_name)
            raise RuntimeError(f"Unable to run {agent_name}: {exc}") from exc

    async def _resolve_agent(
        self, role: str, explicit_id: str | None, agent_name: str
    ) -> tuple[str, str]:
        if role in self._resolved_agents:
            return self._resolved_agents[role]

        def operation() -> tuple[str, str]:
            matches = [
                agent
                for agent in self.project_client.agents.list(limit=100)
                if agent.name == agent_name
            ]
            if len(matches) != 1:
                raise RuntimeError(
                    f"Expected exactly one Foundry agent named '{agent_name}', "
                    f"found {len(matches)}."
                )
            versions = list(
                self.project_client.agents.list_versions(agent_name, limit=100)
            )
            if not versions:
                raise RuntimeError(f"Foundry agent '{agent_name}' has no configured versions.")
            if explicit_id:
                selected = [item for item in versions if str(item.id) == explicit_id]
                if len(selected) != 1:
                    raise RuntimeError(
                        f"Configured ID for Foundry agent '{agent_name}' did not match "
                        "exactly one deployed version."
                    )
                version = selected[0]
            elif (
                role == "proposal"
                and self.settings.foundry_proposal_writer_agent_version
            ):
                selected = [
                    item
                    for item in versions
                    if str(item.version)
                    == self.settings.foundry_proposal_writer_agent_version
                ]
                if len(selected) != 1:
                    raise RuntimeError(
                        "Configured Proposal Writer version did not match exactly one "
                        "deployed version."
                    )
                version = selected[0]
            else:
                version = max(versions, key=lambda item: int(item.version))
            return str(version.name), str(version.version)

        resolved = await asyncio.to_thread(operation)
        self._resolved_agents[role] = resolved
        return resolved


def _parse_json(value: str) -> Any:
    cleaned = value.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Foundry agent returned invalid JSON.") from exc


def _without_table_keys(entity: dict[str, Any]) -> dict[str, Any]:
    entity.pop("PartitionKey", None)
    entity.pop("RowKey", None)
    entity.pop("Timestamp", None)
    entity.pop("etag", None)
    return entity


def encode_opportunity_entity(opportunity: Opportunity, seed_version: str) -> dict[str, Any]:
    entity = opportunity.model_dump()
    for key in ("expectedOutcomes", "scope", "stakeholders", "constraints"):
        entity[key] = json.dumps(entity[key], ensure_ascii=False)
    entity.update(
        PartitionKey="opportunity",
        RowKey=opportunity.id,
        seedVersion=seed_version,
    )
    return entity


def _decode_opportunity(entity: dict[str, Any]) -> dict[str, Any]:
    for key in ("expectedOutcomes", "scope", "stakeholders", "constraints"):
        value = entity.get(key)
        if isinstance(value, str):
            entity[key] = json.loads(value)
    entity.pop("seedVersion", None)
    return entity


def _odata(value: str) -> str:
    return value.replace("'", "''")
