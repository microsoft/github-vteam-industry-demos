# Architecture

## Runtime

One FastAPI process serves both `/api/*` and the compiled React assets. This preserves
the Azure Container Apps single-URL deployment and avoids CORS or separate frontend
hosting.

```text
Browser
  └─ FastAPI
      ├─ /api/health
      ├─ /api/cases
      ├─ CaseService
      ├─ InvestigationService
      │   ├─ DocumentExtractionProvider
      │   └─ InvestigationReasoningProvider
      ├─ MemoryDemoState or AzureStorageState
      └─ React static assets
```

## State and decisions

`MemoryDemoState` is the default customer-demo implementation. It loads the
deterministic 25-case seed, 40 local synthetic screening records, and packaged document
content, then retains case changes and investigation checkpoints for the lifetime of
the single running Container App replica. This is deliberately session-oriented and is
not durable across process or revision replacement.

`AzureStorageState` remains an optional adapter selected with
`STORAGE_PROVIDER=azure`. It can idempotently seed Azure Tables, upload primary-case
documents to a private Blob container, and persist investigation jobs/checkpoints when
the data plane is reachable.

Only `CaseService.decide`, exposed by `POST /api/cases/{id}/decision`, changes case
status. Investigation output is advisory and never performs an analyst decision.

## Investigation providers

`app\backend\providers\base.py` defines two Azure integration contracts:

- `DocumentExtractionProvider.extract(documents)` — implemented by Azure AI Document
  Intelligence with source provenance.
- `InvestigationReasoningProvider` — implemented by the four Foundry agent stages for
  extraction interpretation, completeness, risk, and summary.

`app\backend\providers\factory.py::build_providers()` selects live adapters through
environment configuration while retaining deterministic providers for tests and local
demos. Live adapters set `mode` and returned `provider_mode` to `live-azure`.

The Azure document provider is `AzureDocumentIntelligenceProvider`. It renders the
seeded synthetic preview into an in-memory DOCX, submits it to the Sweden Central
Document Intelligence resource using `prebuilt-layout`, and maps labelled content into
`ExtractedFact` values with source-document evidence. Authentication uses the Container
App user-assigned managed identity and the `Cognitive Services User` role; local keys
are disabled. The isolated endpoint
`POST /api/cases/{case_id}/documents/{document_id}/extract` verifies document processing
without invoking the later Foundry reasoning phase. Retryable failures return HTTP 503
without mutating case state.

The baseline risk provider uses the local 40-record synthetic dataset because Azure AI
Search capacity is currently unavailable in Sweden Central.

## Managed Foundry reasoning

`AzureFoundryReasoningProvider` uses the current managed prompt-agent pattern from
`azure-ai-projects`: named, persistent `PromptAgentDefinition` versions stored in the
Foundry project, invoked through the project Responses API with an `agent_reference`.
The four assets are `agt-kyc-extract`, `agt-kyc-complete`, `agt-kyc-risk`, and
`agt-kyc-summary`, all using the single `gpt-5-1-kyc` deployment.

Each request includes a closed JSON schema. Returned JSON is validated with Pydantic;
markdown fences are tolerated but any invalid shape raises a stage-specific retryable
error. Diagnostic endpoints execute one agent at a time and do not persist case
changes. The normal investigation service is wired for the four stages, but was not
executed during the isolated-agent validation phase.

Because Azure AI Search is unavailable, the risk provider compares case subjects
against all 40 local synthetic screening records using normalized name similarity,
then gives the managed agent only the five strongest candidates plus the full dataset
count. This keeps the model request within the regional deployment rate limit while
retaining deterministic local screening coverage.

The Container App user-assigned identity has project-scoped `Foundry User` and
resource-scoped `Cognitive Services User` roles. Entra ID is the only runtime
authentication path; no API keys or connection strings are stored.

## Connected investigation workflow

The asynchronous workflow loads the case and private document, runs Document
Intelligence, invokes the four Foundry stages in order, persists each completed
checkpoint, and returns progress through polling endpoints. A stage-specific failure
marks the job retryable while retaining all completed evidence. The summary
recommendation is persisted without changing case status.

The Container App identity also has `Storage Blob Data Contributor` and `Storage Table
Data Contributor`. Four Table resources and the private Blob container remain declared
in Bicep, but the portable baseline does not select this adapter. This keeps enterprise
Storage network policies from blocking the critical demo. Private networking is
intentionally excluded. No cross-region, credential, or insecure public-access fallback
is used.

The Container App is fixed at one minimum and one maximum replica while using memory
state. This prevents scale-to-zero or multi-replica routing from interrupting a live
demo session, but it does not turn in-process state into durable persistence.

## Portable provisioning

The subscription-scope Bicep entry point derives the resource group and global resource
suffix from `AZURE_ENV_NAME`, `AZURE_LOCATION`, and the target subscription ID. No
resource name or endpoint from another deployment is required. `AZURE_LOCATION` is
restricted to `swedencentral`.

The Foundry project, model deployment, Document Intelligence resource, managed identity,
RBAC, Container Apps resources, ACR, and Storage Account are provisioned by Bicep.
An `azd` post-provision Python hook then creates or reuses the four Foundry agents from
the source-controlled prompts. Matching definition hashes are reused; prompt or model
changes create a new version. Agent IDs and versions are written to the ignored current
`azd` environment, while runtime configuration uses the provisioned project endpoint
and logical agent names.

## Frontend

The React application calls same-origin REST APIs. It provides filtered case discovery,
seven case-workspace tabs, backend-mediated synthetic document previews, real polling
for staged investigation feedback, advisory findings, explicit human decisions, and
an audit timeline.
