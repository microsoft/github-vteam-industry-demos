"""
Create a native Azure AI Foundry HOSTED WORKFLOW for Fidelis claim processing.

This registers three prompt agents (intake, fraud-risk, policy-assessor) and a
Microsoft Agent Framework workflow that sequences them. The workflow shows up in
the Foundry portal's *Workflows* tab with a visual canvas, and the agents appear
in the *Agents* tab.

Unlike the classic Assistants "connected agents" orchestrator (create-workflow.ps1),
this uses the new Agents v2 surface (project_client.agents.create_version), which
is what the portal's Workflows designer reads.

Prereqs:
    pip install azure-ai-projects --pre azure-identity pyyaml
    az login   (AzureCliCredential)

Usage:
    python create-hosted-workflow.py \
        --endpoint https://<acct>.services.ai.azure.com/api/projects/<project> \
        --model gpt-4.1-mini \
        --yaml claim-workflow.yaml
"""

import argparse
import json
import os
from pathlib import Path

import yaml
from azure.identity import AzureCliCredential
from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import PromptAgentDefinition, WorkflowAgentDefinition


# The specialist agents referenced by name from claim-workflow.yaml.
AGENTS = {
    "ClaimIntakeAgent": """
        You are a claims intake specialist for Fidelis Insurance. Given a raw
        insurance claim (JSON or free text), extract and validate the key fields
        and check for completeness and obvious data-quality issues (missing
        fields, future incident dates, non-positive amounts). Return ONLY a JSON
        object: {"fields":{"claimantName":string|null,"policyNumber":string|null,
        "amount":number|null,"incidentDate":"YYYY-MM-DD"|null,
        "description":string|null},"issues":[string],"complete":true|false}.
        Output no prose.
    """,
    "FraudRiskAgent": """
        You are an insurance fraud and risk analyst for Fidelis Insurance. Using
        the claim and any prior analysis in the conversation, assess fraud/risk
        signals: late submission, amount near the coverage limit, suspiciously
        round amounts, incident-date anomalies, description inconsistencies.
        Return ONLY a JSON object: {"riskScore":0-100,
        "riskLevel":"Low"|"Medium"|"High","flags":[string],"rationale":string}.
        Output no prose.
    """,
    "ClaimAssessorAgent": """
        You are the senior claim assessor for Fidelis Insurance. Using the claim,
        the intake result, and the fraud/risk analysis already in the
        conversation, evaluate the claim against the policy and produce ONE final
        synthesized recommendation. Return ONLY a JSON object:
        {"recommendation":"Approve"|"Reject"|"Review","confidence":0.0-1.0,
        "riskLevel":"Low"|"Medium"|"High","reasons":[string],
        "subAgentSummary":{"intake":string,"fraud":string,"assessment":string}}.
        Your output is advisory only; the deterministic PolicyEngine and human
        adjuster remain authoritative. Output no prose outside the JSON.
    """,
}


def create_agents(client: AIProjectClient, model: str) -> dict:
    ids = {}
    for name, instructions in AGENTS.items():
        agent = client.agents.create_version(
            agent_name=name,
            definition=PromptAgentDefinition(
                model=model,
                instructions=" ".join(instructions.split()),
            ),
        )
        ids[name] = agent.id
        print(f"Created/updated agent {name}: {agent.id}")
    return ids


def create_workflow(client: AIProjectClient, yaml_path: str) -> str:
    workflow_yaml = Path(yaml_path).read_text(encoding="utf-8")
    definition = yaml.safe_load(workflow_yaml)
    workflow = client.agents.create_version(
        agent_name=definition["name"],
        definition=WorkflowAgentDefinition(workflow=workflow_yaml),
        description=definition.get("description", ""),
    )
    print(f"Created/updated workflow {definition['name']}: {workflow.id}")
    return workflow.id


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default=os.environ.get("AZURE_FOUNDRY_PROJECT_ENDPOINT"))
    parser.add_argument("--model", default=os.environ.get("AZURE_FOUNDRY_GPT_MODEL", "gpt-4.1-mini"))
    parser.add_argument("--yaml", default=str(Path(__file__).with_name("claim-workflow.yaml")))
    args = parser.parse_args()

    if not args.endpoint:
        raise SystemExit("--endpoint (or AZURE_FOUNDRY_PROJECT_ENDPOINT) is required.")

    print("=" * 60)
    print("Creating hosted Claim Processing workflow in Azure AI Foundry")
    print("=" * 60)
    print(f"Endpoint: {args.endpoint}")
    print(f"Model:    {args.model}")
    print(f"YAML:     {args.yaml}\n")

    # Azure CLI can be slow to spawn on cold machines; give the token fetch headroom
    # so the SDK credential doesn't trip its default 10s subprocess timeout.
    credential = AzureCliCredential(process_timeout=60)
    client = AIProjectClient(endpoint=args.endpoint, credential=credential, allow_preview=True)

    print("Registering specialist agents...")
    agent_ids = create_agents(client, args.model)

    print("\nRegistering workflow...")
    workflow_id = create_workflow(client, args.yaml)

    out = {
        "projectEndpoint": args.endpoint,
        "model": args.model,
        "workflowId": workflow_id,
        "agents": agent_ids,
    }
    out_path = Path(__file__).with_name("hosted-workflow.json")
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print("\n" + "=" * 60)
    print("Hosted workflow created. Open the Foundry portal -> Workflows tab.")
    print(f"Recorded IDs -> {out_path}")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
