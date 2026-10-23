"""One Entra-authenticated infrastructure probe; no application seeding or deletes."""
import base64
import json
import subprocess
import uuid
from datetime import datetime, timezone
from email.utils import formatdate
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
config = json.loads((ROOT / "infra" / "phase1-handoff.json").read_text(encoding="utf-8-sig"))
SUBSCRIPTION = "e2d6ac89-1bb7-420c-97fb-a96dea6c0635"
if config["subscriptionId"] != SUBSCRIPTION:
    raise SystemExit("Refusing unexpected subscription.")
if (config["resourceGroupName"] != "rg-high-tech-software-isv-01"
        or config["cosmosEndpoint"] != "https://cosmos-high-tech-isv-f4ee1f29.documents.azure.com:443/"
        or config["cosmosDatabase"] != "customer-success"
        or config["cosmosContainer"] != "account-state"):
    raise SystemExit("Refusing unexpected persistence target.")

result = subprocess.run(
    ["az.cmd", "account", "get-access-token", "--subscription", SUBSCRIPTION,
     "--resource", "https://cosmos.azure.com/", "--query", "accessToken", "-o", "tsv"],
    capture_output=True, text=True, check=True,
)
token = result.stdout.strip()
claims = json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "==="))
if claims["oid"] != config["callerPrincipalId"]:
    raise SystemExit("Refusing a caller different from the deployed validation role.")
probe_id = "infra-probe-" + uuid.uuid4().hex
document = {
    "id": probe_id, "accountId": probe_id, "kind": "infrastructure-probe",
    "excludeFromAppDataset": True, "synthetic": True, "revision": 1,
    "customerChanges": {"notes": "Synthetic infrastructure validation only"},
    "analysis": {"riskLevel": "watchlist", "drivers": [{"evidence": "synthetic"}]},
    "retentionPlan": {
        "actions": [{"id": "probe-action", "status": "proposed", "ownerRole": "CSM"}],
        "approvals": [], "outreachDraft": "Synthetic probe",
    },
    "history": [{"event": "infrastructure-probe-created", "at": datetime.now(timezone.utc).isoformat()}],
}
evidence = {
    "checkedAtUtc": datetime.now(timezone.utc).isoformat(),
    "subscriptionId": SUBSCRIPTION, "endpoint": config["cosmosEndpoint"],
    "authentication": "Entra token via explicitly subscription-targeted Azure CLI; no keys",
    "apiVersion": "2018-12-31", "probeId": probe_id,
    "scope": "infrastructure-only; not app seed; no delete operations",
    "operations": [], "roundTripSucceeded": False,
    "retainedProbe": False,
    "callerPrincipalId": claims["oid"], "tokenAudience": claims["aud"],
    "futureAcaIdentityInvocationVerified": False,
}
session = None


def operation(method, path, body=None, etag=None):
    global session
    headers = {
        "Authorization": quote("type=aad&ver=1.0&sig=" + token, safe=""),
        "x-ms-date": formatdate(usegmt=True), "x-ms-version": "2018-12-31",
        "x-ms-documentdb-partitionkey": json.dumps([probe_id]),
        "Content-Type": "application/json",
    }
    if session:
        headers["x-ms-session-token"] = session
    if etag:
        headers["If-Match"] = etag
    data = json.dumps(body).encode() if body is not None else None
    request = Request(config["cosmosEndpoint"].rstrip("/") + "/" + path,
                      data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=45) as response:
            value = json.loads(response.read())
            evidence["operations"].append({
                "method": method, "httpStatus": response.status,
                "requestCharge": response.headers.get("x-ms-request-charge"),
                "activityId": response.headers.get("x-ms-activity-id"),
            })
            session = response.headers.get("x-ms-session-token", session)
            return value
    except HTTPError as error:
        value = json.loads(error.read())
        evidence["operations"].append({
            "method": method, "httpStatus": error.code,
            "code": value.get("code"), "message": value.get("message"),
            "activityId": error.headers.get("x-ms-activity-id"),
        })
        raise


path = f"dbs/{config['cosmosDatabase']}/colls/{config['cosmosContainer']}/docs"
try:
    operation("POST", path, document)
    evidence["retainedProbe"] = True
    first = operation("GET", path + "/" + probe_id)
    assert first["analysis"] == document["analysis"] and first["revision"] == 1
    document["revision"] = 2
    document["retentionPlan"]["actions"][0]["status"] = "accepted"
    document["retentionPlan"]["approvals"].append({"actionId": "probe-action", "approved": True})
    document["history"].append({"event": "probe-approved", "at": datetime.now(timezone.utc).isoformat()})
    operation("PUT", path + "/" + probe_id, document, first["_etag"])
    second = operation("GET", path + "/" + probe_id)
    assert second["revision"] == 2 and second["retentionPlan"] == document["retentionPlan"]
    assert second["analysis"] == document["analysis"] and second["history"] == document["history"]
    evidence["roundTripSucceeded"] = True
    evidence["retainedProbe"] = True
except Exception as error:
    evidence["failureType"] = type(error).__name__
finally:
    (ROOT / "infra" / "evidence" / "persistence-roundtrip.json").write_text(
        json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"roundTripSucceeded": evidence["roundTripSucceeded"],
                  "operations": evidence["operations"]}, indent=2))
raise SystemExit(0 if evidence["roundTripSucceeded"] else 1)
