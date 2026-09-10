from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse

from app.backend.api.routes import create_api_router
from app.backend.config import Settings
from app.backend.container import create_services
from app.backend.storage import Store


STATIC_DIR = Path(__file__).parent / "static"


def create_app(
    static_dir: Path = STATIC_DIR,
    store: Store | None = None,
    settings: Settings | None = None,
) -> FastAPI:
    active_settings = settings or Settings.from_environment()
    services = create_services(active_settings, store)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        services.seeds.seed()
        yield

    application = FastAPI(
        title="AI Proposal Factory",
        version="1.0.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    application.state.services = services
    application.include_router(create_api_router(services))

    @application.get("/{path:path}", include_in_schema=False)
    async def serve_spa(path: str):
        if path == "api" or path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)

        requested_file = (static_dir / path).resolve()
        try:
            requested_file.relative_to(static_dir.resolve())
        except ValueError:
            return JSONResponse({"detail": "Not Found"}, status_code=404)

        if path and requested_file.is_file():
            return FileResponse(requested_file)

        index_file = static_dir / "index.html"
        if index_file.is_file():
            return FileResponse(index_file)

        return JSONResponse(
            {"detail": "Frontend assets have not been built."},
            status_code=503,
        )

    return application


app = create_app()
