import {
  proposalSectionKeys,
  proposalSectionTitles,
  type AuditEvent,
  type AuditActor,
  type Citation,
  type DocumentMetadata,
  type ExportResult,
  type GenerationRun,
  type Opportunity,
  type OpportunityBrief,
  type OpportunityInput,
  type Proposal,
  type ProposalSection,
  type ProposalSectionKey,
  type ReusableContent,
  type RevisionSource,
  type RetrievalPreview,
  type RiskFinding
} from "@proposal-factory/contracts";

export class DomainError extends Error {
  constructor(message: string, public readonly code = "DOMAIN_RULE_VIOLATION") {
    super(message);
    this.name = "DomainError";
  }
}

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  next(prefix: string): string;
}

export interface OpportunityRepository {
  list(): Promise<Opportunity[]>;
  get(id: string): Promise<Opportunity | undefined>;
  save(opportunity: Opportunity): Promise<void>;
}

export interface DocumentRepository {
  list(opportunityId?: string): Promise<DocumentMetadata[]>;
  get(id: string): Promise<DocumentMetadata | undefined>;
  save(document: DocumentMetadata): Promise<void>;
}

export interface ContentRepository {
  search(query: string, filters?: { kind?: string; scenario?: string; industry?: string }): Promise<ReusableContent[]>;
  getContent(id: string): Promise<ReusableContent | undefined>;
  getMany(ids: string[]): Promise<ReusableContent[]>;
  saveContent(content: ReusableContent): Promise<void>;
}

export interface ProposalRepository {
  get(id: string): Promise<Proposal | undefined>;
  getByOpportunity(opportunityId: string): Promise<Proposal | undefined>;
  save(proposal: Proposal): Promise<void>;
}

export interface GenerationRunRepository {
  get(id: string): Promise<GenerationRun | undefined>;
  save(run: GenerationRun): Promise<void>;
}

export interface AuditRepository {
  list(opportunityId?: string): Promise<AuditEvent[]>;
  append(event: AuditEvent): Promise<void>;
}

export interface RetrievalAdapter {
  retrieve(opportunity: Opportunity, limit?: number): Promise<Citation[]>;
  preview(opportunity: Opportunity, limit?: number): Promise<RetrievalPreview>;
}

export interface ProposalDraft {
  sections: Record<ProposalSectionKey, string>;
  risks: RiskFinding[];
}

export interface ProposalGenerationAdapter {
  generate(opportunity: Opportunity, documents: DocumentMetadata[], citations: Citation[]): Promise<ProposalDraft>;
  regenerateSection(
    opportunity: Opportunity,
    proposal: Proposal,
    sectionKey: ProposalSectionKey,
    citations: Citation[]
  ): Promise<string>;
}

export function createOpportunityBrief(opportunity: Opportunity, documents: DocumentMetadata[]): OpportunityBrief {
  const selected = new Set(opportunity.selectedDocumentIds);
  if (documents.some((document) => !selected.has(document.id) ||
      (document.opportunityId && document.opportunityId !== opportunity.id))) {
    throw new DomainError("Opportunity brief documents must be selected for this opportunity.", "INVALID_DOCUMENT_SCOPE");
  }
  const {
    id: opportunityId, status, proposalStatus, proposalProgress, selectedDocumentIds,
    createdAt, updatedAt, ...facts
  } = opportunity;
  void status;
  void proposalStatus;
  void proposalProgress;
  void selectedDocumentIds;
  void createdAt;
  void updatedAt;
  return {
    opportunityId,
    facts,
    selectedDocuments: documents.map((document) => ({
      id: document.id,
      name: document.name,
      kind: document.kind,
      contentType: document.contentType,
      sizeBytes: document.sizeBytes,
      source: document.source,
      ...(document.storageProvider ? { storageProvider: document.storageProvider } : {}),
      ...(document.extractionMethod ? { extractionMethod: document.extractionMethod } : {}),
      createdAt: document.createdAt
    }))
  };
}

export interface ProposalExporter {
  exportMarkdown(proposal: Proposal, opportunity: Opportunity): Promise<{ result: ExportResult; body: Uint8Array }>;
  exportPdf(proposal: Proposal, opportunity: Opportunity): Promise<{ result: ExportResult; body: Uint8Array }>;
}

export function createOpportunity(
  input: OpportunityInput,
  dependencies: { clock: Clock; ids: IdGenerator }
): Opportunity {
  if (!input.customerName.trim() || !input.name.trim() || !input.businessProblem.trim()) {
    throw new DomainError("Customer, opportunity name, and business problem are required.");
  }
  if (input.estimatedValue < 0 || input.expectedDurationWeeks < 1) {
    throw new DomainError("Estimated value must be positive and duration must be at least one week.");
  }
  const now = dependencies.clock.now();
  return {
    ...input,
    id: dependencies.ids.next("opp"),
    status: "Discovery",
    proposalStatus: "Draft",
    proposalProgress: 0,
    selectedDocumentIds: [],
    createdAt: now,
    updatedAt: now
  };
}

export function createGeneratedProposal(
  opportunity: Opportunity,
  draft: ProposalDraft,
  citations: Citation[],
  dependencies: { clock: Clock; ids: IdGenerator; generationRunId: string }
): Proposal {
  const now = dependencies.clock.now();
  const sections = proposalSectionKeys.map<ProposalSection>((key) => {
    const revisionId = dependencies.ids.next("rev");
    return {
      key,
      title: proposalSectionTitles[key],
      required: true,
      currentRevisionId: revisionId,
      revisions: [
        {
          id: revisionId,
          revision: 1,
          content: draft.sections[key],
          source: "Generated",
          citationIds: citations.slice(0, key === "risks" ? 5 : 3).map((citation) => citation.id),
          createdAt: now
        }
      ]
    };
  });

  return {
    id: dependencies.ids.next("proposal"),
    opportunityId: opportunity.id,
    title: `${opportunity.customerName} — ${opportunity.name}`,
    status: "Generated",
    reviewVersion: dependencies.ids.next("review"),
    generationRunId: dependencies.generationRunId,
    sections,
    risks: draft.risks,
    citations,
    createdAt: now,
    updatedAt: now
  };
}

function currentRevision(section: ProposalSection) {
  const revision = section.revisions.find((item) => item.id === section.currentRevisionId);
  if (!revision) throw new DomainError(`Current revision missing for ${section.title}.`, "INVALID_PROPOSAL");
  return revision;
}

function replaceSection(
  proposal: Proposal,
  key: ProposalSectionKey,
  content: string,
  source: RevisionSource,
  dependencies: { clock: Clock; ids: IdGenerator }
): Proposal {
  if (!content.trim()) throw new DomainError("Proposal section content cannot be empty.");
  if (proposal.status === "Generating" || proposal.status === "Generation Failed") {
    throw new DomainError("This proposal is not ready for review.");
  }
  const now = dependencies.clock.now();
  const sections = proposal.sections.map((section) => {
    if (section.key !== key) return section;
    const previous = currentRevision(section);
    const revision = {
      id: dependencies.ids.next("rev"),
      revision: previous.revision + 1,
      content: content.trim(),
      source,
      citationIds: previous.citationIds,
      createdAt: now
    } as const;
    const nextSection: ProposalSection = {
      key: section.key,
      title: section.title,
      required: true,
      currentRevisionId: revision.id,
      revisions: [...section.revisions, revision]
    };
    return nextSection;
  });
  const { approvedAt, approvedBy, approvedReviewVersion, ...proposalWithoutApproval } = proposal;
  void approvedAt;
  void approvedBy;
  void approvedReviewVersion;
  return {
    ...proposalWithoutApproval,
    status: "In Review",
    reviewVersion: dependencies.ids.next("review"),
    sections,
    updatedAt: now
  };
}

export function editProposalSection(
  proposal: Proposal,
  key: ProposalSectionKey,
  content: string,
  dependencies: { clock: Clock; ids: IdGenerator }
) {
  return replaceSection(proposal, key, content, "Manual Edit", dependencies);
}

export function regenerateProposalSection(
  proposal: Proposal,
  key: ProposalSectionKey,
  content: string,
  dependencies: { clock: Clock; ids: IdGenerator }
) {
  return replaceSection(proposal, key, content, "Regenerated", dependencies);
}

export function approveProposalSection(
  proposal: Proposal, key: ProposalSectionKey, expectedRevisionId: string,
  dependencies: { clock: Clock; ids: IdGenerator; actor: AuditActor }
): Proposal {
  if (proposal.status === "Generating" || proposal.status === "Generation Failed") {
    throw new DomainError("This proposal is not ready for approval.");
  }
  const reviewed = proposal.sections.find((section) => section.key === key);
  if (!reviewed) throw new DomainError("Unknown proposal section.", "INVALID_SECTION");
  if (!expectedRevisionId || reviewed.currentRevisionId !== expectedRevisionId) {
    throw new DomainError("This section changed since you reviewed it. Refresh and review the latest content before approving.", "STALE_REVIEW");
  }
  if (reviewed.approvedRevisionId === expectedRevisionId && currentRevision(reviewed).approvedBy) return proposal;
  const now = dependencies.clock.now();
  const sections = proposal.sections.map((section) => {
    if (section.key !== key) return section;
    const revision = currentRevision(section);
    return {
      ...section,
      approvedRevisionId: revision.id,
      revisions: section.revisions.map((item) => (item.id === revision.id
        ? { ...item, approvedAt: now, approvedBy: dependencies.actor } : item))
    };
  });
  return { ...proposal, status: "In Review", reviewVersion: dependencies.ids.next("review"), sections, updatedAt: now };
}

export function approveCompleteProposal(
  proposal: Proposal, expectedReviewVersion: string, dependencies: { clock: Clock; actor: AuditActor }
): Proposal {
  if (!expectedReviewVersion || proposal.reviewVersion !== expectedReviewVersion) {
    throw new DomainError("The proposal changed since you reviewed it. Refresh and review the latest sections and approvals before approving.", "STALE_REVIEW");
  }
  if (proposal.status === "Approved" && proposal.approvedReviewVersion === expectedReviewVersion && proposal.approvedBy) return proposal;
  const pending = proposal.sections.filter(
    (section) => section.required && section.approvedRevisionId !== section.currentRevisionId
  );
  if (pending.length > 0) {
    throw new DomainError(
      `Approve all current required sections first: ${pending.map((section) => section.title).join(", ")}.`
    );
  }
  const now = dependencies.clock.now();
  return {
    ...proposal, status: "Approved", approvedAt: now, approvedBy: dependencies.actor,
    approvedReviewVersion: expectedReviewVersion, updatedAt: now
  };
}

export function getExportRevision(section: ProposalSection) {
  if (!section.approvedRevisionId) {
    throw new DomainError(`${section.title} does not have an approved revision.`);
  }
  const revision = section.revisions.find((item) => item.id === section.approvedRevisionId);
  if (!revision) throw new DomainError(`Approved revision missing for ${section.title}.`, "INVALID_PROPOSAL");
  return revision;
}

export function assertExportable(proposal: Proposal) {
  if (proposal.status !== "Approved") throw new DomainError("Only approved proposals can be exported.");
  proposal.sections.filter((section) => section.required).forEach(getExportRevision);
}
