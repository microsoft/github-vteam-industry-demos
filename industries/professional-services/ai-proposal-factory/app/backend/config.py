import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    demo_mode: bool
    data_path: str
    storage_table_endpoint: str | None
    storage_blob_endpoint: str | None
    search_endpoint: str | None
    search_index_name: str
    foundry_project_endpoint: str | None
    requirements_agent_id: str | None
    proposal_agent_id: str | None
    risk_agent_id: str | None
    azure_client_id: str | None

    @classmethod
    def from_environment(cls) -> "Settings":
        demo_value = os.getenv("AIPF_DEMO_MODE", "true").lower()
        return cls(
            demo_mode=demo_value not in {"false", "0", "no"},
            data_path=os.getenv("AIPF_DATA_PATH", "data/runtime/store.json"),
            storage_table_endpoint=os.getenv("AZURE_STORAGE_TABLE_ENDPOINT"),
            storage_blob_endpoint=os.getenv("AZURE_STORAGE_BLOB_ENDPOINT"),
            search_endpoint=os.getenv("AZURE_AI_SEARCH_ENDPOINT"),
            search_index_name=os.getenv("AZURE_AI_SEARCH_INDEX_NAME", "aipf-knowledge"),
            foundry_project_endpoint=os.getenv("AZURE_AI_FOUNDRY_PROJECT_ENDPOINT"),
            requirements_agent_id=os.getenv("AIPF_REQUIREMENTS_AGENT_ID"),
            proposal_agent_id=os.getenv("AIPF_PROPOSAL_AGENT_ID"),
            risk_agent_id=os.getenv("AIPF_RISK_AGENT_ID"),
            azure_client_id=os.getenv("AZURE_CLIENT_ID"),
        )
