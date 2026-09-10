from pathlib import Path

from fastapi.testclient import TestClient

from app.backend.config import Settings
from app.backend.main import create_app
from app.backend.storage import JsonStore


def test_health_and_startup_seed_exact_contract(
    tmp_path: Path, settings: Settings
) -> None:
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("<h1>AI Proposal Factory</h1>")
    app = create_app(static_dir, JsonStore(settings.data_path), settings)

    with TestClient(app) as client:
        response = client.get("/api/health")
        opportunities = client.get("/api/opportunities")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["content-type"] == "application/json"
    assert len(opportunities.json()) == 9


def test_spa_fallback_and_api_404(tmp_path: Path, settings: Settings) -> None:
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("<h1>AI Proposal Factory</h1>")
    client = TestClient(create_app(static_dir, JsonStore(settings.data_path), settings))

    assert client.get("/opportunities/demo").status_code == 200
    assert client.get("/api/not-a-route").status_code == 404
