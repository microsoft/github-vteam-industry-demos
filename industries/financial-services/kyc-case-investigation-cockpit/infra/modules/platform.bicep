param location string
param suffix string
param tags object
param workloadPrincipalId string

var storageBlobDataContributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
var searchIndexDataContributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8ebe5a00-799e-43f5-93ac-243d3dce84a7')
var cognitiveServicesUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'a97b65f3-24c7-4388-baec-2e87135dc908')

resource storage 'Microsoft.Storage/storageAccounts@2025-06-01' = {
  name: 'stkycfs01${suffix}'
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

resource search 'Microsoft.Search/searchServices@2025-05-01' = {
  name: 'srch-kyc-fs01-${suffix}'
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'basic'
  }
  properties: {
    disableLocalAuth: true
    hostingMode: 'Default'
    partitionCount: 1
    publicNetworkAccess: 'enabled'
    replicaCount: 1
    semanticSearch: 'free'
  }
}

resource documentIntelligence 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: 'di-kyc-fs01-${suffix}'
  location: location
  tags: tags
  kind: 'FormRecognizer'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: 'di-kyc-fs01-${suffix}'
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource storageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, workloadPrincipalId, storageBlobDataContributorRoleId)
  scope: storage
  properties: {
    principalId: workloadPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: storageBlobDataContributorRoleId
  }
}

resource searchRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(search.id, workloadPrincipalId, searchIndexDataContributorRoleId)
  scope: search
  properties: {
    principalId: workloadPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: searchIndexDataContributorRoleId
  }
}

resource documentIntelligenceRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(documentIntelligence.id, workloadPrincipalId, cognitiveServicesUserRoleId)
  scope: documentIntelligence
  properties: {
    principalId: workloadPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: cognitiveServicesUserRoleId
  }
}

output storageAccountName string = storage.name
output documentIntelligenceName string = documentIntelligence.name
output documentIntelligenceEndpoint string = documentIntelligence.properties.endpoint
output searchServiceName string = search.name
