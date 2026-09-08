import type {
  DocumentMetadata,
  Opportunity,
  ReusableContent,
  ScenarioCategory
} from "@proposal-factory/contracts";

const now = "2026-09-07T09:00:00.000Z";
const scenarios: ScenarioCategory[] = [
  "Cloud modernization",
  "AI adoption",
  "Data platform modernization",
  "Application modernization",
  "Customer service transformation"
];

const scenarioDetails: Record<
  ScenarioCategory,
  { customer: string; industry: string; problem: string; outcome: string; scope: string; service: string }
> = {
  "Cloud modernization": {
    customer: "Northstar Foods",
    industry: "Retail",
    problem: "Aging datacenter workloads and manual release processes limit seasonal scale.",
    outcome: "Reduce infrastructure lead time and improve platform resilience.",
    scope: "Assess, migrate, and optimize customer ordering and supply-chain workloads.",
    service: "Azure landing zone and workload migration accelerator"
  },
  "AI adoption": {
    customer: "Lumina Health",
    industry: "Healthcare",
    problem: "Knowledge workers cannot consistently find approved clinical operations guidance.",
    outcome: "Deliver grounded AI assistants with measurable adoption and governance.",
    scope: "Prioritize use cases, establish responsible AI controls, and deliver an adoption pilot.",
    service: "Responsible AI adoption accelerator"
  },
  "Data platform modernization": {
    customer: "Asteron Logistics",
    industry: "Transportation",
    problem: "Fragmented operational data delays route and capacity decisions.",
    outcome: "Create trusted, near-real-time data products and self-service analytics.",
    scope: "Modernize ingestion, lakehouse, governance, and priority operations dashboards.",
    service: "Modern data platform foundation"
  },
  "Application modernization": {
    customer: "Cobalt Insurance",
    industry: "Financial Services",
    problem: "A monolithic policy platform makes product changes slow and risky.",
    outcome: "Increase release frequency while reducing operational risk.",
    scope: "Decompose priority journeys, modernize engineering practices, and establish a cloud platform.",
    service: "Application modernization discovery and delivery"
  },
  "Customer service transformation": {
    customer: "Evergreen Energy",
    industry: "Energy",
    problem: "Contact-center teams use disconnected tools and inconsistent service processes.",
    outcome: "Improve first-contact resolution and reduce average handling time.",
    scope: "Redesign service journeys, consolidate agent knowledge, and automate high-volume interactions.",
    service: "Digital contact-center transformation"
  }
};

export function createFixtureOpportunities(): Opportunity[] {
  return scenarios.flatMap((scenario, scenarioIndex) => {
    const details = scenarioDetails[scenario];
    return [0, 1].map((variant) => {
      const sequence = scenarioIndex * 2 + variant + 1;
      return {
        id: `opp-${sequence.toString().padStart(2, "0")}`,
        customerName: variant === 0 ? details.customer : `${details.customer.split(" ")[0]} Ventures`,
        name: variant === 0 ? `${scenario} program` : `${scenario} discovery`,
        industry: details.industry,
        estimatedValue: 280000 + sequence * 85000,
        expectedDurationWeeks: 12 + (sequence % 5) * 4,
        businessProblem: details.problem,
        expectedOutcomes: [details.outcome, "Create a repeatable delivery foundation."],
        scope: details.scope,
        stakeholders: ["Executive sponsor", "Program lead", "Technology owner"],
        constraints: ["Maintain business continuity", "Use approved cloud services", "Complete within target quarter"],
        targetTimeline: sequence % 2 === 0 ? "Q1 2027" : "Q4 2026",
        budgetAssumptions: `${1200 + sequence * 50} consulting hours with a blended delivery team.`,
        additionalNotes: "Customer expects an outcome-focused roadmap and transparent delivery governance.",
        scenario,
        status: sequence < 3 ? "Discovery" : sequence < 6 ? "Qualified" : sequence < 9 ? "Proposal" : "Negotiation",
        proposalStatus: "Draft",
        proposalProgress: 0,
        selectedDocumentIds: [`doc-${sequence.toString().padStart(2, "0")}`],
        createdAt: now,
        updatedAt: new Date(Date.parse(now) - sequence * 86_400_000).toISOString()
      };
    });
  });
}

export function createFixtureContent(): ReusableContent[] {
  const content: ReusableContent[] = [];
  scenarios.forEach((scenario, scenarioIndex) => {
    const details = scenarioDetails[scenario];
    for (let index = 1; index <= 4; index += 1) {
      content.push({
        id: `snippet-${scenarioIndex + 1}-${index}`,
        title: `${scenario} proposal pattern ${index}`,
        kind: "Proposal Snippet",
        scenario,
        industries: [details.industry, "Cross-industry"],
        tags: [scenario.toLowerCase(), "proposal", index % 2 ? "governance" : "delivery"],
        summary: `Reusable ${scenario.toLowerCase()} language focused on ${index % 2 ? "business outcomes" : "delivery execution"}.`,
        body: `Our ${details.service} aligns executive outcomes to an incremental delivery plan, measurable checkpoints, and knowledge transfer. Pattern ${index} emphasizes ${details.outcome.toLowerCase()}`,
        updatedAt: now
      });
    }
    for (let index = 1; index <= 2; index += 1) {
      content.push({
        id: `case-${scenarioIndex + 1}-${index}`,
        title: `${["Fabrikam", "Contoso"][index - 1]} ${scenario.toLowerCase()} case study`,
        kind: "Case Study",
        scenario,
        industries: [details.industry],
        tags: [scenario.toLowerCase(), "case-study", index === 1 ? "adoption" : "value"],
        summary: `Fictional client achieved measurable value through a phased ${scenario.toLowerCase()} engagement.`,
        body: `A six-month engagement established the foundation, delivered two priority use cases, and enabled the client team. The fictional program improved lead time by ${25 + scenarioIndex * 5}% and met agreed governance outcomes.`,
        updatedAt: now
      });
    }
    content.push(
      {
        id: `method-${scenarioIndex + 1}`,
        title: `${scenario} delivery methodology`,
        kind: "Delivery Methodology",
        scenario,
        industries: ["Cross-industry"],
        tags: [scenario.toLowerCase(), "discover", "deliver", "enable"],
        summary: "A four-phase approach covering discovery, foundation, iterative delivery, and transition.",
        body: "Discover aligns outcomes and constraints. Establish creates the technical and governance foundation. Deliver releases prioritized increments. Enable transfers ownership through paired delivery, playbooks, and measurable readiness.",
        updatedAt: now
      },
      {
        id: `service-${scenarioIndex + 1}`,
        title: details.service,
        kind: "Service Description",
        scenario,
        industries: [details.industry, "Cross-industry"],
        tags: [scenario.toLowerCase(), "service", "professional-services"],
        summary: `A packaged service for organizations starting a ${scenario.toLowerCase()} journey.`,
        body: `The service combines advisory, architecture, engineering, adoption, and governance capabilities. It produces an actionable roadmap and working priority capabilities while developing customer ownership.`,
        updatedAt: now
      },
      {
        id: `pricing-${scenarioIndex + 1}`,
        title: `${scenario} effort assumptions`,
        kind: "Pricing Assumption",
        scenario,
        industries: ["Cross-industry"],
        tags: [scenario.toLowerCase(), "pricing", "effort"],
        summary: "Synthetic effort model for planning and demo purposes.",
        body: `Assume a 16- to 24-week engagement with a blended team of solution architecture, engineering, change, and delivery roles. Final effort depends on discovery findings, customer availability, and environment readiness.`,
        updatedAt: now
      }
    );
  });
  return content;
}

export function createFixtureDocuments(): DocumentMetadata[] {
  return scenarios.flatMap((scenario, scenarioIndex) => {
    const details = scenarioDetails[scenario];
    return [0, 1].map((variant) => {
      const sequence = scenarioIndex * 2 + variant + 1;
      return {
        id: `doc-${sequence.toString().padStart(2, "0")}`,
        name: `${details.customer} ${variant === 0 ? "discovery meeting notes" : "requirements workshop"}.md`,
        kind: variant === 0 ? "Meeting Notes" : "Requirements",
        contentType: "text/markdown",
        sizeBytes: 4200 + sequence * 137,
        source: "Fixture",
        summary: `${scenario} notes covering priorities, stakeholders, constraints, success measures, and open decisions.`,
        createdAt: now
      };
    });
  });
}
