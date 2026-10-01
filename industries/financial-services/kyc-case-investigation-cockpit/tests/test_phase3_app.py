from copy import deepcopy

from fastapi.testclient import TestClient

from app.backend.config import Settings
from app.backend.main import create_app
from app.backend.storage import MemoryStateStore
from scripts.phase3_contract import (
    completeness_output_fixture,
    profile_fixture,
    risk_output_fixture,
)


class FakeProcessor:
    def process(self, content: bytes) -> dict:
        assert content.startswith(b"%PDF")
        return {
            "model_id": "mock-layout",
            "processed_at": "2026-09-30T12:00:00+00:00",
            "page_count": 1,
            "content_excerpt": (
                "Legal Name: Northstar Meridian AB\n"
                "Registration Number: 559999-4107\n"
                "Beneficial Owners: Elara Voss 36%; Soren Vale 28%"
            ),
            "fields": {
                "legal_name": {
                    "value": "Northstar Meridian AB",
                    "evidence": "Legal Name: Northstar Meridian AB",
                    "confidence": 0.99,
                },
                "registration_number": {
                    "value": "559999-4107",
                    "evidence": "Registration Number: 559999-4107",
                    "confidence": 0.98,
                },
                "beneficial_owners": {
                    "value": "Elara Voss 36%; Soren Vale 28%",
                    "evidence": "Beneficial Owners: Elara Voss 36%; Soren Vale 28%",
                    "confidence": 0.96,
                },
            },
        }


class FakeAgents:
    def __init__(self, fail_once: str | None = None) -> None:
        self.fail_once = fail_once
        self.calls: list[str] = []

    def invoke(self, agent_name: str, payload: dict) -> tuple[dict, str]:
        self.calls.append(agent_name)
        if self.fail_once == agent_name:
            self.fail_once = None
            raise RuntimeError("planned agent failure")
        outputs = {
            "kyc-document-entity-extractor": profile_fixture(),
            "kyc-completeness-validator": completeness_output_fixture(),
            "kyc-risk-investigator": risk_output_fixture(),
            "kyc-analyst-summary": {
                "schema_version": "1.0",
                "customer_overview": "Northstar Meridian AB is a fictional Swedish business applicant.",
                "ownership_summary": "Elara Voss is recorded as a 36% beneficial owner.",
                "evidence_summary": "Submitted documents and synthetic screening evidence were reviewed.",
                "risk_summary": "A potential synthetic name similarity requires analyst verification.",
                "open_questions": [
                    "Can additional beneficial ownership evidence be supplied?"
                ],
                "recommended_next_action": "Request More Information",
                "recommendation_rationale": (
                    "Additional ownership evidence and identity attributes are required."
                ),
                "evidence_refs": [
                    "EV-DOC-003-OWNER",
                    "EV-SEARCH-SYN-WATCH-001",
                ],
                "limitations": ["All supplied data and screening records are synthetic."],
                "advisory_only": True,
            },
        }
        return deepcopy(outputs[agent_name]), f"response-{len(self.calls)}"


class FakeSearch:
    def search(self, subject: str) -> list[dict]:
        if subject != "Elara Voss":
            return []
        return [
            {
                "record_id": "SYN-WATCH-001",
                "record_type": "watchlist_style",
                "display_name": "Elara Vos",
                "aliases": ["E. Vos"],
                "countries": ["Finland"],
                "date_of_birth": "",
                "entity_type": "person",
                "category": "Potential name similarity",
                "synthetic_risk_description": (
                    "Synthetic potential similarity only; analyst verification required."
                ),
                "@search.score": 4.47,
            }
        ]


def phase3_client(
    store: MemoryStateStore | None = None,
    agents: FakeAgents | None = None,
) -> tuple[TestClient, MemoryStateStore, FakeAgents]:
    state_store = store or MemoryStateStore()
    agent_gateway = agents or FakeAgents()
    app = create_app(
        Settings(storage_mode="memory"),
        store=state_store,
        processor=FakeProcessor(),
        agents=agent_gateway,
        screening=FakeSearch(),
    )
    return TestClient(app), state_store, agent_gateway


def run_investigation(client: TestClient) -> dict:
    response = client.post(
        "/api/cases/KYC-2026-001/investigate",
        json={"retry_failed": False},
    )
    assert response.status_code == 202
    return client.get("/api/cases/KYC-2026-001/investigation").json()


def test_complete_orchestration_grounding_and_persistence():
    client, store, agents = phase3_client()
    with client:
        investigation = run_investigation(client)
        assert investigation["status"] == "completed"
        assert investigation["percent_complete"] == 100
        assert [item["agent_name"] for item in investigation["agent_runs"]] == [
            "kyc-document-entity-extractor",
            "kyc-completeness-validator",
            "kyc-risk-investigator",
            "kyc-analyst-summary",
        ]
        assert len(agents.calls) == 4
        assert all(
            document["processing_status"] == "processed"
            for document in client.get("/api/cases/KYC-2026-001").json()["documents"]
        )
        risk = client.get("/api/cases/KYC-2026-001/risks").json()
        match = next(
            finding
            for finding in risk["findings"]
            if finding["category"] == "potential_screening_similarity"
        )
        assert match["potential_match"] is True
        assert match["analyst_review_required"] is True
        assert "not a confirmed match" in match["description"]
        evidence_ids = {item["evidence_id"] for item in investigation["evidence"]}
        assert set(match["evidence_refs"]) <= evidence_ids
        assert client.get("/api/cases/KYC-2026-001/summary").json()[
            "recommended_next_action"
        ] == "Request More Information"

    restarted, _, _ = phase3_client(store=store)
    with restarted:
        persisted = restarted.get("/api/cases/KYC-2026-001/investigation").json()
        assert persisted["investigation_id"] == investigation["investigation_id"]
        assert persisted["summary"]["advisory_only"] is True


def test_partial_failure_preserves_checkpoint_and_retry_skips_success():
    agents = FakeAgents(fail_once="kyc-completeness-validator")
    client, _, _ = phase3_client(agents=agents)
    with client:
        failed = run_investigation(client)
        assert failed["status"] == "failed"
        assert failed["profile"] is not None
        assert failed["completeness"] is None
        assert failed["stages"][1]["status"] == "completed"
        assert failed["stages"][2]["status"] == "failed"

        response = client.post(
            "/api/cases/KYC-2026-001/investigate",
            json={"retry_failed": True},
        )
        assert response.status_code == 202
        completed = client.get("/api/cases/KYC-2026-001/investigation").json()
        assert completed["status"] == "completed"
        assert completed["attempt"] == 2
        assert agents.calls.count("kyc-document-entity-extractor") == 1
        assert agents.calls.count("kyc-completeness-validator") == 2


def test_decision_validation_state_transition_and_audit():
    client, _, _ = phase3_client()
    with client:
        investigation = run_investigation(client)
        investigation_id = investigation["investigation_id"]
        short = client.post(
            "/api/cases/KYC-2026-001/decision",
            json={
                "action": "Request More Information",
                "reason": "Too short",
                "analyst_name": "Elin Berg (fictional)",
                "investigation_id": investigation_id,
            },
        )
        assert short.status_code == 422
        stale = client.post(
            "/api/cases/KYC-2026-001/decision",
            json={
                "action": "Approve",
                "reason": "The evidence has been reviewed by the analyst.",
                "analyst_name": "Elin Berg (fictional)",
                "investigation_id": "INV-STALE",
            },
        )
        assert stale.status_code == 409

        payload = {
            "decision_id": "DEC-DEMO-001",
            "action": "Request More Information",
            "reason": (
                "Additional evidence is required to validate the beneficial ownership "
                "structure and resolve the potential screening similarity."
            ),
            "analyst_name": "Elin Berg (fictional)",
            "investigation_id": investigation_id,
        }
        response = client.post("/api/cases/KYC-2026-001/decision", json=payload)
        assert response.status_code == 200
        decision = response.json()
        assert decision["previous_status"] == "Ready for Decision"
        assert decision["new_status"] == "Awaiting Information"
        assert client.post("/api/cases/KYC-2026-001/decision", json=payload).json() == decision
        assert client.get("/api/cases/KYC-2026-001").json()["status"] == "Awaiting Information"
        events = client.get("/api/cases/KYC-2026-001/audit").json()["items"]
        assert [event["occurred_at"] for event in events] == sorted(
            event["occurred_at"] for event in events
        )
        assert any(
            event["event_type"] == "analyst_decision_recorded"
            and event["actor_type"] == "Human"
            and payload["reason"] in event["detail"]
            for event in events
        )
        assert any(
            event["event_type"] == "stage_completed" and event["actor_type"] == "AI"
            for event in events
        )
