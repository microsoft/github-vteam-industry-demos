import { CosmosCheckpointStore, AiError, type AiJob, type AiJobState, type WorkflowResult } from "@proposal-factory/ai";
import type { GenerationRun, Proposal } from "@proposal-factory/contracts";

export interface AzureJobRecord {
  kind: "job";
  job: AiJob;
  run: GenerationRun;
  baselineEtag?: string;
  baselineOpportunityEtag: string;
  dispatched: boolean;
  terminal: boolean;
  committed: boolean;
  publication?: { proposal: Proposal; result: WorkflowResult };
}

export class AzureAiJobState extends CosmosCheckpointStore implements AiJobState {
  async saveJob(job: AiJob) {
    await this.exclusive(`input:${job.id}`, async () => {
      const existing = await this.readValue<AiJob>(`input:${job.id}`);
      if (existing && JSON.stringify(existing) !== JSON.stringify(job)) {
        throw new AiError("CHECKPOINT_CONFLICT", "An immutable generation input snapshot already exists.");
      }
      if (!existing) await this.writeValue(`input:${job.id}`, job);
    });
  }
  async loadJob(id: string) { return this.readValue<AiJob>(`input:${id}`); }
  async record(id: string) { return this.readValue<AzureJobRecord>(`delivery:${id}`); }
  async updateRecord(id: string, change: (record: AzureJobRecord) => AzureJobRecord) {
    return this.exclusive(`delivery:${id}`, async () => {
      const record = await this.record(id);
      if (!record) throw new AiError("MISSING_JOB", "Durable generation dispatch record is missing.");
      const updated = change(record);
      await this.writeValue(`delivery:${id}`, updated);
      return updated;
    });
  }
}
