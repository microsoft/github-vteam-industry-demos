import { describe, expect, it, vi } from "vitest";
import { createGeneratedProposal, regenerateProposalSection } from "@proposal-factory/domain";
import { AiError } from "../src/errors.js";
import { FixtureModelProvider } from "../src/fixture.js";
import { MemoryCheckpointStore, ProposalOrchestrator, applyCitationMapping, type AiJob } from "../src/orchestration.js";
import type { KnowledgeRetriever } from "../src/providers.js";
import { citation, opportunity } from "./fixtures.js";

const job: AiJob = { id: "run-01", type: "GenerateProposal", opportunity, documents: [] };
const retriever = (empty = false): KnowledgeRetriever => ({
  retrieveEvidence: vi.fn().mockResolvedValue({ citations: empty ? [] : [citation], mode: "fixture", warnings: [] })
});

describe("application-controlled orchestration", () => {
  it("performs four actual stages, checkpoints them, and never repeats a completed job", async () => {
    const model = new FixtureModelProvider();
    const analyze = vi.spyOn(model, "analyze");
    const draft = vi.spyOn(model, "draft");
    const review = vi.spyOn(model, "review");
    const retrieval = retriever();
    const state = new MemoryCheckpointStore();
    const workflow = new ProposalOrchestrator(model, retrieval, state);
    expect((await workflow.advance(job)).completedStages).toEqual(["requirements"]);
    expect(retrieval.retrieveEvidence).not.toHaveBeenCalled();
    expect((await workflow.advance(job)).completedStages).toEqual(["requirements", "retrieval"]);
    expect(draft).not.toHaveBeenCalled();
    expect((await workflow.advance(job)).completedStages).toHaveLength(3);
    expect(review).not.toHaveBeenCalled();
    const complete = await workflow.advance(job);
    expect(Object.keys(complete.result!.sections)).toHaveLength(12);
    expect(complete.result!.risks).toHaveLength(4);
    expect(await workflow.run(job)).toEqual(complete.result);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(draft).toHaveBeenCalledTimes(1);
    expect(review).toHaveBeenCalledTimes(1);
    expect(complete.result!.providerEvidence).toEqual({
      provider: "fixture",
      successfulModelOperations: 0,
      successfulRetrievalOperations: 1,
      successfulEmbeddingOperations: 0,
      deterministicOperations: 4,
      fallbacks: []
    });
    expect(complete.result!.stageExecutions.retrieval).toEqual({
      execution: "deterministic", completedOperations: 1
    });
  });
  it("claims Azure model and embedding activity only after successful adapter operations", async () => {
    const fixture = new FixtureModelProvider();
    const model = {
      mode: "azure" as const,
      generationDeployment: "safe-chat-deployment",
      analyze: fixture.analyze.bind(fixture),
      draft: fixture.draft.bind(fixture),
      review: fixture.review.bind(fixture),
      regenerate: fixture.regenerate.bind(fixture)
    };
    const retrieval: KnowledgeRetriever = {
      retrieveEvidence: vi.fn().mockResolvedValue({
        citations: [citation],
        mode: "hybrid",
        warnings: [],
        activity: {
          successfulRetrievalOperations: 1,
          successfulEmbeddingOperations: 1,
          fallbacks: [],
          searchIndex: "safe-index",
          embeddingDeployment: "safe-embedding-deployment"
        }
      })
    };
    const result = await new ProposalOrchestrator(model, retrieval, new MemoryCheckpointStore()).run(job);
    expect(result.providerEvidence).toEqual({
      provider: "azure",
      successfulModelOperations: 3,
      successfulRetrievalOperations: 1,
      successfulEmbeddingOperations: 1,
      deterministicOperations: 0,
      fallbacks: [],
      generationDeployment: "safe-chat-deployment",
      embeddingDeployment: "safe-embedding-deployment",
      searchIndex: "safe-index"
    });
    expect(result.stageExecutions).toMatchObject({
      requirements: { execution: "model-backed", completedOperations: 1 },
      retrieval: { execution: "service-backed", completedOperations: 2 },
      drafting: { execution: "model-backed", completedOperations: 1 },
      "risk-review": { execution: "model-backed", completedOperations: 1 }
    });
  });
  it("resumes after transient risk failure without repeating analysis, retrieval or drafting", async () => {
    const model = new FixtureModelProvider();
    const original = model.review.bind(model);
    const review = vi.spyOn(model, "review").mockRejectedValueOnce(new AiError("THROTTLED", "busy", true))
      .mockImplementation(original);
    const draft = vi.spyOn(model, "draft");
    const state = new MemoryCheckpointStore();
    const workflow = new ProposalOrchestrator(model, retriever(), state);
    await expect(workflow.run(job)).rejects.toMatchObject({ code: "THROTTLED" });
    expect((await state.load(job.id))?.completedStages).toHaveLength(3);
    const resumed = new ProposalOrchestrator(model, retriever(), state);
    expect((await resumed.run(job)).risks).toHaveLength(4);
    expect(draft).toHaveBeenCalledTimes(1);
    expect(review).toHaveBeenCalledTimes(2);
  });
  it("makes empty retrieval visible in an independent high-risk finding", async () => {
    const result = await new ProposalOrchestrator(new FixtureModelProvider(), retriever(true), new MemoryCheckpointStore()).run(job);
    expect(result.citations).toEqual([]);
    expect(result.risks).toContainEqual(expect.objectContaining({ severity: "High", title: "No organizational grounding available" }));
    expect(result.sections.scope).toContain("No organizational evidence");
  });
  it("serializes duplicate deliveries to prevent duplicate inference", async () => {
    const model = new FixtureModelProvider();
    const analyze = vi.spyOn(model, "analyze");
    const workflow = new ProposalOrchestrator(model, retriever(), new MemoryCheckpointStore());
    const [first, second] = await Promise.all([workflow.run(job), workflow.run(job)]);
    expect(first).toEqual(second);
    expect(analyze).toHaveBeenCalledTimes(1);
  });
  it("refuses changed snapshots and permanent malformed output checkpoints", async () => {
    const state = new MemoryCheckpointStore();
    const model = new FixtureModelProvider();
    const workflow = new ProposalOrchestrator(model, retriever(), state);
    await workflow.advance(job);
    await expect(workflow.advance({ ...job, opportunity: { ...opportunity, scope: "changed" } }))
      .rejects.toMatchObject({ code: "CHECKPOINT_CONFLICT" });
    vi.spyOn(model, "draft").mockResolvedValue({ sections: {} } as never);
    await expect(workflow.run(job)).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    await expect(workflow.run(job)).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    expect(model.draft).toHaveBeenCalledTimes(1);
  });
  it("rejects customer documents outside the selected opportunity", async () => {
    const workflow = new ProposalOrchestrator(new FixtureModelProvider(), retriever(), new MemoryCheckpointStore());
    await expect(workflow.run({ ...job, documents: [{
      id: "foreign", opportunityId: "another", name: "notes", kind: "Meeting Notes", contentType: "text/plain",
      sizeBytes: 1, source: "Upload", summary: "not selected", createdAt: opportunity.createdAt
    }] })).rejects.toMatchObject({ code: "INVALID_JOB" });
  });
  it("regenerates only one section and performs a separate fresh risk review", async () => {
    let count = 0;
    const dependencies = { clock: { now: () => opportunity.createdAt }, ids: { next: (prefix: string) => `${prefix}-${++count}` } };
    const workflow = new ProposalOrchestrator(new FixtureModelProvider(), retriever(), new MemoryCheckpointStore());
    const initial = await workflow.run(job);
    const proposal = applyCitationMapping(createGeneratedProposal(opportunity, initial, initial.citations, {
      ...dependencies, generationRunId: job.id
    }), initial);
    const before = structuredClone(proposal);
    const result = await workflow.run({ id: "regen-01", type: "RegenerateSection", opportunity, documents: [], proposal, sectionKey: "scope" });
    const updated = applyCitationMapping(regenerateProposalSection(proposal, "scope", result.sections.scope, dependencies), result);
    expect(updated.sections.find((section) => section.key === "scope")?.revisions).toHaveLength(2);
    expect(updated.sections.filter((section) => section.key !== "scope")).toEqual(before.sections.filter((section) => section.key !== "scope"));
    expect(updated.status).toBe("In Review");
    expect(updated.risks[0]?.id).toContain("regen-01");
    expect(proposal.sections.find((section) => section.key === "assumptions")?.revisions[0]?.citationIds).toEqual([]);
  });
});
