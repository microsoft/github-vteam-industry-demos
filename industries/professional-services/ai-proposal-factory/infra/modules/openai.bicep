param location string
param accountName string
param tags object
param generationModelName string
param generationModelVersion string
param generationDeploymentSku string
param generationDeploymentCapacity int
param embeddingModelName string
param embeddingModelVersion string
param embeddingDeploymentSku string
param embeddingDeploymentCapacity int
param webPrincipalId string
param workerPrincipalId string
param seederPrincipalId string

var openAiUserRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
)
var generationDeploymentName = 'proposal-chat'
var embeddingDeploymentName = 'proposal-embeddings'

resource account 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: accountName
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: accountName
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
    restrictOutboundNetworkAccess: false
  }
}

resource generation 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: account
  name: generationDeploymentName
  sku: {
    name: generationDeploymentSku
    capacity: generationDeploymentCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: generationModelName
      version: generationModelVersion
    }
    versionUpgradeOption: 'NoAutoUpgrade'
  }
}

resource embeddings 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: account
  name: embeddingDeploymentName
  sku: {
    name: embeddingDeploymentSku
    capacity: embeddingDeploymentCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: embeddingModelName
      version: embeddingModelVersion
    }
    versionUpgradeOption: 'NoAutoUpgrade'
  }
  dependsOn: [
    generation
  ]
}

resource webOpenAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(account.id, webPrincipalId, openAiUserRoleId)
  scope: account
  properties: {
    principalId: webPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: openAiUserRoleId
  }
}

resource workerOpenAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(account.id, workerPrincipalId, openAiUserRoleId)
  scope: account
  properties: {
    principalId: workerPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: openAiUserRoleId
  }
}

resource seederOpenAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(account.id, seederPrincipalId, openAiUserRoleId)
  scope: account
  properties: {
    principalId: seederPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: openAiUserRoleId
  }
}

output accountName string = account.name
output endpoint string = account.properties.endpoint
output generationDeploymentName string = generation.name
output embeddingDeploymentName string = embeddings.name
