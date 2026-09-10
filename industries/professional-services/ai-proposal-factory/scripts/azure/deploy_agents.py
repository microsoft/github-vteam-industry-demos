from __future__ import annotations

import json
import os
from pathlib import Path

from azure.ai.agents import AgentsClient
from azure.identity import DefaultAzureCredential


AGENTS = {
    "requirements": {
        "name": "requirements-analyst",
        "instructions": (
            "You are the Requirements Analyst for a professional-services proposal. "
            "Return only valid JSON. Identify businessGoals, businessProblems, expectedOutcomes, "
            "scope, stakeholders, constraints, successCriteria, timeline, budgetAssumptions, "
            "openQuestions, and missingInformation. Never invent customer facts."
        ),
        "test": (
            'Return only JSON for a fictional retailer replacing fragmented support tools. '
            'Use keys "businessGoals", "scope", and "openQuestions".'
        ),
    },
    "proposal": {
        "name": "proposal-writer",
        "instructions": (
            "You are the Proposal Writer for a professional-services proposal. Use the reusable "
            "knowledge supplied in each request. Return only valid JSON with a sections array. "
            "Each section needs title, content, and source_references. Cover Executive Summary, "
            "Customer Challenges, Proposed Solution, Scope, Deliverables, Delivery Approach, "
            "Milestones, Assumptions, Dependencies, Risks, Success Criteria, and Next Steps."
        ),
        "test": (
            'Return only JSON with a "sections" array containing one Executive Summary. '
            'Use source_references ["Synthetic Practice Library / Proposal Snippet / 01"].'
        ),
    },
    "risk": {
        "name": "risk-reviewer",
        "instructions": (
            "You are the Risk Reviewer. Review a proposal without rewriting it. Return only valid "
            "JSON with a findings array. Each finding needs severity, category, description, and "
            "mitigation. Cover risks, assumptions, dependencies, missing information, and open questions."
        ),
        "test": (
            'Return only JSON with a "findings" array for a six-month cloud modernization proposal '
            'that has an unclear data-migration scope.'
        ),
    },
}


def parse_json_response(text: str) -> object:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(cleaned)


def main() -> None:
    endpoint = os.environ["AZURE_AI_FOUNDRY_PROJECT_ENDPOINT"]
    model = os.environ["AZURE_AI_MODEL_DEPLOYMENT_NAME"]
    output_path = Path(
        os.getenv("AIPF_DEPLOYMENT_OUTPUT", "scripts/azure/deployment-output.json")
    )

    results: dict[str, dict] = {}
    with DefaultAzureCredential() as credential:
        client = AgentsClient(endpoint=endpoint, credential=credential)
        existing = {agent.name: agent for agent in client.list_agents()}
        for key, configuration in AGENTS.items():
            agent = existing.get(configuration["name"])
            if agent is None:
                agent = client.create_agent(
                    model=model,
                    name=configuration["name"],
                    instructions=configuration["instructions"],
                )
            else:
                agent = client.update_agent(
                    agent.id,
                    model=model,
                    name=configuration["name"],
                    instructions=configuration["instructions"],
                )

            thread = client.threads.create()
            client.messages.create(
                thread_id=thread.id,
                role="user",
                content=configuration["test"],
            )
            run = client.runs.create_and_process(
                thread_id=thread.id,
                agent_id=agent.id,
            )
            if str(run.status).lower() not in {"completed", "runstatus.completed"}:
                raise RuntimeError(
                    f"{configuration['name']} test ended with status {run.status}"
                )
            messages = client.messages.list(thread_id=thread.id)
            response_text = next(
                message.text_messages[-1].text.value
                for message in messages
                if getattr(message.role, "value", str(message.role)).lower()
                == "assistant"
                and message.text_messages
            )
            parsed = parse_json_response(response_text)
            results[key] = {
                "name": agent.name,
                "id": str(agent.id),
                "test_status": "passed",
                "test_response_type": type(parsed).__name__,
            }
        client.close()

    output = {
        "project_endpoint": endpoint,
        "model_deployment": model,
        "agents": results,
    }
    output_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
