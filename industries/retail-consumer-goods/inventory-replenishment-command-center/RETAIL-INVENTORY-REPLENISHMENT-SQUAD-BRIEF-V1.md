# Retail Inventory & Replenishment Command Center

## Brief status and execution boundary

Version: V1 — implemented and validated through approved Phase 3.

This is the single evolving source of truth for the Retail & Consumer Goods demo
built by GitHub Copilot CLI using Squad. Phase 1, Phase 2 application and
private-network recovery, anonymous public-demo access, and final Phase 3
integration/deployment are complete and validated.

The implemented direction is an Inventory & Replenishment Command Center using
the synthetic Harbour & Lane scenario and canonical hero transfer documented
below.

**Current boundary:** Phase 3 is complete. Preserve the deployed recording state
and do not change the approved region/network/authentication controls, delete
retained resources, push to GitHub, or begin additional work without separate
explicit authorization. Historical sections below retain earlier blockers and
recovery decisions as execution evidence.

## Approved Phase 1 authorization and deployed architecture — 2026-10-05

**Historical authorization boundary:** at this checkpoint the user had
authorized only the Azure foundation described here. Application and Phase 2
work were authorized later and are recorded in the subsequent sections.

The active enabled subscription was re-verified before mutation and the existing
empty resource group `rg-retail-consumer-goods-01` was confirmed in
`swedencentral`. Required providers were registered and the selected services were
available in the region.

Phase 1 uses reproducible Bicep under `infra/` and targets the existing resource
group:

| Concern | Actual Phase 1 choice |
|---|---|
| Microsoft Foundry | `ai-retail-consumer-goods-01`, `AIServices` S0, project management enabled, public endpoint, local-key authentication disabled |
| Foundry project | `proj-retail-consumer-goods-01` |
| Model | Deployment `gpt-4-1-mini`; `gpt-4.1-mini` version `2025-04-14`; Standard capacity 10 (10,000 TPM) |
| Container registry | `acrretailconsumergoods01`, Basic, public endpoint, admin account disabled |
| Container Apps | Managed environment `cae-retail-consumer-goods-01`; no Container App workload |
| Workload identity | `id-retail-consumer-goods-01`, user-assigned managed identity |
| Monitoring | `log-retail-consumer-goods-01`, 30-day retention; workspace-based `appi-retail-consumer-goods-01` |
| RBAC | Identity receives `Cognitive Services OpenAI User` on the Foundry account and `AcrPull` on ACR |
| Networking | Public endpoints only; no private endpoints or custom virtual network |

Live catalog and quota inspection showed the selected model/SKU available in
Sweden Central. Standard quota was 5,000 capacity units with zero used before this
deployment; capacity 10 was deliberately conservative. The Bicep compiled,
resource-group validation succeeded, and what-if predicted the intended ten
resources/assignments.

Foundry, project, model deployment, ACR, identity, RBAC, Log Analytics, and
Application Insights all reached `Succeeded`. A Microsoft Entra-authenticated live
chat-completion call returned the exact expected marker, proving model access
without using or exposing an API key.

**Original Phase 1 blocker/deviation retained for history:** Azure Container Apps
environment provisioning in Sweden Central returned
`ManagedEnvironmentCapacityHeavyUsageError` (`AKSCapacityHeavyUsage`). A retry
remained `Updating` for more than 1 hour 44 minutes and the parent deployment was
canceled. The original `cae-retail-consumer-goods-01` remains present in Sweden
Central and was not deleted, retried, or modified.

**Approved recovery completed — 2026-10-05:** the user authorized a replacement
runtime in Norway East while preserving the working Sweden Central foundation.
Incremental deployment created:

- `log-retail-consumer-goods-ne-01` in Norway East with 30-day retention.
- Workspace-based `appi-retail-consumer-goods-ne-01` in Norway East, linked to
  that workspace.
- `cae-retail-consumer-goods-ne-01` in Norway East, linked to that workspace.

The replacement environment reached `Succeeded`, with default domain
`kindgrass-4a6c243c.norwayeast.azurecontainerapps.io` and static IP
`20.100.155.205`. Bicep build and resource-group validation succeeded. Preflight
what-if showed exactly three creates and no deletes or updates: the Norway East
workspace, Application Insights component, and managed environment. Existing
Foundry/model, ACR, managed identity, monitoring, and the original environment
were ignored by the incremental recovery deployment.

A disposable public-image Container App reached `Succeeded`/`Running` in the
replacement environment and returned HTTP 200 from its external endpoint.
Container startup logs were retrieved. The smoke app was then deleted; neither
managed environment was deleted.

**Phase 1 foundation validation is PASSED via the Norway East replacement
runtime.** The Sweden Central capacity blocker remains documented as history.
The replacement environment is the required target for subsequent Phase 2
application deployment.

**STOP:** recovery is complete, but no Phase 2 action is permitted without
explicit authorization.

## Authorized Phase 2 implementation and blocked deployment — 2026-10-05

The user explicitly authorized Phase 2. Application, deterministic workflow,
tests, Foundry agents, durable state prerequisites, immutable image build,
Container App deployment, and Entra configuration were implemented. The phase
is **BLOCKED**, not passed, because subscription policy prevents the approved
Norway East runtime from reaching its durable state store.

### Implemented architecture

- One Node.js 24 / TypeScript service hosts Express REST APIs and the built React
  SPA on port 8080.
- Azure Container App `ca-retail-consumer-goods-01` targets existing environment
  `cae-retail-consumer-goods-ne-01`.
- Existing user-assigned identity `id-retail-consumer-goods-01` performs ACR
  pull, Blob data access, and Foundry agent access.
- Durable state is one optimistic-concurrency JSON document in private container
  `application-state` in Norway East account `stretailconsumergoods01`.
- Existing Norway East Log Analytics and Application Insights resources remain
  the monitoring targets.
- Existing Sweden Central Foundry/model and ACR are preserved.

The final immutable image is
`acrretailconsumergoods01.azurecr.io/inventory-command-center:phase2-20261005-2305`
with digest
`sha256:d686786db6c0ae834a7814c81d2139358919177d757959e7ff8672740bfd7ff3`.

### API and workflow contract

All APIs use `/api/v1`. Reads return ETags. Mutations require `If-Match` and
`Idempotency-Key`. A stale ETag returns HTTP 409. Reusing an idempotency key for
a different request returns HTTP 422. The planner alone may propose, approve,
reject, reset, dispatch, and receive. Approval reserves the simulated transfer;
dispatch and receipt remain separate explicit simulated states with audit
entries.

Deterministic calculations preserve the approved hero scenario: exact SKU
`HL-KNT-EVD-FGN-M`, Dublin 12 units, 8/day demand, 1.5 days cover, inbound day 5,
Cork 80 units, protected transfer quantity 32 arriving day 1, and Cork retaining
48 units / 12 days cover. AI cannot change quantities, feasibility, timing,
costs, state, or human authority.

### Persisted Foundry agents

Two actual prompt-agent assets exist in
`proj-retail-consumer-goods-01` using `gpt-4-1-mini`:

- Resource/internal ID `inventory-investigation`; exact display/business name
  `Inventory Investigation` stored in description and metadata; validated
  version 2.
- Resource/internal ID `replenishment-recommendation`; exact display/business
  name `Replenishment Recommendation` stored in description and metadata;
  validated version 2.

Live Entra-authenticated validation returned schema-valid grounded output from
both. Investigation cited supplied evidence and described the stockout gap.
Recommendation selected the exact deterministic policy-preferred Cork option
`store-02:exception:store-01:HL-KNT-EVD-FGN-M`. Backend validation rejects
invented evidence/options, infeasible selections, and a different selected
option.

### Security and authentication

- Storage shared-key access is disabled and OAuth is the default.
- ACR admin credentials remain disabled.
- Runtime access uses the existing managed identity and narrow RBAC.
- Container Apps Microsoft Entra authentication is configured with HTTPS,
  redirect-to-login for unauthenticated requests, and app roles
  `Inventory.Planner` / `Inventory.Viewer`.
- No registry credential, Foundry key, storage key, token, or secret is stored
  in Git or recorded in output.
- Local/demo authentication remains forbidden when `APP_ENV=azure`.

### Test and deployment evidence

Clean local validation passed: dependency install, typecheck, 17 Vitest tests,
production backend/SPA build, one true Playwright Chromium test, and production
API/SPA smoke. Browser automation covers hero values, option 32, human approval,
distinct simulated states, audit, 409/422 behavior, reset, and honest AI
unavailability.

Bicep build, Azure resource-group validation, and what-if passed. Existing
monitoring/environment resources are declared `existing`, so prerequisite
what-if contained only storage/container/RBAC creates. The application what-if
contained the one intended Container App create and ignored the working
foundation. ACR remote builds `dt1` and `dt2` succeeded. The final Container App
resource and image pull succeeded, and liveness returned 200 inside the replica.

### Exact deployment blocker and deviation

Policy assignment `MCAPSGovDeployPolicies`, definition
`StorageAccount_PublicNetwork_Modify`, forces
`stretailconsumergoods01.publicNetworkAccess=Disabled`. An explicit enable
operation did not change the effective setting. The accepted existing Norway
East Container Apps environment has `vnetConfiguration: null`, so it has no
private endpoint/DNS path to Blob Storage. Readiness returns HTTP 503 and
revisions cannot become healthy.

External ingress was disabled after confirming the blocker. The intended
hostname is
`ca-retail-consumer-goods-01.kindgrass-4a6c243c.norwayeast.azurecontainerapps.io`,
but it is intentionally not exposed while the application is unready.
Persistence across restart, deployed browser automation, and full telemetry
acceptance therefore remain blocked.

The Frontend-owned `App.tsx` was not changed under the explicit ownership
boundary and still gates dispatch/receipt controls on the legacy `operations`
role. The backend contract and automated API/browser validation are
Planner-only. This UI control alignment remains required after the infrastructure
blocker is resolved.

No alternate region, local/demo state in Azure, public anonymous storage,
storage key, or weakened authentication was used. The original Sweden
environment and all working Sweden resources remain untouched.

**Strict boundary:** Phase 2 is BLOCKED. STOP pending explicit authorization for
a private-network recovery design. Phase 3 was not started.

## Authorized Phase 2 private-network recovery — PASSED 2026-10-06

The user authorized the approved private-network replacement design. No old
environment, app, or Sweden resource was deleted.

The deployed recovery uses `vnet-retail-consumer-goods-ne-01`
(`10.60.0.0/26`), a dedicated delegated Container Apps subnet
(`10.60.0.0/27`), and a private endpoint subnet (`10.60.0.32/28`). Subscription
inspection found no overlap with visible VNets, peerings, route tables, local
network gateways, or ExpressRoute resources, so no CIDR deviation was needed.

Blob Storage remains public-network disabled, shared-key disabled, OAuth
default, and default deny. Private endpoint
`pe-stretailconsumergoods01-blob-ne-01` is approved; private DNS resolves the
Blob endpoint to `10.60.0.36`.

Replacement workload-profiles environment
`cae-retail-consumer-goods-ne-02` and app
`ca-retail-consumer-goods-ne-02` reached `Succeeded`. Revision
`ca-retail-consumer-goods-ne-02--final2` is healthy with 1/1 replica ready and
uses immutable image digest
`sha256:450464a0e35db7d5b246aed898df6db78508e8938ba7690dfbf57b984f0e5273`.

The working URL is
`https://ca-retail-consumer-goods-ne-02.thankfulocean-b1b09e44.norwayeast.azurecontainerapps.io`.
Anonymous access redirects to Microsoft Entra. The replacement callback URI was
added while preserving the previous callback. Planner/Viewer authorization is
preserved, and the stale frontend Operations-role gate was corrected to the
authoritative Planner-only contract.

Managed-identity Blob read/write, reset, persistence across a new revision and
restart, hero data, simulated workflow states, both persisted Foundry agents,
health, image pull, private DNS, and Norway telemetry were validated live.
Automated tests continue to cover ETag/idempotency/concurrency and honest AI
unavailability.

**Phase 2 PASSED. STOP before Phase 3. Phase 3 was not started.**

## Authorized Phase 2 public-demo access change — PASSED 2026-10-06

The user authorized a Phase 2-only change on the same Container App and URL.
The browser experience is now anonymous, while Azure service access remains
private and identity-based.

Container Apps Easy Auth is disabled. The existing Entra application,
service principal, app roles, identifier URI, and callback URIs remain for
rollback, while the unused Easy Auth Container App secret and matching
credential are removed. Azure configuration explicitly sets
`APP_AUTH_MODE=public-demo` and the exact current HTTPS URL as
`PUBLIC_DEMO_ORIGIN`; Azure startup cannot silently select local/header auth.

Every request uses the immutable server actor
`anonymous-public-demo` / `Anonymous Public Demo Actor (synthetic)`, role
`planner`, kind `public-demo`, `authenticated=false`. Cookies and caller
identity/role headers have no authority. Public mutations are limited to the
canonical hero Cork-to-Dublin proposal, simulated approve/reject/dispatch/
receive, and reset. The two AI routes are limited to the fixed hero exception.
Audit reasons are server-generated, and terminal workflows require reset before
reproposal.

POST/PATCH requires the exact configured Origin, same-origin fetch metadata when
present, and JSON content. CORS is not enabled. Correlation and idempotency keys
are bounded. Sliding-window process-local limits are 120/client/minute and 600
global/minute for reads; 6/client/10 minutes and 30 global/10 minutes across both
AI routes; 30/client/10 minutes and 150 global/10 minutes for workflow
mutations; and 3/client/10 minutes and 20 global/10 minutes for reset. AI
concurrency is globally capped at two. One replica and one trusted ingress proxy
make those scopes deterministic; missing client extraction still shares a
fallback scope and the global cap. Rejections must not call Foundry or write
Blob state.

The existing private Storage endpoint/DNS, public-network deny, managed
identity, ACR/Blob/Foundry RBAC, HTTPS-only ingress, resource names, and URL are
preserved.

Immutable image
`inventory-command-center:phase2-public-demo-causation-guard-v4-20261006-1612`
with digest
`sha256:ce5421b049c1c10ea822e7bed184b96eea773b119ca74de1b09bbda91ba99e24`
is deployed as healthy revision
`ca-retail-consumer-goods-ne-02--guardrailv4r4`, one ready replica, at the
unchanged URL. Direct anonymous HTTPS returned HTTP 200 without an Entra
redirect, cookie, or browser-storage requirement.

Fresh-browser validation passed for the hero dashboard, immutable synthetic
actor, both live grounded Foundry agents, canonical simulated workflow and
audit, reset-required behavior, reset, non-hero denial, and shared AI retry UI.
Promotion-bearing agent responses include the canonical caveat `Promotion is
supporting evidence, not proof of causation.` exactly once after structured
schema and grounding validation. Bounded clause-level normalization covers
direct and implicit causal wording in every generated text field for both agent
response shapes, including contributed/attributed, created/generated, and
explains variants when promotion evidence is linked to an outcome. Legitimate
non-causal uses remain unchanged. All eight valid model caveats/tradeoffs are
retained and the canonical caveat is appended as a ninth item, with no second
model call or invented evidence.
Calls 1–6 on one stable client connection returned HTTP 200 and call 7 returned
HTTP 429 with `Retry-After`, no state/ETag change, and no audit side effect.
Two concurrent AI calls completed while a third returned HTTP 429 with
`Retry-After: 1`.

The received workflow survived a revision restart. Blob resolved to the private
endpoint; Storage public access/shared keys remain disabled; ACR, Blob, and
Foundry remain managed-identity based. Typecheck, 145 Vitest tests, production
build, local/deployed Playwright, Bicep build/lint, Azure validation, and
zero-delete what-if passed. Log Analytics ingestion was observed.

The independent guardrail revision was validated live with both agents
`available`, grounded evidence IDs, the canonical Cork option, no unsupported
promotion-causation wording across generated fields, and exactly one canonical
caveat per response. The anonymous four-transition workflow still produced four
audit events and was reset afterward. No infrastructure changed, so the
guardrail-only deployment did not require another Bicep/what-if run.

**Phase 2 public demo PASSED. STOP before Phase 3. Phase 3 was not started.**

## Authorized Phase 3 final integration and deployment — PASSED 2026-10-06

Phase 3 integrated the Frontend handoff, rebuilt the complete application, and
deployed the final immutable image to the same Norway East Container App and
unchanged URL. The final image is
`acrretailconsumergoods01.azurecr.io/inventory-command-center:phase3-final-20261006-1724`
with digest
`sha256:2d687dae8de0bd595cc7db92b18f852d267c706266ee16cd3e976f84521f3071`.
Revision `ca-retail-consumer-goods-ne-02--0000004` is healthy, active, serving
100% traffic, and pinned to one ready replica.

Integrated local validation passed `npm ci`, deterministic seed generation,
typecheck, 149 Vitest tests in nine files, the backend and SPA production build,
and both Playwright journeys. The Playwright suite exercised the reject/reset
and approve/dispatch/receipt/history/reset branches and the seven-width matrix
at 320, 360, 375, 768, 1024, 1280, and 1440 pixels. Every required control was
visible, enabled, keyboard-focusable, and in viewport; no document overflow or
lingering loading skeleton remained. Both Bicep templates compiled, all
PowerShell deployment scripts parsed, Azure resource-group validation passed,
and final what-if reported zero resource creates, deletes, or replacements and
no security weakening.

The first live width run exposed the platform's one-second default probe timeout
under sustained browser load. The application rendered its explicit retryable
503 state rather than an indefinite skeleton, but the replica was restarted by
the liveness probe. Phase 3 corrected the Azure-owned template to use a
five-second timeout and six-failure threshold for readiness and liveness.
Policy-injected NSGs are now discovered and preserved by deployment rather than
being removed by reconciliation. The final live matrix then passed 2/2, with no
probe failures after the fix.

Live validation reconfirmed the exact Dublin hero calculation (12 units,
8/day, 1.5 cover days, inbound day 5, shortage 28) and Cork transfer (32 units,
arrival day 1, donor floor 28, 48 retained and 12 cover days). Both persisted
Foundry agents returned `available`, cited only supplied evidence/options,
selected the canonical Cork option, included the promotion non-causation caveat
exactly once, and contained no unsupported causal claim. Honest AI-unavailable
behavior passed automated integration coverage; a stable live client also
received HTTP 429 with `Retry-After` and no workflow mutation.

Live API evidence included stale ETag HTTP 409, different-request idempotency
reuse HTTP 422, and concurrent approval/rejection with exactly one HTTP 200
winner and one HTTP 409 conflict. The canonical received action retained
quantity 32 and four audit events across a controlled revision restart, proving
Blob persistence, and was then reset. Cross-origin mutation denial, immutable
anonymous actor spoof protection, private Blob access, managed identity,
HTTPS-only anonymous access, current telemetry, and no-login/no-cookie behavior
all passed. Storage remains public-network disabled, shared-key disabled,
Blob-public-access disabled, OAuth default, TLS 1.2, and default deny.

A fresh clean export under the Copilot session workspace passed required-file
and exclusion checks, clean `npm ci`, typecheck, unit/integration/full Vitest,
production build, both Bicep builds, and PowerShell parsing. It excludes Git,
Squad/Copilot/editor state, dependencies, builds, reports, caches, logs,
credentials, environment secrets, and local application state. No GitHub push
or Azure resource deletion occurred; all previously retained resources remain.

At `2026-10-06T17:53:03+01:00`, final recording state was verified with zero
actions, zero audit entries, unchanged hero values, zero active actions,
Overview landing, both AI controls idle, no active mitigation, no loading
skeleton, no document overflow, and no cookie or local-storage state.

Known documentation follow-up for Lead: README/architecture links may target
`docs/LIVE-DEMO-QUICK-CHANGES.md`, while the actual file is
`LIVE-DEMO-QUICK-CHANGES.md` at repository root.

**STOP: Phase 3 PASSED. Do not push, delete retained Azure resources, or begin
work beyond Phase 3.**

## 1. Project objective

Build a reusable, visually compelling inventory-planning demo that helps a retailer identify potential stockouts, investigate inventory across its network, compare replenishment options and approve a proposed action.

Explain the business value in plain language: keep popular products available while avoiding unnecessary stock purchases and protecting the stores supplying a transfer.

The completed demo must be deployable by another Microsoft specialist from the shared repository, use synthetic data only, and support small application changes during customer conversations.

## 2. Proposed fictional business

Company: **Harbour & Lane**, a fictional Irish fashion and lifestyle retailer.

Proposed demonstration scale:

- Ten stores across Ireland.
- One central distribution warehouse.
- Approximately 100 products with clearly identified sellable SKUs.
- Ninety days of synthetic sales history.
- Inventory, incoming deliveries, promotions and transfer routes.

The baseline focuses on store availability. E-commerce fulfilment, manufacturing and supplier production planning are outside the initial scope.

For clothing, calculations and transfers must operate at the exact size/colour SKU level. A product-family view may summarize variants, but cannot treat different sizes as interchangeable stock.

## 3. Business problem

A store can run out of a popular item while another store holds more than it needs. The inventory planner must bring together sales, stock, delivery dates and promotion information before deciding whether to replenish from the warehouse or transfer from another store.

Manual investigation takes time. An apparently simple transfer can also create a new stockout at the supplying store or arrive too late to prevent the original shortage.

The application should answer:

1. Which product and store need attention first?
2. What evidence explains the risk?
3. Which feasible action improves availability without creating another problem?
4. Who approved the action, and what happened next?

## 4. Personas and decision authority

| Persona | Responsibility | Application role |
|---|---|---|
| Inventory / Replenishment Planner — primary | Investigate inventory exceptions and decide on eligible replenishment actions | Review evidence, compare options, approve or reject a proposal |
| Regional Merchandising Manager — secondary | Understand availability and commercial exposure across stores | Review priorities and business outcomes |
| Store Operations Team — supporting | Prepare, dispatch and receive approved transfers | Represented through simulated action status; no separate full employee application |

The planner approves proposed transfers within configured demo policy. AI does not independently authorize or execute a stock movement. Supplier purchases, pricing changes and policy exceptions are outside the planner's baseline workflow.

## 5. Current process

1. The planner opens separate stock, sales and delivery reports.
2. They look for products likely to sell out before the next delivery.
3. They check warehouse and other-store availability.
4. They compare delivery timing, transfer cost and supplying-store needs.
5. They request a stock movement and track it manually.

Pain points: fragmented information, slow investigation, inconsistent prioritization and limited visibility into why an action was chosen.

## 6. Proposed AI-assisted process

1. Application calculations identify inventory exceptions from synthetic data.
2. The planner opens a prioritized exception.
3. AI uses available evidence and tools to explain the demand change and investigate options.
4. The application calculates feasible quantities, timing, costs and supplying-store cover.
5. AI presents an evidence-backed recommendation and its tradeoffs.
6. The planner approves or rejects the proposal.
7. Approval creates a simulated operational request with an audit record.
8. The application tracks approval, dispatch and receipt as distinct states.

Numeric calculations and policy enforcement must be deterministic and testable. A language model must not invent inventory, routes, forecast values or monetary outcomes. Agent count and boundaries will be decided after the architecture is designed.

## 7. Proposed recording scenario

Hero SKU: **Everyday Knit — Forest Green — Size M**.

All numbers below are illustrative synthetic design inputs. Final data must form a consistent, reproducible scenario.

| Input | Proposed value |
|---|---|
| Dublin store available stock | 12 units |
| Dublin baseline demand | 8 units/day |
| Dublin stock cover | 1.5 days |
| Scheduled warehouse arrival at Dublin | In 5 days |
| Cork store available stock | 80 units |
| Cork baseline demand | 4 units/day |
| Proposed Cork-to-Dublin quantity | 32 units |
| Transfer arrival | In 1 day |
| Cork remaining stock after transfer | 48 units; 12 days of baseline cover |

Under this simplified baseline, Dublin uses approximately eight units before the transfer arrives, then has approximately 36 units on arrival. That covers the remaining four days until the scheduled delivery. Final feasibility checks must also account for reservations, safety stock, transfer constraints and incoming stock.

The explanation may identify a synthetic local promotion as a demand signal. It must label this as evidence supporting an explanation rather than proof of causation.

The planner compares the transfer with waiting for the scheduled warehouse delivery, reviews the supplying-store impact and approves the transfer request.

**Approval does not mean stock has arrived.** The immediate result is “Transfer approved — mitigation scheduled.” Any improved KPI must represent projected exposure and account for transit time. “Received” requires a separate explicit simulated receipt event. Do not claim actual recovered sales or guaranteed zero risk.

## 8. Proposed two-minute application journey

| Approximate time | What to show | What the audience learns |
|---|---|---|
| 0:00–0:20 | Overview with availability risks and prioritized exceptions | Who the planner is and where attention is needed |
| 0:20–0:40 | Open Dublin hero SKU | The store may run out before the next delivery |
| 0:40–1:05 | Sales, promotion, delivery and stock evidence | Why the exception exists |
| 1:05–1:35 | Compare warehouse and store-transfer options | AI assists investigation; calculations establish feasibility |
| 1:35–1:50 | Review recommendation and approve | The planner retains the decision |
| 1:50–2:00 | Show scheduled mitigation and audit history | The decision becomes a traceable operational request |

This journey should use a small number of clear screens and avoid excessive navigation.

## 9. Proposed application experience

### Overview

Prioritized exceptions; store/category/risk filters; projected revenue exposure; stockout-risk count; excess-stock indicators; recommended actions. Metric definitions and horizons remain to be specified.

### Exception workspace

Product and exact SKU, store inventory, sales trend, incoming deliveries, network stock, evidence references, option comparison, recommendation, constraints and approve/reject controls.

### Action history

Proposed, approved, rejected, dispatched and received states; actor; timestamp; decision reason; simulated inventory effects. Demo reset must restore a known starting scenario.

The application is an operational workspace. Chat may supplement the experience but must not be the only way to complete the journey.

## 10. Established delivery constraints

- Build through GitHub Copilot CLI + Squad.
- Use Azure and Microsoft Foundry with meaningful AI integration.
- Use synthetic data only; no customer data or production-system connections.
- Prefer managed identity for Azure service access where supported.
- Keep secrets, credentials and tenant-specific runtime settings out of version control.
- Parameterize subscription, tenant, region, resource group and names.
- Align Foundry naming logically with the resource group/project.
- Avoid unnecessary private networking and infrastructure complexity.
- Define infrastructure as code and provide reproducible deployment instructions.
- Validate each phase and record evidence in STATUS.md.
- Stop after every phase; never automatically proceed to the next.
- Leave a complete, deployed and validated solution after Phase 3.
- Clearly distinguish live Foundry results, deterministic calculations, simulated operational actions and any offline fallback.

## 11. Candidate live customer changes

1. Add a minimum projected revenue-exposure filter.
2. Add days of cover to the exception table.
3. Change a configurable critical-cover threshold and show updated prioritization.

These changes should be visually obvious, limited to the application, validated with focused checks and redeployed to the same URL. They must not alter authentication, RBAC or foundational AI resources. Specific implementation and reset instructions will later belong in LIVE-DEMO-QUICK-CHANGES.md.

## 12. Out of scope

- Real ERP, POS, supplier or warehouse-system integration.
- Real stock movements or purchase orders.
- Autonomous approval of operational actions.
- Computer-vision shelf monitoring.
- Production-grade forecasting or a full supply-chain digital twin.
- Pricing, markdown and assortment optimization.
- Real-time external weather or competitor-data dependencies.
- Production-scale or guaranteed commercial performance claims.

## 13. Future Phase 3 requirements still requiring explicit authorization

| Section | Required decision or specification |
|---|---|
| Business scenario | Confirm fictional retailer, persona, hero SKU and scope |
| Demo journey | Confirm actions, ending and business-value wording |
| Architecture | Frontend/backend, persistence, orchestration and deployment topology |
| Azure resources | Services, naming, region, subscription/RG inputs, capacity checks and fallback policy |
| Foundry configuration | Supported API/SDK, project setup, model deployment, identity and reproducible configuration |
| Agent design | Justified responsibilities, tool contracts, evidence, structured outputs and error handling |
| Synthetic data | Schema, seed, consistency rules, engineered exceptions and reset behavior |
| Business calculations | Cover, demand estimate, risk horizon, revenue exposure, lead time and donor-stock protection |
| UX | Screens, navigation, loading/error/empty states and visual design |
| Functional requirements | API contracts, validation, approvals, concurrency, idempotency and audit behavior |
| Security | User authentication, authorization, service identity and demo access setup |
| Infrastructure/deployment | IaC, scripts, environment configuration, smoke checks and teardown |
| Testing | Meaningful calculation, workflow, integration and deployed checks |
| Observability | Logs, correlation, AI execution records and sensitive-data handling |
| Documentation | README, setup/deployment, architecture, demo, live changes and troubleshooting |
| Acceptance criteria | Measurable evidence for the complete end-to-end workflow |
| Three build phases | Exact deliverables, dependencies, validation gates and STOP conditions |

The table is retained as future planning context. Phase 2 implementation choices
are documented in the completed execution sections above; any unresolved Phase
3 choices remain unapproved. Do not infer authorization from their inclusion.

## 14. Recording and build contract

The delivery plan uses three substantial phases. Phase 1 and Phase 2 are
complete; the technical boundary and authorization for Phase 3 remain pending.

For each phase, Squad must read this same brief and current STATUS.md, implement only the requested phase, validate its deliverables, record results and STOP. If blocked, record the actual blocker and incomplete work; do not mark the phase successful or continue automatically.

STATUS.md records phase state, deployment resources, application URL,
validations, outcomes, known issues, and the next permitted phase. Never record
secrets.

The final approximately four-minute video will contain: a visual business problem introduction; one approximately two-minute application journey; a short Foundry view; accelerated footage of the three CLI phases; and a concise closing. Detailed speaker notes will be prepared after the application is validated.

## 15. Repository packaging

Target shared repository: github-vteam-industry-demos.

Proposed project path: industries/retail-consumer-goods/inventory-replenishment-command-center/.

Include the finished brief, application source, IaC, seed data, tests and specialist-facing documentation. Exclude nested .git directories, local .squad state, virtual environments, caches, node_modules, compiled artifacts, secrets and machine-specific state. Another specialist must be able to initialize a fresh Squad session and deploy to their own Azure environment.

## 16. Current stop and future next step

Phase 3 is complete and validated. There is no immediate implementation step
authorized. Preserve the deployed controls, final recording state, retained
resources, and rollback assets.

**STOP after Phase 3.** Do not push, delete retained Azure resources, or begin
additional work without explicit authorization.
