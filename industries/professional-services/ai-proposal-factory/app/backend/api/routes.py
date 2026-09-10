from io import BytesIO
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from pypdf import PdfReader

from app.backend.models import (
    Document,
    OpportunityCreate,
    OpportunityUpdate,
)
from app.backend.models.domain import utc_now
from app.backend.services.exports import proposal_markdown, proposal_pdf


class SectionUpdate(BaseModel):
    content: str = Field(min_length=1)


class DocumentSelection(BaseModel):
    selected: bool


def create_api_router(services) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @router.get("/opportunities")
    async def list_opportunities():
        return services.opportunities.list()

    @router.post("/opportunities", status_code=201)
    async def create_opportunity(payload: OpportunityCreate):
        return services.opportunities.create(payload)

    @router.get("/opportunities/{opportunity_id}")
    async def get_opportunity(opportunity_id: str):
        opportunity = services.opportunities.get(opportunity_id)
        if not opportunity:
            raise HTTPException(404, "Opportunity not found")
        return opportunity

    @router.patch("/opportunities/{opportunity_id}")
    async def update_opportunity(opportunity_id: str, payload: OpportunityUpdate):
        opportunity = services.opportunities.update(opportunity_id, payload)
        if not opportunity:
            raise HTTPException(404, "Opportunity not found")
        return opportunity

    @router.get("/opportunities/{opportunity_id}/documents")
    async def list_documents(opportunity_id: str):
        return [
            Document(**item)
            for item in services.store.list("documents")
            if item["opportunity_id"] == opportunity_id
        ]

    @router.post("/opportunities/{opportunity_id}/documents", status_code=201)
    async def upload_document(opportunity_id: str, file: UploadFile = File(...)):
        if not services.opportunities.get(opportunity_id):
            raise HTTPException(404, "Opportunity not found")
        extension = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if extension not in {".txt", ".md", ".pdf"}:
            raise HTTPException(400, "Upload a .txt, .md, or .pdf document.")
        raw = await file.read()
        if len(raw) > 10 * 1024 * 1024:
            raise HTTPException(413, "Document is larger than the 10 MB demo limit.")
        try:
            if extension == ".pdf":
                content = "\n".join(
                    page.extract_text() or "" for page in PdfReader(BytesIO(raw)).pages
                )
            else:
                content = raw.decode("utf-8")
        except Exception as exc:
            raise HTTPException(400, "The document could not be read.") from exc
        document_id = f"document-{uuid4().hex[:12]}"
        document = Document(
            id=document_id,
            opportunity_id=opportunity_id,
            filename=file.filename,
            content_type=file.content_type or "application/octet-stream",
            content=content[:100_000],
            selected=True,
            blob_name=services.store.save_document_content(
                f"{opportunity_id}-{document_id}-{file.filename}", raw
            ),
        )
        services.store.upsert("documents", document.id, document.model_dump())
        services.audit.record(
            "document.uploaded",
            f"Uploaded {document.filename}.",
            opportunity_id,
        )
        return document

    @router.patch("/opportunities/{opportunity_id}/documents/{document_id}")
    async def select_document(
        opportunity_id: str, document_id: str, payload: DocumentSelection
    ):
        item = services.store.get("documents", document_id)
        if not item or item["opportunity_id"] != opportunity_id:
            raise HTTPException(404, "Document not found")
        item["selected"] = payload.selected
        services.store.upsert("documents", document_id, item)
        return Document(**item)

    @router.delete("/opportunities/{opportunity_id}/documents/{document_id}", status_code=204)
    async def delete_document(opportunity_id: str, document_id: str):
        item = services.store.get("documents", document_id)
        if not item or item["opportunity_id"] != opportunity_id:
            raise HTTPException(404, "Document not found")
        services.store.delete("documents", document_id)
        return Response(status_code=204)

    @router.post("/opportunities/{opportunity_id}/generate", status_code=202)
    async def generate_proposal(
        opportunity_id: str, background_tasks: BackgroundTasks
    ):
        if not services.opportunities.get(opportunity_id):
            raise HTTPException(404, "Opportunity not found")
        job = services.proposals.start(opportunity_id)
        background_tasks.add_task(services.proposals.run, job.id)
        return job

    @router.get("/generation/{job_id}")
    async def generation_status(job_id: str):
        job = services.proposals.get_job(job_id)
        if not job:
            raise HTTPException(404, "Generation job not found")
        return job

    @router.get("/proposals/{proposal_id}")
    async def get_proposal(proposal_id: str):
        proposal = services.proposals.get(proposal_id)
        if not proposal:
            raise HTTPException(404, "Proposal not found")
        return proposal

    @router.patch("/proposals/{proposal_id}/sections/{section_id}")
    async def update_section(
        proposal_id: str, section_id: str, payload: SectionUpdate
    ):
        proposal = services.proposals.update_section(
            proposal_id, section_id, payload.content
        )
        if not proposal:
            raise HTTPException(404, "Proposal or section not found")
        return proposal

    @router.post("/proposals/{proposal_id}/sections/{section_id}/regenerate")
    async def regenerate_section(proposal_id: str, section_id: str):
        try:
            proposal = services.proposals.regenerate_section(proposal_id, section_id)
        except Exception as exc:
            raise HTTPException(
                503,
                "This section could not be regenerated. Your existing content is unchanged; please retry.",
            ) from exc
        if not proposal:
            raise HTTPException(404, "Proposal or section not found")
        return proposal

    @router.post("/proposals/{proposal_id}/sections/{section_id}/approve")
    async def approve_section(proposal_id: str, section_id: str):
        proposal = services.proposals.approve_section(proposal_id, section_id)
        if not proposal:
            raise HTTPException(404, "Proposal or section not found")
        return proposal

    @router.post("/proposals/{proposal_id}/approve")
    async def approve_proposal(proposal_id: str):
        proposal = services.proposals.approve(proposal_id)
        if not proposal:
            raise HTTPException(404, "Proposal not found")
        return proposal

    @router.get("/proposals/{proposal_id}/export/markdown")
    async def export_markdown(proposal_id: str):
        proposal = services.proposals.get(proposal_id)
        if not proposal:
            raise HTTPException(404, "Proposal not found")
        opportunity = services.opportunities.get(proposal.opportunity_id)
        if not opportunity:
            raise HTTPException(404, "Opportunity not found")
        content = proposal_markdown(opportunity, proposal)
        services.audit.record(
            "proposal.exported",
            "Exported proposal as Markdown.",
            opportunity.id,
            proposal.id,
        )
        return Response(
            content=content,
            media_type="text/markdown",
            headers={
                "Content-Disposition": f'attachment; filename="{proposal.id}.md"'
            },
        )

    @router.get("/proposals/{proposal_id}/export/pdf")
    async def export_pdf(proposal_id: str):
        proposal = services.proposals.get(proposal_id)
        if not proposal:
            raise HTTPException(404, "Proposal not found")
        opportunity = services.opportunities.get(proposal.opportunity_id)
        if not opportunity:
            raise HTTPException(404, "Opportunity not found")
        content = proposal_pdf(opportunity, proposal)
        services.audit.record(
            "proposal.exported",
            "Exported proposal as PDF.",
            opportunity.id,
            proposal.id,
        )
        return Response(
            content=content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{proposal.id}.pdf"'
            },
        )

    @router.get("/knowledge")
    async def list_knowledge(
        search: str = "",
        type: str | None = Query(default=None),
        limit: int = Query(default=100, ge=1, le=100),
    ):
        if search:
            return services.retriever.search(search, limit, type)
        items = services.store.list("knowledge")
        if type:
            items = [item for item in items if item["type"] == type]
        return items[:limit]

    @router.get("/audit")
    async def list_audit(opportunity_id: str | None = None):
        return services.audit.list(opportunity_id)

    @router.get("/system/config")
    async def system_config():
        return {
            "mode": "demo" if services.settings.demo_mode else "foundry",
            "persistence": (
                "azure-tables"
                if services.settings.storage_table_endpoint
                else "local-json"
            ),
            "retrieval": (
                "azure-ai-search"
                if services.settings.search_endpoint
                else "local"
            ),
            "updated_at": utc_now(),
        }

    return router
