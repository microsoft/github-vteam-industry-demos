from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    storage_mode: str = os.getenv("KYC_STORAGE_MODE", "memory")
    storage_account_name: str = os.getenv("STORAGE_ACCOUNT_NAME", "")
    storage_container_name: str = os.getenv("STORAGE_CONTAINER_NAME", "kyc-demo")
    document_intelligence_endpoint: str = os.getenv("DOCUMENT_INTELLIGENCE_ENDPOINT", "")
    azure_client_id: str = os.getenv("AZURE_CLIENT_ID", "")
    process_primary_on_startup: bool = os.getenv("PROCESS_PRIMARY_ON_STARTUP", "false").lower() == "true"
    foundry_project_endpoint: str = os.getenv("FOUNDRY_PROJECT_ENDPOINT", "")
    foundry_model_deployment: str = os.getenv("FOUNDRY_MODEL_DEPLOYMENT", "")
    foundry_agent_document_name: str = os.getenv(
        "FOUNDRY_AGENT_DOCUMENT_NAME", "kyc-document-entity-extractor"
    )
    foundry_agent_document_version: str = os.getenv("FOUNDRY_AGENT_DOCUMENT_VERSION", "")
    foundry_agent_completeness_name: str = os.getenv(
        "FOUNDRY_AGENT_COMPLETENESS_NAME", "kyc-completeness-validator"
    )
    foundry_agent_completeness_version: str = os.getenv("FOUNDRY_AGENT_COMPLETENESS_VERSION", "")
    foundry_agent_risk_name: str = os.getenv("FOUNDRY_AGENT_RISK_NAME", "kyc-risk-investigator")
    foundry_agent_risk_version: str = os.getenv("FOUNDRY_AGENT_RISK_VERSION", "")
    foundry_agent_summary_name: str = os.getenv("FOUNDRY_AGENT_SUMMARY_NAME", "kyc-analyst-summary")
    foundry_agent_summary_version: str = os.getenv("FOUNDRY_AGENT_SUMMARY_VERSION", "")
    azure_search_endpoint: str = os.getenv("AZURE_SEARCH_ENDPOINT", "")
    azure_search_index_name: str = os.getenv("AZURE_SEARCH_INDEX_NAME", "kyc-screening-v1")
