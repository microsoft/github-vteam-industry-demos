# Project status

## Phase 3 final integration and deployment — PASSED

Final validation timestamp: `2026-10-06T17:57:36+01:00`

Phase 3 is complete on the existing Norway East Container App and unchanged
anonymous HTTPS URL:
`https://ca-retail-consumer-goods-ne-02.thankfulocean-b1b09e44.norwayeast.azurecontainerapps.io`.

### Final image and revision

- Image:
  `acrretailconsumergoods01.azurecr.io/inventory-command-center:phase3-final-20261006-1724`
- Digest:
  `sha256:2d687dae8de0bd595cc7db92b18f852d267c706266ee16cd3e976f84521f3071`
- ACR build `dtf`: `Succeeded`.
- Revision `ca-retail-consumer-goods-ne-02--0000004`: `Healthy`, active,
  one ready replica, and 100% traffic; scale remains 1/1.
- HTTPS ingress disallows insecure transport. Anonymous `/` returned HTTP 200
  without redirect, `Set-Cookie`, login, or browser-storage requirements.

### Integrated and live validation

- Local `npm ci`, seed, typecheck, 149 Vitest tests in nine files, backend/SPA
  production build, and Playwright 2/2 passed.
- Local and final live Playwright passed actual UI-click reject/reset and
  approve/dispatch/receipt/history/reset branches plus widths 320, 360, 375,
  768, 1024, 1280, and 1440. Controls were visible, enabled, focusable, and in
  viewport; there was no document overflow or lingering skeleton.
- The first live width run produced an explicit retryable 503 when the platform
  restarted the replica after one-second probe timeouts. Azure-owned Bicep now
  configures five-second readiness/liveness timeouts and six failures before
  failure. The complete live matrix passed afterward, and telemetry recorded
  zero probe failures after the fix.
- Exact live hero evidence passed: Dublin 12 units, 8/day, 1.5 cover days,
  inbound day 5, shortage 28; Cork quantity 32, day-1 arrival, donor floor 28,
  48 retained, and 12 donor cover days.
- Both live Foundry agents returned `available`, remained grounded to supplied
  evidence/options, selected the canonical Cork option, included exactly one
  promotion non-causation caveat, and emitted no unsupported causal wording.
  Honest AI-unavailable behavior passed automated integration coverage. A
  stable live client received HTTP 429 with `Retry-After`.
- Live stale ETag returned 409, reused idempotency key with a different request
  returned 422, and concurrent approval/rejection returned one 200 and one 409.
  The received quantity-32 action and four audit entries survived a controlled
  revision restart, proving Blob persistence.
- Origin denial, spoofed identity/role denial, rate limits, immutable synthetic
  actor, canonical audit, reset, private Blob DNS/endpoint, and managed-identity
  ACR/Blob/Foundry access passed.

### Infrastructure, security, and telemetry

- Both Bicep templates build; all infrastructure PowerShell parses.
- Azure validation passed. Final detailed what-if had zero resource creates,
  deletes, or replacements and no security weakening.
- Deployment now discovers and preserves both policy-injected subnet NSGs.
- Storage remains public-network disabled, shared-key disabled,
  Blob-public-access disabled, OAuth-default, TLS 1.2, and network default deny.
  The private endpoint is approved. Container App secrets remain absent.
- Current Log Analytics evidence in the measured 20-minute window contained
  five console and 93 system records; latest records were
  `2026-10-06T16:51:08Z` and `2026-10-06T16:51:22Z`.

### Portable clean export

The final fresh session export passed required inclusion/exclusion checks,
clean `npm ci`, typecheck, unit/integration/full Vitest, production build, both
Bicep builds, and PowerShell parsing. The clean package remains free of Git,
Squad/Copilot/editor state, `node_modules`, `dist`, reports, caches, logs,
credentials, unsafe environment files, and local application state. No GitHub
push occurred.

### Final recording state and limitations

Final UI proof at `2026-10-06T17:53:03+01:00`, followed by the definitive API
recheck at `2026-10-06T17:57:36+01:00`, showed zero actions, zero audit entries,
unchanged hero values, zero active actions, Overview landing, two idle `Run AI`
controls, no active mitigation, no loading skeleton, no document overflow, and
no cookie/local-storage state.

The demo remains synthetic and single-replica; workflow actions do not move real
stock. AI-unavailable behavior was validated by automated tests rather than by
deliberately disrupting the healthy live Foundry deployment. Process-local
limits are appropriate only while the approved one-replica topology is
preserved.

No retained Azure resource was deleted. No commit or push was created.

Lead follow-up: README/architecture links may point to
`docs/LIVE-DEMO-QUICK-CHANGES.md`, while the actual file is root
`LIVE-DEMO-QUICK-CHANGES.md`.

**STOP: PHASE 3 PASSED. Do not push, delete retained Azure resources, or begin
work beyond Phase 3.**

## Phase 2 public-demo access — PASSED

Last validated: 2026-10-06

The authorized anonymous public-demo change is deployed and validated on the
existing Norway East Container App and unchanged URL:
`https://ca-retail-consumer-goods-ne-02.thankfulocean-b1b09e44.norwayeast.azurecontainerapps.io`.
Direct anonymous HTTPS returns HTTP 200 with no Microsoft redirect, login cookie,
or browser storage requirement. Phase 3 was not started.

### Image, revision, and access

- Image:
  `acrretailconsumergoods01.azurecr.io/inventory-command-center:phase2-public-demo-causation-guard-v4-20261006-1612`
- Digest:
  `sha256:ce5421b049c1c10ea822e7bed184b96eea773b119ca74de1b09bbda91ba99e24`
- ACR build `dte`: `Succeeded`.
- Revision `ca-retail-consumer-goods-ne-02--guardrailv4r4`: `Healthy`,
  active at 100% traffic, one ready replica, scale pinned 1/1.
- Container Apps Easy Auth is disabled and anonymous access is allowed. The
  unused Container App secret and matching Entra credential are absent.
- The Entra application, two roles, two callbacks, service principal, and
  authenticated rollback script remain retained.

### Public behavior and workflow

- Fresh Playwright Chromium contexts passed locally and against the deployed
  URL with no cookies or local storage.
- The server always returned `anonymous-public-demo` /
  `Anonymous Public Demo Actor (synthetic)`, role `planner`, kind
  `public-demo`, `authenticated=false`, even with spoofed cookies and
  identity/role headers.
- The hero values, canonical Cork transfer, simulated
  propose/approve/dispatch/receive, canonical audit text, terminal
  reset-required behavior, reset, and non-hero mutation rejection passed.
- Both persisted Foundry agents returned `available`; investigation returned
  grounded evidence and recommendation selected the canonical Cork option.
- When promotion evidence is supplied, both validated AI responses now include
  the canonical text `Promotion is supporting evidence, not proof of
  causation.` exactly once, in the applicable caveat/tradeoff collection.
  After schema and evidence/option validation, bounded clause-level
  normalization neutralizes direct and implicit causal wording across every
  generated natural-language field. This includes `contributed to`,
  `attributed/attributable to`, `created`, `generated`, and `explains/explained`
  variants when promotion evidence is connected to an inventory or commercial
  outcome. Context checks preserve legitimate statements about creating a
  promotion or generating a report. IDs, grounded evidence/options, and
  non-causal clauses are unchanged; no second model call or fabricated evidence
  is introduced.
- All eight schema-valid model caveats/tradeoffs are preserved and the
  canonical caveat is appended as the ninth item. Inputs beyond the existing
  eight-item model bound still fail schema validation before rewriting; no
  valid item is silently truncated.
- An honest shared AI retry state was validated in the browser. On a stable
  keep-alive client path, calls 1–6 returned HTTP 200 and call 7 returned HTTP
  429 with limit `6`, remaining `0`, `Retry-After`, and `no-store`; action state
  and ETag were unchanged. A clean three-call concurrency run returned two
  successes and one HTTP 429 with `Retry-After: 1`.

### Security, persistence, and validation

- Exact-origin JSON mutation checks returned HTTP 403 for invalid origins; CORS
  response headers were absent.
- Internal and external health returned HTTP 200. Blob DNS resolved through
  `privatelink.blob.core.windows.net` to private IP `10.60.0.36`.
- The received workflow persisted through a revision restart and returned
  quantity 32 with four audit events. Final shared state was reset to zero
  actions and zero audit entries.
- Storage remains public-network disabled, shared-key disabled, Blob public
  access disabled, and network default deny. The private endpoint remains
  approved. ACR, Blob, and Foundry access remain managed-identity based.
- The independent revision passed 113 focused Foundry tests, 145 Vitest tests in
  8 files, typecheck, deployment-checker syntax validation, and the production
  backend/SPA build.
- The guardrail revision live check returned anonymous HTTP 200 with no redirect
  or cookie. Both agents were schema-valid and grounded, had no unsupported
  promotion-causation wording in any generated field, and contained exactly one
  canonical caveat each. The recommendation retained the canonical Cork option.
  The anonymous propose/approve/dispatch/receive workflow produced four audit
  events and was reset afterward.
- Fresh anonymous HTTPS returned HTTP 200 with no redirect or `Set-Cookie`.
  Easy Auth remained disabled; Storage remained public-network disabled,
  shared-key disabled, Blob-public-access disabled, and default deny.
- No infrastructure changed, so no new Bicep build, validation, or what-if was
  required for this runtime-only revision.
- Log Analytics contained 248 console and 254 system records in the measured
  two-hour window; the latest console record was observed at
  `2026-10-06T14:07:36Z`.

## Previous deployed Phase 2 baseline — PASSED

### Working application

- URL: `https://ca-retail-consumer-goods-ne-02.thankfulocean-b1b09e44.norwayeast.azurecontainerapps.io`
- Anonymous `/` and `/api/v1/bootstrap` requests return HTTP 302 and redirect to Microsoft Entra.
- Existing and replacement callback URIs are both registered; no previous redirect was removed.
- Microsoft Entra app roles remain `Inventory.Planner` and `Inventory.Viewer`.
- Backend and UI now enforce Planner-only propose, approve, reject, dispatch, receipt, and reset.

### Actual Azure resources

| Resource | Location | Result |
|---|---|---|
| `vnet-retail-consumer-goods-ne-01` | Norway East | `Succeeded`; `10.60.0.0/26` |
| `snet-containerapps-infra-ne-01` | Norway East | `10.60.0.0/27`; delegated only to `Microsoft.App/environments` |
| `snet-private-endpoints-ne-01` | Norway East | `10.60.0.32/28`; private endpoint policies disabled |
| `cae-retail-consumer-goods-ne-02` | Norway East | `Succeeded`; workload profiles; Consumption; external; custom VNet |
| `ca-retail-consumer-goods-ne-02` | Norway East | `Succeeded`; latest revision healthy and 1/1 ready |
| `pe-stretailconsumergoods01-blob-ne-01` | Norway East | `Succeeded`; Blob connection `Approved`; private IP `10.60.0.36` |
| `privatelink.blob.core.windows.net` | Global | VNet link and `pdzg-blob` zone group succeeded |
| `stretailconsumergoods01` | Norway East | Public network disabled; shared key disabled; OAuth default; network default deny |

Subscription-visible address spaces were `10.42.0.0/16` and `10.20.0.0/16`;
no peerings or visible on-prem prefixes overlapped `10.60.0.0/26`, so the
approved CIDR required no deviation.

### Image and revision

- Image:
  `acrretailconsumergoods01.azurecr.io/inventory-command-center:phase2-private-20261006-final2`
- Digest:
  `sha256:450464a0e35db7d5b246aed898df6db78508e8938ba7690dfbf57b984f0e5273`
- ACR build: `dt6`, `Succeeded`
- Revision: `ca-retail-consumer-goods-ne-02--final2`
- Readiness: `1/1`; liveness and readiness returned HTTP 200 inside the replica.
- Startup log confirmed binding to `0.0.0.0:8080`.

### Private networking and persistence evidence

- Replica DNS resolved the public Blob hostname through
  `stretailconsumergoods01.privatelink.blob.core.windows.net` to `10.60.0.36`.
- Managed-identity Blob reads made readiness healthy.
- The deployed application wrote a complete proposed → approved → dispatched →
  received workflow and read it back after both a new revision and a revision
  restart.
- Persisted validation showed quantity 32, received state, and four audit events.
- Reset then restored deterministic state successfully.
- `Storage Blob Data Contributor` remains assigned to the existing user-assigned
  identity. ACR pull and Foundry access also remain identity-based.

### Application and Foundry validation

- Deployed bootstrap returned eleven locations: ten stores and one warehouse.
- Hero values: SKU `HL-KNT-EVD-FGN-M`, Dublin 12, 8/day, 1.5 days cover, Cork
  transfer 32.
- Deployed workflow reached clearly simulated approved, dispatched, and received
  states.
- Persisted `Inventory Investigation` returned `available` with grounded evidence.
- Persisted `Replenishment Recommendation` returned `available` and selected
  `store-02:exception:store-01:HL-KNT-EVD-FGN-M`.
- The existing `Foundry Agent Consumer` assignment was preserved. A project-scoped
  `Foundry User` assignment was added after the live runtime returned HTTP 403;
  the least-privilege consumer role alone did not authorize this Responses API
  invocation in the current service behavior.
- Honest AI-unavailable behavior remains covered by automated tests.

### Build, preview, tests, and telemetry

- Bicep build/lint: passed.
- Azure resource-group validation: passed.
- Policy/provider preflight: passed.
- Final what-if: nine creates before deployment, secure reconciliation deploys,
  no deletes, old apps/environments ignored, and no public-network enablement.
- Typecheck, 17 Vitest tests, production backend/SPA build: passed.
- Playwright Chromium journey: 1 passed.
- Tests cover ETag 409, idempotency 422, Planner-only transitions, reset, and AI
  unavailable behavior.
- Norway Log Analytics returned 84 replacement-app console records in the
  validation window, including current startup/runtime telemetry.

### Retained resources and boundary

No old resource was deleted. Retained resources include:

- Sweden Central `cae-retail-consumer-goods-01` and all Sweden foundation resources.
- Norway East `cae-retail-consumer-goods-ne-01`.
- Norway East blocked app `ca-retail-consumer-goods-01`.

Container App inventory confirms both applications are in Norway East; no
Container App workload is deployed in Sweden Central.

**STOP: Phase 2 PASSED. Phase 3 was not started.**
