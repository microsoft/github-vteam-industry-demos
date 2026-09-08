[CmdletBinding()]
param(
    [string]$Location = "swedencentral",
    [string]$ExpectedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID,
    [switch]$SkipModelCheck
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($Location -ne "swedencentral") {
    throw "Unsupported location '$Location'. AI Proposal Factory is authorized only for swedencentral."
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "Azure CLI is required."
}

$account = az account show --output json | ConvertFrom-Json
if (-not $account.id) {
    throw "No active Azure subscription. Run 'az login' and select the development subscription."
}
if ($ExpectedSubscriptionId -and $account.id -ne $ExpectedSubscriptionId) {
    throw "Active subscription '$($account.id)' does not match AZURE_SUBSCRIPTION_ID."
}

Write-Host "Tenant:       $($account.tenantId)"
Write-Host "Subscription: $($account.name) ($($account.id))"
Write-Host "Location:     $Location"
Write-Host "Resource group (planned): rg-aipf-dev-swc-001"

$requiredProviders = @(
    "Microsoft.App",
    "Microsoft.Authorization",
    "Microsoft.CognitiveServices",
    "Microsoft.ContainerRegistry",
    "Microsoft.DocumentDB",
    "Microsoft.Insights",
    "Microsoft.KeyVault",
    "Microsoft.ManagedIdentity",
    "Microsoft.OperationalInsights",
    "Microsoft.Search",
    "Microsoft.Storage"
)

$notRegistered = foreach ($provider in $requiredProviders) {
    $state = az provider show --namespace $provider --query registrationState --output tsv
    if ($LASTEXITCODE -ne 0 -or $state -ne "Registered") {
        $provider
    }
}
if (@($notRegistered).Count -gt 0) {
    throw "Required providers are not registered: $($notRegistered -join ', '). Registration changes subscription state and must be completed explicitly before deployment."
}

$resourceChecks = @(
    @{ Namespace = "Microsoft.App"; Type = "managedEnvironments" },
    @{ Namespace = "Microsoft.App"; Type = "containerApps" },
    @{ Namespace = "Microsoft.App"; Type = "jobs" },
    @{ Namespace = "Microsoft.CognitiveServices"; Type = "accounts" },
    @{ Namespace = "Microsoft.ContainerRegistry"; Type = "registries" },
    @{ Namespace = "Microsoft.DocumentDB"; Type = "databaseAccounts" },
    @{ Namespace = "Microsoft.Insights"; Type = "components" },
    @{ Namespace = "Microsoft.ManagedIdentity"; Type = "userAssignedIdentities" },
    @{ Namespace = "Microsoft.OperationalInsights"; Type = "workspaces" },
    @{ Namespace = "Microsoft.Search"; Type = "searchServices" },
    @{ Namespace = "Microsoft.Storage"; Type = "storageAccounts" }
)

foreach ($check in $resourceChecks) {
    $locations = az provider show `
        --namespace $check.Namespace `
        --query "resourceTypes[?resourceType=='$($check.Type)'].locations[]" `
        --output tsv
    if ($LASTEXITCODE -ne 0) {
        throw "Could not query $($check.Namespace)/$($check.Type) location support."
    }
    $normalized = $locations | ForEach-Object { ($_ -replace "\s", "").ToLowerInvariant() }
    if ($normalized -notcontains $Location) {
        throw "$($check.Namespace)/$($check.Type) is not reported in Sweden Central. Stop; do not select a fallback region."
    }
}

if (-not $SkipModelCheck) {
    $modelsJson = az cognitiveservices model list --location $Location --output json
    if ($LASTEXITCODE -ne 0) {
        throw "Could not query Azure OpenAI model availability in $Location."
    }
    $models = $modelsJson | ConvertFrom-Json
    $generation = @($models | Where-Object {
        $_.PSObject.Properties.Name -contains "model" -and
        $_.model.name -eq "gpt-5.1" -and
        $_.model.version -eq "2025-11-13" -and
        @($_.model.skus | Where-Object {
            $_.name -eq "Standard" -and $_.capacity.maximum -ge 50
        }).Count -gt 0
    })
    $embedding = @($models | Where-Object {
        $_.PSObject.Properties.Name -contains "model" -and
        $_.model.name -eq "text-embedding-3-large" -and
        $_.model.version -eq "1" -and
        @($_.model.skus | Where-Object {
            $_.name -eq "Standard" -and $_.capacity.maximum -ge 30
        }).Count -gt 0
    })
    if (-not $generation) {
        throw "Pinned model gpt-5.1 version 2025-11-13 is not currently listed in Sweden Central. Stop; do not choose another region or version."
    }
    if (-not $embedding) {
        throw "Pinned model text-embedding-3-large version 1 is not currently listed in Sweden Central. Stop; do not choose another region or version."
    }

    Write-Host "Pinned Azure OpenAI models are listed in $Location."
    Write-Host "Quota remains non-reserved; inspect immediately before provisioning:"
    Write-Host "  az cognitiveservices usage list --location $Location --output table"
}

Write-Host "Preflight completed without creating or changing Azure resources."
