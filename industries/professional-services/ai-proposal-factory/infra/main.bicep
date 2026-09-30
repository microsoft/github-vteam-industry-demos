targetScope = 'resourceGroup'

@description('The only permitted Azure region for regional resources.')
param location string = 'swedencentral'

@description('Shared naming stem used where Azure naming rules permit.')
param namingStem string = 'professional-services-04'

@description('Exact Microsoft Foundry project name required by the brief.')
param foundryProjectName string = 'proj-professional-services-04'

@description('Object ID of the deploying user for Blob/Table data-plane validation and deployment configuration.')
param deployerPrincipalId string = ''

@description('Deploy the single model used by the completed Foundry runtime.')
param deployModel bool = true

@description('Deploy the Azure Container Registry used for the single application image.')
param deployContainerRegistry bool = false

@description('Deploy or update the single Container App. Requires deployContainerRegistry and containerImage.')
param deployContainerApp bool = false

@description('Fully qualified immutable image reference for the Container App.')
param containerImage string = ''

@description('Configured Requirements Analyst agent ID. Supplied after scripts/configure_agents.py runs.')
param requirementsAgentId string = ''

@description('Configured Proposal Writer agent ID. Supplied after scripts/configure_agents.py runs.')
param proposalWriterAgentId string = ''

@description('Configured Risk Reviewer agent ID. Supplied after scripts/configure_agents.py runs.')
param riskReviewerAgentId string = ''

@description('Tags applied to all resources that support tags.')
param tags object = {
  project: 'ai-proposal-factory'
  purpose: 'customer-demo'
  environment: 'dev'
  'managed-by': 'azd'
  phase: '3'
}

var uniqueSuffix = toLower(uniqueString(subscription().id, resourceGroup().id, namingStem))
var storageAccountName = take('stprofservices04${uniqueSuffix}', 24)
var searchServiceName = take('srch-prof-services-04-${uniqueSuffix}', 60)
var foundryAccountName = take('aif-prof-services-04-${uniqueSuffix}', 64)
var managedIdentityName = 'id-${namingStem}'
var logAnalyticsName = 'log-${namingStem}'
var containerAppsEnvironmentName = 'cae-${namingStem}'
var containerRegistryName = take('crprofservices04${uniqueSuffix}', 50)
var containerAppName = 'ca-${namingStem}'
var foundryProjectEndpoint = 'https://${foundryAccountName}.services.ai.azure.com/api/projects/${foundryProjectName}'
var storagePublicNetworkPolicyAssignmentId = '/providers/Microsoft.Management/managementGroups/fe482aee-20fd-4a0f-8ecd-1db718a7eb6f/providers/Microsoft.Authorization/policyAssignments/MCAPSGovDeployPolicies'

module identity 'modules/managed-identity.bicep' = {
  name: 'managed-identity'
  params: {
    location: location
    name: managedIdentityName
    tags: tags
  }
}

module observability 'modules/observability.bicep' = {
  name: 'observability'
  params: {
    location: location
    name: logAnalyticsName
    tags: tags
  }
}

module containerEnvironment 'modules/container-apps-environment.bicep' = {
  name: 'container-apps-environment'
  params: {
    location: location
    name: containerAppsEnvironmentName
    logAnalyticsCustomerId: observability.outputs.customerId
    logAnalyticsSharedKey: observability.outputs.sharedKey
    tags: tags
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    name: storageAccountName
    runtimePrincipalId: identity.outputs.principalId
    deployerPrincipalId: deployerPrincipalId
    tags: tags
  }
}

module storagePolicyExemption 'modules/storage-policy-exemption.bicep' = {
  name: 'storage-public-network-policy-exemption'
  params: {
    storageAccountName: storage.outputs.name
    policyAssignmentId: storagePublicNetworkPolicyAssignmentId
    policyDefinitionReferenceId: 'StorageAccountPublicNetworkModify'
  }
}

module storagePublicNetworkEnforcement 'modules/storage-public-network-enforcement.bicep' = {
  name: 'storage-public-network-enforcement'
  params: {
    location: location
    name: storage.outputs.name
    tags: tags
  }
  dependsOn: [
    storagePolicyExemption
  ]
}

module search 'modules/search.bicep' = {
  name: 'search'
  params: {
    location: location
    name: searchServiceName
    runtimePrincipalId: identity.outputs.principalId
    deployerPrincipalId: deployerPrincipalId
    tags: tags
  }
}

module foundry 'modules/foundry.bicep' = {
  name: 'foundry'
  params: {
    location: location
    accountName: foundryAccountName
    projectName: foundryProjectName
    deployModel: deployModel
    runtimePrincipalId: identity.outputs.principalId
    tags: tags
  }
}

module registry 'modules/container-registry.bicep' = if (deployContainerRegistry) {
  name: 'container-registry'
  params: {
    location: location
    name: containerRegistryName
    runtimePrincipalId: identity.outputs.principalId
    tags: tags
  }
}

module containerApp 'modules/container-app.bicep' = if (deployContainerApp) {
  name: 'container-app'
  params: {
    location: location
    name: containerAppName
    managedEnvironmentId: containerEnvironment.outputs.id
    managedIdentityId: identity.outputs.id
    managedIdentityClientId: identity.outputs.clientId
    registryServer: registry!.outputs.loginServer
    image: containerImage
    storageAccountName: storage.outputs.name
    blobEndpoint: storage.outputs.blobEndpoint
    tableEndpoint: storage.outputs.tableEndpoint
    searchEndpoint: search.outputs.endpoint
    foundryProjectEndpoint: foundryProjectEndpoint
    requirementsAgentId: requirementsAgentId
    proposalWriterAgentId: proposalWriterAgentId
    riskReviewerAgentId: riskReviewerAgentId
    tags: tags
  }
}

output region string = location
output managedIdentityName string = identity.outputs.name
output managedIdentityClientId string = identity.outputs.clientId
output storageAccountName string = storage.outputs.name
output blobEndpoint string = storage.outputs.blobEndpoint
output tableEndpoint string = storage.outputs.tableEndpoint
output searchServiceName string = search.outputs.name
output searchEndpoint string = search.outputs.endpoint
output foundryAccountName string = foundry.outputs.accountName
output foundryProjectName string = foundry.outputs.projectName
output foundryProjectId string = foundry.outputs.projectId
output foundryProjectEndpoint string = foundryProjectEndpoint
output modelDeploymentName string = foundry.outputs.modelDeploymentName
output containerAppsEnvironmentName string = containerEnvironment.outputs.name
output logAnalyticsWorkspaceName string = observability.outputs.name
output containerRegistryName string = deployContainerRegistry ? registry!.outputs.name : ''
output containerRegistryLoginServer string = deployContainerRegistry ? registry!.outputs.loginServer : ''
output containerAppName string = deployContainerApp ? containerApp!.outputs.name : ''
output containerAppUrl string = deployContainerApp ? containerApp!.outputs.url : ''
