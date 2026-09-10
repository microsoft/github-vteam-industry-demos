from app.backend.container import Services


def test_mocked_generation_and_proposal_state_transitions(services: Services) -> None:
    opportunity = services.opportunities.get("opp-adatum-retail")
    assert opportunity is not None

    job = services.proposals.start(opportunity.id)
    services.proposals.run(job.id)
    completed = services.proposals.get_job(job.id)

    assert completed is not None
    assert completed.status == "completed"
    assert completed.proposal_id
    proposal = services.proposals.get(completed.proposal_id)
    assert proposal is not None
    assert proposal.status == "In Review"
    assert len(proposal.sections) == 12
    assert len(proposal.risks) >= 4
    assert proposal.sections[0].source_references

    edited = services.proposals.update_section(
        proposal.id, "section-01", "Human-reviewed executive summary."
    )
    assert edited is not None
    assert edited.sections[0].status == "In Review"
    assert edited.sections[0].content == "Human-reviewed executive summary."

    regenerated = services.proposals.regenerate_section(proposal.id, "section-01")
    assert regenerated is not None
    assert "Refined for Adatum Retail" in regenerated.sections[0].content

    section_approved = services.proposals.approve_section(proposal.id, "section-01")
    assert section_approved is not None
    assert section_approved.sections[0].status == "Approved"

    approved = services.proposals.approve(proposal.id)
    assert approved is not None
    assert approved.status == "Approved"
    assert all(section.status == "Approved" for section in approved.sections)
