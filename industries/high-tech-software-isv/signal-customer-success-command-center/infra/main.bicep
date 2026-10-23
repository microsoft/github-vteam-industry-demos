targetScope = 'resourceGroup'

@description('Deterministic SHA-256 prefix of subscription ID/resource group name.')
param uniqueSuffix string = 'f4ee1f29'
param location string = 'swedencentral'
param foundryLocation string = 'swedencentral'
param callerPrincipalId string
param modelName string = 'gpt-4.1-mini'
param modelVersion string = '2025-04-14'
param modelSku string = 'DataZoneStandard'
@minValue(1)
param modelCapacity int = 10

var tags = {
  industry: 'high-tech-software-isv'
  demo: 'customer-success-command-center'
  'managed-by': 'copilot-squad'
}
var foundryUserRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '53ca6127-db72-4b80-b1b0-d745d6d5456d')
var runtimeRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '142bfaed-a13f-4c2d-bed2-6db62c4a1009')
var consumerRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'eed3b665-ab3a-47b6-8f48-c9382fb1dad6')
var modelUserRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
var blobRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
var pullRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
var pushRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8311e382-0749-4cb8-b61a-304f252e45ec')

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'acrhtisv${uniqueSuffix}'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

// Retained historical resource only: the application must not depend on Blob.
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'sthtisv${uniqueSuffix}'
  location: location
  tags: tags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {}
}

resource snapshots 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobs
  name: 'snapshots'
  properties: { publicAccess: 'None' }
}

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-high-tech-software-isv-01'
  location: location
  tags: tags
}

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: 'cae-high-tech-software-isv-01'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: { destination: '' }
    zoneRedundant: false
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

resource foundry 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: 'foundry-high-tech-isv-${uniqueSuffix}'
  location: foundryLocation
  tags: tags
  kind: 'AIServices'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  properties: {
    customSubDomainName: 'foundry-high-tech-isv-${uniqueSuffix}'
    allowProjectManagement: true
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: foundry
  // Foundry account child writes conflict if model/project provisioning overlaps.
  dependsOn: [model]
  name: 'proj-high-tech-software-isv-01'
  location: foundryLocation
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    displayName: 'Customer Success Command Center'
    description: 'Synthetic public demo: two prompt agents, no tools or customer data.'
  }
}

resource model 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = {
  parent: foundry
  name: modelName
  sku: {
    name: modelSku
    capacity: modelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
    versionUpgradeOption: 'NoAutoUpgrade'
  }
}

resource callerFoundry 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(project.id, callerPrincipalId, foundryUserRole)
  scope: project
  properties: {
    roleDefinitionId: foundryUserRole
    principalId: callerPrincipalId
    principalType: 'User'
  }
}

resource appRuntime 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(project.id, appIdentity.id, runtimeRole)
  scope: project
  properties: {
    roleDefinitionId: runtimeRole
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource appAgentConsumer 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(project.id, appIdentity.id, consumerRole)
  scope: project
  properties: {
    roleDefinitionId: consumerRole
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource projectModel 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundry.id, project.id, modelUserRole)
  scope: foundry
  properties: {
    roleDefinitionId: modelUserRole
    principalId: project.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Preserve historical assignments; their presence does not make Blob an app dependency.
resource appBlob 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(snapshots.id, appIdentity.id, blobRole)
  scope: snapshots
  properties: {
    roleDefinitionId: blobRole
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource callerBlob 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(snapshots.id, callerPrincipalId, blobRole)
  scope: snapshots
  properties: {
    roleDefinitionId: blobRole
    principalId: callerPrincipalId
    principalType: 'User'
  }
}

resource appPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, appIdentity.id, pullRole)
  scope: registry
  properties: {
    roleDefinitionId: pullRole
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource callerPush 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, callerPrincipalId, pushRole)
  scope: registry
  properties: {
    roleDefinitionId: pushRole
    principalId: callerPrincipalId
    principalType: 'User'
  }
}

output subscriptionId string = subscription().subscriptionId
output resourceGroupName string = resourceGroup().name
output registryId string = registry.id
output registryLoginServer string = registry.properties.loginServer
output storageId string = storage.id
output blobEndpoint string = storage.properties.primaryEndpoints.blob
output blobContainer string = snapshots.name
output environmentId string = environment.id
output appIdentityId string = appIdentity.id
output appIdentityClientId string = appIdentity.properties.clientId
output appIdentityPrincipalId string = appIdentity.properties.principalId
output foundryId string = foundry.id
output projectId string = project.id
output projectPrincipalId string = project.identity.principalId
output projectEndpoint string = 'https://${foundry.name}.services.ai.azure.com/api/projects/${project.name}'
output modelDeployment string = model.name
output modelDeploymentId string = model.id
output modelRegion string = foundryLocation
output coreRegion string = location

module persistence 'persistence.bicep' = {
  name: 'phase1-persistence'
  params: {
    callerPrincipalId: callerPrincipalId
    uniqueSuffix: uniqueSuffix
    location: location
  }
}

output cosmosAccountId string = persistence.outputs.cosmosAccountId
output cosmosEndpoint string = persistence.outputs.cosmosEndpoint
output cosmosRegion string = persistence.outputs.cosmosRegion
output cosmosCapacityMode string = persistence.outputs.cosmosCapacityMode
output cosmosDatabase string = persistence.outputs.cosmosDatabase
output cosmosContainer string = persistence.outputs.cosmosContainer
output cosmosPartitionKey string = persistence.outputs.cosmosPartitionKey
output cosmosDataRoleDefinitionId string = persistence.outputs.cosmosDataRoleDefinitionId
output cosmosDataRoleScope string = persistence.outputs.cosmosDataRoleScope
output cosmosCallerRoleAssignmentId string = persistence.outputs.cosmosCallerRoleAssignmentId
output cosmosAppRoleAssignmentId string = persistence.outputs.cosmosAppRoleAssignmentId
