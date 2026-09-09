import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { normalizeGenerationRun, type
  AuditEvent,
  DocumentMetadata,
  GenerationRun,
  Opportunity,
  Proposal,
  ReusableContent
} from "@proposal-factory/contracts";
import type {
  AuditRepository,
  ContentRepository,
  DocumentRepository,
  GenerationRunRepository,
  OpportunityRepository,
  ProposalRepository
} from "@proposal-factory/domain";
import { createFixtureContent, createFixtureDocuments, createFixtureOpportunities } from "./fixtures.js";

interface StoreSnapshot {
  opportunities: Opportunity[];
  documents: DocumentMetadata[];
  content: ReusableContent[];
  proposals: Proposal[];
  generationRuns: GenerationRun[];
  auditEvents: AuditEvent[];
}

function seededSnapshot(): StoreSnapshot {
  return {
    opportunities: createFixtureOpportunities(),
    documents: createFixtureDocuments(),
    content: createFixtureContent(),
    proposals: [],
    generationRuns: [],
    auditEvents: []
  };
}

export class LocalStore implements OpportunityRepository, ContentRepository {
  private state = seededSnapshot();

  constructor(private readonly filePath?: string) {}

  async initialize() {
    if (!this.filePath) return;
    try {
      const stored = JSON.parse(await readFile(this.filePath, "utf8")) as StoreSnapshot;
      this.state = {
        ...seededSnapshot(),
        ...stored,
        generationRuns: (stored.generationRuns ?? []).map(normalizeGenerationRun)
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.persist();
    }
  }

  private async persist() {
    if (!this.filePath) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
  }

  async list() {
    return [...this.state.opportunities].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string) {
    return this.state.opportunities.find((item) => item.id === id);
  }

  async save(opportunity: Opportunity) {
    const index = this.state.opportunities.findIndex((item) => item.id === opportunity.id);
    if (index >= 0) this.state.opportunities[index] = opportunity;
    else this.state.opportunities.push(opportunity);
    await this.persist();
  }

  async listDocuments(opportunityId?: string) {
    return this.state.documents.filter(
      (document) => !opportunityId || !document.opportunityId || document.opportunityId === opportunityId
    );
  }

  async saveDocument(document: DocumentMetadata) {
    const index = this.state.documents.findIndex((item) => item.id === document.id);
    if (index >= 0) this.state.documents[index] = document;
    else this.state.documents.push(document);
    await this.persist();
  }

  async getDocument(id: string) {
    return this.state.documents.find((document) => document.id === id);
  }

  async search(query: string, filters: { kind?: string; scenario?: string; industry?: string } = {}) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return this.state.content
      .filter((item) => !filters.kind || item.kind === filters.kind)
      .filter((item) => !filters.scenario || item.scenario === filters.scenario)
      .filter((item) => !filters.industry || item.industries.includes(filters.industry))
      .filter((item) => {
        if (terms.length === 0) return true;
        const haystack = `${item.title} ${item.summary} ${item.body} ${item.tags.join(" ")}`.toLowerCase();
        return terms.some((term) => haystack.includes(term));
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  async getMany(ids: string[]) {
    return ids
      .map((id) => this.state.content.find((item) => item.id === id))
      .filter((item): item is ReusableContent => Boolean(item));
  }

  async getContent(id: string) {
    return this.state.content.find((item) => item.id === id);
  }

  async saveContent(content: ReusableContent) {
    const index = this.state.content.findIndex((item) => item.id === content.id);
    if (index >= 0) this.state.content[index] = content;
    else this.state.content.push(content);
    await this.persist();
  }

  async getProposal(id: string) {
    return this.state.proposals.find((item) => item.id === id);
  }

  async getByOpportunity(opportunityId: string) {
    return this.state.proposals.find((item) => item.opportunityId === opportunityId);
  }

  async saveProposal(proposal: Proposal) {
    const index = this.state.proposals.findIndex(
      (item) => item.id === proposal.id || item.opportunityId === proposal.opportunityId
    );
    if (index >= 0) this.state.proposals[index] = proposal;
    else this.state.proposals.push(proposal);
    await this.persist();
  }

  async getRun(id: string) {
    const run = this.state.generationRuns.find((item) => item.id === id);
    return run ? normalizeGenerationRun(run) : undefined;
  }

  async saveRun(run: GenerationRun) {
    run = normalizeGenerationRun(run);
    const index = this.state.generationRuns.findIndex((item) => item.id === run.id);
    if (index >= 0) this.state.generationRuns[index] = run;
    else this.state.generationRuns.push(run);
    await this.persist();
  }

  async listAudit(opportunityId?: string) {
    return this.state.auditEvents
      .filter((item) => !opportunityId || item.opportunityId === opportunityId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  async append(event: AuditEvent) {
    if (this.state.auditEvents.some((item) => item.id === event.id)) return;
    this.state.auditEvents.push(event);
    await this.persist();
  }

  documents: DocumentRepository = {
    list: (opportunityId) => this.listDocuments(opportunityId),
    get: (id) => this.getDocument(id),
    save: (document) => this.saveDocument(document)
  };

  proposals: ProposalRepository = {
    get: (id) => this.getProposal(id),
    getByOpportunity: (opportunityId) => this.getByOpportunity(opportunityId),
    save: (proposal) => this.saveProposal(proposal)
  };

  runs: GenerationRunRepository = {
    get: (id) => this.getRun(id),
    save: (run) => this.saveRun(run)
  };

  audit: AuditRepository = {
    list: (opportunityId) => this.listAudit(opportunityId),
    append: (event) => this.append(event)
  };
}
