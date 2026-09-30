from dataclasses import dataclass

from .adapters import (
    Agents,
    AzureSearch,
    AzureStorage,
    FoundryAgents,
    InMemoryStorage,
    LocalAgents,
    LocalSearch,
    Search,
    Storage,
)
from .config import Settings
from .workflow import ProposalWorkflow


@dataclass
class Services:
    storage: Storage
    search: Search
    agents: Agents
    workflow: ProposalWorkflow


def build_services(settings: Settings) -> Services:
    if settings.app_adapter_mode == "local":
        storage = InMemoryStorage.from_seed_data(settings.repository_root)
        search = LocalSearch.from_seed_data(settings.repository_root)
        agents = LocalAgents()
    else:
        settings.validate_azure_runtime()
        storage = AzureStorage(settings)
        search = AzureSearch(settings)
        agents = FoundryAgents(settings)
    return Services(
        storage=storage,
        search=search,
        agents=agents,
        workflow=ProposalWorkflow(storage, search, agents, settings),
    )

