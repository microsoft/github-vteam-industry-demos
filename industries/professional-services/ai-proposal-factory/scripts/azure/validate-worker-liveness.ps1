[CmdletBinding()]
param([string]$ResourceGroupName = "rg-aipf-dev-swc-001", [string]$WorkerName = "ca-aipf-dev-swc-worker-001")
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\worker-liveness-contract.ps1"
$worker = Invoke-AzJson -Arguments @(
    "containerapp", "show", "--resource-group", $ResourceGroupName, "--name", $WorkerName, "--output", "json"
) -Operation "reading durable worker topology"
Assert-WorkerLiveness -WorkerApp $worker
$properties = Get-ObjectPropertyValue -InputObject $worker -Name "properties" -Context "Durable worker" -Required
$revision = Get-RequiredStringProperty -InputObject $properties -Name "latestReadyRevisionName" -Context "Durable worker"
$replicas = @(Invoke-AzJson -Arguments @(
    "containerapp", "replica", "list", "--resource-group", $ResourceGroupName, "--name", $WorkerName,
    "--revision", $revision, "--output", "json"
) -Operation "reading durable worker replicas" | Where-Object { $null -ne $_ })
if ($replicas.Count -lt 1) { throw "Durable worker has no replica; autonomous empty-queue recovery is unavailable." }
Write-Host "PASS durable worker retained-replica topology and ready-revision replica presence."
Write-Host "Live fault injection, autonomous completion, lease renewal and queue recovery evidence still required."
