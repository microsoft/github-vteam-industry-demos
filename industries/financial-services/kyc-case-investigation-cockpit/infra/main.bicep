targetScope = 'subscription'

@description('Deployment environment name.')
param environmentName string

@description('Primary and only deployment region.')
@allowed([
  'swedencentral'
])
param location string = 'swedencentral'

@description('Object ID of the user or service principal running azd.')
param deploymentPrincipalId string

@description('Name of the Azure OpenAI model deployment.')
param modelDeploymentName string = 'gpt-5-1-kyc'

@description('Azure OpenAI model name available in Sweden Central.')
param modelName string = 'gpt-5.1'

@description('Azure OpenAI model version available in Sweden Central.')
param modelVersion string = '2025-11-13'

@description('Model deployment capacity represented as a string for azd substitution.')
param modelCapacity string = '3'

param extractAgentName string = 'agt-kyc-extract'
param completeAgentName string = 'agt-kyc-complete'
param riskAgentName string = 'agt-kyc-risk'
param summaryAgentName string = 'agt-kyc-summary'

@description('Initial image. azd replaces this with the image built from the root Dockerfile.')
param webImageName string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Deploy Azure AI Search when Sweden Central has capacity.')
param deploySearch bool = false

var environmentToken = take(replace(toLower(environmentName), '-', ''), 8)
var resourceSuffix = take(uniqueString(subscription().subscriptionId, environmentName, location), 6)
var resourceGroupName = 'rg-kyc-${environmentToken}-${resourceSuffix}-swc'

var tags = {
  project: 'kyc-case-investigation-cockpit'
  industry: 'financial-services'
  purpose: 'customer-demo'
  environment: environmentName
  'managed-by': 'azd'
}

resource resourceGroup 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module core './modules/core.bicep' = {
  name: 'kyc-core-${environmentName}'
  scope: resourceGroup
  params: {
    environmentName: environmentName
    location: location
    resourceSuffix: resourceSuffix
    tags: tags
    webImageName: webImageName
    deploySearch: deploySearch
    deploymentPrincipalId: deploymentPrincipalId
    modelDeploymentName: modelDeploymentName
    modelName: modelName
    modelVersion: modelVersion
    modelCapacity: int(modelCapacity)
    extractAgentName: extractAgentName
    completeAgentName: completeAgentName
    riskAgentName: riskAgentName
    summaryAgentName: summaryAgentName
  }
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = resourceGroup.name
output AZURE_CONTAINER_APP_NAME string = core.outputs.containerAppName
output AZURE_CONTAINER_APP_ENVIRONMENT_NAME string = core.outputs.containerAppsEnvironmentName
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = core.outputs.containerRegistryEndpoint
output AZURE_STORAGE_ACCOUNT_NAME string = core.outputs.storageAccountName
output AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT string = core.outputs.documentIntelligenceEndpoint
output AZURE_AI_FOUNDRY_ENDPOINT string = core.outputs.foundryEndpoint
output AZURE_AI_FOUNDRY_PROJECT_NAME string = core.outputs.foundryProjectName
output AZURE_AI_PROJECT_ENDPOINT string = core.outputs.foundryProjectEndpoint
output AZURE_AI_MODEL_DEPLOYMENT_NAME string = core.outputs.modelDeploymentName
output AZURE_AI_SEARCH_ENDPOINT string = core.outputs.searchEndpoint
output FOUNDRY_AGENT_EXTRACT string = extractAgentName
output FOUNDRY_AGENT_COMPLETE string = completeAgentName
output FOUNDRY_AGENT_RISK string = riskAgentName
output FOUNDRY_AGENT_SUMMARY string = summaryAgentName
output SERVICE_WEB_URI string = core.outputs.containerAppUrl
