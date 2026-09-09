Set-StrictMode -Version Latest
. "$PSScriptRoot\deployment-validation-contract.ps1"

function Assert-WorkerLiveness {
    param([Parameter(Mandatory)]$WorkerApp)
    $context = "Durable worker"
    $properties = Get-ObjectPropertyValue -InputObject $WorkerApp -Name "properties" -Context $context -Required
    $template = Get-ObjectPropertyValue -InputObject $properties -Name "template" -Context $context -Required
    $scale = Get-ObjectPropertyValue -InputObject $template -Name "scale" -Context $context -Required
    $minimum = Get-ObjectPropertyValue -InputObject $scale -Name "minReplicas" -Context $context -Required
    if (($minimum -isnot [int] -and $minimum -isnot [long]) -or $minimum -lt 1) {
        throw "Durable worker must retain at least one replica: queue-only scale-to-zero strands undispatched Cosmos jobs."
    }
    $rules = @(Get-ObjectPropertyValue -InputObject $scale -Name "rules" -Context $context -Required)
    $queueRules = @($rules | Where-Object { $null -ne (Get-ObjectPropertyValue -InputObject $_ -Name "azureQueue" -Context $context) })
    if ($queueRules.Count -ne 1) { throw "Durable worker must retain its identity-based Azure Queue scaling rule." }
    $queue = Get-ObjectPropertyValue -InputObject $queueRules[0] -Name "azureQueue" -Context $context -Required
    [void](Get-RequiredStringProperty -InputObject $queue -Name "identity" -Context $context)
}
