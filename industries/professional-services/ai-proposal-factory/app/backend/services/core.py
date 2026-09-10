from uuid import uuid4

from app.backend.models import AuditEvent, Opportunity, OpportunityCreate, OpportunityUpdate
from app.backend.models.domain import utc_now
from app.backend.seeds import build_documents, build_knowledge, build_opportunities
from app.backend.storage import Store


class AuditService:
    def __init__(self, store: Store):
        self.store = store

    def record(
        self,
        event_type: str,
        message: str,
        opportunity_id: str | None = None,
        proposal_id: str | None = None,
    ) -> AuditEvent:
        event = AuditEvent(
            id=f"audit-{uuid4().hex}",
            event_type=event_type,
            message=message,
            opportunity_id=opportunity_id,
            proposal_id=proposal_id,
        )
        self.store.upsert("audit", event.id, event.model_dump())
        return event

    def list(self, opportunity_id: str | None = None) -> list[AuditEvent]:
        events = [AuditEvent(**item) for item in self.store.list("audit")]
        if opportunity_id:
            events = [event for event in events if event.opportunity_id == opportunity_id]
        return sorted(events, key=lambda event: event.timestamp, reverse=True)


class OpportunityService:
    def __init__(self, store: Store, audit: AuditService):
        self.store = store
        self.audit = audit

    def list(self) -> list[Opportunity]:
        return sorted(
            [Opportunity(**item) for item in self.store.list("opportunities")],
            key=lambda item: item.updated_at,
            reverse=True,
        )

    def get(self, opportunity_id: str) -> Opportunity | None:
        item = self.store.get("opportunities", opportunity_id)
        return Opportunity(**item) if item else None

    def create(self, payload: OpportunityCreate) -> Opportunity:
        opportunity = Opportunity(id=f"opp-{uuid4().hex[:12]}", **payload.model_dump())
        self.store.upsert("opportunities", opportunity.id, opportunity.model_dump())
        self.audit.record(
            "opportunity.created",
            f"Created opportunity {opportunity.name}.",
            opportunity.id,
        )
        return opportunity

    def update(self, opportunity_id: str, payload: OpportunityUpdate) -> Opportunity | None:
        opportunity = self.get(opportunity_id)
        if not opportunity:
            return None
        updated = opportunity.model_copy(
            update={**payload.model_dump(exclude_none=True), "updated_at": utc_now()}
        )
        self.store.upsert("opportunities", updated.id, updated.model_dump())
        self.audit.record(
            "opportunity.updated",
            f"Updated opportunity {updated.name}.",
            opportunity_id,
        )
        return updated


class SeedService:
    VERSION = "2026-09-09-v1"

    def __init__(self, store: Store):
        self.store = store

    def seed(self, force: bool = False) -> dict[str, int | str]:
        marker = self.store.get("metadata", "seed-version")
        if marker and marker.get("version") == self.VERSION and not force:
            return {"status": "already-seeded", **self.counts()}

        for opportunity in build_opportunities():
            if force or not self.store.get("opportunities", opportunity.id):
                self.store.upsert("opportunities", opportunity.id, opportunity.model_dump())
        for item in build_knowledge():
            if force or not self.store.get("knowledge", item.id):
                self.store.upsert("knowledge", item.id, item.model_dump())
        for document in build_documents():
            if force or not self.store.get("documents", document.id):
                self.store.upsert("documents", document.id, document.model_dump())
        self.store.upsert("metadata", "seed-version", {"version": self.VERSION})
        return {"status": "seeded", **self.counts()}

    def counts(self) -> dict[str, int]:
        return {
            "opportunities": len(self.store.list("opportunities")),
            "knowledge": len(self.store.list("knowledge")),
            "documents": len(self.store.list("documents")),
        }
