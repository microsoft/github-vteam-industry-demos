[CmdletBinding()]
param(
    [string] $SubscriptionId = '',
    [string] $ResourceGroupName = 'rg-retail-consumer-goods-01',
    [string] $ContainerAppName = 'ca-retail-consumer-goods-ne-02',
    [string] $ApplicationDisplayName = 'Harbour Lane Inventory Command Center',
    [string] $EasyAuthSecretName = 'entra-client-secret'
)

$ErrorActionPreference = 'Stop'

if ($SubscriptionId) {
    az account set --subscription $SubscriptionId
    if ($LASTEXITCODE -ne 0) { throw "Unable to select subscription '$SubscriptionId'." }
}

$account = az account show --output json | ConvertFrom-Json
if ($account.state -ne 'Enabled') {
    throw 'The selected Azure subscription must be enabled.'
}

$fqdn = az containerapp show `
    --resource-group $ResourceGroupName `
    --name $ContainerAppName `
    --query properties.configuration.ingress.fqdn `
    --output tsv
if (-not $fqdn) {
    throw 'The existing Container App FQDN could not be resolved.'
}
$origin = "https://$fqdn"

az containerapp auth update `
    --resource-group $ResourceGroupName `
    --name $ContainerAppName `
    --enabled false `
    --require-https true `
    --yes `
    --output none
if ($LASTEXITCODE -ne 0) { throw 'Container Apps authentication disablement failed.' }

# The Bicep authConfigs/current resource removes the provider-side secret reference.
# This post-deployment reconciliation removes the now-unreferenced secret material.
$secretNames = @(az containerapp secret list `
    --resource-group $ResourceGroupName `
    --name $ContainerAppName `
    --query '[].name' `
    --output tsv)
if ($EasyAuthSecretName -in $secretNames) {
    az containerapp secret remove `
        --resource-group $ResourceGroupName `
        --name $ContainerAppName `
        --secret-names $EasyAuthSecretName `
        --output none
    if ($LASTEXITCODE -ne 0) { throw 'Unused Container App Easy Auth secret removal failed.' }
}

$applications = @(az ad app list --display-name $ApplicationDisplayName --output json | ConvertFrom-Json)
if ($applications.Count -gt 1) {
    throw "More than one Entra application uses display name '$ApplicationDisplayName'."
}
if ($applications.Count -eq 1) {
    $application = $applications[0]
    $credentialDisplayName = "$ContainerAppName-easy-auth"
    $credentialIds = @(
        $application.passwordCredentials |
            Where-Object displayName -eq $credentialDisplayName |
            ForEach-Object keyId
    )
    foreach ($credentialId in $credentialIds) {
        az ad app credential delete --id $application.appId --key-id $credentialId --output none
        if ($LASTEXITCODE -ne 0) { throw 'Unused Entra Easy Auth credential removal failed.' }
    }
}

[pscustomobject]@{
    containerApp = $ContainerAppName
    origin = $origin
    easyAuthEnabled = $false
    containerAppSecretRemoved = $EasyAuthSecretName -in $secretNames
    entraApplicationRetained = $applications.Count -eq 1
    callbacksRetained = $true
}
