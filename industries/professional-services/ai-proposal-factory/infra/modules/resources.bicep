param location string
param environmentName string
param workloadName string
param locationCode string
param uniqueSuffix string
param imageTag string
param webImageRepository string
param apiImageRepository string
param workerImageRepository string
param seederImageRepository string
param generationModelName string
param generationModelVersion string
param generationDeploymentSku string
param generationDeploymentCapacity int
param embeddingModelName string
param embeddingModelVersion string
param embeddingDeploymentSku string
param embeddingDeploymentCapacity int
param deployKeyVault bool
param deployWorkloads bool
param entraClientId string
param entraTenantId string
param tags object

var baseName = '${workloadName}-${environmentName}-${locationCode}'
var storageAccountName = 'st${workloadName}${environmentName}${locationCode}${uniqueSuffix}'
var acrName = 'acr${workloadName}${environmentName}${locationCode}${uniqueSuffix}'
var cosmosAccountName = 'cosmos-${baseName}-${uniqueSuffix}'
var searchServiceName = 'srch-${baseName}-${uniqueSuffix}'
var openAiAccountName = 'aoai-${baseName}-${uniqueSuffix}'
var keyVaultName = 'kv${workloadName}${environmentName}${uniqueSuffix}'

module identities 'identities.bicep' = {
  name: 'identities'
  params: {
    location: location
    baseName: baseName
    tags: tags
  }
}

module monitoring 'monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    baseName: baseName
    tags: tags
    webPrincipalId: identities.outputs.webPrincipalId
    workerPrincipalId: identities.outputs.workerPrincipalId
    seederPrincipalId: identities.outputs.seederPrincipalId
  }
}

module registry 'registry.bicep' = {
  name: 'registry'
  params: {
    location: location
    acrName: acrName
    tags: tags
    webPrincipalId: identities.outputs.webPrincipalId
    workerPrincipalId: identities.outputs.workerPrincipalId
    seederPrincipalId: identities.outputs.seederPrincipalId
  }
}

module storage 'storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    storageAccountName: storageAccountName
    tags: tags
    webPrincipalId: identities.outputs.webPrincipalId
    workerPrincipalId: identities.outputs.workerPrincipalId
    seederPrincipalId: identities.outputs.seederPrincipalId
  }
}

module cosmos 'cosmos.bicep' = {
  name: 'cosmos'
  params: {
    location: location
    cosmosAccountName: cosmosAccountName
    tags: tags
    webPrincipalId: identities.outputs.webPrincipalId
    workerPrincipalId: identities.outputs.workerPrincipalId
    seederPrincipalId: identities.outputs.seederPrincipalId
  }
}

module search 'search.bicep' = {
  name: 'search'
  params: {
    location: location
    searchServiceName: searchServiceName
    tags: tags
    webPrincipalId: identities.outputs.webPrincipalId
    workerPrincipalId: identities.outputs.workerPrincipalId
    seederPrincipalId: identities.outputs.seederPrincipalId
  }
}

module openAi 'openai.bicep' = {
  name: 'openai'
  params: {
    location: location
    accountName: openAiAccountName
    tags: tags
    generationModelName: generationModelName
    generationModelVersion: generationModelVersion
    generationDeploymentSku: generationDeploymentSku
    generationDeploymentCapacity: generationDeploymentCapacity
    embeddingModelName: embeddingModelName
    embeddingModelVersion: embeddingModelVersion
    embeddingDeploymentSku: embeddingDeploymentSku
    embeddingDeploymentCapacity: embeddingDeploymentCapacity
    webPrincipalId: identities.outputs.webPrincipalId
    workerPrincipalId: identities.outputs.workerPrincipalId
    seederPrincipalId: identities.outputs.seederPrincipalId
  }
}

module keyVault 'key-vault.bicep' = if (deployKeyVault) {
  name: 'key-vault'
  params: {
    location: location
    keyVaultName: keyVaultName
    tags: tags
  }
}

module diagnostics 'diagnostics.bicep' = {
  name: 'diagnostics'
  params: {
    acrName: registry.outputs.name
    storageAccountName: storage.outputs.storageAccountName
    cosmosAccountName: cosmos.outputs.accountName
    searchServiceName: search.outputs.name
    openAiAccountName: openAi.outputs.accountName
    workspaceId: monitoring.outputs.logAnalyticsWorkspaceId
  }
}

module containerApps 'container-apps.bicep' = if (deployWorkloads) {
  name: 'container-apps'
  params: {
    location: location
    entraClientId: entraClientId
    entraTenantId: entraTenantId
    baseName: baseName
    tags: tags
    logAnalyticsCustomerId: monitoring.outputs.logAnalyticsCustomerId
    logAnalyticsSharedKey: monitoring.outputs.logAnalyticsSharedKey
    applicationInsightsConnectionString: monitoring.outputs.applicationInsightsConnectionString
    acrLoginServer: registry.outputs.loginServer
    webIdentityId: identities.outputs.webIdentityId
    webIdentityClientId: identities.outputs.webClientId
    workerIdentityId: identities.outputs.workerIdentityId
    workerIdentityClientId: identities.outputs.workerClientId
    seederIdentityId: identities.outputs.seederIdentityId
    seederIdentityClientId: identities.outputs.seederClientId
    imageTag: imageTag
    webImageRepository: webImageRepository
    apiImageRepository: apiImageRepository
    workerImageRepository: workerImageRepository
    seederImageRepository: seederImageRepository
    storageAccountName: storage.outputs.storageAccountName
    blobServiceEndpoint: storage.outputs.blobServiceEndpoint
    queueServiceEndpoint: storage.outputs.queueServiceEndpoint
    cosmosEndpoint: cosmos.outputs.endpoint
    cosmosDatabaseName: cosmos.outputs.databaseName
    searchEndpoint: search.outputs.endpoint
    searchIndexName: search.outputs.indexName
    openAiEndpoint: openAi.outputs.endpoint
    generationDeploymentName: openAi.outputs.generationDeploymentName
    embeddingDeploymentName: openAi.outputs.embeddingDeploymentName
  }
}

output acrName string = registry.outputs.name
output acrLoginServer string = registry.outputs.loginServer
output webImage string = '${registry.outputs.loginServer}/${webImageRepository}:${imageTag}'
output apiImage string = '${registry.outputs.loginServer}/${apiImageRepository}:${imageTag}'
output workerImage string = '${registry.outputs.loginServer}/${workerImageRepository}:${imageTag}'
output seederImage string = '${registry.outputs.loginServer}/${seederImageRepository}:${imageTag}'
output webAppName string = deployWorkloads ? containerApps!.outputs.webAppName : ''
output webAppFqdn string = deployWorkloads ? containerApps!.outputs.webAppFqdn : ''
output webAppUrl string = deployWorkloads ? containerApps!.outputs.webAppUrl : ''
output workerAppName string = deployWorkloads ? containerApps!.outputs.workerAppName : ''
output seedJobName string = deployWorkloads ? containerApps!.outputs.seedJobName : ''
output storageAccountName string = storage.outputs.storageAccountName
output blobServiceEndpoint string = storage.outputs.blobServiceEndpoint
output queueServiceEndpoint string = storage.outputs.queueServiceEndpoint
output uploadsContainerName string = storage.outputs.uploadsContainerName
output reusableContentContainerName string = storage.outputs.reusableContentContainerName
output exportsContainerName string = storage.outputs.exportsContainerName
output jobsQueueName string = storage.outputs.jobsQueueName
output cosmosAccountName string = cosmos.outputs.accountName
output cosmosEndpoint string = cosmos.outputs.endpoint
output cosmosDatabaseName string = cosmos.outputs.databaseName
output searchServiceName string = search.outputs.name
output searchEndpoint string = search.outputs.endpoint
output searchIndexName string = search.outputs.indexName
output openAiAccountName string = openAi.outputs.accountName
output openAiEndpoint string = openAi.outputs.endpoint
output generationDeploymentName string = openAi.outputs.generationDeploymentName
output embeddingDeploymentName string = openAi.outputs.embeddingDeploymentName
output applicationInsightsName string = monitoring.outputs.applicationInsightsName
output logAnalyticsWorkspaceName string = monitoring.outputs.logAnalyticsWorkspaceName
output webIdentityClientId string = identities.outputs.webClientId
output workerIdentityClientId string = identities.outputs.workerClientId
output seederIdentityClientId string = identities.outputs.seederClientId
output keyVaultName string = deployKeyVault ? keyVault!.outputs.name : ''
