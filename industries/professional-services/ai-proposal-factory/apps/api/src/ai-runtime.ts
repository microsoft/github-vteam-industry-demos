import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  AzureEmbeddingProvider, AzureModelProvider, AzureSearchRetrievalAdapter, FixtureKnowledgeRetriever,
  FixtureModelProvider, MemoryCheckpointStore, ProposalOrchestrator, createOpenAITransport,
  createSearchTransport, loadAiConfig, type AiCheckpoint, type AiConfig, type AiJob, type CheckpointStore
} from "@proposal-factory/ai";
import type { RetrievalAdapter } from "@proposal-factory/domain";

export interface AiJobState extends CheckpointStore {
  saveJob(job: AiJob): Promise<void>;
  loadJob(id: string): Promise<AiJob | undefined>;
}

// Single-process local persistence only. Product replaces these ports with durable leases/checkpoints.
export class LocalAiState extends MemoryCheckpointStore {
  private readonly jobs = new Map<string, AiJob>();
  constructor(private readonly directory?: string) { super(); }
  private path(id: string, kind: string) {
    return join(this.directory!, `${createHash("sha256").update(id).digest("hex")}.${kind}.json`);
  }
  private async read<T>(id: string, kind: string): Promise<T | undefined> {
    try { return JSON.parse(await readFile(this.path(id, kind), "utf8")) as T; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  }
  private async write(id: string, kind: string, value: unknown) {
    await mkdir(this.directory!, { recursive: true });
    const target = this.path(id, kind);
    const staged = `${target}.${randomUUID()}.pending`;
    try {
      await writeFile(staged, JSON.stringify(value), { encoding: "utf8", flag: "wx" });
      await rename(staged, target);
    } finally { await rm(staged, { force: true }); }
  }
  override async load(id: string) {
    return this.directory ? this.read<AiCheckpoint>(id, "checkpoint") : super.load(id);
  }
  override async save(value: AiCheckpoint) {
    if (this.directory) await this.write(value.jobId, "checkpoint", value);
    else await super.save(value);
  }
  async saveJob(job: AiJob) {
    if (this.directory) await this.write(job.id, "input", job);
    else this.jobs.set(job.id, structuredClone(job));
  }
  async loadJob(id: string) {
    const job = this.directory ? await this.read<AiJob>(id, "input") : this.jobs.get(id);
    return job ? structuredClone(job) : undefined;
  }
}

export interface AiRuntime {
  config: AiConfig;
  state: AiJobState;
  orchestrator: ProposalOrchestrator;
  retrieval: RetrievalAdapter;
}

export function createAiRuntime(fixtureRetrieval: RetrievalAdapter, options: {
  config?: AiConfig; state?: AiJobState; checkpoints?: CheckpointStore; statePath?: string
} = {}): AiRuntime {
  const config = options.config ?? loadAiConfig();
  const state = options.state ?? new LocalAiState(options.statePath);
  if (config.provider === "fixture") {
    return {
      config, state, retrieval: fixtureRetrieval,
      orchestrator: new ProposalOrchestrator(new FixtureModelProvider(),
        new FixtureKnowledgeRetriever(fixtureRetrieval), options.checkpoints ?? state)
    };
  }
  const transport = createOpenAITransport(config);
  const embeddings = config.embeddingsEnabled ? new AzureEmbeddingProvider(config, transport) : undefined;
  const retrieval = new AzureSearchRetrievalAdapter(config, createSearchTransport(config), embeddings);
  return {
    config, state, retrieval,
    orchestrator: new ProposalOrchestrator(new AzureModelProvider(config, transport), retrieval, options.checkpoints ?? state)
  };
}
