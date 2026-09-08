import { describe, expect, it } from "vitest";
import {
  approveCompleteProposal,
  approveProposalSection,
  createGeneratedProposal,
  createOpportunityBrief,
  editProposalSection,
  regenerateProposalSection
} from "../src/index.js";
import { proposalSectionKeys, type Opportunity, type ProposalSectionKey } from "@proposal-factory/contracts";

const clock = { now: () => "2026-09-07T09:00:00.000Z" };
let counter = 0;
const ids = { next: (prefix: string) => `${prefix}-${++counter}` };
const approvalDependencies = {
  clock, ids, actor: { actor: "Reviewer", actorId: "reviewer", actorTenantId: "tenant", actorType: "User" as const }
};
const approve = (value: ReturnType<typeof proposal>, key: ProposalSectionKey) =>
  approveProposalSection(value, key, value.sections.find((section) => section.key === key)!.currentRevisionId, approvalDependencies);
const opportunity: Opportunity = {
  id: "opp-1",
  customerName: "Northstar Foods",
  name: "Cloud modernization",
  industry: "Retail",
  estimatedValue: 500000,
  expectedDurationWeeks: 24,
  businessProblem: "Legacy platforms slow delivery.",
  expectedOutcomes: ["Faster releases"],
  scope: "Modernize customer ordering.",
  stakeholders: ["CTO"],
  constraints: ["Peak season"],
  targetTimeline: "Q1 2027",
  budgetAssumptions: "Fixed discovery",
  additionalNotes: "",
  scenario: "Cloud modernization",
  status: "Proposal",
  proposalStatus: "Generated",
  proposalProgress: 100,
  selectedDocumentIds: [],
  createdAt: clock.now(),
  updatedAt: clock.now()
};

function proposal() {
  const sections = Object.fromEntries(proposalSectionKeys.map((key) => [key, `Content for ${key}`])) as Record<
    ProposalSectionKey,
    string
  >;
  return createGeneratedProposal(
    opportunity,
    { sections, risks: [] },
    [],
    { clock, ids, generationRunId: "run-1" }
  );
}

describe("proposal approval transitions", () => {
  it("builds an opportunity brief from human facts and selected document metadata only", () => {
    const selected = {
      ...opportunity,
      selectedDocumentIds: ["doc-1"]
    };
    const brief = createOpportunityBrief(selected, [{
      id: "doc-1",
      opportunityId: opportunity.id,
      name: "customer-notes.txt",
      kind: "Meeting Notes",
      contentType: "text/plain",
      sizeBytes: 42,
      source: "Upload",
      summary: "Display summary",
      extractedText: "Customer text that must not be copied into the metadata-only brief.",
      storageProvider: "Local",
      extractionMethod: "Plain Text",
      createdAt: clock.now()
    }]);
    expect(brief.facts).toMatchObject({ customerName: opportunity.customerName, businessProblem: opportunity.businessProblem });
    expect(brief.selectedDocuments).toEqual([expect.objectContaining({
      id: "doc-1", name: "customer-notes.txt", source: "Upload", extractionMethod: "Plain Text"
    })]);
    expect(JSON.stringify(brief)).not.toContain("Display summary");
    expect(JSON.stringify(brief)).not.toContain("Customer text");
  });

  it("invalidates an approved section when it is edited or regenerated", () => {
    let result = approve(proposal(), "scope");
    expect(result.sections.find((section) => section.key === "scope")?.approvedRevisionId).toBeTruthy();
    result = editProposalSection(result, "scope", "Updated scope", { clock, ids });
    expect(result.sections.find((section) => section.key === "scope")?.approvedRevisionId).toBeUndefined();
    result = approve(result, "scope");
    result = regenerateProposalSection(result, "scope", "Regenerated scope", { clock, ids });
    expect(result.sections.find((section) => section.key === "scope")?.approvedRevisionId).toBeUndefined();
  });

  it("requires every current required section before complete approval", () => {
    let result = proposal();
    expect(() => approveCompleteProposal(result, result.reviewVersion, approvalDependencies)).toThrow(/Approve all current required sections/);
    for (const key of proposalSectionKeys) result = approve(result, key);
    result = approveCompleteProposal(result, result.reviewVersion, approvalDependencies);
    expect(result.status).toBe("Approved");
    expect(result.approvedAt).toBe(clock.now());
  });

  it("rejects stale reviews and preserves versions and actors on idempotent retries", () => {
    const seen = proposal();
    const edited = editProposalSection(seen, "scope", "Unseen scope", { clock, ids });
    expect(() => approveProposalSection(edited, "scope",
      seen.sections.find((section) => section.key === "scope")!.currentRevisionId, approvalDependencies))
      .toThrow(expect.objectContaining({ code: "STALE_REVIEW" }));
    let result = edited;
    for (const key of proposalSectionKeys) result = approve(result, key);
    expect(() => approveCompleteProposal(result, seen.reviewVersion, approvalDependencies))
      .toThrow(expect.objectContaining({ code: "STALE_REVIEW" }));
    const approved = approveCompleteProposal(result, result.reviewVersion, approvalDependencies);
    expect(approve(approved, "scope")).toBe(approved);
    expect(approveCompleteProposal(approved, result.reviewVersion, approvalDependencies)).toBe(approved);
    expect(approved.approvedBy).toEqual(approvalDependencies.actor);
    expect(approved.approvedReviewVersion).toBe(result.reviewVersion);
    const regenerated = regenerateProposalSection(approved, "scope", "New generation", { clock, ids });
    expect(regenerated.approvedBy).toBeUndefined();
    expect(regenerated.approvedReviewVersion).toBeUndefined();
    expect(regenerated.reviewVersion).not.toBe(approved.reviewVersion);
  });
});
