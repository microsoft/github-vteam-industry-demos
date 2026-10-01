from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import (
    AgentEndpointConfig,
    FixedRatioVersionSelectionRule,
    PromptAgentDefinition,
    PromptAgentDefinitionTextOptions,
    ProtocolConfiguration,
    ResponsesProtocolConfiguration,
    TextResponseFormatJsonSchema,
    VersionSelector,
)
from azure.identity import AzureCliCredential, DefaultAzureCredential
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchField,
    SearchFieldDataType,
    SearchIndex,
    SearchableField,
    SimpleField,
)
from jsonschema import Draft202012Validator

from phase3_contract import (
    AGENTS,
    FIXTURES,
    SEARCH_INDEX_NAME,
    SEARCH_SEED_VERSION,
    screening_records,
)


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts"
AGENT_DEFINITIONS_PATH = ARTIFACTS / "phase3-agent-definitions.json"
SEARCH_SEED_PATH = ARTIFACTS / "phase3-search-seed.json"
HANDOFF_PATH = ARTIFACTS / "phase3-azure-ai-handoff.json"
VALIDATION_PATH = ARTIFACTS / "phase3-validation.json"
PARAMETERS_PATH = ROOT / "infra" / "main.parameters.json"


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def stable_hash(agent: dict[str, Any], model: str) -> str:
    payload = {
        "model": model,
        "instructions": agent["instructions"],
        "schema_name": agent["schema_name"],
        "schema": agent["schema"],
    }
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def credential_for(args: argparse.Namespace):
    if args.azure_cli_credential:
        return AzureCliCredential()
    client_id = args.managed_identity_client_id or os.getenv("AZURE_CLIENT_ID")
    options: dict[str, Any] = {}
    if client_id:
        options["managed_identity_client_id"] = client_id
    return DefaultAzureCredential(**options)


def export_contract() -> None:
    definitions = {
        "contract_version": "1.0",
        "agents": [
            {
                "purpose": agent["purpose"],
                "name": agent["name"],
                "response_schema_name": agent["schema_name"],
                "instructions": agent["instructions"],
                "response_schema": agent["schema"],
                "validation_fixture": FIXTURES[agent["name"]](),
            }
            for agent in AGENTS
        ],
    }
    records = screening_records()
    if not 30 <= len(records) <= 50:
        raise RuntimeError(f"Search seed must contain 30-50 records, found {len(records)}")
    if not all(record["synthetic"] is True for record in records):
        raise RuntimeError("Every Search record must be marked synthetic")
    write_json(AGENT_DEFINITIONS_PATH, definitions)
    write_json(
        SEARCH_SEED_PATH,
        {
            "seed_version": SEARCH_SEED_VERSION,
            "index_name": SEARCH_INDEX_NAME,
            "records": records,
        },
    )


def create_or_reuse_agent(
    project_client: AIProjectClient, agent: dict[str, Any], model: str
) -> dict[str, str]:
    contract_hash = stable_hash(agent, model)
    versions = list(project_client.agents.list_versions(agent["name"], include_drafts=True))
    matching = next(
        (
            version
            for version in versions
            if (version.metadata or {}).get("contract_hash") == contract_hash
            and (version.metadata or {}).get("contract_version") == "1.0"
        ),
        None,
    )
    if matching is None:
        matching = project_client.agents.create_version(
            agent_name=agent["name"],
            definition=PromptAgentDefinition(
                model=model,
                instructions=agent["instructions"],
                text=PromptAgentDefinitionTextOptions(
                    format=TextResponseFormatJsonSchema(
                        name=agent["schema_name"],
                        description=f"Strict Phase 3 output for {agent['purpose']}.",
                        schema=agent["schema"],
                        strict=True,
                    )
                ),
            ),
            description=f"{agent['purpose']} contract 1.0",
            metadata={
                "contract_hash": contract_hash,
                "contract_version": "1.0",
                "schema_name": agent["schema_name"],
                "managed_by": "scripts/deploy_phase3_ai.py",
            },
        )
    project_client.agents.update_details(
        agent_name=agent["name"],
        agent_endpoint=AgentEndpointConfig(
            version_selector=VersionSelector(
                version_selection_rules=[
                    FixedRatioVersionSelectionRule(
                        agent_version=matching.version,
                        traffic_percentage=100,
                    )
                ]
            ),
            protocol_configuration=ProtocolConfiguration(
                responses=ResponsesProtocolConfiguration()
            ),
        ),
    )
    details = project_client.agents.get(agent["name"])
    return {
        "purpose": agent["purpose"],
        "name": matching.name,
        "version": matching.version,
        "id": matching.id,
        "agent_id": details.id,
        "response_schema_name": agent["schema_name"],
        "contract_hash": contract_hash,
    }


def validate_agent(
    project_client: AIProjectClient, agent: dict[str, Any], deployed: dict[str, str]
) -> dict[str, Any]:
    validator = Draft202012Validator(agent["schema"])
    client = project_client.get_openai_client(agent_name=agent["name"])
    conversation = client.conversations.create()
    started_at = datetime.now(UTC)
    started = time.perf_counter()
    try:
        response = client.responses.create(
            conversation=conversation.id,
            input=json.dumps(FIXTURES[agent["name"]](), ensure_ascii=False),
        )
        output = json.loads(response.output_text)
        validator.validate(output)
        return {
            "name": agent["name"],
            "version": deployed["version"],
            "response_id": response.id,
            "schema_name": agent["schema_name"],
            "schema_valid": True,
            "started_at": started_at.isoformat(),
            "validated_at": datetime.now(UTC).isoformat(),
            "elapsed_seconds": round(time.perf_counter() - started, 3),
            "output": output,
        }
    finally:
        try:
            client.conversations.delete(conversation.id)
        except Exception:
            pass


def search_index() -> SearchIndex:
    return SearchIndex(
        name=SEARCH_INDEX_NAME,
        fields=[
            SimpleField(
                name="record_id",
                type=SearchFieldDataType.String,
                key=True,
                filterable=True,
            ),
            SimpleField(
                name="record_type",
                type=SearchFieldDataType.String,
                filterable=True,
                facetable=True,
            ),
            SearchableField(name="display_name", type=SearchFieldDataType.String),
            SearchableField(
                name="normalized_name",
                type=SearchFieldDataType.String,
                filterable=True,
            ),
            SearchField(
                name="aliases",
                type=SearchFieldDataType.Collection(SearchFieldDataType.String),
                searchable=True,
            ),
            SearchField(
                name="countries",
                type=SearchFieldDataType.Collection(SearchFieldDataType.String),
                searchable=True,
                filterable=True,
                facetable=True,
            ),
            SimpleField(
                name="date_of_birth",
                type=SearchFieldDataType.String,
                filterable=True,
            ),
            SimpleField(
                name="entity_type",
                type=SearchFieldDataType.String,
                filterable=True,
                facetable=True,
            ),
            SearchableField(
                name="category",
                type=SearchFieldDataType.String,
                filterable=True,
                facetable=True,
            ),
            SearchableField(
                name="synthetic_risk_description",
                type=SearchFieldDataType.String,
            ),
            SearchableField(name="reference_text", type=SearchFieldDataType.String),
            SimpleField(
                name="source_label",
                type=SearchFieldDataType.String,
                filterable=True,
            ),
            SimpleField(
                name="synthetic",
                type=SearchFieldDataType.Boolean,
                filterable=True,
            ),
        ],
    )


def seed_and_validate_search(
    search_endpoint: str, credential: Any
) -> tuple[int, dict[str, Any]]:
    index_client = SearchIndexClient(search_endpoint, credential)
    index_client.create_or_update_index(search_index())
    records = screening_records()
    search_client = SearchClient(
        search_endpoint, SEARCH_INDEX_NAME, credential
    )
    upload = search_client.merge_or_upload_documents(records)
    failures = [result for result in upload if not result.succeeded]
    if failures:
        raise RuntimeError(f"Search upload failed for {[item.key for item in failures]}")
    count = 0
    results: list[Any] = []
    for attempt in range(6):
        count = search_client.get_document_count()
        results = list(
            search_client.search(
                search_text="Elara Voss",
                search_fields=["display_name", "aliases", "reference_text"],
                select=[
                    "record_id",
                    "display_name",
                    "record_type",
                    "synthetic",
                    "source_label",
                ],
                top=3,
            )
        )
        if count == len(records) and any(
            result["record_id"] == "SYN-WATCH-001" for result in results
        ):
            break
        if attempt < 5:
            time.sleep(5)
    if count != len(records):
        raise RuntimeError(f"Expected {len(records)} Search documents, found {count}")
    match = next(
        (result for result in results if result["record_id"] == "SYN-WATCH-001"),
        None,
    )
    if match is None:
        raise RuntimeError("Search validation did not retrieve SYN-WATCH-001")
    return count, {
        "query": "Elara Voss",
        "record_id": match["record_id"],
        "display_name": match["display_name"],
        "record_type": match["record_type"],
        "synthetic": match["synthetic"],
        "source_label": match["source_label"],
        "search_score": match["@search.score"],
    }


def update_parameters(agents: list[dict[str, str]]) -> None:
    parameters = json.loads(PARAMETERS_PATH.read_text(encoding="utf-8"))
    versions = {agent["name"]: agent["version"] for agent in agents}
    values = parameters["parameters"]
    values["foundryAgentDocumentVersion"] = {
        "value": versions["kyc-document-entity-extractor"]
    }
    values["foundryAgentCompletenessVersion"] = {
        "value": versions["kyc-completeness-validator"]
    }
    values["foundryAgentRiskVersion"] = {
        "value": versions["kyc-risk-investigator"]
    }
    values["foundryAgentSummaryVersion"] = {
        "value": versions["kyc-analyst-summary"]
    }
    write_json(PARAMETERS_PATH, parameters)


def configure_container_app(
    resource_group: str,
    app_name: str,
    project_endpoint: str,
    model: str,
    search_endpoint: str,
    agents: list[dict[str, str]],
) -> None:
    versions = {agent["name"]: agent["version"] for agent in agents}
    settings = [
        f"FOUNDRY_PROJECT_ENDPOINT={project_endpoint}",
        f"FOUNDRY_MODEL_DEPLOYMENT={model}",
        "FOUNDRY_AGENT_DOCUMENT_NAME=kyc-document-entity-extractor",
        f"FOUNDRY_AGENT_DOCUMENT_VERSION={versions['kyc-document-entity-extractor']}",
        "FOUNDRY_AGENT_COMPLETENESS_NAME=kyc-completeness-validator",
        f"FOUNDRY_AGENT_COMPLETENESS_VERSION={versions['kyc-completeness-validator']}",
        "FOUNDRY_AGENT_RISK_NAME=kyc-risk-investigator",
        f"FOUNDRY_AGENT_RISK_VERSION={versions['kyc-risk-investigator']}",
        "FOUNDRY_AGENT_SUMMARY_NAME=kyc-analyst-summary",
        f"FOUNDRY_AGENT_SUMMARY_VERSION={versions['kyc-analyst-summary']}",
        f"AZURE_SEARCH_ENDPOINT={search_endpoint}",
        f"AZURE_SEARCH_INDEX_NAME={SEARCH_INDEX_NAME}",
    ]
    az_command = shutil.which("az.cmd") or shutil.which("az")
    if az_command is None:
        raise RuntimeError("Azure CLI executable was not found")
    subprocess.run(
        [
            az_command,
            "containerapp",
            "update",
            "--resource-group",
            resource_group,
            "--name",
            app_name,
            "--set-env-vars",
            *settings,
            "--output",
            "none",
        ],
        cwd=ROOT,
        check=True,
    )


def build_handoff(
    args: argparse.Namespace,
    agents: list[dict[str, str]],
    seed_count: int,
) -> dict[str, Any]:
    identity_scope = (
        f"/subscriptions/{args.subscription_id}/resourceGroups/{args.resource_group}"
        f"/providers/Microsoft.ManagedIdentity/userAssignedIdentities/{args.identity_name}"
    )
    foundry_scope = (
        f"/subscriptions/{args.subscription_id}/resourceGroups/{args.resource_group}"
        f"/providers/Microsoft.CognitiveServices/accounts/{args.foundry_name}"
    )
    search_scope = (
        f"/subscriptions/{args.subscription_id}/resourceGroups/{args.resource_group}"
        f"/providers/Microsoft.Search/searchServices/{args.search_service_name}"
    )
    return {
        "artifact_version": "1.0",
        "generated_at": datetime.now(UTC).isoformat(),
        "foundry_project_endpoint": args.project_endpoint,
        "model_deployment_name": args.model,
        "model_deployment": {
            "name": args.model,
            "model": args.model,
            "version": args.model_version,
            "sku": args.model_sku,
            "capacity": args.model_capacity,
            "region": "swedencentral",
        },
        "agents": agents,
        "agent_definitions_path": str(AGENT_DEFINITIONS_PATH.relative_to(ROOT)),
        "expected_schemas": {
            agent["name"]: {
                "schema_name": agent["response_schema_name"],
                "path": str(AGENT_DEFINITIONS_PATH.relative_to(ROOT)),
            }
            for agent in agents
        },
        "search_endpoint": args.search_endpoint,
        "search_index_name": SEARCH_INDEX_NAME,
        "search_seed_version": SEARCH_SEED_VERSION,
        "search_seed_count": seed_count,
        "primary_case_screening_record_ids": ["SYN-WATCH-001"],
        "required_environment_variables": [
            "AZURE_CLIENT_ID",
            "FOUNDRY_PROJECT_ENDPOINT",
            "FOUNDRY_MODEL_DEPLOYMENT",
            "FOUNDRY_AGENT_DOCUMENT_NAME",
            "FOUNDRY_AGENT_DOCUMENT_VERSION",
            "FOUNDRY_AGENT_COMPLETENESS_NAME",
            "FOUNDRY_AGENT_COMPLETENESS_VERSION",
            "FOUNDRY_AGENT_RISK_NAME",
            "FOUNDRY_AGENT_RISK_VERSION",
            "FOUNDRY_AGENT_SUMMARY_NAME",
            "FOUNDRY_AGENT_SUMMARY_VERSION",
            "AZURE_SEARCH_ENDPOINT",
            "AZURE_SEARCH_INDEX_NAME",
        ],
        "required_role_assignments": [
            {
                "principal": identity_scope,
                "scope": foundry_scope,
                "role_name": "Foundry User",
            },
            {
                "principal": identity_scope,
                "scope": search_scope,
                "role_name": "Search Index Data Contributor",
            },
        ],
        "validation": {
            "structured_agent_invocations_passed": True,
            "search_query_passed": True,
            "evidence_path": str(VALIDATION_PATH.relative_to(ROOT)),
        },
        "contains_secrets": False,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--generate-only", action="store_true")
    parser.add_argument("--azure-cli-credential", action="store_true")
    parser.add_argument("--configure-container-app", action="store_true")
    parser.add_argument("--skip-search-seed", action="store_true")
    parser.add_argument("--subscription-id", default="e2d6ac89-1bb7-420c-97fb-a96dea6c0635")
    parser.add_argument("--resource-group", default="rg-financial-services-01")
    parser.add_argument("--foundry-name", default="foundry-financial-services-01")
    parser.add_argument("--project-name", default="proj-financial-services-01")
    parser.add_argument("--model", default="gpt-5-mini")
    parser.add_argument("--search-service-name", default="srch-kyc-fs01-7jkdk72fhocg2")
    parser.add_argument("--identity-name", default="id-kyc-fs01")
    parser.add_argument("--container-app-name", default="ca-kyc-fs01")
    parser.add_argument("--model-version", default="2025-08-07")
    parser.add_argument("--model-sku", default="GlobalStandard")
    parser.add_argument("--model-capacity", type=int, default=20)
    parser.add_argument("--managed-identity-client-id")
    args = parser.parse_args()
    args.project_endpoint = (
        f"https://{args.foundry_name}.services.ai.azure.com/api/projects/{args.project_name}"
    )
    args.search_endpoint = f"https://{args.search_service_name}.search.windows.net"
    return args


def main() -> int:
    args = parse_args()
    export_contract()
    if args.generate_only:
        print(f"Generated {AGENT_DEFINITIONS_PATH} and {SEARCH_SEED_PATH}")
        return 0

    credential = credential_for(args)
    deployed: list[dict[str, str]] = []
    agent_validations: list[dict[str, Any]] = []
    with AIProjectClient(
        endpoint=args.project_endpoint,
        credential=credential,
    ) as project_client:
        first = create_or_reuse_agent(project_client, AGENTS[0], args.model)
        deployed.append(first)
        agent_validations.append(validate_agent(project_client, AGENTS[0], first))
        for agent in AGENTS[1:]:
            deployed_agent = create_or_reuse_agent(project_client, agent, args.model)
            deployed.append(deployed_agent)
            agent_validations.append(
                validate_agent(project_client, agent, deployed_agent)
            )
        actual_names = {item.name for item in project_client.agents.list()}
        expected_names = {agent["name"] for agent in AGENTS}
        if actual_names != expected_names:
            raise RuntimeError(
                f"Expected exactly four canonical agents, found {sorted(actual_names)}"
            )

    if args.skip_search_seed:
        previous_validation = json.loads(VALIDATION_PATH.read_text(encoding="utf-8"))
        seed_count = previous_validation["search_seed_count"]
        search_validation = previous_validation["search_validation"]
    else:
        seed_count, search_validation = seed_and_validate_search(
            args.search_endpoint, credential
        )
    update_parameters(deployed)
    write_json(
        VALIDATION_PATH,
        {
            "validated_at": datetime.now(UTC).isoformat(),
            "model_deployment_name": args.model,
            "model_deployment": {
                "name": args.model,
                "model": args.model,
                "version": args.model_version,
                "sku": args.model_sku,
                "capacity": args.model_capacity,
                "region": "swedencentral",
                "rate_limits": {
                    "requests_per_minute": args.model_capacity,
                    "tokens_per_minute": args.model_capacity * 1000,
                },
            },
            "agent_validations": agent_validations,
            "search_validation": search_validation,
            "search_seed_count": seed_count,
            "search_seed_reused": args.skip_search_seed,
        },
    )
    write_json(HANDOFF_PATH, build_handoff(args, deployed, seed_count))
    if args.configure_container_app:
        configure_container_app(
            args.resource_group,
            args.container_app_name,
            args.project_endpoint,
            args.model,
            args.search_endpoint,
            deployed,
        )
    print(json.dumps(json.loads(HANDOFF_PATH.read_text(encoding="utf-8")), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
