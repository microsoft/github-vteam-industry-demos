from app.backend.models import OpportunityCreate, OpportunityUpdate
from app.backend.container import Services


def test_opportunity_crud_service(services: Services) -> None:
    created = services.opportunities.create(
        OpportunityCreate(
            customer="Northwind Research",
            name="Insight Workspace",
            industry="Technology",
            business_problem="Research context is fragmented.",
            expected_outcomes=["Faster research"],
        )
    )

    fetched = services.opportunities.get(created.id)
    updated = services.opportunities.update(
        created.id, OpportunityUpdate(notes="Discovery confirmed.")
    )

    assert fetched == created
    assert updated is not None
    assert updated.notes == "Discovery confirmed."
    assert len(services.opportunities.list()) == 10
    assert any(event.event_type == "opportunity.created" for event in services.audit.list())


def test_seed_is_deterministic_and_idempotent(services: Services) -> None:
    result = services.seeds.seed()
    knowledge = services.store.list("knowledge")

    assert result["status"] == "already-seeded"
    assert result["opportunities"] == 9
    assert result["knowledge"] == 46
    assert result["documents"] == 9
    assert sum(item["type"] == "Proposal Snippet" for item in knowledge) == 18
    assert sum(item["type"] == "Case Study" for item in knowledge) == 8
