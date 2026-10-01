from fastapi.testclient import TestClient

from app.backend.config import Settings
from app.backend.main import create_app
from app.backend.storage import MemoryStateStore


class FakeProcessor:
    def process(self, content: bytes) -> dict:
        assert content.startswith(b"%PDF")
        return {
            "model_id": "mock-layout",
            "processed_at": "2026-09-30T12:00:00+00:00",
            "page_count": 1,
            "content_excerpt": "Legal Name: Northstar Meridian AB",
            "fields": {
                "legal_name": {
                    "value": "Northstar Meridian AB",
                    "evidence": "Legal Name: Northstar Meridian AB",
                    "confidence": 0.99,
                }
            },
        }


def client_and_store():
    store = MemoryStateStore()
    app = create_app(Settings(storage_mode="memory"), store=store, processor=FakeProcessor())
    return TestClient(app), store


def test_health_and_startup_seed():
    client, _ = client_and_store()
    with client:
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert len(client.get("/api/cases").json()["items"]) == 25


def test_case_listing_filters_and_search():
    client, _ = client_and_store()
    with client:
        assert all(item["risk_level"] == "Medium" for item in client.get("/api/cases?risk=Medium").json()["items"])
        assert all(item["status"] == "Approved" for item in client.get("/api/cases?status=Approved").json()["items"])
        items = client.get("/api/cases?search=Northstar").json()["items"]
        assert [item["id"] for item in items] == ["KYC-2026-001"]


def test_primary_case_detail_and_document_mapping():
    client, _ = client_and_store()
    with client:
        case = client.get("/api/cases/KYC-2026-001").json()
        assert case["company"] == "Northstar Meridian AB"
        assert len(case["documents"]) == 6
        assert len(case["ownership"]) == 4
        response = client.post("/api/cases/KYC-2026-001/documents/DOC-001/process")
        assert response.status_code == 200
        document = response.json()
        assert document["processing_status"] == "processed"
        assert document["extraction"]["fields"]["legal_name"]["value"] == "Northstar Meridian AB"


def test_seed_is_deterministic_and_idempotent():
    store = MemoryStateStore()
    first = store.ensure_seeded()
    second = store.ensure_seeded()
    assert first == second
    assert len(first["cases"]) == 25
    assert sum(len(case["documents"]) for case in first["cases"]) == 30


def test_missing_case_returns_404():
    client, _ = client_and_store()
    with client:
        assert client.get("/api/cases/KYC-404").status_code == 404

