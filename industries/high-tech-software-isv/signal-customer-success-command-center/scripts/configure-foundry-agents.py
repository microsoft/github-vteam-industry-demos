"""Configure exactly two Foundry prompt agents using Entra auth and REST v1.

Python standard library only; Azure CLI provides an in-memory bearer token.
Never prints or persists tokens, keys, request headers, or CLI credential data.
"""

import argparse
import datetime
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
API_VERSION = "v1"


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def az_json(*args):
    result = subprocess.run(
        [shutil.which("az") or "az", *args, "--output", "json"],
        capture_output=True, text=True, check=False,
    )
    if result.returncode:
        raise RuntimeError("Azure CLI authentication/account command failed; verify az login.")
    return json.loads(result.stdout)


class Foundry:
    def __init__(self, endpoint, subscription_id):
        self.endpoint = endpoint.rstrip("/")
        self.token = az_json(
            "account", "get-access-token", "--subscription", subscription_id,
            "--resource", "https://ai.azure.com"
        )["accessToken"]

    def request(self, method, path, body=None):
        url = f"{self.endpoint}/{path}?api-version={API_VERSION}"
        data = None if body is None else json.dumps(body).encode("utf-8")
        for attempt in range(4):
            request = urllib.request.Request(
                url, data=data, method=method,
                headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
            )
            try:
                with urllib.request.urlopen(request, timeout=180) as response:
                    return json.load(response)
            except urllib.error.HTTPError as error:
                detail = error.read().decode("utf-8", errors="replace")
                if error.code in (429, 502, 503, 504) and attempt < 3:
                    delay = min(60, max(2 ** (attempt + 1), int(error.headers.get("Retry-After", "0"))))
                    print(f"Foundry HTTP {error.code}; bounded retry in {delay}s.")
                    time.sleep(delay)
                    continue
                raise RuntimeError(f"Foundry {method} {path}: HTTP {error.code}: {detail}") from None


def validate_shape(value, schema, path="$"):
    kind = schema["type"]
    if kind == "object":
        if not isinstance(value, dict):
            raise ValueError(f"{path}: expected object")
        if set(schema["required"]) - value.keys():
            raise ValueError(f"{path}: required fields missing")
        if set(value) - schema["properties"].keys():
            raise ValueError(f"{path}: unexpected fields")
        for name, child in value.items():
            validate_shape(child, schema["properties"][name], f"{path}.{name}")
    elif kind == "array":
        if not isinstance(value, list):
            raise ValueError(f"{path}: expected array")
        for index, child in enumerate(value):
            validate_shape(child, schema["items"], f"{path}[{index}]")
    elif kind == "string":
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{path}: expected nonempty string")
        if "enum" in schema and value not in schema["enum"]:
            raise ValueError(f"{path}: value outside enum")
    elif kind == "boolean" and not isinstance(value, bool):
        raise ValueError(f"{path}: expected boolean")


def smoke(client, config, definitions):
    account = {
        "fictional": True,
        "name": "Synthetic Validation Account",
        "arr": 48000,
        "seats_licensed": 100,
        "seats_active": 24,
        "weekly_active_users_last_4_weeks": [60, 45, 32, 24],
        "renewal_in_days": 28,
        "support": {"open_cases": 3, "critical_cases": 1, "critical_case_age_days": 5},
        "sentiment": "frustrated about unresolved support",
        "positive_evidence": ["executive sponsor agreed to a success review"],
        "missing_evidence": ["CSAT survey", "contract cancellation terms"],
    }
    evidence = {"validatedAtUtc": utc_now(), "apiVersion": API_VERSION, "syntheticInput": account, "calls": []}
    risk = None
    for definition in definitions:
        agent = config["agents"][definition["key"]]
        content = {"account": account}
        if risk is not None:
            content["risk_analysis"] = risk
        response = client.request(
            "POST",
            f"agents/{urllib.parse.quote(agent['name'])}/endpoint/protocols/openai/responses",
            {"input": [{"role": "user", "content": json.dumps(content)}], "max_output_tokens": 2200},
        )
        text = "".join(
            content.get("text", "")
            for item in response.get("output", [])
            for content in item.get("content", [])
            if content.get("type") == "output_text"
        )
        if response.get("status") != "completed" or not text.strip():
            raise RuntimeError(f"{agent['name']}: response incomplete or empty: {response.get('status')}")
        output = json.loads(text)
        validate_shape(output, definition["schema"])
        if definition["key"] == "churnRisk":
            if not output["top_risk_drivers"] or not output["confidence"]["limitations"]:
                raise ValueError("Risk output omitted evidence or limitations")
            risk = output
        elif not output["recommended_actions"] or not output["plan_30_days"] or output["human_approval_required"] is not True:
            raise ValueError("Retention output omitted actionable plan or human approval")
        evidence["calls"].append({
            "agent": agent, "responseId": response["id"], "status": response["status"],
            "model": response.get("model"), "usage": response.get("usage"), "output": output,
            "shapeValidated": True,
        })
        write_json(ROOT / "infra" / "evidence" / "agent-smoke.json", evidence)
        print(f"Validated {agent['displayName']}: {agent['id']}; response {response['id']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true", help="Never create or change agents")
    parser.add_argument("--skip-smoke", action="store_true", help="Inspect/configure without new billed calls")
    args = parser.parse_args()
    handoff_path = ROOT / "infra" / "phase1-handoff.json"
    config = read_json(handoff_path)
    account = az_json("account", "show", "--subscription", config["subscriptionId"])
    if account["id"] != config["subscriptionId"]:
        raise RuntimeError("Authenticated subscription differs from approved handoff; refusing to proceed.")
    definitions = read_json(ROOT / "scripts" / "foundry-agent-definitions.json")["agents"]
    client = Foundry(config["projectEndpoint"], config["subscriptionId"])
    listed = client.request("GET", "agents")
    agents = listed.get("data", listed.get("value", []))
    if listed.get("has_more") or listed.get("nextLink"):
        raise RuntimeError("Unexpected agent pagination; inspect project before modifying it.")
    expected = {definition["name"] for definition in definitions}
    if {agent["name"] for agent in agents} - expected:
        raise RuntimeError("Unexpected existing agents; refusing to change unrelated runtime assets.")
    config.setdefault("agents", {})
    for definition in definitions:
        desired = {
            "kind": "prompt",
            "model": config["modelDeployment"],
            "instructions": definition["instructions"],
            "temperature": 0.2,
            "text": {"format": {
                "type": "json_schema",
                "name": definition["key"],
                "strict": True,
                "schema": definition["schema"],
            }},
        }
        fingerprint = hashlib.sha256(json.dumps(desired, sort_keys=True).encode()).hexdigest()
        existing = next((agent for agent in agents if agent["name"] == definition["name"]), None)
        if existing:
            version = existing["versions"]["latest"]
            actual = version.get("definition", {})
            if any(actual.get(key) != value for key, value in desired.items()):
                raise RuntimeError(f"Existing {definition['name']} definition differs; explicit review required.")
        else:
            if args.verify_only:
                raise RuntimeError(f"Missing expected agent {definition['name']}")
            created = client.request("POST", "agents", {
                "name": definition["name"],
                "description": definition["displayName"],
                "definition": desired,
            })
            version = created["versions"]["latest"]
        config["agents"][definition["key"]] = {
            "name": definition["name"], "displayName": definition["displayName"],
            "id": version["id"], "version": str(version["version"]),
            "agentGuid": version.get("agent_guid"),
            "definitionSha256": fingerprint,
        }
        write_json(handoff_path, config)
        print(f"Configured {definition['displayName']}: {version['id']}, version {version['version']}")
    listed = client.request("GET", "agents")
    actual_names = {agent["name"] for agent in listed.get("data", listed.get("value", []))}
    if actual_names != expected:
        raise RuntimeError("Project must contain exactly the two approved agents.")
    write_json(ROOT / "infra" / "evidence" / "runtime-agents.json", {
        "checkedAtUtc": utc_now(), "apiVersion": API_VERSION,
        "endpoint": config["projectEndpoint"], "agents": config["agents"], "count": len(actual_names),
        "pythonVersion": __import__("platform").python_version(), "sdk": "none; Python standard-library REST client",
    })
    if not args.skip_smoke:
        smoke(client, config, definitions)


if __name__ == "__main__":
    main()
