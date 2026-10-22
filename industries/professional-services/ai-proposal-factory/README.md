# AI Proposal Factory

AI Proposal Factory is a deployed Microsoft Foundry customer demo for Professional Services. The completed Phase 3 application combines React + TypeScript, FastAPI, three Foundry agents, Azure AI Search, human review and PDF/Markdown export in one public Azure Container App. See [STATUS.md](STATUS.md) for the completed workflow and historical acceptance results.

## Deployed architecture

![AI Proposal Factory deployed Azure architecture](docs/architecture/ai-proposal-factory.png)

[High-resolution PNG](docs/architecture/ai-proposal-factory.png) · [Editable SVG](docs/architecture/ai-proposal-factory.svg) · [Editable PowerPoint](docs/architecture/ai-proposal-factory.pptx) · [Mermaid](docs/architecture/ai-proposal-factory.mmd)

[Architecture evidence, implementation nuances and editing instructions](docs/architecture/README.md) — the high-level diagram shows one application and its three supporting Azure services; resource-level details and the 22 October 2026 read-only verification remain in the evidence.

## Fixed deployment target

- Existing resource group: `rg-professional-services-04`
- Region: `swedencentral`
- Foundry project: `proj-professional-services-04`
- Networking: public service endpoints with Entra ID, managed identity, and Azure RBAC; no private networking

## Phase 1 deployment

Verify the active subscription and resource group before deploying:

```powershell
az account show
az group show --name rg-professional-services-04
$env:AZURE_PRINCIPAL_ID = az ad signed-in-user show --query id -o tsv
az deployment group create `
  --resource-group rg-professional-services-04 `
  --template-file infra\main.bicep `
  --parameters infra\main.parameters.json deployerPrincipalId=$env:AZURE_PRINCIPAL_ID
```

For `azd`, authenticate and select the existing subscription and resource group:

```powershell
azd auth login
azd env new
azd env set AZURE_LOCATION swedencentral
azd env set AZURE_RESOURCE_GROUP rg-professional-services-04
azd env set AZURE_PRINCIPAL_ID (az ad signed-in-user show --query id -o tsv)
azd provision
```

Never deploy this repository to a different resource group or region without changing the authoritative brief.

The target tenant has a modify policy that disables Storage public network access. The Bicep deployment creates a waiver scoped only to this Storage account and the `StorageAccountPublicNetworkModify` initiative member, then reapplies the required `Enabled` state. Anonymous Blob access and Shared Key access remain disabled.
