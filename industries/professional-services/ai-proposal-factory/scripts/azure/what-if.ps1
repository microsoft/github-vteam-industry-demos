[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$ImageTag,
    [string]$Location = "swedencentral",
    [string]$ParameterFile = ".\infra\parameters\dev.swedencentral.bicepparam",
    [string]$DeploymentName = "aipf-dev-swc-whatif",
    [string]$EntraClientId = $env:AIPF_ENTRA_CLIENT_ID,
    [switch]$SkipWorkloads,
    [switch]$SkipPreflight
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($Location -ne "swedencentral") {
    throw "Only swedencentral is authorized."
}
if (-not $SkipWorkloads -and $ImageTag -in @("latest", "dev", "main", "master", "bootstrap", "replace-with-immutable-build-tag")) {
    throw "Workload what-if requires an immutable image tag, preferably the full Git commit SHA."
}
if (-not $SkipWorkloads) {
    & "$PSScriptRoot\validate-auth-registration.ps1" -ClientId $EntraClientId
}
if (-not $EntraClientId) { $EntraClientId = "00000000-0000-0000-0000-000000000000" }

if (-not $SkipPreflight) {
    & "$PSScriptRoot\preflight.ps1" -Location $Location
}

az deployment sub what-if `
    --name $DeploymentName `
    --location $Location `
    --template-file ".\infra\main.bicep" `
    --parameters $ParameterFile `
    --parameters imageTag=$ImageTag `
    --parameters deployWorkloads=$(-not $SkipWorkloads) `
    --parameters entraClientId=$EntraClientId `
    --result-format FullResourcePayloads

if ($LASTEXITCODE -ne 0) {
    throw "Subscription what-if failed."
}
