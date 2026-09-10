from app.backend.models import Document, KnowledgeItem, Opportunity


OPPORTUNITIES = [
    ("opp-nordic-energy", "Nordic Renewable Group", "Connected Field Operations", "Energy", "€1.8M", "9 months", "Disconnected field systems slow maintenance and limit visibility.", ["Reduce unplanned downtime by 20%", "Give technicians one mobile workflow"], "Modernize field operations with a secure cloud data foundation.", ["VP Operations", "Field Service Lead", "CIO"], ["Winter rollout window", "Legacy telemetry protocols"]),
    ("opp-contoso-mobility", "Contoso Mobility", "Fleet Intelligence Platform", "Automotive", "€2.4M", "12 months", "Fleet data is fragmented across regional platforms.", ["Unify fleet insights", "Improve predictive maintenance"], "Create a governed lakehouse and AI-assisted fleet operations.", ["COO", "Head of Fleet", "Data Director"], ["EU data residency", "Phased vehicle integration"]),
    ("opp-fabrikam-health", "Fabrikam Health", "Care Coordination Modernization", "Healthcare", "€950K", "7 months", "Care teams rely on manual handoffs and duplicate updates.", ["Reduce coordination effort", "Improve patient journey visibility"], "Deliver a modern case coordination workspace using synthetic demo records.", ["Chief Medical Officer", "Care Operations"], ["Accessibility", "Clinical review gates"]),
    ("opp-adatum-retail", "Adatum Retail", "AI Customer Service Transformation", "Retail", "€1.3M", "8 months", "Service agents search multiple tools for product and policy answers.", ["Lower handling time", "Increase first-contact resolution"], "Introduce a governed AI assistant and consolidated knowledge experience.", ["Customer Service VP", "Digital Lead"], ["Peak-season change freeze", "Human escalation required"]),
    ("opp-litware-finance", "Litware Finance", "Regulatory Data Platform", "Financial Services", "€2.1M", "10 months", "Reporting teams reconcile inconsistent data manually.", ["Accelerate reporting", "Strengthen lineage and controls"], "Modernize data ingestion, quality, lineage, and reporting foundations.", ["CFO", "Chief Risk Officer", "Data Office"], ["Auditability", "Fixed reporting calendar"]),
    ("opp-tailspin-cloud", "Tailspin Manufacturing", "Cloud Application Renewal", "Manufacturing", "€1.6M", "9 months", "A core planning application is costly to change and scale.", ["Shorten release cycles", "Improve resilience"], "Incrementally modernize the application and platform engineering practices.", ["CIO", "Plant Systems Lead"], ["Zero production interruption", "Hybrid connectivity"]),
    ("opp-coho-media", "Coho Media", "Content Intelligence Accelerator", "Media", "€780K", "6 months", "Editorial teams cannot efficiently find and reuse archived content.", ["Improve content discovery", "Speed editorial research"], "Build a searchable content foundation with responsible generative AI.", ["Chief Digital Officer", "Editorial Operations"], ["Rights metadata", "Multilingual archive"]),
    ("opp-woodgrove-public", "Woodgrove Civic Services", "Citizen Service Digital Front Door", "Public Sector", "€1.1M", "8 months", "Citizens navigate fragmented service channels and repeated forms.", ["Increase digital completion", "Reduce avoidable contact"], "Create a unified, accessible service portal and case integration layer.", ["Service Director", "Accessibility Lead"], ["Public accessibility standards", "Procurement milestones"]),
    ("opp-proseware-tech", "Proseware Technologies", "Engineering Knowledge Copilot", "Technology", "€690K", "5 months", "Engineers lose time locating standards and prior solution decisions.", ["Reduce discovery time", "Improve standards reuse"], "Implement governed enterprise search and an engineering knowledge copilot.", ["CTO", "Engineering Enablement"], ["Source permissions", "Citation quality"]),
]


def build_opportunities() -> list[Opportunity]:
    return [
        Opportunity(
            id=item[0],
            customer=item[1],
            name=item[2],
            industry=item[3],
            estimated_value=item[4],
            delivery_duration=item[5],
            business_problem=item[6],
            expected_outcomes=item[7],
            scope=item[8],
            stakeholders=item[9],
            constraints=item[10],
            target_timeline="Start within 6 weeks of approval",
            budget_assumptions=f"{item[4]} planning envelope, refined after discovery.",
            notes="Fictional opportunity prepared for the AI Proposal Factory demo.",
        )
        for item in OPPORTUNITIES
    ]


KNOWLEDGE_COUNTS = {
    "Proposal Snippet": 18,
    "Case Study": 8,
    "Methodology": 5,
    "Service Description": 6,
    "Template": 3,
    "Pricing & Effort": 6,
}

TOPICS = [
    ("cloud-modernization", "Cloud modernization", "Technology", ["cloud", "application", "platform"]),
    ("ai-adoption", "Responsible AI adoption", "Cross-industry", ["ai", "governance", "copilot"]),
    ("data-platform", "Data platform modernization", "Financial Services", ["data", "analytics", "governance"]),
    ("application-modernization", "Application modernization", "Manufacturing", ["application", "devops", "resilience"]),
    ("customer-service", "Customer service transformation", "Retail", ["service", "knowledge", "automation"]),
    ("operating-model", "Product operating model", "Cross-industry", ["delivery", "adoption", "change"]),
]


def build_knowledge() -> list[KnowledgeItem]:
    items: list[KnowledgeItem] = []
    for item_type, count in KNOWLEDGE_COUNTS.items():
        slug = item_type.lower().replace(" & ", "-").replace(" ", "-")
        for index in range(count):
            topic = TOPICS[index % len(TOPICS)]
            items.append(
                KnowledgeItem(
                    id=f"knowledge-{slug}-{index + 1:02d}",
                    title=f"{topic[1]} — {item_type} {index + 1}",
                    type=item_type,
                    industry=topic[2],
                    tags=topic[3],
                    content=(
                        f"This reusable {item_type.lower()} recommends a phased {topic[1].lower()} "
                        "engagement with measurable outcomes, human review, architecture guardrails, "
                        "knowledge transfer, and an explicit transition to operations."
                    ),
                    source=f"Synthetic Practice Library / {item_type} / {index + 1:02d}",
                )
            )
    return items


def build_documents() -> list[Document]:
    documents = []
    for index, opportunity in enumerate(build_opportunities(), start=1):
        documents.append(
            Document(
                id=f"note-{index:02d}",
                opportunity_id=opportunity.id,
                filename=f"{opportunity.id}-discovery-notes.md",
                content_type="text/markdown",
                seeded=True,
                selected=index <= 3,
                content=(
                    f"# Discovery notes\n\nCustomer: {opportunity.customer}\n\n"
                    f"Priority: {opportunity.business_problem}\n\n"
                    f"Expected outcomes: {'; '.join(opportunity.expected_outcomes)}.\n\n"
                    "The customer prefers an incremental delivery with visible checkpoints, "
                    "clear adoption measures, and a jointly owned risk register."
                ),
            )
        )
    return documents
