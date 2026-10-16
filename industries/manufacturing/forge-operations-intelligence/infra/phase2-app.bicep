targetScope = 'resourceGroup'

@description('Immutable published ACR image reference including sha256 digest.')
param image string
param appName string = 'ca-manufacturing-01'
param registryName string = 'acrmanuf01lk45yoce5uq3i'
param runtimeEnvironment array
param sqlitePath string = '/app/data/manufacturing.db'

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' existing = {
  name: 'cae-manufacturing-01'
}
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: 'id-manufacturing-01'
}
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}
resource app 'Microsoft.App/containerApps@2025-01-01' = {
  name: appName
  location: 'swedencentral'
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
      terminationGracePeriodSeconds: 120
      containers: [
        {
          name: 'command-center'
          image: image
          env: concat(runtimeEnvironment, [
            {
              name: 'SQLITE_PATH'
              value: sqlitePath
            }
          ])
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/health'
                port: 8000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              timeoutSeconds: 20
              failureThreshold: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 8000
                scheme: 'HTTP'
              }
              periodSeconds: 30
              timeoutSeconds: 20
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
output fqdn string = app.properties.configuration.ingress.fqdn
output revision string = app.properties.latestRevisionName
