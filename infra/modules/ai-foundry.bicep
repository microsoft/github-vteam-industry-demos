// ─────────────────────────────────────────────────────────────────────────────
// Microsoft AI Foundry — the centrepiece of ClaimProcessing.
//
//   • AIServices account (kind: AIServices, SKU S0) with a system-assigned
//     identity and a custom subdomain (required for the token-based data plane).
//   • A Foundry project (child of the account) that hosts the claim-assessment
//     agent Switch builds.
//   • A gpt-4o model deployment the agent runs on.
//
// The agent itself is a data-plane resource created after provisioning by the
// postprovision hook (infra/hooks/postprovision.*), because agents are managed
// through the Foundry Agents API rather than ARM.
// ─────────────────────────────────────────────────────────────────────────────
@description('Azure region.')
param location string

@description('Resource tags.')
param tags object

@description('Foundry (AIServices) account name — becomes the custom subdomain.')
param foundryAccountName string

@description('Foundry project name.')
param projectName string

@description('Model to deploy (e.g. gpt-4o).')
param modelName string

@description('Model version.')
param modelVersion string

@description('Deployment capacity (thousands of TPM).')
param modelCapacity int

// AIServices multi-service account — this is the "Foundry resource".
resource foundry 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: foundryAccountName
  location: location
  tags: tags
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    // Custom subdomain is mandatory for Entra ID (token) auth on the data plane.
    customSubDomainName: foundryAccountName
    // Enforce Entra ID auth only — no account keys, per Seraph's security posture.
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
    // Marks this account as an AI Foundry (v2) account so it can host projects.
    allowProjectManagement: true
  }
}

// Foundry project — child of the account, hosts agents + threads.
resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: foundry
  name: projectName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    displayName: 'ClaimProcessing'
    description: 'Claim intake, extraction, and policy-based approve/reject recommendation.'
  }
}

// gpt-4o deployment the claim-assessment agent runs on.
resource modelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = {
  parent: foundry
  name: modelName
  sku: {
    name: 'GlobalStandard'
    capacity: modelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
    raiPolicyName: 'Microsoft.DefaultV2'
  }
}

output foundryAccountName string = foundry.name
output foundryAccountId string = foundry.id
output projectName string = project.name
// Data-plane endpoint used by the app SDK and the Agents API.
output projectEndpoint string = 'https://${foundry.name}.services.ai.azure.com/api/projects/${project.name}'
output modelDeploymentName string = modelDeployment.name
