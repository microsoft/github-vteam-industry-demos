# ClaimProcessing — Infrastructure (Tank ⚙️)

Infrastructure-as-code for deploying the whole ClaimProcessing architecture to
Azure with **one command**. Microsoft AI Foundry is the centrepiece: the portal's
claim-assessment workflow runs on a Foundry **agent** backed by a **gpt-5-mini**
deployment.

## Architecture

```
                          ┌─────────────────────────────────────────┐
   Browser ──HTTPS──▶     │  Azure Container Apps (.NET 9)           │
                          │  ClaimProcessing.Web  (Blazor portal)    │
                          │  • serverless — no VM quota needed       │
                          │  • user-assigned managed identity        │
                          │  • image pulled from ACR (AcrPull)       │
                          └───────────────┬─────────────────────────┘
                                          │ DefaultAzureCredential
                                          │ (no secrets, token auth)
                                          ▼
                          ┌─────────────────────────────────────────┐
                          │  Microsoft AI Foundry (AIServices, S0)   │
                          │  • project: claim-processing             │
                          │  • agent:   claim-assessor  ◀── main point│
                          │  • model:   gpt-5-mini (GlobalStandard)  │
                          │  • local auth disabled (Entra ID only)   │
                          └─────────────────────────────────────────┘

   Azure Container Registry  ◀── holds the portal image (built by `az acr build`)
   Log Analytics + Application Insights  ◀── telemetry from the web app
```

| Resource | Bicep module | Purpose |
|----------|--------------|---------|
| AI Foundry account + project + gpt-5-mini | `modules/ai-foundry.bicep` | Hosts the `claim-assessor` agent and model |
| Container Apps env + app | `modules/container-app.bicep` | Runs the Blazor portal (serverless) |
| Container Registry | `modules/registry.bicep` | Stores the portal image; AcrPull for the app identity |
| User-assigned identity | `modules/identity.bicep` | Shared identity: ACR pull **and** Foundry token access |
| Log Analytics + App Insights | `modules/monitoring.bicep` | Observability |
| Role assignments | `modules/rbac.bicep` | App identity → **Azure AI Developer** + **Cognitive Services User** on Foundry |

The **agent** is created by `hooks/postprovision.*` (data-plane Agents API) right
after provisioning, and its ID is written to the web app as `Foundry__AgentId`.

> **Why Container Apps, not App Service?** Sandbox/MCAP subscriptions frequently
> have **0 dedicated App Service VM quota** (both B1 and F1 fail with
> `InternalSubscriptionIsOverQuotaForSku`). Container Apps runs on the serverless
> consumption plan and needs no VM quota, so the portal deploys anywhere.

## Prerequisites

- Azure subscription + `az login` (Owner or Contributor on the subscription)
- [Azure Developer CLI](https://aka.ms/azure-dev/install) (`azd`), **or** `az` CLI
- gpt-5-mini capacity in the chosen region (default deploy: `eastus2`)

## Deploy

### Option A — azd (one command)

```bash
azd auth login
azd up          # provisions infra, creates the Foundry agent, builds + deploys the app
```

`azd up` prompts for an environment name, subscription, and region, then:
1. **provision** — runs `infra/main.bicep`
2. **postprovision** — creates/reuses the `claim-assessor` agent, captures `FOUNDRY_AGENT_ID`
3. **deploy** — builds the container image and rolls out the new revision

The portal URL is printed at the end (`SERVICE_WEB_URI`).

### Option B — az CLI (used for this deployment)

Bypasses azd multi-tenant auth issues. Three steps:

```bash
# 1. Provision infra (creates ACR + Container Apps + reuses Foundry/monitoring)
az deployment sub create \
  --location eastus2 \
  --template-file infra/main.bicep \
  --parameters environmentName=claimproc location=eastus2 \
               principalId=<your-object-id> \
               foundryAgentId=<asst_...>

# 2. Build + push the portal image in the cloud (no local Docker needed)
az acr build --registry <acrName> \
  --image claimprocessing-web:latest \
  --file src/ClaimProcessing.Web/Dockerfile .

# 3. Roll the container app onto the real image
az containerapp update -n <containerAppName> -g rg-claimproc \
  --image <acrName>.azurecr.io/claimprocessing-web:latest
```

### Region / model overrides (azd)

```bash
azd env set FOUNDRY_MODEL_NAME gpt-5-mini
azd env set FOUNDRY_MODEL_VERSION 2025-08-07
azd env set FOUNDRY_MODEL_CAPACITY 30
azd env set AZURE_LOCATION eastus2
```

## Tear down

```bash
azd down --purge      # deletes the resource group + purges the Foundry account
# — or —
az group delete -n rg-claimproc --yes
```

## Security posture (Seraph 🔒)

- **No account keys** — `disableLocalAuth: true`; all access is Entra ID token-based.
- **No admin creds on ACR** — `adminUserEnabled: false`; image pull is via the
  managed identity (AcrPull), not username/password.
- **Managed identity** — the app authenticates with a user-assigned identity via
  `DefaultAzureCredential`; no secrets in config or source.
- **Least privilege** — the app identity gets only *Azure AI Developer* +
  *Cognitive Services User*, scoped to the Foundry account (not the whole RG),
  plus *AcrPull* scoped to the registry.
- **HTTPS only** — Container Apps ingress is external HTTPS with automatic TLS.

## Follow-up (Switch 🤖)

The portal now calls the **live** `claim-assessor` agent (`AzureFoundryClaimAgent`),
and a **multi-agent orchestration** is available on the `/workflow` page.

### Multi-agent Foundry workflow

`infra/foundry/create-workflow.ps1` idempotently creates four agents and wires the
orchestrator (connected-agent tools + Microsoft Learn MCP). Their IDs are recorded
in `infra/foundry/workflow.json`.

```powershell
./infra/foundry/create-workflow.ps1 `
  -ProjectEndpoint "https://aif-4c5kuzbpd4uw6.services.ai.azure.com/api/projects/claim-processing"
```

To light up the live orchestrator in a deployment, inject its ID into the container:

```bash
az containerapp update -n ca-web-4c5kuzbpd4uw6 -g rg-claimproc \
  --image cr4c5kuzbpd4uw6.azurecr.io/claimprocessing-web:v3 \
  --set-env-vars "Foundry__OrchestratorAgentId=asst_xTCmYG7EeRBN098mk8dCLLPj"
```

When `Foundry__OrchestratorAgentId` is unset the app falls back to a local
simulation so the workflow page stays demoable without Azure credentials.
The orchestrator needs a tool-capable model (**gpt-4.1-mini**) — the gpt-5 family
rejects classic-Assistants `connected_agent`/`mcp` tools.

### Native Foundry hosted Workflow (portal *Workflows* tab)

The connected-agents orchestrator above is configuration on a single agent — it does
**not** render on the portal's visual **Workflows** canvas. To get a native workflow
that appears under **Workflows**, `infra/foundry/create-hosted-workflow.py` registers
three **prompt agents** (Agents v2 surface) plus a Microsoft Agent Framework workflow
(`infra/foundry/claim-workflow.yaml`) via `WorkflowAgentDefinition`. IDs are recorded
in `infra/foundry/hosted-workflow.json`.

```powershell
pip install azure-ai-projects --pre azure-identity pyyaml
az login
python infra/foundry/create-hosted-workflow.py `
  --endpoint "https://aif-4c5kuzbpd4uw6.services.ai.azure.com/api/projects/claim-processing" `
  --model gpt-4.1-mini
```

Notes:
- Workflow agents are preview — the client must be constructed with `allow_preview=True`
  (equivalently the `Foundry-Features: WorkflowAgents=V1Preview` request header).
- Agents referenced by `InvokeAzureAgent.agent.name` in the YAML must exist as prompt
  agents in the project (the script creates `ClaimIntakeAgent`, `FraudRiskAgent`,
  `ClaimAssessorAgent`). All share `System.ConversationId`, so each sees the running
  conversation from the previous agent — a sequential pipeline.
- Result: **Workflows → ClaimProcessingWorkflow** (visual canvas) and the three agents
  under **Agents** in the Foundry portal.
