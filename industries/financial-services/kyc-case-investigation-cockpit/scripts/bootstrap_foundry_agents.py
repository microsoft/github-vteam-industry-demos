import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import PromptAgentDefinition
from azure.core.exceptions import HttpResponseError
from azure.identity import DefaultAzureCredential

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app.backend.providers.foundry_prompts import AGENT_INSTRUCTIONS, AGENT_NAMES

AGENT_ENV_KEYS = {
    "extract": "FOUNDRY_AGENT_EXTRACT",
    "complete": "FOUNDRY_AGENT_COMPLETE",
    "risk": "FOUNDRY_AGENT_RISK",
    "summary": "FOUNDRY_AGENT_SUMMARY",
}
RETRYABLE_STATUS_CODES = {403, 404, 409, 429}


def definition_hash(model: str, instructions: str) -> str:
    payload = json.dumps(
        {"model": model, "instructions": instructions},
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def agent_specs() -> dict[str, dict[str, str]]:
    return {
        stage: {
            "name": os.getenv(env_key, AGENT_NAMES[stage]),
            "instructions": AGENT_INSTRUCTIONS[stage],
        }
        for stage, env_key in AGENT_ENV_KEYS.items()
    }


def ensure_agent(
    agents: Any,
    *,
    stage: str,
    name: str,
    model: str,
    instructions: str,
) -> tuple[Any, bool]:
    fingerprint = definition_hash(model, instructions)
    existing = list(
        agents.list_versions(
            name,
            limit=1,
            order="desc",
            include_drafts=True,
        )
    )
    if existing:
        latest = existing[0]
        metadata = getattr(latest, "metadata", None) or {}
        if metadata.get("definition_hash") == fingerprint:
            return latest, False
    created = agents.create_version(
        agent_name=name,
        definition=PromptAgentDefinition(
            model=model,
            instructions=instructions,
        ),
        description="KYC Cockpit managed prompt agent",
        metadata={
            "project": "kyc-case-investigation-cockpit",
            "stage": stage,
            "region": "swedencentral",
            "definition_hash": fingerprint,
        },
    )
    return created, True


def ensure_agent_with_retry(
    agents: Any,
    *,
    stage: str,
    name: str,
    model: str,
    instructions: str,
) -> tuple[Any, bool]:
    for attempt in range(4):
        try:
            return ensure_agent(
                agents,
                stage=stage,
                name=name,
                model=model,
                instructions=instructions,
            )
        except HttpResponseError as error:
            status_code = getattr(error, "status_code", None)
            if (
                status_code not in RETRYABLE_STATUS_CODES
                or attempt == 3
            ):
                raise
            time.sleep(15 * (attempt + 1))
    raise RuntimeError("Foundry agent bootstrap retry loop exhausted")


def write_azd_environment(results: list[dict[str, str]]) -> None:
    for result in results:
        prefix = AGENT_ENV_KEYS[result["stage"]]
        values = {
            prefix: result["name"],
            f"{prefix}_ID": result["id"],
            f"{prefix}_VERSION": result["version"],
        }
        for key, value in values.items():
            subprocess.run(
                ["azd", "env", "set", key, value],
                check=True,
                stdout=subprocess.DEVNULL,
            )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Idempotently create the four KYC Foundry agents."
    )
    parser.add_argument(
        "--stage",
        action="append",
        choices=list(AGENT_NAMES),
        help="Bootstrap only the selected stage; repeat for multiple stages.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the desired definitions without authenticating to Azure.",
    )
    parser.add_argument(
        "--no-write-azd-env",
        action="store_true",
        help="Do not store created agent identifiers in the current azd environment.",
    )
    args = parser.parse_args()

    location = os.getenv("AZURE_LOCATION", "swedencentral").lower()
    if location != "swedencentral":
        raise SystemExit(
            "Foundry agents must be bootstrapped in swedencentral."
        )
    model = os.getenv("AZURE_AI_MODEL_DEPLOYMENT_NAME", "gpt-5-1-kyc")
    specs = agent_specs()
    stages = args.stage or list(specs)
    if args.dry_run:
        print(
            json.dumps(
                {
                    "location": location,
                    "model": model,
                    "agents": [
                        {
                            "stage": stage,
                            "name": specs[stage]["name"],
                            "definition_hash": definition_hash(
                                model, specs[stage]["instructions"]
                            ),
                        }
                        for stage in stages
                    ],
                },
                indent=2,
            )
        )
        return

    endpoint = os.getenv("AZURE_AI_PROJECT_ENDPOINT")
    if not endpoint:
        raise SystemExit(
            "AZURE_AI_PROJECT_ENDPOINT is required after azd provision."
        )

    results: list[dict[str, str]] = []
    with AIProjectClient(
        endpoint=endpoint,
        credential=DefaultAzureCredential(),
    ) as project:
        for stage in stages:
            spec = specs[stage]
            agent, created = ensure_agent_with_retry(
                project.agents,
                stage=stage,
                name=spec["name"],
                model=model,
                instructions=spec["instructions"],
            )
            results.append(
                {
                    "stage": stage,
                    "id": str(agent.id),
                    "name": str(agent.name),
                    "version": str(agent.version),
                    "action": "created" if created else "unchanged",
                }
            )

    if not args.no_write_azd_env:
        write_azd_environment(results)
    print(json.dumps({"agents": results}, indent=2))


if __name__ == "__main__":
    main()
