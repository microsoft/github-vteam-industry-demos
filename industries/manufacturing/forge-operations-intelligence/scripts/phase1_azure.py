"""Read-only preflight and guarded incremental deployment. Never changes subscription."""

import argparse
import base64
import datetime as dt
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "infra" / "phase1-evidence.json"
CONFIG = ROOT / "infra" / "phase1-config.json"
SUBSCRIPTION = "e2d6ac89-1bb7-420c-97fb-a96dea6c0635"
TENANT = "fe482aee-20fd-4a0f-8ecd-1db718a7eb6f"
GROUP = "rg-manufacturing-01"
REGION = "swedencentral"
ARM = "https://management.azure.com"
REQUIRED = {
    "Microsoft.App": ["managedEnvironments"],
    "Microsoft.ManagedIdentity": ["userAssignedIdentities"],
    "Microsoft.Storage": ["storageAccounts"],
    "Microsoft.CognitiveServices": ["accounts", "accounts/projects"],
}


class AzureError(RuntimeError):
    pass


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def cli_command(executable, args):
    command = [executable, *args, "--only-show-errors", "-o", "json"]
    if os.name == "nt" and executable.lower().endswith((".cmd", ".bat")):
        # cmd.exe otherwise treats unquoted URL query separators as commands.
        return " ".join('"' + str(arg).replace('"', r'\"') + '"' for arg in command)
    return command


def az(*args):
    executable = shutil.which("az")
    if not executable:
        raise AzureError("AzureCliMissing")
    result = subprocess.run(
        cli_command(executable, args),
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        cwd=ROOT, timeout=900,
    )
    if result.returncode:
        # CLI errors can contain caller email/token details. Never emit raw stderr.
        codes = re.findall(r'"code"\s*:\s*"([A-Za-z][A-Za-z0-9_.-]+)"', result.stderr)
        codes += re.findall(r"\(([A-Za-z][A-Za-z0-9_.-]+)\)", result.stderr)
        raise AzureError(codes[0] if codes else "AzureCliError")
    return json.loads(result.stdout) if result.stdout.strip() else {}


def current_account():
    value = az("account", "show")
    account = {k: value[k] for k in ("id", "name", "tenantId", "state")}
    if account["id"] != SUBSCRIPTION or account["tenantId"] != TENANT:
        raise AzureError("CurrentSubscriptionOrTenantChanged_Stop")
    if account["state"] != "Enabled":
        raise AzureError("CurrentSubscriptionNotEnabled")
    return account


def arm(path):
    return az("rest", "--method", "get", "--url", ARM + path)


def collection(path):
    result = []
    while path:
        value = arm(path)
        result.extend(value.get("value", []))
        link = value.get("nextLink")
        if link and not link.startswith(ARM + "/"):
            raise AzureError("UnexpectedPaginationHost")
        path = link[len(ARM):] if link else None
    return result


def project_portal_url(project_id):
    parts = project_id.strip("/").split("/")
    expected = ["subscriptions", "resourceGroups", "providers", "accounts", "projects"]
    if len(parts) != 10 or [parts[i] for i in (0, 2, 4, 6, 8)] != expected:
        raise AzureError("UnexpectedProjectResourceId")
    if parts[1] != SUBSCRIPTION or parts[3] != GROUP or parts[5] != "Microsoft.CognitiveServices":
        raise AzureError("UnexpectedProjectScope")
    # Current Foundry portal encodes GUID bytes, then comma-delimits ARM segments.
    compressed = base64.urlsafe_b64encode(bytes.fromhex(parts[1].replace("-", ""))).decode().rstrip("=")
    encoded = ",".join([compressed, quote(parts[3], safe=""), "",
                        quote(parts[7], safe=""), quote(parts[9], safe="")])
    return "https://ai.azure.com/nextgen/r/" + encoded


def verify_owned_targets(targets, operations):
    owned_ids = {
        o["properties"]["targetResource"]["id"].lower() for o in operations
        if o["properties"].get("provisioningState") == "Succeeded"
        and o["properties"].get("targetResource")
    }
    if any(r["id"].lower() not in owned_ids for r in targets):
        raise AzureError("ExistingTargetNames_NotOwnedByRecordedDeployment")


def choose_model(models, quota):
    by_usage = {x["name"]: x for x in quota}
    for preferred in ("gpt-4.1-mini", "gpt-4o-mini"):
        for model in models:
            if model["name"] != preferred:
                continue
            for sku in model["skus"]:
                usage = by_usage.get(sku.get("usageName"))
                minimum = sku.get("minimum") or 1
                if (sku["name"] == "Standard" and minimum <= 1 and usage
                        and isinstance(usage.get("limit"), (int, float))
                        and isinstance(usage.get("currentValue"), (int, float))
                        and usage["limit"] - usage["currentValue"] >= 1):
                    return {"name": model["name"], "version": model["version"],
                            "sku": "Standard", "capacity": 1, "region": REGION}
    return None


def preflight(register_missing=False):
    evidence = json.loads(EVIDENCE.read_text(encoding="utf-8")) if EVIDENCE.exists() else {
        "phase": 1, "deployment": {"status": "not_attempted", "resourcesCreated": []},
        "agents": [], "liveInvocationStatus": "not_attempted",
    }
    if (evidence.get("preflight", {}).get("account") or {}).get("id") not in (None, SUBSCRIPTION):
        evidence = {
            "phase": 1, "history": [evidence],
            "deployment": {"status": "not_attempted", "resourcesCreated": []},
            "agents": [], "liveInvocationStatus": "not_attempted",
        }
    check = {"checkedAt": now(), "status": "blocked", "blockers": [], "region": REGION}
    evidence["preflight"] = check

    def probe(label, function):
        try:
            return function()
        except (AzureError, subprocess.TimeoutExpired) as exc:
            check["blockers"].append({"check": label, "code": str(exc) if isinstance(exc, AzureError) else "Timeout"})
            return None

    account = probe("currentAccount", current_account)
    check["account"] = account
    if account is None:
        evidence["status"] = "preflight_blocked"
        save(EVIDENCE, evidence)
        return evidence
    group_id = f"/subscriptions/{SUBSCRIPTION}/resourceGroups/{GROUP}"
    check["resourceGroup"] = probe("resourceGroupRead", lambda: {
        k: v for k, v in az("group", "show", "--name", GROUP).items()
        if k in ("id", "name", "location")
    })
    inventory = probe("resourceInventory", lambda: az("resource", "list", "--resource-group", GROUP))
    check["inventory"] = None if inventory is None else [
        {k: r.get(k) for k in ("id", "name", "type", "location", "sku")}
        for r in inventory
    ]
    if check["resourceGroup"] is not None and check["inventory"] is not None:
        evidence.setdefault("initialInventory", {
            "checkedAt": check["checkedAt"], "account": account,
            "resourceGroup": check["resourceGroup"], "resources": check["inventory"],
        })
    if check["resourceGroup"] and check["resourceGroup"]["location"] != REGION:
        check["blockers"].append({"check": "resourceGroupLocation", "code": "UnexpectedActualLocation_ReviewBeforeDeployment"})
    providers = probe("serviceAvailability", lambda: collection(f"/subscriptions/{SUBSCRIPTION}/providers?api-version=2021-04-01"))
    if register_missing and providers is not None:
        for namespace in REQUIRED:
            provider = next((p for p in providers if p["namespace"] == namespace), {})
            if provider.get("registrationState") != "Registered":
                current_account()
                probe("register:" + namespace, lambda ns=namespace: az(
                    "provider", "register", "--namespace", ns, "--wait"))
        providers = probe("providerRegistrationVerification", lambda: collection(
            f"/subscriptions/{SUBSCRIPTION}/providers?api-version=2021-04-01"))
    check["services"] = []
    for namespace, types in REQUIRED.items():
        provider = next((p for p in providers or [] if p["namespace"] == namespace), None)
        registered = provider and provider["registrationState"] == "Registered"
        if not registered:
            check["blockers"].append({"check": namespace, "code": "ProviderNotRegisteredOrUnknown"})
        for resource_type in types:
            metadata = next((t for t in (provider or {}).get("resourceTypes", [])
                             if t["resourceType"] == resource_type), {})
            supported = "Sweden Central" in metadata.get("locations", [])
            check["services"].append({
                "namespace": namespace, "resourceType": resource_type,
                "registrationState": (provider or {}).get("registrationState"),
                "swedenCentralAdvertised": supported,
            })
            if not supported:
                check["blockers"].append({"check": f"{namespace}/{resource_type}", "code": "RegionNotAdvertised"})
    base = f"/subscriptions/{SUBSCRIPTION}/providers/Microsoft.CognitiveServices/locations/{REGION}"
    catalog = probe("modelCatalog", lambda: collection(base + "/models?api-version=2025-06-01"))
    models = []
    for item in catalog or []:
        model = item.get("model", {})
        if model.get("name") not in ("gpt-4.1-mini", "gpt-4o-mini"):
            continue
        entry = {"name": model["name"], "version": model["version"],
                 "skus": [{"name": s["name"], "usageName": s.get("usageName"),
                           "minimum": s.get("capacity", {}).get("minimum")}
                          for s in model.get("skus", []) if s["name"] == "Standard"
                          and "finetune" not in s.get("usageName", "")]}
        if entry not in models:
            models.append(entry)
    check["candidateModels"] = models
    usage = probe("modelQuota", lambda: collection(base + "/usages?api-version=2025-06-01"))
    quota = [{"name": x.get("name", {}).get("value"),
              "currentValue": x.get("currentValue"), "limit": x.get("limit")}
             for x in usage or []]
    check["quota"] = {"returnedEntries": None if usage is None else len(usage),
                      "candidateEntries": [q for q in quota if q["name"] in {
                          s["usageName"] for m in models for s in m["skus"]}]}
    check["selectedModel"] = choose_model(models, check["quota"]["candidateEntries"])
    if check["selectedModel"] is None:
        check["blockers"].append({"check": "modelQuota", "code": "NoVerifiedAvailableRegionalStandardQuota"})
    else:
        model = check["selectedModel"]
        capacities = probe("modelCapacity", lambda: collection(
            f"/subscriptions/{SUBSCRIPTION}/providers/Microsoft.CognitiveServices/modelCapacities"
            f"?api-version=2024-10-01&modelFormat=OpenAI&modelName={model['name']}&modelVersion={model['version']}"))
        entries = [r for r in capacities or [] if r.get("location", "").lower() == REGION
                   and r.get("properties", {}).get("skuName") == "Standard"]
        check["modelCapacityAvailability"] = {"checkedAt": now(), "entries": entries}
        if not any(r.get("properties", {}).get("availableCapacity", 0) >= model["capacity"]
                   for r in entries):
            check["blockers"].append({"check": "modelCapacity", "code": "NoVerifiedAvailableRegionalStandardCapacity"})
    check["agentRegionSupport"] = {
        "swedenCentral": "Agents and Responses API listed as supported",
        "source": "https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/limits-quotas-regions",
        "subscriptionRuntimeAccess": "not_verified",
    }
    check["regionalFallback"] = {
        "attempted": False, "northEurope": "not_evaluated", "westEurope": "not_evaluated",
        "reason": "Authorization/registration/unknown quota is not proof of regional capacity failure.",
    }
    check["resourceGroupScope"] = group_id
    check["status"] = "ready" if not check["blockers"] else "blocked"
    evidence["status"] = "preflight_ready" if check["status"] == "ready" else "preflight_blocked"
    save(EVIDENCE, evidence)
    print(json.dumps({
        "subscription": account, "resourceGroup": check["resourceGroup"],
        "inventory": check["inventory"], "preflightStatus": check["status"],
        "providerStates": {s["namespace"]: s["registrationState"] for s in check["services"]},
        "quotaEntries": check["quota"]["returnedEntries"], "blockers": check["blockers"],
    }, indent=2))
    return evidence


def deploy():
    evidence = preflight(register_missing=True)
    check = evidence["preflight"]
    if check["status"] != "ready":
        raise AzureError("PreflightBlocked_NoDeploymentAttempted")
    targets = [r for r in check["inventory"] if r["name"].startswith(
        ("cae-manufacturing-01", "id-manufacturing-01", "stmanuf01", "ai-manufacturing-01"))]
    if targets:
        operations = az("deployment", "operation", "group", "list",
                        "--resource-group", GROUP, "--name", "manufacturing-phase1-01")
        verify_owned_targets(targets, operations)
        evidence.setdefault("reconciliations", []).append({
            "checkedAt": now(), "basis": "Successful operations in manufacturing-phase1-01",
            "resourceIds": [r["id"] for r in targets], "destructiveOperations": False,
            "operations": [{"resourceId": o["properties"].get("targetResource", {}).get("id"),
                            "state": o["properties"].get("provisioningState")}
                           for o in operations if o["properties"].get("targetResource")],
        })
    model = check["selectedModel"]
    current_account()
    if evidence.get("deployment", {}).get("startedAt"):
        evidence.setdefault("deploymentAttempts", []).append(evidence["deployment"])
    evidence["deployment"] = {"status": "attempting", "startedAt": now(), "resourcesCreated": []}
    evidence["status"] = "deployment_in_progress"
    save(EVIDENCE, evidence)
    try:
        result = az(
            "deployment", "group", "create", "--resource-group", GROUP,
            "--name", "manufacturing-phase1-01", "--mode", "Incremental",
            "--template-file", str(ROOT / "infra" / "main.bicep"),
            "--parameters", f"modelName={model['name']}", f"modelVersion={model['version']}",
        )
        outputs = result["properties"]["outputs"]
        config = json.loads((ROOT / "infra" / "phase1-config.example.json").read_text(encoding="utf-8"))
        if CONFIG.exists():
            stored = json.loads(CONFIG.read_text(encoding="utf-8"))
            if stored.get("FOUNDRY_PROJECT_ID") != outputs["settings"]["value"]["FOUNDRY_PROJECT_ID"]:
                raise AzureError("StoredProjectDoesNotMatchDeployment")
            config.update(stored)
        config.update(outputs["settings"]["value"])
        if not all(config.get(key + "_AGENT_ID") for key in ("DOWNTIME", "MAINTENANCE")):
            config["status"] = "infrastructure_deployed_agents_unverified"
        config["FOUNDRY_PORTAL_URL"] = project_portal_url(config["FOUNDRY_PROJECT_ID"])
        save(CONFIG, config)
        for assignment in outputs["roleAssignments"]["value"]:
            actual = arm(assignment["id"] + "?api-version=2022-04-01")["properties"]
            if any(actual.get(k, "").lower() != assignment[k].lower()
                   for k in ("principalId", "roleDefinitionId", "scope")):
                raise AzureError("RoleAssignmentVerificationFailed")
        resources = az("resource", "list", "--resource-group", GROUP)
        owned = [r for r in resources if r.get("tags", {}).get("workload") == "manufacturing-operations"]
        evidence["deployment"] = {
            "status": result["properties"]["provisioningState"],
            "verifiedAt": now(), "id": result["id"], "mode": "Incremental",
            "resourcesCreated": [{k: r.get(k) for k in ("id", "name", "type", "location", "sku")} for r in owned],
            "model": model, "settings": outputs["settings"]["value"],
            "roleAssignments": outputs["roleAssignments"]["value"],
            "portalUrl": config["FOUNDRY_PORTAL_URL"],
        }
        evidence["status"] = "infrastructure_deployed_agents_unverified"
    except (AzureError, subprocess.TimeoutExpired) as exc:
        evidence["deployment"]["status"] = "failed_no_automatic_retry"
        evidence["status"] = "deployment_failed"
        evidence["deployment"]["code"] = str(exc) if isinstance(exc, AzureError) else "Timeout"
        save(EVIDENCE, evidence)
        raise AzureError("DeploymentFailed_InspectOperationsBeforeAnyRetry") from None
    save(EVIDENCE, evidence)
    print("Infrastructure persisted. Agents and app identity connectivity still require live verification.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("preflight", "deploy"))
    args = parser.parse_args()
    try:
        if args.action == "deploy":
            deploy()
        else:
            result = preflight()
            raise SystemExit(0 if result["preflight"]["status"] == "ready" else 2)
    except (AzureError, subprocess.TimeoutExpired) as exc:
        print(json.dumps({"status": "blocked", "code": str(exc) if isinstance(exc, AzureError) else "Timeout"}))
        raise SystemExit(2)
