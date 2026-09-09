param location string
param baseName string
param tags object
param webPrincipalId string
param workerPrincipalId string
param seederPrincipalId string

var monitoringMetricsPublisherRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '3913510d-42f4-4e42-8a64-420c390055eb'
)

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'law-${baseName}-001'
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    sku: {
      name: 'PerGB2018'
    }
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${baseName}-001'
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    DisableLocalAuth: true
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

resource webMetricsPublisher 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(applicationInsights.id, webPrincipalId, monitoringMetricsPublisherRoleId)
  scope: applicationInsights
  properties: {
    principalId: webPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: monitoringMetricsPublisherRoleId
  }
}

resource workerMetricsPublisher 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(applicationInsights.id, workerPrincipalId, monitoringMetricsPublisherRoleId)
  scope: applicationInsights
  properties: {
    principalId: workerPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: monitoringMetricsPublisherRoleId
  }
}

resource seederMetricsPublisher 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(applicationInsights.id, seederPrincipalId, monitoringMetricsPublisherRoleId)
  scope: applicationInsights
  properties: {
    principalId: seederPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: monitoringMetricsPublisherRoleId
  }
}

output applicationInsightsName string = applicationInsights.name
output applicationInsightsConnectionString string = applicationInsights.properties.ConnectionString
output logAnalyticsWorkspaceName string = workspace.name
output logAnalyticsWorkspaceId string = workspace.id
output logAnalyticsCustomerId string = workspace.properties.customerId
@secure()
output logAnalyticsSharedKey string = workspace.listKeys().primarySharedKey
