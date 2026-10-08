// User-assigned managed identity shared by the container app: used for both
// ACR pull and token-based access to Microsoft AI Foundry (no secrets).
@description('Azure region.')
param location string

@description('Resource tags.')
param tags object

@description('User-assigned managed identity name.')
param managedIdentityName string

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: managedIdentityName
  location: location
  tags: tags
}

output id string = identity.id
output principalId string = identity.properties.principalId
output clientId string = identity.properties.clientId
