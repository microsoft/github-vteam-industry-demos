import { createHash } from "node:crypto";
import { proposalSectionKeys, type Citation, type DocumentMetadata, type GenerationExecutionMode,
  type GenerationProviderEvidence, type GenerationStageKey,
  type Opportunity, type Proposal, type ProposalSectionKey, type RiskFinding } from "@proposal-factory/contracts";
import type { ProposalDraft } from "@proposal-factory/domain";
import { AiError, classifyFailure } from "./errors.js";
import { PROMPT_VERSION } from "./prompts.js";
import type { KnowledgeRetriever, ModelProvider, RetrievalResult } from "./providers.js";
import { validateDraft, validateRequirements, validateRisks, validateSection,
  type DraftSection, type RequirementsAnalysis, type RiskReview, type StructuredDraft } from "./schemas.js";

export const workflowStages = ["requirements", "retrieval", "drafting", "risk-review"] as const;
export type AiJob =
  | { id: string; type: "GenerateProposal"; opportunity: Opportunity; documents: DocumentMetadata[] }
  | { id: string; type: "RegenerateSection"; opportunity: Opportunity; documents: DocumentMetadata[];
      proposal: Proposal; sectionKey: ProposalSectionKey };

export interface WorkflowResult extends ProposalDraft {
  citations: Citation[];
  sectionCitationIds: Record<ProposalSectionKey, string[]>;
  requirements: RequirementsAnalysis;
  retrieval: RetrievalResult;
  promptVersion: string;
  provider: "fixture" | "azure";
  providerEvidence: GenerationProviderEvidence;
  stageExecutions: Record<GenerationStageKey, {
    execution: Exclude<GenerationExecutionMode, "not-executed">;
    completedOperations: number;
  }>;
  regeneratedSection?: ProposalSectionKey;
}

export interface AiCheckpoint {
  schemaVersion: 1;
  jobId: string;
  inputHash: string;
  provider: "fixture" | "azure";
  promptVersion: string;
  completedStages: GenerationStageKey[];
  providerEvidence?: GenerationProviderEvidence;
  stageExecutions?: Partial<Record<GenerationStageKey, {
    execution: Exclude<GenerationExecutionMode, "not-executed">;
    completedOperations: number;
  }>>;
  requirements?: RequirementsAnalysis;
  retrieval?: RetrievalResult;
  draft?: StructuredDraft;
  riskReview?: RiskReview;
  result?: WorkflowResult;
  failure?: { stage: GenerationStageKey; code: string; retryable: boolean };
}

export interface CheckpointStore {
  load(jobId: string): Promise<AiCheckpoint | undefined>;
  save(checkpoint: AiCheckpoint): Promise<void>;
  /** Must serialize the same job across all replicas, renew its lease, and release on failure. */
  exclusive<T>(jobId: string, operation: () => Promise<T>): Promise<T>;
}

export interface AiJobState extends CheckpointStore {
  saveJob(job: AiJob): Promise<void>;
  loadJob(id: string): Promise<AiJob | undefined>;
}

function emptyProviderEvidence(provider: "fixture" | "azure"): GenerationProviderEvidence {
  return {
    provider,
    successfulModelOperations: 0,
    successfulRetrievalOperations: 0,
    successfulEmbeddingOperations: 0,
    deterministicOperations: 0,
    fallbacks: []
  };
}

function evidenceFromLegacyCheckpoint(checkpoint: AiCheckpoint): GenerationProviderEvidence {
  const evidence = emptyProviderEvidence(checkpoint.provider);
  for (const stage of checkpoint.completedStages) {
    if (checkpoint.provider === "fixture") evidence.deterministicOperations += 1;
    else if (stage === "retrieval") {
      evidence.successfulRetrievalOperations += checkpoint.retrieval?.activity?.successfulRetrievalOperations ?? 1;
      evidence.successfulEmbeddingOperations += checkpoint.retrieval?.activity?.successfulEmbeddingOperations ??
        (checkpoint.retrieval?.mode === "hybrid" ? 1 : 0);
    } else evidence.successfulModelOperations += 1;
  }
  evidence.fallbacks = [...new Set(checkpoint.retrieval?.activity?.fallbacks ?? [])];
  return evidence;
}

function stageExecutionsFromLegacyCheckpoint(checkpoint: AiCheckpoint) {
  return Object.fromEntries(checkpoint.completedStages.map((stage) => {
    const retrievalOperations = (checkpoint.retrieval?.activity?.successfulRetrievalOperations ?? 1) +
      (checkpoint.retrieval?.activity?.successfulEmbeddingOperations ?? (checkpoint.retrieval?.mode === "hybrid" ? 1 : 0));
    return [stage, {
      execution: checkpoint.provider === "fixture" ? "deterministic" as const :
        stage === "retrieval" ? "service-backed" as const : "model-backed" as const,
      completedOperations: stage === "retrieval" ? retrievalOperations : 1
    }];
  }));
}

function recordSuccessfulStage(checkpoint: AiCheckpoint, stage: GenerationStageKey, provider: ModelProvider) {
  const evidence = checkpoint.providerEvidence!;
  if (stage === "retrieval") {
    const activity = checkpoint.retrieval?.activity;
    const retrievalOperations = activity?.successfulRetrievalOperations ?? 1;
    const embeddingOperations = activity?.successfulEmbeddingOperations ?? (checkpoint.retrieval?.mode === "hybrid" ? 1 : 0);
    evidence.successfulRetrievalOperations += retrievalOperations;
    evidence.successfulEmbeddingOperations += embeddingOperations;
    evidence.fallbacks = [...new Set([...evidence.fallbacks, ...(activity?.fallbacks ?? [])])];
    if (checkpoint.provider === "fixture") evidence.deterministicOperations += 1;
    if (activity?.searchIndex) evidence.searchIndex = activity.searchIndex;
    if (activity?.embeddingDeployment && embeddingOperations > 0) {
      evidence.embeddingDeployment = activity.embeddingDeployment;
    }
    checkpoint.stageExecutions![stage] = {
      execution: checkpoint.provider === "fixture" ? "deterministic" : "service-backed",
      completedOperations: retrievalOperations + embeddingOperations
    };
    return;
  }
  if (checkpoint.provider === "fixture") {
    evidence.deterministicOperations += 1;
    checkpoint.stageExecutions![stage] = { execution: "deterministic", completedOperations: 1 };
  } else {
    evidence.successfulModelOperations += 1;
    if (provider.generationDeployment) evidence.generationDeployment = provider.generationDeployment;
    checkpoint.stageExecutions![stage] = { execution: "model-backed", completedOperations: 1 };
  }
}

export class MemoryCheckpointStore implements CheckpointStore {
  private readonly values = new Map<string, AiCheckpoint>();
  private readonly locks = new Map<string, Promise<void>>();
  async load(jobId: string) {
    const value = this.values.get(jobId);
    return value ? structuredClone(value) : undefined;
  }
  async save(checkpoint: AiCheckpoint) { this.values.set(checkpoint.jobId, structuredClone(checkpoint)); }
  async exclusive<T>(jobId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(jobId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.locks.set(jobId, current);
    await previous;
    try { return await operation(); }
    finally {
      release();
      if (this.locks.get(jobId) === current) this.locks.delete(jobId);
    }
  }
}

export class ProposalOrchestrator {
  constructor(readonly provider: ModelProvider, readonly retrieval: KnowledgeRetriever,
    readonly checkpoints: CheckpointStore) {}

  async advance(job: AiJob): Promise<AiCheckpoint> {
    return this.checkpoints.exclusive(job.id, async () => {
      if (!job.id || job.id.length > 200 || job.documents.length > 20 ||
          job.documents.some((doc) => !job.opportunity.selectedDocumentIds.includes(doc.id) ||
            (doc.opportunityId && doc.opportunityId !== job.opportunity.id))) {
        throw new AiError("INVALID_JOB", "Invalid job identity or selected customer document scope.");
      }
      if (job.type === "RegenerateSection" && (job.proposal.opportunityId !== job.opportunity.id ||
          !proposalSectionKeys.includes(job.sectionKey))) throw new AiError("INVALID_JOB", "Invalid section regeneration target.");
      const inputHash = createHash("sha256").update(JSON.stringify(job)).digest("hex");
      let checkpoint = await this.checkpoints.load(job.id);
      if (checkpoint && (checkpoint.schemaVersion !== 1 || checkpoint.inputHash !== inputHash ||
          checkpoint.provider !== this.provider.mode || checkpoint.promptVersion !== PROMPT_VERSION)) {
        throw new AiError("CHECKPOINT_CONFLICT", "Job input/provider/prompt changed. Start a new generation run.");
      }
      checkpoint ??= {
        schemaVersion: 1, jobId: job.id, inputHash, provider: this.provider.mode,
        promptVersion: PROMPT_VERSION, completedStages: [],
        providerEvidence: emptyProviderEvidence(this.provider.mode),
        stageExecutions: {}
      };
      checkpoint.providerEvidence ??= evidenceFromLegacyCheckpoint(checkpoint);
      checkpoint.stageExecutions ??= stageExecutionsFromLegacyCheckpoint(checkpoint);
      if (checkpoint.completedStages.length > workflowStages.length ||
          checkpoint.completedStages.some((stage, index) => stage !== workflowStages[index]) ||
          (checkpoint.result && checkpoint.completedStages.length !== workflowStages.length)) {
        throw new AiError("INVALID_CHECKPOINT", "Checkpoint stages must be a complete ordered workflow prefix.");
      }
      if (checkpoint.completedStages.includes("requirements")) {
        validateRequirements(checkpoint.requirements!, job.documents.map((doc) => doc.id));
      }
      if (checkpoint.completedStages.includes("retrieval") && !checkpoint.retrieval) {
        throw new AiError("INVALID_CHECKPOINT", "Retrieval checkpoint evidence is missing.");
      }
      if (checkpoint.completedStages.includes("drafting")) {
        validateDraft(checkpoint.draft!, this.reviewEvidence(job, checkpoint.retrieval!));
      }
      if (checkpoint.result) return checkpoint;
      if (checkpoint.failure && !checkpoint.failure.retryable) {
        throw new AiError(checkpoint.failure.code, "This job failed permanently. Start a new generation run.");
      }
      const stage = workflowStages[checkpoint.completedStages.length];
      if (!stage) throw new AiError("INVALID_CHECKPOINT", "Checkpoint is incomplete or corrupted.");
      try {
        if (stage === "requirements") {
          checkpoint.requirements = validateRequirements(await this.provider.analyze(job.opportunity, job.documents), job.documents.map((doc) => doc.id));
        } else if (stage === "retrieval") {
          checkpoint.retrieval = await this.retrieval.retrieveEvidence(job.opportunity, checkpoint.requirements!);
        } else if (stage === "drafting") {
          const citations = checkpoint.retrieval!.citations;
          if (job.type === "GenerateProposal") {
            checkpoint.draft = validateDraft(await this.provider.draft(job.opportunity, checkpoint.requirements!, citations), citations);
          } else {
            const section = validateSection(await this.provider.regenerate(job.opportunity, checkpoint.requirements!,
              job.proposal, job.sectionKey, citations), citations);
            const allowed = new Set(this.reviewEvidence(job, checkpoint.retrieval!).map((item) => item.id));
            const sections = Object.fromEntries(proposalSectionKeys.map((key) => {
              if (key === job.sectionKey) return [key, section];
              const old = job.proposal.sections.find((item) => item.key === key);
              const revision = old?.revisions.find((item) => item.id === old.currentRevisionId);
              if (!revision) throw new AiError("INVALID_PROPOSAL", "Current revision missing during regeneration.");
              return [key, { content: revision.content, citationIds: revision.citationIds.filter((id) => allowed.has(id)) } satisfies DraftSection];
            })) as Record<ProposalSectionKey, DraftSection>;
            checkpoint.draft = { sections };
          }
        } else {
          const evidence = this.reviewEvidence(job, checkpoint.retrieval!);
          checkpoint.riskReview = validateRisks(await this.provider.review(job.opportunity, checkpoint.requirements!,
            checkpoint.draft!, evidence), evidence);
          const risks: RiskFinding[] = checkpoint.riskReview.findings.map(({ citationIds, ...finding }, index) => {
            void citationIds;
            return { ...finding, id: `risk-${job.id}-${index + 1}` };
          });
          if (checkpoint.retrieval!.citations.length === 0) risks.push({
            id: `risk-${job.id}-ungrounded`, severity: "High", category: "Missing Information",
            title: "No organizational grounding available",
            description: "No reusable sources matched the selected scenario and industry. The draft uses intake facts and unverified proposals only.",
            mitigation: "Add approved reusable content, rerun generation, and validate every commitment before approval."
          });
          checkpoint.result = {
            sections: Object.fromEntries(proposalSectionKeys.map((key) => [key, checkpoint!.draft!.sections[key].content])) as Record<ProposalSectionKey, string>,
            sectionCitationIds: Object.fromEntries(proposalSectionKeys.map((key) => [key, checkpoint!.draft!.sections[key].citationIds])) as Record<ProposalSectionKey, string[]>,
            risks, citations: evidence, requirements: checkpoint.requirements!,
            retrieval: checkpoint.retrieval!, promptVersion: PROMPT_VERSION, provider: this.provider.mode,
            providerEvidence: checkpoint.providerEvidence!,
            stageExecutions: checkpoint.stageExecutions as WorkflowResult["stageExecutions"],
            ...(job.type === "RegenerateSection" ? { regeneratedSection: job.sectionKey } : {})
          };
        }
        recordSuccessfulStage(checkpoint, stage, this.provider);
        if (checkpoint.result) {
          checkpoint.result.providerEvidence = structuredClone(checkpoint.providerEvidence!);
          checkpoint.result.stageExecutions =
            structuredClone(checkpoint.stageExecutions) as WorkflowResult["stageExecutions"];
        }
        checkpoint.completedStages.push(stage);
        delete checkpoint.failure;
        await this.checkpoints.save(checkpoint);
        return structuredClone(checkpoint);
      } catch (error) {
        checkpoint.failure = { stage, ...classifyFailure(error) };
        await this.checkpoints.save(checkpoint);
        throw error;
      }
    });
  }

  private reviewEvidence(job: AiJob, retrieval: RetrievalResult): Citation[] {
    return job.type === "RegenerateSection"
      ? [...new Map([...job.proposal.citations, ...retrieval.citations].map((item) => [item.id, item])).values()]
      : retrieval.citations;
  }

  async run(job: AiJob): Promise<WorkflowResult> {
    for (let index = 0; index < workflowStages.length; index++) {
      const checkpoint = await this.advance(job);
      if (checkpoint.result) return checkpoint.result;
    }
    throw new AiError("INVALID_CHECKPOINT", "Workflow failed to produce a complete proposal.");
  }
}

export function applyCitationMapping(proposal: Proposal, result: WorkflowResult) {
  for (const section of proposal.sections) {
    if (result.regeneratedSection && section.key !== result.regeneratedSection) continue;
    const revision = section.revisions.find((item) => item.id === section.currentRevisionId);
    if (revision) revision.citationIds = result.sectionCitationIds[section.key];
  }
  // Keep evidence for historic/manual revisions when regenerating a section.
  proposal.citations = result.regeneratedSection
    ? [...new Map([...proposal.citations, ...result.citations].map((item) => [item.id, item])).values()]
    : result.citations;
  proposal.risks = result.risks;
  return proposal;
}
