from dataclasses import dataclass

from app.backend.config import Settings
from app.backend.services.agents import AgentService, create_agent_service
from app.backend.services.core import AuditService, OpportunityService, SeedService
from app.backend.services.retrieval import KnowledgeRetriever, create_retriever
from app.backend.services.workflow import ProposalService
from app.backend.storage import Store, create_store


@dataclass
class Services:
    settings: Settings
    store: Store
    audit: AuditService
    opportunities: OpportunityService
    seeds: SeedService
    agents: AgentService
    retriever: KnowledgeRetriever
    proposals: ProposalService


def create_services(settings: Settings, store: Store | None = None) -> Services:
    active_store = store or create_store(settings)
    audit = AuditService(active_store)
    opportunities = OpportunityService(active_store, audit)
    seeds = SeedService(active_store)
    agents = create_agent_service(settings)
    retriever = create_retriever(settings, active_store)
    proposals = ProposalService(
        active_store, opportunities, audit, agents, retriever
    )
    return Services(
        settings,
        active_store,
        audit,
        opportunities,
        seeds,
        agents,
        retriever,
        proposals,
    )
