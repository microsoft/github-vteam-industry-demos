// ─────────────────────────────────────────────────────────────────────────────
// ClaimProcessing — main infrastructure (Tank / Azure Architect)
//
// Deploys the whole architecture:
//   • Microsoft AI Foundry account (AIServices) + project + model deployment
//   • Blazor portal on Azure Container Apps (serverless — no VM quota needed)
//   • Azure Container Registry for the portal image
//   • Log Analytics + Application Insights (observability)
//   • One user-assigned identity used for ACR pull + token access to Foundry
//   • RBAC: identity → Azure AI Developer + Cognitive Services User on Foundry
//
// Scope is the subscription: azd/az creates the resource group, then the modules
// fill it. Deploy with `azd up` or `az deployment sub create`.
// ─────────────────────────────────────────────────────────────────────────────
targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the azd environment — used to derive resource names and tags.')
param environmentName string

@minLength(1)
@description('Primary Azure region for all resources.')
param location string

@description('Object ID of the user/service principal running the deployment. Granted data-plane access to Foundry so you can manage agents from your machine. Leave blank to skip.')
param principalId string = ''

@description('Foundry model to deploy (must be available in the target region).')
param modelName string = 'gpt-5-mini'

@description('Model version for the deployment.')
param modelVersion string = '2025-08-07'

@description('Model deployment (TPM) capacity, in thousands of tokens per minute.')
param modelCapacity int = 30

@description('Container image for the portal. Defaults to a public placeholder for the first provision; the real image is built + pushed by azd/az acr build, then redeployed.')
param containerImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Foundry agent ID injected into the app (set by the postprovision hook after the agent is created).')
param foundryAgentId string = ''

// Deterministic, collision-resistant token for globally-unique resource names.
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var abbrs = loadJsonContent('abbreviations.json')
var tags = {
  'azd-env-name': environmentName
  project: 'ClaimProcessing'
  workload: 'claim-processing'
}

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: '${abbrs.resourceGroup}${environmentName}'
  location: location
  tags: tags
}

// ── Shared managed identity (ACR pull + Foundry access) ──────────────────────
module identity 'modules/identity.bicep' = {
  name: 'identity'
  scope: rg
  params: {
    location: location
    tags: tags
    managedIdentityName: '${abbrs.managedIdentityUserAssigned}${resourceToken}'
  }
}

// ── Observability ────────────────────────────────────────────────────────────
module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: rg
  params: {
    location: location
    tags: tags
    logAnalyticsName: '${abbrs.logAnalyticsWorkspace}${resourceToken}'
    applicationInsightsName: '${abbrs.applicationInsights}${resourceToken}'
  }
}

// ── Microsoft AI Foundry: account + project + model ──────────────────────────
module foundry 'modules/ai-foundry.bicep' = {
  name: 'ai-foundry'
  scope: rg
  params: {
    location: location
    tags: tags
    foundryAccountName: '${abbrs.cognitiveServicesFoundry}${resourceToken}'
    projectName: 'claim-processing'
    modelName: modelName
    modelVersion: modelVersion
    modelCapacity: modelCapacity
  }
}

// ── Container registry (image pulled by the app identity) ────────────────────
module registry 'modules/registry.bicep' = {
  name: 'registry'
  scope: rg
  params: {
    location: location
    tags: tags
    registryName: 'cr${resourceToken}'
    pullIdentityPrincipalId: identity.outputs.principalId
  }
}

// ── Compute: Container Apps hosting the Blazor portal ────────────────────────
module app 'modules/container-app.bicep' = {
  name: 'container-app'
  scope: rg
  params: {
    location: location
    tags: tags
    environmentName: 'cae-${resourceToken}'
    containerAppName: 'ca-web-${resourceToken}'
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    identityId: identity.outputs.id
    identityClientId: identity.outputs.clientId
    registryLoginServer: registry.outputs.loginServer
    containerImage: containerImage
    applicationInsightsConnectionString: monitoring.outputs.applicationInsightsConnectionString
    foundryProjectEndpoint: foundry.outputs.projectEndpoint
    foundryModelName: modelName
    foundryAgentId: foundryAgentId
  }
}

// ── RBAC: grant identities data-plane access to Foundry ──────────────────────
module rbac 'modules/rbac.bicep' = {
  name: 'rbac'
  scope: rg
  params: {
    foundryAccountName: foundry.outputs.foundryAccountName
    appIdentityPrincipalId: identity.outputs.principalId
    deployerPrincipalId: principalId
  }
}

// ── Outputs consumed by azd env + postprovision hook + app config ────────────
output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_TENANT_ID string = tenant().tenantId

output AZURE_AI_FOUNDRY_NAME string = foundry.outputs.foundryAccountName
output AZURE_AI_PROJECT_NAME string = foundry.outputs.projectName
output AZURE_AI_PROJECT_ENDPOINT string = foundry.outputs.projectEndpoint
output FOUNDRY_ENDPOINT string = foundry.outputs.projectEndpoint
output FOUNDRY_MODEL_NAME string = modelName

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = registry.outputs.loginServer
output AZURE_CONTAINER_REGISTRY_NAME string = registry.outputs.registryName

output SERVICE_WEB_NAME string = app.outputs.containerAppName
output SERVICE_WEB_URI string = app.outputs.containerAppUri
output WEB_APP_IDENTITY_PRINCIPAL_ID string = identity.outputs.principalId

output APPLICATIONINSIGHTS_CONNECTION_STRING string = monitoring.outputs.applicationInsightsConnectionString
