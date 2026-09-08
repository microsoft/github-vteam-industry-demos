[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][guid]$TenantId,
    [guid]$ClientId = [guid]::Empty,
    [string]$AppOrigin,
    [guid[]]$MemberObjectIds = @(),
    [guid[]]$MemberGroupObjectIds = @()
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$marker = "AI Proposal Factory dedicated end-user authentication v1"
$roleId = "7733d477-960b-4e57-a6c0-1ec26e9c5637"
$account = az account show --query '{tenantId:tenantId}' --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or [guid]$account.tenantId -ne $TenantId) {
    throw "The active Azure tenant does not match the explicitly approved tenant."
}
if ($AppOrigin) {
    $uri = [uri]$AppOrigin
    if ($uri.Scheme -ne "https" -or $uri.GetLeftPart([UriPartial]::Authority) -cne $AppOrigin -or $uri.UserInfo) {
        throw "AppOrigin must be the exact HTTPS Container App origin, without a trailing slash."
    }
}

function Invoke-Graph {
    param([string]$Method, [string]$Path, [hashtable]$Body)
    $arguments = @("rest", "--method", $Method, "--url", "https://graph.microsoft.com/v1.0/$Path", "--output", "json")
    $bodyFile = Join-Path (Get-Location) ".data\auth-bootstrap-$PID.json"
    try {
        if ($Body) {
            New-Item -ItemType Directory -Force (Split-Path $bodyFile) | Out-Null
            $Body | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $bodyFile -Encoding utf8
            $arguments += @("--headers", "Content-Type=application/json", "--body", "@$bodyFile")
        }
        $result = & az @arguments
        if ($LASTEXITCODE -ne 0) { throw "Microsoft Graph $Method failed; no credential fallback is permitted." }
        if ($result) { return ($result | ConvertFrom-Json) }
    } finally {
        if (Test-Path -LiteralPath $bodyFile) { Remove-Item -LiteralPath $bodyFile }
    }
}

$application = $null
if ($ClientId -ne [guid]::Empty) {
    # Avoid OData key-segment parentheses here: on Windows, az.cmd can pass the
    # unquoted segment through cmd.exe and interpret it before Azure CLI sees it.
    $matches = Invoke-Graph GET "applications?`$filter=appId eq '$ClientId'&`$select=id,appId,notes,web"
    if (@($matches.value).Count -ne 1) {
        throw "The supplied dedicated ClientId did not resolve to exactly one application."
    }
    $application = $matches.value[0]
    if ($application.notes -cne $marker) { throw "Refusing to modify a registration not owned by this bootstrap contract." }
} else {
    $existing = Invoke-Graph GET "applications?`$filter=displayName eq 'AI Proposal Factory Demo'&`$select=id,appId,notes,web"
    if (@($existing.value).Count -gt 1) { throw "Multiple registrations found. Supply the dedicated ClientId explicitly." }
    if (@($existing.value).Count -eq 1) {
        $application = $existing.value[0]
        if ($application.notes -cne $marker) { throw "The existing display name belongs to another registration." }
    }
}
$redirectUris = if ($AppOrigin) { @("$AppOrigin/.auth/login/aad/callback") }
    elseif ($application) { @($application.web.redirectUris) } else { @() }
$manifest = @{
    displayName = "AI Proposal Factory Demo"
    notes = $marker
    signInAudience = "AzureADMyOrg"
    isFallbackPublicClient = $false
    requiredResourceAccess = @()
    api = @{ requestedAccessTokenVersion = 2 }
    web = @{
        redirectUris = @($redirectUris)
        implicitGrantSettings = @{ enableIdTokenIssuance = $true; enableAccessTokenIssuance = $false }
    }
    appRoles = @(@{
        id = $roleId
        allowedMemberTypes = @("User")
        displayName = "Workspace Member"
        description = "Access all synthetic opportunities, documents, proposals, exports and audit in the demo workspace."
        isEnabled = $true
        value = "ProposalFactory.WorkspaceMember"
    })
}
if (-not $PSCmdlet.ShouldProcess("Dedicated Entra application in the approved tenant", "Create/update secretless identity contract and explicit user assignments")) { return }
if ($application) {
    Invoke-Graph PATCH "applications/$($application.id)" $manifest | Out-Null
} else {
    $application = Invoke-Graph POST "applications" $manifest
}
$principals = Invoke-Graph GET "servicePrincipals?`$filter=appId eq '$($application.appId)'&`$select=id,appId"
if (@($principals.value).Count -gt 1) { throw "Unexpected duplicate service principals." }
$sp = if (@($principals.value).Count -eq 1) { $principals.value[0] } else {
    Invoke-Graph POST "servicePrincipals" @{ appId = $application.appId; appRoleAssignmentRequired = $true }
}
Invoke-Graph PATCH "servicePrincipals/$($sp.id)" @{ appRoleAssignmentRequired = $true } | Out-Null
$assigned = Invoke-Graph GET "servicePrincipals/$($sp.id)/appRoleAssignedTo?`$select=principalId,appRoleId"
function Add-WorkspaceAssignment {
    param([guid]$PrincipalId)
    if (-not @($assigned.value | Where-Object { $_.principalId -eq "$PrincipalId" -and $_.appRoleId -eq $roleId }).Count) {
        Invoke-Graph POST "servicePrincipals/$($sp.id)/appRoleAssignedTo" @{
            principalId = "$PrincipalId"; resourceId = $sp.id; appRoleId = $roleId
        } | Out-Null
        $assigned.value = @($assigned.value) + @([pscustomobject]@{
            principalId = "$PrincipalId"; appRoleId = $roleId
        })
    }
}
foreach ($member in $MemberObjectIds) {
    # Resolve users explicitly; never assign application/service identities this human role.
    Invoke-Graph GET "users/$member`?`$select=id" | Out-Null
    Add-WorkspaceAssignment $member
}
foreach ($group in $MemberGroupObjectIds) {
    $resolvedGroup = Invoke-Graph GET "groups/$group`?`$select=id,securityEnabled"
    if (-not $resolvedGroup.securityEnabled) {
        throw "Workspace membership groups must be security-enabled."
    }
    Add-WorkspaceAssignment $group
}
Write-Host "AIPF_ENTRA_CLIENT_ID=$($application.appId)"
Write-Host "No credentials created. Existing assignments are preserved; remove assignments explicitly when revoking access."
if (@($MemberGroupObjectIds).Count) {
    Write-Host "Direct members of assigned security groups receive the application-level Workspace Member role."
}
if (-not @($redirectUris).Count) {
    Write-Warning "Sign-in remains unavailable until this script is rerun with the deployed HTTPS AppOrigin and explicit member assignments."
}
