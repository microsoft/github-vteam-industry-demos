targetScope = 'resourceGroup'

@description('Azure region for stable Phase 1 foundation resources.')
param foundationLocation string = resourceGroup().location

@description('Azure region for the private Container Apps runtime.')
param runtimeLocation string

@description('Microsoft Foundry account name.')
param foundryAccountName string

@description('Microsoft Foundry project name.')
param foundryProjectName string

@description('Azure OpenAI deployment used by the application.')
param modelDeploymentName string

@description('Globally unique Azure Container Registry name.')
param containerRegistryName string

@description('Replacement workload-profiles Container Apps environment name.')
param containerAppsEnvironmentName string

@description('User-assigned managed identity used by the application.')
param managedIdentityName string

@description('Existing Norway East Log Analytics workspace name.')
param logAnalyticsWorkspaceName string

@description('Existing Norway East Application Insights component name.')
param applicationInsightsName string

@description('Globally unique storage account for durable application state.')
param storageAccountName string

@description('Blob container for durable application state.')
param stateContainerName string = 'application-state'

@description('Replacement Container App name.')
param containerAppName string

@description('Immutable application image tag already present in ACR.')
param containerImageTag string

@description('Repository name inside ACR.')
param containerImageRepository string = 'inventory-command-center'

@allowed([
  'public-demo'
  'entra'
])
@description('Browser access mode. Entra requires configure-auth.ps1 after application deployment.')
param accessMode string = 'public-demo'

@description('Exact HTTPS origin for public-demo mode; empty for an Entra-first deployment.')
param publicDemoOrigin string = ''

@description('Virtual network name for the private Norway East runtime.')
param virtualNetworkName string

@description('Address space selected after overlap inspection.')
param virtualNetworkAddressPrefix string

@description('Dedicated Container Apps infrastructure subnet name.')
param containerAppsSubnetName string

@description('Dedicated Container Apps infrastructure subnet prefix.')
param containerAppsSubnetPrefix string

@description('Optional existing network security group resource ID to preserve on the Container Apps subnet.')
param containerAppsSubnetNetworkSecurityGroupId string = ''

@description('Dedicated private endpoint subnet name.')
param privateEndpointSubnetName string

@description('Dedicated private endpoint subnet prefix.')
param privateEndpointSubnetPrefix string

@description('Optional existing network security group resource ID to preserve on the private endpoint subnet.')
param privateEndpointSubnetNetworkSecurityGroupId string = ''

@description('Blob private endpoint name.')
param blobPrivateEndpointName string

@description('Private DNS zone name for Blob Storage.')
param blobPrivateDnsZoneName string = 'privatelink.blob.${environment().suffixes.storage}'

@description('Private DNS VNet link name.')
param blobPrivateDnsLinkName string

@description('Private DNS zone group name.')
param blobPrivateDnsZoneGroupName string = 'pdzg-blob'

@minValue(1)
@description('Minimum Container App replicas.')
param minReplicas int = 1

@minValue(1)
@description('Maximum Container App replicas.')
param maxReplicas int = 1

@description('Create or reconcile the replacement workload-profiles environment.')
param deployEnvironment bool = false

@description('Create or reconcile the replacement Container App with public HTTPS ingress.')
param deployApplication bool = false

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: logAnalyticsWorkspaceName
}

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: applicationInsightsName
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2025-06-01' = {
  name: storageAccountName
  location: runtimeLocation
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Disabled'
    supportsHttpsTrafficOnly: true
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Deny'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2025-06-01' = {
  parent: storageAccount
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

resource stateContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-06-01' = {
  parent: blobService
  name: stateContainerName
  properties: {
    publicAccess: 'None'
  }
}

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: managedIdentityName
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: containerRegistryName
}

resource foundryAccount 'Microsoft.CognitiveServices/accounts@2025-06-01' existing = {
  name: foundryAccountName
}

resource foundryProject 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' existing = {
  parent: foundryAccount
  name: foundryProjectName
}

resource virtualNetwork 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: virtualNetworkName
  location: runtimeLocation
  properties: {
    addressSpace: {
      addressPrefixes: [
        virtualNetworkAddressPrefix
      ]
    }
  }
}

resource containerAppsSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: virtualNetwork
  name: containerAppsSubnetName
  properties: union({
    addressPrefix: containerAppsSubnetPrefix
    delegations: [
      {
        name: 'Microsoft.App.environments'
        properties: {
          serviceName: 'Microsoft.App/environments'
        }
      }
    ]
    privateEndpointNetworkPolicies: 'Disabled'
    privateLinkServiceNetworkPolicies: 'Enabled'
  }, empty(containerAppsSubnetNetworkSecurityGroupId) ? {} : {
    networkSecurityGroup: {
      id: containerAppsSubnetNetworkSecurityGroupId
    }
  })
}

resource privateEndpointSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: virtualNetwork
  name: privateEndpointSubnetName
  properties: union({
    addressPrefix: privateEndpointSubnetPrefix
    privateEndpointNetworkPolicies: 'Disabled'
    privateLinkServiceNetworkPolicies: 'Enabled'
  }, empty(privateEndpointSubnetNetworkSecurityGroupId) ? {} : {
    networkSecurityGroup: {
      id: privateEndpointSubnetNetworkSecurityGroupId
    }
  })
  dependsOn: [
    containerAppsSubnet
  ]
}

resource blobPrivateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: blobPrivateDnsZoneName
  location: 'global'
}

resource blobPrivateDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: blobPrivateDnsZone
  name: blobPrivateDnsLinkName
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetwork.id
    }
  }
}

resource blobPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: blobPrivateEndpointName
  location: runtimeLocation
  properties: {
    subnet: {
      id: privateEndpointSubnet.id
    }
    privateLinkServiceConnections: [
      {
        name: 'blob'
        properties: {
          privateLinkServiceId: storageAccount.id
          groupIds: [
            'blob'
          ]
        }
      }
    ]
  }
}

resource blobPrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: blobPrivateEndpoint
  name: blobPrivateDnsZoneGroupName
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'blob'
        properties: {
          privateDnsZoneId: blobPrivateDnsZone.id
        }
      }
    ]
  }
}

var storageBlobDataContributorRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
)
var foundryAgentConsumerRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'eed3b665-ab3a-47b6-8f48-c9382fb1dad6'
)
var foundryUserRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '53ca6127-db72-4b80-b1b0-d745d6d5456d'
)

resource storageRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, managedIdentity.id, storageBlobDataContributorRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: storageBlobDataContributorRoleId
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource foundryAgentConsumerRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryProject.id, managedIdentity.id, foundryAgentConsumerRoleId)
  scope: foundryProject
  properties: {
    roleDefinitionId: foundryAgentConsumerRoleId
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource foundryUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryProject.id, managedIdentity.id, foundryUserRoleId)
  scope: foundryProject
  properties: {
    roleDefinitionId: foundryUserRoleId
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2025-01-01' = if (deployEnvironment) {
  name: containerAppsEnvironmentName
  location: runtimeLocation
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsWorkspace.properties.customerId
        sharedKey: listKeys(logAnalyticsWorkspace.id, '2020-08-01').primarySharedKey
      }
    }
    vnetConfiguration: {
      internal: false
      infrastructureSubnetId: containerAppsSubnet.id
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    zoneRedundant: false
  }
}

resource containerApp 'Microsoft.App/containerApps@2025-01-01' = if (deployApplication) {
  name: containerAppName
  location: runtimeLocation
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: managedIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'inventory-command-center'
          image: '${containerRegistry.properties.loginServer}/${containerImageRepository}:${containerImageTag}'
          env: [
            {
              name: 'APP_ENV'
              value: 'azure'
            }
            {
              name: 'APP_AUTH_MODE'
              value: accessMode == 'public-demo' ? 'public-demo' : 'azure'
            }
            {
              name: 'PUBLIC_DEMO_ORIGIN'
              value: publicDemoOrigin
            }
            {
              name: 'APP_STATE_MODE'
              value: 'blob'
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: managedIdentity.properties.clientId
            }
            {
              name: 'AZURE_STORAGE_ACCOUNT_NAME'
              value: storageAccount.name
            }
            {
              name: 'AZURE_STORAGE_CONTAINER_NAME'
              value: stateContainer.name
            }
            {
              name: 'FOUNDRY_PROJECT_ENDPOINT'
              value: 'https://${foundryAccountName}.services.ai.azure.com/api/projects/${foundryProjectName}'
            }
            {
              name: 'FOUNDRY_MODEL_DEPLOYMENT'
              value: modelDeploymentName
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: applicationInsights.properties.ConnectionString
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health/live'
                port: 8080
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 6
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health/ready'
                port: 8080
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 6
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
  dependsOn: [
    blobPrivateDnsZoneGroup
    storageRoleAssignment
    foundryAgentConsumerRoleAssignment
    foundryUserRoleAssignment
  ]
}

resource publicDemoAuthConfig 'Microsoft.App/containerApps/authConfigs@2025-01-01' = if (deployApplication && accessMode == 'public-demo') {
  parent: containerApp
  name: 'current'
  properties: {
    platform: {
      enabled: false
    }
    globalValidation: {
      unauthenticatedClientAction: 'AllowAnonymous'
    }
    httpSettings: {
      requireHttps: true
    }
  }
}

output virtualNetworkName string = virtualNetwork.name
output virtualNetworkAddressPrefix string = virtualNetworkAddressPrefix
output containerAppsSubnetPrefix string = containerAppsSubnetPrefix
output privateEndpointSubnetPrefix string = privateEndpointSubnetPrefix
output blobPrivateEndpointName string = blobPrivateEndpoint.name
output containerAppsEnvironmentName string = deployEnvironment ? containerAppsEnvironment.name : ''
output containerAppName string = deployApplication ? containerApp.name : ''
output containerAppExternalIngressEnabled bool = true
output publicDemoOrigin string = publicDemoOrigin
output accessMode string = accessMode
output storageAccountName string = storageAccount.name
output stateContainerName string = stateContainer.name
output containerRegistryLoginServer string = containerRegistry.properties.loginServer
output foundryProjectEndpoint string = 'https://${foundryAccountName}.services.ai.azure.com/api/projects/${foundryProjectName}'
output containerImage string = '${containerRegistry.properties.loginServer}/${containerImageRepository}:${containerImageTag}'
output foundationLocation string = foundationLocation
output runtimeLocation string = runtimeLocation
