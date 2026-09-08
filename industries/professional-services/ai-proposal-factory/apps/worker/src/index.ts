import { pathToFileURL } from "node:url";
import { AiError, classifyFailure, type ProposalOrchestrator, type AiJob, type WorkflowResult } from "@proposal-factory/ai";
import { parseDataProviderConfiguration } from "@proposal-factory/azure-data";

export interface WorkMessage {
  id: string;
  type: "GenerateProposal" | "RegenerateSection" | "ExportProposal";
  payload: Record<string, unknown>;
}

export interface WorkQueue {
  receive(): Promise<WorkMessage | undefined>;
  complete(message: WorkMessage): Promise<void>;
  fail(message: WorkMessage, reason: string, failure?: { retryable: boolean }): Promise<void>;
}

export interface WorkHandler {
  handle(message: WorkMessage): Promise<void>;
}

export async function processNextMessage(queue: WorkQueue, handler: WorkHandler) {
  const message = await queue.receive();
  if (!message) return false;
  try {
    await handler.handle(message);
    await queue.complete(message);
  } catch (error) {
    const failure = classifyFailure(error);
    await queue.fail(message, failure.code, { retryable: failure.retryable });
  }
  return true;
}

export interface GenerationJobPersistence {
  loadJob(id: string): Promise<AiJob | undefined>;
  isCommitted(id: string): Promise<boolean>;
  /** Must idempotently publish content/audit before completion, checking the expected proposal revision. */
  commitResult(job: AiJob, result: WorkflowResult): Promise<void>;
  markFailed(id: string, failure: { code: string; retryable: boolean }): Promise<void>;
}

export class GenerationWorkHandler implements WorkHandler {
  constructor(private readonly orchestration: Pick<ProposalOrchestrator, "run">, private readonly persistence: GenerationJobPersistence) {}
  async handle(message: WorkMessage) {
    if (message.type !== "GenerateProposal" && message.type !== "RegenerateSection") {
      throw new AiError("UNSUPPORTED_WORK", "This handler accepts generation and section regeneration only.");
    }
    const jobId = message.payload.jobId;
    if (typeof jobId !== "string" || !jobId || jobId.length > 200) {
      throw new AiError("INVALID_JOB", "Generation message requires a bounded jobId.");
    }
    const job = await this.persistence.loadJob(jobId);
    if (!job || job.id !== jobId || job.type !== message.type) throw new AiError("INVALID_JOB", "Message does not match the persisted input snapshot.");
    if (await this.persistence.isCommitted(jobId)) return;
    try {
      const result = await this.orchestration.run(job);
      await this.persistence.commitResult(job, result);
    } catch (error) {
      await this.persistence.markFailed(jobId, classifyFailure(error));
      throw error;
    }
  }
}

export async function runWorker(queue: WorkQueue, handler: WorkHandler, options: {
  signal: AbortSignal; idleMs?: number;
  dispatchPending?: () => Promise<void>;
  dispatchIntervalMs?: number;
  onError?: (code: string) => void;
}) {
  const idleMs = options.idleMs ?? 1000;
  const dispatchIntervalMs = options.dispatchIntervalMs ?? 30000;
  if (!Number.isFinite(idleMs) || idleMs < 100 || idleMs > 60000) throw new AiError("INVALID_CONFIG", "Worker idle interval must be 100–60000ms.");
  if (!Number.isFinite(dispatchIntervalMs) || dispatchIntervalMs < 100 || dispatchIntervalMs > 60000) {
    throw new AiError("INVALID_CONFIG", "Outbox interval must be 100–60000ms.");
  }
  let nextDispatch = 0;
  const report = options.onError ?? ((code: string) => console.error(`Worker will retry: ${code}`));
  const dispatchIfDue = async () => {
    if (!options.dispatchPending || Date.now() < nextDispatch) return;
    try { await options.dispatchPending(); }
    catch (error) { report(classifyFailure(error).code); }
    nextDispatch = Date.now() + dispatchIntervalMs;
  };
  while (!options.signal.aborted) {
    await dispatchIfDue();
    if (options.signal.aborted) break;
    let processed = false;
    try { processed = await processNextMessage(queue, handler); }
    catch (error) { report(classifyFailure(error).code); }
    await dispatchIfDue();
    if (options.signal.aborted) break;
    if (!processed) {
      await new Promise<void>((resolve) => {
        const complete = () => { clearTimeout(timer); options.signal.removeEventListener("abort", complete); resolve(); };
        const timer = setTimeout(complete, idleMs);
        options.signal.addEventListener("abort", complete, { once: true });
        if (options.signal.aborted) complete();
      });
    }
  }
}

export async function startConfiguredWorker(environment: NodeJS.ProcessEnv = process.env, signal?: AbortSignal) {
  const configuration = parseDataProviderConfiguration(environment);
  if (configuration.provider === "local") {
    console.log("Fixture/local mode: generation runs in the API; no Azure queue consumer is started.");
    return;
  }
  const { createAzureApplicationRuntime } = await import("@proposal-factory/api/runtime");
  const runtime = createAzureApplicationRuntime(environment);
  const handler = new GenerationWorkHandler({ run: (job) => runtime.workflow.execute(job) }, runtime.workflow);
  const queue: WorkQueue = {
    receive: () => runtime.data.queue.receive(),
    complete: (message) => runtime.data.queue.complete(message),
    fail: async (message, reason, failure) => {
      const exhausted = runtime.data.queue.deliveryAttempts(message) >= configuration.azure.queue.maxDequeueCount;
      if (exhausted && typeof message.payload.jobId === "string") {
        await runtime.workflow.markFailed(message.payload.jobId, { code: "RETRY_EXHAUSTED", retryable: false });
      }
      await runtime.data.queue.fail(message, reason, exhausted ? { retryable: false } : failure);
    }
  };
  await runWorker(queue, handler, {
    signal: signal ?? new AbortController().signal,
    dispatchPending: () => runtime.workflow.dispatchPending()
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  process.once("SIGTERM", () => controller.abort());
  try { await startConfiguredWorker(process.env, controller.signal); }
  catch (error) {
    console.error(`Worker stopped: ${classifyFailure(error).code}`);
    process.exitCode = 1;
  }
}
