"""Create persistent Foundry prompt agents and invoke each once with synthetic input."""

import argparse
import json
import logging
from urllib.parse import urlparse

from phase1_azure import (
    CONFIG, EVIDENCE, GROUP, ROOT, SUBSCRIPTION, AzureError,
    arm, current_account, now, save,
)


def validate_output(schema, output):
    from jsonschema import validate

    validate(output, schema)

    def nonempty(value):
        if isinstance(value, str) and not value.strip():
            raise ValueError("EmptyStructuredText")
        if isinstance(value, list):
            if not value:
                raise ValueError("EmptyStructuredList")
            for item in value:
                nonempty(item)
        if isinstance(value, dict):
            for item in value.values():
                nonempty(item)

    nonempty(output)


def run(create):
    current_account()
    if not CONFIG.exists() or not EVIDENCE.exists():
        raise AzureError("NoVerifiedDeployment_NoAgentCallsAttempted")
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    if evidence.get("deployment", {}).get("status") != "Succeeded":
        raise AzureError("NoSuccessfulDeployment_NoAgentCallsAttempted")
    project_id = config["FOUNDRY_PROJECT_ID"]
    prefix = f"/subscriptions/{SUBSCRIPTION}/resourceGroups/{GROUP}/providers/Microsoft.CognitiveServices/accounts/"
    if not project_id or not project_id.startswith(prefix):
        raise AzureError("UnexpectedProjectScope")
    endpoint = config["FOUNDRY_PROJECT_ENDPOINT"]
    parsed = urlparse(endpoint)
    if (parsed.scheme != "https" or not parsed.hostname
            or not parsed.hostname.endswith(".services.ai.azure.com")
            or parsed.query or parsed.username or parsed.password):
        raise AzureError("UnexpectedProjectEndpoint")
    account_name, project_name = project_id[len(prefix):].split("/projects/")
    if endpoint != f"https://{account_name}.services.ai.azure.com/api/projects/{project_name}":
        raise AzureError("ProjectEndpointDoesNotMatchResourceId")
    project_resource = arm(project_id + "?api-version=2025-06-01")
    model_resource = arm(config["FOUNDRY_ACCOUNT_ID"] + "/deployments/"
                         + config["FOUNDRY_MODEL_DEPLOYMENT"] + "?api-version=2025-06-01")
    for resource in (project_resource, model_resource):
        if resource.get("properties", {}).get("provisioningState") != "Succeeded":
            raise AzureError("ResourceNotSucceeded_NoAgentCallsAttempted")
    from azure.ai.projects import AIProjectClient
    from azure.ai.projects.models import PromptAgentDefinition
    from azure.identity import AzureCliCredential

    # Use only the existing CLI identity, not environment secrets or another login.
    logging.getLogger("azure").setLevel(logging.CRITICAL)
    logging.getLogger("httpx").setLevel(logging.CRITICAL)
    definitions = json.loads((ROOT / "infra" / "agents.json").read_text(encoding="utf-8"))
    evidence["agentSmoke"] = {"startedAt": now(), "status": "running",
                              "maxOutputTokensPerAgent": 700, "maxRetries": 0,
                              "credential": "existing Azure CLI session, not app managed identity"}
    evidence["status"] = "agent_verification_in_progress"
    evidence.setdefault("agents", [])
    save(EVIDENCE, evidence)
    incident = {"synthetic": True, "equipment": "DEMO-MOTOR-01", "downtime_minutes": 7,
                "observations": ["Vibration rose from 2 to 6 mm/s.", "Operator heard an unusual noise."],
                "instruction": "Give a concise demonstration response, not an operational diagnosis."}
    investigation = None
    with AzureCliCredential(tenant_id=config["AZURE_TENANT_ID"]) as credential:
        with AIProjectClient(endpoint=endpoint, credential=credential, retry_total=0,
                             connection_timeout=20, read_timeout=90) as project:
            for definition in definitions:
                key = definition["key"]
                agent_id = config.get(key + "_AGENT_ID")
                if agent_id:
                    agent = project.agents.get_version(
                        agent_name=config[key + "_AGENT_NAME"],
                        agent_version=config[key + "_AGENT_VERSION"],
                    )
                    if agent.id != agent_id:
                        raise AzureError("StoredAgentIdMismatch")
                elif create:
                    agent = project.agents.create_version(
                        agent_name=definition["name"],
                        description=definition["display_name"] + " — synthetic demo; qualified human review required.",
                        metadata={"display_name": definition["display_name"],
                                  "workload": "manufacturing-operations", "phase": "1"},
                        definition=PromptAgentDefinition(
                            model=config["FOUNDRY_MODEL_DEPLOYMENT"],
                            instructions=definition["instructions"], temperature=0.2,
                            text={"format": {"type": "json_schema", "name": key.lower() + "_response",
                                             "strict": True, "schema": definition["schema"]}},
                        ),
                    )
                    config[key + "_AGENT_NAME"] = agent.name
                    config[key + "_AGENT_DISPLAY_NAME"] = definition["display_name"]
                    config[key + "_AGENT_ID"] = agent.id
                    config[key + "_AGENT_VERSION"] = agent.version
                    save(CONFIG, config)
                else:
                    raise AzureError("AgentMissing_UseCreateAndSmokeAfterInfrastructure")
                if not agent.id or not agent.version:
                    raise AzureError("ServiceReturnedNoAgentIdOrVersion")
                record = {"id": agent.id, "name": agent.name, "version": agent.version,
                          "displayName": definition["display_name"],
                          "status": "created_not_invoked", "kind": "prompt",
                          "projectEndpoint": endpoint}
                evidence["agents"] = [a for a in evidence["agents"] if a["name"] != agent.name] + [record]
                save(EVIDENCE, evidence)
                payload = {"incident": incident}
                if key == "MAINTENANCE":
                    payload["investigation"] = investigation
                with project.get_openai_client(max_retries=0, timeout=90) as client:
                    response = client.responses.create(
                        input=json.dumps(payload), max_output_tokens=700,
                        extra_body={"agent_reference": {"type": "agent_reference",
                                                        "name": agent.name, "version": agent.version}},
                    )
                if response.status != "completed" or not response.output_text:
                    raise AzureError("AgentResponseIncompleteOrEmpty")
                output = json.loads(response.output_text)
                validate_output(definition["schema"], output)
                if key == "DOWNTIME":
                    investigation = output
                record.update({
                    "status": "live_invocation_verified", "verifiedAt": now(),
                    "responseId": response.id, "responseModel": response.model,
                    "responseStatus": response.status, "responseCreatedAt": response.created_at,
                    "usage": response.usage.model_dump() if response.usage else None,
                    "parsedStructuredResponse": output,
                })
                save(EVIDENCE, evidence)
                print(json.dumps({"name": agent.name, "id": agent.id, "version": agent.version,
                                  "responseId": response.id, "status": record["status"]}))
    evidence["agentSmoke"]["status"] = "both_live_invocations_verified"
    evidence["liveInvocationStatus"] = "both_live_invocations_verified"
    evidence["status"] = "infrastructure_and_both_agents_verified_cli_identity"
    evidence["managedIdentityConnectivity"] = "not_verified_until_Phase_2_app_execution"
    config["status"] = "infrastructure_and_both_agents_verified_cli_identity"
    save(CONFIG, config)
    save(EVIDENCE, evidence)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("create-and-smoke", "smoke"))
    args = parser.parse_args()
    try:
        run(args.action == "create-and-smoke")
    except Exception as exc:
        # Do not print SDK messages: authentication errors can contain PII.
        code = str(exc) if isinstance(exc, AzureError) else type(exc).__name__
        if EVIDENCE.exists():
            evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
            evidence["agentSmoke"] = {"status": "blocked_no_automatic_retry", "code": code,
                                      "checkedAt": now()}
            evidence["liveInvocationStatus"] = "not_fully_verified"
            evidence["status"] = "agent_verification_blocked"
            save(EVIDENCE, evidence)
        print(json.dumps({"status": "blocked", "code": code}))
        raise SystemExit(2)
