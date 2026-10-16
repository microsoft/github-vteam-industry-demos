# Phase 1 — infrastructure and two live Foundry agents verified

Phase 1 resumed on **2026-10-15** under the explicitly authorized subscription.
Integration owns `PHASE-1-HANDOFF.md`; its older blocked state must be refreshed
from the evidence below. **Phase 2 is not started or authorized.** There is no
application, application dataset, container image, external app ingress or public
app URL. No commits, pushes, additional specialists or workflows were used.

## Actual Azure scope and resources

- Subscription: `e2d6ac89-1bb7-420c-97fb-a96dea6c0635`
  (`ME-MngEnvMCAP230040-savacristian-1`), Enabled.
- Tenant: `fe482aee-20fd-4a0f-8ecd-1db718a7eb6f`.
- Existing RG: `rg-manufacturing-01`, verified `swedencentral`; never recreated.
- Initial inventory was empty. No subscription switch or unrelated resource
  changes were made by these scripts.
- Required providers `Microsoft.App`, `Microsoft.ManagedIdentity`,
  `Microsoft.Storage`, `Microsoft.CognitiveServices` were already Registered.
  Deployment can register a missing required provider and wait for verification;
  preflight alone remains read-only.

All resources below are in **Sweden Central**. Model and blob-container location
is inherited from their parent account. No fallback or cross-region AI processing
was needed. No global or provisioned-throughput deployment was requested.

| Resource | Actual name / configuration |
|---|---|
| Container Apps environment | `cae-manufacturing-01`; Consumption only, public networking; no apps or paid logging sink |
| User-assigned app identity | `id-manufacturing-01` |
| Storage | `stmanuf01lk45yoce5uq3i`; StorageV2, Standard_LRS, Hot; private `demo-state` container |
| Foundry account | `ai-manufacturing-01-lk45yoce5uq3i`; AIServices S0, system identity, key authentication disabled |
| Foundry project | `manufacturing-operations-01`; system identity, public authenticated API |
| Model deployment | `manufacturing-mini-01`; `gpt-4.1-mini`, version `2025-04-14`, regional Standard, capacity **1** |

The subscription returned 286 usage entries. Before provisioning, the selected
model's regional quota was 5,000 with current usage 10. The capacity API reported
4,990 available regional Standard units. These observations are not reservations;
successful deployment and the live responses establish this allocation works.
The deployed model advertises Agents V2 and Responses support.

Capacity 1 currently exposes **1 request/minute and 1,000 tokens/minute** in
the ARM rate-limit readback. Future app code must serialize/bound AI work and
handle 429/Retry-After explicitly. Two smoke calls completed successfully; that
is not evidence of higher sustained throughput. Do not silently increase capacity
or switch to a global SKU.

Storage bytes/transactions and model input/output tokens are usage billed.
Consumption has no app replicas yet. No price quote or subscription bill has been
verified. No Log Analytics, Search, Cosmos DB, Key Vault, VNet, private endpoints
or paid agent tools were introduced. Both smoke responses used **1,209 total
tokens** combined (395 output tokens).

## Actual Foundry portal and endpoint

[Open manufacturing-operations-01 in Foundry](https://ai.azure.com/nextgen/r/4tasiRu3QgyX-6lt6mwGNQ,rg-manufacturing-01,,ai-manufacturing-01-lk45yoce5uq3i,manufacturing-operations-01)

Sign in to the authorized tenant, use **New Foundry**, then **Build → Agents**.
The deep link uses the current public portal's encoded ARM-resource route, not
the invalid raw-ARM-path link in the initial scaffolding. The service-returned
project endpoint and persisted agents were read back successfully; an
authenticated interactive browser session was not available for portal UI testing.

```text
https://ai-manufacturing-01-lk45yoce5uq3i.services.ai.azure.com/api/projects/manufacturing-operations-01
```

Agent creation uses `azure-ai-projects` **2.3.0**, Foundry Projects **v1** prompt
agents, and OpenAI **3.7.0** Responses with a pinned `agent_reference` version.
These are persistent callable prompt agents, not UI labels or hosted containers.
No publish-to-channel or separate agent application is needed for project API calls.

## Two actual agents and live evidence

| Business role | Supported runtime name | Actual ID / version | Completed response |
|---|---|---|---|
| Downtime Investigation Agent | `downtime-investigation-agent` | `downtime-investigation-agent:1` / `1` | `resp_0f7267292a5def09006ad0f1ab81d481959f7f0878234beb8f` |
| Maintenance Advisor Agent | `maintenance-advisor-agent` | `maintenance-advisor-agent:1` / `1` | `resp_03129bceb104381b006ad0f1b9466481948247d7848978706e` |

The service rejected names with spaces: names must start/end alphanumeric, permit
hyphens in the middle and be at most 63 characters. Business role names are
preserved in both agent descriptions and `metadata.display_name`, and in config.
Version readback verifies each ID, metadata and model deployment.

Live synthetic response verification:

- Downtime completed at `2026-10-15T15:30:55.624229+00:00`; 302 input / 162 output
  tokens. Nonempty facts, a ranked hypothesis with uncertainty/evidence, impact
  and questions; qualified human review required.
- Maintenance completed at `2026-10-15T15:31:09.135698+00:00`; 512 input / 233 output
  tokens. Uses the actual investigation response; nonempty prioritized actions,
  roles, urgency, benefits, safety checks and prevention; `approved=false`.
- Each invocation: 700 output-token cap, 90-second response timeout, zero automatic
  retries, no tools, no mock fallback. JSON was parsed and validated against its
  strict schema, including recursive nonempty text/list checks.
- These are fictional demonstration hypotheses/plans, not verified diagnoses,
  complete safe-work procedures, authorization to work or autonomous commands.

`phase1-invocations.json` contains sanitized response IDs, status, timestamps,
usage and real structured outputs. It is a bounded smoke artifact, not an app seed
dataset.

## Identity authorization and honest connectivity boundary

Read back and verified three Bicep-managed assignments:

1. App identity → Foundry User (`53ca6127-db72-4b80-b1b0-d745d6d5456d`) at **only
   manufacturing-operations-01**.
2. App identity → Storage Blob Data Contributor
   (`ba92f5b4-2d11-453d-a403-e96b0029c9fe`) at **only demo-state**.
3. Project system identity → Cognitive Services OpenAI User
   (`5e0bd9bd-7b93-4f28-af87-19fc36ad61bd`) at **only its Foundry account**.

App client ID: `87b58205-bb32-45a0-82f9-56545fd08738`.
App principal ID: `fd723da5-633e-46b9-8509-af3fdd86dbf6`.
Foundry User is the supported project data-plane built-in role and also permits
agent authoring; it is not a custom invocation-only role. No operator role,
subscription/tenant permission, or broad elevation was added.

Storage shared-key access and blob anonymous access are disabled. Public network
access does not mean unauthenticated storage or Foundry access. No keys, tokens,
connection strings or `.env` reads are required by these scripts.

**CLI-principal connectivity is verified. App managed-identity runtime connectivity
is not verified.** Readback establishes assignment IDs, scopes, principal IDs and
expected role definitions, not an impersonated data-plane test. Phase 2 must attach
this identity to the app and invoke both agents/read-write persistence from the
deployed app. No app was deployed merely to test this in Phase 1.

## Execution repairs and preserved history

- Earlier wrong-subscription access failures are preserved under `history` in
  `phase1-evidence.json`, not treated as current blockers.
  `integration-phase1-verification.json` remains untouched historical evidence.
- Windows `az.cmd` query URLs needed quoting to preserve `&` separators.
- Container Apps rejects literal logging destination `"none"`; Bicep now omits
  the logging configuration, and actual readback shows no configured sink.
- Foundry project/model child writes initially conflicted on their account.
  Bicep serializes the project after the model. Retry reconciled only exact IDs
  proven successful by `manufacturing-phase1-01` deployment operations. Nothing
  was deleted. These were API/concurrency failures, **not capacity failures**.
- The final incremental deployment is **Succeeded**. Deployment attempt and
  reconciliation evidence is retained. Existing target names without matching
  successful deployment operations remain rejected.

## Files and safe reruns

- `main.bicep`: actual resource definitions, regions/SKUs and scoped RBAC.
- `agents.json`: two instructions/schemas and supported names/business metadata.
- `phase1-config.example.json`: secret-free null-ID template for this subscription.
- `phase1-config.json`: **generated actual working nonsecret settings**. Do not
  replace it with the example; it includes actual agent IDs/versions.
- `phase1-evidence.json`: authoritative sanitized history, preflight, deployment,
  invocation and final resource/identity/agent readback.
- `phase1-invocations.json`: compact live invocation evidence.

```powershell
# Read-only Azure checks; preflight refreshes evidence, verify makes no inference.
python scripts\phase1_azure.py preflight
python scripts\phase1_verify.py

# Focused offline safety checks and local Bicep compilation.
python -m unittest discover -s scripts -p test_phase1.py
az bicep build --file infra\main.bicep --stdout 1>$null

# Only for an explicitly intended infrastructure reconciliation (cloud writes).
python scripts\phase1_azure.py deploy

# Only if intentionally repeating paid live verification: one response per agent.
python scripts\phase1_agents.py smoke
```

Dependencies in `requirements-phase1.txt` match the verified SDK range. Existing
installed dependencies were used; no installation was needed. For a genuinely
missing import, install requirements in the ignored `.venv-phase1` and run all
scripts with that environment's Python. Do not upgrade Squad or Azure tooling as
part of Phase 1.

## References

- [Supported Foundry SDK and prompt-agent API](https://learn.microsoft.com/en-us/azure/foundry/quickstarts/get-started-code)
- [Agents and Responses region support](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/limits-quotas-regions)
- [Model capacity API, 2024-10-01](https://learn.microsoft.com/en-us/rest/api/aiservices/accountmanagement/model-capacities/list?view=rest-aiservices-accountmanagement-2024-10-01)
- [Foundry project ARM schema](https://learn.microsoft.com/en-us/azure/templates/microsoft.cognitiveservices/2025-06-01/accounts/projects)

**Stop at Phase 1. Integration may refresh the handoff from these actual results;
Fullstack remains inactive until separate Phase 2 authorization.**
