"""Read back Phase 1 resources, scoped assignments and agent versions; no inference."""

import json
import logging
from importlib.metadata import version

from phase1_azure import (
    CONFIG, EVIDENCE, GROUP, REGION, ROOT, AzureError, arm, az, current_account,
    now, project_portal_url, save,
)


def verify():
    account = current_account()
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    deployment = az("deployment", "group", "show", "-g", GROUP, "-n", "manufacturing-phase1-01")
    if deployment["properties"]["provisioningState"] != "Succeeded":
        raise AzureError("DeploymentNotSucceeded")
    group = az("group", "show", "-n", GROUP)
    if group["location"] != REGION:
        raise AzureError("UnexpectedResourceGroupLocation")
    identity = arm(config["MANAGED_IDENTITY_RESOURCE_ID"] + "?api-version=2023-01-31")
    environment = arm(config["CONTAINER_APPS_ENVIRONMENT_ID"] + "?api-version=2025-01-01")
    foundry = arm(config["FOUNDRY_ACCOUNT_ID"] + "?api-version=2025-06-01")
    project = arm(config["FOUNDRY_PROJECT_ID"] + "?api-version=2025-06-01")
    model = arm(config["FOUNDRY_ACCOUNT_ID"] + "/deployments/"
                + config["FOUNDRY_MODEL_DEPLOYMENT"] + "?api-version=2025-06-01")
    storage_id = next(a["scope"].split("/blobServices/")[0]
                      for a in evidence["deployment"]["roleAssignments"]
                      if "/blobServices/" in a["scope"])
    storage = arm(storage_id + "?api-version=2023-05-01")
    container_id = storage_id + "/blobServices/default/containers/demo-state"
    container = arm(container_id + "?api-version=2023-05-01")
    resources = [identity, environment, storage, foundry, project, model, container]
    for resource in resources:
        if resource.get("properties", {}).get("provisioningState", "Succeeded") != "Succeeded":
            raise AzureError("ResourceNotSucceeded")
        if (resource.get("location") or REGION).replace(" ", "").lower() != REGION:
            raise AzureError("UnexpectedResourceRegion")
    if (foundry["properties"].get("disableLocalAuth") is not True
            or storage["properties"].get("allowSharedKeyAccess") is not False
            or container["properties"].get("publicAccess") != "None"):
        raise AzureError("ExpectedKeylessPrivateBlobConfigurationMissing")
    if (model["sku"] != {"name": "Standard", "capacity": 1}
            or model["properties"]["model"]["name"] != config["FOUNDRY_MODEL_NAME"]
            or model["properties"]["model"]["version"] != config["FOUNDRY_MODEL_VERSION"]):
        raise AzureError("ModelConfigurationDrift")
    endpoint = project["properties"]["endpoints"]["AI Foundry API"]
    if endpoint.rstrip("/") != config["FOUNDRY_PROJECT_ENDPOINT"].rstrip("/"):
        raise AzureError("ActualProjectEndpointMismatch")
    roles = []
    for expected in evidence["deployment"]["roleAssignments"]:
        actual = arm(expected["id"] + "?api-version=2022-04-01")["properties"]
        if any(actual.get(k, "").lower() != expected[k].lower()
               for k in ("principalId", "roleDefinitionId", "scope")):
            raise AzureError("RoleAssignmentDrift")
        if actual["principalId"] not in (identity["properties"]["principalId"],
                                         project["identity"]["principalId"]):
            raise AzureError("UnexpectedRolePrincipal")
        roles.append({"id": expected["id"], **{
            k: actual[k] for k in ("principalId", "principalType", "roleDefinitionId", "scope")
        }, "verifiedAt": now()})
    from azure.ai.projects import AIProjectClient
    from azure.identity import AzureCliCredential

    logging.getLogger("azure").setLevel(logging.CRITICAL)
    definitions = json.loads((ROOT / "infra" / "agents.json").read_text(encoding="utf-8"))
    persisted_agents = []
    with AzureCliCredential(tenant_id=config["AZURE_TENANT_ID"]) as credential:
        with AIProjectClient(endpoint=endpoint, credential=credential, retry_total=0) as client:
            for definition in definitions:
                key = definition["key"]
                agent = client.agents.get_version(
                    agent_name=config[key + "_AGENT_NAME"],
                    agent_version=config[key + "_AGENT_VERSION"])
                if (agent.id != config[key + "_AGENT_ID"]
                        or agent.definition.model != config["FOUNDRY_MODEL_DEPLOYMENT"]
                        or agent.metadata.get("display_name") != definition["display_name"]):
                    raise AzureError("PersistedAgentDefinitionMismatch")
                persisted_agents.append({
                    "id": agent.id, "name": agent.name, "version": agent.version,
                    "description": agent.description, "metadata": dict(agent.metadata),
                    "modelDeployment": agent.definition.model, "verifiedAt": now(),
                })
    portal = project_portal_url(project["id"])
    evidence["deployment"]["portalUrl"] = portal
    evidence["finalVerification"] = {
        "checkedAt": now(), "account": account,
        "resourceGroup": {k: group[k] for k in ("id", "name", "location")},
        "deploymentId": deployment["id"], "deploymentStatus": "Succeeded",
        "resources": [{**{k: r.get(k) for k in ("id", "name", "type", "sku")},
                       "location": (r.get("location") or REGION).replace(" ", "").lower(),
                       "locationInheritedFromParent": not bool(r.get("location"))}
                      for r in resources],
        "model": {"id": model["id"], "sku": model["sku"],
                  **{k: model["properties"][k] for k in ("model", "capabilities", "rateLimits", "versionUpgradeOption")}},
        "scopedRoleAssignments": roles, "persistedAgents": persisted_agents,
        "hosting": {"workloadProfiles": environment["properties"]["workloadProfiles"],
                    "appLogsConfiguration": environment["properties"].get("appLogsConfiguration"),
                    "applicationDeployed": False, "publicAppUrl": None},
        "storage": {"containerId": container_id, "publicAccess": container["properties"]["publicAccess"],
                    "allowSharedKeyAccess": storage["properties"]["allowSharedKeyAccess"]},
        "foundry": {"disableLocalAuth": foundry["properties"]["disableLocalAuth"],
                    "projectEndpoint": endpoint, "portalUrl": portal,
                    "portalLinkBasis": "Public Foundry portal encoded-resource route; no authenticated browser session verified.",
                    "portalRouteReference": "https://ai.azure.com/assets/foundry-chunk-prod-app-core-BhhZo3Fm.js"},
        "sdkVersions": {p: version(p) for p in ("azure-ai-projects", "azure-identity", "openai", "jsonschema")},
    }
    evidence["managedIdentityAuthorization"] = {
        "status": "scoped_assignments_read_back_and_principals_verified",
        "clientId": identity["properties"]["clientId"],
        "principalId": identity["properties"]["principalId"],
        "runtimeConnectivity": "not_verified; identity not attached to any application in Phase 1",
        "noImpersonationOrAppDeploymentAttempted": True,
    }
    evidence["preflight"]["agentRegionSupport"]["subscriptionRuntimeAccess"] = "verified_by_two_prompt_agent_versions_and_completed_responses"
    evidence["preflight"]["regionalFallback"]["reason"] = "Sweden Central supported service, quota, capacity and both live agents; fallback unnecessary."
    config.update({
        "FOUNDRY_PORTAL_URL": portal, "AZURE_HOSTING_LOCATION": environment["location"],
        "AZURE_STORAGE_LOCATION": storage["location"], "FOUNDRY_LOCATION": project["location"],
    })
    save(CONFIG, config)
    save(EVIDENCE, evidence)
    save(ROOT / "infra" / "phase1-invocations.json", {
        "phase": 1, "syntheticOnly": True, "credential": "existing Azure CLI identity",
        "maxOutputTokensPerAgent": 700, "maxRetries": 0,
        "agents": evidence["agents"],
    })
    print(json.dumps({"status": "readback_verified", "resources": len(resources),
                      "scopedAssignments": len(roles), "agentVersions": len(persisted_agents),
                      "portalUrl": portal, "managedIdentityRuntimeConnectivity": "not_verified"}))


if __name__ == "__main__":
    try:
        verify()
    except Exception as exc:
        code = str(exc) if isinstance(exc, AzureError) else type(exc).__name__
        print(json.dumps({"status": "verification_failed", "code": code}))
        raise SystemExit(2)
