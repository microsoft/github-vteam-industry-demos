import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def configuration():
    path = Path(os.getenv("APP_CONFIG_FILE", str(ROOT / "infra" / "phase1-config.json")))
    config = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    for name in (
        "AZURE_CLIENT_ID", "AZURE_TENANT_ID", "SQLITE_PATH",
        "FOUNDRY_PROJECT_ENDPOINT", "FOUNDRY_MODEL_DEPLOYMENT",
        "DOWNTIME_AGENT_NAME", "DOWNTIME_AGENT_ID", "DOWNTIME_AGENT_VERSION",
        "MAINTENANCE_AGENT_NAME", "MAINTENANCE_AGENT_ID", "MAINTENANCE_AGENT_VERSION",
    ):
        if os.getenv(name):
            config[name] = os.environ[name]
    config.setdefault("SQLITE_PATH", str(ROOT / "data" / "manufacturing.db"))
    for key in ("SQLITE_PATH", "FOUNDRY_PROJECT_ENDPOINT"):
        if not config.get(key):
            raise RuntimeError(f"Missing configuration: {key}")
    for key in ("DOWNTIME", "MAINTENANCE"):
        if config.get(f"{key}_AGENT_VERSION") != "1":
            raise RuntimeError("Only verified Foundry agent version 1 is supported")
        if config.get(f"{key}_AGENT_ID") != f"{config.get(f'{key}_AGENT_NAME')}:1":
            raise RuntimeError("Agent ID/name/version configuration mismatch")
    config["credential_mode"] = os.getenv("AZURE_CREDENTIAL_MODE", "managed_identity")
    return config


def credential_for(config):
    from azure.identity import AzureCliCredential, ManagedIdentityCredential

    if config["credential_mode"] == "azure_cli":
        return AzureCliCredential(tenant_id=config.get("AZURE_TENANT_ID"), process_timeout=10)
    if config["credential_mode"] != "managed_identity" or not config.get("AZURE_CLIENT_ID"):
        raise RuntimeError("Use managed_identity with AZURE_CLIENT_ID; azure_cli is explicit local development only")
    return ManagedIdentityCredential(client_id=config["AZURE_CLIENT_ID"], retry_total=0,
                                     connection_timeout=5, read_timeout=10)
