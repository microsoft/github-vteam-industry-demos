[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [ValidatePattern("^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$")]
    [string]$ImageTag,
    [string]$Location = "swedencentral",
    [string]$ParameterFile = ".\infra\parameters\dev.swedencentral.bicepparam",
    [string]$DeploymentName = "aipf-dev-swc-$(Get-Date -Format 'yyyyMMdd-HHmmss')",
    [string]$RegistryName = "acraipfdevswce2d6ac891bb7",
    [string]$EntraClientId = $env:AIPF_ENTRA_CLIENT_ID,
    [switch]$SkipPreflight,
    [switch]$SkipWorkloads
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($Location -ne "swedencentral") {
    throw "Only swedencentral is authorized."
}
if (-not $SkipWorkloads -and $ImageTag -in @("latest", "dev", "main", "master", "bootstrap", "replace-with-immutable-build-tag")) {
    throw "Workload deployment requires an immutable image tag, preferably the full Git commit SHA."
}
if (-not $SkipWorkloads) {
    & "$PSScriptRoot\validate-auth-registration.ps1" -ClientId $EntraClientId
}
if (-not $EntraClientId) { $EntraClientId = "00000000-0000-0000-0000-000000000000" }
if (-not $SkipPreflight) {
    & "$PSScriptRoot\preflight.ps1" -Location $Location
}
if (-not $SkipWorkloads) {
    foreach ($repository in @("aipf-web", "aipf-api", "aipf-worker", "aipf-seeder")) {
        $digest = az acr repository show `
            --name $RegistryName `
            --image "${repository}:$ImageTag" `
            --query digest `
            --output tsv
        if ($LASTEXITCODE -ne 0 -or -not $digest) {
            throw "Required image ${repository}:$ImageTag is not present in ACR '$RegistryName'."
        }
        Write-Host "Resolved ${repository}:$ImageTag -> $digest"
    }
}
if (-not $PSCmdlet.ShouldProcess(
    "subscription deployment '$DeploymentName'",
    "Create or update AI Proposal Factory resources in rg-aipf-dev-swc-001"
)) {
    return
}

az deployment sub create `
    --name $DeploymentName `
    --location $Location `
    --template-file ".\infra\main.bicep" `
    --parameters $ParameterFile `
    --parameters imageTag=$ImageTag `
    --parameters deployWorkloads=$(-not $SkipWorkloads) `
    --parameters entraClientId=$EntraClientId `
    --output json

if ($LASTEXITCODE -ne 0) {
    throw "Deployment failed."
}

Write-Host "Infrastructure deployment completed. Wait for RBAC propagation before running seed.ps1."
