import { mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FixtureModelProvider, ProposalOrchestrator, loadAiConfig } from "@proposal-factory/ai";
import { createApp } from "../src/app.js";
import { LocalAiState, createAiRuntime } from "../src/ai-runtime.js";
import { FixtureRetrievalAdapter } from "../src/adapters.js";
import { LocalStore } from "../src/local-store.js";

describe("AI composition", () => {
  it("keeps fixture mode explicit in health and persists completed stage checkpoints across restart", async () => {
    const store = new LocalStore();
    const retrieval = new FixtureRetrievalAdapter(store);
    const ai = createAiRuntime(retrieval, { config: loadAiConfig({}) });
    const { app } = await createApp({ ai });
    try {
      expect((await app.inject("/health")).json().aiProvider).toBe("fixture");
      const start = (await app.inject({ method: "POST", url: "/api/opportunities/opp-01/proposals/generate" })).json();
      const first = (await app.inject(`/api/generation-runs/${start.id}`)).json();
      expect(first.stages[0].status).toBe("Complete");
      expect(first.stages[0]).toMatchObject({ execution: "deterministic", completedOperations: 1 });
      expect(first.stages[1].status).toBe("Running");
      for (let i = 0; i < 3; i++) await app.inject(`/api/generation-runs/${start.id}`);
      const completed = (await app.inject(`/api/generation-runs/${start.id}?advance=false`)).json();
      expect(completed).toMatchObject({
        retrieval: { mode: "fixture" },
        providerEvidence: {
          provider: "fixture",
          successfulModelOperations: 0,
          successfulRetrievalOperations: 1,
          successfulEmbeddingOperations: 0,
          deterministicOperations: 4,
          fallbacks: []
        }
      });
      expect(completed.opportunityBrief.facts).toMatchObject({ customerName: "Northstar Foods" });
      expect(completed.opportunityBrief.selectedDocuments).toEqual([expect.objectContaining({
        id: "doc-01", name: "Northstar Foods discovery meeting notes.md", source: "Fixture"
      })]);
      expect(JSON.stringify(completed.opportunityBrief)).not.toContain("Accelerate release frequency");
      const result = (await app.inject("/api/opportunities/opp-01/proposal")).json();
      expect(result.sections.find((section: { key: string }) => section.key === "assumptions").revisions[0].citationIds).toEqual([]);
    } finally { await app.close(); }
  });
  it("fails closed when azure mode lacks endpoints", () => {
    expect(() => createAiRuntime(new FixtureRetrievalAdapter(new LocalStore()), {
      config: loadAiConfig({ AI_PROVIDER: "azure" })
    })).toThrow();
  });
  it("selects Azure adapters without contacting the cloud during construction", () => {
    const ai = createAiRuntime(new FixtureRetrievalAdapter(new LocalStore()), { config: loadAiConfig({
      AI_PROVIDER: "azure", AZURE_OPENAI_ENDPOINT: "https://offline.openai.azure.com",
      AZURE_SEARCH_ENDPOINT: "https://offline.search.windows.net"
    }) });
    expect(ai.orchestrator.provider.mode).toBe("azure");
    expect(ai.retrieval.constructor.name).toBe("AzureSearchRetrievalAdapter");
  });
  it("surfaces failed analysis at the correct stage instead of fake completion", async () => {
    const store = new LocalStore();
    const ai = createAiRuntime(new FixtureRetrievalAdapter(store), { config: loadAiConfig({}) });
    vi.spyOn(ai.orchestrator.provider, "analyze").mockRejectedValue(new Error("private provider payload"));
    const { app } = await createApp({ ai });
    try {
      const run = (await app.inject({ method: "POST", url: "/api/opportunities/opp-01/proposals/generate" })).json();
      const failure = (await app.inject(`/api/generation-runs/${run.id}`)).json();
      expect(failure.status).toBe("Failed");
      expect(failure.stages[0].status).toBe("Failed");
      expect(failure.providerEvidence.successfulModelOperations).toBe(0);
      expect(failure.providerEvidence.deterministicOperations).toBe(0);
      expect(JSON.stringify(failure)).not.toContain("private provider payload");
    } finally { await app.close(); }
  });
  it("roundtrips local job snapshots/checkpoints without repeating completed inference", async () => {
    const directory = resolve(".data", `ai-test-${randomUUID()}`);
    await mkdir(directory, { recursive: true });
    try {
      const store = new LocalStore();
      const opportunity = (await store.get("opp-01"))!;
      const first = new LocalAiState(directory);
      const job = { id: "persistent-job", type: "GenerateProposal" as const, opportunity, documents: [] };
      await first.saveJob(job);
      const retrieval = { retrieveEvidence: async () => ({ citations: [], mode: "fixture" as const, warnings: [] }) };
      await new ProposalOrchestrator(new FixtureModelProvider(), retrieval, first).advance(job);
      const second = new LocalAiState(directory);
      const model = new FixtureModelProvider();
      const analyze = vi.spyOn(model, "analyze");
      await new ProposalOrchestrator(model, retrieval, second).run((await second.loadJob(job.id))!);
      expect(analyze).not.toHaveBeenCalled();
      expect((await second.load(job.id))?.completedStages).toHaveLength(4);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("loads legacy local generation runs with explicit unknown evidence defaults", async () => {
    const file = resolve(".data", `legacy-store-${randomUUID()}.json`);
    await mkdir(resolve(".data"), { recursive: true });
    await writeFile(file, JSON.stringify({
      opportunities: [],
      documents: [],
      content: [],
      proposals: [],
      auditEvents: [],
      generationRuns: [{
        id: "legacy-run",
        opportunityId: "opp-legacy",
        proposalId: "proposal-legacy",
        status: "Complete",
        progress: 100,
        stages: [{ key: "requirements", label: "Requirements", detail: "Legacy", status: "Complete" }],
        retrievedContentIds: [],
        startedAt: "2026-09-07T10:00:00.000Z",
        completedAt: "2026-09-07T10:01:00.000Z"
      }]
    }), "utf8");
    try {
      const store = new LocalStore(file);
      await store.initialize();
      expect(await store.runs.get("legacy-run")).toMatchObject({
        retrieval: { mode: "unknown" },
        providerEvidence: {
          provider: "unknown",
          successfulModelOperations: 0,
          legacyEvidenceUnavailable: true
        },
        stages: [{ execution: "not-executed", completedOperations: 0 }]
      });
    } finally {
      await rm(file, { force: true });
    }
  });
});
