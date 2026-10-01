import json
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

base = sys.argv[1].rstrip("/")
case_id = "KYC-2026-001"
reason = (
    "Additional evidence is required to validate the beneficial ownership structure "
    "and resolve the potential screening similarity."
)


def get(path: str):
    return json.load(urlopen(f"{base}{path}", timeout=60))


def post(path: str, payload: dict):
    request = Request(
        f"{base}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        return json.load(urlopen(request, timeout=120))
    except HTTPError as exc:
        raise RuntimeError(f"{path} returned {exc.code}: {exc.read().decode()}") from exc


health = get("/api/health")
cases = get("/api/cases")["items"]
primary = get(f"/api/cases/{case_id}")
homepage = urlopen(base, timeout=60).read().decode()
assert health == {"status": "ok", "phase": 3, "storage": "azure"}
assert len(cases) == 25
assert primary["company"] == "Northstar Meridian AB"
assert "KYC Case Investigation Cockpit" in homepage

try:
    previous = get(f"/api/cases/{case_id}/investigation")
except HTTPError as exc:
    if exc.code != 404:
        raise
    previous = None
if previous and previous["status"] in {"completed", "completed_with_warnings"}:
    investigation = previous
else:
    started = post(
        f"/api/cases/{case_id}/investigate",
        {"retry_failed": bool(previous and previous["status"] == "failed")},
    )
    for retry_number in range(8):
        for _ in range(450):
            investigation = get(f"/api/cases/{case_id}/investigation")
            if investigation["status"] not in {"queued", "running"}:
                break
            time.sleep(2)
        else:
            raise TimeoutError("Investigation did not complete within fifteen minutes.")
        if investigation["status"] != "failed":
            break
        started = post(f"/api/cases/{case_id}/investigate", {"retry_failed": True})

assert investigation["status"] in {"completed", "completed_with_warnings"}, investigation
assert all(stage["status"] in {"completed", "completed_with_warning"} for stage in investigation["stages"])
assert len(investigation["agent_runs"]) == 4
assert {run["agent_name"] for run in investigation["agent_runs"]} == {
    "kyc-document-entity-extractor",
    "kyc-completeness-validator",
    "kyc-risk-investigator",
    "kyc-analyst-summary",
}
assert all(run["agent_version"] == "1" and run["response_id"] for run in investigation["agent_runs"])
assert all(document["processing_status"] == "processed" for document in get(f"/api/cases/{case_id}")["documents"])
assert investigation["profile"]["beneficial_owners"]
assert investigation["completeness"]["findings"]
match = next(
    finding
    for finding in investigation["risk"]["findings"]
    if finding["category"] == "potential_screening_similarity"
)
assert match["potential_match"] is True
assert match["analyst_review_required"] is True
assert "not a confirmed match" in match["description"]
assert "EV-SEARCH-SYN-WATCH-001" in match["evidence_refs"]
assert investigation["summary"]["advisory_only"] is True
assert investigation["summary"]["recommended_next_action"] == "Request More Information"
assert all(
    investigation["summary"][field]
    for field in (
        "customer_overview",
        "ownership_summary",
        "evidence_summary",
        "risk_summary",
        "open_questions",
        "recommendation_rationale",
    )
)
assert get(f"/api/cases/{case_id}")["status"] in {"Ready for Decision", "Awaiting Information"}

decision = post(
    f"/api/cases/{case_id}/decision",
    {
        "decision_id": f"DEC-LIVE-{investigation['investigation_id']}",
        "action": "Request More Information",
        "reason": reason,
        "analyst_name": primary["assigned_analyst"],
        "investigation_id": investigation["investigation_id"],
    },
)
assert decision["new_status"] == "Awaiting Information"
persisted_case = get(f"/api/cases/{case_id}")
persisted_investigation = get(f"/api/cases/{case_id}/investigation")
assert persisted_case["status"] == "Awaiting Information"
assert persisted_investigation["investigation_id"] == investigation["investigation_id"]
events = get(f"/api/cases/{case_id}/audit")["items"]
assert [event["occurred_at"] for event in events] == sorted(event["occurred_at"] for event in events)
assert any(
    event["event_type"] == "analyst_decision_recorded"
    and event["actor_type"] == "Human"
    and event["detail"] == reason
    and event["metadata"]["analyst_name"] == primary["assigned_analyst"]
    and event["occurred_at"]
    for event in events
)
assert any(event["event_type"] == "investigation_completed" and event["actor_type"] == "AI" for event in events)

print(
    json.dumps(
        {
            "health": health,
            "homepage": "ok",
            "case_count": len(cases),
            "primary_case": primary["company"],
            "investigation_id": investigation["investigation_id"],
            "investigation_status": investigation["status"],
            "stages": [stage["status"] for stage in investigation["stages"]],
            "agents": investigation["agent_runs"],
            "document_intelligence_consumed": True,
            "beneficial_owner_count": len(investigation["profile"]["beneficial_owners"]),
            "completeness_finding_count": len(investigation["completeness"]["findings"]),
            "potential_match": {
                "title": match["title"],
                "evidence_refs": match["evidence_refs"],
                "confirmed": False,
            },
            "recommended_next_action": investigation["summary"]["recommended_next_action"],
            "decision": decision,
            "persisted_status": persisted_case["status"],
            "persisted_investigation_id": persisted_investigation["investigation_id"],
            "audit_event_count": len(events),
        },
        indent=2,
    )
)
