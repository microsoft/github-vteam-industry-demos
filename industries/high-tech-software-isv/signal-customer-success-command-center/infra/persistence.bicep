targetScope = 'resourceGroup'

@allowed(['e2d6ac89-1bb7-420c-97fb-a96dea6c0635'])
param approvedSubscriptionId string = 'e2d6ac89-1bb7-420c-97fb-a96dea6c0635'
param callerPrincipalId string
param uniqueSuffix string = 'f4ee1f29'
@allowed(['swedencentral'])
param location string = 'swedencentral'

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: 'id-high-tech-software-isv-01'
}

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2025-04-15' = {
  name: 'cosmos-high-tech-isv-${uniqueSuffix}'
  location: location
  tags: {
    industry: 'high-tech-software-isv'
    demo: 'customer-success-command-center'
    'managed-by': 'copilot-squad'
  }
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    capabilities: [{ name: 'EnableServerless' }]
    locations: [{ locationName: location, failoverPriority: 0, isZoneRedundant: false }]
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    disableLocalAuth: true
    // Original desired public endpoint; policy forces Disabled. Do not retry to bypass it.
    publicNetworkAccess: 'Enabled'
    isVirtualNetworkFilterEnabled: false
    enableAutomaticFailover: false
    enableMultipleWriteLocations: false
    minimalTlsVersion: 'Tls12'
    backupPolicy: {
      type: 'Periodic'
      periodicModeProperties: {
        backupIntervalInMinutes: 240
        backupRetentionIntervalInHours: 8
        backupStorageRedundancy: 'Local'
      }
    }
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2025-04-15' = {
  parent: cosmos
  name: 'customer-success'
  properties: { resource: { id: 'customer-success' } }
}

resource items 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2025-04-15' = {
  parent: database
  name: 'account-state'
  properties: {
    resource: {
      id: 'account-state'
      partitionKey: { paths: ['/accountId'], kind: 'Hash', version: 2 }
      indexingPolicy: { indexingMode: 'consistent', automatic: true }
    }
  }
}

var containerScope = '${cosmos.id}/dbs/${database.name}/colls/${items.name}'
var contributorRole = '${cosmos.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'

resource callerData 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2025-04-15' = {
  parent: cosmos
  name: guid(approvedSubscriptionId, cosmos.id, callerPrincipalId, containerScope, contributorRole)
  dependsOn: [items]
  properties: {
    principalId: callerPrincipalId
    roleDefinitionId: contributorRole
    scope: containerScope
  }
}

resource appData 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2025-04-15' = {
  parent: cosmos
  name: guid(approvedSubscriptionId, cosmos.id, appIdentity.id, containerScope, contributorRole)
  dependsOn: [items]
  properties: {
    principalId: appIdentity.properties.principalId
    roleDefinitionId: contributorRole
    scope: containerScope
  }
}

output cosmosAccountId string = cosmos.id
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output cosmosRegion string = location
output cosmosCapacityMode string = 'Serverless'
output cosmosDatabase string = database.name
output cosmosContainer string = items.name
output cosmosPartitionKey string = '/accountId'
output cosmosDataRoleDefinitionId string = contributorRole
output cosmosDataRoleScope string = containerScope
output cosmosCallerRoleAssignmentId string = callerData.id
output cosmosAppRoleAssignmentId string = appData.id
