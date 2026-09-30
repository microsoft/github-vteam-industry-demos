import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from proposal_factory.adapters import FoundryAgents, LocalAgents, LocalSearch, _parse_json
from proposal_factory.config import Settings
from proposal_factory.models import (
    Document,
    KnowledgeItem,
    Opportunity,
    Proposal,
    ProposalSection,
    RequirementsAnalysis,
)

ROOT = Path(__file__).resolve().parents[2]


def load_first(filename: str, model_type):
    payload = json.loads((ROOT / "data" / filename).read_text("utf-8"))
    return model_type.model_validate(payload[0])


@pytest.mark.asyncio
async def test_local_boundaries_are_deterministic():
    opportunity = load_first("opportunities.json", Opportunity)
    document = load_first("meeting-notes.json", Document)
    search = LocalSearch.from_seed_data(ROOT)
    agents = LocalAgents()

    analysis = await agents.analyse_requirements(opportunity, [document])
    knowledge = await search.retrieve(
        f"{opportunity.name} {opportunity.businessProblem}", opportunity.industry
    )
    sections = await agents.write_proposal(opportunity, analysis, [document], knowledge)
    risks = await agents.review_risks(opportunity, analysis, sections)

    assert analysis.businessGoals == opportunity.expectedOutcomes
    assert len(knowledge) == 6
    assert all(isinstance(item, KnowledgeItem) for item in knowledge)
    assert [section.title for section in sections] == [
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
    assert len(risks) >= 1


def test_foundry_json_parser_accepts_fenced_json_and_rejects_invalid():
    assert _parse_json('```json\n{"result": true}\n```') == {"result": True}
    with pytest.raises(RuntimeError, match="invalid JSON"):
        _parse_json("not-json")


@pytest.mark.asyncio
async def test_local_knowledge_browse_and_id_resolution():
    search = LocalSearch.from_seed_data(ROOT)
    templates = await search.browse(
        query="proposal", kind="template", industry="Cross-industry"
    )
    assert templates
    assert all(item.kind == "template" for item in templates)
    resolved = await search.get_by_ids([templates[0].id, "missing"])
    assert [item.id for item in resolved] == [templates[0].id]


def test_phase_two_proposal_payload_gets_backward_compatible_defaults():
    section = ProposalSection.model_validate(
        {
            "id": "section-01",
            "title": "Executive Summary",
            "order": 1,
            "content": "Existing proposal content.",
            "sourceIds": [],
        }
    )
    proposal = Proposal(
        id="prop-old",
        opportunityId="opp-old",
        customer="Fictional Customer",
        opportunityName="Existing Proposal",
        requirementsAnalysis=RequirementsAnalysis(
            businessGoals=[],
            businessProblems=[],
            expectedOutcomes=[],
            scope=[],
            stakeholders=[],
            constraints=[],
            successCriteria=[],
            timeline="",
            budgetEffortAssumptions=[],
            openQuestions=[],
            missingInformation=[],
        ),
        sections=[section],
        riskFindings=[],
    )
    assert proposal.status == "Generated"
    assert proposal.approvedAt is None
    assert proposal.sections[0].status == "Generated"
    assert proposal.sections[0].approvedAt is None


@pytest.mark.asyncio
async def test_foundry_adapter_uses_configured_version_and_responses_contract():
    calls = {}
    version = SimpleNamespace(
        id="agent-version-id",
        name="requirements-analyst",
        version="3",
    )
    agent_operations = SimpleNamespace(
        list=lambda **_: [SimpleNamespace(name="requirements-analyst")],
        list_versions=lambda *_args, **_kwargs: [version],
    )

    class Responses:
        def create(self, **kwargs):
            calls.update(kwargs)
            return SimpleNamespace(output_text='{"ok": true}')

    adapter = FoundryAgents.__new__(FoundryAgents)
    adapter.project_client = SimpleNamespace(agents=agent_operations)
    adapter.openai_client = SimpleNamespace(responses=Responses())
    adapter.settings = Settings(app_adapter_mode="local")
    adapter._resolved_agents = {}

    result = await adapter._invoke(
        "requirements",
        "agent-version-id",
        "requirements-analyst",
        {"prompt": "test"},
    )

    assert result == {"ok": True}
    assert calls["extra_body"]["agent_reference"] == {
        "name": "requirements-analyst",
        "version": "3",
        "type": "agent_reference",
    }
