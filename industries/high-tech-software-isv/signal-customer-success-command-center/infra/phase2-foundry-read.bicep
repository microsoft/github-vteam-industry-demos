targetScope = 'resourceGroup'

// Only the missing metadata read. Existing invocation roles remain untouched.
var principalId = '1a5b6869-b2d3-4a3a-a807-8fda903b97c9'
var roleGuid = guid(resourceGroup().id, 'phase2-foundry-agent-metadata-reader-v1')
var roleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleGuid)

resource account 'Microsoft.CognitiveServices/accounts@2025-06-01' existing = {
  name: 'foundry-high-tech-isv-f4ee1f29'
}

resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' existing = {
  parent: account
  name: 'proj-high-tech-software-isv-01'
}

resource metadataReader 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: roleGuid
  properties: {
    roleName: 'High Tech ISV Foundry Agent Metadata Reader'
    description: 'Read existing Foundry agent/version metadata for the Phase 2 runtime safety preflight. No authoring or invocation permissions.'
    type: 'CustomRole'
    permissions: [
      {
        actions: []
        notActions: []
        dataActions: [
          'Microsoft.CognitiveServices/accounts/AIServices/agents/read'
        ]
        notDataActions: []
      }
    ]
    // Role availability is RG-wide; the actual grant below is project-only.
    assignableScopes: [
      resourceGroup().id
    ]
  }
}

resource metadataReadAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(project.id, principalId, roleGuid)
  scope: project
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: roleDefinitionId
  }
  dependsOn: [
    metadataReader
  ]
}

output roleDefinitionId string = roleDefinitionId
output roleAssignmentId string = metadataReadAssignment.id
output assignmentScope string = project.id
output principalId string = principalId
