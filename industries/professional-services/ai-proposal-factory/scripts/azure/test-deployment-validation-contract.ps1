[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. "$PSScriptRoot\deployment-validation-contract.ps1"

function Assert-Rejected {
    param(
        [Parameter(Mandatory)][scriptblock]$Operation,
        [Parameter(Mandatory)][string]$ExpectedMessage
    )
    try {
        & $Operation
    } catch {
        if ($_.Exception.Message -notmatch [regex]::Escape($ExpectedMessage)) {
            throw "Expected rejection containing '$ExpectedMessage', got: $($_.Exception.Message)"
        }
        return
    }
    throw "Expected rejection containing '$ExpectedMessage'."
}

function New-WorkloadResponse {
    param(
        [ValidateSet("Omitted", "Null", "EmptyPassword", "Password", "MissingServer", "MissingIdentity", "NullServer", "NullIdentity", "WrongServer", "UnassignedIdentity")]
        [string]$RegistryShape
    )
    $identityId = "/subscriptions/test/resourceGroups/rg-aipf-dev-swc-001/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-aipf-web"
    $registry = [ordered]@{
        identity = $identityId
        server = "acraipfdevswce2d6ac891bb7.azurecr.io"
    }
    switch ($RegistryShape) {
        "Null" { $registry.passwordSecretRef = $null }
        "EmptyPassword" { $registry.passwordSecretRef = "" }
        "Password" { $registry.passwordSecretRef = "acr-password" }
        "MissingServer" { $registry.Remove("server") }
        "MissingIdentity" { $registry.Remove("identity") }
        "NullServer" { $registry.server = $null }
        "NullIdentity" { $registry.identity = $null }
        "WrongServer" { $registry.server = "other.azurecr.io" }
        "UnassignedIdentity" { $registry.identity = "/subscriptions/test/resourceGroups/rg/providers/Microsoft.ManagedIdentity/userAssignedIdentities/not-assigned" }
    }
    return [pscustomobject]@{
        identity = [pscustomobject]@{
            type = "UserAssigned"
            userAssignedIdentities = [pscustomobject]@{ $identityId = [pscustomobject]@{} }
        }
        properties = [pscustomobject]@{
            configuration = [pscustomobject]@{
                registries = @([pscustomobject]$registry)
            }
        }
    }
}

$expectedServer = "acraipfdevswce2d6ac891bb7.azurecr.io"
Assert-ManagedIdentityRegistry -Workload (New-WorkloadResponse Omitted) -WorkloadName "omitted-property workload" -ExpectedServer $expectedServer
Assert-ManagedIdentityRegistry -Workload (New-WorkloadResponse Null) -WorkloadName "null-property workload" -ExpectedServer $expectedServer
Assert-ManagedIdentityRegistry -Workload (New-WorkloadResponse EmptyPassword) -WorkloadName "empty-property workload" -ExpectedServer $expectedServer
Assert-Rejected { Assert-ManagedIdentityRegistry -Workload (New-WorkloadResponse Password) -WorkloadName "password workload" -ExpectedServer $expectedServer } "unexpectedly uses ACR password secret"
Assert-Rejected { Assert-ManagedIdentityRegistry -Workload (New-WorkloadResponse MissingServer) -WorkloadName "malformed workload" -ExpectedServer $expectedServer } "missing required property 'server'"
Assert-Rejected { Assert-ManagedIdentityRegistry -Workload (New-WorkloadResponse MissingIdentity) -WorkloadName "malformed workload" -ExpectedServer $expectedServer } "missing required property 'identity'"
Assert-Rejected { Assert-ManagedIdentityRegistry -Workload (New-WorkloadResponse NullServer) -WorkloadName "null-server workload" -ExpectedServer $expectedServer } "required property 'server' cannot be null"
Assert-Rejected { Assert-ManagedIdentityRegistry -Workload (New-WorkloadResponse NullIdentity) -WorkloadName "null-identity workload" -ExpectedServer $expectedServer } "required property 'identity' cannot be null"
Assert-Rejected { Assert-ManagedIdentityRegistry -Workload (New-WorkloadResponse WrongServer) -WorkloadName "wrong-server workload" -ExpectedServer $expectedServer } "does not match expected ACR"
Assert-Rejected { Assert-ManagedIdentityRegistry -Workload (New-WorkloadResponse UnassignedIdentity) -WorkloadName "unassigned-identity workload" -ExpectedServer $expectedServer } "is not assigned to the workload"

$global:ValidationAzScenario = "MalformedJson"
function global:az {
    $global:LASTEXITCODE = 0
    if ($global:ValidationAzScenario -eq "MalformedJson") { return "{not-json" }
    $global:LASTEXITCODE = 23
    return "synthetic Azure CLI failure"
}
try {
    Assert-Rejected { Invoke-AzJson -Arguments @("containerapp", "show", "--output", "json") -Operation "reading test workload" } "returned malformed JSON"
    $global:ValidationAzScenario = "CliFailure"
    Assert-Rejected { Invoke-AzJson -Arguments @("containerapp", "show", "--output", "json") -Operation "reading test workload" } "exit code 23"
} finally {
    Remove-Item Function:\az
    Remove-Variable ValidationAzScenario -Scope Global
}

Write-Host "PASS offline deployment validation for omitted/null/empty/password-bearing registry properties, required server/identity failures, malformed JSON, and CLI failures."
