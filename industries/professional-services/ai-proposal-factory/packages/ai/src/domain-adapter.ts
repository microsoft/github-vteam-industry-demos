import { proposalSectionKeys, type Citation, type DocumentMetadata, type Opportunity,
  type Proposal, type ProposalSectionKey } from "@proposal-factory/contracts";
import type { ProposalGenerationAdapter } from "@proposal-factory/domain";
import type { ModelProvider } from "./providers.js";

/** Compatibility adapter for consumers that already own retrieval and persistence. */
export class ProviderGenerationAdapter implements ProposalGenerationAdapter {
  constructor(private readonly model: ModelProvider) {}
  async generate(opportunity: Opportunity, documents: DocumentMetadata[], citations: Citation[]) {
    const requirements = await this.model.analyze(opportunity, documents);
    const draft = await this.model.draft(opportunity, requirements, citations);
    const review = await this.model.review(opportunity, requirements, draft, citations);
    return {
      sections: Object.fromEntries(proposalSectionKeys.map((key) => [key, draft.sections[key].content])) as Record<ProposalSectionKey, string>,
      risks: review.findings.map(({ citationIds, ...finding }, index) => {
        void citationIds;
        return { ...finding, id: `risk-${opportunity.id}-${index + 1}` };
      })
    };
  }
  async regenerateSection(opportunity: Opportunity, proposal: Proposal, key: ProposalSectionKey, citations: Citation[]) {
    const requirements = await this.model.analyze(opportunity, []);
    return (await this.model.regenerate(opportunity, requirements, proposal, key, citations)).content;
  }
}
