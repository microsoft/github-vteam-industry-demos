param location string
param baseName string
param tags object
param logAnalyticsCustomerId string
@secure()
param logAnalyticsSharedKey string
param applicationInsightsConnectionString string
param acrLoginServer string
param webIdentityId string
param webIdentityClientId string
param workerIdentityId string
param workerIdentityClientId string
param seederIdentityId string
param seederIdentityClientId string
param imageTag string
param webImageRepository string
param apiImageRepository string
param workerImageRepository string
param seederImageRepository string
param storageAccountName string
param blobServiceEndpoint string
param queueServiceEndpoint string
param cosmosEndpoint string
param cosmosDatabaseName string
param searchEndpoint string
param searchIndexName string
param openAiEndpoint string
param generationDeploymentName string
param embeddingDeploymentName string
param entraClientId string
param entraTenantId string

var uploadsContainerName = 'uploaded-documents'
var reusableContentContainerName = 'reusable-content'
var exportsContainerName = 'generated-exports'
var proposalQueueName = 'proposal-jobs'
var webAppName = 'ca-${baseName}-web-001'
var workerAppName = 'ca-${baseName}-worker-001'
var seedJobName = 'caj-${baseName}-seed-001'
var commonApplicationSettings = [
  {
    name: 'NODE_ENV'
    value: 'production'
  }
  {
    name: 'DATA_PROVIDER'
    value: 'azure'
  }
  {
    name: 'AI_PROVIDER'
    value: 'azure'
  }
  {
    name: 'AZURE_LOCATION'
    value: 'swedencentral'
  }
  {
    name: 'AZURE_REGION_CODE'
    value: 'swc'
  }
  {
    name: 'AZURE_RESOURCE_GROUP'
    value: 'rg-aipf-dev-swc-001'
  }
  {
    name: 'AZURE_STORAGE_ACCOUNT_NAME'
    value: storageAccountName
  }
  {
    name: 'AZURE_STORAGE_BLOB_ENDPOINT'
    value: blobServiceEndpoint
  }
  {
    name: 'AZURE_STORAGE_QUEUE_ENDPOINT'
    value: queueServiceEndpoint
  }
  {
    name: 'AZURE_BLOB_UPLOADS_CONTAINER'
    value: uploadsContainerName
  }
  {
    name: 'AZURE_BLOB_CONTENT_CONTAINER'
    value: reusableContentContainerName
  }
  {
    name: 'AZURE_BLOB_EXPORTS_CONTAINER'
    value: exportsContainerName
  }
  {
    name: 'AZURE_BLOB_MAX_UPLOAD_BYTES'
    value: '26214400'
  }
  {
    name: 'AZURE_QUEUE_NAME'
    value: proposalQueueName
  }
  {
    name: 'AZURE_POISON_QUEUE_NAME'
    value: 'proposal-jobs-poison'
  }
  {
    name: 'AZURE_QUEUE_VISIBILITY_TIMEOUT_SECONDS'
    value: '60'
  }
  {
    name: 'AZURE_QUEUE_MAX_DEQUEUE_COUNT'
    value: '5'
  }
  {
    name: 'AZURE_COSMOS_ENDPOINT'
    value: cosmosEndpoint
  }
  {
    name: 'AZURE_COSMOS_DATABASE'
    value: cosmosDatabaseName
  }
  {
    name: 'AZURE_COSMOS_OPPORTUNITIES_CONTAINER'
    value: 'opportunities'
  }
  {
    name: 'AZURE_COSMOS_DOCUMENTS_CONTAINER'
    value: 'documents'
  }
  {
    name: 'AZURE_COSMOS_CONTENT_CONTAINER'
    value: 'reusable-content'
  }
  {
    name: 'AZURE_COSMOS_PROPOSALS_CONTAINER'
    value: 'proposals'
  }
  {
    name: 'AZURE_COSMOS_GENERATION_RUNS_CONTAINER'
    value: 'generation-runs'
  }
  {
    name: 'AZURE_COSMOS_EXPORTS_CONTAINER'
    value: 'exports'
  }
  {
    name: 'AZURE_COSMOS_AUDIT_CONTAINER'
    value: 'audit-events'
  }
  {
    name: 'AZURE_SEARCH_ENDPOINT'
    value: searchEndpoint
  }
  {
    name: 'AZURE_SEARCH_INDEX'
    value: searchIndexName
  }
  {
    name: 'AZURE_OPENAI_ENDPOINT'
    value: openAiEndpoint
  }
  {
    name: 'AZURE_OPENAI_GENERATION_DEPLOYMENT'
    value: generationDeploymentName
  }
  {
    name: 'AZURE_OPENAI_EMBEDDING_DEPLOYMENT'
    value: embeddingDeploymentName
  }
  {
    name: 'AZURE_OPENAI_API_VERSION'
    value: 'v1'
  }
  {
    name: 'AZURE_SEARCH_API_VERSION'
    value: '2025-09-01'
  }
  {
    name: 'AI_EMBEDDINGS_ENABLED'
    value: 'true'
  }
  {
    name: 'AI_EMBEDDING_DIMENSIONS'
    value: '3072'
  }
  {
    name: 'AI_RETRIEVAL_TOP_K'
    value: '8'
  }
  {
    name: 'AI_VECTOR_K'
    value: '30'
  }
  {
    name: 'AI_CONTEXT_TOKENS'
    value: '64000'
  }
  {
    name: 'AI_MAX_INPUT_TOKENS'
    value: '40000'
  }
  {
    name: 'AI_MAX_OUTPUT_TOKENS'
    value: '16000'
  }
  {
    name: 'AI_REQUEST_TIMEOUT_MS'
    value: '120000'
  }
  {
    name: 'AI_MAX_RETRIES'
    value: '3'
  }
  {
    name: 'AI_RETRY_BASE_MS'
    value: '500'
  }
  {
    name: 'AI_RETRY_MAX_MS'
    value: '30000'
  }
  {
    name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
    value: applicationInsightsConnectionString
  }
]

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${baseName}-001'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsSharedKey
      }
    }
    zoneRedundant: false
  }
}

resource webApp 'Microsoft.App/containerApps@2025-01-01' = {
  name: webAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${webIdentityId}': {}
    }
  }
  properties: {
    environmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: true
        targetPort: 8080
        transport: 'Auto'
      }
      registries: [
        {
          identity: webIdentityId
          server: acrLoginServer
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: '${acrLoginServer}/${webImageRepository}:${imageTag}'
          env: [
            {
              name: 'API_UPSTREAM'
              value: 'http://localhost:3001'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/'
                port: 8080
                scheme: 'HTTP'
              }
              initialDelaySeconds: 15
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/'
                port: 8080
                scheme: 'HTTP'
              }
              initialDelaySeconds: 5
              periodSeconds: 10
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
        {
          name: 'api'
          image: '${acrLoginServer}/${apiImageRepository}:${imageTag}'
          env: concat(commonApplicationSettings, [
            {
              name: 'PORT'
              value: '3001'
            }
            {
              name: 'HOST'
              value: '127.0.0.1'
            }
            {
              name: 'AUTH_MODE'
              value: 'entra'
            }
            {
              name: 'AUTH_TRUSTED_PROXY'
              value: 'container-apps'
            }
            {
              name: 'AUTH_TENANT_ID'
              value: entraTenantId
            }
            {
              name: 'AUTH_CLIENT_ID'
              value: entraClientId
            }
            {
              name: 'AUTH_PUBLIC_ORIGIN'
              value: 'https://${webAppName}.${environment.properties.defaultDomain}'
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: webIdentityClientId
            }
            {
              name: 'APPLICATIONINSIGHTS_AUTHENTICATION_STRING'
              value: 'Authorization=AAD;ClientId=${webIdentityClientId}'
            }
          ])
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 8080
                scheme: 'HTTP'
              }
              initialDelaySeconds: 15
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 8080
                scheme: 'HTTP'
              }
              initialDelaySeconds: 5
              periodSeconds: 10
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
        maxReplicas: 3
        rules: [
          {
            name: 'http-concurrency'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
    workloadProfileName: 'Consumption'
  }
}

resource webAuthentication 'Microsoft.App/containerApps/authConfigs@2025-01-01' = {
  parent: webApp
  name: 'current'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: 'azureActiveDirectory'
      excludedPaths: []
    }
    httpSettings: {
      requireHttps: true
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: entraClientId
          openIdIssuer: '${az.environment().authentication.loginEndpoint}${entraTenantId}/v2.0'
        }
        validation: {
          allowedAudiences: [
            entraClientId
          ]
        }
        login: {
          loginParameters: [
            'scope=openid profile'
            'response_type=id_token'
            'response_mode=form_post'
          ]
        }
      }
    }
    login: {
      allowedExternalRedirectUrls: []
      preserveUrlFragmentsForLogins: false
      nonce: {
        validateNonce: true
        nonceExpirationInterval: '00:05:00'
      }
      cookieExpiration: {
        convention: 'IdentityProviderDerived'
      }
      tokenStore: {
        enabled: false
      }
    }
  }
}

resource workerApp 'Microsoft.App/containerApps@2025-01-01' = {
  name: workerAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${workerIdentityId}': {}
    }
  }
  properties: {
    environmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [
        {
          identity: workerIdentityId
          server: acrLoginServer
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: '${acrLoginServer}/${workerImageRepository}:${imageTag}'
          env: concat(commonApplicationSettings, [
            {
              name: 'AZURE_CLIENT_ID'
              value: workerIdentityClientId
            }
            {
              name: 'APPLICATIONINSIGHTS_AUTHENTICATION_STRING'
              value: 'Authorization=AAD;ClientId=${workerIdentityClientId}'
            }
          ])
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        // The worker also reconciles Cosmos outbox records when the queue is empty.
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'proposal-queue'
            azureQueue: {
              accountName: storageAccountName
              queueName: proposalQueueName
              queueLength: 1
              identity: workerIdentityId
            }
          }
        ]
      }
    }
    workloadProfileName: 'Consumption'
  }
}

resource seedJob 'Microsoft.App/jobs@2024-03-01' = {
  name: seedJobName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${seederIdentityId}': {}
    }
  }
  properties: {
    environmentId: environment.id
    configuration: {
      replicaRetryLimit: 2
      replicaTimeout: 1800
      triggerType: 'Manual'
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: [
        {
          identity: seederIdentityId
          server: acrLoginServer
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'seed'
          image: '${acrLoginServer}/${seederImageRepository}:${imageTag}'
          env: concat(commonApplicationSettings, [
            {
              name: 'AZURE_CLIENT_ID'
              value: seederIdentityClientId
            }
            {
              name: 'APPLICATIONINSIGHTS_AUTHENTICATION_STRING'
              value: 'Authorization=AAD;ClientId=${seederIdentityClientId}'
            }
            {
              name: 'SEED_MODE'
              value: 'idempotent'
            }
          ])
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
    }
    workloadProfileName: 'Consumption'
  }
}

output environmentName string = environment.name
output webAppName string = webApp.name
output webAppFqdn string = webApp.properties.configuration.ingress.fqdn
output webAppUrl string = 'https://${webApp.properties.configuration.ingress.fqdn}'
output workerAppName string = workerApp.name
output seedJobName string = seedJob.name
