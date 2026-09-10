@allowed([
  'swedencentral'
])
param location string

param environmentName string
param containerRegistryName string
param containerEnvironmentName string
param containerAppName string
param managedIdentityName string
param logAnalyticsName string
param storageAccountName string
param applyStorageSecurityControlException bool = false
param searchServiceName string
@allowed([
  'free'
  'basic'
  'standard'
])
param searchSku string = 'basic'
param searchIndexName string
param foundryAccountName string
param foundryProjectName string
param modelDeploymentName string
param modelName string
param modelFormat string
param modelVersion string
param modelDeploymentSku string
@minValue(1)
param modelCapacity int
param deploymentPrincipalId string = ''
@allowed([
  'User'
  'ServicePrincipal'
])
param deploymentPrincipalType string = 'User'
param requirementsAgentId string = ''
param proposalAgentId string = ''
param riskAgentId string = ''
param appImageName string = ''

var tags = {
  'azd-env-name': environmentName
  project: 'ai-proposal-factory'
}
var placeholderImage = 'mcr.microsoft.com/k8se/quickstart:latest'
var resolvedImage = empty(appImageName) ? placeholderImage : appImageName
var usesAcrImage = !empty(appImageName)
var storageTags = applyStorageSecurityControlException
  ? union(tags, { SecurityControl: 'Ignore' })
  : tags
var acrPullRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)
var storageBlobContributorRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
)
var storageTableContributorRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
)
var searchIndexReaderRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '1407120a-92aa-4202-b7e9-c0e197c71c8f'
)
var searchIndexContributorRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '8ebe5a00-799e-43f5-93ac-243d3dce84a7'
)
var searchServiceContributorRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7ca78c08-252a-4471-8644-bb5ff32d4ba0'
)
var foundryUserRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '53ca6127-db72-4b80-b1b0-d745d6d5456d'
)
var foundryAgentConsumerRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'eed3b665-ab3a-47b6-8f48-c9382fb1dad6'
)
var readerRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'acdd72a7-3385-48ef-bd42-f606fba81ae7'
)

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: containerRegistryName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: managedIdentityName
  location: location
  tags: tags
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerEnvironmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, acrPullRoleDefinitionId)
  scope: registry
  properties: {
    roleDefinitionId: acrPullRoleDefinitionId
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2025-01-01' = {
  name: storageAccountName
  location: location
  tags: storageTags
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

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2025-01-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

resource blobContainers 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-01-01' = [
  for containerName in [
    'documents'
    'knowledge'
    'exports'
  ]: {
    parent: blobService
    name: containerName
    properties: {
      publicAccess: 'None'
    }
  }
]

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2025-01-01' = {
  parent: storage
  name: 'default'
  properties: {}
}

resource stateTables 'Microsoft.Storage/storageAccounts/tableServices/tables@2025-01-01' = [
  for tableName in [
    'Opportunities'
    'Documents'
    'Knowledge'
    'Proposals'
    'AuditEvents'
    'GenerationJobs'
    'Metadata'
  ]: {
    parent: tableService
    name: tableName
    properties: {}
  }
]

resource search 'Microsoft.Search/searchServices@2025-05-01' = {
  name: searchServiceName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: searchSku
  }
  properties: {
    disableLocalAuth: true
    hostingMode: 'Default'
    networkRuleSet: {
      ipRules: []
    }
    partitionCount: 1
    publicNetworkAccess: 'enabled'
    replicaCount: 1
    semanticSearch: 'disabled'
  }
}

resource foundry 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: foundryAccountName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  properties: {
    allowProjectManagement: true
    customSubDomainName: foundryAccountName
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource foundryProject 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: foundry
  name: foundryProjectName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {}
}

resource modelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = {
  parent: foundry
  name: modelDeploymentName
  sku: {
    name: modelDeploymentSku
    capacity: modelCapacity
  }
  properties: {
    model: {
      format: modelFormat
      name: modelName
      version: modelVersion
    }
    versionUpgradeOption: 'NoAutoUpgrade'
  }
}

resource appStorageBlobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, identity.id, storageBlobContributorRoleDefinitionId)
  scope: storage
  properties: {
    roleDefinitionId: storageBlobContributorRoleDefinitionId
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource appStorageTableContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, identity.id, storageTableContributorRoleDefinitionId)
  scope: storage
  properties: {
    roleDefinitionId: storageTableContributorRoleDefinitionId
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource appSearchReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(search.id, identity.id, searchIndexReaderRoleDefinitionId)
  scope: search
  properties: {
    roleDefinitionId: searchIndexReaderRoleDefinitionId
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource projectFoundryUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundry.id, foundryProject.id, foundryUserRoleDefinitionId)
  scope: foundry
  properties: {
    roleDefinitionId: foundryUserRoleDefinitionId
    principalId: foundryProject.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource appFoundryAgentConsumer 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryProject.id, identity.id, foundryAgentConsumerRoleDefinitionId)
  scope: foundryProject
  properties: {
    roleDefinitionId: foundryAgentConsumerRoleDefinitionId
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource appFoundryUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryProject.id, identity.id, foundryUserRoleDefinitionId)
  scope: foundryProject
  properties: {
    roleDefinitionId: foundryUserRoleDefinitionId
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource appFoundryAccountUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundry.id, identity.id, foundryUserRoleDefinitionId)
  scope: foundry
  properties: {
    roleDefinitionId: foundryUserRoleDefinitionId
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource appFoundryAccountReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundry.id, identity.id, readerRoleDefinitionId)
  scope: foundry
  properties: {
    roleDefinitionId: readerRoleDefinitionId
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource deployerStorageBlobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deploymentPrincipalId)) {
  name: guid(storage.id, deploymentPrincipalId, storageBlobContributorRoleDefinitionId)
  scope: storage
  properties: {
    roleDefinitionId: storageBlobContributorRoleDefinitionId
    principalId: deploymentPrincipalId
    principalType: deploymentPrincipalType
  }
}

resource deployerStorageTableContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deploymentPrincipalId)) {
  name: guid(storage.id, deploymentPrincipalId, storageTableContributorRoleDefinitionId)
  scope: storage
  properties: {
    roleDefinitionId: storageTableContributorRoleDefinitionId
    principalId: deploymentPrincipalId
    principalType: deploymentPrincipalType
  }
}

resource deployerSearchServiceContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deploymentPrincipalId)) {
  name: guid(search.id, deploymentPrincipalId, searchServiceContributorRoleDefinitionId)
  scope: search
  properties: {
    roleDefinitionId: searchServiceContributorRoleDefinitionId
    principalId: deploymentPrincipalId
    principalType: deploymentPrincipalType
  }
}

resource deployerSearchIndexContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deploymentPrincipalId)) {
  name: guid(search.id, deploymentPrincipalId, searchIndexContributorRoleDefinitionId)
  scope: search
  properties: {
    roleDefinitionId: searchIndexContributorRoleDefinitionId
    principalId: deploymentPrincipalId
    principalType: deploymentPrincipalType
  }
}

resource deployerFoundryUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deploymentPrincipalId)) {
  name: guid(foundryProject.id, deploymentPrincipalId, foundryUserRoleDefinitionId)
  scope: foundryProject
  properties: {
    roleDefinitionId: foundryUserRoleDefinitionId
    principalId: deploymentPrincipalId
    principalType: deploymentPrincipalType
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  tags: union(tags, {
    'azd-service-name': 'app'
  })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 8000
        transport: 'auto'
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: usesAcrImage ? [
        {
          server: registry.properties.loginServer
          identity: identity.id
        }
      ] : []
    }
    template: {
      containers: [
        {
          name: 'app'
          image: resolvedImage
          env: [
            {
              name: 'PORT'
              value: '8000'
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: identity.properties.clientId
            }
            {
              name: 'AZURE_LOCATION'
              value: location
            }
            {
              name: 'AZURE_STORAGE_ACCOUNT_NAME'
              value: storage.name
            }
            {
              name: 'AZURE_STORAGE_BLOB_ENDPOINT'
              value: storage.properties.primaryEndpoints.blob
            }
            {
              name: 'AZURE_STORAGE_TABLE_ENDPOINT'
              value: storage.properties.primaryEndpoints.table
            }
            {
              name: 'AZURE_AI_SEARCH_ENDPOINT'
              value: 'https://${search.name}.search.windows.net'
            }
            {
              name: 'AZURE_AI_SEARCH_INDEX_NAME'
              value: searchIndexName
            }
            {
              name: 'AZURE_AI_FOUNDRY_PROJECT_ENDPOINT'
              value: 'https://${foundry.name}.services.ai.azure.com/api/projects/${foundryProject.name}'
            }
            {
              name: 'AZURE_AI_MODEL_DEPLOYMENT_NAME'
              value: modelDeployment.name
            }
            {
              name: 'AIPF_REQUIREMENTS_AGENT_ID'
              value: requirementsAgentId
            }
            {
              name: 'AIPF_PROPOSAL_AGENT_ID'
              value: proposalAgentId
            }
            {
              name: 'AIPF_RISK_AGENT_ID'
              value: riskAgentId
            }
            {
              name: 'AIPF_DEMO_MODE'
              value: empty(requirementsAgentId) || empty(proposalAgentId) || empty(riskAgentId) ? 'true' : 'false'
            }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/api/health'
                port: 8000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health'
                port: 8000
                scheme: 'HTTP'
              }
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: 8000
                scheme: 'HTTP'
              }
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 2
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
  dependsOn: [
    acrPull
    appStorageBlobContributor
    appStorageTableContributor
    appSearchReader
    appFoundryAgentConsumer
    appFoundryUser
    appFoundryAccountUser
    appFoundryAccountReader
  ]
}

output containerRegistryName string = registry.name
output containerRegistryEndpoint string = registry.properties.loginServer
output containerEnvironmentName string = environment.name
output containerAppName string = app.name
output containerAppUri string = 'https://${app.properties.configuration.ingress.fqdn}'
output managedIdentityId string = identity.id
output managedIdentityClientId string = identity.properties.clientId
output storageAccountName string = storage.name
output storageBlobEndpoint string = storage.properties.primaryEndpoints.blob
output storageTableEndpoint string = storage.properties.primaryEndpoints.table
output searchEndpoint string = 'https://${search.name}.search.windows.net'
output foundryAccountName string = foundry.name
output foundryProjectName string = foundryProject.name
output foundryProjectEndpoint string = 'https://${foundry.name}.services.ai.azure.com/api/projects/${foundryProject.name}'
