import json
from pathlib import Path

import pytest

from proposal_factory.adapters import InMemoryStorage, LocalAgents, LocalSearch
from proposal_factory.config import Settings
from proposal_factory.models import Document, GenerationJob, Opportunity
from proposal_factory.workflow import ProposalWorkflow

ROOT = Path(__file__).resolve().parents[2]


def models(filename: str, model_type):
    return [
        model_type.model_validate(item)
        for item in json.loads((ROOT / "data" / filename).read_text("utf-8"))
    ]


@pytest.mark.asyncio
async def test_workflow_completes_and_persists_proposal():
    opportunities = models("opportunities.json", Opportunity)
    documents = models("meeting-notes.json", Document)
    storage = InMemoryStorage(opportunities, documents)
    workflow = ProposalWorkflow(
        storage,
        LocalSearch.from_seed_data(ROOT),
        LocalAgents(),
        Settings(app_adapter_mode="local"),
    )
    job = GenerationJob(
        id="gen-test",
        opportunityId=opportunities[0].id,
        status="queued",
        progressMessage="Queued",
    )
    await storage.save_job(job)

    await workflow.run(job, [documents[0].id])

    saved_job = await storage.get_job(job.id)
    assert saved_job
    assert saved_job.status == "completed"
    assert saved_job.proposalId
    proposal = await storage.get_proposal(saved_job.proposalId)
    assert proposal
    assert len(proposal.sections) == 12
    assert len(proposal.riskFindings) >= 1
    audit = await storage.list_audit_events(proposal_id=proposal.id)
    assert {item.eventType for item in audit} == {
        "generation.started",
        "proposal.generated",
    }


@pytest.mark.asyncio
async def test_workflow_surfaces_missing_document_failure():
    opportunities = models("opportunities.json", Opportunity)
    storage = InMemoryStorage(opportunities, [])
    workflow = ProposalWorkflow(
        storage,
        LocalSearch.from_seed_data(ROOT),
        LocalAgents(),
        Settings(app_adapter_mode="local"),
    )
    job = GenerationJob(
        id="gen-failure",
        opportunityId=opportunities[0].id,
        status="queued",
        progressMessage="Queued",
    )

    await workflow.run(job, ["missing"])

    saved = await storage.get_job(job.id)
    assert saved
    assert saved.status == "failed"
    assert "meeting notes" in (saved.error or "")
