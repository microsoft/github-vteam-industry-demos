from fastapi import APIRouter, Depends, Query, Request

from app.backend.models.domain import (
    AuditListItem,
    DocumentListItem,
    InvestigationListItem,
)
from app.backend.services.cases import CaseService

router = APIRouter(prefix="/api", tags=["aggregates"])


def case_service(request: Request) -> CaseService:
    return request.app.state.case_service


@router.get("/investigations", response_model=list[InvestigationListItem])
def list_investigations(
    service: CaseService = Depends(case_service),
) -> list[InvestigationListItem]:
    return service.list_investigations()


@router.get("/documents", response_model=list[DocumentListItem])
def list_documents(
    service: CaseService = Depends(case_service),
) -> list[DocumentListItem]:
    return service.list_documents()


@router.get("/audit", response_model=list[AuditListItem])
def list_audit(
    case_id: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
    service: CaseService = Depends(case_service),
) -> list[AuditListItem]:
    return service.list_audit(case_id=case_id, event_type=event_type)
