from fastapi.testclient import TestClient

from app.backend.main import create_app
from app.backend.seed.generator import PRIMARY_CASE_ID


def test_aggregate_endpoints_return_case_linkable_records() -> None:
    client = TestClient(create_app())

    investigations = client.get("/api/investigations")
    documents = client.get("/api/documents")
    audit = client.get("/api/audit")

    assert investigations.status_code == 200
    assert documents.status_code == 200
    assert audit.status_code == 200
    assert len(investigations.json()) == 25
    assert len(documents.json()) == 125
    assert len(audit.json()) == 50

    investigation = next(
        item
        for item in investigations.json()
        if item["case_id"] == PRIMARY_CASE_ID
    )
    assert investigation == {
        "case_id": PRIMARY_CASE_ID,
        "company": "Northstar Components AB",
        "case_status": "Investigating",
        "investigation_status": "Not Started",
        "risk_level": "Medium",
        "latest_investigation_at": None,
        "latest_investigation_status": "No investigation activity",
        "recommended_action": None,
    }

    document = documents.json()[0]
    assert {
        "case_id",
        "company",
        "document_id",
        "document_type",
        "name",
        "status",
        "submitted_at",
        "confidence",
    } == set(document)

    event = audit.json()[0]
    assert {
        "case_id",
        "company",
        "event_id",
        "event_type",
        "timestamp",
        "actor",
        "action",
        "description",
    } == set(event)


def test_audit_endpoint_filters_by_case_and_event_type() -> None:
    client = TestClient(create_app())

    response = client.get(
        "/api/audit",
        params={"case_id": PRIMARY_CASE_ID, "event_type": "System"},
    )

    assert response.status_code == 200
    assert len(response.json()) == 2
    assert all(item["case_id"] == PRIMARY_CASE_ID for item in response.json())
    assert all(item["event_type"] == "System" for item in response.json())


def test_completed_investigation_is_reflected_in_aggregate() -> None:
    client = TestClient(create_app())
    completed = client.post(f"/api/cases/{PRIMARY_CASE_ID}/investigate")
    assert completed.status_code == 200

    investigation = next(
        item
        for item in client.get("/api/investigations").json()
        if item["case_id"] == PRIMARY_CASE_ID
    )

    assert investigation["investigation_status"] == "Completed"
    assert investigation["latest_investigation_at"] is not None
    assert investigation["latest_investigation_status"] == (
        "Live investigation assistance completed"
    )
    assert investigation["recommended_action"] == "Request More Information"
