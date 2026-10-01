targetScope = 'resourceGroup'

@allowed([
  'swedencentral'
])
param location string = 'swedencentral'

@allowed([
  'norwayeast'
  'northeurope'
  'westeurope'
  'germanywestcentral'
])
param containerAppsLocation string = 'norwayeast'

param containerAppsEnvironmentName string = 'cae-kyc-fs01-norwayeast'
param foundryName string = 'foundry-financial-services-01'
param foundryProjectName string = 'proj-financial-services-01'
param modelDeploymentName string = 'gpt-5-mini'
param modelDeploymentCapacity int = 20
param foundryAgentDocumentVersion string = ''
param foundryAgentCompletenessVersion string = ''
param foundryAgentRiskVersion string = ''
param foundryAgentSummaryVersion string = ''
param provisionFoundation bool = false
param provisionContainerEnvironment bool = true
param applicationImage string = ''

var suffix = uniqueString(subscription().id, resourceGroup().id)
var storageAccountName = 'stkycfs01${suffix}'
var documentIntelligenceName = 'di-kyc-fs01-${suffix}'
var searchServiceName = 'srch-kyc-fs01-${suffix}'
var containerRegistryName = 'acrkycfs01${suffix}'
var tags = {
  project: 'kyc-case-investigation-cockpit'
  industry: 'financial-services'
  purpose: 'customer-demo'
  environment: 'dev'
  'managed-by': 'azd'
}

resource workloadIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = if (provisionFoundation) {
  name: 'id-kyc-fs01'
  location: location
  tags: tags
}

resource existingWorkloadIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = if (!provisionFoundation) {
  name: 'id-kyc-fs01'
}

resource existingDocumentIntelligence 'Microsoft.CognitiveServices/accounts@2025-06-01' existing = {
  name: documentIntelligenceName
}

resource existingRegistry 'Microsoft.ContainerRegistry/registries@2025-04-01' existing = {
  name: containerRegistryName
}

var workloadIdentityId = provisionFoundation ? workloadIdentity!.id : existingWorkloadIdentity!.id
var workloadPrincipalId = provisionFoundation ? workloadIdentity!.properties.principalId : existingWorkloadIdentity!.properties.principalId

module platform 'modules/platform.bicep' = if (provisionFoundation) {
  name: 'phase1-platform'
  params: {
    location: location
    suffix: suffix
    tags: tags
    workloadPrincipalId: workloadPrincipalId
  }
}

module hostingNetwork 'modules/hosting-network.bicep' = {
  name: 'phase2-hosting-network'
  params: {
    location: containerAppsLocation
    tags: tags
    storageAccountId: resourceId('Microsoft.Storage/storageAccounts', storageAccountName)
  }
}

module containerEnvironment 'modules/container-environment.bicep' = {
  name: 'phase2-container-environment-reference'
  params: {
    location: containerAppsLocation
    environmentName: containerAppsEnvironmentName
    infrastructureSubnetId: hostingNetwork.outputs.containerAppsSubnetId
    tags: tags
    provision: provisionContainerEnvironment
  }
}

module application 'modules/application.bicep' = {
  name: 'phase2-application'
  params: {
    containerAppsLocation: containerAppsLocation
    tags: tags
    environmentId: containerEnvironment.outputs.id
    workloadIdentityId: workloadIdentityId
    registryLoginServer: existingRegistry.properties.loginServer
    storageAccountName: storageAccountName
    documentIntelligenceEndpoint: existingDocumentIntelligence.properties.endpoint
    foundryProjectEndpoint: 'https://${foundryName}.services.ai.azure.com/api/projects/${foundryProjectName}'
    modelDeploymentName: modelDeploymentName
    foundryAgentDocumentVersion: foundryAgentDocumentVersion
    foundryAgentCompletenessVersion: foundryAgentCompletenessVersion
    foundryAgentRiskVersion: foundryAgentRiskVersion
    foundryAgentSummaryVersion: foundryAgentSummaryVersion
    searchEndpoint: 'https://${searchServiceName}.search.windows.net'
    imageName: applicationImage
  }
}

module phase3 'modules/phase3.bicep' = {
  name: 'phase3-ai-access'
  params: {
    foundryName: foundryName
    modelDeploymentName: modelDeploymentName
    modelDeploymentCapacity: modelDeploymentCapacity
    searchServiceName: searchServiceName
    workloadPrincipalId: workloadPrincipalId
  }
}

module foundry 'modules/foundry.bicep' = if (provisionFoundation) {
  name: 'phase1-foundry'
  params: {
    location: location
    tags: tags
    foundryName: foundryName
    projectName: foundryProjectName
    modelDeploymentName: modelDeploymentName
    modelDeploymentCapacity: modelDeploymentCapacity
    workloadPrincipalId: workloadPrincipalId
  }
}

output location string = location
output containerAppsLocation string = containerAppsLocation
output managedIdentityName string = 'id-kyc-fs01'
output containerAppsEnvironmentName string = containerEnvironment.outputs.name
output storageAccountName string = storageAccountName
output documentIntelligenceName string = documentIntelligenceName
output searchServiceName string = searchServiceName
output foundryName string = foundryName
output foundryProjectName string = foundryProjectName
output modelDeploymentName string = modelDeploymentName
output applicationName string = application.outputs.applicationName
output applicationUrl string = application.outputs.applicationUrl
output containerRegistryName string = containerRegistryName
output containerRegistryLoginServer string = existingRegistry.properties.loginServer
