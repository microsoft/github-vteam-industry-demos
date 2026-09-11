import time

from fastapi.testclient import TestClient

from app.backend.main import create_app
from app.backend.providers.base import DocumentProcessingError
from app.backend.seed.generator import PRIMARY_CASE_ID


def test_case_api_supports_primary_flow() -> None:
    client = TestClient(create_app())

    cases_response = client.get("/api/cases", params={"risk": "Medium"})
    assert cases_response.status_code == 200
    assert len(cases_response.json()) > 0

    case_response = client.get(f"/api/cases/{PRIMARY_CASE_ID}")
    assert case_response.status_code == 200
    assert case_response.json()["summary"] is None

    document_id = case_response.json()["documents"][0]["id"]
    extraction_response = client.post(
        f"/api/cases/{PRIMARY_CASE_ID}/documents/{document_id}/extract"
    )
    assert extraction_response.status_code == 200
    extraction = extraction_response.json()
    assert extraction["provider_mode"] == "deterministic-demo"
    assert extraction["document_id"] == document_id
    assert extraction["facts"][0]["source_document"] == (
        "Certificate of Incorporation"
    )
    content_response = client.get(
        f"/api/cases/{PRIMARY_CASE_ID}/documents/{document_id}/content"
    )
    assert content_response.status_code == 200
    assert "SYNTHETIC DOCUMENT" in content_response.text

    investigation_response = client.post(
        f"/api/cases/{PRIMARY_CASE_ID}/investigate"
    )
    assert investigation_response.status_code == 200
    assert (
        investigation_response.json()["summary"]["recommended_action"]
        == "Request More Information"
    )

    before_decision = client.get(f"/api/cases/{PRIMARY_CASE_ID}").json()
    assert before_decision["status"] == "Investigating"

    decision_response = client.post(
        f"/api/cases/{PRIMARY_CASE_ID}/decision",
        json={
            "action": "Request More Information",
            "reason": "Validate ownership evidence and resolve the synthetic name similarity.",
            "analyst": "Alex Rivera",
        },
    )
    assert decision_response.status_code == 200
    decided = decision_response.json()
    assert decided["status"] == "Awaiting Information"
    assert decided["audit"][-1]["actor_type"] == "Human Analyst"
    assert decided["audit"][-1]["action"] == (
        "Decision recorded: Request More Information"
    )


def test_case_api_rejects_blank_reason_and_unknown_case() -> None:
    client = TestClient(create_app())

    blank = client.post(
        f"/api/cases/{PRIMARY_CASE_ID}/decision",
        json={"action": "Approve", "reason": "   ", "analyst": "Alex Rivera"},
    )
    missing = client.get("/api/cases/DOES-NOT-EXIST")
    missing_document = client.post(
        f"/api/cases/{PRIMARY_CASE_ID}/documents/DOES-NOT-EXIST/extract"
    )

    assert blank.status_code == 422
    assert missing.status_code == 404
    assert missing_document.status_code == 404


def test_investigation_job_supports_polling_and_preserves_status() -> None:
    client = TestClient(create_app())
    started = client.post(
        f"/api/cases/{PRIMARY_CASE_ID}/investigations"
    )
    assert started.status_code == 200
    job = started.json()
    for _ in range(50):
        response = client.get(
            f"/api/cases/{PRIMARY_CASE_ID}/investigations/{job['id']}"
        )
        job = response.json()
        if job["status"] != "Running":
            break
        time.sleep(0.01)

    assert job["status"] == "Succeeded"
    assert len(job["completed_stages"]) == 7
    assert job["result"]["summary"]["recommended_action"] == (
        "Request More Information"
    )
    case = client.get(f"/api/cases/{PRIMARY_CASE_ID}").json()
    assert case["status"] == "Investigating"


def test_document_failure_is_retryable_and_preserves_case() -> None:
    application = create_app()
    before = application.state.demo_state.get_case(PRIMARY_CASE_ID)

    class FailingProvider:
        mode = "live-azure"
        model_id = "prebuilt-layout"

        def extract_document(self, document):
            raise DocumentProcessingError(
                "Document processing is temporarily unavailable. Please retry."
            )

    application.state.document_extraction_service.provider = FailingProvider()
    client = TestClient(application)
    document_id = before.documents[0].id

    response = client.post(
        f"/api/cases/{PRIMARY_CASE_ID}/documents/{document_id}/extract"
    )
    after = application.state.demo_state.get_case(PRIMARY_CASE_ID)

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Document processing is temporarily unavailable. Please retry."
    )
    assert after == before
