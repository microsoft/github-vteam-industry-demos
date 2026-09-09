import { createHash, randomUUID } from "node:crypto";
import type {
  AuditEventType,
  AuditActor,
  DocumentKind,
  GenerationRun,
  OpportunityInput,
  Proposal,
  ProposalSectionKey,
  ReusableContentInput
} from "@proposal-factory/contracts";
import {
  approveCompleteProposal,
  approveProposalSection,
  createOpportunityBrief,
  createGeneratedProposal,
  createOpportunity,
  editProposalSection,
  regenerateProposalSection,
  type Clock,
  type AuditRepository,
  type ContentRepository,
  type DocumentRepository,
  type GenerationRunRepository,
  type IdGenerator,
  type OpportunityRepository,
  type ProposalRepository,
  type RetrievalAdapter
} from "@proposal-factory/domain";
import { AiError, ProviderGenerationAdapter, applyCitationMapping, classifyFailure } from "@proposal-factory/ai";
import { createAiRuntime, type AiRuntime } from "./ai-runtime.js";
import { FixtureRetrievalAdapter, LocalProposalExporter } from "./adapters.js";
import type { AzureProposalWorkflow } from "./ai-azure-workflow.js";
import { AccessError, currentAuditActor } from "./auth.js";
import {
  DocumentUploadPersistenceError,
  type DocumentContentStorage
} from "./document-storage.js";

export interface ApplicationStore extends OpportunityRepository, ContentRepository {
  documents: DocumentRepository;
  proposals: ProposalRepository;
  runs: GenerationRunRepository;
  audit: AuditRepository;
}

// Local mode is single-process; share the boundary across applications using the same store.
const localMutations = new WeakMap<ApplicationStore, Map<string, Promise<unknown>>>();

export class SystemClock implements Clock {
  now() {
    return new Date().toISOString();
  }
}

export class SequentialIds implements IdGenerator {
  private sequence = 0;
  next(prefix: string) {
    this.sequence += 1;
    return `${prefix}-${Date.now().toString(36)}-${this.sequence.toString(36)}-${randomUUID()}`;
  }
}

export interface ApplicationDependencies {
  store: ApplicationStore;
  clock: Clock;
  ids: IdGenerator;
  ai?: AiRuntime;
  aiStatePath?: string;
  workflow?: AzureProposalWorkflow;
  documentStorage: DocumentContentStorage;
}

export class ProposalFactoryApplication {
  readonly ai: AiRuntime;
  readonly retrieval: RetrievalAdapter;
  readonly generation: ProviderGenerationAdapter;
  readonly exporter: LocalProposalExporter;

  constructor(readonly dependencies: ApplicationDependencies) {
    this.ai = dependencies.ai ?? createAiRuntime(new FixtureRetrievalAdapter(dependencies.store),
      dependencies.aiStatePath ? { statePath: dependencies.aiStatePath } : {});
    this.retrieval = this.ai.retrieval;
    this.generation = new ProviderGenerationAdapter(this.ai.orchestrator.provider);
    this.exporter = new LocalProposalExporter(dependencies.ids);
  }

  private async audit(
    opportunityId: string,
    type: AuditEventType,
    description: string,
    metadata: Record<string, string | number | boolean> = {},
    proposalId?: string,
    actor: AuditActor = currentAuditActor()
  ) {
    await this.dependencies.store.audit.append({
      id: this.dependencies.ids.next("audit"),
      opportunityId,
      ...(proposalId ? { proposalId } : {}),
      type,
      ...actor,
      description,
      metadata,
      occurredAt: this.dependencies.clock.now()
    });
  }

  async dashboard() {
    const opportunities = await this.dependencies.store.list();
    return {
      opportunities: opportunities.length,
      activeValue: opportunities
        .filter((item) => item.status !== "Won")
        .reduce((total, item) => total + item.estimatedValue, 0),
      proposalsInReview: opportunities.filter((item) => item.proposalStatus === "In Review").length,
      approvedProposals: opportunities.filter((item) => item.proposalStatus === "Approved").length
    };
  }

  async listOpportunities() {
    return this.dependencies.store.list();
  }

  async getOpportunity(id: string) {
    return this.dependencies.store.get(id);
  }

  async createOpportunity(input: OpportunityInput) {
    const opportunity = createOpportunity(input, this.dependencies);
    await this.dependencies.store.save(opportunity);
    await this.audit(opportunity.id, "Opportunity Created", `Created ${opportunity.name} for ${opportunity.customerName}.`);
    return opportunity;
  }

  async listDocuments(opportunityId?: string) {
    return this.dependencies.store.documents.list(opportunityId);
  }

  async getDocument(opportunityId: string, documentId: string) {
    const document = await this.dependencies.store.documents.get(documentId);
    if (!document || (document.opportunityId && document.opportunityId !== opportunityId)) return;
    return document;
  }

  async uploadDocument(
    opportunityId: string,
    input: { name: string; kind: DocumentKind; contentType: string; data: Uint8Array }
  ) {
    return this.mutateOpportunity(opportunityId, () => this.uploadDocumentCore(opportunityId, input));
  }

  private async uploadDocumentCore(
    opportunityId: string,
    input: { name: string; kind: DocumentKind; contentType: string; data: Uint8Array }
  ) {
    const opportunity = await this.dependencies.store.get(opportunityId);
    if (!opportunity) return;
    const documentId = this.dependencies.ids.next("doc");
    const stored = await this.dependencies.documentStorage.uploadDocument({
      documentId,
      opportunityId,
      fileName: input.name,
      kind: input.kind,
      contentType: input.contentType,
      sizeBytes: input.data.byteLength,
      data: input.data
    });
    const summary =
      stored.extractedText.length > 320
        ? `${stored.extractedText.slice(0, 317).trimEnd()}…`
        : stored.extractedText;
    const document = {
      id: documentId,
      opportunityId,
      name: stored.originalName,
      kind: input.kind,
      contentType: stored.contentType,
      sizeBytes: stored.sizeBytes,
      source: "Upload" as const,
      summary,
      extractedText: stored.extractedText,
      storageProvider: stored.storageProvider,
      storageKey: stored.storageKey,
      sha256: stored.sha256,
      extractionMethod: stored.extractionMethod,
      extractedTextCharacters: stored.extractedText.length,
      createdAt: this.dependencies.clock.now()
    };
    try {
      await this.dependencies.store.documents.save(document);
    } catch (metadataError) {
      try {
        await this.dependencies.documentStorage.deleteDocument(stored.storageKey);
      } catch (cleanupError) {
        throw new DocumentUploadPersistenceError(
          stored.storageKey,
          new AggregateError([metadataError, cleanupError], "Metadata persistence and storage cleanup failed.")
        );
      }
      throw metadataError;
    }
    await this.audit(opportunityId, "Document Uploaded", `Uploaded ${document.name}.`, {
      documentId: document.id,
      sizeBytes: document.sizeBytes
    });
    return document;
  }

  async selectDocuments(opportunityId: string, documentIds: string[]) {
    return this.mutateOpportunity(opportunityId, () => this.selectDocumentsCore(opportunityId, documentIds));
  }

  private async selectDocumentsCore(opportunityId: string, documentIds: string[]) {
    const opportunity = await this.dependencies.store.get(opportunityId);
    if (!opportunity) return;
    const available = new Set((await this.dependencies.store.documents.list(opportunityId)).map((document) => document.id));
    if (documentIds.some((id) => !available.has(id))) {
      throw new AccessError(403, "DOCUMENT_ACCESS_DENIED", "Select documents belonging to this opportunity or the shared demo library.");
    }
    const updated = {
      ...opportunity,
      selectedDocumentIds: [...new Set(documentIds)],
      updatedAt: this.dependencies.clock.now()
    };
    await this.dependencies.store.save(updated);
    await this.audit(opportunityId, "Documents Selected", `Selected ${documentIds.length} source documents.`, {
      count: documentIds.length
    });
    return updated;
  }

  async searchContent(query: string, filters: { kind?: string; scenario?: string; industry?: string }) {
    return this.dependencies.store.search(query, filters);
  }

  async getContent(id: string) {
    return this.dependencies.store.getContent(id);
  }

  async createContent(input: ReusableContentInput) {
    const content = {
      ...input,
      id: this.dependencies.ids.next("content"),
      updatedAt: this.dependencies.clock.now()
    };
    await this.dependencies.store.saveContent(content);
    return content;
  }

  async previewRetrieval(opportunityId: string) {
    const opportunity = await this.dependencies.store.get(opportunityId);
    if (!opportunity) return;
    return this.retrieval.preview(opportunity);
  }

  async startGeneration(opportunityId: string) {
    if (this.dependencies.workflow) return this.dependencies.workflow.startGeneration(opportunityId);
    return this.mutateOpportunity(opportunityId, () => this.startGenerationCore(opportunityId));
  }

  private async startGenerationCore(opportunityId: string) {
    const opportunity = await this.dependencies.store.get(opportunityId);
    if (!opportunity) return;
    if (opportunity.proposalStatus === "Generating") throw new AiError("GENERATION_IN_PROGRESS", "A proposal run is already in progress.");
    const now = this.dependencies.clock.now();
    const documents = (await this.dependencies.store.documents.list(opportunityId))
      .filter((document) => opportunity.selectedDocumentIds.includes(document.id))
      .map((document) => ({
        ...document,
        summary: document.extractedText ?? document.summary
      }));
    const run: GenerationRun = {
      requestedBy: currentAuditActor(),
      id: this.dependencies.ids.next("run"),
      opportunityId,
      proposalId: (await this.dependencies.store.proposals.getByOpportunity(opportunityId))?.id ??
        this.dependencies.ids.next("proposal"),
      status: "Running",
      progress: 5,
      stages: [
        {
          key: "requirements",
          label: "Analyze requirements",
          detail: "Extracting goals, scope, constraints, stakeholders, and open questions.",
          status: "Running",
          execution: "not-executed",
          completedOperations: 0
        },
        {
          key: "retrieval",
          label: "Retrieve organizational knowledge",
          detail: "Finding relevant proposals, case studies, services, and methods.",
          status: "Pending",
          execution: "not-executed",
          completedOperations: 0
        },
        {
          key: "drafting",
          label: "Draft proposal",
          detail: "Creating all twelve required proposal sections.",
          status: "Pending",
          execution: "not-executed",
          completedOperations: 0
        },
        {
          key: "risk-review",
          label: "Review risks",
          detail: "Surfacing assumptions, dependencies, ambiguity, and open questions.",
          status: "Pending",
          execution: "not-executed",
          completedOperations: 0
        }
      ],
      retrievedContentIds: [],
      opportunityBrief: createOpportunityBrief(opportunity, documents),
      retrieval: { mode: "pending", warnings: [] },
      providerEvidence: {
        provider: this.ai.config.provider,
        successfulModelOperations: 0,
        successfulRetrievalOperations: 0,
        successfulEmbeddingOperations: 0,
        deterministicOperations: 0,
        fallbacks: []
      },
      startedAt: now
    };
    await this.ai.state.saveJob({ id: run.id, type: "GenerateProposal", opportunity, documents });
    await this.dependencies.store.runs.save(run);
    await this.dependencies.store.save({
      ...opportunity,
      proposalStatus: "Generating",
      proposalProgress: 5,
      updatedAt: now
    });
    await this.audit(opportunityId, "Proposal Generation Started", `Started ${this.ai.config.provider} proposal generation.`,
      { provider: this.ai.config.provider }, run.proposalId);
    return run;
  }

  async getGenerationRun(id: string, advance = true) {
    if (this.dependencies.workflow) return this.dependencies.store.runs.get(id);
    const run = await this.dependencies.store.runs.get(id);
    if (!run) return;
    return this.mutateOpportunity(run.opportunityId,
      () => this.ai.state.exclusive(`application-${id}`, () => this.advanceGenerationRun(id, advance)), true);
  }

  private async advanceGenerationRun(id: string, advance: boolean) {
    const run = await this.dependencies.store.runs.get(id);
    if (!run || !advance || run.status !== "Running") return run;
    if (!run.requestedBy) throw new AiError("MISSING_INITIATOR", "Legacy unauthenticated jobs must be resubmitted by a workspace member.");
    const opportunity = await this.dependencies.store.get(run.opportunityId);
    if (!opportunity) return run;
    try {
      const job = await this.ai.state.loadJob(run.id);
      if (!job) throw new AiError("MISSING_JOB", "Generation input snapshot is missing; start a new run.");
      const checkpoint = await this.ai.orchestrator.advance(job);
      const result = checkpoint.result;
      if (result) {
        const proposal = applyCitationMapping(createGeneratedProposal(job.opportunity, result, result.citations, {
          ...this.dependencies,
          generationRunId: run.id
        }), result);
        proposal.id = run.proposalId;
        await this.dependencies.store.proposals.save(proposal);
        await this.audit(opportunity.id, "Proposal Generated", "Generated all twelve proposal sections and risk findings.", {
          sections: proposal.sections.length,
          risks: proposal.risks.length,
          sources: proposal.citations.length,
          provider: result.provider,
          retrievalMode: result.retrieval.mode,
          promptVersion: result.promptVersion
        }, proposal.id, run.requestedBy);
      }
      const progress = checkpoint.completedStages.length * 25;
      const updatedRun: GenerationRun = {
        ...run, progress, status: result ? "Complete" : "Running",
        providerEvidence: checkpoint.providerEvidence ?? run.providerEvidence,
        retrieval: checkpoint.retrieval
          ? { mode: checkpoint.retrieval.mode, warnings: checkpoint.retrieval.warnings }
          : run.retrieval,
        retrievedContentIds: [...new Set(checkpoint.retrieval?.citations.map((item) => item.contentId) ?? [])],
        stages: run.stages.map((stage, index) => ({
          ...stage,
          status: checkpoint.completedStages.includes(stage.key) ? "Complete" :
            index === checkpoint.completedStages.length ? "Running" : "Pending",
          detail: stage.key === "retrieval" && checkpoint.retrieval
            ? `${checkpoint.retrieval.mode} retrieval; ${checkpoint.retrieval.citations.length} sources. ${checkpoint.retrieval.warnings.join(" ")}`
            : stage.detail,
          ...(checkpoint.stageExecutions?.[stage.key] ?? {})
        })),
        ...(result ? { completedAt: this.dependencies.clock.now() } : {})
      };
      await this.dependencies.store.save({
        ...opportunity, proposalStatus: result ? "Generated" : "Generating", proposalProgress: progress,
        status: result ? "Proposal" : opportunity.status, updatedAt: this.dependencies.clock.now()
      });
      await this.dependencies.store.runs.save(updatedRun);
      return updatedRun;
    } catch (error) {
      const failure = classifyFailure(error);
      const checkpoint = await this.ai.state.load(run.id);
      const failedRun: GenerationRun = {
        ...run, status: "Failed", completedAt: this.dependencies.clock.now(),
        providerEvidence: checkpoint?.providerEvidence ?? run.providerEvidence,
        retrieval: checkpoint?.retrieval
          ? { mode: checkpoint.retrieval.mode, warnings: checkpoint.retrieval.warnings }
          : run.retrieval,
        error: `Proposal generation failed (${failure.code}). Start a new run after resolving the cause.`,
        stages: run.stages.map((stage) => ({
          ...stage,
          ...(checkpoint?.stageExecutions?.[stage.key] ?? {}),
          ...(stage.status === "Running" ? { status: "Failed" as const } : {})
        }))
      };
      await this.dependencies.store.runs.save(failedRun);
      await this.dependencies.store.save({
        ...opportunity, proposalStatus: "Generation Failed", updatedAt: this.dependencies.clock.now()
      });
      await this.audit(opportunity.id, "Proposal Generation Failed", "Proposal generation failed.",
        { code: failure.code, retryable: failure.retryable }, run.proposalId, run.requestedBy);
      return failedRun;
    }
  }

  async getProposalForOpportunity(opportunityId: string) {
    return this.reviewable(await this.dependencies.store.proposals.getByOpportunity(opportunityId));
  }

  async getProposal(id: string) {
    return this.reviewable(await this.dependencies.store.proposals.get(id));
  }

  private reviewable(proposal: Proposal | undefined) {
    if (!proposal || proposal.reviewVersion) return proposal;
    // Bind pre-upgrade snapshots without mutating during GET or trusting their timestamps.
    return { ...proposal, reviewVersion: `legacy-${createHash("sha256").update(JSON.stringify(proposal)).digest("hex")}` };
  }

  async editSection(proposalId: string, key: ProposalSectionKey, content: string) {
    return this.mutateProposal(proposalId, () => this.editSectionCore(proposalId, key, content));
  }

  private async editSectionCore(proposalId: string, key: ProposalSectionKey, content: string) {
    const proposal = await this.getProposal(proposalId);
    if (!proposal) return;
    const updated = editProposalSection(proposal, key, content, this.dependencies);
    await this.dependencies.store.proposals.save(updated);
    await this.syncOpportunityProposalStatus(updated.opportunityId, "In Review");
    await this.audit(updated.opportunityId, "Section Edited", `Edited ${key}.`, { section: key }, proposalId);
    return updated;
  }

  async regenerateSection(proposalId: string, key: ProposalSectionKey) {
    if (this.dependencies.workflow) return this.dependencies.workflow.regenerateSection(proposalId, key);
    return this.mutateProposal(proposalId, () => this.regenerateSectionCore(proposalId, key));
  }

  private async regenerateSectionCore(proposalId: string, key: ProposalSectionKey) {
    const proposal = await this.getProposal(proposalId);
    if (!proposal) return;
    const opportunity = await this.getOpportunity(proposal.opportunityId);
    if (!opportunity) return;
    const documents = (await this.dependencies.store.documents.list(opportunity.id))
      .filter((document) => opportunity.selectedDocumentIds.includes(document.id))
      .map((document) => ({
        ...document,
        summary: document.extractedText ?? document.summary
      }));
    const job = {
      id: this.dependencies.ids.next("regeneration"), type: "RegenerateSection" as const,
      opportunity, documents, proposal, sectionKey: key
    };
    await this.ai.state.saveJob(job);
    const result = await this.ai.orchestrator.run(job);
    const updated = applyCitationMapping(regenerateProposalSection(proposal, key, result.sections[key], this.dependencies), result);
    await this.dependencies.store.proposals.save(updated);
    await this.syncOpportunityProposalStatus(updated.opportunityId, "In Review");
    await this.audit(updated.opportunityId, "Section Regenerated", `Regenerated ${key}.`, { section: key }, proposalId);
    return updated;
  }

  async approveSection(proposalId: string, key: ProposalSectionKey, expectedRevisionId: string) {
    return this.mutateProposal(proposalId, () => this.approveSectionCore(proposalId, key, expectedRevisionId));
  }

  private async approveSectionCore(proposalId: string, key: ProposalSectionKey, expectedRevisionId: string) {
    const proposal = await this.getProposal(proposalId);
    if (!proposal) return;
    const updated = approveProposalSection(proposal, key, expectedRevisionId, { ...this.dependencies, actor: currentAuditActor() });
    if (updated !== proposal) await this.dependencies.store.proposals.save(updated);
    await this.syncOpportunityProposalStatus(updated.opportunityId, updated.status === "Approved" ? "Approved" : "In Review");
    const revision = updated.sections.find((section) => section.key === key)!.revisions.find((item) => item.id === expectedRevisionId)!;
    await this.approvalAudit({
      id: `audit-section-approved-${proposalId}-${revision.id}`,
      opportunityId: updated.opportunityId, proposalId, type: "Section Approved",
      ...revision.approvedBy!, occurredAt: revision.approvedAt!,
      description: `Approved reviewed ${key} revision ${revision.revision}.`,
      metadata: { section: key, revisionId: revision.id, revision: revision.revision }
    });
    return updated;
  }

  async approveProposal(proposalId: string, expectedReviewVersion: string) {
    return this.mutateProposal(proposalId, () => this.approveProposalCore(proposalId, expectedReviewVersion));
  }

  private async approveProposalCore(proposalId: string, expectedReviewVersion: string) {
    const proposal = await this.getProposal(proposalId);
    if (!proposal) return;
    const updated = approveCompleteProposal(proposal, expectedReviewVersion, { clock: this.dependencies.clock, actor: currentAuditActor() });
    if (updated !== proposal) await this.dependencies.store.proposals.save(updated);
    await this.syncOpportunityProposalStatus(updated.opportunityId, "Approved");
    await this.approvalAudit({
      id: `audit-proposal-approved-${proposalId}-${expectedReviewVersion}`,
      opportunityId: updated.opportunityId, proposalId, type: "Proposal Approved",
      ...updated.approvedBy!, occurredAt: updated.approvedAt!,
      description: "Approved the exact reviewed proposal revision set.",
      metadata: {
        reviewVersion: expectedReviewVersion,
        sectionRevisions: JSON.stringify(updated.sections.map((section) => ({
          key: section.key, revisionId: section.approvedRevisionId,
          revision: section.revisions.find((item) => item.id === section.approvedRevisionId)!.revision
        })))
      }
    });
    return updated;
  }

  private async syncOpportunityProposalStatus(opportunityId: string, status: "In Review" | "Approved") {
    const opportunity = await this.getOpportunity(opportunityId);
    if (!opportunity) return;
    await this.dependencies.store.save({
      ...opportunity,
      proposalStatus: status,
      proposalProgress: 100,
      updatedAt: this.dependencies.clock.now()
    });
  }

  async exportProposal(proposalId: string, format: "markdown" | "pdf") {
    return this.mutateProposal(proposalId, () => this.exportProposalCore(proposalId, format));
  }

  private async exportProposalCore(proposalId: string, format: "markdown" | "pdf") {
    const proposal = await this.getProposal(proposalId);
    if (!proposal) return;
    const opportunity = await this.getOpportunity(proposal.opportunityId);
    if (!opportunity) return;
    const exported =
      format === "pdf"
        ? await this.exporter.exportPdf(proposal, opportunity)
        : await this.exporter.exportMarkdown(proposal, opportunity);
    if (this.dependencies.workflow) {
      const storage = await this.dependencies.workflow.data.blobs.exports.storeExport(exported.result, exported.body);
      await this.dependencies.workflow.data.repositories.exports.save({ ...exported.result, storage } as typeof exported.result);
    }
    await this.audit(opportunity.id, "Proposal Exported", `Exported approved proposal as ${format.toUpperCase()}.`, {
      format,
      exportId: exported.result.id
    }, proposalId);
    return exported;
  }

  async auditHistory(opportunityId?: string) {
    return this.dependencies.store.audit.list(opportunityId);
  }

  private async approvalAudit(event: import("@proposal-factory/contracts").AuditEvent) {
    try { await this.dependencies.store.audit.append(event); }
    catch (error) {
      if ((error as { code?: number }).code !== 409 && (error as { statusCode?: number }).statusCode !== 409) throw error;
    }
  }

  private async mutateOpportunity<T>(opportunityId: string, operation: () => Promise<T>, allowGeneration = false): Promise<T> {
    if (this.dependencies.workflow) return this.dependencies.workflow.mutate(opportunityId, operation);
    const store = this.dependencies.store;
    let pending = localMutations.get(store);
    if (!pending) { pending = new Map(); localMutations.set(store, pending); }
    const previous = pending.get(opportunityId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      if (!allowGeneration && (await store.get(opportunityId))?.proposalStatus === "Generating") {
        throw new AiError("GENERATION_IN_PROGRESS", "A proposal run is still in progress.");
      }
      return operation();
    });
    pending.set(opportunityId, next);
    try { return await next; }
    finally { if (pending.get(opportunityId) === next) pending.delete(opportunityId); }
  }

  private async mutateProposal<T>(proposalId: string, operation: () => Promise<T>) {
    const proposal = await this.getProposal(proposalId);
    if (!proposal) return;
    return this.mutateOpportunity(proposal.opportunityId, operation);
  }
}
