"""Guarded Phase 2 cloud build/deployment and non-inference readiness evidence."""
import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.request
import zlib
from pathlib import Path

from phase1_azure import ROOT, GROUP, SUBSCRIPTION, TENANT, az, cli_command, current_account, now, save

REGISTRY = "acrmanuf01lk45yoce5uq3i"
APP = "ca-manufacturing-01"
CONFIG = ROOT / "infra" / "phase2-config.json"
EVIDENCE = ROOT / "infra" / "phase2-deployment-evidence.json"
PHASE1 = json.loads((ROOT / "infra" / "phase1-config.json").read_text(encoding="utf-8"))


def guard():
    current_account()
    group = az("group", "show", "-n", GROUP)
    if group["location"] != "swedencentral":
        raise RuntimeError("UnexpectedResourceGroupRegion")
    cache = ROOT / ".build-cache"
    cache.mkdir(exist_ok=True)
    # Azure CLI cloud-build archives must stay inside this worktree.
    os.environ["TEMP"] = os.environ["TMP"] = str(cache)
    return group


def load(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def record(key, value):
    evidence = load(EVIDENCE)
    evidence.update(phase=2, observedAt=now(), inferenceCallsMadeByDeployment=0)
    evidence[key] = value
    save(EVIDENCE, evidence)


def registry():
    value = az("acr", "show", "-g", GROUP, "-n", REGISTRY)
    if value["sku"]["name"] != "Basic" or value["adminUserEnabled"]:
        raise RuntimeError("RegistryPolicyMismatch")
    record("registry", {"id": value["id"], "location": value["location"], "sku": value["sku"],
                        "adminUserEnabled": value["adminUserEnabled"], "loginServer": value["loginServer"],
                        "operation": "Read-only validation of existing registry; no resource or RBAC writes.",
                        "necessity": "Reuse existing private Azure cloud build/image storage; no local Docker engine.",
                        "costCaveat": "Basic ACR has a recurring registry charge; quick builds/storage are also billable."})


def build():
    evidence = load(EVIDENCE)
    if not evidence.get("sqliteAmendment"):
        historical = {k: evidence.pop(k) for k in (
            "buildContext", "build", "deployment", "storageNetworkReconciliation",
            "blockers", "readiness", "runtimeFailure") if k in evidence}
        historical.update(classification="historical_blob_startup_blocker_superseded_by_user_approved_sqlite",
                          archivedAt=now())
        evidence.setdefault("historicalAttempts", []).append(historical)
        evidence["sqliteAmendment"] = {
            "observedAt": now(), "path": "/app/data/manufacturing.db",
            "lifecycle": "Refresh-safe; container restart/replacement may reset state, jobs, budget and cooldown.",
            "azureStorage": "Existing resources/RBAC/network left untouched and unused by application.",
        }
        save(EVIDENCE, evidence)
    tag = "phase2-" + re.sub(r"[^0-9]", "", now())[:14]
    context = ROOT / ".build-cache" / "phase2-context"
    if context.exists():
        shutil.rmtree(context)
    context.mkdir()
    paths = [ROOT / name for name in ("Dockerfile", ".dockerignore", "backend/requirements.txt",
             "frontend/package.json", "frontend/package-lock.json", "frontend/index.html",
             "frontend/tsconfig.json", "frontend/vite.config.ts", "infra/agents.json", "infra/phase1-config.json")]
    paths += list((ROOT / "backend").glob("*.py"))
    paths += [p for p in (ROOT / "frontend" / "src").rglob("*")
              if p.is_file() and p.suffix in (".ts", ".tsx", ".css")]
    manifest = []
    for source in paths:
        relative = source.relative_to(ROOT)
        target = context / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        manifest.append({"path": str(relative), "bytes": source.stat().st_size,
                         "sha256": hashlib.sha256(source.read_bytes()).hexdigest()})
    record("buildContext", {"files": manifest, "totalBytes": sum(p["bytes"] for p in manifest),
                           "policy": "Explicit staged allowlist; no local dependencies, Git/Squad/session state or secrets."})
    previous = {r["runId"] for r in az("acr", "task", "list-runs", "-g", GROUP, "-r", REGISTRY, "--top", "5")}
    try:
        run = az("acr", "build", "-g", GROUP, "-r", REGISTRY, "-t", "manufacturing-command-center:" + tag,
                 "--platform", "linux/amd64", "--timeout", "900", "--no-wait", "--no-logs", str(context))
    finally:
        shutil.rmtree(context)
    if run.get("runId"):
        run_id = run["runId"]
    else:
        runs = az("acr", "task", "list-runs", "-g", GROUP, "-r", REGISTRY, "--top", "5")
        new = [r for r in runs if r["runId"] not in previous]
        if len(new) != 1:
            raise RuntimeError("CannotUnambiguouslyIdentifyQueuedBuild")
        run_id = new[0]["runId"]
    record("build", {"id": run_id, "queuedAt": now(), "status": run.get("status"), "tag": tag})
    for _ in range(65):
        run = az("acr", "task", "show-run", "-g", GROUP, "-r", REGISTRY, "--run-id", run_id)
        if run["status"] in ("Succeeded", "Failed", "Canceled", "Error", "Timeout"):
            break
        time.sleep(15)
    record("build", {"id": run_id, "status": run["status"], "tag": tag, "platform": run.get("platform"),
                     "startTime": run.get("startTime"), "finishTime": run.get("finishTime"),
                     "outputImages": run.get("outputImages"), "observedAt": now()})
    if run["status"] != "Succeeded":
        raise RuntimeError("CloudBuild_" + run["status"] + "_Run_" + run_id)
    image = next(i for i in run["outputImages"] if i["repository"] == "manufacturing-command-center")
    if image.get("tag") != tag:
        raise RuntimeError("BuildImageTagMismatch")
    config = load(CONFIG)
    config.update(subscriptionId=SUBSCRIPTION, tenantId=TENANT, resourceGroup=GROUP, location="swedencentral",
                  registryName=REGISTRY, imageTag=tag, imageDigest=image["digest"], buildId=run_id,
                  image=f'{image["registry"]}/{image["repository"]}@{image["digest"]}', observedAt=now())
    save(CONFIG, config)


def deploy():
    config = load(CONFIG)
    keys = ("AZURE_CLIENT_ID", "AZURE_TENANT_ID",
            "FOUNDRY_PROJECT_ENDPOINT", "FOUNDRY_MODEL_DEPLOYMENT", "DOWNTIME_AGENT_NAME", "DOWNTIME_AGENT_ID",
            "DOWNTIME_AGENT_VERSION", "MAINTENANCE_AGENT_NAME", "MAINTENANCE_AGENT_ID", "MAINTENANCE_AGENT_VERSION")
    env = [{"name": key, "value": str(PHASE1[key])} for key in keys]
    env.append({"name": "AZURE_CREDENTIAL_MODE", "value": "managed_identity"})
    params = ROOT / ".build-cache" / "phase2-parameters.json"
    save(params, {"$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
                  "contentVersion": "1.0.0.0", "parameters": {
                      "image": {"value": config["image"]}, "runtimeEnvironment": {"value": env}}})
    try:
        deployment = az("deployment", "group", "create", "-g", GROUP, "-n", "manufacturing-phase2-app-01",
                        "--mode", "Incremental", "--template-file", str(ROOT / "infra" / "phase2-app.bicep"),
                        "--parameters", "@" + str(params))
    finally:
        params.unlink(missing_ok=True)
    record("deployment", {"status": deployment["properties"]["provisioningState"], "id": deployment["id"],
                          "outputs": deployment["properties"]["outputs"], "observedAt": now()})
    env.append({"name": "SQLITE_PATH", "value": "/app/data/manufacturing.db"})
    for stale in ("status", "requiredNextStep", "blobReadiness"):
        config.pop(stale, None)
    config.update(containerAppName=APP, runtimeEnvironment=env, workerCount=1, minReplicas=1, maxReplicas=1,
                  storage="sqlite", readinessStatus="pending_verification",
                  aiReadiness="not_verified_no_inference",
                  cpu=0.25, memory="0.5Gi", managedIdentityResourceId=PHASE1["MANAGED_IDENTITY_RESOURCE_ID"],
                  containerAppsEnvironmentId=PHASE1["CONTAINER_APPS_ENVIRONMENT_ID"],
                  quota={"globalSequential": True, "spacingSeconds": 65, "dailyAttemptLimit": 12,
                         "maxOutputTokens": 450, "minOutputTokens": 300, "admissionTokenCeiling": 970,
                         "automaticInferenceRetries": 0, "source": "backend/ai.py constants; not configurable env"})
    save(CONFIG, config)


def get(url):
    try:
        with urllib.request.urlopen(url, timeout=45) as response:
            body = response.read()
            return response.status, response.headers.get("Content-Type", ""), body
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("Content-Type", ""), exc.read()
    except OSError as exc:
        return 0, "", type(exc).__name__.encode()


def identity():
    """Read pinned definitions inside the deployed container, never using CLI credentials for Foundry."""
    config = load(CONFIG)
    app = az("containerapp", "show", "-g", GROUP, "-n", APP)
    revision = app["properties"]["latestRevisionName"]
    if app["properties"]["template"]["containers"][0]["image"] != config["image"]:
        raise RuntimeError("RuntimeIdentityImageMismatch")
    script = """
import datetime,json,os,sys,logging
logging.disable(logging.CRITICAL)
from backend.config import configuration,credential_for
from azure.ai.projects import AIProjectClient
c=configuration()
result={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'credentialMode':c['credential_mode'],'clientId':c['AZURE_CLIENT_ID'],
        'uid':os.getuid(),'sqlitePath':c['SQLITE_PATH'],
        'command':open('/proc/1/cmdline','rb').read().decode().split(chr(0)),
        'inferenceCalls':0,'agents':[]}
try:
    if c['credential_mode']!='managed_identity':
        raise RuntimeError('ManagedIdentityRequired')
    with credential_for(c) as credential:
        result['credentialType']=type(credential).__name__
        with AIProjectClient(endpoint=c['FOUNDRY_PROJECT_ENDPOINT'],credential=credential,
                             retry_total=0,connection_timeout=10,read_timeout=30) as client:
            for key in ('DOWNTIME','MAINTENANCE'):
                agent=client.agents.get_version(agent_name=c[key+'_AGENT_NAME'],
                                               agent_version=c[key+'_AGENT_VERSION'])
                if agent.id!=c[key+'_AGENT_ID'] or agent.definition.model!=c['FOUNDRY_MODEL_DEPLOYMENT']:
                    raise RuntimeError('PinnedAgentMismatch')
                result['agents'].append({'id':agent.id,'name':agent.name,'version':agent.version,
                                         'model':agent.definition.model})
    result['status']='verified_managed_identity_definition_reads_no_inference'
except Exception as exc:
    result.update(status='failed',errorType=type(exc).__name__,httpStatus=getattr(exc,'status_code',None))
print('PHASE2_IDENTITY_RESULT='+json.dumps(result),flush=True)
"""
    encoded = base64.b64encode(zlib.compress(script.encode())).decode()
    command = f"python -c exec(__import__('zlib').decompress(__import__('base64').b64decode('{encoded}')))"
    args = ["containerapp", "exec", "-g", GROUP, "-n", APP, "--revision", revision,
            "--container", "command-center", "--command", command]
    result = subprocess.run(cli_command(shutil.which("az"), args), cwd=ROOT, stdin=subprocess.DEVNULL,
                            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=150)
    match = re.search(r"PHASE2_IDENTITY_RESULT=(\{[^\r\n]*\})", result.stdout)
    if not match:
        record("runtimeIdentity", {"status": "not_verified", "reason": "ExecResultNotReceived",
                                  "cliExitCode": result.returncode, "observedAt": now(),
                                  "inferenceCalls": 0})
        raise RuntimeError("RuntimeIdentityExecResultNotReceived")
    value = json.loads(match[1])
    value.update(revision=revision, image=config["image"])
    record("runtimeIdentity", value)
    config["aiReadiness"] = value["status"]
    config["observedAt"] = now()
    save(CONFIG, config)
    print(json.dumps(value))
    if value["status"] == "failed":
        raise RuntimeError("RuntimeIdentityDefinitionReadFailed")


def verify():
    config = load(CONFIG)
    app = az("containerapp", "show", "-g", GROUP, "-n", APP)
    properties = app["properties"]
    ingress = properties["configuration"]["ingress"]
    base = "https://" + ingress["fqdn"]
    checks, state, assets = [], None, []
    for path, expected in (("/", 200), ("/incidents/INC-1042", 200), ("/health", 200),
                           ("/api/health", 200), ("/api/state", 200),
                           ("/api/not-present", 404), ("/assets/not-present.js", 404)):
        status, content_type, body = get(base + path)
        check = {"path": path, "status": status, "expected": expected, "contentType": content_type,
                 "observedAt": now(), "bodySha256": hashlib.sha256(body).hexdigest()}
        if path.endswith("health") and status == 200:
            check["response"] = json.loads(body)
        if path == "/" and status == 200:
            assets = sorted(set(re.findall(r'(?:src|href)="(/assets/[^"]+\.(?:js|css))"', body.decode())))
        if path == "/api/state" and status == 200:
            state = json.loads(body)
            check["counts"] = {k: len(state[k]) for k in ("sites", "lines", "machines", "incidents", "telemetry")}
            check["ai"] = state["ai"]
            check["jobCount"] = len(state["jobs"])
        checks.append(check)
        if status == 0:
            break
    for path in assets:
        status, content_type, body = get(base + path)
        checks.append({"path": path, "status": status, "expected": 200, "contentType": content_type,
                       "bytes": len(body), "bodySha256": hashlib.sha256(body).hexdigest(), "observedAt": now()})
    revisions = az("containerapp", "revision", "list", "-g", GROUP, "-n", APP)
    replicas = az("containerapp", "replica", "list", "-g", GROUP, "-n", APP,
                  "--revision", properties["latestRevisionName"])
    auth = az("containerapp", "auth", "show", "-g", GROUP, "-n", APP)
    registry_id = load(EVIDENCE)["registry"]["id"]
    roles = az("role", "assignment", "list", "--assignee", "fd723da5-633e-46b9-8509-af3fdd86dbf6",
               "--all", "--query", "[].{role:roleDefinitionName,scope:scope,id:id,principalId:principalId}")
    scoped = [r for r in roles if r["scope"].lower().startswith(PHASE1["FOUNDRY_ACCOUNT_ID"].lower())
              or "/containers/demo-state" in r["scope"].lower() or r["scope"].lower() == registry_id.lower()]
    container = properties["template"]["containers"][0]
    runtime_env = {v["name"]: v.get("value") for v in container["env"]}
    expected_env = {v["name"]: v["value"] for v in config["runtimeEnvironment"]}
    health_checks = [c for c in checks if c["path"] in ("/health", "/api/health")]
    counts = {k: len(state.get(k, [])) for k in ("sites", "lines", "machines", "incidents", "telemetry")} if state else {}
    topology = {
        "singleRevision": properties["configuration"]["activeRevisionsMode"] == "Single",
        "oneReplica": len(replicas) == 1 and all(r["properties"].get("runningState") == "Running"
                                              and all(c.get("ready") and c.get("started")
                                                      for c in r["properties"].get("containers", []))
                                              for r in replicas),
        "scale": properties["template"]["scale"]["minReplicas"] == 1
                 and properties["template"]["scale"]["maxReplicas"] == 1,
        "imageDigestMatches": container["image"] == config["image"],
        "runtimeEnvironmentMatches": runtime_env == expected_env,
        "noBlobEnvironment": not any(k.startswith("AZURE_STORAGE") for k in runtime_env),
        "port8000": ingress["targetPort"] == 8000,
        "anonymous": not auth.get("properties", {}).get("platform", {}).get("enabled", False),
    }
    success = (len(checks) == 7 + len(assets) and any(a.endswith(".js") for a in assets)
               and any(a.endswith(".css") for a in assets)
               and all(c["status"] == c["expected"] for c in checks)
               and all(c.get("response", {}).get("storage") == "sqlite" for c in health_checks)
               and len(health_checks) == 2 and all(topology.values())
               and counts == dict(sites=3, lines=6, machines=18, incidents=24, telemetry=72) and
               properties["provisioningState"] == "Succeeded" and ingress["external"] and
               not ingress["allowInsecure"] and properties["configuration"]["activeRevisionsMode"] == "Single" and
               PHASE1["MANAGED_IDENTITY_RESOURCE_ID"].lower() in
               {identity.lower() for identity in app["identity"]["userAssignedIdentities"]} and
               len([r for r in revisions if r["properties"]["active"]]) == 1 and
               all(r["properties"]["healthState"] == "Healthy" and r["properties"]["runningState"] in
                   ("Running", "RunningAtMaxScale")
                   for r in revisions if r["properties"]["active"]))
    record("readiness", {"status": "verified_no_inference" if success else "failed", "url": base,
                         "checks": checks, "app": app, "revisions": revisions, "replicas": replicas,
                         "authentication": auth, "managedIdentityRoles": scoped, "observedAt": now(),
                         "topologyChecks": topology,
                         "storageProof": ("Local SQLite startup seed and health/state reads verified; no Blob runtime dependency."
                                          if success else "SQLite/public app readiness NOT VERIFIED."),
                         "aiBoundary": "Storage health does not prove Foundry access. Integration must verify actual deployed inference."})
    config.update(url=base, fqdn=ingress["fqdn"], containerAppId=app["id"],
                  revision=properties["latestRevisionName"], deploymentStatus=properties["provisioningState"],
                  readinessStatus="verified_no_inference" if success else "failed",
                  status="ready_for_integration" if success else "readiness_failed", observedAt=now())
    save(CONFIG, config)
    print(json.dumps({"url": base, "readiness": config["readinessStatus"], "revision": config["revision"]}))
    if not success:
        raise RuntimeError("ReadinessNotVerified")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("registry", "build", "deploy", "verify", "identity"))
    args = parser.parse_args()
    guard()
    globals()[args.action]()
