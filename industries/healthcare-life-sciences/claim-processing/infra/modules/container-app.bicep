// ─────────────────────────────────────────────────────────────────────────────
// Azure Container Apps — serverless compute hosting the Blazor claim portal.
// Chosen over App Service because sandbox subscriptions often have 0 dedicated
// App Service VM quota; Container Apps consumption needs none.
// ─────────────────────────────────────────────────────────────────────────────
@description('Azure region.')
param location string

@description('Resource tags.')
param tags object

@description('Container Apps managed environment name.')
param environmentName string

@description('Container app name.')
param containerAppName string

@description('Log Analytics workspace (customer) id for the environment.')
param logAnalyticsWorkspaceId string

@description('Resource ID of the user-assigned identity (ACR pull + Foundry access).')
param identityId string

@description('Client ID of the user-assigned identity (for DefaultAzureCredential).')
param identityClientId string

@description('ACR login server, e.g. myreg.azurecr.io.')
param registryLoginServer string

@description('Full container image reference (registry/repo:tag).')
param containerImage string

@description('Application Insights connection string.')
param applicationInsightsConnectionString string

@description('Foundry project endpoint.')
param foundryProjectEndpoint string

@description('Foundry model deployment name.')
param foundryModelName string

@description('Foundry agent ID (set after the agent is created; may be empty on first deploy).')
param foundryAgentId string = ''

@description('Optional APIM gateway endpoint including its API base path.')
param foundryGatewayEndpoint string = ''

@description('Optional Microsoft Entra audience or /.default scope for the APIM API.')
param foundryGatewayTokenScope string = ''

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: last(split(logAnalyticsWorkspaceId, '/'))
}

resource managedEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  // azd matches this service to azure.yaml via the azd-service-name tag.
  tags: union(tags, { 'azd-service-name': 'web' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: managedEnv.id
    configuration: {
      // Sticky sessions require an explicit single active-revision mode.
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        // Blazor Server uses a SignalR circuit — pin sessions to one replica.
        stickySessions: {
          affinity: 'sticky'
        }
      }
      registries: [
        {
          server: registryLoginServer
          identity: identityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'AZURE_CLIENT_ID', value: identityClientId }
            { name: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: applicationInsightsConnectionString }
            { name: 'Foundry__Endpoint', value: foundryProjectEndpoint }
            { name: 'Foundry__ModelName', value: foundryModelName }
            { name: 'Foundry__AgentId', value: foundryAgentId }
            { name: 'Foundry__GatewayEndpoint', value: foundryGatewayEndpoint }
            { name: 'Foundry__GatewayTokenScope', value: foundryGatewayTokenScope }
          ]
        }
      ]
      scale: {
        minReplicas: 1 // keep one warm replica for the Blazor circuit
        maxReplicas: 3
      }
    }
  }
}

output containerAppName string = containerApp.name
output containerAppUri string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
