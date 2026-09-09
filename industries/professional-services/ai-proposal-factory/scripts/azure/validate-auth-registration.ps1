[CmdletBinding()]
param(
    [Parameter(Mandatory)][AllowEmptyString()][string]$ClientId,
    [switch]$RequireRedirectUri
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$id = [guid]::Empty
if (-not [guid]::TryParse($ClientId, [ref]$id) -or $id -eq [guid]::Empty) {
    throw "Set AIPF_ENTRA_CLIENT_ID to the dedicated bootstrapped end-user app registration UUID."
}
$app = az ad app show --id $ClientId --query '{id:id,appId:appId,notes:notes,signInAudience:signInAudience,web:web,api:api,appRoles:appRoles,isFallbackPublicClient:isFallbackPublicClient,requiredResourceAccess:requiredResourceAccess}' --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $app) { throw "Cannot read the Entra app registration in the active tenant." }
if ($app.notes -cne "AI Proposal Factory dedicated end-user authentication v1" -or
    $app.signInAudience -ne "AzureADMyOrg" -or $app.api.requestedAccessTokenVersion -ne 2 -or
    $app.isFallbackPublicClient -or @($app.requiredResourceAccess).Count -ne 0 -or
    -not $app.web.implicitGrantSettings.enableIdTokenIssuance -or
    $app.web.implicitGrantSettings.enableAccessTokenIssuance) {
    throw "Registration does not match the single-tenant, ID-token-only bootstrap contract."
}
$roles = @($app.appRoles | Where-Object {
    $_.id -eq "7733d477-960b-4e57-a6c0-1ec26e9c5637" -and
    $_.value -ceq "ProposalFactory.WorkspaceMember" -and $_.isEnabled -and
    @($_.allowedMemberTypes).Count -eq 1 -and $_.allowedMemberTypes[0] -eq "User"
})
if ($roles.Count -ne 1) { throw "The enabled user-only Workspace Member role is required." }
$sp = az ad sp show --id $ClientId --query '{appRoleAssignmentRequired:appRoleAssignmentRequired}' --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $sp -or -not $sp.appRoleAssignmentRequired) {
    throw "The enterprise application must require explicit assignment."
}
if ($RequireRedirectUri -and @($app.web.redirectUris).Count -ne 1) {
    throw "Finalize the exact deployed callback with bootstrap-auth.ps1 -AppOrigin before validating sign-in."
}
foreach ($redirect in $app.web.redirectUris) {
    $uri = [uri]$redirect
    if ($uri.Scheme -ne "https" -or $uri.AbsolutePath -cne "/.auth/login/aad/callback" -or $uri.Query -or $uri.Fragment -or $uri.UserInfo) {
        throw "Only an exact HTTPS Easy Auth callback is permitted."
    }
}
Write-Host "Entra registration contract validated (read-only)."
