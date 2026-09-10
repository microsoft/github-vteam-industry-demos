import json
from types import SimpleNamespace

import pytest
from azure.ai.agents.models import MessageRole

from app.backend.models import KnowledgeItem, ProposalSection
from app.backend.seeds import build_documents, build_opportunities
from app.backend.services.agents import FoundryAgentService


class FakeMessages:
    def __init__(self, responses: list[dict]):
        self.responses = responses

    def create(self, **_):
        return None

    def list(self, **_):
        response = self.responses.pop(0)
        text = SimpleNamespace(value=json.dumps(response))
        content = [SimpleNamespace(text=text)]
        return [
            SimpleNamespace(
                role=MessageRole.USER,
                content=[SimpleNamespace(text=SimpleNamespace(value="request"))],
            ),
            SimpleNamespace(role=MessageRole.AGENT, content=content),
        ]


class FakeRuns:
    def __init__(self):
        self.agent_ids: list[str] = []

    def create_and_process(self, **kwargs):
        self.agent_ids.append(kwargs["agent_id"])
        return SimpleNamespace(status="completed")


def build_service(responses: list[dict]) -> FoundryAgentService:
    service = FoundryAgentService.__new__(FoundryAgentService)
    runs = FakeRuns()
    service.client = SimpleNamespace(
        threads=SimpleNamespace(create=lambda: SimpleNamespace(id="thread-1")),
        messages=FakeMessages(responses),
        runs=runs,
    )
    service.agent_ids = {
        "requirements": "requirements-agent",
        "proposal": "proposal-agent",
        "risk": "risk-agent",
    }
    return service


def test_current_sdk_agent_role_extracts_all_three_responses() -> None:
    responses = [
        {"business_goals": ["Improve service"]},
        {
            "sections": [
                {
                    "title": "Executive Summary",
                    "content": "A grounded proposal.",
                    "source_references": ["Synthetic Practice Library"],
                }
            ]
        },
        {
            "findings": [
                {
                    "severity": "Medium",
                    "category": "Dependency",
                    "description": "Access must be ready.",
                    "mitigation": "Confirm an owner and date.",
                }
            ]
        },
    ]
    service = build_service(responses)
    opportunity = build_opportunities()[0]
    documents = [build_documents()[0]]
    knowledge = [
        KnowledgeItem(
            id="knowledge-1",
            title="Delivery method",
            type="Methodology",
            content="Use checkpoints.",
            source="Synthetic Practice Library",
        )
    ]

    analysis = service.analyse_requirements(opportunity, documents)
    sections = service.write_proposal(opportunity, analysis, knowledge)
    findings = service.review_risks(opportunity, sections)

    assert analysis["business_goals"] == ["Improve service"]
    assert sections[0].content == "A grounded proposal."
    assert findings[0].category == "Dependency"
    assert service.client.runs.agent_ids == [
        "requirements-agent",
        "proposal-agent",
        "risk-agent",
    ]


def regeneration_inputs() -> tuple:
    opportunity = build_opportunities()[0]
    section = ProposalSection(
        id="section-02",
        title="Customer Challenges",
        content="Existing content.",
        order=2,
        source_references=["Existing source"],
    )
    knowledge = [
        KnowledgeItem(
            id="knowledge-1",
            title="Relevant case study",
            type="Case Study",
            content="Reusable evidence.",
            source="New source",
        )
    ]
    return opportunity, section, knowledge


def test_regeneration_extracts_requested_section_from_full_generation_shape() -> None:
    service = build_service(
        [
            {
                "sections": [
                    {
                        "id": "section-01",
                        "title": "Executive Summary",
                        "content": "Not the requested section.",
                    },
                    {
                        "id": "section-02",
                        "title": "Customer Challenges",
                        "content": "Regenerated customer challenges.",
                        "source_references": ["New source"],
                    },
                ]
            }
        ]
    )
    opportunity, section, knowledge = regeneration_inputs()

    regenerated = service.regenerate_section(opportunity, section, knowledge)

    assert regenerated.content == "Regenerated customer challenges."
    assert regenerated.source_references == ["Existing source", "New source"]
    assert regenerated.status == "Generated"


def test_regeneration_accepts_direct_section_shape() -> None:
    service = build_service(
        [
            {
                "id": "section-02",
                "title": "Customer Challenges",
                "content": "Direct regenerated content.",
                "source_references": ["Direct source"],
            }
        ]
    )
    opportunity, section, knowledge = regeneration_inputs()

    regenerated = service.regenerate_section(opportunity, section, knowledge)

    assert regenerated.content == "Direct regenerated content."
    assert regenerated.source_references == ["Existing source", "Direct source"]


@pytest.mark.parametrize(
    ("response", "message"),
    [
        (
            {
                "sections": [
                    {
                        "id": "section-01",
                        "title": "Executive Summary",
                        "content": "Wrong section.",
                    }
                ]
            },
            "did not include requested section",
        ),
        (
            {
                "id": "section-99",
                "title": "Customer Challenges",
                "content": "Mismatched identity.",
            },
            "returned section id",
        ),
        (
            {
                "id": "section-02",
                "title": "Customer Challenges",
                "source_references": ["Missing content"],
            },
            "returned no usable content",
        ),
        (
            {
                "id": "section-02",
                "title": "Customer Challenges",
                "content": "Valid content.",
                "source_references": "not-an-array",
            },
            "malformed source references",
        ),
    ],
)
def test_regeneration_rejects_missing_or_malformed_output(
    response: dict, message: str
) -> None:
    service = build_service([response])
    opportunity, section, knowledge = regeneration_inputs()

    with pytest.raises(RuntimeError, match=message):
        service.regenerate_section(opportunity, section, knowledge)
