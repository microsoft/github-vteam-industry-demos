targetScope = 'subscription'

@description('Azure region. Sweden Central is the only permitted deployment region.')
@allowed([
  'swedencentral'
])
param location string = 'swedencentral'

@description('Deployment environment name.')
@allowed([
  'dev'
])
param environmentName string = 'dev'

@description('Dedicated resource group name.')
param resourceGroupName string = 'rg-aipf-dev-swc-001'

@description('Verified subscription-derived suffix used for globally unique names.')
param uniqueSuffix string = 'e2d6ac891bb7'

@description('Immutable container image tag produced by the application build.')
@minLength(7)
@maxLength(128)
param imageTag string

@description('ACR repository containing the web reverse-proxy image.')
param webImageRepository string = 'aipf-web'

@description('ACR repository containing the API image.')
param apiImageRepository string = 'aipf-api'

@description('ACR repository containing the worker image.')
param workerImageRepository string = 'aipf-worker'

@description('ACR repository containing the synthetic-data seeder image.')
param seederImageRepository string = 'aipf-seeder'

@description('Generation model name.')
param generationModelName string = 'gpt-5.1'

@description('Pinned generation model version.')
param generationModelVersion string = '2025-11-13'

@description('Generation deployment SKU.')
param generationDeploymentSku string = 'Standard'

@description('Generation deployment capacity.')
param generationDeploymentCapacity int = 50

@description('Embedding model name.')
param embeddingModelName string = 'text-embedding-3-large'

@description('Pinned embedding model version.')
param embeddingModelVersion string = '1'

@description('Embedding deployment SKU.')
param embeddingDeploymentSku string = 'Standard'

@description('Embedding deployment capacity.')
param embeddingDeploymentCapacity int = 30

@description('Deploy an empty Key Vault only after an application secret requirement is approved.')
param deployKeyVault bool = false

@description('Deploy Container Apps and the seed job. Set false for the initial ACR bootstrap stage.')
param deployWorkloads bool = true

@description('Dedicated single-tenant end-user Entra registration, NOT a managed identity or CI client ID. Bootstrap before deploying workloads.')
@minLength(36)
@maxLength(36)
param entraClientId string

var workloadName = 'aipf'
var locationCode = 'swc'
var commonTags = {
  application: 'AI Proposal Factory'
  workload: workloadName
  environment: environmentName
  region: location
  managedBy: 'Bicep'
  purpose: 'Professional Services customer demo'
}

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: commonTags
}

module resources 'modules/resources.bicep' = {
  name: 'aipf-${environmentName}-${locationCode}'
  scope: resourceGroup
  params: {
    location: location
    environmentName: environmentName
    workloadName: workloadName
    locationCode: locationCode
    uniqueSuffix: uniqueSuffix
    imageTag: imageTag
    webImageRepository: webImageRepository
    apiImageRepository: apiImageRepository
    workerImageRepository: workerImageRepository
    seederImageRepository: seederImageRepository
    generationModelName: generationModelName
    generationModelVersion: generationModelVersion
    generationDeploymentSku: generationDeploymentSku
    generationDeploymentCapacity: generationDeploymentCapacity
    embeddingModelName: embeddingModelName
    embeddingModelVersion: embeddingModelVersion
    embeddingDeploymentSku: embeddingDeploymentSku
    embeddingDeploymentCapacity: embeddingDeploymentCapacity
    deployKeyVault: deployKeyVault
    deployWorkloads: deployWorkloads
    entraClientId: entraClientId
    entraTenantId: tenant().tenantId
    tags: commonTags
  }
}

output resourceGroupName string = resourceGroup.name
output location string = location
output acrName string = resources.outputs.acrName
output acrLoginServer string = resources.outputs.acrLoginServer
output webImage string = resources.outputs.webImage
output apiImage string = resources.outputs.apiImage
output workerImage string = resources.outputs.workerImage
output seederImage string = resources.outputs.seederImage
output webAppName string = resources.outputs.webAppName
output webAppFqdn string = resources.outputs.webAppFqdn
output webAppUrl string = resources.outputs.webAppUrl
output workerAppName string = resources.outputs.workerAppName
output seedJobName string = resources.outputs.seedJobName
output storageAccountName string = resources.outputs.storageAccountName
output blobServiceEndpoint string = resources.outputs.blobServiceEndpoint
output queueServiceEndpoint string = resources.outputs.queueServiceEndpoint
output uploadsContainerName string = resources.outputs.uploadsContainerName
output reusableContentContainerName string = resources.outputs.reusableContentContainerName
output exportsContainerName string = resources.outputs.exportsContainerName
output jobsQueueName string = resources.outputs.jobsQueueName
output cosmosAccountName string = resources.outputs.cosmosAccountName
output cosmosEndpoint string = resources.outputs.cosmosEndpoint
output cosmosDatabaseName string = resources.outputs.cosmosDatabaseName
output searchServiceName string = resources.outputs.searchServiceName
output searchEndpoint string = resources.outputs.searchEndpoint
output searchIndexName string = resources.outputs.searchIndexName
output openAiAccountName string = resources.outputs.openAiAccountName
output openAiEndpoint string = resources.outputs.openAiEndpoint
output generationDeploymentName string = resources.outputs.generationDeploymentName
output embeddingDeploymentName string = resources.outputs.embeddingDeploymentName
output applicationInsightsName string = resources.outputs.applicationInsightsName
output logAnalyticsWorkspaceName string = resources.outputs.logAnalyticsWorkspaceName
output webIdentityClientId string = resources.outputs.webIdentityClientId
output workerIdentityClientId string = resources.outputs.workerIdentityClientId
output seederIdentityClientId string = resources.outputs.seederIdentityClientId
output keyVaultName string = resources.outputs.keyVaultName
