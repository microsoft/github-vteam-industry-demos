import json
from pathlib import Path

from fastapi.testclient import TestClient

from proposal_factory.adapters import InMemoryStorage, LocalAgents, LocalSearch
from proposal_factory.config import Settings
from proposal_factory.dependencies import Services
from proposal_factory.main import create_app
from proposal_factory.models import Document, Opportunity
from proposal_factory.workflow import ProposalWorkflow

ROOT = Path(__file__).resolve().parents[2]


def models(filename: str, model_type):
    return [
        model_type.model_validate(item)
        for item in json.loads((ROOT / "data" / filename).read_text("utf-8"))
    ]


def client() -> TestClient:
    settings = Settings(app_adapter_mode="local")
    storage = InMemoryStorage(
        models("opportunities.json", Opportunity),
        models("meeting-notes.json", Document),
    )
    search = LocalSearch.from_seed_data(ROOT)
    agents = LocalAgents()
    services = Services(
        storage=storage,
        search=search,
        agents=agents,
        workflow=ProposalWorkflow(storage, search, agents, settings),
    )
    app = create_app(settings, services)
    app.state.generation_id_factory = lambda: "gen-api-test"
    return TestClient(app)


def test_health_and_opportunity_routes():
    with client() as test_client:
        assert test_client.get("/api/health").json() == {
            "status": "ok",
            "service": "ai-proposal-factory",
        }
        assert test_client.get("/").status_code == 200
        opportunities = test_client.get("/api/opportunities").json()
        assert len(opportunities) == 8
        opportunity_id = opportunities[0]["id"]
        assert test_client.get(f"/api/opportunities/{opportunity_id}").status_code == 200
        assert test_client.get("/api/opportunities/not-found").status_code == 404


def test_generation_api_returns_complete_proposal():
    with client() as test_client:
        opportunity_id = "opp-cloud-modernization"
        documents = test_client.get(
            f"/api/opportunities/{opportunity_id}/documents"
        ).json()
        response = test_client.post(
            f"/api/opportunities/{opportunity_id}/generate",
            json={"document_ids": [documents[0]["id"]]},
        )
        assert response.status_code == 202
        generation_id = response.json()["generation_id"]

        generation = test_client.get(f"/api/generations/{generation_id}").json()
        assert generation["status"] == "completed"
        proposal = test_client.get(f"/api/proposals/{generation['proposal_id']}").json()
        assert len(proposal["sections"]) == 12
        assert proposal["riskFindings"]


def test_generation_rejects_empty_document_selection():
    with client() as test_client:
        response = test_client.post(
            "/api/opportunities/opp-cloud-modernization/generate",
            json={"document_ids": []},
        )
        assert response.status_code == 422


def generate_proposal(test_client: TestClient) -> dict:
    opportunity_id = "opp-cloud-modernization"
    documents = test_client.get(
        f"/api/opportunities/{opportunity_id}/documents"
    ).json()
    response = test_client.post(
        f"/api/opportunities/{opportunity_id}/generate",
        json={"document_ids": [documents[0]["id"]]},
    )
    generation = test_client.get(
        f"/api/generations/{response.json()['generation_id']}"
    ).json()
    return test_client.get(f"/api/proposals/{generation['proposal_id']}").json()


def test_knowledge_browse_search_filters_and_grounding_resolution():
    with client() as test_client:
        library = test_client.get(
            "/api/knowledge?q=modernization&kind=template&industry=Cross-industry"
        )
        assert library.status_code == 200
        payload = library.json()
        assert [item["id"] for item in payload["items"]] == ["template-02"]
        assert "template" in payload["filters"]["kinds"]
        assert "Cross-industry" in payload["filters"]["industries"]

        proposal = generate_proposal(test_client)
        grounded = [section for section in proposal["sections"] if section["sourceIds"]]
        assert grounded
        assert grounded[0]["sources"]
        assert grounded[0]["sources"][0]["snippet"]
        assert grounded[0]["sources"][0]["sourceBlobName"]


def test_section_edit_regenerate_and_approval_boundaries():
    with client() as test_client:
        proposal = generate_proposal(test_client)
        proposal_id = proposal["id"]
        first, second = proposal["sections"][:2]
        original_second = second["content"]

        blank = test_client.patch(
            f"/api/proposals/{proposal_id}/sections/{first['id']}",
            json={"content": "   "},
        )
        assert blank.status_code == 422

        edited = test_client.patch(
            f"/api/proposals/{proposal_id}/sections/{first['id']}",
            json={"content": "Reviewer-authored executive summary."},
        )
        assert edited.status_code == 200
        assert edited.json()["sections"][0]["content"].startswith("Reviewer-authored")
        assert edited.json()["sections"][0]["status"] == "In Review"

        regenerated = test_client.post(
            f"/api/proposals/{proposal_id}/sections/{first['id']}/regenerate",
            json={"instruction": "Emphasize measurable outcomes"},
        )
        assert regenerated.status_code == 200
        body = regenerated.json()
        assert body["sections"][0]["content"] != edited.json()["sections"][0]["content"]
        assert body["sections"][1]["content"] == original_second
        assert body["sections"][0]["status"] == "In Review"

        early = test_client.post(f"/api/proposals/{proposal_id}/approve")
        assert early.status_code == 409
        for section in body["sections"]:
            response = test_client.post(
                f"/api/proposals/{proposal_id}/sections/{section['id']}/approve"
            )
            assert response.status_code == 200
        approved = test_client.post(f"/api/proposals/{proposal_id}/approve")
        assert approved.status_code == 200
        assert approved.json()["status"] == "Approved"
        assert approved.json()["approvedAt"]

        invalidated = test_client.patch(
            f"/api/proposals/{proposal_id}/sections/{first['id']}",
            json={"content": "Changed after approval."},
        ).json()
        assert invalidated["status"] == "In Review"
        assert invalidated["approvedAt"] is None
        assert invalidated["sections"][0]["status"] == "In Review"
        assert invalidated["sections"][0]["approvedAt"] is None
        event_types = {
            item["eventType"]
            for item in test_client.get(
                f"/api/audit?proposal_id={proposal_id}"
            ).json()["items"]
        }
        assert {
            "section.edited",
            "section.regenerated",
            "section.approved",
            "proposal.approved",
        }.issubset(event_types)


def test_risk_actions_exports_and_audit_history():
    with client() as test_client:
        proposal = generate_proposal(test_client)
        proposal_id = proposal["id"]
        risk = proposal["riskFindings"][0]
        assert risk["relatedSectionIds"]

        acknowledged = test_client.post(
            f"/api/proposals/{proposal_id}/risks/{risk['id']}/acknowledge",
            json={"acknowledged": True, "disposition": "Accepted for mobilisation."},
        )
        assert acknowledged.status_code == 200
        updated_risk = acknowledged.json()["riskFindings"][0]
        assert updated_risk["status"] == "Acknowledged"
        assert updated_risk["disposition"] == "Accepted for mobilisation."

        markdown = test_client.get(
            f"/api/proposals/{proposal_id}/export/markdown"
        )
        assert markdown.status_code == 200
        assert markdown.headers["content-type"].startswith("text/markdown")
        assert "attachment;" in markdown.headers["content-disposition"]
        assert proposal["customer"] in markdown.text
        assert all(section["title"] in markdown.text for section in proposal["sections"])

        pdf = test_client.get(f"/api/proposals/{proposal_id}/export/pdf")
        assert pdf.status_code == 200
        assert pdf.headers["content-type"] == "application/pdf"
        assert pdf.content.startswith(b"%PDF")
        assert len(pdf.content) > 1000

        audit = test_client.get(f"/api/audit?proposal_id={proposal_id}").json()["items"]
        event_types = {item["eventType"] for item in audit}
        assert {
            "generation.started",
            "proposal.generated",
            "risk.acknowledged",
            "proposal.exported_markdown",
            "proposal.exported_pdf",
        }.issubset(event_types)
        assert audit == sorted(audit, key=lambda item: item["createdAt"], reverse=True)
