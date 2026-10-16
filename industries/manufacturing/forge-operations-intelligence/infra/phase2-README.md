# Phase 2 deployment — SQLite amendment

## Current outcome: Phase 2 working and verified; stop before Phase 3

Existing public HTTPS URL:

<https://ca-manufacturing-01.ambitioussky-87dc9783.swedencentral.azurecontainerapps.io>

Azure-side build **dt5** succeeded on **2026-10-15**, publishing:

```text
acrmanuf01lk45yoce5uq3i.azurecr.io/manufacturing-command-center@sha256:f3fb0115bc3e9d308f7d829ca81d83bd05d063f46b5996eb05ad2231c4c4e0ac
```

Tag: `phase2-20261015211444`; revision: `ca-manufacturing-01--0000003`.
Anonymous root, actual built JS/CSS, SPA deep link, both health routes and state
returned HTTP 200. Missing API/static paths returned 404. Seed counts are **3
sites / 6 lines / 18 machines / 24 incidents / 72 telemetry readings**.
Health reports `storage=sqlite`. The sole active revision is Healthy /
RunningAtMaxScale; its single container is running, ready and started.

The running container's **ManagedIdentityCredential**, explicitly selecting
client ID `87b58205-bb32-45a0-82f9-56545fd08738`, successfully read both pinned
Foundry agent definitions at `2026-10-15T21:20:26.065122+00:00`. This was execution
inside the actual app container, not CLI-principal substitution. Process
inspection confirms runtime UID **10001**, port **8000**, **one Uvicorn worker**.
**Zero inference calls** were made by the deployment script. Integration then
used the deployed UI/API for two sequential real calls at 21:22–21:24 UTC:
Downtime used 428 input / 201 output tokens; Maintenance consumed its actual
saved investigation and used 430 / 119 tokens. Both completed schema-valid,
with mandatory human review and maintenance `approved=false`. Browser note/plan
save and reload, meaningful history and the server's 409 unapproved-transition
gate passed. See `..\PHASE-2-HANDOFF.md` and
`integration-phase2-live.json` for exact response IDs and results. No direct
CLI-principal inference was substituted.

`phase2-config.json` and `phase2-deployment-evidence.json` contain exact image,
build, revision, URL, runtime environment, response hashes/counts, replica state,
identity checks and actual observation timestamps. Treat those observations as
point-in-time checks, not continuous monitoring.

## Approved persistence lifecycle

The explicit user amendment supersedes the original durable Blob/Table
requirement: **local SQLite at `/app/data/manufacturing.db`**, writable by UID
10001, is the only application state store. Initialization atomically seeds only
an absent database. Browser refresh preserves edits, approvals, history, jobs,
cooldown and budget in the same database.

**Container restart/replacement may reset all state, including AI budget and
cooldown. This is not durable cloud storage.** A new database starts with a
65-second AI quiet window; this reduces rollout overlap but does not coordinate
separate container filesystems. Do not scale out or run parallel app copies.
No Blob migration, volume/service or new persistent storage was introduced.

The existing storage account remains **publicNetworkAccess=Disabled**, shared
keys and anonymous Blob access disabled. It is unused and untouched. Phase 2
deploy/verify neither writes its network settings nor checks Blob readiness.
Existing storage/RBAC resources are retained. **Do not run Phase 1 reconciliation**
to deploy this app or attempt policy changes/exemptions/private networking.

## Existing infrastructure reused

- Existing RG `rg-manufacturing-01`, subscription
  `e2d6ac89-1bb7-420c-97fb-a96dea6c0635`, tenant
  `fe482aee-20fd-4a0f-8ecd-1db718a7eb6f`; all seven existing resources in
  `swedencentral`. No subscription switch, service creation or deletion.
- Existing Basic ACR `acrmanuf01lk45yoce5uq3i`, admin disabled; existing UAMI
  `id-manufacturing-01` with unchanged registry-scoped AcrPull.
  `phase2-registry.bicep` retains the original IaC; reruns use read-only registry
  validation instead of reconciling registry/RBAC.
- `phase2-app.bicep`: existing Consumption app/environment, existing UAMI,
  external anonymous HTTPS, Single revision, port 8000, **min=max=1**,
  0.25 CPU / 0.5 GiB, 120-second graceful termination; probes read real SQLite.
- Existing Foundry project, Standard capacity-1 mini model and pinned
  `downtime-investigation-agent:1` / `maintenance-advisor-agent:1` unchanged.
  No quota, model, agent-definition, networking or permission modifications.

Basic ACR, quick builds/image storage and the warm single replica incur charges.
Inference remains usage-billed. No premium registry, paid build pool or new
service was introduced.

## Repeat operations (explicit build/app writes)

From the repository root with the existing Azure CLI session:

```powershell
python -m unittest discover -s scripts -p test_phase2.py -q
az bicep build --file infra\phase2-app.bicep --stdout 1>$null
python scripts\phase2_deploy.py registry
python scripts\phase2_deploy.py build
python scripts\phase2_deploy.py deploy
python scripts\phase2_deploy.py verify
python scripts\phase2_deploy.py identity
```

`registry` is read-only. `build` privately uploads the explicit staged allowlist
to the existing ACR, performs one bounded Azure quick build and saves its immutable
digest. No local Docker engine is required. Git/Squad/session state, `.env`,
dependencies, databases and unrelated infra are excluded. CLI intermediate
archives stay in ignored project-local `.build-cache`; staged source is removed.
The image build now checks actual Foundry SDK/identity imports and caches the
tokenizer. `deploy` applies **only the app template**, incrementally, pinned to
the digest. SQLite environment configuration is supplied by Bicep; no storage
environment variables are sent to the app.

`verify` makes no inference or mutations: it checks root/deep link, actual
referenced JS/CSS, health/state, expected 404s, digest, UAMI/env/auth, ready replica
and Single revision. Allow rollout deprovisioning to finish before rerunning if
two revisions are briefly reported active. `RunningAtMaxScale` is normal for the
prescribed max-one topology. Azure resource IDs are compared case-insensitively.

`identity` uses Azure CLI only to open an exec transport to the current deployed
image. Inside that container it uses the application's managed-identity factory
and reads both pinned agent versions; no token is printed or persisted and no
generation is performed. Its compact encoded command avoids the exec gateway's
long-command URL limit. It also records PID 1's command and runtime UID.

All actions guard the current subscription, tenant and RG location; none switches
accounts. Do not treat ARM Succeeded, health or definition reads as inference
success.

## Preserved historical attempts

Evidence retains the original **dt1** build failure (Windows dependencies in the
first build context), **dt2** deployment/Blob startup failure and enforced
`StorageAccount_PublicNetwork_Modify` policy observations. The policy conflict
is historical for this app, not a current SQLite readiness blocker; no bypass
or exemption was made.

First SQLite build **dt3** served the UI/state successfully but a non-inference
runtime definition read exposed `ModuleNotFoundError: httpx`. It was test-only
despite the Foundry SDK importing it. The minimal fix moved `httpx` to runtime
requirements and added the Docker build import check. **dt4** then verified both
definitions using the real app UAMI. Historical readiness, build/deployment and
failure observations are retained under `historicalAttempts`.

Integration's **dt5** adds service-reported token usage to persisted attribution;
the prior healthy dt4 revision is retained as historical evidence. The first
dt5 readiness check briefly observed the old revision deprovisioning; all HTTP
checks passed, and a settled read confirmed one active healthy revision.
No model/agent/quota/permission changes or new resources were needed.

For bounded diagnostics, inspect only the named run/current revision:

```powershell
az acr task show-run -g rg-manufacturing-01 -r acrmanuf01lk45yoce5uq3i --run-id <buildId>
az acr task logs -g rg-manufacturing-01 -r acrmanuf01lk45yoce5uq3i --run-id <buildId>
az containerapp logs show -g rg-manufacturing-01 -n ca-manufacturing-01 --type system --tail 20
az containerapp logs show -g rg-manufacturing-01 -n ca-manufacturing-01 --type console --tail 20
```

## Integration boundary — Phase 2 only

Integration owns `PHASE-2-HANDOFF.md` and the required two real deployed-API
calls. That handoff still describes the prior blocked attempt until Integration
updates it; use this current deployment evidence for the SQLite continuation.
No deployed inference, edit/approve workflow or browser rendering is claimed by
this deployment verification.

Preserve shared **1 RPM / 1,000 TPM**, sequential execution, at least **65 seconds
after completion**, 12 attempts per UTC day, 970-token admission ceiling, adaptive
300–450 output tokens and zero automatic inference retries. These are backend
constants, not environment controls. Use the real deployed API and inspect
nonempty schema-valid content, attribution and saved job/history state.
Storage health alone explicitly does not establish AI connectivity.

No Phase 3, commits or Git pushes are included.
