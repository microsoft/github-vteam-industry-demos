[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$account = az account show --query '{tenantId:tenantId,subscriptionId:id,subscriptionName:name,user:user.name,state:state}' -o json | ConvertFrom-Json
if (-not $account.subscriptionId) {
    throw 'No active Azure subscription was detected. Run az login and az account set first.'
}
$subscriptionId = $account.subscriptionId
if ($env:AZURE_SUBSCRIPTION_ID -and $env:AZURE_SUBSCRIPTION_ID -ne $subscriptionId) {
    throw "Azure CLI is using subscription $subscriptionId, but AZURE_SUBSCRIPTION_ID is $env:AZURE_SUBSCRIPTION_ID. Run az account set before continuing."
}
$modelName = if ($env:AZURE_AI_MODEL_NAME) { $env:AZURE_AI_MODEL_NAME } else { 'gpt-5-mini' }
$modelVersion = if ($env:AZURE_AI_MODEL_VERSION) { $env:AZURE_AI_MODEL_VERSION } else { '2025-08-07' }
$modelSku = if ($env:AZURE_AI_MODEL_DEPLOYMENT_SKU) { $env:AZURE_AI_MODEL_DEPLOYMENT_SKU } else { 'DataZoneStandard' }
$providers = @(
    'Microsoft.App',
    'Microsoft.ContainerRegistry',
    'Microsoft.ManagedIdentity',
    'Microsoft.OperationalInsights',
    'Microsoft.Storage',
    'Microsoft.Search',
    'Microsoft.CognitiveServices',
    'Microsoft.MachineLearningServices',
    'Microsoft.Authorization'
)

Write-Output 'Primary and only deployment region: Sweden Central'
Write-Output 'Azure region code: swedencentral'
$account | ConvertTo-Json

foreach ($provider in $providers) {
    $state = az provider show --namespace $provider --query registrationState -o tsv
    Write-Output "$provider`t$state"
}

Write-Output "rg-aipf-dev-swc exists: $(az group exists --name rg-aipf-dev-swc)"
az group list --query "[?contains(name, 'aipf')].{name:name,location:location}" -o table

$containerAppsUsageUrl = "https://management.azure.com/subscriptions/$subscriptionId/providers/Microsoft.App/locations/sweden%20central/usages?api-version=2024-03-01"
az rest --method get --url $containerAppsUsageUrl --query 'value[].{name:name.value,current:currentValue,limit:limit}' -o table

$modelsUrl = "https://management.azure.com/subscriptions/$subscriptionId/providers/Microsoft.CognitiveServices/locations/swedencentral/models?api-version=2024-10-01"
$models = (az rest --method get --url $modelsUrl -o json | ConvertFrom-Json).value
$selectedModels = $models |
    Where-Object {
        $_.model.name -eq $modelName -and
        $_.model.version -eq $modelVersion -and
        $_.model.skus.name -contains $modelSku -and
        $_.model.capabilities.agentsV2 -eq 'true' -and
        $_.model.capabilities.responses -eq 'true' -and
        $_.model.lifecycleStatus -eq 'GenerallyAvailable'
    }

if (-not $selectedModels) {
    throw "Model $modelName version $modelVersion with SKU $modelSku is not available for Foundry Agents in Sweden Central. Choose another Sweden Central model; do not change region."
}

$selectedModels |
    Select-Object -First 1 `
        @{ Name = 'Name'; Expression = { $_.model.name } },
        @{ Name = 'Version'; Expression = { $_.model.version } },
        @{ Name = 'Skus'; Expression = { $_.model.skus.name -join ',' } } |
    Format-Table -AutoSize
