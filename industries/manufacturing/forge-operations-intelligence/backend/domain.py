from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from backend.store import Conflict


def now():
    return datetime.now(timezone.utc)


def iso(value=None):
    return (value or now()).isoformat().replace("+00:00", "Z")


def event(state, incident_id, kind, message, actor="Demo operator", **extra):
    state["activity"].append({"id": uuid4().hex, "timestamp": iso(), "incident_id": incident_id,
                              "kind": kind, "message": message, "actor": actor, **extra})


def incident(state, incident_id, revision=None):
    item = next((x for x in state["incidents"] if x["id"] == incident_id), None)
    if item is None:
        raise HTTPException(404, "Incident not found.")
    if revision is not None and item["revision"] != revision:
        raise Conflict("This incident changed while you were reviewing it. Refresh before saving; your draft was not applied.")
    return item


def invalidate(item):
    item["approval"] = None
    if item["state"] in ("Action Planned", "Resolved"):
        item["state"] = "Investigating"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class Revision(StrictModel):
    revision: int = Field(ge=1)


class Action(StrictModel):
    priority: int = Field(ge=1, le=99, strict=True)
    action: str = Field(min_length=3, max_length=350)
    owner_role: str = Field(min_length=2, max_length=80)
    urgency: str = Field(pattern="^(immediate_review|planned)$")
    expected_benefit: str = Field(min_length=3, max_length=250)
    safety_checks: list[str] = Field(min_length=1, max_length=4)


class PlanEdit(Revision):
    summary: str = Field(min_length=3, max_length=500)
    actions: list[Action] = Field(min_length=1, max_length=4)
    preventive_steps: list[str] = Field(min_length=1, max_length=4)


class NotesEdit(Revision):
    notes: str = Field(min_length=3, max_length=1200)


class Review(Revision):
    reviewer: str = Field(min_length=2, max_length=60)
    qualified_review: bool
    comment: str = Field(min_length=3, max_length=400)


class Transition(Revision):
    state: str = Field(pattern="^(Open|Investigating|Action Planned|Resolved)$")


def validate_lines(values):
    if any(not value.strip() or len(value) > 250 for value in values):
        raise HTTPException(422, "Safety and prevention entries must contain 1–250 characters.")


def require_idle_incident(state, ident):
    active = state["ai"]["active_job"]
    if active and state["jobs"][active]["incident_id"] == ident:
        raise HTTPException(409, "Wait for this incident's running AI request before reviewing, approving or advancing its state.")


def edit_plan(state, ident, data):
    item = incident(state, ident, data.revision)
    if not item["plan"]:
        raise HTTPException(409, "Generate a real maintenance plan before editing actions.")
    for action in data.actions:
        validate_lines(action.safety_checks)
    validate_lines(data.preventive_steps)
    item["plan"]["content"].update(data.model_dump(exclude={"revision"}))
    invalidate(item)
    item["revision"] += 1
    event(state, ident, "edit", "Maintenance actions saved; any previous approval was invalidated.")
    return item


def review(state, ident, data, kind):
    item = incident(state, ident, data.revision)
    require_idle_incident(state, ident)
    if not data.qualified_review:
        raise HTTPException(422, "Explicit qualified human review acknowledgement is required.")
    if kind == "investigation":
        if not item["investigation"]:
            raise HTTPException(409, "There is no saved investigation to review.")
        invalidate(item)
        item["investigation_review"] = {"reviewer": data.reviewer, "comment": data.comment, "timestamp": iso()}
    else:
        if not item["plan"] or not item["investigation_review"]:
            raise HTTPException(409, "Review the saved investigation and generate a plan before approving it.")
        item["approval"] = {"reviewer": data.reviewer, "comment": data.comment, "timestamp": iso(),
                            "plan_revision": item["revision"]}
    item["revision"] += 1
    event(state, ident, "review" if kind == "investigation" else "approval",
          f"Human {'investigation review' if kind == 'investigation' else 'plan approval'} recorded (anonymous demo self-attestation).",
          actor=data.reviewer)
    return item


def transition(state, ident, data):
    item = incident(state, ident, data.revision)
    require_idle_incident(state, ident)
    allowed = {"Open": "Investigating", "Investigating": "Action Planned", "Action Planned": "Resolved"}
    if allowed.get(item["state"]) != data.state:
        raise HTTPException(409, "Use the next state: Open → Investigating → Action Planned → Resolved.")
    if data.state in ("Action Planned", "Resolved") and (not item["plan"] or not item["approval"]):
        raise HTTPException(409, "Explicit human approval of the current maintenance plan is required first.")
    before = item["state"]
    item["state"] = data.state
    item["revision"] += 1
    event(state, ident, "state", f"{before} → {data.state}.")
    return item


def metrics(lines):
    planned = sum(x["planned_minutes"] for x in lines)
    running = sum(x["planned_minutes"] - x["downtime_minutes"] for x in lines)
    output = sum(x["output"] for x in lines)
    ideal_output = sum((x["planned_minutes"] - x["downtime_minutes"]) * x["ideal_rate"] for x in lines)
    good = sum(x["output"] - x["rejects"] for x in lines)
    a, p, q = running / planned if planned else 0, output / ideal_output if ideal_output else 0, good / output if output else 0
    return {"availability": a, "performance": p, "quality": q, "oee": a * p * q,
            "downtime": planned - running, "output": output, "target": sum(x["target"] for x in lines),
            "rejects": output - good}
