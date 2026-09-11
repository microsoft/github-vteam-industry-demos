from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.backend.api.aggregates import router as aggregates_router
from app.backend.api.cases import router as cases_router
from app.backend.api.health import router as health_router
from app.backend.providers.factory import build_providers
from app.backend.services.cases import CaseService
from app.backend.services.documents import DocumentExtractionService
from app.backend.services.foundry_diagnostics import FoundryDiagnosticsService
from app.backend.services.investigation import InvestigationService
from app.backend.storage.factory import build_state

FRONTEND_DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"


def create_app() -> FastAPI:
    application = FastAPI(
        title="KYC Case Investigation Cockpit",
        version="0.1.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    state = build_state()
    document_provider, reasoning_provider = build_providers()
    application.state.demo_state = state
    application.state.case_service = CaseService(state)
    application.state.document_extraction_service = DocumentExtractionService(
        state, document_provider
    )
    application.state.foundry_diagnostics_service = FoundryDiagnosticsService(
        state, document_provider, reasoning_provider
    )
    application.state.investigation_service = InvestigationService(
        state,
        document_provider,
        reasoning_provider,
    )
    application.include_router(health_router)
    application.include_router(aggregates_router)
    application.include_router(cases_router)

    if FRONTEND_DIST.is_dir():
        application.mount(
            "/",
            StaticFiles(directory=FRONTEND_DIST, html=True),
            name="frontend",
        )
    else:

        @application.get("/")
        def frontend_not_built() -> JSONResponse:
            return JSONResponse(
                {
                    "message": "Frontend assets are not built.",
                    "health": "/api/health",
                }
            )

    return application


app = create_app()
