param location string
param environmentName string
param infrastructureSubnetId string
param tags object
param provision bool = true

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = if (provision) {
  name: environmentName
  location: location
  tags: tags
  properties: {
    zoneRedundant: false
    vnetConfiguration: {
      infrastructureSubnetId: infrastructureSubnetId
      internal: false
    }
  }
}

resource existingEnvironment 'Microsoft.App/managedEnvironments@2025-01-01' existing = if (!provision) {
  name: environmentName
}

output name string = provision ? environment.name : existingEnvironment.name
output id string = provision ? environment.id : existingEnvironment.id
