from __future__ import annotations

from io import BytesIO
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from .exports import export_filename, markdown_export, pdf_export
from .models import (
    AuditEvent,
    GenerateRequest,
    GenerateResponse,
    RiskActionRequest,
    SectionRegenerateRequest,
    SectionUpdateRequest,
    utc_now,
)

router = APIRouter(prefix="/api")


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-proposal-factory"}


@router.get("/opportunities")
async def list_opportunities(request: Request):
    return await request.app.state.services.storage.list_opportunities()


@router.get("/opportunities/{opportunity_id}")
async def get_opportunity(opportunity_id: str, request: Request):
    opportunity = await request.app.state.services.storage.get_opportunity(opportunity_id)
    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    return opportunity


@router.get("/opportunities/{opportunity_id}/documents")
async def list_documents(opportunity_id: str, request: Request):
    opportunity = await request.app.state.services.storage.get_opportunity(opportunity_id)
    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    return await request.app.state.services.storage.list_documents(opportunity_id)


@router.post(
    "/opportunities/{opportunity_id}/generate",
    response_model=GenerateResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def generate(
    opportunity_id: str,
    payload: GenerateRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    storage = request.app.state.services.storage
    opportunity = await storage.get_opportunity(opportunity_id)
    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    generation_id = request.app.state.generation_id_factory()
    from .models import GenerationJob

    job = GenerationJob(
        id=generation_id,
        opportunityId=opportunity_id,
        status="queued",
        progressMessage="Proposal generation is queued.",
    )
    await storage.save_job(job)
    background_tasks.add_task(
        request.app.state.services.workflow.run, job, payload.document_ids
    )
    return GenerateResponse(generation_id=generation_id, status="queued")


@router.get("/generations/{generation_id}")
async def get_generation(generation_id: str, request: Request):
    job = await request.app.state.services.storage.get_job(generation_id)
    if not job:
        raise HTTPException(status_code=404, detail="Generation not found")
    return {
        "generation_id": job.id,
        "opportunity_id": job.opportunityId,
        "status": job.status,
        "progress_message": job.progressMessage,
        "proposal_id": job.proposalId,
        "error": job.error,
        "created_at": job.createdAt,
        "updated_at": job.updatedAt,
    }


@router.get("/knowledge")
async def knowledge(
    request: Request,
    q: str | None = None,
    kind: str | None = None,
    industry: str | None = None,
    top: int = Query(default=50, ge=1, le=100),
):
    search = request.app.state.services.search
    items = await search.browse(q, kind, industry, top)
    all_items = await search.browse(top=100)
    return {
        "items": items,
        "filters": {
            "kinds": sorted({item.kind for item in all_items}),
            "industries": sorted({item.industry for item in all_items}),
        },
    }


@router.get("/proposals/{proposal_id}")
async def get_proposal(proposal_id: str, request: Request):
    proposal = await _proposal_or_404(request, proposal_id)
    await _ensure_generation_audit(request, proposal)
    return await _proposal_response(request, proposal)


@router.patch("/proposals/{proposal_id}/sections/{section_id}")
async def update_section(
    proposal_id: str,
    section_id: str,
    payload: SectionUpdateRequest,
    request: Request,
):
    proposal = await _proposal_or_404(request, proposal_id)
    section = _section_or_404(proposal, section_id)
    section.content = payload.content
    _invalidate_section_and_proposal(proposal, section)
    await request.app.state.services.storage.save_proposal(proposal)
    await _audit(
        request,
        proposal,
        "section.edited",
        f"{section.title} was edited.",
        section_id=section.id,
    )
    return await _proposal_response(request, proposal)


@router.post("/proposals/{proposal_id}/sections/{section_id}/regenerate")
async def regenerate_section(
    proposal_id: str,
    section_id: str,
    payload: SectionRegenerateRequest,
    request: Request,
):
    proposal = await _proposal_or_404(request, proposal_id)
    original = _section_or_404(proposal, section_id)
    try:
        regenerated = await request.app.state.services.workflow.regenerate_section(
            proposal, original, payload.instruction
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Unable to regenerate {original.title}: {exc}"
        ) from exc
    regenerated.title = original.title
    regenerated.order = original.order
    regenerated.status = "In Review"
    regenerated.approvedAt = None
    regenerated.updatedAt = utc_now()
    proposal.sections = [
        regenerated if item.id == section_id else item for item in proposal.sections
    ]
    proposal.status = "In Review"
    proposal.approvedAt = None
    proposal.updatedAt = utc_now()
    await request.app.state.services.storage.save_proposal(proposal)
    await _audit(
        request,
        proposal,
        "section.regenerated",
        f"{original.title} was regenerated.",
        section_id=section_id,
        details={"instruction": payload.instruction} if payload.instruction else None,
    )
    return await _proposal_response(request, proposal)


@router.post("/proposals/{proposal_id}/sections/{section_id}/approve")
async def approve_section(proposal_id: str, section_id: str, request: Request):
    proposal = await _proposal_or_404(request, proposal_id)
    section = _section_or_404(proposal, section_id)
    if section.status != "Approved":
        section.status = "Approved"
        section.approvedAt = utc_now()
        section.updatedAt = section.approvedAt
        proposal.status = "In Review"
        proposal.approvedAt = None
        proposal.updatedAt = section.approvedAt
        await request.app.state.services.storage.save_proposal(proposal)
        await _audit(
            request,
            proposal,
            "section.approved",
            f"{section.title} was approved.",
            section_id=section.id,
        )
    return await _proposal_response(request, proposal)


@router.post("/proposals/{proposal_id}/approve")
async def approve_proposal(proposal_id: str, request: Request):
    proposal = await _proposal_or_404(request, proposal_id)
    if len(proposal.sections) != 12 or any(
        section.status != "Approved" for section in proposal.sections
    ):
        remaining = sum(section.status != "Approved" for section in proposal.sections)
        raise HTTPException(
            status_code=409,
            detail=(
                "Approve all twelve proposal sections before approving the complete "
                f"proposal. {remaining} section(s) remain."
            ),
        )
    if proposal.status != "Approved":
        proposal.status = "Approved"
        proposal.approvedAt = utc_now()
        proposal.updatedAt = proposal.approvedAt
        await request.app.state.services.storage.save_proposal(proposal)
        await _audit(
            request,
            proposal,
            "proposal.approved",
            "The complete proposal was approved.",
        )
    return await _proposal_response(request, proposal)


@router.post("/proposals/{proposal_id}/risks/{risk_id}/acknowledge")
async def acknowledge_risk(
    proposal_id: str,
    risk_id: str,
    payload: RiskActionRequest,
    request: Request,
):
    proposal = await _proposal_or_404(request, proposal_id)
    finding = next((item for item in proposal.riskFindings if item.id == risk_id), None)
    if not finding:
        raise HTTPException(status_code=404, detail="Risk finding not found")
    finding.status = "Acknowledged" if payload.acknowledged else "Open"
    finding.acknowledgedAt = utc_now() if payload.acknowledged else None
    finding.disposition = payload.disposition
    proposal.updatedAt = utc_now()
    await request.app.state.services.storage.save_proposal(proposal)
    await _audit(
        request,
        proposal,
        "risk.acknowledged" if payload.acknowledged else "risk.reopened",
        f"{finding.category} finding was {finding.status.lower()}.",
        details={"riskId": finding.id, "disposition": finding.disposition},
    )
    return await _proposal_response(request, proposal)


@router.get("/proposals/{proposal_id}/export/markdown")
async def export_markdown(proposal_id: str, request: Request):
    proposal = await _proposal_or_404(request, proposal_id)
    sources = await _source_map(request, proposal)
    try:
        content = markdown_export(proposal, sources)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Markdown export failed: {exc}") from exc
    await _audit(
        request,
        proposal,
        "proposal.exported_markdown",
        "Proposal exported as Markdown.",
    )
    return StreamingResponse(
        BytesIO(content),
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{export_filename(proposal, "md")}"'
            )
        },
    )


@router.get("/proposals/{proposal_id}/export/pdf")
async def export_pdf(proposal_id: str, request: Request):
    proposal = await _proposal_or_404(request, proposal_id)
    sources = await _source_map(request, proposal)
    try:
        content = pdf_export(proposal, sources)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF export failed: {exc}") from exc
    await _audit(
        request,
        proposal,
        "proposal.exported_pdf",
        "Proposal exported as PDF.",
    )
    return StreamingResponse(
        BytesIO(content),
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{export_filename(proposal, "pdf")}"'
            )
        },
    )


@router.get("/audit")
async def audit_history(
    request: Request,
    proposal_id: str | None = None,
    opportunity_id: str | None = None,
):
    if not proposal_id and not opportunity_id:
        raise HTTPException(
            status_code=422, detail="Provide proposal_id or opportunity_id."
        )
    items = await request.app.state.services.storage.list_audit_events(
        proposal_id=proposal_id, opportunity_id=opportunity_id
    )
    return {"items": items}


async def _proposal_or_404(request: Request, proposal_id: str):
    proposal = await request.app.state.services.storage.get_proposal(proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return proposal


def _section_or_404(proposal, section_id: str):
    section = next((item for item in proposal.sections if item.id == section_id), None)
    if not section:
        raise HTTPException(status_code=404, detail="Proposal section not found")
    return section


def _invalidate_section_and_proposal(proposal, section) -> None:
    now = utc_now()
    section.status = "In Review"
    section.approvedAt = None
    section.updatedAt = now
    proposal.status = "In Review"
    proposal.approvedAt = None
    proposal.updatedAt = now


async def _source_map(request: Request, proposal) -> dict:
    source_ids = list(
        dict.fromkeys(
            source_id
            for section in proposal.sections
            for source_id in section.sourceIds
        )
    )
    items = await request.app.state.services.search.get_by_ids(source_ids)
    return {item.id: item for item in items}


async def _proposal_response(request: Request, proposal):
    sources = await _source_map(request, proposal)
    payload = proposal.model_dump()
    for section in payload["sections"]:
        section["sources"] = [
            {
                "id": sources[source_id].id,
                "title": sources[source_id].title,
                "kind": sources[source_id].kind,
                "industry": sources[source_id].industry,
                "tags": sources[source_id].tags,
                "sourceBlobName": sources[source_id].sourceBlobName,
                "snippet": sources[source_id].content[:280],
            }
            for source_id in section["sourceIds"]
            if source_id in sources
        ]
    for finding in payload["riskFindings"]:
        if not finding["relatedSectionIds"]:
            finding["relatedSectionIds"] = _related_sections(finding["category"])
    return payload


def _related_sections(category: str) -> list[str]:
    value = category.lower()
    if "assumption" in value:
        return ["section-08"]
    if "dependency" in value:
        return ["section-09"]
    if "risk" in value:
        return ["section-10"]
    if "question" in value or "missing" in value:
        return ["section-04"]
    return []


async def _audit(
    request: Request,
    proposal,
    event_type: str,
    summary: str,
    section_id: str | None = None,
    details: dict | None = None,
) -> None:
    await request.app.state.services.storage.save_audit_event(
        AuditEvent(
            id=f"audit-{uuid4().hex[:12]}",
            eventType=event_type,
            opportunityId=proposal.opportunityId,
            proposalId=proposal.id,
            sectionId=section_id,
            summary=summary,
            details=details,
        )
    )


async def _ensure_generation_audit(request: Request, proposal) -> None:
    items = await request.app.state.services.storage.list_audit_events(
        proposal_id=proposal.id
    )
    if not items:
        await request.app.state.services.storage.save_audit_event(
            AuditEvent(
                id=f"audit-{uuid4().hex[:12]}",
                eventType="proposal.generated",
                opportunityId=proposal.opportunityId,
                proposalId=proposal.id,
                actorType="system",
                actorId=None,
                summary="Existing proposal generation recorded for audit history.",
                createdAt=proposal.createdAt,
                details={"backfilled": True},
            )
        )
