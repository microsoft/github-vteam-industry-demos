using '../main.bicep'

param location = 'swedencentral'
param environmentName = 'dev'
param resourceGroupName = 'rg-aipf-dev-swc-001'
param uniqueSuffix = 'e2d6ac891bb7'

// Supply an immutable build identifier at deployment time:
// az deployment sub create ... --parameters imageTag=<git-sha>
param imageTag = 'replace-with-immutable-build-tag'

param webImageRepository = 'aipf-web'
param apiImageRepository = 'aipf-api'
param workerImageRepository = 'aipf-worker'
param seederImageRepository = 'aipf-seeder'

param generationModelName = 'gpt-5.1'
param generationModelVersion = '2025-11-13'
param generationDeploymentSku = 'Standard'
param generationDeploymentCapacity = 50

param embeddingModelName = 'text-embedding-3-large'
param embeddingModelVersion = '1'
param embeddingDeploymentSku = 'Standard'
param embeddingDeploymentCapacity = 30

param deployKeyVault = false
param deployWorkloads = true

// Compile-only placeholder; deployment scripts require the dedicated bootstrapped Entra client ID.
param entraClientId = '00000000-0000-0000-0000-000000000000'
