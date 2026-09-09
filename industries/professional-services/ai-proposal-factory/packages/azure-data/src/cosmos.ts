import { normalizeGenerationRun, type
  AuditEvent,
  DocumentMetadata,
  ExportResult,
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
import type { Container, CosmosClient, Database, SqlQuerySpec } from "@azure/cosmos";
import type { AzureDataSettings, CosmosContainerSettings } from "./config.js";
import { azureStatusCode, ConcurrencyConflictError } from "./errors.js";

const schemaVersion = 1;
const sharedPartition = "shared";

interface StoredFields {
  entityType: string;
  partitionKey: string;
  schemaVersion: number;
  _etag?: string;
  searchText?: string;
}

export interface Versioned<T> {
  value: T;
  etag: string;
}

export interface ConcurrencyAwareRepository<T> {
  getVersioned(id: string, partitionKey?: string): Promise<Versioned<T> | undefined>;
  saveVersioned(value: T, etag: string): Promise<string>;
}

function store<T extends { id: string }>(
  value: T,
  entityType: string,
  partitionKey: string,
  additional: Record<string, unknown> = {}
) {
  return { ...value, ...additional, entityType, partitionKey, schemaVersion };
}

function domain<T>(record: (T & StoredFields) | undefined): T | undefined {
  if (!record) return undefined;
  const { entityType, partitionKey, schemaVersion: _schemaVersion, _etag, searchText, ...value } = record;
  void entityType;
  void partitionKey;
  void _schemaVersion;
  void _etag;
  void searchText;
  return value as T;
}

async function readRecord<T>(container: Container, id: string, partitionKey: string) {
  try {
    const response = await container.item(id, partitionKey).read<T & StoredFields>();
    return response.resource;
  } catch (error) {
    if (azureStatusCode(error) === 404) return undefined;
    throw error;
  }
}

async function queryRecords<T>(container: Container, query: SqlQuerySpec) {
  const response = await container.items.query<T & StoredFields>(query).fetchAll();
  return response.resources.map((item) => domain<T>(item)!);
}

async function replaceVersioned<T extends { id: string }>(
  container: Container,
  value: T,
  partitionKey: string,
  entityType: string,
  etag: string,
  additional: Record<string, unknown> = {}
) {
  try {
    const response = await container.item(value.id, partitionKey).replace(store(value, entityType, partitionKey, additional), {
      accessCondition: { type: "IfMatch", condition: etag }
    });
    return response.etag ?? "";
  } catch (error) {
    if (azureStatusCode(error) === 412) throw new ConcurrencyConflictError(value.id);
    throw error;
  }
}

export class CosmosOpportunityRepository
  implements OpportunityRepository, ConcurrencyAwareRepository<Opportunity>
{
  constructor(private readonly container: Container) {}

  list() {
    return queryRecords<Opportunity>(this.container, {
      query: "SELECT * FROM c WHERE c.entityType = @entityType ORDER BY c.updatedAt DESC",
      parameters: [{ name: "@entityType", value: "opportunity" }]
    });
  }

  async get(id: string) {
    return domain<Opportunity>(await readRecord<Opportunity>(this.container, id, id));
  }

  async save(opportunity: Opportunity) {
    await this.container.items.upsert(store(opportunity, "opportunity", opportunity.id));
  }

  async getVersioned(id: string) {
    const record = await readRecord<Opportunity>(this.container, id, id);
    return record && record._etag ? { value: domain<Opportunity>(record)!, etag: record._etag } : undefined;
  }

  saveVersioned(opportunity: Opportunity, etag: string) {
    return replaceVersioned(this.container, opportunity, opportunity.id, "opportunity", etag);
  }
}

export class CosmosDocumentRepository implements DocumentRepository {
  constructor(private readonly container: Container) {}

  list(opportunityId?: string) {
    if (!opportunityId) {
      return queryRecords<DocumentMetadata>(this.container, {
        query: "SELECT * FROM c WHERE c.entityType = @entityType ORDER BY c.createdAt DESC",
        parameters: [{ name: "@entityType", value: "document" }]
      });
    }
    return queryRecords<DocumentMetadata>(this.container, {
      query:
        "SELECT * FROM c WHERE c.entityType = @entityType AND (c.partitionKey = @opportunityId OR c.partitionKey = @shared) ORDER BY c.createdAt DESC",
      parameters: [
        { name: "@entityType", value: "document" },
        { name: "@opportunityId", value: opportunityId },
        { name: "@shared", value: sharedPartition }
      ]
    });
  }

  async get(id: string) {
    return (
      await queryRecords<DocumentMetadata>(this.container, {
        query: "SELECT TOP 1 * FROM c WHERE c.entityType = @entityType AND c.id = @id",
        parameters: [
          { name: "@entityType", value: "document" },
          { name: "@id", value: id }
        ]
      })
    )[0];
  }

  async save(document: DocumentMetadata) {
    const partitionKey = document.opportunityId ?? sharedPartition;
    await this.container.items.upsert(store(document, "document", partitionKey));
  }
}

export class CosmosContentRepository implements ContentRepository {
  constructor(private readonly container: Container) {}

  async search(query: string, filters: { kind?: string; scenario?: string; industry?: string } = {}) {
    const conditions = ["c.entityType = @entityType"];
    const parameters: SqlQuerySpec["parameters"] = [{ name: "@entityType", value: "content" }];
    if (query.trim()) {
      conditions.push("CONTAINS(c.searchText, @query, true)");
      parameters.push({ name: "@query", value: query.trim() });
    }
    if (filters.kind) {
      conditions.push("c.kind = @kind");
      parameters.push({ name: "@kind", value: filters.kind });
    }
    if (filters.scenario) {
      conditions.push("c.scenario = @scenario");
      parameters.push({ name: "@scenario", value: filters.scenario });
    }
    if (filters.industry) {
      conditions.push("ARRAY_CONTAINS(c.industries, @industry)");
      parameters.push({ name: "@industry", value: filters.industry });
    }
    return queryRecords<ReusableContent>(this.container, {
      query: `SELECT * FROM c WHERE ${conditions.join(" AND ")} ORDER BY c.title`,
      parameters
    });
  }

  async getContent(id: string) {
    return (
      await queryRecords<ReusableContent>(this.container, {
        query: "SELECT TOP 1 * FROM c WHERE c.entityType = @entityType AND c.id = @id",
        parameters: [
          { name: "@entityType", value: "content" },
          { name: "@id", value: id }
        ]
      })
    )[0];
  }

  getMany(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return queryRecords<ReusableContent>(this.container, {
      query: "SELECT * FROM c WHERE c.entityType = @entityType AND ARRAY_CONTAINS(@ids, c.id)",
      parameters: [
        { name: "@entityType", value: "content" },
        { name: "@ids", value: ids }
      ]
    });
  }

  async saveContent(content: ReusableContent) {
    const searchText = `${content.title} ${content.summary} ${content.body} ${content.tags.join(" ")}`;
    await this.container.items.upsert(store(content, "content", content.scenario, { searchText }));
  }

  save(content: ReusableContent) {
    return this.saveContent(content);
  }
}

export class CosmosProposalRepository implements ProposalRepository, ConcurrencyAwareRepository<Proposal> {
  constructor(private readonly container: Container) {}

  async get(id: string) {
    return (
      await queryRecords<Proposal>(this.container, {
        query: "SELECT TOP 1 * FROM c WHERE c.entityType = @entityType AND c.id = @id",
        parameters: [
          { name: "@entityType", value: "proposal" },
          { name: "@id", value: id }
        ]
      })
    )[0];
  }

  async getByOpportunity(opportunityId: string) {
    return (
      await queryRecords<Proposal>(this.container, {
        query:
          "SELECT TOP 1 * FROM c WHERE c.entityType = @entityType AND c.partitionKey = @opportunityId ORDER BY c.updatedAt DESC",
        parameters: [
          { name: "@entityType", value: "proposal" },
          { name: "@opportunityId", value: opportunityId }
        ]
      })
    )[0];
  }

  async save(proposal: Proposal) {
    await this.container.items.upsert(store(proposal, "proposal", proposal.opportunityId));
  }

  async getVersioned(id: string, opportunityId?: string) {
    if (!opportunityId) {
      throw new Error("Proposal opportunityId partition key is required for a versioned read.");
    }
    const record = await readRecord<Proposal>(this.container, id, opportunityId);
    return record && record._etag ? { value: domain<Proposal>(record)!, etag: record._etag } : undefined;
  }

  saveVersioned(proposal: Proposal, etag: string) {
    return replaceVersioned(this.container, proposal, proposal.opportunityId, "proposal", etag);
  }
}

export class CosmosGenerationRunRepository
  implements GenerationRunRepository, ConcurrencyAwareRepository<GenerationRun>
{
  constructor(private readonly container: Container) {}

  async get(id: string) {
    const run = (
      await queryRecords<GenerationRun>(this.container, {
        query: "SELECT TOP 1 * FROM c WHERE c.entityType = @entityType AND c.id = @id",
        parameters: [
          { name: "@entityType", value: "generation-run" },
          { name: "@id", value: id }
        ]
      })
    )[0];
    return run ? normalizeGenerationRun(run) : undefined;
  }

  async save(run: GenerationRun) {
    const normalized = normalizeGenerationRun(run);
    await this.container.items.upsert(store(normalized, "generation-run", normalized.opportunityId));
  }

  async getVersioned(id: string, opportunityId?: string) {
    if (!opportunityId) {
      throw new Error("Generation run opportunityId partition key is required for a versioned read.");
    }
    const record = await readRecord<GenerationRun>(this.container, id, opportunityId);
    return record && record._etag
      ? { value: normalizeGenerationRun(domain<GenerationRun>(record)!), etag: record._etag }
      : undefined;
  }

  saveVersioned(run: GenerationRun, etag: string) {
    const normalized = normalizeGenerationRun(run);
    return replaceVersioned(this.container, normalized, normalized.opportunityId, "generation-run", etag);
  }
}

export class CosmosExportRepository {
  constructor(private readonly container: Container) {}

  async save(result: ExportResult) {
    await this.container.items.upsert(store(result, "export", result.proposalId));
  }

  async get(id: string, proposalId: string) {
    return domain<ExportResult>(await readRecord<ExportResult>(this.container, id, proposalId));
  }

  list(proposalId: string) {
    return queryRecords<ExportResult>(this.container, {
      query:
        "SELECT * FROM c WHERE c.entityType = @entityType AND c.partitionKey = @proposalId ORDER BY c.createdAt DESC",
      parameters: [
        { name: "@entityType", value: "export" },
        { name: "@proposalId", value: proposalId }
      ]
    });
  }
}

export class CosmosAuditRepository implements AuditRepository {
  constructor(private readonly container: Container) {}

  list(opportunityId?: string) {
    const conditions = ["c.entityType = @entityType"];
    const parameters: SqlQuerySpec["parameters"] = [{ name: "@entityType", value: "audit-event" }];
    if (opportunityId) {
      conditions.push("c.partitionKey = @opportunityId");
      parameters.push({ name: "@opportunityId", value: opportunityId });
    }
    return queryRecords<AuditEvent>(this.container, {
      query: `SELECT * FROM c WHERE ${conditions.join(" AND ")} ORDER BY c.occurredAt DESC`,
      parameters
    });
  }

  async append(event: AuditEvent) {
    await this.container.items.create(store(event, "audit-event", event.opportunityId));
  }
}

export interface AzureCosmosRepositories {
  opportunities: CosmosOpportunityRepository;
  documents: CosmosDocumentRepository;
  content: CosmosContentRepository;
  proposals: CosmosProposalRepository;
  generationRuns: CosmosGenerationRunRepository;
  exports: CosmosExportRepository;
  audit: CosmosAuditRepository;
}

export function createCosmosRepositories(client: CosmosClient, settings: AzureDataSettings): AzureCosmosRepositories {
  const database = client.database(settings.cosmos.database);
  return createCosmosRepositoriesFromDatabase(database, settings.cosmos.containers);
}

export function createCosmosRepositoriesFromDatabase(
  database: Database,
  containers: CosmosContainerSettings
): AzureCosmosRepositories {
  return {
    opportunities: new CosmosOpportunityRepository(database.container(containers.opportunities)),
    documents: new CosmosDocumentRepository(database.container(containers.documents)),
    content: new CosmosContentRepository(database.container(containers.content)),
    proposals: new CosmosProposalRepository(database.container(containers.proposals)),
    generationRuns: new CosmosGenerationRunRepository(database.container(containers.generationRuns)),
    exports: new CosmosExportRepository(database.container(containers.exports)),
    audit: new CosmosAuditRepository(database.container(containers.auditEvents))
  };
}

export type SeedCollection = keyof CosmosContainerSettings;

export class CosmosSeedWriter {
  constructor(
    private readonly database: Database,
    private readonly containers: CosmosContainerSettings
  ) {}

  async putIfAbsent(
    collection: SeedCollection,
    value: { id: string },
    partitionKey: string,
    entityType: string,
    additional: Record<string, unknown> = {}
  ) {
    const container = this.database.container(this.containers[collection]);
    try {
      await container.items.create(store(value, entityType, partitionKey, additional));
      return true;
    } catch (error) {
      if (azureStatusCode(error) === 409) return false;
      throw error;
    }
  }
}
