[CmdletBinding()]
param(
    [string]$ResourceGroupName = "rg-aipf-dev-swc-001",
    [string]$JobName = "caj-aipf-dev-swc-seed-001",
    [int]$TimeoutSeconds = 1800
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$executionName = az containerapp job start `
    --resource-group $ResourceGroupName `
    --name $JobName `
    --query name `
    --output tsv
if ($LASTEXITCODE -ne 0 -or -not $executionName) {
    throw "Could not start seed job '$JobName'."
}

Write-Host "Started seed execution: $executionName"
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
    Start-Sleep -Seconds 10
    $execution = az containerapp job execution show `
        --resource-group $ResourceGroupName `
        --name $JobName `
        --job-execution-name $executionName `
        --output json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) {
        throw "Could not read seed execution '$executionName'."
    }
    $status = $execution.properties.status
    Write-Host "Seed status: $status"
    if ($status -eq "Succeeded") {
        Write-Host "Synthetic data and search index seed completed."
        return
    }
    if ($status -in @("Failed", "Stopped", "Degraded")) {
        throw "Seed execution ended with status '$status'. Inspect job logs before retrying."
    }
} while ((Get-Date) -lt $deadline)

throw "Seed execution did not complete within $TimeoutSeconds seconds."
