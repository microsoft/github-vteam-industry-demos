// ─────────────────────────────────────────────────────────────────────────────
// RBAC — grant data-plane access to the Foundry account.
//
// No account keys are used (disableLocalAuth = true), so every caller
// authenticates with Entra ID and needs an explicit role:
//   • Azure AI Developer    — create/run agents, threads, runs (app + deployer)
//   • Cognitive Services User — model inference on the deployment
// ─────────────────────────────────────────────────────────────────────────────
@description('Existing Foundry (AIServices) account name in this resource group.')
param foundryAccountName string

@description('Principal ID of the web app managed identity.')
param appIdentityPrincipalId string

@description('Principal ID of the deploying user/SP. Empty to skip.')
param deployerPrincipalId string = ''

// Built-in role definition IDs.
var azureAiDeveloperRoleId = '64702f94-c441-49e6-a78b-ef80e0188fee'
var cognitiveServicesUserRoleId = 'a97b65f3-24c7-4388-baec-2e87135dc908'

resource foundry 'Microsoft.CognitiveServices/accounts@2025-06-01' existing = {
  name: foundryAccountName
}

// ── Web app identity (service principal) ─────────────────────────────────────
resource appAiDeveloper 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundry.id, appIdentityPrincipalId, azureAiDeveloperRoleId)
  scope: foundry
  properties: {
    principalId: appIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', azureAiDeveloperRoleId)
  }
}

resource appCogUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundry.id, appIdentityPrincipalId, cognitiveServicesUserRoleId)
  scope: foundry
  properties: {
    principalId: appIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
  }
}

// ── Deploying user (optional) — so agents can be managed from a dev machine ──
resource deployerAiDeveloper 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerPrincipalId)) {
  name: guid(foundry.id, deployerPrincipalId, azureAiDeveloperRoleId)
  scope: foundry
  properties: {
    principalId: deployerPrincipalId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', azureAiDeveloperRoleId)
  }
}
