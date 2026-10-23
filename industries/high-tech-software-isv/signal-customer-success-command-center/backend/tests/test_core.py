"""Focused local checks. Fixtures are historical evidence, NEVER runtime fallbacks."""

import asyncio
import copy
import json
import shutil
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from backend.data import health, seed_accounts
from backend.foundry import AIError, AbuseGuard, DEFINITIONS, Foundry, parse_output
from backend.main import create_app
from backend.store import Conflict, Store, now

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = json.loads((ROOT / "infra" / "evidence" / "agent-smoke.json").read_text(encoding="utf-8"))


class ContractFixtureAI:
    mode = "test_fixture_not_live"
    verified = {}

    def __init__(self):
        self.inputs = []

    async def run(self, kind, account, risk=None):
        self.inputs.append((kind, account, risk))
        output = copy.deepcopy(EVIDENCE["calls"][0 if kind == "churnRisk" else 1]["output"])
        return {"output": output, "agent": f"{DEFINITIONS[0 if kind == 'churnRisk' else 1]['name']}:1",
                "response_id": f"test-{uuid.uuid4()}", "at": now(), "api_version": "v1",
                "model": "test-fixture", "source": "test fixture, not live",
                "risk_response_id": risk["response_id"] if risk else None}


class CoreTests(unittest.TestCase):
    def setUp(self):
        self.folder = ROOT / ".local-validation" / str(uuid.uuid4())
        self.folder.mkdir(parents=True)
        self.path = self.folder / "test.sqlite3"

    def tearDown(self):
        shutil.rmtree(self.folder)
        parent = self.folder.parent
        if parent.exists() and not any(parent.iterdir()):
            parent.rmdir()

    def test_seed_is_idempotent_and_preserves_updates(self):
        store = Store(self.path)
        store.initialize()
        first = store.get("acct-001")
        store.change("acct-001", first["revision"], lambda s: s["account"].update(notes="Saved fictional note"),
                     "Saved", "Synthetic test")
        Store(self.path).initialize()
        self.assertEqual(len(store.list()), 24)
        self.assertEqual(store.get("acct-001")["account"]["notes"], "Saved fictional note")
        self.assertEqual(store.get("acct-001")["revision"], 2)
        with self.assertRaises(Conflict):
            store.change("acct-001", 1, lambda s: None, "Should not save", "")
        self.assertEqual(len(store.get("acct-001")["history"]), 1)

    def test_health_contrasts_and_initial_dates(self):
        today = datetime.now(timezone.utc).date()
        accounts = seed_accounts(today)
        self.assertEqual({health(a)["segment"] for a in accounts}, {"healthy", "watchlist", "high"})
        self.assertEqual(health(accounts[0])["segment"], "high")
        self.assertEqual(health(accounts[2])["segment"], "healthy")
        self.assertTrue(all(a["renewal_date"] > today.isoformat() for a in accounts))
        self.assertTrue(all(0 <= health(a)["score"] <= 100 for a in accounts))

    def test_contract_rejects_partial_or_invalid_output(self):
        for i, definition in enumerate(DEFINITIONS):
            response = {"id": "test-response", "status": "completed", "output": [
                {"content": [{"type": "output_text", "text": json.dumps(EVIDENCE["calls"][i]["output"])}]}]}
            self.assertEqual(parse_output(response, definition), EVIDENCE["calls"][i]["output"])
            response["status"] = "incomplete"
            with self.assertRaises(AIError):
                parse_output(response, definition)
            response["status"] = "completed"
            response["output"][0]["content"][0]["text"] = '{"unexpected": "bad"}'
            with self.assertRaises(AIError):
                parse_output(response, definition)
        output = copy.deepcopy(EVIDENCE["calls"][1]["output"])
        output["human_approval_required"] = False
        with self.assertRaises(AIError):
            parse_output({"id": "test", "status": "completed", "output": [
                {"content": [{"type": "output_text", "text": json.dumps(output)}]}]}, DEFINITIONS[1])

    def test_api_saved_plan_actions_history_and_export_survive_restart(self):
        fixture = ContractFixtureAI()
        app = create_app(self.path, fixture)
        with TestClient(app) as client:
            self.assertEqual(client.get("/api/health").json()["account_count"], 24)
            self.assertEqual(client.get("/api/accounts/missing").status_code, 404)
            self.assertEqual(client.get("/api/not-a-route").status_code, 404)
            self.assertEqual(client.post("/api/accounts/acct-001/plan", json={"revision": 1}).status_code, 409)
            self.assertEqual(client.patch("/api/accounts/acct-001", json={"revision": 1, "notes": "x" * 4001}).status_code, 422)
            risk = client.post("/api/accounts/acct-001/risk", json={"revision": 1})
            self.assertEqual(risk.status_code, 200, risk.text)
            self.assertEqual(client.post("/api/accounts/acct-001/plan", json={"revision": 2}).status_code, 429)
        # A new process resets the deliberately process-local abuse guard, not data.
        with TestClient(create_app(self.path, fixture)) as client:
            result = client.post("/api/accounts/acct-001/plan", json={"revision": 2})
            self.assertEqual(result.status_code, 200, result.text)
            state = result.json()
            self.assertEqual(fixture.inputs[-1][2]["output"], risk.json()["risk"]["output"])
            self.assertEqual(fixture.inputs[-1][1]["name"], "Northstar Workflow")
            edits = {"revision": state["revision"], "subject": "Reviewed subject",
                     "body": "<script>synthetic only</script>", "notes": "Review owner and milestone."}
            saved = client.patch("/api/accounts/acct-001/plan", json=edits)
            self.assertEqual(saved.status_code, 200, saved.text)
            self.assertEqual(client.patch("/api/accounts/acct-001/plan", json=edits).status_code, 409)
            rev = saved.json()["revision"]
            self.assertEqual(client.patch("/api/accounts/acct-001/actions/0",
                                         json={"revision": rev, "status": "completed"}).status_code, 409)
            accepted = client.patch("/api/accounts/acct-001/actions/0", json={"revision": rev, "status": "accepted"})
            self.assertEqual(accepted.status_code, 200)
            complete = client.patch("/api/accounts/acct-001/actions/0",
                                    json={"revision": accepted.json()["revision"], "status": "completed"})
            self.assertEqual(complete.status_code, 200)
        with TestClient(create_app(self.path, fixture)) as client:
            state = client.get("/api/accounts/acct-001").json()
            self.assertEqual(state["edits"]["subject"], "Reviewed subject")
            self.assertEqual(state["action_states"]["0"]["status"], "completed")
            self.assertIn("accepted_at", state["action_states"]["0"])
            self.assertEqual(len(state["history"]), 5)
            export = client.get("/api/accounts/acct-001/export")
            self.assertEqual(export.status_code, 200)
            self.assertIn("Reviewed subject", export.text)
            self.assertNotIn("<script>", export.text)
            self.assertIn("&lt;script&gt;", export.text)
            self.assertEqual(client.get("/api/accounts/acct-002/export").status_code, 409)
            self.assertIsNone(client.get("/api/accounts/acct-002").json()["risk"])
        with Store(self.path).connection() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM ai_runs").fetchone()[0], 2)

    def test_account_edits_require_fresh_risk_before_plan(self):
        fixture = ContractFixtureAI()
        with TestClient(create_app(self.path, fixture)) as client:
            client.post("/api/accounts/acct-001/risk", json={"revision": 1})
            edit = client.patch("/api/accounts/acct-001", json={"revision": 2, "notes": "Updated fictional context"})
            self.assertEqual(edit.status_code, 200)
        with TestClient(create_app(self.path, fixture)) as client:
            self.assertEqual(client.post("/api/accounts/acct-001/plan", json={"revision": 3}).status_code, 409)

    def test_throttle_blocks_parallel_runs_and_process_budget(self):
        guard = AbuseGuard()
        guard.reserve("a")
        with self.assertRaises(AIError):
            guard.reserve("a")
        guard.release("a")
        with self.assertRaises(AIError):
            guard.reserve("a")

    def test_foundry_proven_protocol_and_fail_closed_version_guard(self):
        async def check():
            calls = []
            class Credential:
                async def get_token(self, scope):
                    self.scope = scope
                    return type("Access", (), {"token": "test-only-not-a-credential"})()
                async def close(self):
                    pass
            definition = DEFINITIONS[0]
            version = {"version": "1", "definition": {
                "model": "gpt-4.1-mini", "text": {"format": {"schema": definition["schema"]}}}}
            def handler(request):
                calls.append(request)
                if request.method == "GET":
                    return httpx.Response(200, json={"data": [{"name": definition["name"], "versions": {"latest": version}}]})
                return httpx.Response(200, json={"id": "test", "status": "completed", "output": [
                    {"content": [{"type": "output_text", "text": json.dumps(EVIDENCE["calls"][0]["output"])}]}]})
            service = Foundry()
            await service.credential.close()
            await service.client.aclose()
            service.credential = Credential()
            service.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
            try:
                result = await service.run("churnRisk", {"fictional": True})
                self.assertEqual(result["agent"], "customer-churn-risk-analyst:1")
                self.assertTrue(str(calls[-1].url).endswith(
                    "/agents/customer-churn-risk-analyst/endpoint/protocols/openai/responses?api-version=v1"))
                self.assertEqual(json.loads(calls[-1].content)["input"][0]["role"], "user")
                self.assertEqual(service.credential.scope, "https://ai.azure.com/.default")
                version["version"] = "2"
                with self.assertRaises(AIError):
                    await service.run("churnRisk", {"fictional": True})
                self.assertEqual(sum(r.method == "POST" for r in calls), 1)
            finally:
                await service.close()
        asyncio.run(check())


if __name__ == "__main__":
    unittest.main()
