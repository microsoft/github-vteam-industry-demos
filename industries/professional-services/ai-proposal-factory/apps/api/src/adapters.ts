import type {
  Citation,
  DocumentMetadata,
  ExportResult,
  Opportunity,
  Proposal,
  ProposalSectionKey,
  ReusableContent,
  RiskFinding
} from "@proposal-factory/contracts";
import { assertExportable, getExportRevision, type ContentRepository, type IdGenerator, type ProposalDraft } from "@proposal-factory/domain";
import { renderProposalPdf } from "./pdf-renderer.js";

export class FixtureRetrievalAdapter {
  constructor(private readonly content: ContentRepository) {}

  async retrieve(opportunity: Opportunity, limit = 8): Promise<Citation[]> {
    const all = await this.content.search("");
    return all
      .map((item) => ({
        item,
        score:
          (item.scenario === opportunity.scenario ? 60 : 0) +
          (item.industries.includes(opportunity.industry) ? 20 : 0) +
          item.tags.filter((tag) => opportunity.businessProblem.toLowerCase().includes(tag)).length * 5 +
          (item.kind === "Case Study" ? 4 : item.kind === "Delivery Methodology" ? 3 : 1)
      }))
      .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
      .slice(0, limit)
      .map(({ item, score }, index) => ({
        id: `citation-${opportunity.id}-${index + 1}`,
        contentId: item.id,
        title: item.title,
        kind: item.kind,
        excerpt: item.summary,
        relevance: Math.min(99, 70 + score / 4)
      }));
  }

  async preview(opportunity: Opportunity, limit?: number) {
    return {
      citations: await this.retrieve(opportunity, limit),
      mode: "fixture" as const,
      warnings: ["Deterministic fixture evidence; no Azure services were called."]
    };
  }
}

const sectionLead: Record<ProposalSectionKey, string> = {
  "executive-summary": "This proposal presents an outcome-led engagement",
  "customer-challenges": "Discovery indicates several connected challenges",
  "proposed-solution": "We propose a phased transformation program",
  scope: "The engagement scope focuses on the highest-value capabilities",
  deliverables: "The team will produce practical, reusable deliverables",
  "delivery-approach": "Delivery will combine advisory leadership with paired engineering",
  milestones: "Milestones create visible decision and value checkpoints",
  assumptions: "The plan is based on explicit working assumptions",
  dependencies: "Successful delivery depends on timely customer participation",
  risks: "The engagement will actively manage delivery and adoption risk",
  "success-criteria": "Success will be measured through business and delivery outcomes",
  "next-steps": "The immediate next step is a focused mobilization workshop"
};

export class FixtureProposalGenerationAdapter {
  async generate(
    opportunity: Opportunity,
    documents: DocumentMetadata[],
    citations: Citation[]
  ): Promise<ProposalDraft> {
    const sourceNames = citations.slice(0, 3).map((citation) => citation.title).join(", ");
    const documentNote =
      documents.length > 0
        ? `The draft also reflects ${documents.length} selected customer document${documents.length === 1 ? "" : "s"}.`
        : "The draft should be validated against customer meeting notes during mobilization.";
    const sections = Object.fromEntries(
      Object.entries(sectionLead).map(([key, lead]) => [
        key,
        `${lead} for **${opportunity.customerName}**. ${opportunity.businessProblem}\n\n` +
          `The work will ${opportunity.scope.charAt(0).toLowerCase()}${opportunity.scope.slice(1)} ` +
          `and target the following outcomes: ${opportunity.expectedOutcomes.join("; ")}. ${documentNote}\n\n` +
          `**Delivery commitment.** We will use transparent governance, fortnightly value reviews, and paired knowledge transfer. ` +
          `The initial plan assumes ${opportunity.expectedDurationWeeks} weeks and ${opportunity.budgetAssumptions.toLowerCase()}\n\n` +
          `Supporting organizational patterns: ${sourceNames}.`
      ])
    ) as Record<ProposalSectionKey, string>;

    sections.milestones =
      `1. **Mobilize and align (Weeks 1–2):** confirm outcomes, scope, governance, and access.\n` +
      `2. **Discover and design (Weeks 3–5):** baseline the current state and agree the target roadmap.\n` +
      `3. **Deliver priority capabilities (Weeks 6–${Math.max(8, opportunity.expectedDurationWeeks - 3)}):** release increments with user validation.\n` +
      `4. **Transition and scale (Final 3 weeks):** complete enablement, operational readiness, and next-wave planning.`;
    sections.assumptions = opportunity.constraints.map((item) => `- Customer and delivery teams will plan around: ${item}.`).join("\n");
    sections.dependencies =
      "- Named product owners and subject-matter experts are available for weekly decisions.\n" +
      "- Required environments, data, and access approvals are available by the agreed milestone.\n" +
      "- Customer change and communications leads participate throughout delivery.";
    sections.risks =
      "- **Environment readiness:** delayed access could compress delivery. Mitigation: readiness checklist during mobilization.\n" +
      "- **Decision latency:** unresolved priorities could create rework. Mitigation: weekly design authority with named delegates.\n" +
      "- **Adoption capacity:** operational teams may have limited change capacity. Mitigation: adoption plan and role-based enablement.";
    sections["success-criteria"] = opportunity.expectedOutcomes
      .map((outcome) => `- ${outcome} Baseline and target measures will be agreed in discovery.`)
      .join("\n");
    sections["next-steps"] =
      "1. Confirm executive sponsor and delivery owner.\n2. Schedule a 90-minute mobilization workshop.\n3. Validate scope, data/access readiness, and commercial assumptions.\n4. Agree the first value checkpoint.";

    const risks: RiskFinding[] = [
      {
        id: `risk-${opportunity.id}-1`,
        severity: "High",
        category: "Dependency",
        title: "Environment and data access readiness",
        description: "The target timeline depends on timely access to representative environments, data, and SMEs.",
        mitigation: "Complete a readiness checklist and assign owners during mobilization."
      },
      {
        id: `risk-${opportunity.id}-2`,
        severity: "Medium",
        category: "Assumption",
        title: "Customer decision capacity",
        description: "The plan assumes empowered stakeholders can make weekly scope and design decisions.",
        mitigation: "Create a decision forum with named delegates and a two-business-day escalation path."
      },
      {
        id: `risk-${opportunity.id}-3`,
        severity: "Medium",
        category: "Missing Information",
        title: "Outcome baselines require validation",
        description: "Current business and engineering baselines were not available in the intake.",
        mitigation: "Baseline measures in discovery before committing to quantified targets."
      },
      {
        id: `risk-${opportunity.id}-4`,
        severity: "Low",
        category: "Open Question",
        title: "Transition ownership",
        description: "The long-term owner for the delivered capability is not yet named.",
        mitigation: "Confirm an operational owner before the first delivery increment."
      }
    ];
    return { sections, risks };
  }

  async regenerateSection(
    opportunity: Opportunity,
    proposal: Proposal,
    sectionKey: ProposalSectionKey,
    citations: Citation[]
  ) {
    const current = proposal.sections.find((section) => section.key === sectionKey);
    const source = citations[0]?.title ?? "the reusable content library";
    return (
      `### Refined ${current?.title ?? sectionKey}\n\n` +
      `For ${opportunity.customerName}, this revision sharpens the emphasis on **${opportunity.expectedOutcomes[0]}**. ` +
      `${opportunity.scope}\n\n` +
      `The approach uses a measurable checkpoint at the end of each delivery phase, with explicit owners for decisions, risks, and customer enablement. ` +
      `It is grounded in ${source} and tailored to the ${opportunity.industry.toLowerCase()} operating context.`
    );
  }
}

function markdownDocument(proposal: Proposal, opportunity: Opportunity) {
  const sections = proposal.sections
    .map((section) => `## ${section.title}\n\n${getExportRevision(section).content}`)
    .join("\n\n");
  const risks = proposal.risks
    .map((risk) => `| ${risk.severity} | ${risk.category} | ${risk.title} | ${risk.mitigation} |`)
    .join("\n");
  const sources = proposal.citations
    .map((citation, index) => `${index + 1}. **${citation.title}** (${citation.kind}) — ${citation.excerpt}`)
    .join("\n");
  return `# ${proposal.title}

> **Approved proposal** · ${opportunity.industry} · ${opportunity.expectedDurationWeeks} weeks · ${new Intl.NumberFormat(
    "en-US",
    { style: "currency", currency: "USD", maximumFractionDigits: 0 }
  ).format(opportunity.estimatedValue)}

${sections}

## Risk Register

| Severity | Category | Finding | Mitigation |
|---|---|---|---|
${risks}

## Supporting Sources

${sources}

---

Prepared by AI Proposal Factory. All scope, effort, commercial, and risk statements require final customer validation.
`;
}

export class LocalProposalExporter {
  constructor(private readonly ids: IdGenerator) {}

  async exportMarkdown(proposal: Proposal, opportunity: Opportunity) {
    assertExportable(proposal);
    const createdAt = proposal.approvedAt ?? proposal.updatedAt;
    const result: ExportResult = {
      id: this.ids.next("export"),
      proposalId: proposal.id,
      format: "markdown",
      fileName: `${proposal.id}-approved.md`,
      contentType: "text/markdown; charset=utf-8",
      createdAt
    };
    return { result, body: new TextEncoder().encode(markdownDocument(proposal, opportunity)) };
  }

  async exportPdf(proposal: Proposal, opportunity: Opportunity) {
    assertExportable(proposal);
    const bytes = await renderProposalPdf(proposal, opportunity);
    const result: ExportResult = {
      id: this.ids.next("export"),
      proposalId: proposal.id,
      format: "pdf",
      fileName: `${proposal.id}-approved.pdf`,
      contentType: "application/pdf",
      createdAt: proposal.approvedAt ?? proposal.updatedAt
    };
    return { result, body: bytes };
  }
}

export function contentByCitation(items: ReusableContent[], citations: Citation[]) {
  return citations
    .map((citation) => items.find((item) => item.id === citation.contentId))
    .filter((item): item is ReusableContent => Boolean(item));
}
