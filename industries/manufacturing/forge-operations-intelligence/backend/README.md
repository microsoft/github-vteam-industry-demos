# Phase 2 application deployment contract

One origin, one Linux container, port **8000**. No Azure changes are made by the
application. Azure-AI owns image publishing, Container App configuration and
deployment; Integration owns deployed inference verification.

```powershell
docker build -t manufacturing-command-center:phase2 .
docker run --rm -p 8000:8000 manufacturing-command-center:phase2
```

The second command initializes SQLite automatically, but real AI calls require
managed identity connectivity and are intended for Azure, not unauthenticated
local Docker. No in-memory storage or fake AI fallback exists.
Container command: `uvicorn backend.main:app --host 0.0.0.0 --port 8000 --workers 1
--proxy-headers --forwarded-allow-ips "*" --timeout-graceful-shutdown 120`.
Deploy behind trusted Container Apps ingress only. Trusting forwarded headers
allows same-origin checks to use the external HTTPS origin.

## Configuration / hosting

- Use the existing UAMI on the Container App, **min/max replicas = 1**, **one
  worker**, external anonymous HTTPS ingress, target port 8000. Do not increase
  model quota. Graceful termination should allow 120 seconds when possible.
- The image includes only `infra/phase1-config.json` and `infra/agents.json`
  from infrastructure. Every existing runtime environment name overrides the
  corresponding config value (see `.env.example`). No `.env` file is loaded.
- Default `AZURE_CREDENTIAL_MODE=managed_identity` uses
  `ManagedIdentityCredential(client_id=AZURE_CLIENT_ID)`. Explicit local
  development may set `AZURE_CREDENTIAL_MODE=azure_cli`; no client secret.
- Required AI configuration: `AZURE_CLIENT_ID` in managed-identity mode,
  `FOUNDRY_PROJECT_ENDPOINT`, and `DOWNTIME_AGENT_NAME/ID/VERSION` plus
  `MAINTENANCE_AGENT_NAME/ID/VERSION`. Existing verified config supplies these;
  names/IDs must match and versions remain pinned to `1`.
- `SQLITE_PATH=/app/data/manufacturing.db` is set in the Docker image. The image
  creates `/app/data` owned by runtime UID **10001**. A path override must have a
  writable parent; the application creates missing parent directories. Outside
  Docker the default is repository `data\manufacturing.db`. Python's standard
  library `sqlite3` is used; no database service, ORM or new package is required.
- Optional `APP_CONFIG_FILE` selects a JSON config path; `FRONTEND_DIST` selects
  the built frontend path. Defaults work in the image.
- `/health` and `/api/health` read SQLite state and return 200 with
  `"storage": "sqlite"` only if the database works; errors return 503. AI
  health is **not** inferred from storage health.
- `/api/state`, mutation endpoints and `/api/jobs/{id}` are same origin.
  `/incidents/INC-1042` and other extensionless SPA paths refresh correctly.
  Missing `/api/*` and static assets return 404, never index.html.
- No application Blob client, Blob calls, storage environment settings or storage readiness
  check is used at startup, read or write. Historical storage values in the
  bundled Phase 1 config are ignored. Existing Azure resources and RBAC are left
  untouched. Foundry continues to use the existing managed identity.
- `httpx` is a runtime dependency: the pinned Foundry SDK imports it even for
  definition reads. The image build checks Foundry/identity imports before
  publishing; having `httpx` only in the test environment masked a missing
  production dependency in the first SQLite image.

## Persistence, review and quota

This user-approved Phase 2 amendment replaces the original durable Blob/Table
requirement with **local-filesystem SQLite for a synthetic demo**. State survives
browser refresh. It **may be lost on container restart/replacement**; it is not
durable cloud storage. Restarting the application process while retaining the
same database preserves edits, approvals, history, jobs, cooldown and daily
budget. A replacement container may start with a new database and reset all of
these, including AI budget/cooldown; there is no cross-replacement coordination
or old Blob migration.

Atomic seed-if-missing contains 3 sites, 6 lines, 18 machines, 24 incidents
and 72 timestamped readings. This is an explicitly dated, fixed synthetic shift.
Aggregate KPIs are weighted from shift bases; incident durations are not summed
into line downtime (incidents may overlap or be historical).

All state, including AI admission/jobs, is in one SQLite row with a database
revision. Each operation opens/closes its own connection in the calling thread.
Writes use `BEGIN IMMEDIATE`, a 15-second contention timeout, and a single
read-modify-write transaction; commit succeeds before returning. Failed
callbacks/serialization/writes roll back without persisting partial changes.
Concurrent writers cannot clobber each other. Initialization holds the same
write lock and only seeds an absent state row; reopening does not overwrite it.
An unreadable/corrupt/unwritable database fails closed with a logged error,
never a silent reset or memory substitute. Incident
mutation bodies include the displayed `revision`; stale changes receive helpful
409 errors. Database failures are logged by exception type without internal
error text. State is a shared anonymous demo,
not a production authentication/authorization or industrial safety system.
Reviewer display names are fictional self-attestations, not verified roles.

Only pinned agent version 1 is invoked through `AIProjectClient`'s project
OpenAI Responses client with `agent_reference`. Instructions/full schemas are
included in conservative token admission; output is capped at **450 tokens**,
adaptively reduced to a minimum of 300 within a 970-token estimate. This
intentionally overrides phase-one's 700-token smoke limit. Compact context uses
three readings, a bounded note excerpt, and for maintenance a compact subset of
the actual saved investigation. Full source evidence remains visible in the UI.
Tokenizer data is cached during image build, not fetched at runtime.

One SQLite-backed reservation across both agents + process mutex, at least 65 seconds
between starts **and after completion**, 12 attempted calls per UTC day, 16 KB
request limit, no queue and **zero automatic inference retries**. Both numeric
and HTTP-date `Retry-After` extend the saved cooldown. A newly seeded database
starts with a **65-second initial cooldown** to reduce rollout overlap with an
old revision; this is not a guarantee across independent container filesystems.
Keep one active replica/revision and do not run parallel copies. Admission precedes
reservation; failed calls still count. Responses must be completed, nonempty and
strictly schema-valid; real attribution persists on successful or invalid
service responses, including the service-reported token usage when supplied.
Jobs persist progress/output. Editing an incident during a
call preserves human changes and retains the unapplied result in job history.

A worker restart with the same database does not blindly cancel a live reservation.
After four minutes, stale jobs are marked interrupted on startup/state polling
or the next request, with an additional 65-second quiet window and **no automatic
re-inference**. A delayed task cannot begin with less than 120 seconds of its
reservation remaining; the SDK inference timeout is 90 seconds. Failed completion
writes retain the reservation for recovery if the database survives. Keep the prescribed one-worker,
one-replica topology; do not treat this as a distributed industrial job engine.

Review the investigation, generate/edit/save the plan, explicitly approve, then
advance Open → Investigating → Action Planned → Resolved. The server—not the
client—owns results, states and approval. Notes/actions/new AI requests invalidate
approval. Investigation regeneration also invalidates its prior plan on success.

## Narrow offline checks (no inference / Azure writes)

```powershell
python -m pip install -r backend\requirements-test.txt
npm --prefix frontend ci --no-audit --no-fund
npm --prefix frontend run typecheck
npm --prefix frontend run build
python -m pytest backend\tests -q
```

Tests use actual local SQLite for the API workflow, seed/reopen, rollback and
concurrency/CAS checks; isolated AI edge checks also use a test-only memory store.
All inference uses a scripted gateway only in test code. The
production factory has no development store switch or mock AI endpoint.
For real local development, use explicit Azure CLI credential mode, run
`python -m uvicorn backend.main:app --port 8000 --workers 1`, and
`npm --prefix frontend run dev`. This creates/uses the local SQLite database
and makes real calls when AI is requested; do not use it as an offline test.
No real calls are made during initialization or health checks.
The build and offline checks do not establish
deployed identity connectivity or real inference success.

## Implementation verification

SQLite amendment checks on **2026-10-15**: **11 focused offline tests passed**
at `2026-10-15T21:48:52.8985178+01:00`; TypeScript typecheck and Vite production
build passed at `2026-10-15T21:48:54.6554406+01:00`. These cover the production
factory initializing SQLite without Blob settings, API edit/review/approval/history
and reopen persistence, atomic concurrent initialization, rollback on rejected
and unserializable mutations, concurrent updates, stale-incident CAS and corrupt
database failure. Existing throttle/AI edge cases remain covered. Both prompt
admission checks retained 450 output tokens under the conservative token budget.
No Azure operations or real inference were performed. Docker CLI's Linux engine
pipe was unavailable during the `2026-10-15T21:48:08+01:00` check, so **image
build/runtime remain unverified locally**.
Azure-AI must build the image, deploy the prescribed topology/config and verify
managed identity access; Integration must verify real deployed calls. No server
or background process was left running.

Integration subsequently deployed build **dt5**, revision
`ca-manufacturing-01--0000003`, and verified both real pinned agents through the
public app's managed identity at **2026-10-15 21:22–21:24 UTC**. Service-reported
token usage now persists with attribution (focused retention test plus the
existing throttle/budget test: **2 passed, 10 deselected**). Actual Chromium
note/plan saves survived browser reload; activity and original AI attribution
remained, and an unapproved transition returned 409. The synthetic plan was
deliberately left unapproved. See `..\PHASE-2-HANDOFF.md` and
`..\infra\integration-phase2-live.json`; this is Phase 2 evidence, not Phase 3
or production durability/safety certification.

Application files:

- `frontend/src/main.tsx`, `types.ts`, `style.css`; Vite/TypeScript configuration,
  `index.html`, `package.json` and generated `package-lock.json`.
- `backend/main.py` (API/static serving), `config.py` (existing config + identity),
  `store.py` (transactional SQLite), `seed.py` (deterministic shift), `domain.py`
  (review and state rules), `ai.py` (real Foundry integration and saved admission/jobs).
- `backend/tests/test_smoke.py`, backend dependency manifests, `.env.example`,
  root `Dockerfile`, `.dockerignore`, and related application ignore entries.
