from contextlib import asynccontextmanager
import logging
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, status
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .ai import AgentGateway, AzureSearchGateway, FoundryAgentGateway, ScreeningGateway
from .config import Settings
from .documents import DocumentProcessor
from .investigation import InvestigationService
from .seed import PRIMARY_CASE_ID
from .service import CaseService
from .storage import StateStore, create_store

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("kyc-cockpit")


class InvestigateRequest(BaseModel):
    retry_failed: bool = False


class DecisionRequest(BaseModel):
    action: str
    reason: str = Field(min_length=10)
    analyst_name: str = Field(min_length=1)
    investigation_id: str
    decision_id: str | None = None


class UnavailableAgentGateway:
    def invoke(self, agent_name: str, payload: dict) -> tuple[dict, str]:
        raise RuntimeError("Microsoft Foundry agents are not configured.")


class UnavailableScreeningGateway:
    def search(self, subject: str) -> list[dict]:
        raise RuntimeError("Azure AI Search is not configured.")


def create_app(
    settings: Settings | None = None,
    store: StateStore | None = None,
    processor: DocumentProcessor | None = None,
    agents: AgentGateway | None = None,
    screening: ScreeningGateway | None = None,
) -> FastAPI:
    app_settings = settings or Settings()
    app_store = store or create_store(app_settings)
    app_processor = processor or DocumentProcessor(app_settings)
    app_agents = agents or (
        FoundryAgentGateway(app_settings)
        if app_settings.foundry_project_endpoint
        else UnavailableAgentGateway()
    )
    app_screening = screening or (
        AzureSearchGateway(app_settings)
        if app_settings.azure_search_endpoint
        else UnavailableScreeningGateway()
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.case_service = CaseService(app_store, app_processor)
        app.state.investigation_service = InvestigationService(
            app_store,
            app.state.case_service,
            app_agents,
            app_screening,
            app_settings,
        )
        state = app_store.ensure_seeded()
        app.state.investigation_service.recover_interrupted()
        logger.info("Demo seed ready with %s synthetic cases", len(state["cases"]))
        if app_settings.process_primary_on_startup:
            primary = next(case for case in state["cases"] if case["id"] == PRIMARY_CASE_ID)
            document = primary["documents"][0]
            if document["processing_status"] != "processed":
                try:
                    app.state.case_service.process_document(PRIMARY_CASE_ID, document["id"])
                except Exception:
                    logger.exception("Primary document startup processing failed; retry remains available through the API.")
        yield

    app = FastAPI(title="KYC Case Investigation Cockpit", version="3.0", lifespan=lifespan)

    @app.get("/api/health")
    def health():
        return {"status": "ok", "phase": 3, "storage": app_settings.storage_mode}

    @app.get("/api/cases")
    def list_cases(
        status: str | None = Query(default=None),
        risk: str | None = Query(default=None),
        search: str | None = Query(default=None),
    ):
        return {"items": app.state.case_service.list_cases(status=status, risk=risk, search=search)}

    @app.get("/api/cases/{case_id}")
    def get_case(case_id: str):
        case = app.state.case_service.get_case(case_id)
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        return case

    @app.get("/api/cases/{case_id}/documents")
    def get_documents(case_id: str):
        case = app.state.case_service.get_case(case_id)
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        return {"items": case["documents"]}

    @app.get("/api/cases/{case_id}/documents/{document_id}/content")
    def get_document(case_id: str, document_id: str):
        case = app.state.case_service.get_case(case_id)
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        document = next((item for item in case["documents"] if item["id"] == document_id), None)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        return Response(app_store.document_bytes(document["blob_name"]), media_type="application/pdf")

    @app.post("/api/cases/{case_id}/documents/{document_id}/process")
    def process_document(case_id: str, document_id: str):
        try:
            return app.state.case_service.process_document(case_id, document_id)
        except KeyError:
            raise HTTPException(status_code=404, detail="Case or document not found") from None
        except Exception as exc:
            logger.exception("Document processing failed")
            raise HTTPException(
                status_code=502,
                detail="Document processing failed. Retry is available.",
            ) from exc

    @app.post("/api/cases/{case_id}/investigate", status_code=status.HTTP_202_ACCEPTED)
    def investigate(case_id: str, request: InvestigateRequest, background_tasks: BackgroundTasks):
        try:
            result = app.state.investigation_service.start(case_id, request.retry_failed)
        except KeyError:
            raise HTTPException(status_code=404, detail="Case not found") from None
        if result["status"] == "queued":
            background_tasks.add_task(
                app.state.investigation_service.run,
                result["investigation_id"],
            )
        return result

    @app.get("/api/cases/{case_id}/investigation")
    def get_investigation(case_id: str):
        try:
            result = app.state.investigation_service.get(case_id)
        except KeyError:
            raise HTTPException(status_code=404, detail="Case not found") from None
        if not result:
            raise HTTPException(status_code=404, detail="No investigation found")
        return result

    def investigation_output(case_id: str, key: str):
        if not app.state.case_service.get_case(case_id):
            raise HTTPException(status_code=404, detail="Case not found")
        result = app.state.investigation_service.output(case_id, key)
        if result is None:
            raise HTTPException(status_code=404, detail=f"No {key} result found")
        return result

    @app.get("/api/cases/{case_id}/profile")
    def get_profile(case_id: str):
        return investigation_output(case_id, "profile")

    @app.get("/api/cases/{case_id}/ownership")
    def get_ownership(case_id: str):
        profile = investigation_output(case_id, "profile")
        return {
            "beneficial_owners": profile["beneficial_owners"],
            "ownership_relationships": profile["ownership_relationships"],
        }

    @app.get("/api/cases/{case_id}/completeness")
    def get_completeness(case_id: str):
        return investigation_output(case_id, "completeness")

    @app.get("/api/cases/{case_id}/risks")
    def get_risks(case_id: str):
        return investigation_output(case_id, "risk")

    @app.get("/api/cases/{case_id}/summary")
    def get_summary(case_id: str):
        return investigation_output(case_id, "summary")

    @app.post("/api/cases/{case_id}/decision")
    def submit_decision(case_id: str, request: DecisionRequest):
        if request.action not in {"Approve", "Request More Information", "Escalate"}:
            raise HTTPException(status_code=422, detail="Unsupported decision action")
        if len(request.reason.strip()) < 10 or not request.analyst_name.strip():
            raise HTTPException(
                status_code=422,
                detail="Analyst name and a meaningful reason are required",
            )
        try:
            return app.state.investigation_service.decide(
                case_id,
                request.investigation_id,
                request.action,
                request.reason,
                request.analyst_name,
                request.decision_id,
            )
        except KeyError:
            raise HTTPException(status_code=404, detail="Case not found") from None
        except ValueError as exc:
            raise HTTPException(
                status_code=409,
                detail="The investigation is stale or not ready for a human decision.",
            ) from exc

    @app.get("/api/cases/{case_id}/audit")
    def get_audit(case_id: str):
        try:
            return {"items": app.state.investigation_service.audit(case_id)}
        except KeyError:
            raise HTTPException(status_code=404, detail="Case not found") from None

    frontend = Path(__file__).resolve().parents[1] / "frontend" / "dist"
    if frontend.exists():
        assets = frontend / "assets"
        if assets.exists():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def frontend_fallback(path: str):
            requested = frontend / path
            if path and requested.is_file():
                return FileResponse(requested)
            return FileResponse(frontend / "index.html")

    return app


app = create_app()
