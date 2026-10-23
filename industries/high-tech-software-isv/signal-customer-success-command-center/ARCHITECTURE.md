# Architecture · Signal

Current accepted design, validated 2026-10-15. Phase 3 preserves Phase 2's
architecture and working assets; no new services. One authorized CSS-only
image update is deployed and final live 390/1440 layout and current-process
two-agent human-review journey passed. **Phase 3 COMPLETE; no active blockers.**

Live: https://ca-high-tech-software-isv-01.gentlebeach-d66a7b07.swedencentral.azurecontainerapps.io

## Runtime and data flow

```text
Anonymous HTTPS browser
  └─ Azure Container App :8000 (one replica, one Uvicorn worker)
       ├─ built React + TypeScript + Vite UI (same origin)
       ├─ FastAPI /api: accounts, health, AI, edits, actions, export
       ├─ SQLite /app/data/command-center.sqlite3 (ephemeral)
       └─ existing UAMI → Foundry REST v1 → two existing agents → gpt-4.1-mini
```

No login, cross-origin API, volumes, external database, queue or mail service.
The container runs as non-root UID 10001. Public anonymous state is intentionally
shared and **only fictional data is permitted**; this is not a production security
or durability design.

### Data and human control

`backend\data.py` supplies 24 rich fictional B2B SaaS accounts. Initial seed dates
use UTC; stable `acct-001`–`acct-024` IDs are inserted with `INSERT OR IGNORE`.
Startup with an existing database does not replace user edits. Missing IDs alone
are seeded. This does not make the container filesystem durable.

SQLite `accounts` stores context, current risk/plan, separate human edits and action
states. `ai_runs` retains original completed AI output/provenance separately;
`events` records UTC generation/save/approval history. WAL and short transactions
support the single-worker design; integer revisions reject stale writes with 409.
The UI offers **Reload latest data**; unsaved edits can be replaced on reload.

Plan edits and accepted/completed status survive browser refresh while SQLite
survives. Container restart/replacement/redeployment **may lose all changes**.
There is no backup or restoration promise. Keep Markdown downloads outside the
container if you need a demonstration artifact.

### Heuristics are not AI predictions

The deterministic illustrative health score combines seat adoption (30 points),
usage momentum (20), feature breadth (20), support stability (15), and satisfaction
(15). The Customer 360 breakdown exposes evidence and weights. Renewal timing is
separate context. Dashboard **ARR at risk** sums ARR in the high-risk heuristic
band; it is not probability-weighted expected churn. Foundry's evidence-based
narrative, confidence and limitations remain separate from that score.

### Real AI contract

Project endpoint:
`https://foundry-high-tech-isv-f4ee1f29.services.ai.azure.com/api/projects/proj-high-tech-software-isv-01`

| Existing asset | Actual version |
|---|---|
| Customer Churn Risk Analyst | `customer-churn-risk-analyst:1` |
| Retention Strategy Advisor | `retention-strategy-advisor:1` |
| Model deployment | `gpt-4.1-mini`, model version `2025-04-14` |
| Model SKU / quota | DataZoneStandard, capacity 10 (10,000 TPM quota units, not provisioned throughput) |
| Runtime API | REST `api-version=v1`, OpenAI Responses |
| Client libraries | `azure-identity==1.26.0`, `httpx==0.28.1` |

The backend obtains `https://ai.azure.com/.default` using the attached UAMI.
It reads `agents` and fails closed unless latest version is `1`, model matches,
and schema equals `scripts\foundry-agent-definitions.json`; then POSTs
`agents/{name}/endpoint/protocols/openai/responses?api-version=v1`.
The app does not create/update agent definitions. No browser bearer token or
CLI-user fallback is used in deployment.

Only completed, schema-valid output is saved, including response ID, agent/version,
model, API version, time, source and context fingerprint. The advisor receives
the actual stored analyst JSON; its provenance links that risk response ID.
Changed customer context requires a new risk analysis. Regeneration explicitly
warns that current human edits/approvals reset; prior AI source runs remain.

Human outreach is a draft only. Accept/complete updates a record, never sends
messages or executes recommendations. Markdown exports use saved values and
escape Markdown/HTML controls; React renders AI strings as text.

Timeouts (110-second total deadline), authorization failures, rate limits,
contract errors and conflicts produce safe visible error messages. No simulated
or templated AI fallback exists. A failed generation leaves prior saved results
unchanged; label them **previous saved real results**, not a fresh success.
The health endpoint never generates output and reports successful runtime paths
only for its current process.

## Azure inventory and scope

Subscription: `ME-MngEnvMCAP230040-savacristian-1`
(`e2d6ac89-1bb7-420c-97fb-a96dea6c0635`).
All named resources below are in existing RG `rg-high-tech-software-isv-01`,
**Sweden Central**, with no regional fallback.

| Component | Existing name / status |
|---|---|
| Container App | `ca-high-tech-software-isv-01`; active revision `ca-high-tech-software-isv-01--0000001`; prior revision retained inactive |
| Consumption environment | `cae-high-tech-software-isv-01`; no VNet; retained application logging disabled |
| Basic ACR | `acrhtisvf4ee1f29`; admin disabled; digest-pinned image |
| UAMI | `id-high-tech-software-isv-01` |
| Foundry account / project | `foundry-high-tech-isv-f4ee1f29` / `proj-high-tech-software-isv-01` |
| Retained unused Storage | `sthtisvf4ee1f29`; `snapshots` container; policy-disabled public data plane |
| Retained unused Cosmos | `cosmos-high-tech-isv-f4ee1f29`; serverless `customer-success/account-state`; policy-disabled public data plane |

Resource ID prefix:
`/subscriptions/e2d6ac89-1bb7-420c-97fb-a96dea6c0635/resourceGroups/rg-high-tech-software-isv-01`.
Project suffix:
`/providers/Microsoft.CognitiveServices/accounts/foundry-high-tech-isv-f4ee1f29/projects/proj-high-tech-software-isv-01`.
Full resource IDs are in `infra\phase1-handoff.json` (historical) and
`infra\phase2-deployment.json` (deployed app); historical managed-store blockers
are accepted and do not block this SQLite application.

UAMI client ID `63cf5272-0d17-42ce-ac7d-982d2bb12b71`; principal
`1a5b6869-b2d3-4a3a-a807-8fda903b97c9`. Registry-scoped AcrPull permits image
pulls. Project-scoped Foundry Project Runtime User and Foundry Agent Consumer
permit response/endpoint interaction. The added project-scoped custom role
`4e676ed6-972a-5ef1-96f8-8f172ea60fc5` grants only data action
`Microsoft.CognitiveServices/accounts/AIServices/agents/read`, no management actions.
Provider granularity includes agent/thread/message reads. Assignment
`97d19333-9e76-55b0-8bc7-79ff9931bb0a` is project-only even though the role
definition's availability is RG-wide. Historical Blob/Cosmos grants are retained,
not used for application persistence.

Ingress is external HTTPS with anonymous access; one 0.5-vCPU/1-GiB container,
min=max replicas 1. Startup/readiness/liveness probe `/api/health` on port 8000.
Current CSS patch: tag `phase3-20261015T140816Z`, ACR run `dt3`; digest
`sha256:46dc1505599ad4b8dfe506a29e0bbe3dadf8f38578cb34b73c4a578fdd7924c9`.
See `infra\phase3-deployment.json` and [deployment procedures](infra/README.md);
no further redeployment is needed. SQLite replacement reset was observed:
pre-update saved plans/edits are historical evidence only. Integration then
made exactly one new real analyst call and one advisor call, 26.023 seconds
apart, on `acct-002`; current-process `runtime_verified_this_process` now contains
both successful managed-identity paths. Cobalt's new saved plan, human notes/
outreach and completed action survive refresh at revision 6/five events.
Phase 3 generation count is four total: two before and two after replacement.
Fresh response IDs and actual export are in [final results](PHASE-3-RESULTS.md)
and `infra\evidence\phase3-cycle2-validation.json`. Other pre-update generated
accounts, including Northstar, were not restored.

Existing app/environment ARM API is `2025-01-01`, registry `2023-07-01`,
managed identity `2023-01-31`; Foundry runtime remains REST `v1`.

## Limitations and cost

The public AI guard allows two concurrent calls globally, one per account,
25 seconds between account starts, 40 attempts/hour and 150/day per process.
Failures count. These limits reset on restart, are not authentication/abuse
prevention and are **not a durable spending cap**.

One always-on Consumption replica and Basic ACR incur standing costs; Foundry
charges depend on actual model usage, possibly including abandoned/timed-out
remote calls. Quota capacity is not a budget. Empty retained serverless Cosmos
has no reserved RU/s, but minimal storage/backup/other applicable charges can
remain; retained Storage is not guaranteed free. No current price estimate or
backup guarantee is asserted. Resource region does not imply Sweden-only
inference: EU Data Zone model processing may occur elsewhere in the EU.

No load/security audit or production-readiness certification was performed.
Final bounded evidence: [Phase 3 results](PHASE-3-RESULTS.md).
