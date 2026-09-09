import { proposalSectionKeys, type Citation, type DocumentMetadata, type Opportunity, type Proposal,
  type ProposalSectionKey } from "@proposal-factory/contracts";
import type { RetrievalAdapter } from "@proposal-factory/domain";
import type { KnowledgeRetriever, ModelProvider } from "./providers.js";
import type { RequirementsAnalysis, RiskReview, StructuredDraft } from "./schemas.js";

export class FixtureKnowledgeRetriever implements KnowledgeRetriever {
  constructor(private readonly adapter: RetrievalAdapter) {}
  async retrieveEvidence(opportunity: Opportunity, _requirements?: RequirementsAnalysis, limit?: number) {
    const citations = await this.adapter.retrieve(opportunity, limit);
    return {
      citations,
      mode: "fixture" as const,
      warnings: ["Deterministic fixture evidence; no Azure services were called."],
      activity: {
        successfulRetrievalOperations: 1,
        successfulEmbeddingOperations: 0,
        fallbacks: []
      }
    };
  }
}

export class FixtureModelProvider implements ModelProvider {
  readonly mode = "fixture" as const;

  async analyze(opportunity: Opportunity, documents: DocumentMetadata[]): Promise<RequirementsAnalysis> {
    return {
      businessGoals: opportunity.expectedOutcomes.length ? opportunity.expectedOutcomes : ["Validate desired customer outcomes."],
      businessProblems: [opportunity.businessProblem],
      scope: [opportunity.scope || "Confirm engagement scope."],
      stakeholders: opportunity.stakeholders,
      constraints: opportunity.constraints,
      successCriteria: opportunity.expectedOutcomes,
      timelines: [opportunity.targetTimeline || "Timeline requires confirmation."],
      openQuestions: ["Confirm outcome baselines, acceptance owners, and environment readiness."],
      documentIds: documents.map((doc) => doc.id)
    };
  }

  async draft(opportunity: Opportunity, requirements: RequirementsAnalysis, citations: Citation[]): Promise<StructuredDraft> {
    const bullets = (values: string[]) => values.map((value) => `- ${value}`).join("\n");
    const content: Record<ProposalSectionKey, string> = {
      "executive-summary": `Proposed engagement for **${opportunity.customerName}**: ${opportunity.name}.\n\n${opportunity.businessProblem}\n\nTarget outcomes:\n${bullets(requirements.businessGoals)}`,
      "customer-challenges": `${opportunity.businessProblem}\n\nDiscovery will validate the current operating baseline with customer stakeholders. No quantified improvement is guaranteed.`,
      "proposed-solution": `Use a phased ${opportunity.scenario.toLowerCase()} engagement to address the agreed business outcomes.\n\n${opportunity.scope}\n\nValidate the architecture and a representative pilot before scaling.`,
      scope: `${opportunity.scope}\n\nPrioritize one agreed pilot and document exclusions during discovery. Any material scope change requires customer and delivery-owner agreement.`,
      deliverables: "- Discovery findings and prioritized requirements.\n- Target design and delivery backlog.\n- Demonstrable pilot with agreed acceptance evidence.\n- Operational handover and customer enablement materials.",
      "delivery-approach": `Delivery pairs customer specialists with a multidisciplinary team. Use short iterations, weekly decisions, demonstrations and knowledge transfer.\n\nNamed stakeholder inputs:\n${bullets(requirements.stakeholders.length ? requirements.stakeholders : ["Customer sponsor to be confirmed."])}`,
      milestones: `1. Mobilize: validate scope, access and decision owners.\n2. Discover and design: approve the prioritized plan.\n3. Deliver and validate: demonstrate the agreed pilot.\n4. Transition: confirm operational acceptance.\n\nThe working duration is ${opportunity.expectedDurationWeeks} weeks; detailed dates remain subject to readiness. Target: ${opportunity.targetTimeline}.`,
      assumptions: `${bullets(requirements.constraints.length ? requirements.constraints : ["Customer constraints will be confirmed during discovery."])}\n\nCommercial working assumption: ${opportunity.budgetAssumptions || "Budget requires confirmation."} This is not a binding quotation.`,
      dependencies: "- Customer provides approved access, representative data and environments.\n- Named decision makers attend weekly reviews.\n- Security and operational owners validate readiness before pilot release.",
      risks: "- Delayed access could reduce effective delivery time; agree readiness owners.\n- Unclear acceptance criteria could create rework; baseline criteria during discovery.\n- Limited customer change capacity could slow adoption; plan enablement early.",
      "success-criteria": `${bullets(requirements.successCriteria.length ? requirements.successCriteria : ["Agree measurable success criteria in discovery."])}\n\nBaseline measurements and acceptance owners must be confirmed before committing to target values.`,
      "next-steps": "1. Confirm the sponsor and delivery owner.\n2. Schedule a mobilization workshop.\n3. Validate scope, budget assumptions, access and acceptance criteria.\n4. Agree the first delivery checkpoint."
    };
    return {
      sections: Object.fromEntries(proposalSectionKeys.map((key) => [key, {
        content: `${content[key]}\n\n${citations.length ? "Synthetic organizational examples inform this proposed approach; customer validation is required." : "No organizational evidence was found; this draft relies only on intake and proposed assumptions."}\n\n_Deterministic fixture draft._`,
        citationIds: ["assumptions", "next-steps", "customer-challenges", "success-criteria"].includes(key) ? [] : citations.slice(0, 3).map((citation) => citation.id)
      }])) as StructuredDraft["sections"]
    };
  }

  async review(): Promise<RiskReview> {
    return { findings: [
      { severity: "High", category: "Dependency", title: "Environment readiness", description: "The plan assumes timely access to approved environments and data.", mitigation: "Assign readiness owners and confirm access before mobilization.", citationIds: [] },
      { severity: "Medium", category: "Assumption", title: "Decision capacity", description: "The working approach assumes empowered customer stakeholders can make weekly decisions.", mitigation: "Name decision makers and an escalation route.", citationIds: [] },
      { severity: "Medium", category: "Missing Information", title: "Outcome baselines", description: "Current baselines and target values require customer validation.", mitigation: "Agree measures and acceptance owners in discovery.", citationIds: [] },
      { severity: "Low", category: "Open Question", title: "Transition ownership", description: "Long-term ownership should be confirmed before delivery completes.", mitigation: "Assign an operational owner and agree handover evidence.", citationIds: [] }
    ] };
  }

  async regenerate(opportunity: Opportunity, requirements: RequirementsAnalysis, _proposal: Proposal,
    key: ProposalSectionKey, citations: Citation[]) {
    const section = (await this.draft(opportunity, requirements, citations)).sections[key];
    return { ...section, content: `${section.content}\n\nRefined checkpoint: confirm the responsible owner and acceptance evidence before progressing.` };
  }
}
