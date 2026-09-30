# AI Proposal Factory

AI Proposal Factory is a phased Microsoft Foundry customer demo. Phase 1 contains only the Azure foundation and repository skeleton; no application or runtime agents are implemented yet.

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
