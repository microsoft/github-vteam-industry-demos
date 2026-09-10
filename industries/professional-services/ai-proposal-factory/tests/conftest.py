from pathlib import Path

import pytest

from app.backend.config import Settings
from app.backend.container import Services, create_services
from app.backend.storage import JsonStore


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        demo_mode=True,
        data_path=str(tmp_path / "store.json"),
        storage_table_endpoint=None,
        storage_blob_endpoint=None,
        search_endpoint=None,
        search_index_name="aipf-knowledge",
        foundry_project_endpoint=None,
        requirements_agent_id=None,
        proposal_agent_id=None,
        risk_agent_id=None,
        azure_client_id=None,
    )


@pytest.fixture
def services(settings: Settings) -> Services:
    service_container = create_services(settings, JsonStore(settings.data_path))
    service_container.seeds.seed()
    return service_container
