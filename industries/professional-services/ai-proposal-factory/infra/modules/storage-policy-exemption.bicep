param storageAccountName string
param policyAssignmentId string
param policyDefinitionReferenceId string

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource exemption 'Microsoft.Authorization/policyExemptions@2022-07-01-preview' = {
  name: 'ai-proposal-factory-public-network'
  scope: storage
  properties: {
    displayName: 'AI Proposal Factory Storage public endpoint'
    description: 'Waives only the Storage publicNetworkAccess modify policy for this synthetic-data demo account. Anonymous Blob and Shared Key access remain disabled.'
    exemptionCategory: 'Waiver'
    policyAssignmentId: policyAssignmentId
    policyDefinitionReferenceIds: [
      policyDefinitionReferenceId
    ]
  }
}

output id string = exemption.id
