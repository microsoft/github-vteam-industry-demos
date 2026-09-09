import type { Container } from "@azure/cosmos";
import type { AuditEvent, Opportunity, Proposal } from "@proposal-factory/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  ConcurrencyConflictError,
  CosmosAuditRepository,
  CosmosGenerationRunRepository,
  CosmosOpportunityRepository,
  CosmosProposalRepository,
  azureStatusCode
} from "../src/index.js";

function opportunity(): Opportunity {
  return {
    id: "opp-01",
    customerName: "Northstar Foods",
    name: "Cloud modernization",
    industry: "Retail",
    estimatedValue: 500000,
    expectedDurationWeeks: 20,
    businessProblem: "Legacy platforms constrain delivery.",
    expectedOutcomes: ["Faster releases"],
    scope: "Modernize priority workloads.",
    stakeholders: ["CTO"],
    constraints: ["Peak season"],
    targetTimeline: "Q1 2027",
    budgetAssumptions: "Blended team",
    additionalNotes: "",
    scenario: "Cloud modernization",
    status: "Proposal",
    proposalStatus: "Draft",
    proposalProgress: 0,
    selectedDocumentIds: [],
    createdAt: "2026-09-07T09:00:00.000Z",
    updatedAt: "2026-09-07T09:00:00.000Z"
  };
}

function proposal(): Proposal {
  return {
    reviewVersion: "review-test",
    id: "proposal-01",
    opportunityId: "opp-01",
    title: "Northstar proposal",
    status: "Generated",
    sections: [],
    risks: [],
    citations: [],
    createdAt: "2026-09-07T09:00:00.000Z",
    updatedAt: "2026-09-07T09:00:00.000Z"
  };
}

describe("Cosmos repository mapping", () => {
  it("recognizes numeric Cosmos error codes alongside HTTP statusCode", () => {
    expect(azureStatusCode({ code: 404 })).toBe(404);
    expect(azureStatusCode({ code: 412 })).toBe(412);
    expect(azureStatusCode({ status: 503 })).toBe(503);
    expect(azureStatusCode({ code: "ENOTFOUND" })).toBeUndefined();
  });
  it("uses the opportunity id as a stable point-read partition and strips storage fields", async () => {
    const upsert = vi.fn(async () => ({ resource: undefined }));
    const read = vi.fn(async () => ({
      resource: {
        ...opportunity(),
        entityType: "opportunity",
        partitionKey: "opp-01",
        schemaVersion: 1,
        _etag: "etag-1"
      }
    }));
    const item = vi.fn(() => ({ read, replace: vi.fn() }));
    const container = { items: { upsert }, item } as unknown as Container;
    const repository = new CosmosOpportunityRepository(container);

    await repository.save(opportunity());
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ partitionKey: "opp-01", entityType: "opportunity" }));
    const loaded = await repository.get("opp-01");
    expect(item).toHaveBeenCalledWith("opp-01", "opp-01");
    expect(loaded).toEqual(opportunity());
  });

  it("maps Cosmos precondition failures to an explicit concurrency conflict", async () => {
    const replace = vi.fn(async () => {
      throw { statusCode: 412 };
    });
    const container = {
      items: { query: vi.fn(), upsert: vi.fn() },
      item: vi.fn(() => ({ read: vi.fn(), replace }))
    } as unknown as Container;
    const repository = new CosmosProposalRepository(container);

    await expect(repository.saveVersioned(proposal(), "stale-etag")).rejects.toBeInstanceOf(ConcurrencyConflictError);
    expect(container.item).toHaveBeenCalledWith("proposal-01", "opp-01");
    expect(replace).toHaveBeenCalledWith(
      expect.objectContaining({ partitionKey: "opp-01" }),
      { accessCondition: { type: "IfMatch", condition: "stale-etag" } }
    );
  });

  it("keeps audit writes append-only by using create rather than upsert", async () => {
    const create = vi.fn(async () => ({ resource: undefined }));
    const container = { items: { create } } as unknown as Container;
    const repository = new CosmosAuditRepository(container);
    const event: AuditEvent = {
      id: "audit-01",
      opportunityId: "opp-01",
      type: "Opportunity Created",
      actor: "Demo User",
      description: "Created opportunity.",
      metadata: {},
      occurredAt: "2026-09-07T09:00:00.000Z"
    };
    await repository.append(event);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ id: "audit-01", partitionKey: "opp-01" }));
  });

  it("normalizes legacy generation runs without inventing provider activity", async () => {
    const query = vi.fn(() => ({ fetchAll: vi.fn(async () => ({ resources: [{
      id: "legacy-run",
      opportunityId: "opp-01",
      proposalId: "proposal-01",
      status: "Complete",
      progress: 100,
      stages: [{ key: "requirements", label: "Requirements", detail: "Legacy", status: "Complete" }],
      retrievedContentIds: [],
      startedAt: "2026-09-07T09:00:00.000Z",
      entityType: "generation-run",
      partitionKey: "opp-01",
      schemaVersion: 1
    }] })) }));
    const repository = new CosmosGenerationRunRepository({
      items: { query, upsert: vi.fn() }
    } as unknown as Container);
    expect(await repository.get("legacy-run")).toMatchObject({
      retrieval: { mode: "unknown" },
      providerEvidence: {
        provider: "unknown",
        successfulModelOperations: 0,
        legacyEvidenceUnavailable: true
      },
      stages: [{ execution: "not-executed", completedOperations: 0 }]
    });
  });
});
