import logging
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .api import router
from .config import Settings, get_settings
from .dependencies import Services, build_services

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


def create_app(settings: Settings | None = None, services: Services | None = None) -> FastAPI:
    runtime_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.services = services or build_services(runtime_settings)
        app.state.generation_id_factory = lambda: f"gen-{uuid4().hex[:12]}"
        yield

    app = FastAPI(
        title="AI Proposal Factory",
        version="0.3.0",
        lifespan=lifespan,
    )
    app.include_router(router)
    _mount_frontend(app, runtime_settings.frontend_dist)
    return app


def _mount_frontend(app: FastAPI, dist: Path) -> None:
    assets = dist / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        requested = dist / full_path
        if full_path and requested.is_file():
            return FileResponse(requested)
        index = dist / "index.html"
        if index.exists():
            return FileResponse(index)
        return FileResponse(Path(__file__).parent / "static-placeholder.html")


app = create_app()
