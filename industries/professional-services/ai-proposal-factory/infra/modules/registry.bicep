param location string
param acrName string
param tags object
param webPrincipalId string
param workerPrincipalId string
param seederPrincipalId string

var acrPullRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    policies: {
      retentionPolicy: {
        days: 7
        status: 'disabled'
      }
      trustPolicy: {
        type: 'Notary'
        status: 'disabled'
      }
    }
  }
}

resource webPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, webPrincipalId, acrPullRoleId)
  scope: registry
  properties: {
    principalId: webPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleId
  }
}

resource workerPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, workerPrincipalId, acrPullRoleId)
  scope: registry
  properties: {
    principalId: workerPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleId
  }
}

resource seederPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, seederPrincipalId, acrPullRoleId)
  scope: registry
  properties: {
    principalId: seederPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleId
  }
}

output name string = registry.name
output loginServer string = registry.properties.loginServer
