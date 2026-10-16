targetScope = 'resourceGroup'

@allowed(['swedencentral', 'northeurope', 'westeurope'])
param hostingLocation string = 'swedencentral'

@allowed(['swedencentral', 'northeurope', 'westeurope'])
param storageLocation string = 'swedencentral'

@allowed(['swedencentral', 'northeurope', 'westeurope'])
param aiLocation string = 'swedencentral'

@allowed(['gpt-4.1-mini', 'gpt-4o-mini'])
param modelName string

param modelVersion string

@allowed([1])
param modelCapacity int = 1

var tags = {
  workload: 'manufacturing-operations'
  phase: '1'
}
var suffix = uniqueString(resourceGroup().id)
var foundryUserRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '53ca6127-db72-4b80-b1b0-d745d6d5456d')
var blobContributorRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
var inferenceUserRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-manufacturing-01'
  location: hostingLocation
  tags: tags
}

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: 'cae-manufacturing-01'
  location: hostingLocation
  tags: tags
  properties: {
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    zoneRedundant: false
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'stmanuf01${suffix}'
  location: storageLocation
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Enabled'
    supportsHttpsTrafficOnly: true
  }
}

resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource state 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobs
  name: 'demo-state'
  properties: {
    publicAccess: 'None'
  }
}

resource account 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: 'ai-manufacturing-01-${suffix}'
  location: aiLocation
  tags: tags
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    allowProjectManagement: true
    customSubDomainName: 'ai-manufacturing-01-${suffix}'
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: account
  name: 'manufacturing-operations-01'
  location: aiLocation
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    displayName: 'Manufacturing Operations 01'
    description: 'Synthetic industrial demonstration. Qualified human review required.'
  }
  dependsOn: [
    model
  ]
}

resource model 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = {
  parent: account
  name: 'manufacturing-mini-01'
  sku: {
    name: 'Standard'
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

resource appFoundryRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(project.id, appIdentity.id, foundryUserRole)
  scope: project
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: foundryUserRole
  }
}

resource projectInferenceRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(account.id, project.id, inferenceUserRole)
  scope: account
  properties: {
    principalId: project.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: inferenceUserRole
  }
}

resource appStorageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(state.id, appIdentity.id, blobContributorRole)
  scope: state
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: blobContributorRole
  }
}

output settings object = {
  AZURE_SUBSCRIPTION_ID: subscription().subscriptionId
  AZURE_TENANT_ID: tenant().tenantId
  AZURE_RESOURCE_GROUP: resourceGroup().name
  AZURE_CLIENT_ID: appIdentity.properties.clientId
  MANAGED_IDENTITY_RESOURCE_ID: appIdentity.id
  CONTAINER_APPS_ENVIRONMENT_ID: environment.id
  AZURE_STORAGE_ACCOUNT_URL: storage.properties.primaryEndpoints.blob
  AZURE_STORAGE_CONTAINER: state.name
  FOUNDRY_ACCOUNT_ID: account.id
  FOUNDRY_PROJECT_ID: project.id
  FOUNDRY_PROJECT_ENDPOINT: 'https://${account.name}.services.ai.azure.com/api/projects/${project.name}'
  FOUNDRY_MODEL_DEPLOYMENT: model.name
  FOUNDRY_MODEL_NAME: modelName
  FOUNDRY_MODEL_VERSION: modelVersion
  FOUNDRY_MODEL_SKU: 'Standard'
  FOUNDRY_MODEL_CAPACITY: modelCapacity
}

output roleAssignments array = [
  {
    id: appFoundryRole.id
    principalId: appIdentity.properties.principalId
    roleDefinitionId: foundryUserRole
    scope: project.id
  }
  {
    id: projectInferenceRole.id
    principalId: project.identity.principalId
    roleDefinitionId: inferenceUserRole
    scope: account.id
  }
  {
    id: appStorageRole.id
    principalId: appIdentity.properties.principalId
    roleDefinitionId: blobContributorRole
    scope: state.id
  }
]
