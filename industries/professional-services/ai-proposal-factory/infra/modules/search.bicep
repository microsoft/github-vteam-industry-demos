param location string
param searchServiceName string
param tags object
param webPrincipalId string
param workerPrincipalId string
param seederPrincipalId string

var indexDataReaderRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '1407120a-92aa-4202-b7e9-c0e197c71c8f'
)
var indexDataContributorRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '8ebe5a00-799e-43f5-93ac-243d3dce84a7'
)
var searchServiceContributorRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7ca78c08-252a-4471-8644-bb5ff32d4ba0'
)

resource search 'Microsoft.Search/searchServices@2023-11-01' = {
  name: searchServiceName
  location: location
  tags: tags
  sku: {
    name: 'basic'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    disableLocalAuth: true
    hostingMode: 'default'
    partitionCount: 1
    publicNetworkAccess: 'enabled'
    replicaCount: 1
  }
}

resource webIndexReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(search.id, webPrincipalId, indexDataReaderRoleId)
  scope: search
  properties: {
    principalId: webPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: indexDataReaderRoleId
  }
}

resource workerIndexReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(search.id, workerPrincipalId, indexDataReaderRoleId)
  scope: search
  properties: {
    principalId: workerPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: indexDataReaderRoleId
  }
}

resource seederIndexWriter 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(search.id, seederPrincipalId, indexDataContributorRoleId)
  scope: search
  properties: {
    principalId: seederPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: indexDataContributorRoleId
  }
}

resource seederSearchManager 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(search.id, seederPrincipalId, searchServiceContributorRoleId)
  scope: search
  properties: {
    principalId: seederPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: searchServiceContributorRoleId
  }
}

output name string = search.name
output endpoint string = 'https://${search.name}.search.windows.net'
output indexName string = 'proposal-knowledge-v1'
