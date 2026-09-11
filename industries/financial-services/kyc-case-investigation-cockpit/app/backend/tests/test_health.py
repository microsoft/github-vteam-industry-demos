from fastapi.testclient import TestClient

from app.backend.main import create_app


def test_health_endpoint_returns_success() -> None:
    response = TestClient(create_app()).get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "kyc-case-investigation-cockpit",
    }
