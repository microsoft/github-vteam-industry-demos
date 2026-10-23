"""Read-only ACA/UAMI preflight. Run with the Python bundled with Azure CLI."""

import base64
import json
from pathlib import Path
import re
import time
import zlib

from azure.cli.core import get_default_cli
import azure.cli.command_modules.containerapp.custom as aca
import azure.cli.command_modules.containerapp._ssh_utils as ssh

SUBSCRIPTION = "e2d6ac89-1bb7-420c-97fb-a96dea6c0635"
REMOTE = r'''
import base64, json, os, time
from datetime import datetime, timezone
from pathlib import Path
import httpx
from azure.identity import ManagedIdentityCredential

client_id = "63cf5272-0d17-42ce-ac7d-982d2bb12b71"
principal_id = "1a5b6869-b2d3-4a3a-a807-8fda903b97c9"
assert os.environ["AZURE_CLIENT_ID"] == client_id
endpoint = os.environ["FOUNDRY_PROJECT_ENDPOINT"]
assert endpoint == "https://foundry-high-tech-isv-f4ee1f29.services.ai.azure.com/api/projects/proj-high-tech-software-isv-01"
definitions = json.loads(Path("/app/scripts/foundry-agent-definitions.json").read_text())["agents"]
attempts = []
with ManagedIdentityCredential(client_id=client_id) as credential, httpx.Client(timeout=30) as client:
    for attempt, delay in enumerate((0, 15, 30, 60), 1):
        time.sleep(delay)
        token = credential.get_token("https://ai.azure.com/.default").token
        claims = json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "==="))
        assert claims["oid"] == principal_id and claims["appid"] == client_id
        assert claims["aud"] == "https://ai.azure.com"
        response = client.get(endpoint + "/agents", params={"api-version": "v1"},
                              headers={"Authorization": "Bearer " + token})
        attempts.append({"attempt": attempt, "checkedAt": datetime.now(timezone.utc).isoformat(),
                         "httpStatus": response.status_code,
                         "requestId": response.headers.get("x-ms-request-id"),
                         "correlationRequestId": response.headers.get("x-ms-correlation-request-id")})
        if response.status_code != 403:
            break
    result = {"checkedAt": datetime.now(timezone.utc).isoformat(),
              "origin": "Read-only diagnostic inside the existing running ACA replica",
              "identity": {key: claims[key] for key in ("aud", "oid", "appid", "tid")},
              "operation": "GET /api/projects/proj-high-tech-software-isv-01/agents?api-version=v1",
              "attempts": attempts, "httpStatus": response.status_code,
              "generationCalls": 0, "rawTokensSaved": False, "agents": []}
    if response.status_code == 200:
        listing = response.json()
        assert not listing.get("has_more") and not listing.get("nextLink")
        agents = listing.get("data", listing.get("value", []))
        assert len(agents) == 2
        for definition in definitions:
            agent = next(a for a in agents if a["name"] == definition["name"])
            latest = agent["versions"]["latest"]
            assert str(latest["version"]) == "1"
            assert latest["definition"]["model"] == "gpt-4.1-mini"
            assert latest["definition"]["text"]["format"]["schema"] == definition["schema"]
            result["agents"].append({"name": agent["name"], "version": str(latest["version"]),
                                     "model": latest["definition"]["model"], "schemaMatchesSource": True})
        result["status"] = "passed_deployed_uami_metadata_preflight"
    else:
        result["status"] = "blocked"
        result["error"] = response.json().get("error", {})
    print("PHASE2_READ_RESULT=" + json.dumps(result), flush=True)
'''


def read_only_exec(cmd, resource_group_name, name, container=None, revision=None,
                   replica=None, startup_command="sh"):
    if isinstance(startup_command, list):
        startup_command = startup_command[0]
    # Replace only the interactive terminal loop, retaining CLI auth/exec transport.
    connection = ssh.WebSocketConnection(cmd, resource_group_name, name, revision,
                                        replica, container, startup_command)
    connection._socket.settimeout(5)
    connection.send(ssh.SSH_TERM_RESIZE_PREFIX + b'{"Width":200,"Height":50}')
    output = ""
    deadline = time.monotonic() + 180
    try:
        while time.monotonic() < deadline:
            try:
                message = connection.recv()
            except ssh.websocket.WebSocketTimeoutException:
                continue
            if not message:
                break
            if isinstance(message, str):
                message = message.encode("utf-8")
            if isinstance(message, bytes) and message[0] == ssh.SSH_PROXY_FORWARD:
                output += message[2:].decode("utf-8", errors="replace")
                for match in re.finditer(r'PHASE2_READ_RESULT=(\{[^\r\n]+\})', output):
                    result = json.loads(match.group(1))
                    result["appName"] = name
                    result["revision"] = revision
                    result["replica"] = replica
                    path = Path(__file__).resolve().parents[1] / "infra" / "evidence" / "phase2-foundry-read-uami.json"
                    path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
                    print(json.dumps(result, indent=2))
                    if result["status"] != "passed_deployed_uami_metadata_preflight":
                        raise RuntimeError("Deployed UAMI metadata read is still blocked.")
                    return
        raise RuntimeError("No completed diagnostic result: " + output[-3000:])
    finally:
        connection.disconnect()


if __name__ == "__main__":
    aca.containerapp_ssh = read_only_exec
    ssh._get_conout_mode = lambda: None
    ssh._get_conin_mode = lambda: None
    # Keep the encoded startup command below the exec proxy query-string limit.
    encoded = base64.b64encode(zlib.compress(REMOTE.encode(), 9)).decode()
    command = f'python -c "import zlib,base64;exec(zlib.decompress(base64.b64decode(\'{encoded}\')))"'
    cli = get_default_cli()
    code = cli.invoke([
        "containerapp", "replica", "list", "--subscription", SUBSCRIPTION,
        "--resource-group", "rg-high-tech-software-isv-01",
        "--name", "ca-high-tech-software-isv-01",
        "--revision", "ca-high-tech-software-isv-01--iwc1wjp",
        "--only-show-errors", "--output", "none",
    ])
    if code:
        raise SystemExit(code)
    replicas = cli.result.result
    assert len(replicas) == 1, "Expected exactly the existing single replica."
    code = cli.invoke([
        "containerapp", "exec", "--subscription", SUBSCRIPTION,
        "--resource-group", "rg-high-tech-software-isv-01",
        "--name", "ca-high-tech-software-isv-01",
        "--revision", "ca-high-tech-software-isv-01--iwc1wjp",
        "--replica", replicas[0]["name"],
        "--container", "command-center", "--command", command,
        "--only-show-errors",
    ])
    raise SystemExit(code)
