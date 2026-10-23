# Infrastructure · preserved live deployment

**Phase 3 COMPLETE, 2026-10-15T14:24:23Z; no active blockers.**
Only the existing app's image/revision changed; architecture, identity, agents
and policies are unchanged. SQLite demo state reset on replacement.
These commands document an existing
deployment; **do not run them merely to demonstrate the application**.

Live: https://ca-high-tech-software-isv-01.gentlebeach-d66a7b07.swedencentral.azurecontainerapps.io

## Current verified configuration

| Setting | Value |
|---|---|
| Subscription | `e2d6ac89-1bb7-420c-97fb-a96dea6c0635` |
| Resource group / region | `rg-high-tech-software-isv-01` / `swedencentral` |
| App / ready revision | `ca-high-tech-software-isv-01` / `ca-high-tech-software-isv-01--0000001` |
| Existing environment | `cae-high-tech-software-isv-01`, Consumption |
| Existing registry | `acrhtisvf4ee1f29.azurecr.io`, Basic; admin disabled |
| Original successful build | ACR `dt2`, tag `phase2-20261015T125951Z` |
| Current CSS build | ACR `dt3`, tag `phase3-20261015T140816Z` |
| Image | `acrhtisvf4ee1f29.azurecr.io/signal-command-center@sha256:46dc1505599ad4b8dfe506a29e0bbe3dadf8f38578cb34b73c4a578fdd7924c9` |
| Runtime | One replica min=max=1; one Uvicorn worker; 0.5 vCPU / 1 GiB |
| Ingress | External HTTPS, target port 8000, anonymous, no user login |
| Probes | HTTP `/api/health`, port 8000; startup/readiness/liveness every 5/10/30 seconds |
| Storage | `/app/data/command-center.sqlite3`; ephemeral, no mounts/volumes |

Phase 3 patch readback confirmed one healthy active revision/ready running
replica with zero restarts; previous revision retained inactive. Complete app
configuration, identity, probes, variables, scale and resources are preserved.
See `phase3-deployment.json`; original journey is `evidence\phase3-validation.json`.
Root/JS/CSS/health/API24 pass. Integration observed the actual deployed
390×844 portfolio at document/client/inner width 390, internal table scroll,
seven accessible headers/24 named open controls; 1440×900 has no overflow.
Compact dashboard/Customer 360 also pass.
SQLite reset was observed: both acct-001 and acct-002 initially returned to seeded
revision 1 without prior results/edits. Integration then prepared **acct-002**
with exactly one new real analyst and one advisor call (26.023 seconds apart),
saved human notes/outreach, accepted/completed action 1, refreshed, inspected
five events and downloaded actual Markdown: revision 6. Both current-process
managed-identity paths now have verification timestamps. Acct-001's old plan
remains historical, not live. Phase 3 total: four generation calls, all successful.
Current evidence: `evidence\phase3-cycle2-validation.json`; response IDs and
screenshots/export: [final report](../PHASE-3-RESULTS.md). Existing evidence files
retain their dated pre-/post-deployment scope; they are not overwritten.
React and FastAPI are served same-origin. The existing UAMI performs both ACR
pulls and Foundry requests; no registry password or API key is required.
Existing ARM API versions: Container App/environment `2025-01-01`, registry
`2023-07-01`, identity `2023-01-31`; Foundry Responses runtime `v1`.

Environment: `AZURE_AUTH_MODE=managed_identity`,
`AZURE_CLIENT_ID=63cf5272-0d17-42ce-ac7d-982d2bb12b71`,
`SQLITE_PATH=/app/data/command-center.sqlite3`, and
`FOUNDRY_PROJECT_ENDPOINT=https://foundry-high-tech-isv-f4ee1f29.services.ai.azure.com/api/projects/proj-high-tech-software-isv-01`.

## Guarded application-only build/update — future authorization required

From repository root in PowerShell. `app.bicep` owns only the app, referencing
the existing registry, identity and environment. Never run old core/store
deployment templates for an app update. Replacement can erase demo edits.

```powershell
$sub = 'e2d6ac89-1bb7-420c-97fb-a96dea6c0635'
if ((az account show --subscription $sub --query id -o tsv) -ne $sub) {
  throw 'Approved subscription unavailable'
}
# Unique UTC tag; explicit allowlisted source-only context, removed by the script.
# Does not upload node_modules, local database, evidence or credentials.
.\scripts\build-phase2.ps1 -Phase phase3
$tag = (Get-Content .\infra\evidence\phase3-build-request.json -Raw |
  ConvertFrom-Json).tag
$digest = az acr repository show --subscription $sub --name acrhtisvf4ee1f29 `
  --image "signal-command-center:$tag" --query digest -o tsv
$image = "acrhtisvf4ee1f29.azurecr.io/signal-command-center@$digest"
az bicep build --file .\infra\app.bicep --stdout | Out-Null
.\scripts\deploy-phase2.ps1 -Image $image -ValidateOnly
az deployment group what-if --subscription $sub `
  --resource-group rg-high-tech-software-isv-01 --mode Incremental `
  --template-file .\infra\app.bicep --parameters "image=$image"
# Only after explicit authorization and review of the app-only what-if:
.\scripts\deploy-phase2.ps1 -Image $image -DeploymentName phase3-css-patch
```

The deployment script verifies the explicit subscription and Sweden Central
resource group, requires this registry/repository's SHA-256 image format, and
validates before incremental deployment. It never calls `az account set`.
Build tags are unique; deployments use immutable digests, never `latest`.
Phase-specific build request/status files preserve old Phase 2 evidence. The
authorized CSS patch is already deployed; these are not a mandate to rebuild.

## Existing narrow metadata-read grant — already applied

App UAMI: `id-high-tech-software-isv-01`; principal
`1a5b6869-b2d3-4a3a-a807-8fda903b97c9`.
Existing AcrPull is registry-scoped; Foundry Project Runtime User and Foundry
Agent Consumer are project-scoped. Custom **High Tech ISV Foundry Agent Metadata
Reader** (`4e676ed6-972a-5ef1-96f8-8f172ea60fc5`) adds only
`Microsoft.CognitiveServices/accounts/AIServices/agents/read` as a data action,
with empty management actions. Provider granularity also encompasses
agent/thread/message reads; it is not an authoring grant.

Role definition availability is RG-wide; assignment
`97d19333-9e76-55b0-8bc7-79ff9931bb0a` is only on the existing Foundry project.
This resolved Phase 2's real metadata-preflight 403 without restarting the app.
**No credentials or role changes are needed for the working deployment.**
The following are historical reproduction/diagnostic commands, not Phase 3 work:

```powershell
.\scripts\deploy-phase2-foundry-read.ps1 -ValidateOnly
# MUTATION: run only with a separate explicit RBAC authorization:
# .\scripts\deploy-phase2-foundry-read.ps1
# Read-only existing-UAMI metadata verification; no model generation:
& 'C:\Program Files\Microsoft SDKs\Azure\CLI2\python.exe' .\scripts\verify-phase2-foundry-read.py
```

## Retained assets and historical audit

`main.bicep`, `persistence.bicep`, `deploy-phase1.ps1` and the Foundry
configuration script are historical setup, **not current update instructions**.
Do not invoke core/store deployment or reconfigure the two working agents.
Storage `sthtisvf4ee1f29` and serverless Cosmos
`cosmos-high-tech-isv-f4ee1f29` are retained, public-network-policy-blocked and
**unused by the app**. No exemption, private networking, new service or deletion
is requested. Historical feasibility/pricing comparisons are not the accepted
architecture or current prices.

SQLite seeds missing stable fictional IDs only and never overwrites existing
edits when the database survives. It is not durable storage or a backup service.
Anonymous visitors share data and process-local AI quotas. One always-on replica
and Basic ACR have ongoing costs; AI is usage-billed, including possibly timed-out
calls. Retained empty serverless Cosmos has no provisioned RU/s; small storage,
backup or other applicable charges can still exist. No verified monthly price
or hard spending cap is promised. See [architecture](../ARCHITECTURE.md),
[Phase 1 history](../PHASE-1-RESULTS.md), [Phase 2 results](../PHASE-2-RESULTS.md)
and [final Phase 3 evidence](../PHASE-3-RESULTS.md).
