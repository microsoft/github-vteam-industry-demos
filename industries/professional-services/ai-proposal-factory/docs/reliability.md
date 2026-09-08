# Review integrity and autonomous durable recovery

Independent Reliability revision for Assurance blockers 4 and 5, September 7, 2026. This is **offline revision evidence, not release approval or proof of an Azure deployment**. Authentication policy, Search bootstrap/filters, PDF rendering, the seeder image entrypoint and Delivery's deployment-response contracts are preserved.

## Exact reviewed-revision approval

### API contract

`POST /api/proposals/:id/sections/:key/approve` requires:

```json
{ "expectedRevisionId": "the-currentRevisionId-displayed-to-the-reviewer" }
```

`POST /api/proposals/:id/approve` requires:

```json
{ "expectedReviewVersion": "the-reviewVersion-returned-with-the-displayed-proposal" }
```

- Missing/empty preconditions return **400**; there is no approve-latest fallback.
- A mismatched section revision or proposal review set returns **409 / STALE_REVIEW**.
- A conditional Azure proposal write losing its ETag returns **412 / STALE_REVIEW**.
- Generation, edits, regeneration and newly recorded section approvals each generate a fresh opaque `reviewVersion`. Full regeneration preserves proposal identity but changes its review set. Numeric section revision numbers and IDs remain immutable.
- Complete approval checks the version **before** checking whether all sections are approved. Another client's edit/regeneration followed by reapproval therefore cannot make an old complete-approval request valid.
- Complete approval records `approvedReviewVersion` without changing the reviewed set, so exact retries are idempotent. An already-approved section retry does not regress an approved proposal to In Review.
- Pre-upgrade snapshots receive a deterministic SHA-256 review token over their stored state on read, without GET writes. Subsequent mutation persists a normal fresh version. No timestamp-only versioning or automatic approval of legacy content is used.
- Default local IDs include UUIDs so two application clients cannot reuse a revision ID merely by generating it in the same millisecond.

### Mutation boundaries

**Local:** applications sharing one `ApplicationStore` use the same per-opportunity mutation queue. The protected read, revision comparison, proposal save and audit publication run inside it. Local edits, regeneration, generation submission/publication and approvals share that boundary. Local JSON storage remains a **single-process** demo backend, not a distributed file database; use Azure storage for multiple processes/replicas.

**Azure:** the existing renewable opportunity-scoped Cosmos lease is acquired before the protected read and comparison. Each mutation retains the ETag read in its own async scope. Proposal/opportunity writes renew/assert lease ownership immediately before conditional `IfMatch` writes. Lease loss prevents writing; a concurrent external proposal replacement produces 412, never a retry that silently approves the newer content. Existing durable-generation guards remain in place.

### Audit and retries

Approved section revisions persist `approvedAt` and `approvedBy` from the authenticated request context. Complete approval persists its actor and reviewed-set version. Audit IDs are deterministic per proposal/revision approval:

- Section Approved metadata: `section`, exact `revisionId`, numeric `revision`.
- Proposal Approved metadata: `reviewVersion`, `sectionRevisions` (JSON array of section keys, exact IDs and numeric revisions).

The first authenticated approving actor and timestamp survive retries from another authenticated user. Caller-supplied actor fields are ignored. Audit append is idempotent; a retry can repair an interrupted approval audit publication without duplicating events. Proposal, opportunity and audit publication are not a cross-Cosmos-container transaction. Recovery of an interrupted approval publication is tested with an exact same-revision retry; no claim of cross-container transactional atomicity is made.

### Browser behavior

The browser sends the revision ID/version from the displayed proposal, not a freshly fetched unreviewed snapshot. After a stale conflict it keeps approvals disabled and displays **Refresh proposal for review**. Refresh replaces the displayed snapshot and requires a new explicit approval; it never auto-retries approval. Opening a section editor disables complete approval until edits are saved or cancelled.

## Empty-queue recovery topology

**Chosen solution: deliberately retain one existing Container Apps worker replica.**

`infra\modules\container-apps.bicep` keeps the worker in **Sweden Central**, Consumption, 0.5 vCPU/1 GiB, `minReplicas: 1`, `maxReplicas: 3`, with the existing managed-identity Azure Queue scaling rule. No second region, dispatcher service, scheduler identity or new cron job is added.

The worker loop:

1. Scans the persisted outbox immediately on process startup, even at zero queue depth.
2. Receives/handles available work.
3. While idle, receives every second and scans again every 30 seconds.
4. Logs sanitized scan/transport failure codes, then retries instead of abandoning the consumer.
5. Rescans after the current message finishes if the interval elapsed. Long generation can delay the next scan; the cadence is not a 30-second completion guarantee.

Persisted-undispatched records therefore recover after an enqueue failure and API/worker restart **without an API request, manual dispatcher call or unrelated queue message**. A crash after send but before recording `dispatched` can enqueue twice. Existing immutable snapshots, renewable fenced Cosmos checkpoints, queue visibility renewal, retry/poison handling and deterministic completion-last publication remain authoritative. A permanently unavailable backing service still requires operator repair; one retained replica is not multi-zone high availability.

### Cost/reliability tradeoff

Keeping the existing process alive is the simplest robust demo solution, at the cost of continuous allocated compute and regular Cosmos/Queue operations. Budget for **active** Consumption usage; do not assume polling qualifies for reduced idle billing. Microsoft documents reduced idle rates only under specific minimum-replica, CPU and network conditions. No price, quota, deployment availability or free-tier coverage is promised. A scheduled reconciler could reduce duty cycle, but adds an independently managed workload, schedule/identity configuration and recovery latency.

Primary documentation checked September 7, 2026:

```text
https://learn.microsoft.com/en-us/azure/container-apps/billing
https://learn.microsoft.com/en-us/azure/container-apps/scale-app
```

### Deployment/source validation

- `scripts\azure\test-worker-liveness.ps1`: offline retained-replica/queue-identity/runtime-wiring assertions, including absent/null/zero/string/boolean minimums and missing identity.
- `scripts\azure\validate-container-sources.ps1`: retains Delivery's source/image entrypoint checks and adds the liveness test.
- `.github\workflows\ci.yml`: infrastructure liveness validation plus existing non-skippable Linux image jobs.
- `scripts\azure\validate-worker-liveness.ps1`: additional **read-only, post-deployment** worker configuration/ready-revision replica-presence check.
- `.github\workflows\deploy-dev.yml`: invokes that additional check after the original deployment validator. The original `deployment-validation-contract.ps1`, its tests and `validate.ps1` are unchanged.

## Reproducible offline checks

```powershell
npm run test -w @proposal-factory/api -- test/review-concurrency.test.ts test/outbox-recovery.test.ts test/ai-azure-integration.test.ts
npm run test -w @proposal-factory/web -- test/review.test.tsx
npm run test -w @proposal-factory/domain
npm run test -w @proposal-factory/worker
npm run check
az bicep build --file .\infra\main.bicep --stdout 1>$null
az bicep lint --file .\infra\main.bicep
az bicep build-params --file .\infra\parameters\dev.swedencentral.bicepparam --stdout 1>$null
.\scripts\azure\validate-container-sources.ps1
.\scripts\azure\test-deployment-validation-contract.ps1
.\scripts\azure\test-auth-contract.ps1
node .\scripts\test-review-browser.mjs
node .\scripts\test-durable-recovery.mjs
node .\scripts\auth-smoke.mjs
node .\scripts\test-pdf-export.mjs
```

Browser/PDF smokes require the existing Chromium/Edge runtime described in `exports.md`. No dependencies were added for this revision.

`test-review-browser.mjs` runs the **built** API and built web assets through a loopback Node proxy. Real browser clients generate, edit, regenerate, reject stale section/complete approvals, explicitly refresh, approve, download Markdown/PDF and open audit. It also restarts the built API and verifies persisted approval/idempotent retry. It uses explicit local development auth; the separate built auth smoke exercises the synthetic trusted-header boundary without modifying policy.

`test-durable-recovery.mjs` runs **three actual Node processes** over a file-backed offline Cosmos/Queue boundary: API persists an immutable outbox record after enqueue fails with queue depth zero; a built worker autonomously dispatches and exits after send-before-marker failure; a restarted built worker duplicates dispatch, performs model analysis once, publishes proposal/audit before completion and acknowledges both deliveries. Only the submission phase uses source API composition through the already-installed `tsx` loader; recovery uses built worker/runtime bundles. This is not an Azure SDK network/emulator test.

Artifacts are written beneath `.data\reliability`: `browser-results.json`, `durable-results.json`, stale-conflict screenshots and approved sample exports. Isolated smoke state/processes are removed after execution. A durable file/hash manifest and validation summary are also retained under `.squad\agents\reliability\audit\2026-09-07`.

## Remaining release gate

Assurance must independently re-review this revision. No Azure resources were provisioned, no commit was created, and no destructive Git operations were run. Live Entra identity, Azure services/RBAC, Sweden Central quota/capacity, final Linux images/Nginx behavior, deployed idle-worker recovery/renewal and the complete deployed browser workflow remain unverified. Passing offline checks does **not** clear the global release gate.
