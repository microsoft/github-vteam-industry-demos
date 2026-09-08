# AI and RAG implementation

## Scope and deployment baseline

The AI workspace implements managed-identity Azure inference/Search adapters, deterministic fixtures, four-stage orchestration, fenced Cosmos checkpoint leases, source indexing, and offline tests. API/worker composition now consumes Product's Cosmos/Blob/Queue adapters. It does **not** provision resources. No paid model endpoint or live Search service was called during implementation.

Microsoft Foundry Agent Service is intentionally out of scope. The four workflow stages remain application-owned orchestration over Azure OpenAI and Azure AI Search adapters; they are not persisted Foundry agents.

## Truthful workflow API contracts

`OpportunityBrief` is a snapshot of human-entered `OpportunityInput` facts plus selected document metadata. It deliberately excludes document summaries and extracted text, and it is never presented as model output.

`GET /api/opportunities/:id/retrieval-preview` returns a `RetrievalPreview` object:

```json
{
  "citations": [],
  "mode": "fixture | hybrid | keyword",
  "warnings": []
}
```

Consumers must render `mode` and `warnings` beside the citations. Keyword mode can be the configured approach or an explicit embedding fallback; only `providerEvidence.fallbacks` identifies an actual fallback.

Every new `GenerationRun` contains:

- `opportunityBrief`: the immutable intake/document-metadata snapshot used for the run.
- `retrieval`: authoritative mode and warnings, initially `pending`.
- `stages[].execution`: `not-executed`, `deterministic`, `model-backed`, or `service-backed`.
- `stages[].completedOperations`: successful operations recorded for that completed stage.
- `providerEvidence`: provider selection, successful model/Search/embedding counts, deterministic operation count, actual fallbacks, and safe deployment/index identifiers only after successful corresponding activity.

Fixture runs report four deterministic stages, one deterministic retrieval operation, and **zero** Azure model and embedding operations. Azure configuration alone leaves all successful-operation counts at zero. A generation deployment is exposed only after a chat stage succeeds; an embedding deployment only after a hybrid embedding succeeds; a Search index only after Search retrieval succeeds. Endpoints, credentials, tenant IDs, and managed-identity IDs are never included.

Legacy stored runs are normalized on local-file and Cosmos reads. Missing evidence becomes `provider: "unknown"`, `retrieval.mode: "unknown"`, zero operation counts, and `legacyEvidenceUnavailable: true`; the application does not infer Azure use from old configuration or completed UI labels.

Product integration should use `retrievalPreviewEvidence()` for the complete preview contract. The existing `retrievalPreview()` web client helper temporarily unwraps `citations` so the current intake screen remains compatible until Product renders mode/warnings. Generation explanations should be derived from `providerEvidence` and completed stage execution fields, never from `/health`, environment configuration, or stage labels.

The authoritative deployment remains **Sweden Central only**, Search **Basic**, index `proposal-knowledge-v1`, generation deployment `proposal-chat` (`gpt-5.1`, version `2025-11-13`, regional **Standard**, capacity **50**) and embedding deployment `proposal-embeddings` (`text-embedding-3-large`, version `1`, **Standard**, capacity **30**). There is no automatic secondary-region fallback. Endpoint hostnames cannot establish resource location; Platform must validate location, model deployment versions, and available capacity against the deployed resource.

## Provider configuration

`AI_PROVIDER=fixture` is the default and appears in `/health` as `aiProvider`. Fixture output is explicitly marked and deterministic. `AI_PROVIDER=azure` selects Azure adapters. Missing/invalid configuration, permission failures, model refusals, invalid structured output, and Search failures **never** select fixtures.

The AI settings consumed by the runtime are:

| App setting | Default / requirement |
|---|---|
| `AI_PROVIDER` | `fixture` or `azure`, explicitly set to `azure` for cloud inference |
| `AZURE_LOCATION` | `swedencentral`; any other value rejected |
| `AZURE_OPENAI_ENDPOINT` | Required in Azure mode; HTTPS resource **root**, e.g. `https://<resource>.openai.azure.com` |
| `AZURE_SEARCH_ENDPOINT` | Required in Azure mode; `https://<service>.search.windows.net` |
| `AZURE_CLIENT_ID` | Optional user-assigned managed identity client UUID; omit for system-assigned identity/local developer credential chain |
| `AZURE_OPENAI_GENERATION_DEPLOYMENT` | `proposal-chat` |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | `proposal-embeddings` |
| `AZURE_OPENAI_API_VERSION` | Exactly `v1` |
| `AZURE_SEARCH_API_VERSION` | Exactly `2025-09-01` |
| `AZURE_SEARCH_INDEX` | `proposal-knowledge-v1` |
| `AI_EMBEDDINGS_ENABLED` | `true`; explicitly set `false` for keyword-only retrieval/indexing |
| `AI_EMBEDDING_DIMENSIONS` | `3072`; must match index and both query/ingestion embedding calls |
| `AI_RETRIEVAL_TOP_K` | `8`, range 1–20 |
| `AI_VECTOR_K` | `30`, range 1–50 and at least top K |
| `AI_CONTEXT_TOKENS` | `64000`, maximum 128000 application budget |
| `AI_MAX_INPUT_TOKENS` | `40000` |
| `AI_MAX_OUTPUT_TOKENS` | `16000`, range 4096–32000 |
| `AI_REQUEST_TIMEOUT_MS` | `120000`, per attempt |
| `AI_MAX_RETRIES` | `3`, maximum 5 retries after the initial attempt |
| `AI_RETRY_BASE_MS` | `500` |
| `AI_RETRY_MAX_MS` | `30000` |

Input + output + 2048 safety tokens must fit the configured context. Input accounting deliberately uses UTF-8 byte length, including schema and prompts, as a conservative text-token upper bound rather than silently truncating customer data. Oversized input fails before inference. Embedding requests have an 8000-byte bound. Configuration rejects non-HTTPS endpoints, non-Azure hosts, paths, credentials, query strings, ports, unknown modes, malformed names, and invalid bounds. OpenAI resource roots on `cognitiveservices.azure.com` and `services.ai.azure.com` are also supported; project-scoped Foundry agent endpoints are not accepted.

`DATA_PROVIDER` remains independent of `AI_PROVIDER`. Set `DATA_PROVIDER=azure` to select the integrated Cosmos/Blob/Queue runtime and start the Azure worker consumer. Selecting only an Azure AI provider does not make the local application store durable. `DATA_PROVIDER=azure` with `AI_PROVIDER=fixture` is supported for deterministic data-integration testing.

## SDK and API choice

The workspace pins `openai@7.8.0`, `@azure/identity@4.13.2`, `@azure/search-documents@13.0.0`, and `zod@4.5.4`. The repository requires Node 24/npm 11. Use the lockfile; do not independently upgrade production SDKs without rerunning boundary tests.

API/worker bundles keep Azure/OpenAI/Zod SDK packages external and bundle only application workspaces. Deployment images must install their production dependencies. Bundling Azure Identity's CommonJS transitive dependencies into ESM can pass compilation but fail at startup with `Dynamic require of "buffer" is not supported`; the built-runtime smoke caught this and the explicit external boundary fixes it.

Generation uses the standard `OpenAI` client with resource-root + `/openai/v1/`, an async bearer-token provider, and scope `https://ai.azure.com/.default`. No API key is read. Strict Chat Completions `response_format: json_schema` is generated with `zodResponseFormat`; runtime validation independently checks parsed JSON, all twelve keys, nonempty/bounded text, selected document IDs, and citation allowlists. GPT-5.1 uses `max_completion_tokens` and `reasoning_effort: "none"`. No tools, autonomous browsing, or parallel tool calls are enabled; `store: false` is sent. Refusal, filtering, non-`stop` completion and malformed JSON fail closed rather than attempting JSON repair.

Search 13.0.0 defaults to a newer API, but this adapter explicitly sets the supported stable `serviceVersion: "2025-09-01"` to avoid implicit version migration. The JS shape is `vectorSearchOptions: { filterMode: "preFilter", queries: [{ kind: "vector", vector, fields: ["embedding"], kNearestNeighborsCount }] }`. There is no paid semantic-ranker or agentic-retrieval dependency.

Primary documentation verified September 7, 2026:

- Azure structured outputs and the v1 JavaScript bearer-token pattern: `https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs`
- GPT-5.1 parameter support: `https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning`
- Search JS vector options: `https://learn.microsoft.com/en-us/javascript/api/@azure/search-documents/vectorsearchoptions`
- Stable Search versions: `https://learn.microsoft.com/en-us/rest/api/searchservice/search-service-api-versions`
- Search RBAC: `https://learn.microsoft.com/en-us/azure/search/search-security-rbac`

## Retrieval and citations

The application controls query construction and source filters. The model cannot select the index, change filters or inject OData. Keywords are normalized into at most 50 alphanumeric terms/1000 characters. Mandatory server-side filters select the `synthetic-v1` corpus, published synthetic sources, and the opportunity's exact scenario. Within those restrictions, industry applicability is either:

- An exact match to the opportunity's industry (other than the reserved `Cross-industry` sharing marker); or
- An explicit `Cross-industry` source with a `serviceTags` entry equal to the opportunity scenario lowercased, such as `cloud modernization`.

The shared branch is parenthesized beneath all mandatory restrictions and is used unchanged for hybrid vector prefiltering. This admits applicable delivery methodologies, pricing assumptions, snippets, and service descriptions for both seeded and new industries without admitting another scenario, private source, unpublished source, or another corpus. An opportunity whose industry is itself `Cross-industry` still requires the shared service tag. Values are OData-escaped; tags are exact, case-sensitive applicability metadata, not model-inferred permissions. Eligibility does not guarantee every source is returned: relevance ranking and the configured top-K bound still apply.

When embeddings are enabled and available, one bounded keyword/vector hybrid request is issued. When disabled, omitted, or temporarily unavailable after the embedding adapter's bounded retries, retrieval explicitly returns `mode: "keyword"` plus a warning. Bad vectors, unauthorized embedding calls, invalid sources and Search errors do **not** trigger degradation. Search vector incompatibilities require operator intervention/reindexing, not an invisible keyword retry.

Returned chunks are schema-validated, checked against stable IDs and content hashes, and checked again against the same scenario/industry/shared-service applicability rule. Mismatched metadata fails closed rather than being silently dropped or replaced with fixture evidence. Duplicate chunks are removed and results are capped. Citation IDs combine stable chunk identity and a content-version hash; `contentId` remains the reusable library source ID. Citation excerpts contain the exact retrieved chunk, not model-written evidence. Relevance is the bounded raw Search score, **not** a confidence percentage or an evidence-quality assessment.

Each generated section carries its own validated `citationIds`. Optional inline markers must use `[source:<citation-id>]` and match that section's allowlist. Sections with no evidence use an empty list. `applyCitationMapping` replaces the domain factory's generic citation defaults with actual model-selected evidence. During regeneration it changes only the new revision's citation mapping and retains historical sources for unchanged/manual revisions. Structural validation establishes source provenance, not semantic entailment; human review is still mandatory.

Zero results are valid and visible: the draft must disclose missing organizational grounding, and orchestration independently adds a **High / Missing Information** finding even if the reviewer omits one. Retrieved/uploaded text is always untrusted JSON data, isolated from versioned system prompts. Prompt-injection tests validate that boundary and rejection of fabricated evidence; they are not a claim that prompt-only defenses eliminate every model attack.

This corpus is a single-demo knowledge library, **not a multi-tenant authorization model**. Product must add authenticated access constraints before indexing real/private multi-tenant documents. The current `DocumentMetadata` contract supplies selected summaries, not raw Blob/PDF bytes; document extraction is a separate Product responsibility.

## Workflow and persistence handoff

`ProposalOrchestrator` executes:

1. Structured requirements analysis.
2. Application-controlled retrieval.
3. Validated complete drafting, or one-section regeneration.
4. Separate visible risk review of the full resulting proposal.

`advance(job)` performs one real stage; `run(job)` completes/resumes the remaining stages. Checkpoints include schema version, immutable input hash, provider mode, prompt version, completed stage prefix, requirements, evidence, structured draft, risk review, final result and sanitized failure classification. Completed stages are not replayed on retry. Reusing a job ID with changed input/provider/prompt fails; create a new ID instead.

The integration now implements the following contracts; retain these requirements when extending it:

- Persist an immutable `AiJob` snapshot before enqueueing. Queue payload is `{ jobId: "<persisted-job-id>" }`, with type `GenerateProposal` or `RegenerateSection`. Do not regenerate snapshots from mutable opportunity/proposal records on redelivery.
- `CosmosCheckpointStore` implements `load/save/exclusive`: lease ownership, expiry, fencing generation and checkpoint/value live in one Cosmos document, with conditional ETag writes. It renews every 20 seconds by default, uses a 60-second lease, a 20-second acquisition budget and a 5-second clock-skew allowance. It rejects expired/lost-owner writes and retains checkpoint state when releasing ownership. Memory/file implementations remain single-process only.
- `AzureProposalWorkflow` implements worker `loadJob/isCommitted/commitResult/markFailed`. Publication is an **idempotent, recoverable multi-step commit**, not a cross-container transaction: persist a publication intent, conditionally publish the expected proposal revision, append a deterministic audit event, update opportunity state, then mark the run and dispatch record complete. Retries use the saved proposal/revision IDs and do not repeat completed inference. Separate Cosmos containers cannot share a transactional batch.
- Use `WorkflowResult.sectionCitationIds` and `applyCitationMapping`; the legacy domain `ProposalDraft` cannot express per-section grounding. The domain interface itself is unchanged.
- `apps/worker/src/index.ts` starts the durable queue consumer in Azure data mode, renews visibility through the queue adapter and reconciles pending dispatch records on startup and every 30 seconds while idle. Bicep deliberately retains **one worker replica** so this loop runs even with zero queue messages; queue scale-out remains capped at three. Scan/transport failures are logged by sanitized code and retried without terminating the loop. Durable input/dispatch records are saved before enqueue; interrupted submission and enqueue recover without regenerating snapshots. Exhausted retry counts mark the job terminal before native poison handling. See `reliability.md` for the cost tradeoff and process-restart evidence.
- Route permanent errors to poison/dead-letter handling and transient errors to bounded queue retry. Long `Retry-After` cooldowns exceeding the in-request budget are surfaced as retryable, not retried early.
- Route `ExportProposal` to a separate handler. AI generation never exports or approves a proposal.
- Start a new job for intentional reruns. If a process fails between inference and checkpoint persistence, that stage can repeat; exactly-once external inference is not promised.

The local API uses atomic per-job files under `<LOCAL_DATA_FILE>.ai` when a local data file is configured, otherwise memory, and retains its four-poll workflow. In **Azure data mode**, generation is queued and progress GETs are read-only; the worker performs actual stages and persists progress. The synchronous section-regeneration API is preserved using the same durable job/checkpoints/publication path; the queued worker can concurrently resume it without replaying completed stages. The API and worker therefore both need inference RBAC when Azure AI is selected.

Opportunity-scoped Cosmos leases serialize submission/publication and human mutations. Scoped ETags protect manual edits and approvals; pending or failed jobs block human mutation until completion or a new generation run. Private export bytes and metadata are persisted using Product's Blob/Cosmos export adapters. Browser uploads now persist actual bytes and validated bounded extracted text; generation snapshots replace the short display summary with that extracted text before requirements analysis.

Serialization alone is not review evidence: section approvals additionally compare the reviewer's displayed revision ID, and complete approval compares the displayed proposal `reviewVersion` after acquiring the mutation boundary. Generation, edits, regeneration and section approval changes invalidate that version. Stale responses require explicit refresh/review; audits retain exact revision IDs, numeric revisions and the authenticated approving actor.

The shared composition export is `@proposal-factory/api/runtime` (`apps/api/src/ai-azure-runtime.ts`), used by both entrypoints. No Blob lease container is required: checkpoint locks use the existing Cosmos `generation-runs` container with hashed job/key partition IDs, isolated by `entityType: ai-workflow-state`.

## Indexing and Platform handoff

`knowledgeIndexSchema(config)` supplies a Basic-compatible index schema with HNSW/cosine vectors, source/chunk IDs, ordinal, corpus, source version, source type, publication status, content hash, scenario, industries, service tags, and embedding model-version/dimensions. `createKnowledgeIndex(config)` is an **explicit idempotent seed/bootstrap operation**, not request/runtime startup:

1. Read the configured index definition using the seed identity.
2. Only a 404 permits creation. Authentication, authorization, and other provider errors are not treated as a missing index.
3. Read the persisted definition after creation. A concurrent-create 409/412 also requires readback and verification; an incompatible winner is not accepted.
4. Verify required field names/types, the unique stable `id` key, required filtering/search capabilities, retrievable provenance, and the configured vector dimensions/profile with uncompressed HNSW/cosine. Reordered fields, materialized service defaults, and additional nonkey fields are compatible. Filter normalizers that change exact-match semantics are rejected.
5. Only then construct the seed document/embedding clients and query/index documents.

The default index remains `proposal-knowledge-v1` with 3072-dimensional `text-embedding-3-large:1` vectors. The bootstrap uses the existing bounded retries and managed-identity credential path. It never updates or deletes an existing index. A mismatch throws `INDEX_SCHEMA_INCOMPATIBLE` with field/configuration details before document queries, embeddings, uploads, or deletes. Explicitly migrate incompatible schemas; do not clear the index to make a seed run succeed.

`SeedIndexingService`:

- Accepts the reusable **synthetic** content corpus; uploaded/private documents are not automatically indexed.
- Uses stable source ID + chunk ordinal IDs, 1800-character windows with 200-character overlap, canonical tags and versioned content hashes.
- Skips unchanged chunks with matching embedding metadata, avoiding repeat embedding calls.
- Replaces changed chunks in batches of at most 50; checks per-document action results, not just HTTP status.
- Deletes stale trailing chunks only for sources explicitly included in that seed invocation, after successful uploads.
- Supports explicit keyword-only indexing with empty vectors. Re-enabling embeddings backfills the same stable IDs.
- Rejects duplicate source IDs and propagates failed embedding/index actions. Rerunning converges after partial failure; immediate Search read consistency and cross-source transactions are not assumed.

The actual production path is `containers\seed-entrypoint.ts` → `seedAzureDemoData(runtime.data)` → `seedAzureKnowledge(runtime.store, runtime.ai.config)` → `createKnowledgeIndex(config)` → `SeedIndexingService.seed(...)`. `seedAzureKnowledge` now awaits schema verification itself; no undocumented manual index-creation step is required. Cosmos/Blob demo-data initialization precedes the Search phase, but no Search document operation or embedding starts before schema verification. Requests and local/fixture startup do not bootstrap Search. The production seed entrypoint requires both providers explicitly set to `azure`.

`--help` and `--dry-run` do not contact Azure; dry-run validates settings only and cannot prove schema compatibility, RBAC, or model availability. After an authorized deployment and successful seed, separately verify scenario-specific retrieval previews. No live bootstrap, indexing, inference, or embedding validation was performed for this revision.

Required Azure RBAC at the respective resource (or supported narrower data scope):

| Identity | Search role | OpenAI role |
|---|---|---|
| API/worker runtime performing AI requests | **Search Index Data Reader** | **Cognitive Services OpenAI User** |
| Synthetic-content seed/bootstrap job | **Search Service Contributor** plus **Search Index Data Contributor** | **Cognitive Services OpenAI User** when embedding |

Do not grant runtime schema/write roles just to simplify startup. Enable Entra/RBAC on Search and OpenAI; grant the runtime identity network access to the configured endpoints. Managed identity avoids storing keys in application settings. In Azure, attach the intended user-assigned identity and set its **client ID**, not principal/object ID, in `AZURE_CLIENT_ID`.

The existing `infra\modules\search.bicep` already assigns both required Search roles to the seeder and read-only Search data roles to API/worker identities; this revision does not change infrastructure or identity configuration.

### Independent Search blocker revision validation — September 7, 2026

Targeted validation passes **70 tests** across the following files using the existing Vitest runner:

```powershell
npm exec -- vitest run --config apps\api\vitest.config.ts packages\ai\test\index-bootstrap.test.ts packages\ai\test\retrieval-ingestion.test.ts packages\ai\test\sdk-shapes.test.ts apps\api\test\ai-search-retrieval.test.ts apps\api\test\ai-seed-entrypoint.test.ts
```

The production-entrypoint tests execute the real container seed source, application composition, data seed service, Search bootstrap, and embedding/document adapters. Only external SDK/data boundaries are replaced with in-memory responses; credential acquisition and network fetches are forbidden. A fresh service creates and reads back one index, seeds 45 stable chunks, and a second entrypoint invocation skips all 45 without another embedding or upload. Compatible/incompatible existing indexes, concurrent create races, malformed schemas, explicit keyword-to-vector backfill, provider rejection, and help/dry-run have offline coverage.

Retrieval tests use all five real seeded scenarios in their original industry and in a new Aerospace industry, verify the complete emitted filter and SDK vector prefilter shape, and admit methodology/pricing citations through post-search validation. Negative cases cover other industries/scenarios/corpora, unpublished/private/uploaded sources, absent/wrong service applicability, the reserved sharing marker, provenance tampering, and incompatible vector metadata. These synthetic-corpus checks do **not** establish multi-tenant authorization for real/private documents.

The full `npm run check` invocation passed ESLint, every workspace typecheck, and **214 tests** (API 76, web 5, worker 6, AI 107, Azure-data 18, domain 2). The build phase stopped in the worker bundle because the current Playwright dependency could not resolve `chromium-bidi/lib/cjs/bidiMapper/BidiMapper` and `chromium-bidi/lib/cjs/cdp/CdpConnection`; the existing seed bundle configuration reproduced the same failure. These excluded worker/container/rendering artifacts were not revised by Search. Built-image validation and live Azure validation remain pending; passing source-level entrypoint tests is not a claim that those bundles or images were validated.

The existing TS runtime also ran `containers\seed-entrypoint.ts --help` successfully. The separate `--dry-run` process then encountered missing workspace package links; its no-network behavior had already passed the production-entrypoint tests above. Subsequent offline dependency restoration attempts (without saving manifests) did not complete: lockfile restoration reported `ENOTEMPTY` under `node_modules\openai`, and an in-place retry reported `TAR_ENTRY_ERROR`/missing package paths and exited unsuccessfully. Restore the shared local dependency tree before rerunning validation. Do not treat these later tool/dependency failures as an additional successful build or live-service result.

Integrated data mode additionally requires **Cosmos DB Built-in Data Contributor** for API/worker. Queue-scoped grants can remain narrow: API needs **Storage Queue Data Message Sender** on the work queue; worker needs **Storage Queue Data Contributor** on the work queue (including enqueue for outbox reconciliation and update for visibility/retries) and **Storage Queue Data Message Sender** on the poison queue. A custom equivalent is acceptable, but a processor-only work-queue grant is insufficient for those worker operations. API exports require **Storage Blob Data Contributor** on the export container; separately authorized upload/seed operations need their corresponding Blob permissions. Supply `AZURE_COSMOS_ENDPOINT`, `AZURE_STORAGE_BLOB_ENDPOINT`, `AZURE_STORAGE_QUEUE_ENDPOINT`, and the existing data-name settings from `.env.example`. Resource/container/queue initialization remains an explicit deployment/bootstrap responsibility, not request-time provisioning.

## Original implementation validation and changed-file map

Offline tests cover malformed/incomplete output, refusal/truncation, invalid citations, empty retrieval, source validation, filter escaping, bounded hybrid requests, keyword fallback, retries/cooldowns/timeouts, injection fixtures, idempotent indexing, resumable/concurrent orchestration, worker acknowledgement ordering, local checkpoint restart, and explicit provider selection. Azure SDK clients are either constructed without calls or stubbed at their network boundary.

Validation on September 7, 2026: **119 tests validated** across the complete `npm run check` and final targeted regression rerun (82 AI, 14 API, 6 worker, 14 Azure-data, 1 web, 2 domain). Repository lint, all workspace typechecks and production builds passed. The rebuilt Node API passed a loopback-only smoke covering explicit local/fixture providers, four genuine generation stages, all twelve sections, regeneration, approvals, and Markdown/PDF exports. The built worker starts in local mode without cloud requests, and its Azure composition bundle imports successfully offline. Azure-mock integration tests cover queued dispatch/read-only polling, ETag conflicts, private export persistence, partial publication recovery, outbox recovery, monotonic progress, and stale terminal-pointer recovery. Test processes and generated local state were removed afterward.

Use the repository's existing tooling:

```powershell
npm install --ignore-scripts --no-audit --no-fund
npm run typecheck -w @proposal-factory/ai -w @proposal-factory/api -w @proposal-factory/worker
npm run test -w @proposal-factory/ai -w @proposal-factory/api -w @proposal-factory/worker
npm run build -w @proposal-factory/ai -w @proposal-factory/api -w @proposal-factory/worker
npx eslint packages\ai apps\worker apps\api\src\ai-runtime.ts apps\api\src\ai-seed.ts apps\api\src\application.ts apps\api\src\app.ts apps\api\test\ai-composition.test.ts apps\api\tsup.config.ts apps\api\vitest.config.ts
```

AI implementation: `packages/ai/src/{config,errors,schemas,prompts,providers,azure-model,knowledge,retrieval,ingestion,orchestration,cosmos-checkpoints,fixture,domain-adapter,index}.ts`; AI tests: `packages/ai/test/*`.

Integration: `apps/api/src/ai-runtime.ts`, `ai-seed.ts`, `ai-azure-runtime.ts`, `ai-azure-state.ts`, `ai-azure-workflow.ts`, scoped `application.ts`/`app.ts`/`server.ts` changes, API composition tests/config; `apps/worker/src/index.ts`, worker tests/config. Azure-data's numeric Cosmos error normalization and queue delivery-attempt accessor have focused test coverage. Dependency/build composition changes are in root/AI/API/worker manifests, tsup configs, and `package-lock.json`. Settings are in `.env.example`; decisions are recorded in the Intelligence inbox.

Cloud integration/RBAC/capacity and model output quality still require separately authorized deployed validation. Passing offline tests is not a cloud deployment claim.
