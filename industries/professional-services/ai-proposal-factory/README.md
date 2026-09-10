# AI Proposal Factory

AI Proposal Factory is a reusable, single-URL customer demonstration that turns
fictional opportunities and meeting notes into review-ready proposals. It uses
React, FastAPI, Azure Container Apps, Microsoft Foundry, exactly three Foundry
Agents, Azure AI Search, and Azure Storage.

> **Demo environment — synthetic data only.** The baseline intentionally has no
> application authentication.

## Prerequisites

Install:

- Git
- Azure CLI
- Azure Developer CLI (`azd`) 1.32 or later
- Python 3.12 or later
- Node.js 22 or later
- PowerShell 7 on Windows

Install or update the Container Apps CLI extension:

```powershell
az extension add --name containerapp --upgrade
```

Docker Desktop is optional. `azd` uses an Azure Container Registry remote build.

### Required Azure permissions

The deploying identity must be able to:

- create resources in the target subscription;
- create Azure role assignments;
- deploy Microsoft Cognitive Services/Foundry models;
- use the selected Foundry model quota in Sweden Central.

`Owner`, or `Contributor` plus `User Access Administrator`, is the simplest demo
setup. The `preprovision` hook detects the active Azure user or service principal
and grants only the data-plane roles required for Storage, Search, and Foundry.

Required providers include `Microsoft.App`, `Microsoft.ContainerRegistry`,
`Microsoft.ManagedIdentity`, `Microsoft.OperationalInsights`,
`Microsoft.Storage`, `Microsoft.Search`, `Microsoft.CognitiveServices`, and
`Microsoft.Authorization`.

## Deploy a fresh independent copy

All regional resources are restricted to **Sweden Central**. The deployment
stops rather than falling back to another region.

```powershell
git clone <private-repository-url>
Set-Location <repository-folder>

az login
az account set --subscription "<subscription-id>"

azd auth login
azd env new <short-unique-environment-name>
azd env set AZURE_SUBSCRIPTION_ID "<subscription-id>"
azd env set AZURE_LOCATION swedencentral

azd up
```

One `azd up` performs the complete deployment:

1. The `preprovision` hook verifies the active subscription, resolves the
   signed-in user or service principal, configures deployment-user RBAC inputs,
   enforces Sweden Central, and checks the selected model/SKU/capacity.
2. Bicep creates a dedicated resource group, Container Registry, managed
   identity, Log Analytics workspace, Container Apps environment, one public
   Container App, Storage Account, Azure AI Search, Foundry account/project,
   one model deployment, and required RBAC.
3. The `postprovision` hook creates/updates exactly three Foundry Agents, tests
   them, seeds reusable knowledge into Blob Storage and Azure AI Search, stores
   the new environment-specific Agent IDs in the local azd environment, and
   applies them to the Container App.
4. `azd` remote-builds and deploys the application image. Application startup
   idempotently seeds synthetic opportunities, meeting notes, and Azure Tables.

Generated Agent IDs are stored locally in
`scripts/azure/deployment-output.json`; that file is ignored by Git.

## Deployment options

### Azure AI Search SKU

The portable default is Basic:

```powershell
azd env set AZURE_AI_SEARCH_SKU basic
```

Free can be used when the subscription has not already consumed its single Free
Search allocation:

```powershell
azd env set AZURE_AI_SEARCH_SKU free
```

`standard` is also supported. Set the value before `azd up`.

### Foundry model

Defaults:

```text
AZURE_AI_MODEL_DEPLOYMENT_NAME=gpt-5-mini
AZURE_AI_MODEL_NAME=gpt-5-mini
AZURE_AI_MODEL_FORMAT=OpenAI
AZURE_AI_MODEL_VERSION=2025-08-07
AZURE_AI_MODEL_DEPLOYMENT_SKU=DataZoneStandard
AZURE_AI_MODEL_CAPACITY=10
```

Override these before `azd up` when another compatible model or quota allocation
is required:

```powershell
azd env set AZURE_AI_MODEL_DEPLOYMENT_NAME "<deployment-name>"
azd env set AZURE_AI_MODEL_NAME "<model-name>"
azd env set AZURE_AI_MODEL_FORMAT "<model-format>"
azd env set AZURE_AI_MODEL_VERSION "<model-version>"
azd env set AZURE_AI_MODEL_DEPLOYMENT_SKU "<deployment-sku>"
azd env set AZURE_AI_MODEL_CAPACITY "<capacity>"
```

The preflight requires the exact model/version/SKU to be available in
`swedencentral` and checks the corresponding quota entry. It never changes
region automatically.

### Organizational Storage policies

The default is **off**:

```text
AIPF_STORAGE_SECURITY_CONTROL_IGNORE=false
```

The original development subscription had a management-group policy that
disabled Storage public networking unless the resource carried the documented
`SecurityControl=Ignore` exclusion tag. Only subscriptions with that specific,
approved policy exception should enable:

```powershell
azd env set AIPF_STORAGE_SECURITY_CONTROL_IGNORE true
```

Do not enable this simply to bypass an unfamiliar organizational policy. Obtain
the subscription owner's approval or use the networking design mandated by that
organization.

## Verify the deployment

```powershell
$url = azd env get-value SERVICE_APP_URI
Write-Host $url

.\scripts\azure\verify-deployment.ps1 `
  -ResourceGroupName (azd env get-value AZURE_RESOURCE_GROUP_NAME) `
  -ContainerAppName (azd env get-value SERVICE_APP_NAME)
```

Open the printed URL. The dashboard should contain seeded opportunities and the
proposal workflow should use real Foundry Agents.

## Application-only updates

Application changes do not require infrastructure reprovisioning:

```powershell
azd auth login
azd env select <environment-name>
azd deploy app
```

Use `azd up` only when Bicep, hook behavior, or azd environment configuration
also changed.

## Destroy a demo environment

This deletes resources belonging to the selected azd environment:

```powershell
azd env select <environment-name>
azd down --purge
```

Review the selected environment and subscription carefully before confirming.

## Use Squad after cloning

The repository does not commit `.squad/`; each colleague gets independent team
state, decisions, histories, and casting.

```powershell
squad init
squad doctor
copilot --agent squad
```

Describe the work and confirm the proposed team when Squad enters Init Mode.

## Troubleshooting

### Search SKU or regional capacity

- If Free reports a quota error, use `AZURE_AI_SEARCH_SKU=basic`.
- If Basic or Standard reports regional capacity unavailable, retry later or
  choose another supported Search SKU that is available in Sweden Central.
- Do not change Azure region as a workaround.

### Foundry model or quota

- The preprovision hook reports the unavailable model/version/SKU or insufficient
  capacity before Bicep runs.
- Request quota or configure another Foundry Agent-compatible model available in
  Sweden Central.
- Model availability and quota are subscription-specific.

### Organizational Azure policy

- Policy may deny public Container Apps, Storage, Search, or Foundry resources.
- Do not bypass policy automatically.
- Use `AIPF_STORAGE_SECURITY_CONTROL_IGNORE=true` only when the subscription
  owner explicitly approves that exact Storage exclusion.

### Deployment principal detection

The hook supports Azure CLI sessions authenticated as a user or service
principal. If Microsoft Entra directory lookup of the current service principal
is prohibited, an administrator must supply its object ID:

```powershell
azd env set AZURE_DEPLOYER_PRINCIPAL_ID "<object-id>"
azd env set AZURE_DEPLOYER_PRINCIPAL_TYPE ServicePrincipal
```

## Local development

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt

Set-Location app\frontend
npm ci
npm run build
Set-Location ..\..

.\.venv\Scripts\python -m uvicorn app.backend.main:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000`. Local mode uses deterministic mock agents, local
keyword retrieval, and `data/runtime/store.json`.

## Validation

```powershell
.\.venv\Scripts\python -m ruff check app tests scripts\app scripts\azure
.\.venv\Scripts\python -m pytest -q
npm ci --prefix app\frontend
npm run build --prefix app\frontend
az bicep build --file infra\main.bicep
```

## Architecture

```text
app/frontend/                  React + TypeScript + Vite
app/backend/                   FastAPI application and Azure adapters
data/seed/                     deterministic synthetic catalog
infra/                         subscription-scoped Bicep
scripts/azure/preprovision.py  subscription, principal, region, model preflight
scripts/azure/postprovision.py platform seed, agents, IDs, app configuration
tests/                         focused application tests
```

FastAPI serves the frontend and `/api/*` from one Container App URL. Proposal
generation runs Requirements Analyst, Proposal Writer with Search-grounded
knowledge, and Risk Reviewer in sequence.
