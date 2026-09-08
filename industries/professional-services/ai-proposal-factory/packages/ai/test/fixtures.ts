import type { Citation, Opportunity, ReusableContent } from "@proposal-factory/contracts";
import { FixtureModelProvider } from "../src/fixture.js";
import { chunkContent } from "../src/knowledge.js";

export const opportunity: Opportunity = {
  id: "opp-ai-test", customerName: "Fictional Alder Services", name: "Knowledge pilot", industry: "Consulting",
  estimatedValue: 150000, expectedDurationWeeks: 12, businessProblem: "Approved knowledge is difficult to find.",
  expectedOutcomes: ["Reduce time spent locating approved information."], scope: "Deliver a grounded internal assistant pilot.",
  stakeholders: ["Fictional delivery owner"], constraints: ["Only approved content"], targetTimeline: "Q1 2027",
  budgetAssumptions: "Indicative effort subject to discovery.", additionalNotes: "", scenario: "AI adoption",
  status: "Qualified", proposalStatus: "Draft", proposalProgress: 0, selectedDocumentIds: [],
  createdAt: "2026-09-07T10:00:00Z", updatedAt: "2026-09-07T10:00:00Z"
};
export const source: ReusableContent = {
  id: "synthetic-source-01", title: "Synthetic AI pilot delivery method", kind: "Delivery Methodology",
  scenario: "AI adoption", industries: ["Consulting"], tags: ["AI", "advisory"],
  summary: "A synthetic example of a staged AI pilot.",
  body: "Validate approved knowledge sources, build a representative pilot, and agree acceptance evidence with the customer.",
  updatedAt: "2026-09-07T10:00:00Z"
};
export const chunk = chunkContent(source)[0]!;
export const citation: Citation = {
  id: `citation-${chunk.id}-${chunk.contentHash.slice(0, 12)}`, contentId: source.id,
  title: source.title, kind: source.kind, excerpt: source.body, relevance: 1
};
export const fixture = new FixtureModelProvider();
export const requirements = await fixture.analyze(opportunity, []);
export const draft = await fixture.draft(opportunity, requirements, [citation]);
