param(
    [ValidateSet('e2d6ac89-1bb7-420c-97fb-a96dea6c0635')]
    [string]$ExpectedSubscriptionId = 'e2d6ac89-1bb7-420c-97fb-a96dea6c0635',
    [switch]$ValidateOnly,
    [switch]$PersistenceOnly
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$account = az account show --subscription $ExpectedSubscriptionId --query '{id:id,name:name}' -o json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $account.id -ne $ExpectedSubscriptionId) {
    throw 'Authenticated subscription does not match the approved subscription. No subscription switch performed.'
}
$group = az group show --subscription $ExpectedSubscriptionId -n rg-high-tech-software-isv-01 -o json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $group.location -ne 'swedencentral') {
    throw 'Existing resource group inspection failed or its location changed.'
}
$token = az account get-access-token --subscription $ExpectedSubscriptionId --query accessToken -o tsv
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify authenticated user for RBAC.' }
$payload = $token.Split('.')[1].Replace('-', '+').Replace('_', '/')
$payload = $payload.PadRight($payload.Length + (4 - $payload.Length % 4) % 4, '=')
$caller = ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json).oid
$token = $null
$payload = $null
if (-not $caller) { throw 'Approved subscription token has no caller object ID.' }
$operation = if ($ValidateOnly) { 'validate' } else { 'create' }
$template = if ($PersistenceOnly) { 'infra\persistence.bicep' } else { 'infra\main.bicep' }
$deploymentName = if ($PersistenceOnly) { 'phase1-persistence-revision' } else { 'phase1-core' }
Write-Host "Subscription: $($account.name) ($($account.id)); existing RG: $($group.name)"
$result = az deployment group $operation --resource-group $group.name `
    --subscription $ExpectedSubscriptionId `
    --name $deploymentName --mode Incremental --template-file $template `
    --parameters "callerPrincipalId=$caller" --only-show-errors -o json
if ($LASTEXITCODE -ne 0) { throw "Phase 1 deployment $operation failed." }
New-Item -ItemType Directory -Path infra\evidence -Force | Out-Null
$deployment = $result | ConvertFrom-Json
if ($ValidateOnly) {
    @{ validatedAtUtc = [DateTime]::UtcNow.ToString('o'); status = 'Succeeded'; subscription = $account } |
        ConvertTo-Json -Depth 5 | Set-Content "infra\evidence\$deploymentName-validation.json"
} else {
    $handoff = if (Test-Path infra\phase1-handoff.json) {
        Get-Content infra\phase1-handoff.json -Raw | ConvertFrom-Json -AsHashtable
    } else { @{} }
    $deployment.properties.outputs.PSObject.Properties | ForEach-Object {
        $handoff[$_.Name] = $_.Value.value
    }
    $handoff['subscriptionName'] = $account.name
    $handoff['callerPrincipalId'] = $caller.Trim()
    $handoff[$(if ($PersistenceOnly) { 'persistenceDeployedAtUtc' } else { 'deployedAtUtc' })] = [DateTime]::UtcNow.ToString('o')
    $handoff[$(if ($PersistenceOnly) { 'persistenceDeploymentId' } else { 'deploymentId' })] = $deployment.id
    $handoff['runtimeApiVersion'] = 'v1'
    $handoff['runtimeProtocol'] = 'Foundry agents (new), OpenAI Responses'
    $handoff['storagePublicNetworkAccessRequested'] = 'Disabled'
    $handoff['phase1Status'] = 'accepted-complete-persistence-awaiting-data-validation'
    $handoff['phase1AcceptedByUser'] = $true
    $handoff['phase2Ready'] = $false
    $handoff['phase2Authorized'] = $false
    $handoff['blobRequiredForApplication'] = $false
    $handoff['seedSource'] = 'bundled-synthetic-data-in-future-application'
    $handoff | ConvertTo-Json -Depth 10 | Set-Content infra\phase1-handoff.json
    @{ id = $deployment.id; state = $deployment.properties.provisioningState; outputs = $deployment.properties.outputs } |
        ConvertTo-Json -Depth 10 | Set-Content "infra\evidence\$deploymentName-deployment.json"
    Write-Host 'Deployment succeeded; nonsecret outputs saved to infra\phase1-handoff.json.'
}
