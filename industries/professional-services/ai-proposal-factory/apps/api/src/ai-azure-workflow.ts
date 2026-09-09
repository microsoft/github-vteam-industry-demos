import { randomUUID, createHash } from "node:crypto";
import { AiError, applyCitationMapping, classifyFailure, workflowStages, type AiJob, type WorkflowResult, type AiCheckpoint } from "@proposal-factory/ai";
import { createGeneratedProposal, createOpportunityBrief, regenerateProposalSection, type Clock, type IdGenerator } from "@proposal-factory/domain";
import type { AuditEvent, GenerationRun, Proposal, ProposalSectionKey } from "@proposal-factory/contracts";
import { azureStatusCode } from "@proposal-factory/azure-data";
import type { ReturnTypeOfAzureRuntime } from "./azure-data/types.js";
import { AzureAiJobState, type AzureJobRecord } from "./ai-azure-state.js";
import type { AiRuntime } from "./ai-runtime.js";
import { currentAuditActor } from "./auth.js";

export class AzureProposalWorkflow {
  constructor(readonly data: ReturnTypeOfAzureRuntime, readonly state: AzureAiJobState,
    readonly ai: AiRuntime, private readonly clock: Clock, private readonly ids: IdGenerator,
    private readonly mutations: { run<T>(operation: () => Promise<T>): Promise<T> } = { run: (operation) => operation() }) {}

  private lock(opportunityId: string) { return `opportunity:${opportunityId}`; }

  async mutate<T>(opportunityId: string, operation: () => Promise<T>): Promise<T> {
    return this.state.exclusive(this.lock(opportunityId), async () => {
      const active = await this.state.readValue<{ jobId: string } | null>(this.lock(opportunityId));
      if (active) {
        const record = await this.state.record(active.jobId);
        if (!record?.terminal) throw new AiError("GENERATION_IN_PROGRESS", "A durable proposal job is still in progress.");
      }
      const opportunity = await this.data.repositories.opportunities.get(opportunityId);
      if (opportunity?.proposalStatus === "Generation Failed") {
        throw new AiError("GENERATION_FAILED", "Start a new generation run before editing or approving failed work.");
      }
      return this.mutations.run(operation);
    });
  }

  async startGeneration(opportunityId: string) { return this.submit(opportunityId); }

  async regenerateSection(proposalId: string, sectionKey: ProposalSectionKey) {
    const proposal = await this.data.repositories.proposals.get(proposalId);
    if (!proposal) return;
    const run = await this.submit(proposal.opportunityId, { proposalId, sectionKey });
    if (!run) return;
    // Preserve the synchronous section API; the queue can safely resume this same durable job.
    const job = (await this.state.loadJob(run.id))!;
    try {
      const result = await this.execute(job);
      await this.commitResult(job, result);
    } catch (error) {
      await this.markFailed(job.id, classifyFailure(error));
      throw error;
    }
    return this.data.repositories.proposals.get(proposalId);
  }

  private async submit(opportunityId: string, regeneration?: { proposalId: string; sectionKey: ProposalSectionKey }) {
    return this.state.exclusive(this.lock(opportunityId), async () => {
      const active = await this.state.readValue<{ jobId: string } | null>(this.lock(opportunityId));
      if (active) {
        const prior = await this.state.record(active.jobId);
        if (prior && !prior.terminal) {
          if (regeneration) throw new AiError("GENERATION_IN_PROGRESS", "Another proposal operation is in progress.");
          await this.dispatch(prior);
          return prior.run;
        }
        if (prior?.terminal) await this.state.writeValue(this.lock(opportunityId), null);
      }
      const versionedOpportunity = await this.data.repositories.opportunities.getVersioned(opportunityId);
      if (!versionedOpportunity) return;
      const opportunity = versionedOpportunity.value;
      const old = regeneration
        ? await this.data.repositories.proposals.get(regeneration.proposalId)
        : await this.data.repositories.proposals.getByOpportunity(opportunityId);
      const versionedProposal = old ? await this.data.repositories.proposals.getVersioned(old.id, opportunityId) : undefined;
      if (regeneration && !versionedProposal) throw new AiError("INVALID_JOB", "Regeneration proposal is missing.");
      const id = this.ids.next(regeneration ? "regeneration" : "run");
      const now = this.clock.now();
      const documents = (await this.data.repositories.documents.list(opportunityId))
        .filter((document) => opportunity.selectedDocumentIds.includes(document.id))
        .map((document) => ({
          ...document,
          summary: document.extractedText ?? document.summary
        }));
      const run: GenerationRun = {
        requestedBy: currentAuditActor(),
        id, opportunityId, proposalId: old?.id ?? this.ids.next("proposal"), status: "Running", progress: 0,
        retrievedContentIds: [], startedAt: now,
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
        stages: workflowStages.map((key, index) => ({
          key, label: key, detail: `Queued ${this.ai.config.provider} ${key} stage.`,
          status: index === 0 ? "Running" : "Pending",
          execution: "not-executed",
          completedOperations: 0
        }))
      };
      const job: AiJob = regeneration ? {
        id, type: "RegenerateSection", opportunity, documents, proposal: versionedProposal!.value, sectionKey: regeneration.sectionKey
      } : { id, type: "GenerateProposal", opportunity, documents };
      const record: AzureJobRecord = {
        kind: "job", job, run, dispatched: false, terminal: false, committed: false,
        baselineOpportunityEtag: versionedOpportunity.etag,
        ...(versionedProposal ? { baselineEtag: versionedProposal.etag } : {})
      };
      await this.state.saveJob(job);
      await this.state.exclusive(`delivery:${id}`, () => this.state.writeValue(`delivery:${id}`, record));
      await this.dispatch(record);
      return run;
    });
  }

  async dispatch(record: AzureJobRecord) {
    const job = record.job;
    await this.state.exclusive(this.lock(job.opportunity.id), async () => {
      const current = await this.state.record(job.id);
      if (!current || current.terminal) return;
      let active = await this.state.readValue<{ jobId: string } | null>(this.lock(job.opportunity.id));
      if (active && active.jobId !== job.id && (await this.state.record(active.jobId))?.terminal) {
        await this.state.writeValue(this.lock(job.opportunity.id), null);
        active = null;
      }
      const opportunity = await this.data.repositories.opportunities.getVersioned(job.opportunity.id);
      if (!opportunity || (active && active.jobId !== job.id) ||
          (!active && opportunity.etag !== current.baselineOpportunityEtag)) {
        await this.state.updateRecord(job.id, (value) => ({ ...value, terminal: true }));
        return;
      }
      await this.state.writeValue(this.lock(job.opportunity.id), { jobId: job.id });
      const run = await this.data.repositories.generationRuns.getVersioned(job.id, job.opportunity.id);
      if (!run) await this.data.repositories.generationRuns.save(current.run);
      if (opportunity.value.proposalStatus !== "Generating") {
        await this.data.repositories.opportunities.saveVersioned({
          ...opportunity.value, proposalStatus: "Generating", proposalProgress: 0, updatedAt: current.run.startedAt
        }, opportunity.etag);
      }
      await this.appendOnce({
        id: `audit-${job.id}-started`, opportunityId: job.opportunity.id, proposalId: current.run.proposalId,
        type: "Proposal Generation Started", ...this.initiator(current.run),
        description: `Queued ${job.type} using ${this.ai.config.provider}.`,
        metadata: { jobId: job.id, provider: this.ai.config.provider }, occurredAt: current.run.startedAt
      });
      await this.data.queue.enqueue({ id: job.id, type: job.type, payload: { jobId: job.id } });
      await this.state.updateRecord(job.id, (value) => ({ ...value, dispatched: true }));
    });
  }

  async dispatchPending() {
    const settings = this.data.configuration.azure;
    const container = this.data.clients.cosmos.database(settings.cosmos.database).container(settings.cosmos.containers.generationRuns);
    const page = await container.items.query<{ value: AzureJobRecord }>({
      query: 'SELECT TOP 20 * FROM c WHERE c.entityType = @type AND c["value"].kind = @kind AND c["value"].dispatched = false AND c["value"].terminal = false',
      parameters: [{ name: "@type", value: "ai-workflow-state" }, { name: "@kind", value: "job" }]
    }).fetchAll();
    for (const row of page.resources) await this.dispatch(row.value);
  }

  async execute(job: AiJob): Promise<WorkflowResult> {
    for (let index = 0; index < 4; index++) {
      const checkpoint = await this.ai.orchestrator.advance(job);
      await this.recordProgress(job, checkpoint);
      if (checkpoint.result) return checkpoint.result;
    }
    throw new AiError("INVALID_CHECKPOINT", "Workflow result is missing.");
  }

  private async recordProgress(job: AiJob, checkpoint: AiCheckpoint) {
    await this.state.exclusive(this.lock(job.opportunity.id), async () => {
      const run = await this.data.repositories.generationRuns.getVersioned(job.id, job.opportunity.id);
      if (!run || run.value.status === "Complete") return;
      const completed = Math.max(checkpoint.completedStages.length,
        run.value.stages.filter((stage) => stage.status === "Complete").length);
      await this.data.repositories.generationRuns.saveVersioned({
        ...run.value, progress: Math.max(run.value.progress, Math.min(95, completed * 25)),
        providerEvidence: checkpoint.providerEvidence ?? run.value.providerEvidence,
        retrieval: checkpoint.retrieval
          ? { mode: checkpoint.retrieval.mode, warnings: checkpoint.retrieval.warnings }
          : run.value.retrieval,
        retrievedContentIds: checkpoint.retrieval?.citations.map((citation) => citation.contentId) ?? run.value.retrievedContentIds,
        stages: run.value.stages.map((stage, index) => ({
          ...stage, status: index < completed ? "Complete" : index === completed ? "Running" : "Pending",
          detail: stage.key === "retrieval" && checkpoint.retrieval
            ? `${checkpoint.retrieval.mode}: ${checkpoint.retrieval.warnings.join(" ")}` : stage.detail,
          ...(checkpoint.stageExecutions?.[stage.key] ?? {})
        }))
      }, run.etag);
    });
  }

  async loadJob(id: string) {
    const record = await this.state.record(id);
    if (record?.terminal && !record.committed) throw new AiError("JOB_TERMINAL", "This job already failed or was superseded.");
    return this.state.loadJob(id);
  }
  async isCommitted(id: string) { return (await this.state.record(id))?.committed ?? false; }

  async commitResult(job: AiJob, result: WorkflowResult) {
    await this.state.exclusive(this.lock(job.opportunity.id), async () => {
      let record = await this.state.record(job.id);
      if (!record) throw new AiError("MISSING_JOB", "Durable job metadata is missing.");
      if (record.committed) return;
      const active = await this.state.readValue<{ jobId: string } | null>(this.lock(job.opportunity.id));
      if (active?.jobId !== job.id) throw new AiError("STALE_JOB", "A newer job owns the opportunity.");
      if (!record.publication) {
        let sequence = 0;
        const deterministicIds = { next: (prefix: string) => `${prefix}-${createHash("sha256").update(`${job.id}:${++sequence}`).digest("hex").slice(0, 24)}` };
        const dependencies = { clock: { now: () => record!.run.startedAt }, ids: deterministicIds };
        let proposal: Proposal;
        if (job.type === "RegenerateSection") {
          proposal = regenerateProposalSection(job.proposal, job.sectionKey, result.sections[job.sectionKey], dependencies);
        } else proposal = createGeneratedProposal(job.opportunity, result, result.citations, { ...dependencies, generationRunId: job.id });
        proposal.id = record.run.proposalId;
        proposal.generationRunId = job.id;
        applyCitationMapping(proposal, result);
        record = await this.state.updateRecord(job.id, (current) => ({ ...current, publication: { proposal, result } }));
      }
      result = record.publication!.result;
      const desired = record.publication!.proposal;
      const current = await this.data.repositories.proposals.getVersioned(desired.id, desired.opportunityId);
      if (current?.value.generationRunId !== job.id) {
        if (current?.etag !== record.baselineEtag) throw new AiError("STALE_REVISION", "Proposal changed after the job snapshot.");
        await this.state.assertLease(this.lock(job.opportunity.id));
        if (current) await this.data.repositories.proposals.saveVersioned(desired, current.etag);
        else {
          const settings = this.data.configuration.azure;
          await this.data.clients.cosmos.database(settings.cosmos.database).container(settings.cosmos.containers.proposals)
            .items.create({ ...desired, entityType: "proposal", schemaVersion: 1, partitionKey: desired.opportunityId });
        }
      }
      await this.appendOnce({
        id: `audit-${job.id}-published`, opportunityId: job.opportunity.id, proposalId: desired.id,
        type: job.type === "GenerateProposal" ? "Proposal Generated" : "Section Regenerated",
        ...this.initiator(record.run), description: "Published validated proposal content and separate risk review.",
        metadata: {
          jobId: job.id,
          provider: result.provider,
          retrievalMode: result.retrieval.mode,
          promptVersion: result.promptVersion,
          successfulModelOperations: result.providerEvidence.successfulModelOperations,
          successfulRetrievalOperations: result.providerEvidence.successfulRetrievalOperations
        },
        occurredAt: record.run.startedAt
      });
      const opportunity = await this.data.repositories.opportunities.getVersioned(job.opportunity.id);
      if (!opportunity) throw new AiError("INVALID_JOB", "Opportunity disappeared during publication.");
      await this.data.repositories.opportunities.saveVersioned({
        ...opportunity.value, status: "Proposal", proposalStatus: job.type === "GenerateProposal" ? "Generated" : "In Review",
        proposalProgress: 100, updatedAt: this.clock.now()
      }, opportunity.etag);
      const run = await this.data.repositories.generationRuns.getVersioned(job.id, job.opportunity.id);
      const complete: GenerationRun = {
        ...record.run, status: "Complete", progress: 100, completedAt: this.clock.now(),
        providerEvidence: result.providerEvidence,
        retrieval: { mode: result.retrieval.mode, warnings: result.retrieval.warnings },
        stages: record.run.stages.map((stage) => ({
          ...stage,
          status: "Complete",
          ...result.stageExecutions[stage.key]
        })),
        retrievedContentIds: result.retrieval.citations.map((citation) => citation.contentId)
      };
      if (run) await this.data.repositories.generationRuns.saveVersioned(complete, run.etag);
      else await this.data.repositories.generationRuns.save(complete);
      await this.state.updateRecord(job.id, (value) => ({ ...value, committed: true, terminal: true, run: complete }));
      await this.state.writeValue(this.lock(job.opportunity.id), null);
    });
  }

  async markFailed(id: string, failure: { code: string; retryable: boolean }) {
    const record = await this.state.record(id);
    if (!record || record.terminal) return;
    await this.state.exclusive(this.lock(record.job.opportunity.id), async () => {
      if ((await this.state.record(id))?.terminal) return;
      const active = await this.state.readValue<{ jobId: string } | null>(this.lock(record.job.opportunity.id));
      if (active?.jobId !== id) return;
      const run = await this.data.repositories.generationRuns.getVersioned(id, record.job.opportunity.id);
      const checkpoint = await this.state.load(id);
      if (run) await this.data.repositories.generationRuns.saveVersioned({
        ...run.value,
        providerEvidence: checkpoint?.providerEvidence ?? run.value.providerEvidence,
        retrieval: checkpoint?.retrieval
          ? { mode: checkpoint.retrieval.mode, warnings: checkpoint.retrieval.warnings }
          : run.value.retrieval,
        stages: run.value.stages.map((stage) => ({
          ...stage,
          ...(checkpoint?.stageExecutions?.[stage.key] ?? {}),
          ...(stage.status === "Running" && !failure.retryable ? { status: "Failed" as const } : {})
        })),
        status: failure.retryable ? "Running" : "Failed", error: failure.code,
        ...(!failure.retryable ? { completedAt: this.clock.now() } : {})
      }, run.etag);
      if (!failure.retryable) {
        await this.state.updateRecord(id, (current) => ({ ...current, terminal: true }));
        await this.state.writeValue(this.lock(record.job.opportunity.id), null);
        const opportunity = await this.data.repositories.opportunities.getVersioned(record.job.opportunity.id);
        if (opportunity) await this.data.repositories.opportunities.saveVersioned({
          ...opportunity.value, proposalStatus: "Generation Failed", updatedAt: this.clock.now()
        }, opportunity.etag);
      }
    });
  }

  private async appendOnce(event: AuditEvent) {
    try { await this.data.repositories.audit.append(event); }
    catch (error) { if (azureStatusCode(error) !== 409) throw error; }
  }

  private initiator(run: GenerationRun) {
    if (!run.requestedBy) throw new AiError("MISSING_INITIATOR", "Legacy unauthenticated jobs must be resubmitted by a workspace member.");
    return run.requestedBy;
  }
}

export const uniqueIds: IdGenerator = { next: (prefix) => `${prefix}-${randomUUID()}` };
