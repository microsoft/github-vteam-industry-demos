@description('Deployment environment name.')
param environmentName string

@description('Primary and only deployment region.')
@allowed([
  'swedencentral'
])
param location string

@description('Short suffix used for globally unique resource names.')
@minLength(4)
@maxLength(8)
param resourceSuffix string

param tags object
param webImageName string
param deploySearch bool
param deploymentPrincipalId string
param modelDeploymentName string
param modelName string
param modelVersion string
param modelCapacity int
param extractAgentName string
param completeAgentName string
param riskAgentName string
param summaryAgentName string

var identityName = 'id-kyc-${environmentName}-${resourceSuffix}'
var containerRegistryName = 'crkyc${environmentName}swc${resourceSuffix}'
var containerAppsEnvironmentName = 'cae-kyc-${environmentName}-${resourceSuffix}'
var containerAppName = 'ca-kyc-${environmentName}-${resourceSuffix}'
var storageAccountName = 'stkyc${environmentName}swc${resourceSuffix}'
var documentIntelligenceName = 'di-kyc-${environmentName}-${resourceSuffix}'
var foundryName = 'ai-kyc-${environmentName}-${resourceSuffix}'
var foundryProjectName = 'proj-kyc-${environmentName}'
var searchName = 'srch-kyc-${environmentName}-${resourceSuffix}'

var cognitiveServicesUserRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'a97b65f3-24c7-4388-baec-2e87135dc908'
)
var foundryUserRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '53ca6127-db72-4b80-b1b0-d745d6d5456d'
)
var storageBlobDataContributorRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
)
var storageTableDataContributorRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
)
var searchIndexDataContributorRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '8ebe5a00-799e-43f5-93ac-243d3dce84a7'
)
var searchServiceContributorRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7ca78c08-252a-4471-8644-bb5ff32d4ba0'
)
var acrPullRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: identityName
  location: location
  tags: tags
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2025-04-01' = {
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

resource containerRegistryPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, appIdentity.id, acrPullRoleId)
  scope: containerRegistry
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleId
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2025-06-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
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

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2025-06-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

resource documentsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-06-01' = {
  parent: blobService
  name: 'kyc-documents'
  properties: {
    publicAccess: 'None'
  }
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2025-06-01' = {
  parent: storage
  name: 'default'
}

resource casesTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2025-06-01' = {
  parent: tableService
  name: 'KycCases'
}

resource screeningTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2025-06-01' = {
  parent: tableService
  name: 'KycScreening'
}

resource metadataTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2025-06-01' = {
  parent: tableService
  name: 'KycMetadata'
}

resource investigationsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2025-06-01' = {
  parent: tableService
  name: 'KycInvestigations'
}

resource storageBlobAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, appIdentity.id, storageBlobDataContributorRoleId)
  scope: storage
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: storageBlobDataContributorRoleId
  }
}

resource storageTableAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, appIdentity.id, storageTableDataContributorRoleId)
  scope: storage
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: storageTableDataContributorRoleId
  }
}

resource documentIntelligence 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: documentIntelligenceName
  location: location
  tags: tags
  kind: 'FormRecognizer'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: documentIntelligenceName
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource documentIntelligenceAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(documentIntelligence.id, appIdentity.id, cognitiveServicesUserRoleId)
  scope: documentIntelligence
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: cognitiveServicesUserRoleId
  }
}

resource search 'Microsoft.Search/searchServices@2025-05-01' = if (deploySearch) {
  name: searchName
  location: location
  tags: tags
  sku: {
    name: 'standard'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    disableLocalAuth: true
    hostingMode: 'Default'
    publicNetworkAccess: 'Enabled'
    replicaCount: 1
    partitionCount: 1
    semanticSearch: 'free'
  }
}

resource searchIndexAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deploySearch) {
  name: guid(search.id, appIdentity.id, searchIndexDataContributorRoleId)
  scope: search
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: searchIndexDataContributorRoleId
  }
}

resource searchServiceAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deploySearch) {
  name: guid(search.id, appIdentity.id, searchServiceContributorRoleId)
  scope: search
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: searchServiceContributorRoleId
  }
}

resource foundry 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: foundryName
  location: location
  tags: tags
  kind: 'AIServices'
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'S0'
  }
  properties: {
    allowProjectManagement: true
    customSubDomainName: foundryName
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource foundryProject 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: foundry
  name: foundryProjectName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {}
}

resource foundryProjectAppAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryProject.id, appIdentity.id, foundryUserRoleId)
  scope: foundryProject
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: foundryUserRoleId
  }
}

resource foundryProjectDeploymentAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryProject.id, deploymentPrincipalId, foundryUserRoleId)
  scope: foundryProject
  properties: {
    principalId: deploymentPrincipalId
    roleDefinitionId: foundryUserRoleId
  }
}

resource modelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: foundry
  name: modelDeploymentName
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
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
}

resource foundryAppAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundry.id, appIdentity.id, cognitiveServicesUserRoleId)
  scope: foundry
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: cognitiveServicesUserRoleId
  }
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2026-01-01' = {
  name: containerAppsEnvironmentName
  location: location
  tags: tags
  properties: {}
}

resource containerApp 'Microsoft.App/containerApps@2026-01-01' = {
  name: containerAppName
  location: location
  tags: union(tags, {
    'azd-service-name': 'web'
  })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${appIdentity.id}': {}
    }
  }
  properties: {
    environmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Multiple'
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          identity: appIdentity.id
          server: containerRegistry.properties.loginServer
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: webImageName
          env: [
            {
              name: 'AZURE_CLIENT_ID'
              value: appIdentity.properties.clientId
            }
            {
              name: 'STORAGE_PROVIDER'
              value: 'memory'
            }
            {
              name: 'AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT'
              value: documentIntelligence.properties.endpoint
            }
            {
              name: 'AZURE_DOCUMENT_INTELLIGENCE_MODEL'
              value: 'prebuilt-layout'
            }
            {
              name: 'DOCUMENT_EXTRACTION_PROVIDER'
              value: 'azure'
            }
            {
              name: 'AZURE_AI_FOUNDRY_ENDPOINT'
              value: foundry.properties.endpoint
            }
            {
              name: 'AZURE_AI_FOUNDRY_PROJECT_NAME'
              value: foundryProject.name
            }
            {
              name: 'AZURE_AI_PROJECT_ENDPOINT'
              value: 'https://${foundry.name}.services.ai.azure.com/api/projects/${foundryProject.name}'
            }
            {
              name: 'AZURE_AI_MODEL_DEPLOYMENT_NAME'
              value: modelDeployment.name
            }
            {
              name: 'FOUNDRY_REASONING_PROVIDER'
              value: 'azure'
            }
            {
              name: 'FOUNDRY_STAGE_DELAY_SECONDS'
              value: '65'
            }
            {
              name: 'FOUNDRY_AGENT_EXTRACT'
              value: extractAgentName
            }
            {
              name: 'FOUNDRY_AGENT_COMPLETE'
              value: completeAgentName
            }
            {
              name: 'FOUNDRY_AGENT_RISK'
              value: riskAgentName
            }
            {
              name: 'FOUNDRY_AGENT_SUMMARY'
              value: summaryAgentName
            }
            {
              name: 'AZURE_AI_SEARCH_ENDPOINT'
              value: deploySearch ? 'https://${search.name}.search.windows.net' : ''
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

output containerAppName string = containerApp.name
output containerAppsEnvironmentName string = containerAppsEnvironment.name
output containerRegistryEndpoint string = containerRegistry.properties.loginServer
output storageAccountName string = storage.name
output documentIntelligenceEndpoint string = documentIntelligence.properties.endpoint
output foundryEndpoint string = foundry.properties.endpoint
output foundryProjectName string = foundryProject.name
output foundryProjectEndpoint string = 'https://${foundry.name}.services.ai.azure.com/api/projects/${foundryProject.name}'
output modelDeploymentName string = modelDeployment.name
output searchEndpoint string = deploySearch ? 'https://${search.name}.search.windows.net' : ''
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
