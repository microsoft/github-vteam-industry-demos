"""The proven Foundry agents REST v1 / OpenAI Responses contract, not Assistants."""

import asyncio
import json
import os
import time
from collections import deque
from pathlib import Path
from urllib.parse import quote

import httpx
from azure.core.exceptions import AzureError, ClientAuthenticationError
from azure.identity import CredentialUnavailableError
from azure.identity.aio import AzureCliCredential, ManagedIdentityCredential
from jsonschema import Draft202012Validator, ValidationError

from backend.store import now

ENDPOINT = "https://foundry-high-tech-isv-f4ee1f29.services.ai.azure.com/api/projects/proj-high-tech-software-isv-01"
CLIENT_ID = "63cf5272-0d17-42ce-ac7d-982d2bb12b71"
SUBSCRIPTION = "e2d6ac89-1bb7-420c-97fb-a96dea6c0635"
SCOPE = "https://ai.azure.com/.default"
DEFINITIONS = json.loads((Path(__file__).resolve().parents[1] / "scripts" /
                          "foundry-agent-definitions.json").read_text(encoding="utf-8"))["agents"]


class AIError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message
        super().__init__(message)


def parse_output(response, definition):
    if not isinstance(response, dict):
        raise AIError(502, "Foundry returned an invalid response envelope.")
    if response.get("status") != "completed":
        raise AIError(502, "Foundry did not complete the response. No generated output was saved.")
    try:
        text = "".join(part.get("text", "") for item in response.get("output", [])
                       for part in item.get("content", []) if part.get("type") == "output_text")
    except (TypeError, AttributeError):
        raise AIError(502, "Foundry returned invalid output content.") from None
    if not isinstance(response.get("id"), str) or not response["id"] or len(text) > 100_000:
        raise AIError(502, "Foundry returned an invalid response envelope.")
    try:
        output = json.loads(text)
        Draft202012Validator(definition["schema"]).validate(output)
        def check(value):
            if isinstance(value, str) and (not value.strip() or len(value) > 12000):
                raise ValueError()
            if isinstance(value, list):
                if len(value) > 40:
                    raise ValueError()
                for child in value:
                    check(child)
            if isinstance(value, dict):
                for child in value.values():
                    check(child)
        check(output)
        if definition["key"] == "churnRisk":
            if not output["confidence"]["limitations"]:
                raise ValueError()
        elif (output["human_approval_required"] is not True or not output["recommended_actions"]
              or not output["plan_30_days"]):
            raise ValueError()
    except (ValueError, TypeError, ValidationError):
        raise AIError(502, "Foundry output did not match the approved JSON contract. Nothing was saved.") from None
    return output


class AbuseGuard:
    """One-process demo budget; not authentication or a durable spending cap."""
    def __init__(self):
        self.active = set()
        self.last = {}
        self.calls = deque()

    def reserve(self, account_id):
        clock = time.monotonic()
        while self.calls and clock - self.calls[0] > 86400:
            self.calls.popleft()
        if account_id in self.active or len(self.active) >= 2:
            raise AIError(429, "An AI request is already running. Wait for it to finish.")
        if clock - self.last.get(account_id, -1000) < 25:
            raise AIError(429, "Please wait 25 seconds between AI runs for this account.")
        if len(self.calls) >= 150 or sum(clock - call < 3600 for call in self.calls) >= 40:
            raise AIError(429, "This public demo's AI request budget has been reached. Try later.")
        self.active.add(account_id)
        self.last[account_id] = clock
        self.calls.append(clock)

    def release(self, account_id):
        self.active.discard(account_id)


class Foundry:
    def __init__(self):
        self.endpoint = os.getenv("FOUNDRY_PROJECT_ENDPOINT", ENDPOINT).rstrip("/")
        self.mode = os.getenv("AZURE_AUTH_MODE", "managed_identity")
        if self.endpoint != ENDPOINT:
            raise RuntimeError("Only the approved Foundry project endpoint is allowed.")
        if self.mode not in ("managed_identity", "azure_cli"):
            raise RuntimeError("AZURE_AUTH_MODE must be managed_identity or azure_cli.")
        self.credential = (AzureCliCredential(subscription=SUBSCRIPTION, process_timeout=15)
                           if self.mode == "azure_cli" else
                           ManagedIdentityCredential(client_id=os.getenv("AZURE_CLIENT_ID", CLIENT_ID)))
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(75, connect=10), follow_redirects=False)
        self.verified = {}

    async def close(self):
        await self.client.aclose()
        await self.credential.close()

    async def request(self, method, path, token, body=None):
        response = await self.client.request(
            method, f"{self.endpoint}/{path}", params={"api-version": "v1"},
            headers={"Authorization": f"Bearer {token}"}, json=body)
        if response.status_code >= 400:
            status = response.status_code
            if status in (401, 403):
                raise AIError(502, "Foundry authentication/authorization failed. Azure must verify the "
                              "attached managed identity and project invocation permissions.")
            if status == 429:
                raise AIError(429, "Foundry is rate limited. Wait a moment before trying again.")
            raise AIError(502, f"Foundry returned HTTP {status}. No fallback or fabricated AI output is used.")
        try:
            value = response.json()
            if not isinstance(value, dict):
                raise ValueError()
            return value
        except ValueError:
            raise AIError(502, "Foundry returned a non-JSON transport response.") from None

    async def run(self, kind, account, risk=None):
        definition = next(d for d in DEFINITIONS if d["key"] == kind)
        agent = definition["name"]
        try:
            async with asyncio.timeout(110):
                access = await self.credential.get_token(SCOPE)
                # The evidenced endpoint resolves by name. Fail closed if latest is
                # not the approved immutable version 1, rather than silently drifting.
                listing = await self.request("GET", "agents", access.token)
                if listing.get("has_more") or listing.get("nextLink"):
                    raise AIError(502, "Unexpected Foundry agent pagination; configuration needs review.")
                actual = next((a for a in listing.get("data", listing.get("value", []))
                               if a.get("name") == agent), None)
                latest = (actual or {}).get("versions", {}).get("latest", {})
                if str(latest.get("version")) != "1" or latest.get("definition", {}).get("model") != "gpt-4.1-mini":
                    raise AIError(502, "Approved Foundry agent version 1/model could not be verified. "
                                  "Azure must review agent configuration; no alternate version was invoked.")
                if (latest.get("definition", {}).get("text", {}).get("format", {}).get("schema")
                        != definition["schema"]):
                    raise AIError(502, "Foundry's schema differs from the approved source contract.")
                payload = {"account": account, "as_of_utc": now()}
                if risk is not None:
                    payload["risk_analysis"] = risk["output"]
                path = f"agents/{quote(agent, safe='')}/endpoint/protocols/openai/responses"
                response = await self.request("POST", path, access.token, {
                    "input": [{"role": "user", "content": json.dumps(payload)}],
                    "max_output_tokens": 4000,
                })
                for _ in range(12):
                    if response.get("status") not in ("queued", "in_progress"):
                        break
                    response_id = response.get("id")
                    if not isinstance(response_id, str) or not response_id:
                        raise AIError(502, "Foundry returned a pending response without an ID.")
                    await asyncio.sleep(2)
                    response = await self.request("GET", f"{path}/{quote(response_id, safe='')}", access.token)
                output = parse_output(response, definition)
                timestamp = now()
                self.verified[kind] = timestamp
                return {"output": output, "response_id": response["id"], "at": timestamp,
                        "agent": f"{agent}:1", "api_version": "v1",
                        "model": response.get("model", "gpt-4.1-mini"), "source": "Microsoft Foundry",
                        "risk_response_id": risk["response_id"] if risk else None}
        except AIError:
            raise
        except (ClientAuthenticationError, CredentialUnavailableError):
            raise AIError(502, "Azure identity could not acquire a Foundry token. Verify managed identity "
                          "attachment, or explicitly enable Azure CLI mode for local development.") from None
        except (TimeoutError, httpx.TimeoutException):
            raise AIError(504, "Foundry timed out. No result was saved; a remote request may still incur "
                          "cost. Wait before retrying.") from None
        except AzureError:
            raise AIError(502, "Azure identity transport failed. Verify managed identity availability "
                          "and Foundry access; no response was saved.") from None
        except (httpx.HTTPError, KeyError, TypeError, AttributeError):
            raise AIError(502, "Foundry could not be reached or returned an unexpected envelope. "
                          "No result was saved.") from None
