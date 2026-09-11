from app.backend.models.domain import (
    AnalystDecision,
    AuditListItem,
    CaseListItem,
    DecisionRequest,
    DocumentListItem,
    InvestigationListItem,
    KycCase,
    utc_now,
)
from app.backend.storage.base import DemoState


class CaseService:
    def __init__(self, state: DemoState) -> None:
        self.state = state

    def list_cases(
        self,
        search: str | None = None,
        status: str | None = None,
        risk: str | None = None,
    ) -> list[CaseListItem]:
        cases = self.state.list_cases()
        if search:
            query = search.casefold()
            cases = [
                case
                for case in cases
                if query in case.company.casefold() or query in case.id.casefold()
            ]
        if status:
            cases = [case for case in cases if case.status == status]
        if risk:
            cases = [case for case in cases if case.risk_level == risk]
        return [CaseListItem(**case.model_dump()) for case in cases]

    def get_case(self, case_id: str) -> KycCase | None:
        return self.state.get_case(case_id)

    def list_investigations(self) -> list[InvestigationListItem]:
        items = []
        for case in self.state.list_cases():
            events = [
                event
                for event in case.audit
                if "investigation" in event.action.casefold()
            ]
            latest = events[-1] if events else None
            items.append(
                InvestigationListItem(
                    case_id=case.id,
                    company=case.company,
                    case_status=case.status,
                    investigation_status=(
                        "Completed" if case.summary is not None else "Not Started"
                    ),
                    risk_level=case.risk_level,
                    latest_investigation_at=latest.timestamp if latest else None,
                    latest_investigation_status=(
                        latest.action if latest else "No investigation activity"
                    ),
                    recommended_action=(
                        case.summary.recommended_action if case.summary else None
                    ),
                )
            )
        return sorted(
            items,
            key=lambda item: item.latest_investigation_at or "",
            reverse=True,
        )

    def list_documents(self) -> list[DocumentListItem]:
        items = [
            DocumentListItem(
                case_id=case.id,
                company=case.company,
                document_id=document.id,
                document_type=document.document_type,
                name=document.name,
                status=(
                    "Extracted" if document.extracted_facts else document.status
                ),
                submitted_at=document.submitted_at,
                confidence=document.confidence,
            )
            for case in self.state.list_cases()
            for document in case.documents
        ]
        return sorted(
            items,
            key=lambda item: (item.submitted_at, item.case_id, item.document_type),
            reverse=True,
        )

    def list_audit(
        self,
        case_id: str | None = None,
        event_type: str | None = None,
    ) -> list[AuditListItem]:
        items = [
            AuditListItem(
                case_id=case.id,
                company=case.company,
                event_id=event.id,
                event_type=event.actor_type,
                timestamp=event.timestamp,
                actor=event.actor,
                action=event.action,
                description=event.detail,
            )
            for case in self.state.list_cases()
            if not case_id or case.id == case_id
            for event in case.audit
            if not event_type or event.actor_type == event_type
        ]
        return sorted(items, key=lambda item: item.timestamp, reverse=True)

    def decide(self, case_id: str, request: DecisionRequest) -> KycCase | None:
        reason = request.reason.strip()
        if not reason:
            raise ValueError("An analyst reason is required.")
        decision = AnalystDecision(
            action=request.action,
            reason=reason,
            analyst=request.analyst.strip(),
            timestamp=utc_now(),
        )
        return self.state.record_decision(case_id, decision)
