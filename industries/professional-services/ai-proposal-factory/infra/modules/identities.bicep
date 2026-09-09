param location string
param baseName string
param tags object

resource webIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${baseName}-web-001'
  location: location
  tags: tags
}

resource workerIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${baseName}-worker-001'
  location: location
  tags: tags
}

resource seederIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${baseName}-seed-001'
  location: location
  tags: tags
}

output webIdentityId string = webIdentity.id
output webPrincipalId string = webIdentity.properties.principalId
output webClientId string = webIdentity.properties.clientId
output workerIdentityId string = workerIdentity.id
output workerPrincipalId string = workerIdentity.properties.principalId
output workerClientId string = workerIdentity.properties.clientId
output seederIdentityId string = seederIdentity.id
output seederPrincipalId string = seederIdentity.properties.principalId
output seederClientId string = seederIdentity.properties.clientId
