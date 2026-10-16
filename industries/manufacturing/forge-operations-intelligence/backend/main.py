import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from backend.ai import AIJobs, CONTRACTS, DAILY_LIMIT, Foundry, date
from backend.config import ROOT, configuration, credential_for
from backend.domain import NotesEdit, PlanEdit, Review, Revision, Transition, edit_plan, event, incident, invalidate, iso, metrics, now, review, transition
from backend.store import SQLiteStore, Conflict, StoreUnavailable

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logging.getLogger("azure").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("openai").setLevel(logging.WARNING)


def create_app(store=None, gateway=None, static_dir=None):
    @asynccontextmanager
    async def lifespan(app):
        credential = None
        if store is None:
            config = configuration()
            credential = credential_for(config)
            app.state.store = SQLiteStore(config["SQLITE_PATH"])
            app.state.gateway = Foundry(config, credential)
        else:
            app.state.store, app.state.gateway = store, gateway
        # Fail closed on database failures; never substitute in-memory state.
        await run_in_threadpool(app.state.store.ensure)
        app.state.jobs = AIJobs(app.state.store, app.state.gateway)
        await run_in_threadpool(app.state.jobs.recover)
        yield
        if store is None:
            app.state.store.close()
            credential.close()

    app = FastAPI(title="Manufacturing Operations · Synthetic Demo", lifespan=lifespan,
                  docs_url=None, redoc_url=None)

    @app.middleware("http")
    async def limits(request: Request, call_next):
        if request.method in ("POST", "PUT", "PATCH"):
            if request.headers.get("origin") and request.headers["origin"] != f"{request.url.scheme}://{request.url.netloc}":
                return JSONResponse({"detail": "Use the same-origin demo application."}, status_code=403)
            size, chunks = 0, []
            async for chunk in request.stream():
                size += len(chunk)
                if size > 16384:
                    return JSONResponse({"detail": "Request too large. Keep demo inputs under 16 KB."}, status_code=413)
                chunks.append(chunk)
            request._body = b"".join(chunks)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Cache-Control"] = "no-store" if request.url.path.startswith("/api") else "no-cache"
        response.headers["Content-Security-Policy"] = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'"
        return response

    @app.exception_handler(StoreUnavailable)
    async def storage_error(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=503)

    @app.exception_handler(Conflict)
    async def conflict_error(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=409)

    @app.get("/health")
    @app.get("/api/health")
    def health():
        app.state.store.read()
        return {"status": "ok", "storage": "sqlite", "synthetic": True, "time": iso(),
                "ai": "Connectivity is established only by an actual successful call."}

    @app.get("/api/state")
    def get_state():
        app.state.jobs.recover()
        state, _ = app.state.store.read()
        public = {key: state[key] for key in (
            "synthetic", "snapshot_at", "sites", "lines", "machines", "telemetry", "incidents", "activity", "jobs",
        )}
        ai = state["ai"]
        public["ai"] = {
            "active_job": ai["active_job"], "next_eligible_at": ai["next_eligible_at"],
            "cooldown_seconds": max(0, int((date(ai["next_eligible_at"]) - now()).total_seconds()) + 1) if ai["next_eligible_at"] else 0,
            "calls_today": ai["daily_calls"] if ai["daily_date"] == now().date().isoformat() else 0,
            "daily_limit": DAILY_LIMIT,
            "agents": [{"key": key, "name": definition["display_name"], "version": "1",
                        "last_call": next((x for x in reversed(list(state["jobs"].values())) if x["key"] == key), None)}
                       for key, definition in CONTRACTS.items()],
        }
        public["metrics"] = metrics(state["lines"])
        public["server_time"] = iso()
        return public

    @app.get("/api/jobs/{ident}")
    def get_job(ident: str):
        app.state.jobs.recover()
        state, _ = app.state.store.read()
        if ident not in state["jobs"]:
            raise HTTPException(404, "AI job not found.")
        return state["jobs"][ident]

    @app.post("/api/incidents/{ident}/notes")
    def notes(ident: str, data: NotesEdit):
        def change(state):
            item = incident(state, ident, data.revision)
            item["notes"] = data.notes
            invalidate(item)
            item["investigation_review"] = None
            item["revision"] += 1
            event(state, ident, "notes", "Operator notes updated; review and approval invalidated.")
            return item
        return app.state.store.mutate(change)

    @app.post("/api/incidents/{ident}/plan")
    def plan(ident: str, data: PlanEdit):
        def change(state):
            result = edit_plan(state, ident, data)
            result["plan"]["edited"] = True
            return result
        return app.state.store.mutate(change)

    @app.post("/api/incidents/{ident}/review")
    def investigation_review(ident: str, data: Review):
        return app.state.store.mutate(lambda state: review(state, ident, data, "investigation"))

    @app.post("/api/incidents/{ident}/approve")
    def approve(ident: str, data: Review):
        return app.state.store.mutate(lambda state: review(state, ident, data, "plan"))

    @app.post("/api/incidents/{ident}/state")
    def update_state(ident: str, data: Transition):
        return app.state.store.mutate(lambda state: transition(state, ident, data))

    @app.post("/api/incidents/{ident}/ai/{kind}", status_code=202)
    def request_ai(ident: str, kind: str, data: Revision, background: BackgroundTasks):
        if kind not in ("investigation", "maintenance"):
            raise HTTPException(404, "Unknown agent operation.")
        key = "DOWNTIME" if kind == "investigation" else "MAINTENANCE"
        job, prompt, tokens = app.state.jobs.reserve(ident, key, data.revision)
        background.add_task(app.state.jobs.run, job, prompt, tokens)
        return job

    web = Path(static_dir or os.getenv("FRONTEND_DIST", str(ROOT / "frontend" / "dist"))).resolve()
    if (web / "assets").exists():
        app.mount("/assets", StaticFiles(directory=web / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "API endpoint not found.")
        candidate = (web / path).resolve()
        if web in candidate.parents and candidate.is_file():
            return FileResponse(candidate)
        if "." in Path(path).name:
            raise HTTPException(404, "Static asset not found.")
        if not (web / "index.html").is_file():
            raise HTTPException(503, "Frontend build is missing. Run npm run build in frontend.")
        return FileResponse(web / "index.html")

    return app


app = create_app()
