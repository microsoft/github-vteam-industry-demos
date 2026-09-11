# KYC Case Investigation Cockpit

A single-URL React + FastAPI customer-demo application for investigating fictional
business onboarding cases. All people, companies, documents, and screening records
are synthetic. The application is not a production compliance platform and its
advisory output must not be used for KYC, AML, sanctions, or compliance decisions.

## Demo flow

1. Open the dashboard and select **KYC-DEMO-001 — Northstar Components AB**.
2. Review the company, synthetic documents, ownership structure, and source evidence.
3. Select **Run AI Investigation**.
4. Review completeness checks, local synthetic screening signals, and the advisory summary.
5. Select **Request More Information**, enter an analyst reason, and confirm.
6. Verify the status and human decision in **Audit History**.

Document extraction uses Azure AI Document Intelligence `prebuilt-layout` in the
deployed Sweden Central environment. The seeded document preview is rendered as an
in-memory DOCX and submitted with `DefaultAzureCredential`; extracted facts retain
their source-document label. Live extraction interpretation, completeness, risk, and
summary use the four persistent Foundry agents described below.

The live document adapter can be tested independently with:

```text
POST /api/cases/KYC-DEMO-001/documents/DOC-001-01/extract
```

Local development defaults to deterministic document extraction. Set
`DOCUMENT_EXTRACTION_PROVIDER=azure`,
`AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`, and optionally
`AZURE_DOCUMENT_INTELLIGENCE_MODEL=prebuilt-layout` to enable the live adapter.

## Microsoft Foundry agents

The Sweden Central Foundry project contains four persistent versioned prompt agents,
all using the existing `gpt-5-1-kyc` deployment:

- `agt-kyc-extract` — normalises live Document Intelligence facts and preserves evidence.
- `agt-kyc-complete` — returns structured completeness findings without a decision.
- `agt-kyc-risk` — evaluates case risks and locally prefiltered candidates from all
  40 synthetic screening records; potential matches remain explicitly unconfirmed.
- `agt-kyc-summary` — produces the analyst summary and advisory next action.

The application uses `azure-ai-projects` with `DefaultAzureCredential`, persistent
`PromptAgentDefinition` versions, and the Foundry Responses API. Responses are parsed
against strict Pydantic schemas. Local tests use mocked responses and remain offline.

Each live stage can be checked independently without running the full workflow:

```text
POST /api/cases/KYC-DEMO-001/agents/extract
POST /api/cases/KYC-DEMO-001/agents/complete
POST /api/cases/KYC-DEMO-001/agents/risk
POST /api/cases/KYC-DEMO-001/agents/summary
```

Agent definitions are created idempotently by the `azd` post-provision hook. To inspect
the desired definitions without Azure access:

```powershell
python scripts\bootstrap_foundry_agents.py --dry-run
```

## Persistence and full workflow

The deployed customer-demo uses `STORAGE_PROVIDER=memory`: 25 cases, 40 synthetic
screening records, packaged document content, investigation checkpoints, and results
remain available for the lifetime of the running Container App replica. This is
session-oriented demo state, not production persistence. The asynchronous investigation
API executes the required seven stages and the React client polls progress:

```text
POST /api/cases/KYC-DEMO-001/investigations
GET  /api/cases/KYC-DEMO-001/investigations/{job_id}
```

Completed stages are saved before the next stage begins. A later retryable failure
therefore preserves earlier evidence in the running process, and the AI recommendation
never changes case status.

An optional `STORAGE_PROVIDER=azure` adapter supports Azure Tables and private Blob
documents using managed identity. The default deployment keeps deterministic
in-process state so enterprise policies that restrict Storage public endpoints do not
block the critical demo. Private networking is intentionally outside this prototype;
see `DEMO-EXTENSIONS.md`.

## Deploy Your Own Copy

### Prerequisites

- Git
- Azure CLI and an authenticated Azure account
- Azure Developer CLI (`azd`)
- Python 3.10 or later for the Foundry bootstrap hook
- Subscription permission to create resources and role assignments, normally
  **Contributor** plus **User Access Administrator**, or **Owner**
- Sweden Central quota for Azure AI Services and the configured GPT model deployment

Docker and Node.js are not required for deployment because `azd` uses an ACR remote
Docker build. Copilot CLI and Squad are optional and are only needed to extend the
solution.

### Fresh-clone deployment

```powershell
git clone <repository-url>
Set-Location <repository-directory>

az login
azd auth login
azd env new <unique-environment-name>
azd env set AZURE_LOCATION swedencentral
azd up

azd env get-value SERVICE_WEB_URI
```

Use a short environment name containing letters, numbers, or hyphens. Bicep combines
that name with a subscription-scoped hash, so each subscription/environment receives
its own resource group and globally unique resource names.

`azd up` provisions:

- one resource group in Sweden Central;
- one Container Apps environment and public Container App;
- one ACR using remote build;
- one user-assigned managed identity and required RBAC;
- one Microsoft Foundry resource/project and one GPT model deployment;
- four managed Foundry prompt agents;
- one Azure AI Document Intelligence resource;
- one Storage Account retained as optional infrastructure.

After provisioning, `scripts\bootstrap_foundry_agents.py` creates or reuses the four
logical agents using source-controlled prompts. A definition hash prevents duplicate
versions when the model and prompt are unchanged. New agent IDs and versions are saved
only in the current ignored `.azure` environment; the application uses the matching
environment-specific agent names. The runtime authenticates with managed identity.

The application starts with 25 deterministic cases, `KYC-DEMO-001`, packaged synthetic
documents, ownership examples, prior audit/history examples, and 40 synthetic screening
records. No data from another Azure environment is required. A typical first deployment
takes roughly 8–15 minutes, but regional model provisioning and ACR build time vary.

Application-only redeploy:

```powershell
azd deploy web
```

Delete your environment:

```powershell
azd down
```

All regional resources are restricted to `swedencentral`. The template does not fall
back to another region. If the configured model version or capacity is unavailable,
provisioning fails clearly; select another model/version only after confirming it is
available in Sweden Central.

Optional model settings can be changed before the first `azd up`:

```powershell
azd env set AZURE_AI_MODEL_DEPLOYMENT_NAME <deployment-name>
azd env set AZURE_AI_MODEL_NAME <model-name>
azd env set AZURE_AI_MODEL_VERSION <model-version>
azd env set AZURE_AI_MODEL_CAPACITY <capacity>
```

Do not place credentials in repository files. `.env.example` documents optional local
configuration using placeholders only.

### Optional Squad usage

Squad is not required to deploy or run the demo. Reusable team charters and routing can
be shared, while local histories, casting identity, memory, audit logs, sessions, and
inboxes are ignored. A colleague who wants a new AI team for a separate clone can remove
the reusable `.squad` configuration before first use and run:

```powershell
squad init
```

Within this repository, use the existing reusable Squad configuration and let Squad
create fresh ignored local runtime state on first use.

## Local development

```powershell
python -m venv app\backend\.venv
app\backend\.venv\Scripts\python.exe -m pip install -r app\backend\requirements-dev.txt
app\backend\.venv\Scripts\python.exe scripts\seed_demo.py

Set-Location app\frontend
npm ci
npm run build
Set-Location ..\..

app\backend\.venv\Scripts\python.exe -m uvicorn app.backend.main:app --reload --port 8000
```

Open `http://localhost:8000`. For frontend hot reload, run `npm run dev` from
`app\frontend`; Vite proxies `/api` to port 8000.

## Validation

```powershell
app\backend\.venv\Scripts\python.exe -m pytest app\backend\tests -q
Set-Location app\frontend; npm run build
```

## Structure

- `app\backend\api` — REST endpoints
- `app\backend\services` — case and investigation workflows
- `app\backend\providers` — deterministic providers and Azure integration contracts
- `app\backend\storage` — deterministic memory and managed-identity Azure Storage adapters
- `app\backend\seed` — deterministic fictional dataset generator
- `app\frontend\src` — React cockpit
- `scripts\seed_demo.py` — repeatable JSON seed export
- `data\demo_seed.json` — generated 25-case and 40-record dataset

For any deployed copy, retrieve its URL with:

```powershell
azd env get-value SERVICE_WEB_URI
```
