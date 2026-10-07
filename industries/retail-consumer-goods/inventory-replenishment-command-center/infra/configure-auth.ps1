[CmdletBinding()]
param(
    [string] $SubscriptionId = '',
    [string] $ResourceGroupName = 'rg-retail-consumer-goods-01',
    [string] $ContainerAppName = 'ca-retail-consumer-goods-ne-02',
    [string] $ApplicationDisplayName = 'Harbour Lane Inventory Command Center',
    [string] $PlannerPrincipalObjectId = '',
    [string] $EasyAuthSecretName = 'entra-client-secret',
    [string] $PlannerRoleId = '7d764851-e975-4f1a-8906-4b267d9f5d10'
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
    throw 'The Container App must exist before authentication is configured.'
}
$publicFqdn = $fqdn -replace '\.internal\.', '.'

$applications = @(az ad app list --display-name $ApplicationDisplayName --output json | ConvertFrom-Json)
if ($applications.Count -gt 1) {
    throw "More than one Entra application uses display name '$ApplicationDisplayName'."
}

if ($applications.Count -eq 0) {
    $application = az ad app create `
        --display-name $ApplicationDisplayName `
        --sign-in-audience AzureADMyOrg `
        --enable-id-token-issuance true `
        --app-roles "@$PSScriptRoot\auth-app-roles.json" `
        --output json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Entra application creation failed.' }
} else {
    $application = $applications[0]
    az ad app update `
        --id $application.appId `
        --enable-id-token-issuance true `
        --app-roles "@$PSScriptRoot\auth-app-roles.json" `
        --output none
    if ($LASTEXITCODE -ne 0) { throw 'Entra application update failed.' }
}

$clientId = $application.appId
$redirectUri = "https://$publicFqdn/.auth/login/aad/callback"
$redirectUris = @($application.web.redirectUris)
if ($redirectUri -notin $redirectUris) {
    $redirectUris += $redirectUri
}
az ad app update `
    --id $clientId `
    --identifier-uris "api://$clientId" `
    --web-redirect-uris $redirectUris `
    --output none
if ($LASTEXITCODE -ne 0) { throw 'Entra redirect URI update failed.' }

$servicePrincipal = az ad sp show --id $clientId --output json 2>$null | ConvertFrom-Json
if (-not $servicePrincipal) {
    $servicePrincipal = az ad sp create --id $clientId --output json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Entra service principal creation failed.' }
}

$clientSecret = az ad app credential reset `
    --id $clientId `
    --append `
    --display-name "$ContainerAppName-easy-auth" `
    --years 1 `
    --query password `
    --output tsv 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Entra client credential creation failed.' }
if (-not $clientSecret) {
    throw 'Entra client credential creation returned no value.'
}

try {
    az containerapp secret set `
        --resource-group $ResourceGroupName `
        --name $ContainerAppName `
        --secrets "$EasyAuthSecretName=$clientSecret" `
        --output none
    if ($LASTEXITCODE -ne 0) { throw 'Container App secret update failed.' }

    az containerapp auth microsoft update `
        --resource-group $ResourceGroupName `
        --name $ContainerAppName `
        --client-id $clientId `
        --client-secret-name $EasyAuthSecretName `
        --issuer "https://login.microsoftonline.com/$($account.tenantId)/v2.0" `
        --allowed-audiences "api://$clientId" `
        --yes `
        --output none
    if ($LASTEXITCODE -ne 0) { throw 'Container Apps Microsoft identity provider update failed.' }

    az containerapp auth update `
        --resource-group $ResourceGroupName `
        --name $ContainerAppName `
        --enabled true `
        --unauthenticated-client-action RedirectToLoginPage `
        --redirect-provider azureactivedirectory `
        --require-https true `
        --yes `
        --output none
    if ($LASTEXITCODE -ne 0) { throw 'Container Apps authentication enforcement failed.' }
} finally {
    $clientSecret = $null
}

if ($PlannerPrincipalObjectId) {
    $accessToken = az account get-access-token `
        --resource-type ms-graph `
        --query accessToken `
        --output tsv
    if ($LASTEXITCODE -ne 0 -or -not $accessToken) {
        throw 'Microsoft Graph token acquisition failed.'
    }
    $graphHeaders = @{
        Authorization = "Bearer $accessToken"
        'Content-Type' = 'application/json'
    }
    $assignments = Invoke-RestMethod `
        -Method Get `
        -Uri "https://graph.microsoft.com/v1.0/users/$PlannerPrincipalObjectId/appRoleAssignments" `
        -Headers $graphHeaders
    $existing = $assignments.value | Where-Object {
        $_.resourceId -eq $servicePrincipal.id -and $_.appRoleId -eq $PlannerRoleId
    }
    if (-not $existing) {
        $body = @{
            principalId = $PlannerPrincipalObjectId
            resourceId = $servicePrincipal.id
            appRoleId = $PlannerRoleId
        } | ConvertTo-Json -Compress
        Invoke-RestMethod `
            -Method Post `
            -Uri "https://graph.microsoft.com/v1.0/users/$PlannerPrincipalObjectId/appRoleAssignments" `
            -Headers $graphHeaders `
            -Body $body | Out-Null
    }
    $accessToken = $null
}

az containerapp ingress enable `
    --resource-group $ResourceGroupName `
    --name $ContainerAppName `
    --type external `
    --target-port 8080 `
    --transport auto `
    --allow-insecure false `
    --output none
if ($LASTEXITCODE -ne 0) { throw 'External ingress enablement failed.' }

[pscustomobject]@{
    fqdn = $publicFqdn
    redirectUriAdded = $redirectUri
    redirectUriCount = $redirectUris.Count
    plannerAssignmentRequested = [bool]$PlannerPrincipalObjectId
}
