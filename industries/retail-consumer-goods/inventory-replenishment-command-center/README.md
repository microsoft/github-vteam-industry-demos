# Retail Inventory & Replenishment Command Center

A specialist-facing Microsoft demo for a fictional retailer, **Harbour & Lane**. It shows how an inventory planner can identify a potential stockout, review grounded evidence, compare deterministic replenishment options, use two Microsoft Foundry agents for explanation and recommendation, and explicitly simulate a transfer workflow.

> **Demo only.** All retailer, product, sales, inventory, promotion, route, financial, actor, action, and audit data is synthetic. The solution is not production-ready, is not connected to operational systems, and must not be used with customer or production data.

## Current deployment

- Public Phase 2 demo: <https://ca-retail-consumer-goods-ne-02.thankfulocean-b1b09e44.norwayeast.azurecontainerapps.io>
- Access: anonymous HTTPS; no sign-in required.
- State: shared across visitors and resettable.
- Status: the Phase 2 public demo is deployed and validated. **Do not claim Phase 3 completion or acceptance; final Phase 3 evidence is pending a future `STATUS.md` update.**

## Business objective

The demo explains how a retailer can keep popular products available without creating unnecessary purchases or a new shortage at the supplying store. The canonical scenario identifies low cover for an exact size/colour SKU in Dublin and compares protected options, including a 32-unit Cork-to-Dublin transfer.

The application separates responsibilities:

- deterministic application logic calculates risk, quantities, feasibility, timing, cost, donor protection, and priority;
- live Foundry agents explain supplied evidence and recommend only from supplied feasible options;
- the browser visitor explicitly initiates every simulated workflow transition;
- no AI call authorizes or performs an operational action.

## Feature journey

1. Open **Availability exceptions** and review projected scenario metrics and filters.
2. Open **Everyday Knit — Forest Green — Size M** (`HL-KNT-EVD-FGN-M`) at Dublin Grafton Street.
3. Review synthetic inventory, 28-day demand, inbound, and promotion evidence.
4. Compare deterministic options and the protected 32-unit Cork transfer.
5. Run **Inventory Investigation** and **Replenishment Recommendation**.
6. Explicitly simulate proposal, approval, dispatch, and receipt.
7. Review the server-generated synthetic audit trail, then reset the shared demo.

For the timed walkthrough and speaker guardrails, use [docs/DEMO-GUIDE.md](docs/DEMO-GUIDE.md).

## Technology stack

- Node.js 24 container; Node.js 22+ supported for development
- TypeScript, Express 5, Zod
- React 19 and Vite
- Vitest, Supertest, and Playwright Chromium
- Microsoft Foundry project with two persisted prompt agents
- Azure Container Registry and Azure Container Apps
- Azure Blob Storage with private endpoint and optimistic concurrency
- User-assigned managed identity and Azure RBAC
- Bicep, Azure CLI, PowerShell 7
- Azure Log Analytics and workspace-based Application Insights resources

## Repository layout

```text
app/
  scripts/       Seed generation, Foundry agent provisioning, deployed validation
  src/server/    API, deterministic calculations, state, auth, limits, Foundry boundary
  src/shared/    Domain and API contracts
  src/web/       React command center
  tests/         Unit, integration, UI, browser, and deployed smoke tests
infra/           Bicep and deployment/authentication scripts
docs/            Deployment, demo, and architecture guidance
STATUS.md        Latest deployment and validation evidence
RETAIL-INVENTORY-REPLENISHMENT-SQUAD-BRIEF-V1.md
                 Scope, scenario, history, and phase boundaries
```

Generated dependencies, builds, test output, compiler output, local state, and selected Squad runtime state are excluded by the repository ignore files.

## Prerequisites

### Local

- Node.js 22 or later and npm
- PowerShell 7 for the commands below
- Chromium installed through Playwright for browser tests

### Azure deployment or live Foundry use

- Azure CLI authenticated to the intended enabled subscription
- Permission to validate/deploy resource-group Bicep and assign the documented RBAC roles
- Permission to provision Foundry agent versions
- An available Foundry model deployment and sufficient regional quota
- Globally unique ACR and Storage account names
- Existing foundation resources expected by the current Bicep: Foundry account/project/model, ACR, managed identity, and the named monitoring resources

Never place subscription IDs, tenant IDs, credentials, access tokens, connection secrets, or customer data in source control or shared output.

## Quick start

From the repository root:

```powershell
Set-Location app
npm ci
npm run seed
npm run build:full

$env:APP_ENV = 'local'
$env:APP_AUTH_MODE = 'local'
$env:APP_STATE_MODE = 'file'
npm start
```

Open `http://localhost:8080`. Local mode uses `app/data/local-state.json`, which is ignored. Local demo headers are supported only for development and tests; Azure startup rejects local authentication and non-Blob state.

For backend development after a web build:

```powershell
npm run build:web
$env:APP_ENV = 'local'
$env:APP_AUTH_MODE = 'local'
$env:APP_STATE_MODE = 'file'
npm run dev
```

Useful package commands:

| Command | Purpose |
|---|---|
| `npm run seed` | Write the reproducible synthetic seed to `app/data/seed.json` |
| `npm run dev` | Run the TypeScript server directly |
| `npm run build:full` | Build the server and React SPA |
| `npm start` | Run the compiled application |
| `npm run provision:agents` | Create new versions of the two Foundry prompt agents |
| `npm run smoke:deployed` | Validate the anonymous deployed boundary and reset afterward |

## Validation

Run the local quality gates from `app/`:

```powershell
npm run typecheck
npm test
npm run build:full
npm run playwright:install
npm run test:e2e
```

Or run the combined application suite:

```powershell
npm run test:all
```

Validate the deployed public demo only when authorized:

```powershell
$env:DEPLOYED_BASE_URL = 'https://<container-app-host>'
npm run smoke:deployed
```

The deployed smoke mutates shared synthetic state and performs a final reset. See [STATUS.md](STATUS.md) for the evidence from the currently deployed revision.

## Azure deployment entry points

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — prerequisites, build, Foundry provisioning, staged deployment, and smoke checks
- [infra/README.md](infra/README.md) — concise stage commands and deployed result
- [infra/deploy.ps1](infra/deploy.ps1) — validate, what-if, and deploy entry point
- [infra/main.bicep](infra/main.bicep) — current private Norway runtime and application topology
- [infra/configure-public-demo.ps1](infra/configure-public-demo.ps1) — reconcile anonymous public-demo access
- [infra/configure-auth.ps1](infra/configure-auth.ps1) — explicit authenticated rollback path

Always inspect `what-if` before deployment. Do not accept deletes, replacement of retained environments/apps, public Storage enablement, shared-key enablement, or browser-held Azure credentials.

## Security, privacy, and responsible AI boundaries

- The public browser is anonymous and receives no Azure credential. It is always represented by one immutable **synthetic, unauthenticated** planner actor.
- Public mutations require exact-origin JSON requests and are limited to the canonical hero workflow. Identity headers, role headers, and cookies have no authority.
- ACR, Blob, and Foundry access is server-side through managed identity and RBAC.
- Blob public access and shared-key access are disabled; the deployed runtime reaches Blob through private endpoint/DNS.
- All workflow actions are simulated. No ERP, POS, warehouse, purchasing, or stock-movement system is connected.
- AI receives backend-generated evidence and options only. Schema, evidence, feasibility, and policy-preference checks reject unsupported output.
- Promotion is supporting evidence, not proof of causation. The server enforces that caveat and neutralizes unsupported causal wording after validation.
- Foundry failure is shown honestly as unavailable; deterministic evidence and calculations remain usable.
- Projected exposure and mitigation are scenario projections, not recovered revenue, guaranteed availability, or measured business outcomes.

## Reset

In the UI, open **Action history** and choose **Reset shared demo state**. Reset clears shared synthetic actions, audit entries, and idempotency records, increments the reset counter, and restores the deterministic starting scenario. It affects every current visitor.

## Documentation index

- [Architecture](docs/ARCHITECTURE.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [Public demo guide](docs/DEMO-GUIDE.md)
- [Current status and evidence](STATUS.md)
- [Project brief and phase history](RETAIL-INVENTORY-REPLENISHMENT-SQUAD-BRIEF-V1.md)
- [Live-demo quick changes](LIVE-DEMO-QUICK-CHANGES.md) — planned Phase 3 document; not yet present in the current Phase 2 package

## Portability and sharing

Before sharing or importing this project elsewhere:

- include source, tests, IaC, the brief, and specialist documentation;
- exclude `.git`, Squad runtime/local state, Copilot/session state, `node_modules`, builds, coverage, browser output, caches, generated local state, and machine-specific configuration;
- exclude all secrets, tokens, credentials, private identifiers, and environment dumps;
- use synthetic data only—never package production or customer data;
- replace environment-specific names and origins;
- choose globally unique ACR and Storage names;
- confirm service availability, Container Apps capacity, and Foundry model quota in the selected regions before deployment.

## Current limitations

- This is a bounded public demonstration, not a production reference implementation.
- Public state is shared and any visitor can run or reset the canonical simulation.
- The active deployment is intentionally pinned to one replica; rate limits and AI concurrency guards are process-local.
- State is one JSON Blob document, suitable for this small demo rather than high-throughput transactional workloads.
- The current Bicep deploys/reconciles the private runtime but expects several foundation and monitoring resources to exist already.
- The Foundry model and agent assets require regional availability, quota, permissions, and separate provisioning.
- The planned live-change guide is absent from the Phase 2 package.
- Application Insights is provisioned and its connection string is supplied, but the application currently relies on platform/console logging rather than an explicit Application Insights SDK.
- Phase 3 has not been declared passed. Final packaging, evidence, and acceptance remain pending a future authorized Phase 3 and `STATUS.md` update.
