import multipart from "@fastify/multipart";
import { resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { proposalSectionKeys, type ContentKind, type DocumentKind, type OpportunityInput, type ProposalSectionKey, type ReusableContent, type ReusableContentInput, type ScenarioCategory, type SectionApprovalRequest, type ProposalApprovalRequest } from "@proposal-factory/contracts";
import { DomainError, type Clock, type IdGenerator } from "@proposal-factory/domain";
import {
  ProposalFactoryApplication,
  SequentialIds,
  SystemClock,
  type ApplicationStore
} from "./application.js";
import { LocalStore } from "./local-store.js";
import type { AiRuntime } from "./ai-runtime.js";
import type { AzureProposalWorkflow } from "./ai-azure-workflow.js";
import { AiError } from "@proposal-factory/ai";
import { BlobValidationError, ConcurrencyConflictError } from "@proposal-factory/azure-data";
import { AccessError, installAuthentication, loadAuthConfiguration } from "./auth.js";
import {
  LocalDocumentStorage,
  DocumentUploadPersistenceError,
  uploadLimits,
  type DocumentContentStorage
} from "./document-storage.js";

const documentKinds: DocumentKind[] = ["Meeting Notes", "Requirements", "Project Brief", "Pricing"];
const contentKinds: ContentKind[] = ["Proposal Snippet", "Case Study", "Delivery Methodology", "Service Description", "Pricing Assumption"];
const scenarios: ScenarioCategory[] = ["Cloud modernization", "AI adoption", "Data platform modernization", "Application modernization", "Customer service transformation"];

function requireSectionKey(value: string): ProposalSectionKey {
  if (!proposalSectionKeys.includes(value as ProposalSectionKey)) {
    throw new DomainError(`Unknown proposal section: ${value}.`, "INVALID_SECTION");
  }
  return value as ProposalSectionKey;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new DomainError(`${field} is required.`, "VALIDATION_ERROR");
  return value.trim();
}

function requiredStringArray(value: unknown, field: string) {
  if (!Array.isArray(value)) throw new DomainError(`${field} must be a list.`, "VALIDATION_ERROR");
  const items = value.map((item) => requiredString(item, field));
  if (items.length === 0) throw new DomainError(`${field} must include at least one value.`, "VALIDATION_ERROR");
  return items;
}

export async function createApp(options: {
  authEnvironment?: NodeJS.ProcessEnv;
  dataFile?: string;
  logger?: boolean;
  clock?: Clock;
  ids?: IdGenerator;
  ai?: AiRuntime;
  store?: ApplicationStore;
  dataProvider?: "local" | "azure";
  workflow?: AzureProposalWorkflow;
  documentStorage?: DocumentContentStorage;
  uploadDirectory?: string;
  uploadMaxBytes?: number;
  extractedTextMaxCharacters?: number;
} = {}) {
  const auth = loadAuthConfiguration(options.authEnvironment);
  const localStore = options.store ? undefined : new LocalStore(options.dataFile);
  await localStore?.initialize();
  const store = options.store ?? localStore!;
  const configuredLimits = uploadLimits();
  const uploadMaxBytes = options.uploadMaxBytes ?? configuredLimits.maxBytes;
  const extractedTextMaxCharacters =
    options.extractedTextMaxCharacters ?? configuredLimits.maxExtractedCharacters;
  const documentStorage =
    options.documentStorage ??
    new LocalDocumentStorage(
      options.uploadDirectory ?? resolve(process.cwd(), ".data", "uploads"),
      uploadMaxBytes,
      extractedTextMaxCharacters
    );
  const application = new ProposalFactoryApplication({
    store,
    clock: options.clock ?? new SystemClock(),
    ids: options.ids ?? new SequentialIds(),
    ...(options.ai ? { ai: options.ai } : {}),
    ...(options.workflow ? { workflow: options.workflow } : {}),
    documentStorage,
    ...(options.dataFile ? { aiStatePath: `${options.dataFile}.ai` } : {})
  });
  const app: FastifyInstance = Fastify({ logger: options.logger ?? false });
  installAuthentication(app, auth);
  await app.register(multipart, {
    limits: { files: 1, fields: 2, parts: 3, fileSize: uploadMaxBytes }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AccessError) {
      if (error.statusCode === 401) reply.header("www-authenticate", 'Bearer realm="AI Proposal Factory"');
      return reply.status(error.statusCode).send({
        error: error.code, message: error.message, statusCode: error.statusCode
      });
    }
    if (error instanceof DocumentUploadPersistenceError) {
      app.log.error(error);
      return reply.status(500).send({
        error: "UPLOAD_ORPHANED",
        message: error.message,
        storageKey: error.storageKey,
        statusCode: 500
      });
    }
    if ((error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.status(413).send({
        error: "UPLOAD_TOO_LARGE",
        message: `File exceeds the ${uploadMaxBytes}-byte upload limit.`,
        statusCode: 413
      });
    }
    if (error instanceof BlobValidationError) {
      return reply.status(400).send({ error: "INVALID_DOCUMENT", message: error.message, statusCode: 400 });
    }
    if (error instanceof AiError) {
      const statusCode = error.retryable ? 503 : 409;
      return reply.status(statusCode).send({ error: error.code, message: error.message, statusCode });
    }
    if (error instanceof DomainError) {
      const statusCode = error.code === "VALIDATION_ERROR" ? 400 : 409;
      return reply.status(statusCode).send({ error: error.code, message: error.message, statusCode });
    }
    if (error instanceof ConcurrencyConflictError) {
      return reply.status(412).send({
        error: "STALE_REVIEW", message: "The proposal changed during this request. Refresh and review the latest content before retrying.", statusCode: 412
      });
    }
    app.log.error(error);
    return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Unexpected server error.", statusCode: 500 });
  });

  app.get("/health", async () => ({
    status: "ok",
    mode: options.dataProvider === "azure" ? "azure" : "local-demo",
    dataProvider: options.dataProvider ?? "local",
    aiProvider: application.ai.config.provider
  }));
  app.get("/api/session", async (request) => request.authContext!.principal);
  app.get("/api/dashboard", async () => application.dashboard());
  app.get("/api/opportunities", async () => application.listOpportunities());
  app.get<{ Params: { id: string } }>("/api/opportunities/:id", async (request, reply) => {
    const opportunity = await application.getOpportunity(request.params.id);
    return opportunity ?? reply.status(404).send({ error: "NOT_FOUND", message: "Opportunity not found.", statusCode: 404 });
  });
  app.post<{ Body: OpportunityInput }>("/api/opportunities", async (request, reply) => {
    const input = request.body;
    const normalized: OpportunityInput = {
      ...input,
      customerName: requiredString(input.customerName, "Customer name"),
      name: requiredString(input.name, "Opportunity name"),
      businessProblem: requiredString(input.businessProblem, "Business problem"),
      industry: requiredString(input.industry, "Industry"),
      scope: requiredString(input.scope, "Scope"),
      targetTimeline: requiredString(input.targetTimeline, "Target timeline"),
      budgetAssumptions: requiredString(input.budgetAssumptions, "Budget assumptions"),
      additionalNotes: input.additionalNotes ?? "",
      expectedOutcomes: input.expectedOutcomes ?? [],
      stakeholders: input.stakeholders ?? [],
      constraints: input.constraints ?? []
    };
    return reply.status(201).send(await application.createOpportunity(normalized));
  });

  app.get<{ Querystring: { opportunityId?: string } }>("/api/documents", async (request) =>
    application.listDocuments(request.query.opportunityId)
  );
  app.get<{ Params: { opportunityId: string; documentId: string } }>(
    "/api/opportunities/:opportunityId/documents/:documentId",
    async (request, reply) => {
      const document = await application.getDocument(request.params.opportunityId, request.params.documentId);
      return document
        ? reply.send(document)
        : reply.status(404).send({ error: "NOT_FOUND", message: "Document not found.", statusCode: 404 });
    }
  );
  app.post<{ Params: { id: string } }>("/api/opportunities/:id/documents", async (request, reply) => {
    const multipartRequest = request as typeof request & {
      file(): Promise<
        | {
            filename: string;
            mimetype: string;
            toBuffer(): Promise<Buffer>;
            file: { truncated: boolean };
            fields: Record<string, { value?: unknown }>;
          }
        | undefined
      >;
    };
    const part = await multipartRequest.file();
    if (!part) throw new DomainError("A document file is required.", "VALIDATION_ERROR");
    const kindValue = part.fields.kind?.value;
    const kind = typeof kindValue === "string" ? (kindValue as DocumentKind) : undefined;
    const data = await part.toBuffer();
    if (part.file.truncated) {
        throw Object.assign(new Error("Upload exceeded the configured size limit."), {
          code: "FST_REQ_FILE_TOO_LARGE"
        });
    }
    if (!kind || !documentKinds.includes(kind)) throw new DomainError("Invalid document kind.", "VALIDATION_ERROR");
    const document = await application.uploadDocument(request.params.id, {
      name: part.filename,
      contentType: part.mimetype,
      data,
      kind
    });
    return document
      ? reply.status(201).send(document)
      : reply.status(404).send({ error: "NOT_FOUND", message: "Opportunity not found.", statusCode: 404 });
  });
  app.put<{ Params: { id: string }; Body: { documentIds: string[] } }>(
    "/api/opportunities/:id/documents/selection",
    async (request, reply) => {
      const opportunity = await application.selectDocuments(request.params.id, request.body.documentIds ?? []);
      return opportunity
        ? reply.send(opportunity)
        : reply.status(404).send({ error: "NOT_FOUND", message: "Opportunity not found.", statusCode: 404 });
    }
  );

  app.get<{ Querystring: { q?: string; kind?: string; scenario?: string; industry?: string } }>(
    "/api/content",
    async (request) => {
      const results = await application.searchContent(request.query.q ?? "", {
        ...(request.query.kind ? { kind: request.query.kind } : {}),
        ...(request.query.scenario ? { scenario: request.query.scenario } : {}),
        ...(request.query.industry ? { industry: request.query.industry } : {})
      });
      return results.map(indexing);
    }
  );
  const indexing = (content: ReusableContent) => ({
    ...content,
    indexing: options.dataProvider === "azure"
      ? {
          provider: "azure" as const,
          librarySearch: "available" as const,
          retrievalIndex: "pending" as const,
          message: "Available in the library now; Azure AI Search indexing requires the ingestion workflow."
        }
      : {
          provider: "local" as const,
          librarySearch: "available" as const,
          retrievalIndex: "available" as const,
          message: "Available immediately to local keyword search and deterministic retrieval."
        }
  });
  app.get<{ Params: { id: string } }>("/api/content/:id", async (request, reply) => {
    const content = await application.getContent(request.params.id);
    return content
      ? reply.send(indexing(content))
      : reply.status(404).send({ error: "NOT_FOUND", message: "Reusable content not found.", statusCode: 404 });
  });
  app.post<{ Body: ReusableContentInput }>("/api/content", async (request, reply) => {
    const input = request.body;
    if (!contentKinds.includes(input.kind)) throw new DomainError("Invalid content kind.", "VALIDATION_ERROR");
    if (!scenarios.includes(input.scenario)) throw new DomainError("Invalid scenario.", "VALIDATION_ERROR");
    const normalized: ReusableContentInput = {
      title: requiredString(input.title, "Title"),
      kind: input.kind,
      scenario: input.scenario,
      industries: requiredStringArray(input.industries, "Industries"),
      tags: requiredStringArray(input.tags, "Tags"),
      summary: requiredString(input.summary, "Summary"),
      body: requiredString(input.body, "Content body")
    };
    return reply.status(201).send(indexing(await application.createContent(normalized)));
  });
  app.get<{ Params: { id: string } }>("/api/opportunities/:id/retrieval-preview", async (request, reply) => {
    const results = await application.previewRetrieval(request.params.id);
    return results ?? reply.status(404).send({ error: "NOT_FOUND", message: "Opportunity not found.", statusCode: 404 });
  });

  app.post<{ Params: { id: string } }>("/api/opportunities/:id/proposals/generate", async (request, reply) => {
    const run = await application.startGeneration(request.params.id);
    return run
      ? reply.status(202).send(run)
      : reply.status(404).send({ error: "NOT_FOUND", message: "Opportunity not found.", statusCode: 404 });
  });
  app.get<{ Params: { id: string }; Querystring: { advance?: string } }>("/api/generation-runs/:id", async (request, reply) => {
    const run = await application.getGenerationRun(request.params.id, request.query.advance !== "false");
    return run ?? reply.status(404).send({ error: "NOT_FOUND", message: "Generation run not found.", statusCode: 404 });
  });
  app.get<{ Params: { id: string } }>("/api/opportunities/:id/proposal", async (request, reply) => {
    const proposal = await application.getProposalForOpportunity(request.params.id);
    return proposal ?? reply.status(404).send({ error: "NOT_FOUND", message: "Proposal not found.", statusCode: 404 });
  });
  app.get<{ Params: { id: string } }>("/api/proposals/:id", async (request, reply) => {
    const proposal = await application.getProposal(request.params.id);
    return proposal ?? reply.status(404).send({ error: "NOT_FOUND", message: "Proposal not found.", statusCode: 404 });
  });
  app.patch<{ Params: { id: string; key: string }; Body: { content: string } }>(
    "/api/proposals/:id/sections/:key",
    async (request, reply) => {
      const proposal = await application.editSection(
        request.params.id,
        requireSectionKey(request.params.key),
        requiredString(request.body.content, "Section content")
      );
      return proposal ?? reply.status(404).send({ error: "NOT_FOUND", message: "Proposal not found.", statusCode: 404 });
    }
  );
  app.post<{ Params: { id: string; key: string } }>(
    "/api/proposals/:id/sections/:key/regenerate",
    async (request, reply) => {
      const proposal = await application.regenerateSection(request.params.id, requireSectionKey(request.params.key));
      return proposal ?? reply.status(404).send({ error: "NOT_FOUND", message: "Proposal not found.", statusCode: 404 });
    }
  );
  app.post<{ Params: { id: string; key: string }; Body: SectionApprovalRequest }>(
    "/api/proposals/:id/sections/:key/approve",
    async (request, reply) => {
      const proposal = await application.approveSection(request.params.id, requireSectionKey(request.params.key),
        requiredString(request.body?.expectedRevisionId, "Expected section revision ID"));
      return proposal ?? reply.status(404).send({ error: "NOT_FOUND", message: "Proposal not found.", statusCode: 404 });
    }
  );
  app.post<{ Params: { id: string }; Body: ProposalApprovalRequest }>("/api/proposals/:id/approve", async (request, reply) => {
    const proposal = await application.approveProposal(request.params.id,
      requiredString(request.body?.expectedReviewVersion, "Expected proposal review version"));
    return proposal ?? reply.status(404).send({ error: "NOT_FOUND", message: "Proposal not found.", statusCode: 404 });
  });
  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    "/api/proposals/:id/export",
    async (request, reply) => {
      const format = request.query.format === "pdf" ? "pdf" : "markdown";
      const exported = await application.exportProposal(request.params.id, format);
      if (!exported) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Proposal not found.", statusCode: 404 });
      }
      reply.header("content-type", exported.result.contentType);
      reply.header("content-disposition", `attachment; filename="${exported.result.fileName}"`);
      return reply.send(Buffer.from(exported.body));
    }
  );
  app.get<{ Querystring: { opportunityId?: string } }>("/api/audit", async (request) =>
    application.auditHistory(request.query.opportunityId)
  );

  return { app, application, store };
}
