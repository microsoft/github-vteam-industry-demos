// Azure Container Registry for the portal image, plus AcrPull for the app identity.
@description('Azure region.')
param location string

@description('Resource tags.')
param tags object

@description('Container registry name (alphanumeric, globally unique).')
param registryName string

@description('Principal ID of the identity that pulls images.')
param pullIdentityPrincipalId string

resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: registryName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false // pull via managed identity, no admin creds
  }
}

// AcrPull built-in role.
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, pullIdentityPrincipalId, acrPullRoleId)
  scope: registry
  properties: {
    principalId: pullIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
  }
}

output loginServer string = registry.properties.loginServer
output registryName string = registry.name
