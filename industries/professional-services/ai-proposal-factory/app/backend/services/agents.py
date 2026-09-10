import json
import re
from typing import Any, Protocol
from uuid import uuid4

from app.backend.config import Settings
from app.backend.models import (
    Document,
    KnowledgeItem,
    Opportunity,
    ProposalSection,
    RiskFinding,
)


SECTION_TITLES = [
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


class AgentService(Protocol):
    def analyse_requirements(
        self, opportunity: Opportunity, documents: list[Document]
    ) -> dict[str, Any]: ...

    def write_proposal(
        self,
        opportunity: Opportunity,
        analysis: dict[str, Any],
        knowledge: list[KnowledgeItem],
    ) -> list[ProposalSection]: ...

    def review_risks(
        self, opportunity: Opportunity, sections: list[ProposalSection]
    ) -> list[RiskFinding]: ...

    def regenerate_section(
        self,
        opportunity: Opportunity,
        section: ProposalSection,
        knowledge: list[KnowledgeItem],
    ) -> ProposalSection: ...


class MockAgentService:
    def analyse_requirements(
        self, opportunity: Opportunity, documents: list[Document]
    ) -> dict[str, Any]:
        note_context = [document.filename for document in documents]
        return {
            "business_goals": opportunity.expected_outcomes,
            "business_problems": [opportunity.business_problem],
            "expected_outcomes": opportunity.expected_outcomes,
            "scope": opportunity.scope,
            "stakeholders": opportunity.stakeholders,
            "constraints": opportunity.constraints,
            "success_criteria": [
                f"Measurable progress against {outcome.lower()}"
                for outcome in opportunity.expected_outcomes
            ],
            "timeline": opportunity.target_timeline,
            "budget_effort_assumptions": opportunity.budget_assumptions,
            "open_questions": [
                "Which operational baseline will be used to measure value?",
                "Who owns acceptance for each delivery checkpoint?",
            ],
            "missing_information": (
                [] if note_context else ["No meeting notes were selected."]
            ),
            "source_documents": note_context,
        }

    def write_proposal(
        self,
        opportunity: Opportunity,
        analysis: dict[str, Any],
        knowledge: list[KnowledgeItem],
    ) -> list[ProposalSection]:
        references = [item.source for item in knowledge[:3]]
        knowledge_theme = knowledge[0].title if knowledge else "our proven delivery practices"
        content = {
            "Executive Summary": (
                f"{opportunity.customer} has an opportunity to address {opportunity.business_problem.lower()} "
                f"This proposal outlines a pragmatic {opportunity.delivery_duration} engagement that "
                f"uses {knowledge_theme.lower()} to deliver measurable value with human oversight."
            ),
            "Customer Challenges": (
                f"The current challenge is {opportunity.business_problem.lower()} "
                f"Key constraints include {', '.join(opportunity.constraints).lower()}."
            ),
            "Proposed Solution": (
                f"We propose to {opportunity.scope[0].lower() + opportunity.scope[1:]} "
                "The solution combines focused discovery, iterative delivery, adoption, and operational handover."
            ),
            "Scope": f"In scope: {opportunity.scope} The first release will prioritize outcomes that can be validated early.",
            "Deliverables": (
                "Deliverables include a validated solution blueprint, configured platform capabilities, "
                "working priority scenarios, adoption materials, and an operational transition pack."
            ),
            "Delivery Approach": (
                "A discover, design, deliver, and adopt approach will create frequent checkpoints. "
                "Joint governance will manage decisions, value measures, dependencies, and risks."
            ),
            "Milestones": (
                "Weeks 1–2: discovery and baseline. Weeks 3–6: foundation and first scenario. "
                "Weeks 7 onward: iterative scenarios, adoption, assurance, and handover."
            ),
            "Assumptions": (
                f"The engagement assumes timely stakeholder access and the planning envelope described as: "
                f"{opportunity.budget_assumptions}"
            ),
            "Dependencies": (
                "Customer subject-matter experts, representative data, platform access, security review, "
                "and acceptance decisions are required at agreed checkpoints."
            ),
            "Risks": (
                "Primary risks are delayed access, unclear ownership, and expanding scope. "
                "These will be managed through early access checks, a named decision forum, and backlog governance."
            ),
            "Success Criteria": "; ".join(analysis.get("success_criteria", opportunity.expected_outcomes)) + ".",
            "Next Steps": (
                "Confirm executive sponsor and delivery owners, validate scope and measures, "
                "schedule the inception workshop, and authorize the first delivery increment."
            ),
        }
        return [
            ProposalSection(
                id=f"section-{index:02d}",
                title=title,
                content=content[title],
                order=index,
                source_references=references if index in {1, 3, 6} else [],
            )
            for index, title in enumerate(SECTION_TITLES, start=1)
        ]

    def review_risks(
        self, opportunity: Opportunity, sections: list[ProposalSection]
    ) -> list[RiskFinding]:
        findings = [
            ("High", "Dependency", "Platform and data access may arrive later than planned.", "Confirm owners and access dates during inception."),
            ("Medium", "Assumption", "Business stakeholders can attend fortnightly acceptance reviews.", "Nominate delegates and reserve review slots."),
            ("Medium", "Open Question", "The baseline for measuring the first outcome is not yet confirmed.", "Agree the metric owner, source, and baseline value."),
            ("Low", "Risk", "Scope may expand as adjacent use cases emerge.", "Use a prioritized backlog and explicit change decisions."),
        ]
        if opportunity.constraints:
            findings.append(
                (
                    "Medium",
                    "Missing Information",
                    f"Constraint requires validation: {opportunity.constraints[0]}.",
                    "Resolve the constraint in the discovery checkpoint.",
                )
            )
        return [
            RiskFinding(
                id=f"risk-{index:02d}",
                severity=severity,
                category=category,
                description=description,
                mitigation=mitigation,
            )
            for index, (severity, category, description, mitigation) in enumerate(findings, 1)
        ]

    def regenerate_section(
        self,
        opportunity: Opportunity,
        section: ProposalSection,
        knowledge: list[KnowledgeItem],
    ) -> ProposalSection:
        source = knowledge[0].source if knowledge else "Synthetic Practice Library"
        return section.model_copy(
            update={
                "content": (
                    f"{section.content}\n\nRefined for {opportunity.customer}: this version adds a "
                    "clear owner, measurable checkpoint, and explicit transition to operations."
                ),
                "status": "Generated",
                "source_references": list(dict.fromkeys([*section.source_references, source])),
            }
        )


class FoundryAgentService:
    def __init__(self, settings: Settings):
        from azure.ai.agents import AgentsClient
        from azure.identity import DefaultAzureCredential

        required = {
            "AZURE_AI_FOUNDRY_PROJECT_ENDPOINT": settings.foundry_project_endpoint,
            "AIPF_REQUIREMENTS_AGENT_ID": settings.requirements_agent_id,
            "AIPF_PROPOSAL_AGENT_ID": settings.proposal_agent_id,
            "AIPF_RISK_AGENT_ID": settings.risk_agent_id,
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise ValueError(f"Foundry mode requires: {', '.join(missing)}")
        credential = DefaultAzureCredential(
            managed_identity_client_id=settings.azure_client_id
        )
        self.client = AgentsClient(
            endpoint=settings.foundry_project_endpoint,
            credential=credential,
        )
        self.agent_ids = {
            "requirements": settings.requirements_agent_id,
            "proposal": settings.proposal_agent_id,
            "risk": settings.risk_agent_id,
        }

    def _run_json(self, agent_key: str, payload: dict[str, Any]) -> Any:
        thread = self.client.threads.create()
        self.client.messages.create(
            thread_id=thread.id,
            role="user",
            content=(
                "Return only valid JSON with no markdown fences. Process this application payload:\n"
                + json.dumps(payload, ensure_ascii=False)
            ),
        )
        run = self.client.runs.create_and_process(
            thread_id=thread.id,
            agent_id=self.agent_ids[agent_key],
        )
        if str(run.status).lower() not in {"completed", "runstatus.completed"}:
            raise RuntimeError(f"{agent_key.title()} agent ended with status {run.status}")
        messages = self.client.messages.list(thread_id=thread.id)
        for message in messages:
            text = self._agent_message_text(message)
            if text is not None:
                return self._parse_json(text)
        raise RuntimeError(f"{agent_key.title()} agent returned no text response")

    @staticmethod
    def _agent_message_text(message: Any) -> str | None:
        role = getattr(message.role, "value", str(message.role)).lower()
        if role != "assistant":
            return None

        text_messages = getattr(message, "text_messages", None)
        if text_messages:
            value = getattr(getattr(text_messages[-1], "text", None), "value", None)
            if isinstance(value, str):
                return value

        for item in reversed(getattr(message, "content", None) or []):
            value = getattr(getattr(item, "text", None), "value", None)
            if isinstance(value, str):
                return value
        return None

    @staticmethod
    def _parse_json(text: str) -> Any:
        cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
        return json.loads(cleaned)

    def analyse_requirements(
        self, opportunity: Opportunity, documents: list[Document]
    ) -> dict[str, Any]:
        return self._run_json(
            "requirements",
            {
                "task": "Analyse requirements using the required structured fields.",
                "opportunity": opportunity.model_dump(),
                "documents": [doc.model_dump(include={"filename", "content"}) for doc in documents],
            },
        )

    def write_proposal(
        self,
        opportunity: Opportunity,
        analysis: dict[str, Any],
        knowledge: list[KnowledgeItem],
    ) -> list[ProposalSection]:
        result = self._run_json(
            "proposal",
            {
                "task": f"Generate exactly these sections: {', '.join(SECTION_TITLES)}.",
                "opportunity": opportunity.model_dump(),
                "analysis": analysis,
                "retrieved_knowledge": [item.model_dump() for item in knowledge],
                "response_shape": {
                    "sections": [
                        {"title": "string", "content": "string", "source_references": ["string"]}
                    ]
                },
            },
        )
        return [
            ProposalSection(
                id=f"section-{index:02d}",
                title=item["title"],
                content=item["content"],
                order=index,
                source_references=item.get("source_references", []),
            )
            for index, item in enumerate(result["sections"], 1)
        ]

    def review_risks(
        self, opportunity: Opportunity, sections: list[ProposalSection]
    ) -> list[RiskFinding]:
        result = self._run_json(
            "risk",
            {
                "task": "Identify risks, assumptions, dependencies, missing information, and open questions.",
                "opportunity": opportunity.model_dump(),
                "sections": [section.model_dump() for section in sections],
                "response_shape": {
                    "findings": [
                        {
                            "severity": "Low|Medium|High",
                            "category": "Risk|Assumption|Dependency|Missing Information|Open Question",
                            "description": "string",
                            "mitigation": "string",
                        }
                    ]
                },
            },
        )
        return [
            RiskFinding(id=f"risk-{uuid4().hex[:10]}", **item)
            for item in result["findings"]
        ]

    def regenerate_section(
        self,
        opportunity: Opportunity,
        section: ProposalSection,
        knowledge: list[KnowledgeItem],
    ) -> ProposalSection:
        result = self._run_json(
            "proposal",
            {
                "task": (
                    f"Regenerate only the requested section {section.id}: {section.title}. "
                    "Return the direct-section response shape below. Do not return other sections."
                ),
                "opportunity": opportunity.model_dump(),
                "current_section": section.model_dump(),
                "retrieved_knowledge": [item.model_dump() for item in knowledge],
                "response_shape": {
                    "id": section.id,
                    "title": section.title,
                    "content": "string",
                    "source_references": ["string"],
                },
            },
        )
        regenerated = self._extract_regenerated_section(result, section)
        return section.model_copy(
            update={
                "content": regenerated["content"],
                "source_references": regenerated["source_references"],
                "status": "Generated",
            }
        )

    @staticmethod
    def _extract_regenerated_section(
        result: Any, requested: ProposalSection
    ) -> dict[str, Any]:
        if not isinstance(result, dict):
            raise RuntimeError("Proposal Writer returned a non-object regeneration response")

        candidate: dict[str, Any]
        if "sections" in result:
            sections = result["sections"]
            if not isinstance(sections, list):
                raise RuntimeError("Proposal Writer regeneration 'sections' must be an array")
            matches = [
                item
                for item in sections
                if isinstance(item, dict)
                and (
                    item.get("id") == requested.id
                    or (
                        isinstance(item.get("title"), str)
                        and item["title"].strip().casefold()
                        == requested.title.strip().casefold()
                    )
                )
            ]
            if not matches:
                raise RuntimeError(
                    f"Proposal Writer response did not include requested section "
                    f"{requested.id}: {requested.title}"
                )
            if len(matches) > 1:
                raise RuntimeError(
                    f"Proposal Writer response included multiple matches for section {requested.id}"
                )
            candidate = matches[0]
        else:
            candidate = result

        response_id = candidate.get("id")
        if response_id is not None and response_id != requested.id:
            raise RuntimeError(
                f"Proposal Writer returned section id {response_id!r}; expected {requested.id!r}"
            )
        response_title = candidate.get("title")
        if response_title is not None and (
            not isinstance(response_title, str)
            or response_title.strip().casefold() != requested.title.strip().casefold()
        ):
            raise RuntimeError(
                f"Proposal Writer returned section title {response_title!r}; "
                f"expected {requested.title!r}"
            )

        content = candidate.get("content")
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError(
                f"Proposal Writer returned no usable content for section {requested.id}"
            )

        response_references = candidate.get("source_references")
        if response_references is None:
            response_references = []
        if not isinstance(response_references, list) or not all(
            isinstance(reference, str) for reference in response_references
        ):
            raise RuntimeError(
                f"Proposal Writer returned malformed source references for section {requested.id}"
            )
        references = list(
            dict.fromkeys([*requested.source_references, *response_references])
        )
        return {"content": content, "source_references": references}


def create_agent_service(settings: Settings) -> AgentService:
    if settings.demo_mode:
        return MockAgentService()
    return FoundryAgentService(settings)
