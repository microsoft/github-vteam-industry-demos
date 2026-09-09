param location string
param cosmosAccountName string
param tags object
param webPrincipalId string
param workerPrincipalId string
param seederPrincipalId string

var dataContributorRoleDefinitionId = '00000000-0000-0000-0000-000000000002'

resource account 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosAccountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    databaseAccountOfferType: 'Standard'
    disableKeyBasedMetadataWriteAccess: true
    disableLocalAuth: true
    locations: [
      {
        failoverPriority: 0
        isZoneRedundant: false
        locationName: location
      }
    ]
    minimalTlsVersion: 'Tls12'
    publicNetworkAccess: 'Enabled'
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: account
  name: 'proposal-factory'
  properties: {
    resource: {
      id: 'proposal-factory'
    }
  }
}

resource opportunities 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'opportunities'
  properties: {
    resource: {
      id: 'opportunities'
      partitionKey: {
        paths: [
          '/partitionKey'
        ]
        kind: 'Hash'
        version: 2
      }
    }
  }
}

resource documents 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'documents'
  properties: {
    resource: {
      id: 'documents'
      partitionKey: {
        paths: [
          '/partitionKey'
        ]
        kind: 'Hash'
        version: 2
      }
    }
  }
}

resource reusableContent 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'reusable-content'
  properties: {
    resource: {
      id: 'reusable-content'
      partitionKey: {
        paths: [
          '/partitionKey'
        ]
        kind: 'Hash'
        version: 2
      }
    }
  }
}

resource proposals 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'proposals'
  properties: {
    resource: {
      id: 'proposals'
      partitionKey: {
        paths: [
          '/partitionKey'
        ]
        kind: 'Hash'
        version: 2
      }
    }
  }
}

resource generationRuns 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'generation-runs'
  properties: {
    resource: {
      id: 'generation-runs'
      partitionKey: {
        paths: [
          '/partitionKey'
        ]
        kind: 'Hash'
        version: 2
      }
    }
  }
}

resource exports 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'exports'
  properties: {
    resource: {
      id: 'exports'
      partitionKey: {
        paths: [
          '/partitionKey'
        ]
        kind: 'Hash'
        version: 2
      }
    }
  }
}

resource audit 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'audit-events'
  properties: {
    resource: {
      id: 'audit-events'
      partitionKey: {
        paths: [
          '/partitionKey'
        ]
        kind: 'Hash'
        version: 2
      }
    }
  }
}

resource webDataContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: account
  name: guid(account.id, webPrincipalId, dataContributorRoleDefinitionId)
  properties: {
    principalId: webPrincipalId
    roleDefinitionId: '${account.id}/sqlRoleDefinitions/${dataContributorRoleDefinitionId}'
    scope: account.id
  }
}

resource workerDataContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: account
  name: guid(account.id, workerPrincipalId, dataContributorRoleDefinitionId)
  properties: {
    principalId: workerPrincipalId
    roleDefinitionId: '${account.id}/sqlRoleDefinitions/${dataContributorRoleDefinitionId}'
    scope: account.id
  }
}

resource seederOpportunitiesContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: account
  name: guid(opportunities.id, seederPrincipalId, dataContributorRoleDefinitionId)
  properties: {
    principalId: seederPrincipalId
    roleDefinitionId: '${account.id}/sqlRoleDefinitions/${dataContributorRoleDefinitionId}'
    scope: '${account.id}/dbs/${database.name}/colls/${opportunities.name}'
  }
}

resource seederDocumentsContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: account
  name: guid(documents.id, seederPrincipalId, dataContributorRoleDefinitionId)
  properties: {
    principalId: seederPrincipalId
    roleDefinitionId: '${account.id}/sqlRoleDefinitions/${dataContributorRoleDefinitionId}'
    scope: '${account.id}/dbs/${database.name}/colls/${documents.name}'
  }
}

resource seederContentContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: account
  name: guid(reusableContent.id, seederPrincipalId, dataContributorRoleDefinitionId)
  properties: {
    principalId: seederPrincipalId
    roleDefinitionId: '${account.id}/sqlRoleDefinitions/${dataContributorRoleDefinitionId}'
    scope: '${account.id}/dbs/${database.name}/colls/${reusableContent.name}'
  }
}

output accountName string = account.name
output endpoint string = account.properties.documentEndpoint
output databaseName string = database.name
output opportunitiesContainerName string = opportunities.name
output documentsContainerName string = documents.name
output contentContainerName string = reusableContent.name
output proposalsContainerName string = proposals.name
output generationRunsContainerName string = generationRuns.name
output exportsContainerName string = exports.name
output auditContainerName string = audit.name
