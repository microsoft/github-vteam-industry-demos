# Azure infrastructure

The infrastructure is split into two idempotent resource-group templates:

- `foundation.bicep` creates Microsoft Foundry, its project and model deployment,
  ACR, the user-assigned runtime identity, Log Analytics, Application Insights,
  and foundation RBAC.
- `main.bicep` creates the durable private runtime path: Storage, VNet/subnets,
  Blob private endpoint/DNS, runtime RBAC, Container Apps environment, and
  optionally the application.

`deploy.ps1` preserves the current deployment defaults, but every subscription,
region, resource name, model property, capacity, CIDR, image coordinate, replica
count, access mode, and public origin can be supplied explicitly. Resource
group location is the foundation deployment location; runtime resources can use
a different region.

## Fresh-specialist preflight

Required local tools are PowerShell 7, Azure CLI with the Container Apps
extension, Bicep CLI through `az bicep`, Node.js 22 or later, and npm.

Select a subscription explicitly and choose globally unique Foundry, ACR, and
Storage names. Inspect provider registration, model catalog/quota, visible
policy assignments, role permissions, name availability, CIDR overlap, and the
public-demo versus Entra choice without changing Azure:

```powershell
$subscriptionId = '<subscription-id>'
$resourceGroup = '<new-resource-group>'
$foundationRegion = '<foundry-and-acr-region>'
$runtimeRegion = '<container-apps-region>'

.\infra\preflight.ps1 `
  -SubscriptionId $subscriptionId `
  -ResourceGroupName $resourceGroup `
  -FoundationLocation $foundationRegion `
  -RuntimeLocation $runtimeRegion `
  -FoundryAccountName '<globally-unique-foundry-name>' `
  -ContainerRegistryName '<globally-unique-acr-name>' `
  -StorageAccountName '<globally-unique-storage-name>' `
  -ModelName 'gpt-4.1-mini' `
  -ModelVersion '2025-04-14' `
  -ModelSkuName 'Standard' `
  -ModelCapacity 10 `
  -VirtualNetworkAddressPrefix '10.60.0.0/26' `
  -ContainerAppsSubnetPrefix '10.60.0.0/27' `
  -PrivateEndpointSubnetPrefix '10.60.0.32/28' `
  -AccessMode entra
```

Preflight is read-only and never registers providers. A deployment operator must
resolve every reported issue first. In particular:

- required providers must already be `Registered`;
- the model/version/SKU must be present in the foundation region and quota must
  cover the requested capacity;
- the operator needs resource deployment plus
  `Microsoft.Authorization/roleAssignments/write`;
- subscription or management-group policy must permit the selected locations,
  private networking, Storage posture, Foundry, ACR, and Container Apps;
- the VNet and both subnets must be non-overlapping and must not overlap visible
  connected networks;
- Entra mode additionally requires Microsoft Graph application permissions;
- public-demo mode requires the exact final HTTPS origin.

Preflight can only compare Azure networks visible to the current principal.
Confirm on-premises, ExpressRoute, VPN, peered-subscription, and centrally
managed IP ranges with the network owner.

## Reproducible deployment sequence

Create the empty resource group in the chosen foundation region, then run
validation and what-if before each mutation:

```powershell
az account set --subscription $subscriptionId
az group create --name $resourceGroup --location $foundationRegion

.\infra\deploy.ps1 -SubscriptionId $subscriptionId `
  -ResourceGroupName $resourceGroup `
  -FoundationLocation $foundationRegion -RuntimeLocation $runtimeRegion `
  -Stage foundation -Mode validate <# all chosen name/model parameters #>
.\infra\deploy.ps1 -SubscriptionId $subscriptionId `
  -ResourceGroupName $resourceGroup `
  -FoundationLocation $foundationRegion -RuntimeLocation $runtimeRegion `
  -Stage foundation -Mode what-if <# same parameters #>
.\infra\deploy.ps1 -SubscriptionId $subscriptionId `
  -ResourceGroupName $resourceGroup `
  -FoundationLocation $foundationRegion -RuntimeLocation $runtimeRegion `
  -Stage foundation -Mode deploy <# same parameters #>
```

Capture the JSON outputs. Use `foundryProjectEndpoint` and
`modelDeploymentName` to provision the two prompt agents from `app/` after the
operator has Foundry User at project scope:

```powershell
$env:FOUNDRY_PROJECT_ENDPOINT = '<foundation-output>'
$env:FOUNDRY_MODEL_DEPLOYMENT = '<foundation-output>'
npm run provision:agents
```

Deploy the private path in order, repeating all selected resource names and
CIDRs on every call:

```powershell
foreach ($stage in 'network','environment') {
  .\infra\deploy.ps1 -SubscriptionId $subscriptionId `
    -ResourceGroupName $resourceGroup `
    -FoundationLocation $foundationRegion -RuntimeLocation $runtimeRegion `
    -Stage $stage -Mode validate <# all chosen parameters #>
  .\infra\deploy.ps1 -SubscriptionId $subscriptionId `
    -ResourceGroupName $resourceGroup `
    -FoundationLocation $foundationRegion -RuntimeLocation $runtimeRegion `
    -Stage $stage -Mode what-if <# same parameters #>
  .\infra\deploy.ps1 -SubscriptionId $subscriptionId `
    -ResourceGroupName $resourceGroup `
    -FoundationLocation $foundationRegion -RuntimeLocation $runtimeRegion `
    -Stage $stage -Mode deploy <# same parameters #>
}
```

Build an immutable image tag only after application integration is complete.
Supply both repository and tag to application validation, what-if, and deploy.
Never use `latest`.

For a fresh Container App, its generated FQDN is not knowable before creation.
Use an Entra-first application deployment:

```powershell
.\infra\deploy.ps1 <# common parameters #> `
  -Stage application -Mode validate `
  -AccessMode entra -PublicDemoOrigin '' `
  -ContainerImageRepository 'inventory-command-center' `
  -ContainerImageTag '<immutable-tag>'
.\infra\deploy.ps1 <# common parameters #> `
  -Stage application -Mode what-if `
  -AccessMode entra -PublicDemoOrigin '' `
  -ContainerImageRepository 'inventory-command-center' `
  -ContainerImageTag '<immutable-tag>'
.\infra\deploy.ps1 <# common parameters #> `
  -Stage application -Mode deploy `
  -AccessMode entra -PublicDemoOrigin '' `
  -ContainerImageRepository 'inventory-command-center' `
  -ContainerImageTag '<immutable-tag>'
```

Discover the FQDN from Azure rather than constructing it:

```powershell
$fqdn = az containerapp show --subscription $subscriptionId `
  --resource-group $resourceGroup --name '<container-app-name>' `
  --query properties.configuration.ingress.fqdn --output tsv
$origin = "https://$fqdn"
```

Choose one final access path:

- **Entra:** run `configure-auth.ps1`; it discovers the FQDN and preserves
  existing callbacks.
- **Public demo:** rerun application validate/what-if/deploy with
  `-AccessMode public-demo -PublicDemoOrigin $origin`, then run
  `configure-public-demo.ps1`. The latter disables Easy Auth and removes only
  the named unused secret/credential while retaining rollback assets.

For the existing Phase 2 deployment, keep its current explicit origin and
resource-name parameters; no Entra-first bootstrap is required.

## Validation and safety

Every what-if must have zero deletes unless an independently approved change
requires otherwise. Storage must remain public-network disabled, shared-key
disabled, OAuth-default, Blob-public-access disabled, and default deny.
Container Apps reaches Blob through private DNS and the private endpoint.

`deploy.ps1` emits deployment outputs after successful deploys. Additional
runtime checks and the exact reset sequence are in `docs/DEPLOYMENT.md`.
