param location string
param name string
param runtimePrincipalId string
param deployerPrincipalId string = ''
param tags object

var searchIndexDataContributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8ebe5a00-799e-43f5-93ac-243d3dce84a7')
var searchServiceContributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7ca78c08-252a-4471-8644-bb5ff32d4ba0')

resource service 'Microsoft.Search/searchServices@2025-05-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'basic'
  }
  properties: {
    disableLocalAuth: true
    hostingMode: 'Default'
    partitionCount: 1
    publicNetworkAccess: 'Enabled'
    replicaCount: 1
    semanticSearch: 'free'
  }
}

resource runtimeRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(service.id, runtimePrincipalId, searchIndexDataContributorRoleId)
  scope: service
  properties: {
    principalId: runtimePrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: searchIndexDataContributorRoleId
  }
}

resource deployerIndexRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerPrincipalId)) {
  name: guid(service.id, deployerPrincipalId, searchIndexDataContributorRoleId)
  scope: service
  properties: {
    principalId: deployerPrincipalId
    principalType: 'User'
    roleDefinitionId: searchIndexDataContributorRoleId
  }
}

resource deployerServiceRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerPrincipalId)) {
  name: guid(service.id, deployerPrincipalId, searchServiceContributorRoleId)
  scope: service
  properties: {
    principalId: deployerPrincipalId
    principalType: 'User'
    roleDefinitionId: searchServiceContributorRoleId
  }
}

output id string = service.id
output name string = service.name
output endpoint string = 'https://${service.name}.search.windows.net'
