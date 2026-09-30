from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    app_env: str = "demo"
    app_adapter_mode: Literal["azure", "local"] = "azure"
    port: int = 8000
    azure_client_id: str | None = None
    azure_storage_account_name: str | None = None
    azure_storage_blob_endpoint: str | None = None
    azure_storage_table_endpoint: str | None = None
    azure_search_endpoint: str | None = None
    azure_search_index_name: str = "knowledge-items"
    foundry_project_endpoint: str | None = None
    foundry_model_deployment: str = "gpt-5-mini"
    foundry_requirements_agent_name: str = "requirements-analyst"
    foundry_proposal_writer_agent_name: str = "proposal-writer"
    foundry_risk_reviewer_agent_name: str = "risk-reviewer"
    foundry_requirements_agent_id: str | None = None
    foundry_proposal_writer_agent_id: str | None = None
    foundry_proposal_writer_agent_version: str | None = None
    foundry_risk_reviewer_agent_id: str | None = None
    demo_seed_version: str = "v1"
    generation_step_delay_ms: int = 0

    @property
    def repository_root(self) -> Path:
        return Path(__file__).resolve().parents[3]

    @property
    def frontend_dist(self) -> Path:
        return self.repository_root / "app" / "frontend" / "dist"

    def validate_azure_runtime(self) -> None:
        required = {
            "AZURE_STORAGE_BLOB_ENDPOINT": self.azure_storage_blob_endpoint,
            "AZURE_STORAGE_TABLE_ENDPOINT": self.azure_storage_table_endpoint,
            "AZURE_SEARCH_ENDPOINT": self.azure_search_endpoint,
            "FOUNDRY_PROJECT_ENDPOINT": self.foundry_project_endpoint,
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise RuntimeError(
                "Azure adapter mode is configured but required settings are missing: "
                + ", ".join(missing)
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
