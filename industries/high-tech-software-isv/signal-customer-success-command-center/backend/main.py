import hashlib
import json
import os
import re
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from backend.foundry import AbuseGuard, AIError, Foundry
from backend.store import Conflict, Store


def context_hash(account):
    return hashlib.sha256(json.dumps(account, sort_keys=True).encode()).hexdigest()


class Mutation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=1, strict=True)


class PlanEdit(Mutation):
    subject: str = Field(max_length=300)
    body: str = Field(max_length=12000)
    notes: str = Field(max_length=6000)


class CustomerEdit(Mutation):
    notes: str = Field(max_length=4000)


class ActionEdit(Mutation):
    status: Literal["accepted", "completed"]


def markdown_text(value):
    # Downloads are text, but escape raw HTML and Markdown control characters
    # for users opening them in a Markdown renderer.
    text = str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return re.sub(r"([\\`*_{}\[\]()#!|])", r"\\\1", text)


def export_markdown(state):
    plan = state["plan"]
    if not plan:
        raise HTTPException(409, "Generate a retention plan before exporting.")
    output, edits = plan["output"], state["edits"]
    esc = markdown_text
    lines = [f'# Success plan · {esc(state["account"]["name"])}', "",
             "SYNTHETIC DATA · PUBLIC ANONYMOUS DEMO · SQLite ephemeral; may be lost on restart.",
             "AI suggestions require human review. No messages are sent and no business actions are executed.",
             "", f'Agent: {esc(plan["agent"])} · Response: {esc(plan["response_id"])}',
             f'Generated: {esc(plan["at"])} · Saved revision: {state["revision"]}',
             f'Based on risk response: {esc(plan["risk_response_id"])}', "", "## Recommended actions", ""]
    for i, action in enumerate(output["recommended_actions"]):
        status = state["action_states"].get(str(i), {}).get("status", "recommended")
        lines += [f'- **{esc(action["priority"])} · {esc(status)}** — {esc(action["action"])}',
                  f'  Owner: {esc(action["owner_role"])}; timeframe: {esc(action["suggested_timeframe"])}',
                  f'  Rationale: {esc(action["rationale"])}']
    lines += ["", "## 30-day plan"]
    for stage in output["plan_30_days"]:
        lines += ["", f'### {esc(stage["period"])}', esc(stage["goal"])]
        lines += [f"- {esc(item)}" for item in stage["actions"]]
    lines += ["", "## Human plan notes", esc(edits.get("notes", "")), "", "## Renewal talking points"]
    lines += [f"- {esc(item)}" for item in output["renewal_talking_points"]]
    email = output["draft_outreach_email"]
    lines += ["", "## Outreach draft — not sent", esc(edits.get("subject", email["subject"])), "",
              esc(edits.get("body", email["body"])), "", "## Limitations"]
    lines += [f"- {esc(item)}" for item in output["limitations"]]
    return "\n".join(lines) + "\n"


def create_app(db_path=None, ai_service=None):
    store = Store(db_path or os.getenv("SQLITE_PATH", "/app/data/command-center.sqlite3"))
    guard = AbuseGuard()

    @asynccontextmanager
    async def lifespan(app):
        store.initialize()
        app.state.ai = ai_service or Foundry()
        yield
        if not ai_service:
            await app.state.ai.close()

    app = FastAPI(title="Signal / Customer Success Command Center", lifespan=lifespan,
                  docs_url=None, redoc_url=None)
    app.state.store = store

    @app.middleware("http")
    async def demo_headers(request, call_next):
        if request.method in ("POST", "PATCH", "PUT"):
            length = request.headers.get("content-length")
            if length and (not length.isdigit() or int(length) > 50000):
                return JSONResponse({"detail": "Request body exceeds the demo limit."}, status_code=413)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(Conflict)
    async def conflict_handler(request, error):
        return JSONResponse({"detail": "This account changed while you were working. Reload the account "
                                      "and review the latest version before retrying."}, status_code=409)

    @app.exception_handler(AIError)
    async def ai_handler(request, error):
        return JSONResponse({"detail": error.message}, status_code=error.status)

    @app.exception_handler(sqlite3.OperationalError)
    async def db_handler(request, error):
        return JSONResponse({"detail": "SQLite is temporarily unavailable. Retry shortly; contact the demo "
                                      "operator if this persists."}, status_code=503)

    def get(account_id):
        state = store.get(account_id)
        if state is None:
            raise HTTPException(404, "Customer account not found.")
        return state

    @app.get("/api/health")
    async def health():
        ai = app.state.ai
        return {"status": "ok", "account_count": len(store.list()),
                "persistence": {"engine": "sqlite", "ephemeral": True, "path": str(store.path),
                                "notice": "State may be lost on container restart or replacement."},
                "agents": {"configured": True, "api_version": "v1", "model": "gpt-4.1-mini",
                           "risk": "customer-churn-risk-analyst:1", "retention": "retention-strategy-advisor:1",
                           "auth_mode": ai.mode, "runtime_verified_this_process": ai.verified,
                           "notice": "Configuration is not proof of deployed identity invocation."},
                "demo": {"synthetic": True, "anonymous": True, "workers_required": 1, "replicas_required": 1,
                         "ai_guard": "2 concurrent, 25s/account, 40/hour and 150/day; process-local, not a cost cap"}}

    @app.get("/api/accounts")
    async def accounts():
        return [{"account": s["account"], "health": s["health"], "revision": s["revision"]} for s in store.list()]

    @app.get("/api/accounts/{account_id}")
    async def account(account_id: str):
        return get(account_id)

    @app.patch("/api/accounts/{account_id}")
    async def update_account(account_id: str, body: CustomerEdit):
        get(account_id)
        def update(state):
            state["account"]["notes"] = body.notes
        return store.change(account_id, body.revision, update, "Account notes saved",
                            "Human context updated. Earlier AI evidence may now be stale.")

    @app.post("/api/accounts/{account_id}/risk")
    async def risk(account_id: str, body: Mutation):
        state = get(account_id)
        if state["revision"] != body.revision:
            raise Conflict()
        guard.reserve(account_id)
        try:
            context = dict(state["account"])
            context["renewal_in_days"] = (
                datetime.fromisoformat(context["renewal_date"]).date() -
                datetime.now(timezone.utc).date()).days
            result = await app.state.ai.run("churnRisk", context)
            result["context_hash"] = context_hash(state["account"])
            def update(current):
                current["risk"] = result
            return store.change(account_id, state["revision"], update, "Foundry risk analysis completed",
                                f'{result["agent"]} · {result["response_id"]}')
        finally:
            guard.release(account_id)

    @app.post("/api/accounts/{account_id}/plan")
    async def plan(account_id: str, body: Mutation):
        state = get(account_id)
        if state["revision"] != body.revision:
            raise Conflict()
        if not state["risk"]:
            raise HTTPException(409, "Run the real risk analyst first. A stored analysis is required.")
        if state["risk"]["context_hash"] != context_hash(state["account"]):
            raise HTTPException(409, "Account context changed. Run the risk analyst again before creating a plan.")
        guard.reserve(account_id)
        try:
            context = dict(state["account"])
            context["renewal_in_days"] = (
                datetime.fromisoformat(context["renewal_date"]).date() -
                datetime.now(timezone.utc).date()).days
            result = await app.state.ai.run("retentionStrategy", context, state["risk"])
            result["context_hash"] = context_hash(state["account"])
            def update(current):
                current["plan"] = result
                current["edits"] = {}
                current["action_states"] = {}
            return store.change(account_id, state["revision"], update, "Foundry retention plan completed",
                                f'{result["agent"]} · {result["response_id"]}; human review required')
        finally:
            guard.release(account_id)

    @app.patch("/api/accounts/{account_id}/plan")
    async def edit_plan(account_id: str, body: PlanEdit):
        get(account_id)
        def update(state):
            if not state["plan"]:
                raise HTTPException(409, "No retention plan exists yet.")
            state["edits"] = {"subject": body.subject, "body": body.body, "notes": body.notes}
        return store.change(account_id, body.revision, update, "Plan edits saved",
                            "Human-authored notes and outreach draft saved; no email was sent.")

    @app.patch("/api/accounts/{account_id}/actions/{index}")
    async def edit_action(account_id: str, index: int, body: ActionEdit):
        get(account_id)
        def update(state):
            if not state["plan"]:
                raise HTTPException(409, "No retention plan exists yet.")
            if not 0 <= index < len(state["plan"]["output"]["recommended_actions"]):
                raise HTTPException(404, "Recommended action not found.")
            prior = state["action_states"].get(str(index), {})
            current = prior.get("status", "recommended")
            if (current, body.status) not in (("recommended", "accepted"), ("accepted", "completed")):
                raise HTTPException(409, "Accept an action before completing it; completed actions are final.")
            at = datetime.now(timezone.utc).isoformat()
            state["action_states"][str(index)] = {**prior, "status": body.status, f"{body.status}_at": at}
        return store.change(account_id, body.revision, update, f"Action {body.status}",
                            f"Recommendation {index + 1} marked {body.status} by a demo visitor. No external action executed.")

    @app.get("/api/accounts/{account_id}/export")
    async def export(account_id: str):
        state = get(account_id)
        return Response(export_markdown(state), media_type="text/markdown; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{state["account"]["id"]}-success-plan.md"'})

    frontend = Path(os.getenv("FRONTEND_DIST", str(Path(__file__).resolve().parents[1] / "frontend" / "dist")))
    if (frontend / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=frontend / "assets"), name="assets")

    @app.get("/{path:path}")
    async def spa(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "API route not found.")
        if not (frontend / "index.html").is_file():
            raise HTTPException(503, "Frontend not built. Run npm run build in frontend.")
        return FileResponse(frontend / "index.html")

    return app


app = create_app()
