# Architecture

## Scope and status

This document describes the **actual deployed Phase 2 public demo** and the equivalent portable target for another Microsoft specialist. It does not declare Phase 3 complete. Final Phase 3 packaging and acceptance evidence remain pending a future authorized update to [STATUS.md](../STATUS.md).

The system is a bounded, synthetic inventory-planning demonstration. It is not a production architecture, does not connect to retailer systems, and does not perform real stock movements.

## Architecture at a glance

```text
Anonymous browser
  |
  | public HTTPS; no browser Azure credentials
  v
Azure Container App (Norway East, external ingress, one replica)
  |-- React SPA
  |-- Express /api/v1
  |-- deterministic seed, calculations, policy, workflow, and audit
  |-- process-local rate limits and AI concurrency guard
  |
  | user-assigned managed identity
  |---------------------------> ACR image pull (Sweden Central foundation)
  |---------------------------> Microsoft Foundry project + two agents
  |                              (Sweden Central foundation)
  |
  | VNet-integrated egress
  v
Blob private endpoint + private DNS (Norway East)
  |
  v
Single JSON state Blob (public network and shared keys disabled)

Container Apps platform/console logs
  |
  v
Norway East Log Analytics

Workspace-based Application Insights resources exist in Sweden and Norway;
the active app receives the Norway connection string, but has no explicit
Application Insights SDK instrumentation.
```

## Actual deployed topology

### Sweden Central foundation

The retained Phase 1 foundation is in the existing resource group and includes:

| Concern | Deployed resource |
|---|---|
| Foundry account | `ai-retail-consumer-goods-01`, AIServices S0, local-key authentication disabled |
| Foundry project | `proj-retail-consumer-goods-01` |
| Model deployment | `gpt-4-1-mini`, model `gpt-4.1-mini` version `2025-04-14`, Standard capacity 10 |
| Container registry | `acrretailconsumergoods01`, Basic, public endpoint, admin disabled |
| Workload identity | `id-retail-consumer-goods-01`, user-assigned managed identity |
| Foundation monitoring | `log-retail-consumer-goods-01` and workspace-based `appi-retail-consumer-goods-01` |
| Original Container Apps environment | `cae-retail-consumer-goods-01`, retained after Sweden capacity failure; no active workload |

Two persisted prompt-agent assets use the model deployment:

- `inventory-investigation` — **Inventory Investigation**
- `replenishment-recommendation` — **Replenishment Recommendation**

The application invokes them through the Foundry project Responses API with an `agent_reference`. The prompt versions are provisioned separately by `app/scripts/provision-agents.ts`; they are not created by `infra/main.bicep`.

### Norway East active runtime

| Concern | Deployed resource or setting |
|---|---|
| Runtime monitoring | `log-retail-consumer-goods-ne-01` and workspace-based `appi-retail-consumer-goods-ne-01` |
| VNet | `vnet-retail-consumer-goods-ne-01`, `10.60.0.0/26` |
| Container Apps subnet | `snet-containerapps-infra-ne-01`, `10.60.0.0/27`, delegated to `Microsoft.App/environments` |
| Private endpoint subnet | `snet-private-endpoints-ne-01`, `10.60.0.32/28` |
| Active environment | `cae-retail-consumer-goods-ne-02`, external workload-profiles environment using the custom VNet |
| Active app | `ca-retail-consumer-goods-ne-02`, external HTTPS ingress to port 8080 |
| Scale | single revision mode; one minimum and one maximum replica |
| State account | `stretailconsumergoods01`, Standard LRS, shared keys disabled, public network disabled, default deny |
| State container/blob | private `application-state` container; `state.json` document |
| Blob private endpoint | `pe-stretailconsumergoods01-blob-ne-01`, approved, private address `10.60.0.36` |
| Private DNS | `privatelink.blob.core.windows.net`, VNet link, and `pdzg-blob` endpoint zone group |

The current public endpoint is:

<https://ca-retail-consumer-goods-ne-02.thankfulocean-b1b09e44.norwayeast.azurecontainerapps.io>

Container Apps Easy Auth is disabled for the current anonymous demo. HTTPS remains required. The retained Entra application, service principal, app roles, identifier URI, callback URIs, and `infra/configure-auth.ps1` provide an explicit authenticated rollback path. The unused Container App Easy Auth secret and matching Entra credential are absent.

### Retained, inactive resources

Deployment was incremental and intentionally performed no deletes. Retained resources include:

- all Sweden Central foundation resources;
- Sweden environment `cae-retail-consumer-goods-01`;
- Norway environment `cae-retail-consumer-goods-ne-01`;
- Norway blocked app `ca-retail-consumer-goods-01`;
- Entra rollback assets for Planner/Viewer authentication.

The active application workload is in Norway East. No Container App workload is deployed in Sweden Central.

## Application structure

One Node.js/TypeScript process hosts:

- the compiled React SPA from `app/dist/web`;
- Express health and `/api/v1` routes;
- deterministic seed generation and inventory calculations;
- deterministic option generation and workflow policy;
- Blob/file/memory state adapters;
- Foundry invocation and output validation;
- public-demo request controls, rate limits, concurrency guard, and audit creation.

The container runs as the non-root `node` user and listens on port 8080. Container Apps liveness calls `/health/live`; readiness calls `/health/ready`, which reads the state backend.

## Trust boundaries and authority

### Public anonymous browser boundary

The browser is an untrusted anonymous client:

- it receives no ACR, Storage, Foundry, managed-identity, Entra, or Azure control-plane credential;
- cookies, `x-ms-client-principal`, and demo identity/role headers have no authority in public-demo mode;
- every request is assigned the immutable actor `anonymous-public-demo`, named **Anonymous Public Demo Actor (synthetic)**, with synthetic planner role and `authenticated=false`;
- POST/PATCH requires the exact configured HTTPS `Origin`, JSON content, and same-origin fetch metadata when present;
- CORS is not enabled;
- public AI and workflow mutations are restricted to the canonical hero exception and Cork option;
- correlation and idempotency keys are limited to 1–128 safe ASCII characters.

The synthetic actor is audit attribution for a public demonstration, not proof of identity. A browser visitor has only the authority to click the bounded demo controls. The visitor does not gain general planner authority, Azure access, or authority over a real operational system.

### Human/demo actor authority

The demonstration keeps decision authority visible:

- a visitor must explicitly select proposal, approval/rejection, dispatch, receipt, and reset;
- AI output cannot mutate state or invoke transitions;
- the server revalidates feasibility at approval;
- approval reserves simulated source stock only;
- dispatch and receipt require separate explicit simulated transitions;
- every transition is recorded with canonical server-generated text.

In a real implementation, authenticated users, operational roles, and downstream system controls would require a separate security and governance design. The retained Entra path is a rollback/demo access option, not a production authorization design.

## Data and decision boundaries

### Synthetic data

`app/src/server/data/seed.ts` reproducibly generates:

- ten fictional Irish stores and one warehouse;
- 100 exact size/colour SKUs;
- 90 days of synthetic store sales;
- inventory, inbound delivery, route, cost, and promotion records;
- fixed settings for a 28-day demand window, five-day critical cover, and seven-day donor protection.

The seed is deterministic and contains no customer or production data.

### Deterministic calculations

Application code—not AI—calculates:

- available stock as on-hand minus reserved;
- 28-day average daily demand;
- days of cover;
- inbound horizon and projected shortage;
- projected scenario revenue exposure;
- exception priority;
- route timing and cost;
- transferable quantity after donor protection;
- source and destination projected cover;
- option feasibility and policy-preferred ordering.

For the hero scenario, these calculations produce Dublin availability 12, demand 8/day, cover 1.5 days, inbound day 5, and a feasible 32-unit Cork transfer arriving day 1 while leaving Cork with 48 units and 12 days of baseline cover.

### Live AI

The two Foundry agents are live only when the project/model/identity path is available:

1. **Inventory Investigation** explains the risk using supplied evidence IDs and values.
2. **Replenishment Recommendation** discusses supplied options and must select the deterministic policy-preferred option.

The backend supplies all evidence, options, and the preferred option. Zod schemas and allowlists reject:

- malformed output;
- invented or missing evidence references;
- invented option references;
- infeasible selections;
- a selection different from the deterministic policy-preferred option.

Calls have an eight-second default timeout and one retry. If either call fails, the API returns an honest `unavailable` result. It does not synthesize a successful answer.

### Promotion non-causation guardrail

A synthetic promotion may be presented as a demand signal, but correlation must not be represented as causation.

The server applies the guardrail in this order:

1. validate the model response schema and the eight-item model supporting-text bound;
2. validate evidence and option IDs;
3. validate selected-option feasibility and deterministic policy preference;
4. inspect every generated natural-language field for direct or implicit promotion-to-outcome causal wording;
5. neutralize only the affected clauses while preserving grounded IDs, options, and unrelated text;
6. append exactly one canonical statement: **“Promotion is supporting evidence, not proof of causation.”**

No second model call is made, no evidence is fabricated, and valid model caveats/tradeoffs are retained. If promotion evidence is absent, the promotion-specific rewrite is not applied.

### Simulated operational actions

All action records have `simulated=true`. There is no ERP, POS, order management, warehouse, purchasing, carrier, or stock-control integration. The application never creates a real transfer or changes real inventory.

Projected exposure, destination cover, and mitigation are scenario estimates. They are not recovered revenue, guaranteed outcomes, or causal impact measurements.

## Exact simulation lifecycle

The state machine is deliberately small:

```text
no action
  |
  v
proposed -----> rejected (terminal; reset required)
  |
  v
approved
  |
  v
dispatched
  |
  v
received (terminal; reset required)
```

1. **Proposed** — the canonical feasible option is copied into a simulated action. No inventory changes.
2. **Approved** — feasibility is recalculated. The transfer quantity becomes reserved at the source; the message states that mitigation is scheduled and stock is reserved only.
3. **Rejected** — no inventory movement; the workflow becomes terminal.
4. **Dispatched** — the quantity is deducted from simulated source on-hand inventory.
5. **Received** — the quantity is added to simulated destination on-hand inventory.
6. **Reset** — actions, audit entries, and idempotency records are cleared; `resetCount` increments; the deterministic seed remains the source of the restored baseline.

Every transition creates an audit event with event name, timestamp, immutable synthetic actor, action ID, and canonical server-generated reason. After rejection or receipt, another proposal is blocked until reset.

## Persistence, concurrency, and idempotency

### Deployed state

The deployed state is one JSON Blob document containing:

- schema version and reset counter;
- actions;
- audit entries;
- idempotency records.

The Blob adapter uses managed identity and conditional operations:

- reads return the current Blob ETag;
- a missing document is created with `If-None-Match: *`;
- writes use `If-Match` with the previously read ETag;
- Blob HTTP 412 is mapped to a state conflict.

The local adapter uses a JSON file and content hash ETag. Tests use an in-memory adapter.

### API concurrency contract

- reads return the current `ETag`;
- every state mutation requires `If-Match` and `Idempotency-Key`;
- stale state returns HTTP 409 `etag_mismatch`;
- each idempotency key is scoped by actor, method, and path;
- replaying the same key and request returns the stored response;
- reusing a key with a different body returns HTTP 422;
- approval recalculates and rechecks the option before writing;
- the client refreshes state after conflicts.

This design prevents lost updates for the shared demo document but is not a substitute for a transactional database in a high-volume or multi-entity system.

## Public-demo rate and concurrency controls

Limits are sliding-window, process-local controls with both client and global scopes:

| Category | Client limit | Global limit | Window |
|---|---:|---:|---:|
| Reads | 120 | 600 | 1 minute |
| Both AI routes combined | 6 | 30 | 10 minutes |
| Workflow mutations | 30 | 150 | 10 minutes |
| Reset | 3 | 20 | 10 minutes |

AI execution also has a global process-local concurrency cap of two. Rejections return HTTP 429 with `RateLimit-*`, `Retry-After`, and `Cache-Control: no-store`. They occur before Foundry invocation or Blob mutation.

The active app trusts one ingress proxy so attacker-prepended `X-Forwarded-For` values cannot select arbitrary client scopes. One replica is intentionally pinned so the process-local controls have a single enforcement point. These controls would need a distributed backing service before horizontal scale or production use.

## Identity and RBAC

The Container App uses the existing user-assigned managed identity:

- **AcrPull** on ACR for image pull;
- **Storage Blob Data Contributor** on the state Storage account;
- **Foundry Agent Consumer** on the Foundry project;
- project-scoped **Foundry User**, retained because the deployed Responses API invocation required it in addition to the consumer role.

Storage shared-key access and ACR admin access are disabled. Foundry local-key authentication is disabled. Service credentials are not sent to or stored in the browser.

## Private networking

The active Container Apps environment is VNet-integrated but externally reachable over HTTPS. Private networking protects the state path, not the browser endpoint:

1. the app resolves the public Blob hostname;
2. the private DNS zone maps it through `privatelink.blob.core.windows.net`;
3. DNS returns the approved private endpoint address;
4. Blob traffic stays on the private endpoint path;
5. Storage public-network access remains disabled and default deny remains enforced.

The Foundry and ACR foundation endpoints remain public service endpoints protected by managed identity/RBAC rather than browser credentials. The current design should not be described as a fully private-endpoint architecture.

## Observability

### Implemented

- Container Apps liveness and readiness probes;
- generated or bounded `X-Correlation-ID` on responses;
- correlation ID in structured API error responses;
- server-side console error logging with correlation ID and path;
- Container Apps platform and console logs flowing to Norway Log Analytics;
- workspace-based Application Insights resources in both the retained foundation and active runtime monitoring sets;
- `APPLICATIONINSIGHTS_CONNECTION_STRING` supplied to the active container;
- deployed checks for health, private DNS, persistence, agent grounding, causation guardrail, workflow/audit/reset, and Log Analytics ingestion.

### Current limitation

The application has no explicit Application Insights SDK dependency or custom trace/metric exporter. Therefore, the connection string alone must not be presented as proof of application-level distributed tracing, dependency telemetry, or custom metrics. Current demonstrated observability is primarily platform health plus console/system logs in Log Analytics.

Generated AI text is returned to the caller and validated, but there is no durable model-prompt/response audit store. Do not log secrets, tokens, identity claims, or customer data.

## Deployment topology and sequencing

`infra/main.bicep` currently:

- treats the managed identity, ACR, Foundry account/project, Norway Log Analytics, and Norway Application Insights as existing resources;
- creates/reconciles the Storage account/container, VNet, subnets, Blob private endpoint/DNS, and RBAC;
- optionally creates/reconciles the active Container Apps environment;
- optionally creates/reconciles the active Container App and disabled Easy Auth configuration.

`infra/deploy.ps1` exposes three additive stages:

1. `network`
2. `environment`
3. `application`

Each stage supports `validate`, `what-if`, and `deploy`. The deployment guide requires inspection for zero deletes, no replacement of retained resources, and no weakening of Storage network controls. Authentication reconciliation is separate so public-demo access can be switched without embedding credentials in Bicep output.

Detailed commands and operator prerequisites are intentionally kept in [DEPLOYMENT.md](DEPLOYMENT.md) and [infra/README.md](../infra/README.md).

## Portable target

A portable deployment should preserve the logical boundaries even if regional placement changes:

```text
Foundation region selected for Foundry model availability/quota
  - Foundry account, project, model deployment, two prompt agents
  - ACR
  - user-assigned managed identity
  - foundation monitoring as required

Runtime region selected for Container Apps capacity
  - Log Analytics and Application Insights resources
  - custom VNet with separate Container Apps and private-endpoint subnets
  - externally reachable HTTPS Container App
  - private Blob account/container/endpoint/DNS
  - managed-identity RBAC
```

Porting requirements:

- choose globally unique ACR and Storage account names;
- verify model/SKU availability and regional quota before deployment;
- verify Container Apps regional capacity;
- inspect VNet address-space overlap before selecting CIDRs;
- update the exact public origin and resource names;
- provision the foundation resources that the current Bicep declares as existing;
- provision the two Foundry agent versions from an authenticated workstation;
- preserve managed identity, least-privilege RBAC, private Blob access, exact-origin checks, deterministic calculations, and human-controlled simulated transitions;
- re-run local tests, Bicep validation/what-if, deployed smoke, private DNS, persistence, and telemetry checks.

The current Sweden/Norway split reflects actual service capacity and quota decisions, not a universal requirement. A different split or a single suitable region may be used only after service availability, quota, capacity, networking, and data-residency review.

## Shareable-package cautions

Include application source, tests, IaC, the brief, and specialist documentation. Exclude:

- `.git` and nested repositories;
- `.squad` runtime/local state, inboxes, logs, caches, and sessions;
- Copilot/session/runtime state and machine-specific editor configuration;
- `node_modules`, builds, coverage, Playwright output, caches, and local state files;
- generated tokens, secrets, credentials, private environment dumps, and tenant/subscription identifiers;
- production or customer data of any kind.

The package must remain synthetic and must not imply production readiness. Replacing names is not sufficient: the receiving specialist must also obtain regional model quota, create globally unique names, validate policies, and review all `what-if` changes.

## Related documentation

- [Deployment guide](DEPLOYMENT.md)
- [Public demo guide](DEMO-GUIDE.md)
- [Current status and validation evidence](../STATUS.md)
- [Project brief and phase history](../RETAIL-INVENTORY-REPLENISHMENT-SQUAD-BRIEF-V1.md)
- [Live-demo quick changes](../LIVE-DEMO-QUICK-CHANGES.md) — planned Phase 3 document; not present in the current Phase 2 package
- [Root README](../README.md)

Procedural deployment and demonstration steps belong in the linked guides rather than this architecture record.

## Known integration gaps

- The current Bicep is not a complete fresh-environment foundation deployment; several Sweden and Norway resources must already exist.
- Foundry agent provisioning is a separate authenticated script and is not represented in Bicep.
- The planned `LIVE-DEMO-QUICK-CHANGES.md` document is absent.
- Application Insights exists and is configured at the environment/app-setting level, but explicit application telemetry instrumentation is absent.
- Process-local throttling depends on the intentional one-replica topology.
- Final Phase 3 package validation and evidence have not been recorded in `STATUS.md`.

These are portability or Phase 3 integration items, not evidence that the currently documented Phase 2 deployment failed.
