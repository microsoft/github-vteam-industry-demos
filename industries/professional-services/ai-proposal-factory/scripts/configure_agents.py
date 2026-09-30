#!/usr/bin/env python3
"""Idempotently configure the three Microsoft Foundry prompt agents."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any

from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import PromptAgentDefinition
from azure.core.exceptions import ResourceNotFoundError
from azure.identity import DefaultAzureCredential


AGENT_SPECS: tuple[dict[str, str], ...] = (
    {
        "name": "requirements-analyst",
        "description": "Structures opportunity and meeting-note requirements for proposal generation.",
        "instructions": """You are the Requirements Analyst for AI Proposal Factory.
Analyse only the supplied synthetic opportunity, workspace fields, and selected meeting notes.
Return one valid JSON object and no markdown with exactly these array fields:
businessGoals, businessProblems, expectedOutcomes, scope, stakeholders, constraints,
successCriteria, timeline, budgetEffortAssumptions, openQuestions, missingInformation.
Each field must contain concise strings grounded in the supplied material. Do not invent facts.
Use openQuestions or missingInformation when evidence is absent or ambiguous.""",
    },
    {
        "name": "proposal-writer",
        "description": "Drafts full grounded proposals and regenerates one proposal section.",
        "instructions": """You are the Proposal Writer for AI Proposal Factory.
The backend supplies opportunity data, requirements analysis, meeting notes, and Azure AI Search
knowledge results. Treat supplied knowledge results as the only reusable organizational sources.

When taskMode is "single_section", regenerate only currentSection. Return one valid JSON object
and no markdown with exactly {id,title,order,content,sourceIds}. Preserve currentSection.id,
currentSection.title, and currentSection.order exactly. Use opportunity, requirementsAnalysis,
proposalContext, currentSection, reviewerInstruction, and retrievedKnowledge. Do not rewrite or
return any other section. Only use sourceIds present in retrievedKnowledge.

For every other task mode, return one valid JSON object and no markdown with a sections array
containing exactly twelve items in this order: Executive Summary, Customer Challenges,
Proposed Solution, Scope, Deliverables, Delivery Approach, Milestones, Assumptions, Dependencies,
Risks, Success Criteria, Next Steps. Each item must be {id,title,order,content,sourceIds}. Use stable
kebab-case ids, orders 1 through 12, professional concise content, and only sourceIds present in
the supplied knowledge results.

Never fabricate customer facts, commitments, pricing, dates, credentials, or source identifiers.
State assumptions and open points explicitly when evidence is incomplete.""",
    },
    {
        "name": "risk-reviewer",
        "description": "Reviews a proposal and returns separate structured risk findings.",
        "instructions": """You are the Risk Reviewer for AI Proposal Factory.
Review the supplied opportunity, requirements analysis, and generated proposal without rewriting it.
Return one valid JSON object and no markdown with a riskFindings array.
Every finding must be {id,severity,category,description,mitigationOrQuestion}.
severity must be Low, Medium, or High. category must be Risk, Assumption, Dependency,
Missing Information, or Open Question. Use stable kebab-case ids, avoid duplicates, remain grounded
in supplied content, and provide at least one useful finding when a material uncertainty exists.""",
    },
)


def _hash_spec(spec: dict[str, str], model: str) -> str:
    body = {"name": spec["name"], "model": model, "instructions": spec["instructions"]}
    return hashlib.sha256(json.dumps(body, sort_keys=True).encode("utf-8")).hexdigest()


def _latest_version(client: AIProjectClient, name: str) -> Any | None:
    versions = list(client.agents.list_versions(name, limit=100))
    if not versions:
        return None
    return max(versions, key=lambda item: int(item.version))


def configure_agent(client: AIProjectClient, spec: dict[str, str], model: str) -> dict[str, str]:
    desired_hash = _hash_spec(spec, model)
    try:
        client.agents.get(spec["name"])
        latest = _latest_version(client, spec["name"])
    except ResourceNotFoundError:
        latest = None

    metadata = getattr(latest, "metadata", None) or {}
    if latest is not None and metadata.get("configuration_sha256") == desired_hash:
        agent = latest
        action = "unchanged"
    else:
        agent = client.agents.create_version(
            agent_name=spec["name"],
            definition=PromptAgentDefinition(
                model=model,
                instructions=spec["instructions"],
                tools=[],
            ),
            description=spec["description"],
            metadata={
                "configuration_sha256": desired_hash,
                "managed_by": "scripts/configure_agents.py",
                "phase": "3",
            },
        )
        action = "created" if latest is None else "updated"

    return {
        "name": str(agent.name),
        "id": str(agent.id),
        "version": str(agent.version),
        "action": action,
        "configuration_sha256": desired_hash,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--endpoint",
        default=os.getenv("FOUNDRY_PROJECT_ENDPOINT"),
        help="Foundry project endpoint.",
    )
    parser.add_argument(
        "--model",
        default=os.getenv("FOUNDRY_MODEL_DEPLOYMENT", "gpt-5-mini"),
        help="Existing model deployment name.",
    )
    parser.add_argument("--output", type=Path, help="Optional JSON result file.")
    args = parser.parse_args()

    if not args.endpoint:
        parser.error("--endpoint or FOUNDRY_PROJECT_ENDPOINT is required")
    if not args.endpoint.rstrip("/").endswith("/api/projects/proj-professional-services-04"):
        raise SystemExit("Refusing to configure agents outside proj-professional-services-04.")

    credential = DefaultAzureCredential()
    with AIProjectClient(endpoint=args.endpoint.rstrip("/"), credential=credential) as client:
        existing_names = {str(agent.name) for agent in client.agents.list(limit=100)}
        expected_names = {spec["name"] for spec in AGENT_SPECS}
        unexpected = existing_names - expected_names
        if unexpected:
            raise SystemExit(
                "Refusing to continue because unexpected Foundry agents exist: "
                + ", ".join(sorted(unexpected))
            )

        agents = [configure_agent(client, spec, args.model) for spec in AGENT_SPECS]
        final_names = {str(agent.name) for agent in client.agents.list(limit=100)}
        if final_names != expected_names:
            raise SystemExit(
                f"Expected exactly {sorted(expected_names)}, found {sorted(final_names)}."
            )

    result = {
        "projectEndpoint": args.endpoint.rstrip("/"),
        "modelDeployment": args.model,
        "agents": agents,
    }
    rendered = json.dumps(result, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
