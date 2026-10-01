param containerAppsLocation string
param tags object
param environmentId string
param workloadIdentityId string
param registryLoginServer string
param storageAccountName string
param documentIntelligenceEndpoint string
param foundryProjectEndpoint string
param modelDeploymentName string
param foundryAgentDocumentVersion string
param foundryAgentCompletenessVersion string
param foundryAgentRiskVersion string
param foundryAgentSummaryVersion string
param searchEndpoint string
param imageName string = ''

var containerImage = empty(imageName) ? 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest' : imageName

resource application 'Microsoft.App/containerApps@2025-01-01' = {
  name: 'ca-kyc-fs01'
  location: containerAppsLocation
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${workloadIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Multiple'
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 8000
        transport: 'auto'
      }
      registries: [
        {
          server: registryLoginServer
          identity: workloadIdentityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'kyc-cockpit'
          image: containerImage
          env: [
            {
              name: 'KYC_STORAGE_MODE'
              value: 'azure'
            }
            {
              name: 'STORAGE_ACCOUNT_NAME'
              value: storageAccountName
            }
            {
              name: 'STORAGE_CONTAINER_NAME'
              value: 'kyc-demo'
            }
            {
              name: 'DOCUMENT_INTELLIGENCE_ENDPOINT'
              value: documentIntelligenceEndpoint
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: reference(workloadIdentityId, '2023-01-31').clientId
            }
            {
              name: 'PROCESS_PRIMARY_ON_STARTUP'
              value: 'false'
            }
            {
              name: 'FOUNDRY_PROJECT_ENDPOINT'
              value: foundryProjectEndpoint
            }
            {
              name: 'FOUNDRY_MODEL_DEPLOYMENT'
              value: modelDeploymentName
            }
            {
              name: 'FOUNDRY_AGENT_DOCUMENT_NAME'
              value: 'kyc-document-entity-extractor'
            }
            {
              name: 'FOUNDRY_AGENT_DOCUMENT_VERSION'
              value: foundryAgentDocumentVersion
            }
            {
              name: 'FOUNDRY_AGENT_COMPLETENESS_NAME'
              value: 'kyc-completeness-validator'
            }
            {
              name: 'FOUNDRY_AGENT_COMPLETENESS_VERSION'
              value: foundryAgentCompletenessVersion
            }
            {
              name: 'FOUNDRY_AGENT_RISK_NAME'
              value: 'kyc-risk-investigator'
            }
            {
              name: 'FOUNDRY_AGENT_RISK_VERSION'
              value: foundryAgentRiskVersion
            }
            {
              name: 'FOUNDRY_AGENT_SUMMARY_NAME'
              value: 'kyc-analyst-summary'
            }
            {
              name: 'FOUNDRY_AGENT_SUMMARY_VERSION'
              value: foundryAgentSummaryVersion
            }
            {
              name: 'AZURE_SEARCH_ENDPOINT'
              value: searchEndpoint
            }
            {
              name: 'AZURE_SEARCH_INDEX_NAME'
              value: 'kyc-screening-v1'
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

output applicationName string = application.name
output applicationUrl string = 'https://${application.properties.configuration.ingress.fqdn}'
