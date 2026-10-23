# Signal · AI Customer Success Command Center

Turn scattered SaaS customer signals into explainable renewal priorities and
human-reviewed next steps. Signal combines a 24-account fictional portfolio,
transparent health scoring, and **two real Microsoft Foundry agents** in one
React/TypeScript + FastAPI application.

**Live demo:** https://ca-high-tech-software-isv-01.gentlebeach-d66a7b07.swedencentral.azurecontainerapps.io

**Phase 3 COMPLETE — 2026-10-15T14:24:23Z.** Patched live portfolio passes
390×844 (document/client/inner width all 390, internal table scrolling and seven
accessible headers); desktop 1440×900 and compact dashboard/Customer 360 pass.
Current-revision real managed-identity analyst/advisor, human save, accept/complete,
refresh, history and actual Markdown download pass. No active blockers.
See [final results and fresh response IDs](PHASE-3-RESULTS.md).

Current revision `ca-high-tech-software-isv-01--0000001`, ACR run `dt3`, image
digest `sha256:46dc1505599ad4b8dfe506a29e0bbe3dadf8f38578cb34b73c4a578fdd7924c9`.
The one-rule CSS fix preserves architecture/resources. Replacement actually reset
SQLite: old plans/edits are historical only. **Cobalt Cloudworks (`acct-002`) now
has a new real saved plan**, human-reviewed outreach/notes, completed action 1,
revision 6/five events. Both current-process AI paths are verified. Phase 3 used
four generation calls total (two before replacement, exactly two after), all
successful. Public shared state can change after this observation.

## What to explore

- Executive overview: revenue exposure, upcoming renewals, usage and health charts.
- Portfolio: customer/owner/industry search, health/owner/plan filters and sorting.
- Customer 360: usage, support escalation, renewal context and scoring breakdown.
- Real risk analysis, followed by an advisor using that actual stored analysis.
- Editable outreach and plan notes; accept/complete recommendations; UTC history.
- Markdown download containing saved edits, action states and AI provenance.

**Synthetic data · public anonymous access · shared state.** Never enter real
customer information. Any visitor can edit the same accounts and invoke AI.
SQLite is **ephemeral container-local storage**: refresh retains changes while
the database survives; restart, replacement or deployment may lose them.
There is no promised backup, login, durable persistence or production readiness.
ARR at risk is ARR in the high-risk **illustrative heuristic band**, not an
expected-loss estimate or trained churn prediction. Outreach is never sent;
completion only records a visitor's assertion, not an executed business action.

## Local quickstart — PowerShell

Requires Python 3.13+ and Node 24 (or Node 22.12+).

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r .\backend\requirements.txt
npm --prefix frontend ci
npm --prefix frontend run build
$env:SQLITE_PATH = "$PWD\.local-data\command-center.sqlite3"
.\.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Open `http://127.0.0.1:8000`. For hot-reload frontend development, in another
PowerShell terminal run `npm --prefix frontend run dev`; Vite proxies `/api`
to port 8000. Stop local servers when finished.

Build and focused local checks (no Azure model calls):

```powershell
npm --prefix frontend run build
.\.venv\Scripts\python -m unittest backend.tests.test_core -v
```

These are development commands, not a claim that a deep test suite ran in Phase 3.

## Real AI configuration — no keys

Project:
`https://foundry-high-tech-isv-f4ee1f29.services.ai.azure.com/api/projects/proj-high-tech-software-isv-01`

Agents `customer-churn-risk-analyst:1` and `retention-strategy-advisor:1` use
`gpt-4.1-mini` through **Foundry REST `api-version=v1` / OpenAI Responses**.
The backend uses `azure-identity==1.26.0` and `httpx==0.28.1`; it validates the
existing version/model/schema before invocation and saves only completed,
schema-valid output. Schemas: `scripts\foundry-agent-definitions.json`.

The live app uses `AZURE_AUTH_MODE=managed_identity`, existing UAMI client ID
`63cf5272-0d17-42ce-ac7d-982d2bb12b71`, scope `https://ai.azure.com/.default`,
and `SQLITE_PATH=/app/data/command-center.sqlite3`. No client-side credentials
or automatic user-token fallback. Existing working identity grants need no changes.

For **local development only**, an already authorized Azure CLI login can be
explicitly selected before starting the backend:

```powershell
$env:AZURE_AUTH_MODE = 'azure_cli'
```

This credential pins subscription `e2d6ac89-1bb7-420c-97fb-a96dea6c0635`
without changing the shared CLI default. Missing credentials produce visible
errors; there is **no simulated AI fallback**. Data/UI can still be explored.

AI calls can take up to 110 seconds. Wait **at least 25 seconds between request
starts for the same account**, including after failed attempts. Process-local
limits are two concurrent calls, one per account, 40 attempts/hour and 150/day.
They reset on process restart and are **not a durable spending cap or abuse
protection**. Remote timed-out calls can still incur charges.

`GET /api/health` checks SQLite and account count without calling a model.
Its `runtime_verified_this_process` timestamps record successful paths in the
current process, not a guarantee the next request will succeed.

## Handoff

- [Three-minute demo](DEMO-GUIDE.md) — exact clicks, account choices, honest fallback.
- [Architecture](ARCHITECTURE.md) — data flow, resources, RBAC and limitations.
- [Deployment instructions](infra/README.md) — guarded source-only build and digest pinning.
- [Ten optional future Copilot improvements](DEMO-EXTENSIONS.md) — not implemented.
- [Phase 3 results](PHASE-3-RESULTS.md), [current smoke evidence](infra/evidence/phase3-cycle2-validation.json)
  and [current deployment](infra/phase3-deployment.json).
- Historical [Phase 1](PHASE-1-RESULTS.md), [Phase 2](PHASE-2-RESULTS.md),
  [deployment snapshot](infra/phase2-deployment.json) and
  [application handoff](infra/phase2-app-handoff.json).

Exactly the existing three development specialists were retained. No further
phase, deployment, resource recreation, commit or push is implied by this handoff.
