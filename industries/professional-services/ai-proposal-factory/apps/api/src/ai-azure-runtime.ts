import { AsyncLocalStorage } from "node:async_hooks";
import { AiError, createAzureCredential, loadAiConfig } from "@proposal-factory/ai";
import type { Opportunity, Proposal } from "@proposal-factory/contracts";
import type { ApplicationStore } from "./application.js";
import { FixtureRetrievalAdapter } from "./adapters.js";
import { createAiRuntime } from "./ai-runtime.js";
import { createAzureDataRuntime } from "./azure-data/create-azure-data.js";
import type { ReturnTypeOfAzureRuntime } from "./azure-data/types.js";
import { AzureAiJobState } from "./ai-azure-state.js";
import { AzureProposalWorkflow, uniqueIds } from "./ai-azure-workflow.js";

export function createAzureApplicationRuntime(environment: NodeJS.ProcessEnv = process.env,
  options: { data?: ReturnTypeOfAzureRuntime } = {}) {
  const config = loadAiConfig(environment);
  const data = options.data ?? createAzureDataRuntime(environment, createAzureCredential(config));
  const settings = data.configuration.azure;
  const database = data.clients.cosmos.database(settings.cosmos.database);
  const state = new AzureAiJobState(database.container(settings.cosmos.containers.generationRuns));
  const versions = new AsyncLocalStorage<Map<string, string>>();
  const cache = (key: string, etag: string) => versions.getStore()?.set(key, etag);
  const readOpportunity = async (id: string) => {
    const result = await data.repositories.opportunities.getVersioned(id);
    if (result) cache(`opportunity:${id}`, result.etag);
    return result?.value;
  };
  const readProposal = async (id: string) => {
    const plain = await data.repositories.proposals.get(id);
    if (!plain) return;
    const result = await data.repositories.proposals.getVersioned(id, plain.opportunityId);
    if (result) cache(`proposal:${id}`, result.etag);
    return result?.value;
  };
  const saveOpportunity = async (value: Opportunity) => {
    const etag = versions.getStore()?.get(`opportunity:${value.id}`);
    if (etag) {
      await state.assertLease(`opportunity:${value.id}`);
      cache(`opportunity:${value.id}`, await data.repositories.opportunities.saveVersioned(value, etag)); return;
    }
    if (await data.repositories.opportunities.get(value.id)) throw new AiError("ETAG_REQUIRED", "Mutation must preserve the original opportunity ETag.");
    await database.container(settings.cosmos.containers.opportunities).items.create({
      ...value, entityType: "opportunity", partitionKey: value.id, schemaVersion: 1
    });
  };
  const saveProposal = async (value: Proposal) => {
    const etag = versions.getStore()?.get(`proposal:${value.id}`);
    if (!etag) throw new AiError("ETAG_REQUIRED", "Mutation must preserve the original proposal ETag.");
    await state.assertLease(`opportunity:${value.opportunityId}`);
    cache(`proposal:${value.id}`, await data.repositories.proposals.saveVersioned(value, etag));
  };
  const store: ApplicationStore = {
    list: () => data.repositories.opportunities.list(), get: readOpportunity, save: saveOpportunity,
    search: (query, filters) => data.repositories.content.search(query, filters),
    getContent: (id) => data.repositories.content.getContent(id),
    getMany: (ids) => data.repositories.content.getMany(ids),
    saveContent: (content) => data.repositories.content.saveContent(content),
    documents: data.repositories.documents,
    runs: data.repositories.generationRuns,
    audit: data.repositories.audit,
    proposals: {
      get: readProposal, save: saveProposal,
      getByOpportunity: async (id) => {
        const proposal = await data.repositories.proposals.getByOpportunity(id);
        return proposal ? readProposal(proposal.id) : undefined;
      }
    }
  };
  const ai = createAiRuntime(new FixtureRetrievalAdapter(store), { config, state, checkpoints: state });
  const clock = { now: () => new Date().toISOString() };
  const workflow = new AzureProposalWorkflow(data, state, ai, clock, uniqueIds,
    { run: (operation) => versions.run(new Map(), operation) });
  return { data, store, ai, state, workflow, clock, ids: uniqueIds };
}
