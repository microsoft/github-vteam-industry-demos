"""Bounded offline smoke tests. Scripted AI fixtures exist ONLY in this test module."""
import copy
import json
import threading
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from shutil import rmtree
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.ai import AIJobs, Foundry, date, prompt_for, retry_seconds, validate_output
from backend.config import configuration
from backend.domain import iso, metrics, now
from backend.main import create_app
from backend.seed import seed
from backend.store import Conflict, SQLiteStore, StoreUnavailable


INVESTIGATION = {
    "summary": "Synthetic drive signal needs inspection.",
    "facts": ["Vibration rose in supplied readings."],
    "hypotheses": [{"suspected_cause": "Possible imbalance", "evidence": ["Supplied vibration trend"],
                    "confidence": 0.6, "uncertainty": "No physical inspection provided."}],
    "business_impact": "Batch flow may be delayed.",
    "questions": ["Was there a recent changeover?"],
    "qualified_human_review_required": True,
}
PLAN = {
    "summary": "Qualified team should review the drive signal.",
    "actions": [{"priority": 1, "action": "Arrange qualified condition assessment", "owner_role": "Maintenance lead",
                 "urgency": "immediate_review", "expected_benefit": "Validate the suspected cause",
                 "safety_checks": ["Follow approved site procedures; no restart authorization."]}],
    "preventive_steps": ["Review inspection intervals."],
    "qualified_human_review_required": True, "approved": False,
}


class MemoryStore:
    def __init__(self):
        self.state, self.lock = seed(), threading.RLock()

    def ensure(self):
        pass

    def read(self):
        with self.lock:
            return copy.deepcopy(self.state), "offline-test"

    def mutate(self, change):
        with self.lock:
            candidate = copy.deepcopy(self.state)
            result = change(candidate)
            self.state = candidate
            return copy.deepcopy(result)


class ScriptedGateway:
    def __init__(self):
        self.calls = []
        self.error = None

    def admission(self, key, prompt):
        return 400

    def invoke(self, key, prompt, tokens):
        self.calls.append((key, prompt))
        if self.error:
            raise self.error
        return {"content": copy.deepcopy(INVESTIGATION if key == "DOWNTIME" else PLAN), "edited": False,
                "attribution": {"response_id": "offline-test-only", "model": "test-fixture",
                                "agent": key, "version": "1", "timestamp": iso()}}


@pytest.fixture
def database_path():
    folder = Path(".build-cache") / ("sqlite-test-" + uuid4().hex)
    try:
        yield folder / "manufacturing.db"
    finally:
        if folder.exists():
            rmtree(folder)


@pytest.fixture
def setup(database_path):
    store, gateway = SQLiteStore(database_path), ScriptedGateway()
    with TestClient(create_app(store, gateway)) as client:
        clear_cooldown(store)
        yield client, store, gateway


def latest(client):
    return client.get("/api/state").json()["incidents"][0]


def body(client, **extra):
    return {"revision": latest(client)["revision"], **extra}


def clear_cooldown(store):
    store.mutate(lambda state: state["ai"].update(next_eligible_at=None))


@pytest.mark.parametrize("count", [5, 8])
def test_investigation_accepts_bounded_observation_facts(count):
    output = copy.deepcopy(INVESTIGATION)
    output["facts"] = [f"Supplied observation {n}." for n in range(count)]
    assert validate_output("DOWNTIME", output) == output


def test_investigation_retains_fact_and_evidence_bounds():
    output = copy.deepcopy(INVESTIGATION)
    output["facts"] = ["Supplied observation."] * 9
    with pytest.raises(ValueError):
        validate_output("DOWNTIME", output)
    output["facts"] = ["Supplied observation."]
    output["hypotheses"][0]["evidence"] = ["Supplied evidence."] * 5
    with pytest.raises(ValueError):
        validate_output("DOWNTIME", output)


def test_foundry_retains_real_response_usage(monkeypatch):
    class Client:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def get_openai_client(self, **kwargs):
            return self

        @property
        def responses(self):
            return self

        def create(self, **kwargs):
            assert kwargs["extra_body"]["agent_reference"] == {
                "type": "agent_reference", "name": "downtime-investigation-agent", "version": "1",
            }
            return SimpleNamespace(
                id="offline-usage-fixture", model="test-fixture", created_at=1,
                status="completed", output_text=json.dumps(INVESTIGATION),
                usage=SimpleNamespace(model_dump=lambda **kwargs: {
                    "input_tokens": 123, "output_tokens": 200, "total_tokens": 323,
                }),
            )

    monkeypatch.setitem(sys.modules, "azure.ai.projects",
                        SimpleNamespace(AIProjectClient=lambda **kwargs: Client()))
    result = Foundry(configuration(), None).invoke("DOWNTIME", "offline fixture", 450)
    assert result["attribution"]["usage"] == {
        "input_tokens": 123, "output_tokens": 200, "total_tokens": 323,
    }
    assert result["attribution"]["response_id"] == "offline-usage-fixture"


def test_dataset_kpi_math_and_no_fake_responses():
    data = seed()
    assert [len(data[x]) for x in ("sites", "lines", "machines", "incidents", "telemetry")] == [3, 6, 18, 24, 72]
    assert seed() == data
    assert data["incidents"][0]["severity"] == "critical"
    assert all(not i["investigation"] and not i["plan"] and not i["approval"] for i in data["incidents"])
    for line in data["lines"]:
        result = metrics([line])
        assert result["oee"] == pytest.approx(result["availability"] * result["performance"] * result["quality"])
        assert 0 < result["oee"] < 1
        assert result["output"] <= result["target"]
        assert 0 < result["rejects"] < result["output"]
    assert metrics([])["oee"] == 0


def test_complete_human_flow_persists_and_invalidates_approval(setup):
    client, store, gateway = setup
    base = "/api/incidents/INC-1042"
    assert client.post(base + "/ai/maintenance", json=body(client)).status_code == 409
    assert client.post(base + "/state", json=body(client, state="Action Planned")).status_code == 409
    assert client.post(base + "/ai/investigation", json=body(client)).status_code == 202
    assert latest(client)["investigation"]["content"] == INVESTIGATION
    assert latest(client)["state"] == "Investigating"
    review_body = {"reviewer": "Demo lead", "comment": "Reviewed uncertainty and supplied evidence.", "qualified_review": True}
    assert client.post(base + "/approve", json=body(client, **review_body)).status_code == 409
    assert client.post(base + "/review", json=body(client, **review_body)).status_code == 200
    assert client.post(base + "/ai/maintenance", json=body(client)).status_code == 429
    clear_cooldown(store)
    assert client.post(base + "/ai/maintenance", json=body(client)).status_code == 202
    assert "Possible imbalance" in gateway.calls[1][1]
    assert client.post(base + "/approve", json=body(client, **{**review_body, "qualified_review": False})).status_code == 422
    assert client.post(base + "/approve", json=body(client, **review_body)).status_code == 200
    assert client.post(base + "/state", json=body(client, state="Action Planned")).status_code == 200
    stale_revision = latest(client)["revision"]
    edit = {k: copy.deepcopy(PLAN[k]) for k in ("summary", "actions", "preventive_steps")}
    edit["actions"][0]["priority"] = 0
    assert client.post(base + "/plan", json=body(client, **edit)).status_code == 422
    edit["actions"][0]["priority"] = 2
    assert client.post(base + "/plan", json=body(client, **edit)).status_code == 200
    assert latest(client)["approval"] is None and latest(client)["state"] == "Investigating"
    assert client.post(base + "/notes", json={"revision": stale_revision, "notes": "Never overwrite current edits"}).status_code == 409
    assert client.post(base + "/state", json=body(client, state="Resolved")).status_code == 409
    assert client.post(base + "/approve", json=body(client, **review_body)).status_code == 200
    assert client.post(base + "/review", json=body(client, **review_body)).status_code == 200
    assert latest(client)["approval"] is None
    assert client.post(base + "/approve", json=body(client, **review_body)).status_code == 200
    assert client.post(base + "/state", json=body(client, state="Action Planned")).status_code == 200
    assert client.post(base + "/state", json=body(client, state="Resolved")).status_code == 200
    store.close()
    with TestClient(create_app(SQLiteStore(store.path), gateway)) as restarted:
        assert latest(restarted)["state"] == "Resolved"
        assert latest(restarted)["plan"]["content"]["actions"][0]["priority"] == 2
        activity = restarted.get("/api/state").json()["activity"]
        assert any(x["kind"] == "approval" and x["timestamp"].endswith("Z") for x in activity)
        assert restarted.get("/api/health").json()["storage"] == "sqlite"
        state = restarted.get("/api/state").json()
        assert len(state["jobs"]) == 2
        assert state["ai"]["calls_today"] == 2
        assert state["ai"]["cooldown_seconds"] > 0


def test_client_cannot_supply_approval_results_or_roles_and_request_limits(setup):
    client, _, _ = setup
    base = "/api/incidents/INC-1042"
    for extra in ({"approved": True}, {"actor_role": "admin"}, {"investigation": INVESTIGATION}, {"state": "Resolved"}):
        assert client.post(base + "/notes", json=body(client, notes="Synthetic observation", **extra)).status_code == 422
    assert client.post(base + "/notes", json=body(client, notes="x" * 17000)).status_code == 413
    assert client.post(base + "/notes", json=body(client, notes="Synthetic observation"),
                       headers={"Origin": "https://unrelated.invalid"}).status_code == 403
    assert client.post(base + "/plan", json=body(client, summary="Invalid", actions=[], preventive_steps=[])).status_code == 422


def test_global_reservation_daily_budget_retry_after_and_interruption():
    store, gateway = MemoryStore(), ScriptedGateway()
    jobs = AIJobs(store, gateway)
    job, prompt, tokens = jobs.reserve("INC-1042", "DOWNTIME", 1)
    with pytest.raises(HTTPException) as busy:
        jobs.reserve("INC-1043", "DOWNTIME", 1)
    assert busy.value.status_code == 409
    # A new process must not release another recent revision's reservation.
    AIJobs(store, gateway).recover()
    assert store.state["ai"]["active_job"] == job["id"]
    error = RuntimeError("Do not surface private SDK details")
    error.response = SimpleNamespace(headers={"retry-after": "180"})
    gateway.error = error
    jobs.run(job, prompt, tokens)
    assert len(gateway.calls) == 1
    assert store.state["jobs"][job["id"]]["status"] == "failed"
    assert (date(store.state["ai"]["next_eligible_at"]) - now()).total_seconds() > 175
    assert store.state["incidents"][0]["investigation"] is None
    assert "private SDK" not in store.state["jobs"][job["id"]]["progress"]
    assert retry_seconds({"retry-after": (now() + timedelta(seconds=120)).strftime("%a, %d %b %Y %H:%M:%S GMT")}) > 115
    clear_cooldown(store)
    store.state["ai"]["daily_calls"] = 12
    with pytest.raises(HTTPException) as quota:
        jobs.reserve("INC-1043", "DOWNTIME", 1)
    assert quota.value.status_code == 429
    store.state["ai"]["daily_calls"] = 1
    second, _, _ = jobs.reserve("INC-1043", "DOWNTIME", 1)
    store.state["jobs"][second["id"]]["expires_at"] = iso(now() - timedelta(seconds=1))
    jobs.recover()
    assert store.state["jobs"][second["id"]]["status"] == "interrupted"
    assert len(gateway.calls) == 1


def test_inflight_edits_are_preserved_and_real_result_retained():
    store, gateway = MemoryStore(), ScriptedGateway()
    jobs = AIJobs(store, gateway)
    job, prompt, tokens = jobs.reserve("INC-1042", "DOWNTIME", 1)
    store.state["incidents"][0].update(notes="New human observation", revision=3)
    jobs.run(job, prompt, tokens)
    item = store.state["incidents"][0]
    saved = store.state["jobs"][job["id"]]
    assert item["notes"] == "New human observation" and item["investigation"] is None
    assert saved["status"] == "conflict" and saved["result"]["content"] == INVESTIGATION


def test_token_admission_and_strict_output_contract():
    # No credentials are acquired and no Azure operation occurs in this check.
    gateway = Foundry(configuration(), None)
    data = seed()
    item = data["incidents"][0]
    for key, output in (("DOWNTIME", INVESTIGATION), ("MAINTENANCE", PLAN)):
        if key == "MAINTENANCE":
            item["investigation"] = {"content": INVESTIGATION}
        prompt = prompt_for(data, item, key)
        assert 300 <= gateway.admission(key, prompt) <= 450
        assert validate_output(key, output) == output
    bad = copy.deepcopy(PLAN)
    bad["approved"] = True
    with pytest.raises(Exception):
        validate_output("MAINTENANCE", bad)
    bad = copy.deepcopy(INVESTIGATION)
    bad["facts"] = []
    with pytest.raises(ValueError):
        validate_output("DOWNTIME", bad)
    bad = copy.deepcopy(INVESTIGATION)
    bad["hypotheses"][0]["confidence"] = float("nan")
    with pytest.raises(ValueError):
        validate_output("DOWNTIME", bad)


def test_sqlite_atomic_seed_reopen_and_failed_mutation(database_path):
    stores = [SQLiteStore(database_path) for _ in range(4)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda store: store.ensure(), stores))
    store = stores[0]
    original, revision = store.read()
    assert [len(original[x]) for x in ("sites", "lines", "machines", "incidents", "telemetry")] == [3, 6, 18, 24, 72]
    assert 0 < (date(original["ai"]["next_eligible_at"]) - now()).total_seconds() <= 65

    def fail(state):
        state["incidents"][0]["notes"] = "Must never persist"
        raise HTTPException(422, "Rejected mutation")

    with pytest.raises(HTTPException):
        store.mutate(fail)
    assert store.read() == (original, revision)
    with pytest.raises(StoreUnavailable):
        store.mutate(lambda state: state.update(invalid_number=float("nan")))
    assert store.read() == (original, revision)
    store.mutate(lambda state: state["incidents"][0].update(notes="Saved human edit"))
    saved = store.read()
    reopened = SQLiteStore(database_path)
    reopened.ensure()
    assert reopened.read() == saved
    assert saved[0]["incidents"][0]["notes"] == "Saved human edit"
    assert saved[1] == revision + 1


def test_sqlite_concurrent_updates_and_stale_incident_cas(database_path):
    from backend.domain import incident

    store = SQLiteStore(database_path)
    store.ensure()
    barrier = threading.Barrier(4)

    def update(index):
        other = SQLiteStore(database_path)
        barrier.wait()
        other.mutate(lambda state: state["activity"].append({"parallel_write": index}))

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(update, range(4)))
    state, revision = store.read()
    assert sorted(x["parallel_write"] for x in state["activity"] if "parallel_write" in x) == [0, 1, 2, 3]
    assert revision == 5

    def edit(current):
        target = incident(current, "INC-1042", 1)
        target.update(revision=2, notes="Winning edit")

    barrier = threading.Barrier(2)

    def competing_edit(_):
        barrier.wait()
        try:
            SQLiteStore(database_path).mutate(edit)
            return "saved"
        except Conflict:
            return "stale"

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(competing_edit, range(2))) == ["saved", "stale"]
    assert store.read()[1] == revision + 1
    assert store.read()[0]["incidents"][0]["notes"] == "Winning edit"


def test_sqlite_errors_fail_closed(database_path):
    database_path.parent.mkdir(parents=True)
    database_path.write_text("not a SQLite database", encoding="utf-8")
    with pytest.raises(StoreUnavailable):
        SQLiteStore(database_path).ensure()
    assert database_path.read_text(encoding="utf-8") == "not a SQLite database"


def test_default_app_auto_initializes_sqlite_without_blob_settings(database_path, monkeypatch):
    config = {key: value for key, value in configuration().items() if not key.startswith("AZURE_STORAGE_")}
    database_path.parent.mkdir(parents=True)
    config_path = database_path.parent / "app-config.json"
    config_path.write_text(json.dumps(config), encoding="utf-8")
    monkeypatch.setenv("APP_CONFIG_FILE", str(config_path))
    monkeypatch.setenv("SQLITE_PATH", str(database_path))
    monkeypatch.setenv("AZURE_CREDENTIAL_MODE", "azure_cli")
    # Real factory/SQLite/Foundry client setup, but no token acquisition or inference.
    with TestClient(create_app()) as client:
        assert client.get("/health").json()["storage"] == "sqlite"
        state = client.get("/api/state").json()
        assert len(state["incidents"]) == 24
        assert state["ai"]["cooldown_seconds"] > 0
        assert not state["jobs"]


def test_static_deep_links_missing_api_and_storage_error(setup):
    client, store, _ = setup
    assert client.get("/incidents/INC-1042").status_code == 200
    assert "<div id=\"root\">" in client.get("/factories").text
    assert client.get("/api/missing").status_code == 404
    assert client.get("/missing.js").status_code == 404
    assert "AZURE_CLIENT_ID" not in json.dumps(client.get("/api/state").json())
    def fail():
        raise StoreUnavailable("Persistent storage is unavailable.")
    store.read = fail
    assert client.get("/api/state").status_code == 503
    assert client.get("/health").status_code == 503
