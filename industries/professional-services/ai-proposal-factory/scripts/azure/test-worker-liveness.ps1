[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\worker-liveness-contract.ps1"

$valid = '{"properties":{"template":{"scale":{"minReplicas":1,"maxReplicas":3,"rules":[{"azureQueue":{"identity":"worker-identity"}}]}}}}'
Assert-WorkerLiveness -WorkerApp ($valid | ConvertFrom-Json)
$rejected = 0
foreach ($invalid in @(
    $valid.Replace('"minReplicas":1', '"minReplicas":0'),
    $valid.Replace('"minReplicas":1,', ''),
    $valid.Replace('"minReplicas":1', '"minReplicas":null'),
    $valid.Replace('"minReplicas":1', '"minReplicas":"1"'),
    $valid.Replace('"minReplicas":1', '"minReplicas":true'),
    $valid.Replace('"identity":"worker-identity"', '"identity":null')
)) {
    try { Assert-WorkerLiveness -WorkerApp ($invalid | ConvertFrom-Json) }
    catch { $rejected++; continue }
    throw "Worker liveness contract accepted an unsafe topology."
}
$bicep = Get-Content (Join-Path $PSScriptRoot "..\..\infra\modules\container-apps.bicep") -Raw
$worker = ($bicep -split "resource workerApp ")[1] -split "resource seedJob " | Select-Object -First 1
if ($worker -notmatch 'minReplicas:\s*1\b' -or $worker -notmatch 'maxReplicas:\s*3\b' -or
    $worker -notmatch 'identity:\s*workerIdentityId' -or $worker -notmatch "workloadProfileName:\s*'Consumption'") {
    throw "Bicep must retain one Consumption worker and managed-identity queue scale-out to three."
}
$runtime = Get-Content (Join-Path $PSScriptRoot "..\..\apps\worker\src\index.ts") -Raw
if ($runtime -notmatch 'dispatchPending:\s*\(\)\s*=>\s*runtime.workflow.dispatchPending\(\)' -or
    $runtime -notmatch 'dispatchIntervalMs\s*\?\?\s*30000') {
    throw "Configured worker must run the autonomous outbox loop every 30 seconds while idle."
}
Write-Host "PASS worker liveness: retained replica, queue identity, $rejected unsafe shapes rejected, autonomous startup/idle dispatch."
