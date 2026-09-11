from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from app.backend.models.domain import (
    CaseListItem,
    DecisionRequest,
    DocumentExtractionResult,
    FoundryStageResult,
    InvestigationJob,
    InvestigationResult,
    KycCase,
)
from app.backend.providers.base import DocumentProcessingError, FoundryStageError
from app.backend.services.cases import CaseService
from app.backend.services.documents import DocumentExtractionService
from app.backend.services.foundry_diagnostics import FoundryDiagnosticsService
from app.backend.services.investigation import InvestigationService

router = APIRouter(prefix="/api/cases", tags=["cases"])


def case_service(request: Request) -> CaseService:
    return request.app.state.case_service


def investigation_service(request: Request) -> InvestigationService:
    return request.app.state.investigation_service


def document_extraction_service(request: Request) -> DocumentExtractionService:
    return request.app.state.document_extraction_service


def foundry_diagnostics_service(request: Request) -> FoundryDiagnosticsService:
    return request.app.state.foundry_diagnostics_service


@router.get("", response_model=list[CaseListItem])
def list_cases(
    search: str | None = Query(default=None),
    status: str | None = Query(default=None),
    risk: str | None = Query(default=None),
    service: CaseService = Depends(case_service),
) -> list[CaseListItem]:
    return service.list_cases(search=search, status=status, risk=risk)


@router.get("/{case_id}", response_model=KycCase)
def get_case(
    case_id: str, service: CaseService = Depends(case_service)
) -> KycCase:
    case = service.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.post("/{case_id}/investigate", response_model=InvestigationResult)
def investigate(
    case_id: str,
    service: InvestigationService = Depends(investigation_service),
) -> InvestigationResult:
    try:
        result = service.run(case_id)
    except (DocumentProcessingError, FoundryStageError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    if not result:
        raise HTTPException(status_code=404, detail="Case not found")
    return result[1]


@router.post(
    "/{case_id}/investigations",
    response_model=InvestigationJob,
)
def start_investigation(
    case_id: str,
    service: InvestigationService = Depends(investigation_service),
) -> InvestigationJob:
    result = service.start(case_id)
    if not result:
        raise HTTPException(status_code=404, detail="Case not found")
    return result


@router.get(
    "/{case_id}/investigations/{job_id}",
    response_model=InvestigationJob,
)
def get_investigation(
    case_id: str,
    job_id: str,
    service: InvestigationService = Depends(investigation_service),
) -> InvestigationJob:
    result = service.get_job(job_id)
    if not result or result.case_id != case_id:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return result


@router.post(
    "/{case_id}/documents/{document_id}/extract",
    response_model=DocumentExtractionResult,
)
def extract_document(
    case_id: str,
    document_id: str,
    service: DocumentExtractionService = Depends(document_extraction_service),
) -> DocumentExtractionResult:
    try:
        result = service.extract(case_id, document_id)
    except DocumentProcessingError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    if not result:
        raise HTTPException(status_code=404, detail="Case or document not found")
    return result


@router.get(
    "/{case_id}/documents/{document_id}/content",
    response_class=PlainTextResponse,
)
def get_document_content(
    case_id: str,
    document_id: str,
    service: CaseService = Depends(case_service),
) -> str:
    content = service.state.get_document_content(case_id, document_id)
    if content is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return content


@router.post(
    "/{case_id}/agents/{stage}",
    response_model=FoundryStageResult,
)
def run_foundry_stage(
    case_id: str,
    stage: Literal["extract", "complete", "risk", "summary"],
    service: FoundryDiagnosticsService = Depends(foundry_diagnostics_service),
) -> FoundryStageResult:
    try:
        result = service.run(case_id, stage)
    except (DocumentProcessingError, FoundryStageError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    if not result:
        raise HTTPException(status_code=404, detail="Case not found")
    return result


@router.post("/{case_id}/decision", response_model=KycCase)
def decide(
    case_id: str,
    decision: DecisionRequest,
    service: CaseService = Depends(case_service),
) -> KycCase:
    try:
        case = service.decide(case_id, decision)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case
