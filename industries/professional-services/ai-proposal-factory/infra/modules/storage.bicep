param location string
param storageAccountName string
param tags object
param webPrincipalId string
param workerPrincipalId string
param seederPrincipalId string

var blobDataContributorRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
)
var blobDataReaderRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'
)
var queueMessageSenderRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'c6a89b2d-59bc-44d0-9896-0f6e12d7b80a'
)
var queueDataContributorRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
)

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowCrossTenantReplication: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Enabled'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
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

resource uploads 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'uploaded-documents'
  properties: {
    publicAccess: 'None'
  }
}

resource reusableContent 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'reusable-content'
  properties: {
    publicAccess: 'None'
  }
}

resource exports 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'generated-exports'
  properties: {
    publicAccess: 'None'
  }
}

resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource proposalJobs 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = {
  parent: queueService
  name: 'proposal-jobs'
}

resource proposalPoison 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = {
  parent: queueService
  name: 'proposal-jobs-poison'
}

resource webUploadsContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(uploads.id, webPrincipalId, blobDataContributorRoleId)
  scope: uploads
  properties: {
    principalId: webPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: blobDataContributorRoleId
  }
}

resource webReusableReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(reusableContent.id, webPrincipalId, blobDataReaderRoleId)
  scope: reusableContent
  properties: {
    principalId: webPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: blobDataReaderRoleId
  }
}

resource webExportsContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(exports.id, webPrincipalId, blobDataContributorRoleId)
  scope: exports
  properties: {
    principalId: webPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: blobDataContributorRoleId
  }
}

resource webQueueSender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(proposalJobs.id, webPrincipalId, queueMessageSenderRoleId)
  scope: proposalJobs
  properties: {
    principalId: webPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: queueMessageSenderRoleId
  }
}

resource workerUploadsReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(uploads.id, workerPrincipalId, blobDataReaderRoleId)
  scope: uploads
  properties: {
    principalId: workerPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: blobDataReaderRoleId
  }
}

resource workerReusableReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(reusableContent.id, workerPrincipalId, blobDataReaderRoleId)
  scope: reusableContent
  properties: {
    principalId: workerPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: blobDataReaderRoleId
  }
}

resource workerExportsContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(exports.id, workerPrincipalId, blobDataContributorRoleId)
  scope: exports
  properties: {
    principalId: workerPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: blobDataContributorRoleId
  }
}

resource workerQueueContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(proposalJobs.id, workerPrincipalId, queueDataContributorRoleId)
  scope: proposalJobs
  properties: {
    principalId: workerPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: queueDataContributorRoleId
  }
}

resource workerPoisonSender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(proposalPoison.id, workerPrincipalId, queueMessageSenderRoleId)
  scope: proposalPoison
  properties: {
    principalId: workerPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: queueMessageSenderRoleId
  }
}

resource seederReusableContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(reusableContent.id, seederPrincipalId, blobDataContributorRoleId)
  scope: reusableContent
  properties: {
    principalId: seederPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: blobDataContributorRoleId
  }
}

resource seederUploadsContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(uploads.id, seederPrincipalId, blobDataContributorRoleId)
  scope: uploads
  properties: {
    principalId: seederPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: blobDataContributorRoleId
  }
}

output storageAccountName string = storage.name
output blobServiceEndpoint string = storage.properties.primaryEndpoints.blob
output queueServiceEndpoint string = storage.properties.primaryEndpoints.queue
output uploadsContainerName string = uploads.name
output reusableContentContainerName string = reusableContent.name
output exportsContainerName string = exports.name
output jobsQueueName string = proposalJobs.name
