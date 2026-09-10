targetScope = 'subscription'

@description('Azure Developer CLI environment name.')
param environmentName string

@allowed([
  'swedencentral'
])
@description('Primary and only deployment region.')
param location string = 'swedencentral'

@description('Dedicated resource group for this deployment.')
param resourceGroupName string = ''

@description('Globally unique Azure Container Registry name.')
param containerRegistryName string = ''

@description('Container Apps managed environment name.')
param containerEnvironmentName string = ''

@description('Public Container App name.')
param containerAppName string = ''

@description('User-assigned managed identity name.')
param managedIdentityName string = ''

@description('Log Analytics workspace name.')
param logAnalyticsName string = ''

@description('Globally unique Storage Account name.')
param storageAccountName string = ''

@description('Apply the subscription-specific SecurityControl=Ignore tag when an organizational policy requires it.')
param applyStorageSecurityControlException bool = false

@description('Globally unique Azure AI Search service name.')
param searchServiceName string = ''

@allowed([
  'free'
  'basic'
  'standard'
])
@description('Azure AI Search SKU. Basic is the portable default; use Free only when its per-subscription quota is available.')
param searchSku string = 'basic'

@description('Single Azure AI Search index name.')
param searchIndexName string = 'aipf-knowledge'

@description('Globally unique Microsoft Foundry account name and custom subdomain.')
param foundryAccountName string = ''

@description('Microsoft Foundry project name.')
param foundryProjectName string = 'aipf-project'

@description('Foundry model deployment name.')
param modelDeploymentName string = 'gpt-5-mini'

@description('Foundry model catalog name.')
param modelName string = 'gpt-5-mini'

@description('Foundry model catalog format.')
param modelFormat string = 'OpenAI'

@description('Foundry model version available in Sweden Central.')
param modelVersion string = '2025-08-07'

@description('Foundry model deployment SKU/type.')
param modelDeploymentSku string = 'DataZoneStandard'

@minValue(1)
@description('Foundry model deployment capacity in the SKU-specific unit.')
param modelCapacity int = 10

@description('Object ID of the deployment principal used by idempotent post-provision scripts.')
param deploymentPrincipalId string = ''

@allowed([
  'User'
  'ServicePrincipal'
])
@description('Microsoft Entra principal type for deployment-user data-plane RBAC.')
param deploymentPrincipalType string = 'User'

@description('Requirements Analyst prompt agent name.')
param requirementsAgentId string = ''

@description('Proposal Writer prompt agent name.')
param proposalAgentId string = ''

@description('Risk Reviewer prompt agent name.')
param riskAgentId string = ''

@description('Image supplied by azd after packaging. Empty uses a public bootstrap image.')
param appImageName string = ''

var tags = {
  'azd-env-name': environmentName
  project: 'ai-proposal-factory'
}
var uniqueToken = take(uniqueString(subscription().id, environmentName), 8)
var resolvedResourceGroupName = empty(resourceGroupName) ? 'rg-aipf-${environmentName}-swc' : resourceGroupName
var resolvedContainerRegistryName = empty(containerRegistryName) ? 'acraipf${uniqueToken}' : containerRegistryName
var resolvedContainerEnvironmentName = empty(containerEnvironmentName) ? 'cae-aipf-${environmentName}' : containerEnvironmentName
var resolvedContainerAppName = empty(containerAppName) ? 'ca-aipf-${environmentName}' : containerAppName
var resolvedManagedIdentityName = empty(managedIdentityName) ? 'id-aipf-${environmentName}' : managedIdentityName
var resolvedLogAnalyticsName = empty(logAnalyticsName) ? 'law-aipf-${environmentName}' : logAnalyticsName
var resolvedStorageAccountName = empty(storageAccountName) ? 'staipf${uniqueToken}' : storageAccountName
var resolvedSearchServiceName = empty(searchServiceName) ? 'srch-aipf-${uniqueToken}' : searchServiceName
var resolvedFoundryAccountName = empty(foundryAccountName) ? 'aif-aipf-${uniqueToken}' : foundryAccountName

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resolvedResourceGroupName
  location: location
  tags: tags
}

module milestone 'resources.bicep' = {
  name: 'first-public-url'
  scope: resourceGroup
  params: {
    environmentName: environmentName
    location: location
    containerRegistryName: resolvedContainerRegistryName
    containerEnvironmentName: resolvedContainerEnvironmentName
    containerAppName: resolvedContainerAppName
    managedIdentityName: resolvedManagedIdentityName
    logAnalyticsName: resolvedLogAnalyticsName
    storageAccountName: resolvedStorageAccountName
    applyStorageSecurityControlException: applyStorageSecurityControlException
    searchServiceName: resolvedSearchServiceName
    searchSku: searchSku
    searchIndexName: searchIndexName
    foundryAccountName: resolvedFoundryAccountName
    foundryProjectName: foundryProjectName
    modelDeploymentName: modelDeploymentName
    modelName: modelName
    modelFormat: modelFormat
    modelVersion: modelVersion
    modelDeploymentSku: modelDeploymentSku
    modelCapacity: modelCapacity
    deploymentPrincipalId: deploymentPrincipalId
    deploymentPrincipalType: deploymentPrincipalType
    requirementsAgentId: requirementsAgentId
    proposalAgentId: proposalAgentId
    riskAgentId: riskAgentId
    appImageName: appImageName
  }
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP_NAME string = resourceGroup.name
output AZURE_RESOURCE_GROUP string = resourceGroup.name
output AZURE_CONTAINER_REGISTRY_NAME string = milestone.outputs.containerRegistryName
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = milestone.outputs.containerRegistryEndpoint
output AZURE_CONTAINER_ENVIRONMENT_NAME string = milestone.outputs.containerEnvironmentName
output AZURE_CONTAINER_APP_NAME string = milestone.outputs.containerAppName
output SERVICE_APP_NAME string = milestone.outputs.containerAppName
output SERVICE_APP_URI string = milestone.outputs.containerAppUri
output SERVICE_APP_IDENTITY_ID string = milestone.outputs.managedIdentityId
output SERVICE_APP_IDENTITY_CLIENT_ID string = milestone.outputs.managedIdentityClientId
output AZURE_STORAGE_ACCOUNT_NAME string = milestone.outputs.storageAccountName
output AZURE_STORAGE_BLOB_ENDPOINT string = milestone.outputs.storageBlobEndpoint
output AZURE_STORAGE_TABLE_ENDPOINT string = milestone.outputs.storageTableEndpoint
output AZURE_AI_SEARCH_ENDPOINT string = milestone.outputs.searchEndpoint
output AZURE_AI_SEARCH_INDEX_NAME string = searchIndexName
output AZURE_AI_FOUNDRY_ACCOUNT_NAME string = milestone.outputs.foundryAccountName
output AZURE_AI_FOUNDRY_PROJECT_NAME string = milestone.outputs.foundryProjectName
output AZURE_AI_FOUNDRY_PROJECT_ENDPOINT string = milestone.outputs.foundryProjectEndpoint
output AZURE_AI_MODEL_DEPLOYMENT_NAME string = modelDeploymentName
output AZURE_AI_MODEL_NAME string = modelName
output AZURE_AI_MODEL_FORMAT string = modelFormat
output AZURE_AI_MODEL_VERSION string = modelVersion
output AZURE_AI_MODEL_DEPLOYMENT_SKU string = modelDeploymentSku
output AZURE_AI_MODEL_CAPACITY int = modelCapacity
output AZURE_AI_SEARCH_SKU string = searchSku
output AIPF_STORAGE_SECURITY_CONTROL_IGNORE bool = applyStorageSecurityControlException
output AIPF_REQUIREMENTS_AGENT_ID string = requirementsAgentId
output AIPF_PROPOSAL_AGENT_ID string = proposalAgentId
output AIPF_RISK_AGENT_ID string = riskAgentId
