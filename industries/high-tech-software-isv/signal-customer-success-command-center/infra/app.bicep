targetScope = 'resourceGroup'

@description('Fresh ACR image pinned by sha256 digest; never use a mutable deployment tag.')
@minLength(71)
param image string

param appName string = 'ca-high-tech-software-isv-01'
param location string = 'swedencentral'

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' existing = {
  name: 'cae-high-tech-software-isv-01'
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: 'acrhtisvf4ee1f29'
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: 'id-high-tech-software-isv-01'
}

resource app 'Microsoft.App/containerApps@2025-01-01' = {
  name: appName
  location: location
  tags: {
    industry: 'high-tech-software-isv'
    demo: 'customer-success-command-center'
    'managed-by': 'copilot-squad'
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      maxInactiveRevisions: 100
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: identity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'command-center'
          image: image
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'SQLITE_PATH'
              value: '/app/data/command-center.sqlite3'
            }
            {
              name: 'AZURE_AUTH_MODE'
              value: 'managed_identity'
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: identity.properties.clientId
            }
            {
              name: 'FOUNDRY_PROJECT_ENDPOINT'
              value: 'https://foundry-high-tech-isv-f4ee1f29.services.ai.azure.com/api/projects/proj-high-tech-software-isv-01'
            }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/api/health'
                port: 8000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 5
              periodSeconds: 5
              timeoutSeconds: 5
              failureThreshold: 12
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health'
                port: 8000
                scheme: 'HTTP'
              }
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: 8000
                scheme: 'HTTP'
              }
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

output appId string = app.id
output appName string = app.name
output url string = 'https://${app.properties.configuration.ingress.fqdn}'
output image string = image
output identityId string = identity.id
