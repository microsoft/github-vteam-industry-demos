param location string
param name string
param managedEnvironmentId string
param managedIdentityId string
param managedIdentityClientId string
param registryServer string
param image string
param storageAccountName string
param blobEndpoint string
param tableEndpoint string
param searchEndpoint string
param foundryProjectEndpoint string
param requirementsAgentId string
param proposalWriterAgentId string
param riskReviewerAgentId string
param tags object

var appTags = union(tags, {
  'azd-service-name': 'web'
  phase: '3'
})

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: appTags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: managedEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: true
        targetPort: 8000
        transport: 'http'
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: registryServer
          identity: managedIdentityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: image
          env: [
            {
              name: 'APP_ENV'
              value: 'demo'
            }
            {
              name: 'APP_ADAPTER_MODE'
              value: 'azure'
            }
            {
              name: 'PORT'
              value: '8000'
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: managedIdentityClientId
            }
            {
              name: 'AZURE_STORAGE_ACCOUNT_NAME'
              value: storageAccountName
            }
            {
              name: 'AZURE_STORAGE_BLOB_ENDPOINT'
              value: blobEndpoint
            }
            {
              name: 'AZURE_STORAGE_TABLE_ENDPOINT'
              value: tableEndpoint
            }
            {
              name: 'AZURE_SEARCH_ENDPOINT'
              value: searchEndpoint
            }
            {
              name: 'AZURE_SEARCH_INDEX_NAME'
              value: 'knowledge-items'
            }
            {
              name: 'FOUNDRY_PROJECT_ENDPOINT'
              value: foundryProjectEndpoint
            }
            {
              name: 'FOUNDRY_MODEL_DEPLOYMENT'
              value: 'gpt-5-mini'
            }
            {
              name: 'FOUNDRY_REQUIREMENTS_AGENT_NAME'
              value: 'requirements-analyst'
            }
            {
              name: 'FOUNDRY_REQUIREMENTS_AGENT_ID'
              value: requirementsAgentId
            }
            {
              name: 'FOUNDRY_PROPOSAL_WRITER_AGENT_NAME'
              value: 'proposal-writer'
            }
            {
              name: 'FOUNDRY_PROPOSAL_WRITER_AGENT_ID'
              value: proposalWriterAgentId
            }
            {
              name: 'FOUNDRY_RISK_REVIEWER_AGENT_NAME'
              value: 'risk-reviewer'
            }
            {
              name: 'FOUNDRY_RISK_REVIEWER_AGENT_ID'
              value: riskReviewerAgentId
            }
            {
              name: 'DEMO_SEED_VERSION'
              value: 'v1'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: 8000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 20
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health'
                port: 8000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 6
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

output id string = app.id
output name string = app.name
output fqdn string = app.properties.configuration.ingress.fqdn
output url string = 'https://${app.properties.configuration.ingress.fqdn}'
