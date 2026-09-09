# AI Proposal Factory

AI Proposal Factory is a polished, local-first Professional Services demo that turns customer opportunities and meeting context into grounded, human-reviewed proposals. The complete browser workflow runs with deterministic fixture adapters and no cloud credentials or live AI calls.

## What works

- Dashboard with 10 synthetic opportunities across five service scenarios
- Structured opportunity intake and real TXT, Markdown, DOCX, and text-based PDF upload/selection
- Scenario-sensitive retrieval across 45 reusable content records
- Visible four-stage generation progress with 12 mandatory proposal sections
- Section editing, regeneration, revision approval, and complete approval rules
- Visible citations, assumptions, dependencies, risks, and open questions
- Truthful retrieval mode/warnings and persisted provider-operation evidence for every new generation run
- Approved-revision Markdown and professional server-side PDF export
- Opportunity audit history
- Separate API, web, shared contracts/domain, and worker entrypoint

## Technology

- Node.js 24 LTS and npm workspaces
- TypeScript
- React and Vite
- Fastify
- Server-side Chromium (`playwright-core`) with Noto font fallback
- Vitest and Testing Library

## Workspace

```text
apps/
  api/       Fastify API and deterministic local adapters
  web/       React customer experience
  worker/    Background processing seam for future Azure Queue work
packages/
  contracts/ Shared API and domain types
  domain/    Proposal lifecycle rules and external-service interfaces
docs/
  architecture.md
```

## Local setup

### Prerequisites

- Node.js `24.20.0` (the repository includes `.nvmrc`)
- npm 11 or newer
- Chromium, Google Chrome, or Microsoft Edge for local PDF export

```powershell
npm install
$env:NODE_ENV = "development"
$env:AUTH_MODE = "development"
$env:AUTH_DEVELOPMENT_ORIGINS = "http://127.0.0.1:5173,http://localhost:5173"
$env:HOST = "127.0.0.1"
$env:DATA_PROVIDER = "local"
$env:AI_PROVIDER = "fixture"
npm run dev
```

Open `http://127.0.0.1:5173` or `http://localhost:5173`. The loopback-only Vite development server proxies `/api` to Fastify on `http://127.0.0.1:3001`; the API accepts browser origins only from the explicit `AUTH_DEVELOPMENT_ORIGINS` list.

Authentication is explicit, not inferred from the data provider. Local development uses a deterministic **Local Development Member** only outside production. Missing auth configuration fails startup. Azure uses Container Apps built-in Microsoft Entra authentication, assigned application-level workspace membership, and verified actor attribution. Each deployer bootstraps the registration in their own tenant and should assign `ProposalFactory.WorkspaceMember` to a security-enabled group. Direct group members are ordinary application users and need no Azure subscription role or Entra administrator role. See `docs\authentication.md` for the security boundary and secretless registration bootstrap. `.env.example` documents values but is not loaded automatically.

The API persists demo changes to `.data\proposal-factory.json`. Delete that local file to restore the original deterministic seed data.
Uploaded file bytes are stored under `.data\uploads` by default. Relative `LOCAL_DATA_FILE` and
`LOCAL_UPLOAD_DIRECTORY` values are resolved from the repository root, and both default locations are ignored by Git.
See `docs\exports.md` for Unicode PDF rendering, browser discovery, and production font/runtime requirements.

### Useful commands

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run check
```

### Run services separately

```powershell
npm run dev -w @proposal-factory/api
npm run dev -w @proposal-factory/web
npm run dev:worker
```

## Demo flow

1. Choose an opportunity from the dashboard.
2. Review its structured intake and scenario-sensitive retrieval preview.
3. Select fixture meeting notes or upload a supported document; extracted text is included in requirements analysis.
4. Start proposal generation and show each visible agent stage.
5. Review the 12 generated sections, risks, and supporting sources.
6. Edit or regenerate a section and observe approval invalidation.
7. Approve every current section, then approve the complete proposal.
8. Export Markdown or PDF.
9. Open Audit history to review the trace.

## Local API

Key endpoints are grouped under:

- `/api/opportunities`
- `/api/documents`
- `/api/content`
- `/api/generation-runs`
- `/api/proposals`
- `/api/audit`

`GET /health` reports local API readiness.

## Azure handoff

The repository includes Bicep, Azure SDK adapters, and Container Apps packaging. Azure resource managed identities are distinct from end-user identity: production API access requires a verified assigned Entra workspace member. One authorized tenant/application administrator must create or finalize the registration and assign a user or group to the app role; ongoing membership can then be delegated to a group owner. Follow `docs\deployment-azure.md` and `docs\authentication.md`; local success is not deployed validation or permission to provision.

Sweden Central (`swedencentral`) is the primary Azure region and `rg-aipf-dev-swc-001` is the development resource group. Platform will host the web/API and worker on Container Apps with Storage Queue, Cosmos DB serverless, and Azure AI Search Basic. Intelligence will configure `proposal-chat` and `proposal-embeddings` Azure OpenAI deployments. Configuration is endpoint and deployment-name based so Managed Identity adapters remain replaceable. No automatic secondary-region fallback is assumed.

See [docs\architecture.md](docs/architecture.md) for boundaries and integration guidance, and [DEMO-EXTENSIONS.md](DEMO-EXTENSIONS.md) for live Copilot enhancements.
