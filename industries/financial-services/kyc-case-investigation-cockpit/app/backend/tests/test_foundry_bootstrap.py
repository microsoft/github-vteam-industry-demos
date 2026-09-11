from types import SimpleNamespace

from scripts.bootstrap_foundry_agents import (
    AGENT_INSTRUCTIONS,
    definition_hash,
    ensure_agent,
)


class FakeAgents:
    def __init__(self, existing=None) -> None:
        self.existing = existing
        self.created = []

    def list_versions(self, *args, **kwargs):
        return [self.existing] if self.existing else []

    def create_version(self, **kwargs):
        self.created.append(kwargs)
        return SimpleNamespace(
            id="new-agent-id",
            name=kwargs["agent_name"],
            version="2",
            metadata=kwargs["metadata"],
        )


def test_bootstrap_reuses_matching_agent_version() -> None:
    model = "model-deployment"
    instructions = AGENT_INSTRUCTIONS["extract"]
    existing = SimpleNamespace(
        id="existing-agent-id",
        name="agt-kyc-extract",
        version="1",
        metadata={
            "definition_hash": definition_hash(model, instructions)
        },
    )
    agents = FakeAgents(existing)

    agent, created = ensure_agent(
        agents,
        stage="extract",
        name="agt-kyc-extract",
        model=model,
        instructions=instructions,
    )

    assert agent is existing
    assert created is False
    assert agents.created == []


def test_bootstrap_creates_new_version_when_definition_changes() -> None:
    agents = FakeAgents(
        SimpleNamespace(
            id="old-agent-id",
            name="agt-kyc-risk",
            version="1",
            metadata={"definition_hash": "outdated"},
        )
    )

    agent, created = ensure_agent(
        agents,
        stage="risk",
        name="agt-kyc-risk",
        model="model-deployment",
        instructions=AGENT_INSTRUCTIONS["risk"],
    )

    assert created is True
    assert agent.version == "2"
    assert agents.created[0]["metadata"]["stage"] == "risk"
    assert agents.created[0]["metadata"]["region"] == "swedencentral"
