from dataclasses import replace
from pathlib import Path

from fastapi.testclient import TestClient

from app.backend.config import Settings
from app.backend.main import create_app
from app.backend.storage import JsonStore


def test_complete_api_workflow(tmp_path: Path, settings: Settings) -> None:
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("<div id='root'></div>")
    app = create_app(static_dir, JsonStore(settings.data_path), settings)

    with TestClient(app) as client:
        opportunities = client.get("/api/opportunities").json()
        opportunity = opportunities[0]
        documents = client.get(
            f"/api/opportunities/{opportunity['id']}/documents"
        ).json()
        assert documents

        started = client.post(
            f"/api/opportunities/{opportunity['id']}/generate"
        )
        assert started.status_code == 202
        job = client.get(f"/api/generation/{started.json()['id']}").json()
        assert job["status"] == "completed"

        proposal = client.get(f"/api/proposals/{job['proposal_id']}").json()
        section_id = proposal["sections"][0]["id"]
        saved = client.patch(
            f"/api/proposals/{proposal['id']}/sections/{section_id}",
            json={"content": "Reviewed through the API."},
        )
        assert saved.status_code == 200
        assert saved.json()["sections"][0]["content"] == "Reviewed through the API."

        assert client.post(
            f"/api/proposals/{proposal['id']}/sections/{section_id}/approve"
        ).status_code == 200
        assert client.post(f"/api/proposals/{proposal['id']}/approve").status_code == 200
        assert client.get(
            f"/api/proposals/{proposal['id']}/export/markdown"
        ).status_code == 200
        pdf = client.get(f"/api/proposals/{proposal['id']}/export/pdf")
        assert pdf.status_code == 200
        assert pdf.content.startswith(b"%PDF")
        assert client.get(
            f"/api/audit?opportunity_id={opportunity['id']}"
        ).json()


def test_created_opportunity_persists_and_generates_with_uploaded_notes(
    tmp_path: Path, settings: Settings
) -> None:
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("<div id='root'></div>")
    data_path = tmp_path / "persistent-store.json"
    persistent_settings = replace(settings, data_path=str(data_path))
    payload = {
        "customer": "Blue Yonder Health",
        "name": "Connected Care Transformation",
        "industry": "Healthcare",
        "estimated_value": "€620K",
        "delivery_duration": "28 weeks",
        "business_problem": "Care teams work across disconnected systems.",
        "expected_outcomes": ["Faster care coordination", "Improved patient experience"],
        "scope": "Discovery, target design, and implementation roadmap.",
        "stakeholders": ["Chief Digital Officer", "Clinical Operations"],
        "constraints": ["Synthetic data only", "Six-month initial release"],
        "target_timeline": "Start in Q1",
        "budget_assumptions": "Blended delivery team within the stated estimate.",
        "notes": "Prioritize measurable adoption outcomes.",
    }

    with TestClient(
        create_app(static_dir, JsonStore(data_path), persistent_settings)
    ) as client:
        created_response = client.post("/api/opportunities", json=payload)
        assert created_response.status_code == 201
        created = created_response.json()
        assert created["status"] == "Discovery"
        assert created["proposal_progress"] == 0
        assert created["proposal_id"] is None
        assert client.get(f"/api/opportunities/{created['id']}").json()["name"] == payload["name"]

    with TestClient(
        create_app(static_dir, JsonStore(data_path), persistent_settings)
    ) as client:
        reopened = client.get(f"/api/opportunities/{created['id']}")
        assert reopened.status_code == 200
        assert reopened.json()["customer"] == payload["customer"]

        uploaded = client.post(
            f"/api/opportunities/{created['id']}/documents",
            files={"file": ("discovery-notes.md", b"# Discovery\nPrioritize care coordination.", "text/markdown")},
        )
        assert uploaded.status_code == 201
        assert uploaded.json()["selected"] is True

        started = client.post(f"/api/opportunities/{created['id']}/generate")
        assert started.status_code == 202
        job = client.get(f"/api/generation/{started.json()['id']}").json()
        assert job["status"] == "completed"

        proposal = client.get(f"/api/proposals/{job['proposal_id']}")
        assert proposal.status_code == 200
        assert len(proposal.json()["sections"]) == 12
        assert client.get(
            f"/api/audit?opportunity_id={created['id']}"
        ).json()
