# Azure Data and Runtime Adapters

This package adds Azure-native data adapters without changing the working local slice. Azure mode is explicit: `DATA_PROVIDER=azure` validates every required endpoint and never falls back to local JSON storage.

## Approved baseline

- **Location:** Sweden Central (`swedencentral`)
- **Region code:** `swc`
- **Resource group:** `rg-aipf-dev-swc-001`
- **Runtime:** Azure Container Apps for web/API and worker
- **State:** Cosmos DB for NoSQL serverless
- **Files:** private Azure Blob Storage containers
- **Dispatch:** Azure Storage Queue with a separate poison queue
- **Search:** Azure AI Search Basic, index `proposal-knowledge-v1`
- **Authentication:** Managed Identity through `DefaultAzureCredential`

No account keys, connection strings, SAS URLs, or public containers are used by the adapters.

## Package layout

```text
packages/azure-data/
  src/config.ts     Explicit local/Azure settings validation
  src/clients.ts    Managed Identity SDK client creation
  src/cosmos.ts     Domain repositories and concurrency helpers
  src/blob.ts       Upload, reusable content, and export blob stores
  src/queue.ts      Worker-compatible queue, retry, and poison handling
  src/seed.ts       Idempotent synthetic dataset seeding
apps/api/src/azure-data/
  create-azure-data.ts  API composition helper
  seed-demo.ts          Existing fixture dataset bridge
```

## Configuration

See `.env.example` for the complete safe schema. Azure mode requires:

- `AZURE_COSMOS_ENDPOINT`
- `AZURE_STORAGE_BLOB_ENDPOINT`
- `AZURE_STORAGE_QUEUE_ENDPOINT`
- `AZURE_SEARCH_ENDPOINT`

Resource names have deterministic defaults but remain application settings:

| Resource | Default |
|---|---|
| Cosmos database | `proposal-factory` |
| Opportunity container | `opportunities` |
| Document metadata container | `documents` |
| Reusable content container | `reusable-content` |
| Proposal container | `proposals` |
| Generation run container | `generation-runs` |
| Export metadata container | `exports` |
| Audit container | `audit-events` |
| Uploaded document blob container | `uploaded-documents` |
| Reusable source blob container | `reusable-content` |
| Generated export blob container | `generated-exports` |
| Work queue | `proposal-jobs` |
| Poison queue | `proposal-jobs-poison` |
| Search index | `proposal-knowledge-v1` |

## Cosmos data model

Every stored document includes `entityType`, `partitionKey`, and `schemaVersion`. These storage fields are removed before returning domain entities.

| Entity | Partition key path | Value |
|---|---|---|
| Opportunity | `/partitionKey` | Opportunity ID |
| Document metadata | `/partitionKey` | Opportunity ID or `shared` |
| Reusable content | `/partitionKey` | Scenario category |
| Proposal with revisions/approvals | `/partitionKey` | Opportunity ID |
| Generation run/checkpoints | `/partitionKey` | Opportunity ID |
| Export metadata | `/partitionKey` | Proposal ID |
| Audit event | `/partitionKey` | Opportunity ID |

Audit events expose append only; the adapter uses Cosmos `create` and provides no update/delete method.

### Optimistic concurrency

Cosmos `_etag` values are exposed only through `ConcurrencyAwareRepository<T>`. `saveVersioned` sends an `If-Match` condition and maps HTTP 412 to `ConcurrencyConflictError`.

The current domain repository interfaces return plain entities and `save(): Promise<void>`, so existing application calls cannot carry an ETag. A later composition change should add a provider-independent `Versioned<T>` result or expected-version parameter to mutation commands. Until then, standard `save` uses upsert and concurrency-aware methods are available to new Azure command handlers.

`ProposalRepository.get(id)` and `GenerationRunRepository.get(id)` also omit the opportunity partition key, so those compatibility methods use bounded cross-partition ID queries. Azure command handlers should use `getVersioned(id, opportunityId)` for point reads. A future domain enhancement should accept the stable opportunity partition key explicitly. The domain currently has no export metadata repository interface; `CosmosExportRepository` is therefore an Azure package extension until that port is added.

## Blob behavior

- Containers are created without public access.
- Uploaded document names reject path separators, control characters, unsupported extensions, MIME mismatches, empty data, incorrect sizes, and files over the configured limit.
- The default upload limit is 25 MiB.
- Blob paths use validated entity IDs, not user-provided directory paths.
- Returned metadata includes container name, internal storage key, content type, size, checksum, and optional ETag/version ID.
- Adapters never return account credentials, SAS tokens, or arbitrary public URLs.
- Reusable originals and extracted text use conditional create for idempotent seeding.
- Generated exports are stored under proposal/export IDs and remain private.

The API accepts bounded multipart uploads and stores bytes before metadata. If metadata persistence fails, it deletes the stored object; a cleanup failure returns an explicit orphan key rather than success. TXT/Markdown use strict UTF-8 extraction, DOCX uses a safe document parser, and PDF accepts only files with readable text. Scanned/image-only PDFs fail clearly.

## Queue behavior

`AzureStorageWorkQueue` is structurally compatible with the worker `WorkQueue` seam:

- JSON envelopes are base64 encoded and schema-versioned.
- Messages become invisible while a worker processes them.
- Visibility is renewed automatically until `complete` or `fail`, and the latest pop receipt is used.
- `complete` deletes only after successful handling.
- `fail` updates the message with a bounded error and exponential visibility delay.
- Messages reaching `AZURE_QUEUE_MAX_DEQUEUE_COUNT` are written to the poison queue before the original is deleted.
- Malformed messages are fingerprinted and quarantined without copying raw message content.
- If poison-queue send fails, the original message is not deleted.

Queue durability is complemented by a Cosmos outbox and **one retained worker replica** in Sweden Central. Its autonomous startup/30-second idle scan retries persisted-undispatched jobs even when no queue message exists. A send-before-dispatch-marker failure can produce duplicates; immutable jobs, renewable fenced checkpoints and idempotent completion-last publication absorb them. `reliability.md` documents offline empty-queue/restart evidence and the remaining live-validation gate.

## Idempotent demo seeding

`AzureSeedService` accepts the existing fixture opportunities, documents, and reusable content. The API bridge imports the current fixture generators, preserves stable IDs, derives document ownership from selected document IDs, and uses create-if-absent semantics for Cosmos and Blob data.

The seed report includes search-ready records with stable content IDs and internal extracted-text blob references. Intelligence can pass these records to the `proposal-knowledge-v1` index seeder without coupling this package to the Search SDK.

## Managed Identity RBAC

Assign only to the Container App identities that require each capability:

| Capability | Minimum data-plane role |
|---|---|
| Read/write Cosmos application data | Cosmos DB Built-in Data Contributor |
| Read/write private document/content/export blobs | Storage Blob Data Contributor |
| Send, receive, update, and delete queue messages | Storage Queue Data Contributor |
| Read retrieval documents | Search Index Data Reader |
| Seed/update the Search index | Search Index Data Contributor |

Platform owns role assignments. The application must not receive subscription-level Contributor solely for data access.

## Composition handoff

The API composition root now:

1. Parses `DATA_PROVIDER` before application startup.
2. Preserves `LocalStore` behavior for `DATA_PROVIDER=local`.
3. Creates managed-identity Cosmos, Blob, and Queue clients for Azure mode.
4. Injects ETag-aware Cosmos repositories through provider-independent repository interfaces.
5. Persists immutable `AiJob` snapshots and durable delivery records in Cosmos.
6. Injects the AI package's renewable, ETag-fenced `CosmosCheckpointStore` into `ProposalOrchestrator`.
7. Reports the selected data and AI providers through `/health`.

Azure configuration failures stop startup and cannot select local storage.

The Azure runtime also:

1. Enqueues immutable job IDs through `AzureStorageWorkQueue`.
2. Runs `GenerationWorkHandler` against the durable AI workflow.
3. Renews queue visibility throughout inference and publication.
4. Uses expected opportunity/proposal ETags to reject stale writes.
5. Persists a deterministic publication snapshot before materializing proposal, audit, opportunity, and run projections.
6. Marks a job committed only after all projections succeed, allowing redelivery to converge safely after partial failure.
7. Stores generated export bytes privately and persists export metadata.

Cosmos DB cannot provide a transaction across the separate proposal, audit, opportunity, and generation-run containers. `commitResult` therefore provides logical atomicity through the opportunity lease, deterministic IDs, persisted publication state, ETag fencing, and a completion marker written last. A future single-partition outbox container could strengthen this into one physical Cosmos transaction if required.

The local API retains its existing poll-driven workflow. Azure mode uses durable queue dispatch and the worker. Invoke `seedAzureDemoData` as an explicit deployment/bootstrap step, never during every API startup.

### Runtime packaging

API and worker builds intentionally externalize Azure SDK, OpenAI, Zod, Mammoth, and PDF.js packages rather than bundling their mixed ESM/CommonJS or worker dependency graphs. Production Container App images must run `npm ci` with workspace production dependencies retained; copying only `dist` output is insufficient. Validate the built API and worker entrypoints inside the final container image, not only the TypeScript build.
