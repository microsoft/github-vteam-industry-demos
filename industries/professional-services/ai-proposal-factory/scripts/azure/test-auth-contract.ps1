[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# The local function intercepts every az invocation; these checks never contact Azure or Graph.
$global:MockAuthApp = $null
$global:MockAuthSp = $null
$global:MockAuthAssignments = @()
$global:MockAuthCreates = 0
$global:MockGroupSecurityEnabled = $true
function global:az {
    $global:LASTEXITCODE = 0
    if ($args[0] -eq "account") { return '{"tenantId":"33333333-3333-4333-8333-333333333333"}' }
    if ($args[0] -eq "ad" -and $args[1] -eq "app") { return ($global:MockAuthApp | ConvertTo-Json -Depth 20) }
    if ($args[0] -eq "ad" -and $args[1] -eq "sp") { return ($global:MockAuthSp | ConvertTo-Json -Depth 20) }
    if ($args[0] -ne "rest") { throw "Unexpected CLI command in offline test." }
    $method = $args[[Array]::IndexOf($args, "--method") + 1]
    $url = $args[[Array]::IndexOf($args, "--url") + 1]
    $body = $null
    if ($args -contains "--body") {
        $file = $args[[Array]::IndexOf($args, "--body") + 1].Substring(1)
        $body = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
    }
    if ($url -match "applications\?" -and $method -eq "GET") {
        return (@{ value = @($global:MockAuthApp | Where-Object { $_ }) } | ConvertTo-Json -Depth 20)
    }
    if ($url -match "applications\(appId=" -and $method -eq "GET") {
        if (-not $global:MockAuthApp) { throw "Unexpected application lookup." }
        return ($global:MockAuthApp | ConvertTo-Json -Depth 20)
    }
    if ($url.EndsWith("/applications") -and $method -eq "POST") {
        $global:MockAuthCreates++
        $global:MockAuthApp = $body
        $global:MockAuthApp | Add-Member id "application-object-id"
        $global:MockAuthApp | Add-Member appId "55555555-5555-4555-8555-555555555555"
        return ($global:MockAuthApp | ConvertTo-Json -Depth 20)
    }
    if ($url -match "/applications/" -and $method -eq "PATCH") {
        foreach ($key in $body.PSObject.Properties.Name) { $global:MockAuthApp.$key = $body.$key }
        return
    }
    if ($url -match "/servicePrincipals\?" -and $method -eq "GET") {
        return (@{ value = @($global:MockAuthSp | Where-Object { $_ }) } | ConvertTo-Json -Depth 20)
    }
    if ($url.EndsWith("/servicePrincipals") -and $method -eq "POST") {
        $global:MockAuthSp = [pscustomobject]@{
            id = "sp-object-id"; appId = $body.appId; appRoleAssignmentRequired = $body.appRoleAssignmentRequired
        }
        return ($global:MockAuthSp | ConvertTo-Json)
    }
    if ($url -match "appRoleAssignedTo" -and $method -eq "GET") {
        return (@{ value = $global:MockAuthAssignments } | ConvertTo-Json -Depth 20)
    }
    if ($url -match "appRoleAssignedTo" -and $method -eq "POST") {
        $global:MockAuthAssignments += @($body)
        return
    }
    if ($url -match "/servicePrincipals/" -and $method -eq "PATCH") {
        $global:MockAuthSp.appRoleAssignmentRequired = $body.appRoleAssignmentRequired
        return
    }
    if ($url -match "/users/" -and $method -eq "GET") { return '{"id":"44444444-4444-4444-8444-444444444444"}' }
    if ($url -match "/groups/" -and $method -eq "GET") {
        return (@{ id = "77777777-7777-4777-8777-777777777777"; securityEnabled = $global:MockGroupSecurityEnabled } |
            ConvertTo-Json)
    }
    throw "Unexpected Graph operation in offline test."
}

function Assert-Rejected {
    param([scriptblock]$Operation)
    $rejected = $false
    try { & $Operation } catch { $rejected = $true }
    if (-not $rejected) { throw "An invalid auth contract was accepted." }
}

try {
    $options = @{
        TenantId = "33333333-3333-4333-8333-333333333333"
        MemberObjectIds = @("44444444-4444-4444-8444-444444444444")
        MemberGroupObjectIds = @("77777777-7777-4777-8777-777777777777")
        Confirm = $false
    }
    $clientId = "55555555-5555-4555-8555-555555555555"
    & "$PSScriptRoot\bootstrap-auth.ps1" @options
    & "$PSScriptRoot\bootstrap-auth.ps1" @options
    & "$PSScriptRoot\bootstrap-auth.ps1" @options -ClientId $clientId -AppOrigin "https://demo.example.test"
    if ($global:MockAuthCreates -ne 1 -or @($global:MockAuthAssignments).Count -ne 2 -or
        -not $global:MockAuthSp.appRoleAssignmentRequired -or
        $global:MockAuthApp.web.redirectUris[0] -ne "https://demo.example.test/.auth/login/aad/callback") {
        throw "Bootstrap did not converge."
    }
    & "$PSScriptRoot\validate-auth-registration.ps1" -ClientId $clientId -RequireRedirectUri
    Assert-Rejected { & "$PSScriptRoot\validate-auth-registration.ps1" -ClientId "00000000-0000-0000-0000-000000000000" }
    $global:MockAuthApp.signInAudience = "AzureADMultipleOrgs"
    Assert-Rejected { & "$PSScriptRoot\validate-auth-registration.ps1" -ClientId $clientId }
    $global:MockAuthApp.signInAudience = "AzureADMyOrg"
    $global:MockAuthApp.appRoles[0].allowedMemberTypes = @("Application")
    Assert-Rejected { & "$PSScriptRoot\validate-auth-registration.ps1" -ClientId $clientId }
    $global:MockAuthApp.appRoles[0].allowedMemberTypes = @("User")
    $global:MockAuthApp.web.redirectUris = @("http://untrusted.example.test/callback")
    Assert-Rejected { & "$PSScriptRoot\validate-auth-registration.ps1" -ClientId $clientId }
    $global:MockAuthApp.web.redirectUris = @("https://demo.example.test/.auth/login/aad/callback")
    $global:MockAuthSp.appRoleAssignmentRequired = $false
    Assert-Rejected { & "$PSScriptRoot\validate-auth-registration.ps1" -ClientId $clientId }
    $global:MockAuthSp.appRoleAssignmentRequired = $true
    $global:MockAuthApp.notes = "Unrelated registration"
    Assert-Rejected { & "$PSScriptRoot\bootstrap-auth.ps1" @options -ClientId $clientId }
    Assert-Rejected {
        & "$PSScriptRoot\bootstrap-auth.ps1" -TenantId "66666666-6666-4666-8666-666666666666" -Confirm:$false
    }
    $global:MockGroupSecurityEnabled = $false
    Assert-Rejected {
        & "$PSScriptRoot\bootstrap-auth.ps1" -TenantId "33333333-3333-4333-8333-333333333333" `
            -ClientId $clientId -MemberGroupObjectIds "77777777-7777-4777-8777-777777777777" -Confirm:$false
    }
    Write-Host "PASS offline auth bootstrap creation/repeat/finalization, user/group assignment idempotence, and 8 invalid-contract denials."
} finally {
    Remove-Item Function:\az
    Remove-Variable MockAuthApp, MockAuthSp, MockAuthAssignments, MockAuthCreates, MockGroupSecurityEnabled -Scope Global
}
