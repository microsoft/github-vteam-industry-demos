#!/usr/bin/env python3
"""Focused final live Phase 3 smoke test against the public Container App."""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from typing import Any
from urllib.parse import urljoin

import requests


TERMINAL_STATUSES = {"completed", "failed"}
EXPECTED_TITLES = [
    "Executive Summary",
    "Customer Challenges",
    "Proposed Solution",
    "Scope",
    "Deliverables",
    "Delivery Approach",
    "Milestones",
    "Assumptions",
    "Dependencies",
    "Risks",
    "Success Criteria",
    "Next Steps",
]
EXPECTED_AUDIT_EVENTS = {
    "generation.started",
    "proposal.generated",
    "section.edited",
    "section.regenerated",
    "section.approved",
    "proposal.approved",
    "risk.acknowledged",
    "proposal.exported_markdown",
    "proposal.exported_pdf",
}


def request(method: str, url: str, *, timeout: float = 30, **kwargs: Any) -> requests.Response:
    response = requests.request(method, url, timeout=timeout, **kwargs)
    response.raise_for_status()
    return response


def request_json(method: str, url: str, *, timeout: float = 30, **kwargs: Any) -> Any:
    return request(method, url, timeout=timeout, **kwargs).json()


def items(payload: Any) -> list[dict[str, Any]]:
    return payload if isinstance(payload, list) else payload.get("items", [])


def select_opportunity(opportunities: list[dict[str, Any]]) -> dict[str, Any]:
    preferred = [
        item
        for item in opportunities
        if "cloud" in f"{item.get('name', '')} {item.get('industry', '')}".lower()
    ]
    if preferred:
        return preferred[0]
    if not opportunities:
        raise AssertionError("No seeded opportunities were returned.")
    return opportunities[0]


def section_map(proposal: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {section["id"]: section for section in proposal["sections"]}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.getenv("APPLICATION_URL"))
    parser.add_argument("--timeout-seconds", type=int, default=900)
    parser.add_argument("--poll-seconds", type=float, default=2.0)
    args = parser.parse_args()
    if not args.base_url:
        parser.error("--base-url or APPLICATION_URL is required")
    base_url = args.base_url.rstrip("/")

    health = request_json("GET", f"{base_url}/api/health")
    assert health == {"status": "ok", "service": "ai-proposal-factory"}, health
    homepage = request("GET", base_url).text
    assert "AI Proposal Factory" in homepage
    script_match = re.search(r'<script[^>]+src="([^"]+)"', homepage)
    assert script_match, "Frontend bundle was not referenced."
    bundle = request("GET", urljoin(f"{base_url}/", script_match.group(1))).text
    assert "Demo environment" in bundle and "synthetic data only" in bundle
    assert "Knowledge Library" in bundle and "Audit history" in bundle

    opportunities = items(request_json("GET", f"{base_url}/api/opportunities"))
    assert len(opportunities) >= 8, f"Expected at least 8 opportunities, got {len(opportunities)}."
    opportunity = select_opportunity(opportunities)
    opportunity_id = opportunity.get("id") or opportunity.get("opportunityId")
    detail = request_json("GET", f"{base_url}/api/opportunities/{opportunity_id}")
    assert detail.get("businessProblem") and detail.get("expectedOutcomes")
    documents = items(
        request_json("GET", f"{base_url}/api/opportunities/{opportunity_id}/documents")
    )
    document_ids = [
        item.get("id") or item.get("documentId")
        for item in documents
        if item.get("id") or item.get("documentId")
    ]
    assert document_ids, "No seeded meeting notes were available."

    library = request_json("GET", f"{base_url}/api/knowledge?top=100")
    library_items = items(library)
    assert len(library_items) >= 37, len(library_items)
    assert "template" in library["filters"]["kinds"]
    assert any(item["kind"] == "template" for item in library_items)
    search_results = items(request_json("GET", f"{base_url}/api/knowledge?q=modernization"))
    assert search_results and any("modern" in json.dumps(item).lower() for item in search_results)
    filtered = items(
        request_json(
            "GET",
            f"{base_url}/api/knowledge?kind=template&industry=Cross-industry",
        )
    )
    assert filtered and all(
        item["kind"] == "template" and item["industry"] == "Cross-industry"
        for item in filtered
    )

    generation = request_json(
        "POST",
        f"{base_url}/api/opportunities/{opportunity_id}/generate",
        json={"document_ids": document_ids},
    )
    generation_id = generation.get("generation_id") or generation.get("generationId")
    assert generation_id, generation
    deadline = time.monotonic() + args.timeout_seconds
    observed: list[str] = []
    status_payload: dict[str, Any] = {}
    while time.monotonic() < deadline:
        status_payload = request_json("GET", f"{base_url}/api/generations/{generation_id}")
        current = str(status_payload.get("status"))
        if not observed or observed[-1] != current:
            observed.append(current)
            print(f"generation status: {current}")
        if current in TERMINAL_STATUSES:
            break
        time.sleep(args.poll_seconds)
    else:
        raise TimeoutError(f"Generation {generation_id} did not finish in time.")
    assert status_payload.get("status") == "completed", status_payload
    proposal_id = status_payload.get("proposal_id") or status_payload.get("proposalId")
    proposal = request_json("GET", f"{base_url}/api/proposals/{proposal_id}")
    assert [section["title"] for section in proposal["sections"]] == EXPECTED_TITLES
    assert proposal.get("requirementsAnalysis")
    assert proposal.get("riskFindings")
    grounded = [
        section
        for section in proposal["sections"]
        if section.get("sourceIds") and section.get("sources")
    ]
    assert grounded, "No section exposed resolved grounding references."
    for section in grounded:
        assert all(
            source.get("title") and source.get("sourceBlobName") for source in section["sources"]
        )

    early_approval = requests.post(f"{base_url}/api/proposals/{proposal_id}/approve", timeout=30)
    assert early_approval.status_code == 409, early_approval.text
    assert "all twelve" in early_approval.text.lower()

    edit_section = proposal["sections"][0]
    edited_content = (
        edit_section["content"].rstrip()
        + "\n\nReviewer validation: customer outcomes and governance checkpoints confirmed."
    )
    edited = request_json(
        "PATCH",
        f"{base_url}/api/proposals/{proposal_id}/sections/{edit_section['id']}",
        json={"content": edited_content},
    )
    assert section_map(edited)[edit_section["id"]]["content"] == edited_content
    assert section_map(edited)[edit_section["id"]]["status"] == "In Review"
    persisted = request_json("GET", f"{base_url}/api/proposals/{proposal_id}")
    assert section_map(persisted)[edit_section["id"]]["content"] == edited_content

    regen_section = persisted["sections"][1]
    before_regen = section_map(persisted)
    regenerated = request_json(
        "POST",
        f"{base_url}/api/proposals/{proposal_id}/sections/{regen_section['id']}/regenerate",
        timeout=180,
        json={
            "instruction": (
                "Make this section more outcome-led and concise while retaining grounded facts."
            )
        },
    )
    after_regen = section_map(regenerated)
    assert after_regen[regen_section["id"]]["content"] != before_regen[regen_section["id"]]["content"]
    assert after_regen[regen_section["id"]]["status"] == "In Review"
    for section_id, original in before_regen.items():
        if section_id != regen_section["id"]:
            assert after_regen[section_id]["content"] == original["content"], section_id
    assert regenerated["status"] == "In Review"
    persisted = request_json("GET", f"{base_url}/api/proposals/{proposal_id}")
    assert section_map(persisted)[regen_section["id"]]["content"] == after_regen[regen_section["id"]]["content"]

    risk = persisted["riskFindings"][0]
    acknowledged = request_json(
        "POST",
        f"{base_url}/api/proposals/{proposal_id}/risks/{risk['id']}/acknowledge",
        json={
            "acknowledged": True,
            "disposition": "Owner assigned; validate mitigation at the next governance checkpoint.",
        },
    )
    acknowledged_risk = next(item for item in acknowledged["riskFindings"] if item["id"] == risk["id"])
    assert acknowledged_risk["status"] == "Acknowledged"
    assert acknowledged_risk["acknowledgedAt"] and acknowledged_risk["disposition"]
    persisted = request_json("GET", f"{base_url}/api/proposals/{proposal_id}")
    persisted_risk = next(item for item in persisted["riskFindings"] if item["id"] == risk["id"])
    assert persisted_risk["status"] == "Acknowledged"
    assert all(
        finding.get("severity")
        and finding.get("category")
        and finding.get("description")
        and finding.get("mitigationOrQuestion")
        for finding in persisted["riskFindings"]
    )
    assert persisted["requirementsAnalysis"].get("openQuestions") is not None
    assert persisted["requirementsAnalysis"].get("missingInformation") is not None

    for section in persisted["sections"]:
        persisted = request_json(
            "POST",
            f"{base_url}/api/proposals/{proposal_id}/sections/{section['id']}/approve",
        )
    assert all(section["status"] == "Approved" for section in persisted["sections"])
    approved = request_json("POST", f"{base_url}/api/proposals/{proposal_id}/approve")
    assert approved["status"] == "Approved" and approved.get("approvedAt")
    approved = request_json("GET", f"{base_url}/api/proposals/{proposal_id}")
    assert approved["status"] == "Approved"

    markdown = request("GET", f"{base_url}/api/proposals/{proposal_id}/export/markdown")
    assert markdown.headers["content-type"].lower().startswith("text/markdown")
    assert len(markdown.content) > 1000
    assert approved["customer"] in markdown.text and approved["opportunityName"] in markdown.text
    assert all(title in markdown.text for title in EXPECTED_TITLES)
    assert "Sources" in markdown.text
    assert ".md" in markdown.headers.get("content-disposition", "")

    pdf = request("GET", f"{base_url}/api/proposals/{proposal_id}/export/pdf", timeout=120)
    assert pdf.headers["content-type"].lower().startswith("application/pdf")
    assert pdf.content.startswith(b"%PDF") and len(pdf.content) > 5000
    assert ".pdf" in pdf.headers.get("content-disposition", "")

    audit = items(request_json("GET", f"{base_url}/api/audit?proposal_id={proposal_id}"))
    event_types = {event["eventType"] for event in audit}
    assert EXPECTED_AUDIT_EVENTS.issubset(event_types), sorted(event_types)
    created = [event["createdAt"] for event in audit]
    assert created == sorted(created, reverse=True), "Audit history is not newest first."

    evidence = {
        "applicationUrl": base_url,
        "opportunities": len(opportunities),
        "meetingNotes": len(documents),
        "knowledgeItems": len(library_items),
        "knowledgeKinds": library["filters"]["kinds"],
        "generationId": generation_id,
        "observedGenerationStates": observed,
        "proposalId": proposal_id,
        "sections": len(approved["sections"]),
        "groundedSections": len(grounded),
        "riskFindings": len(approved["riskFindings"]),
        "acknowledgedRiskId": risk["id"],
        "proposalStatus": approved["status"],
        "markdownBytes": len(markdown.content),
        "pdfBytes": len(pdf.content),
        "auditEventCount": len(audit),
        "auditEventTypes": sorted(event_types),
    }
    print("FINAL PHASE 3 SMOKE PASS")
    print(json.dumps(evidence, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
