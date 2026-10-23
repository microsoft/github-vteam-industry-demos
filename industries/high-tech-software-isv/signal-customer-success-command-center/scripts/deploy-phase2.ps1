param(
    [Parameter(Mandatory)]
    [ValidatePattern('^acrhtisvf4ee1f29\.azurecr\.io/signal-command-center@sha256:[a-f0-9]{64}$')]
    [string]$Image,
    [ValidateSet('phase2-app', 'phase3-css-patch')]
    [string]$DeploymentName = 'phase2-app',
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$subscription = 'e2d6ac89-1bb7-420c-97fb-a96dea6c0635'
$resourceGroup = 'rg-high-tech-software-isv-01'
$root = Split-Path $PSScriptRoot -Parent
$template = Join-Path $root 'infra\app.bicep'

function Invoke-Azure {
    param([string[]]$Arguments)
    $result = & az @Arguments --subscription $subscription --only-show-errors -o json
    if ($LASTEXITCODE -ne 0) { throw "Azure CLI failed: $($Arguments[0..1] -join ' ')" }
    return ($result | ConvertFrom-Json)
}

$account = Invoke-Azure -Arguments @('account', 'show')
if ($account.id -ne $subscription -or $account.state -ne 'Enabled') {
    throw 'The approved subscription is not available.'
}
$group = Invoke-Azure -Arguments @('group', 'show', '--name', $resourceGroup)
if ($group.location -ne 'swedencentral') { throw 'Unexpected resource group location.' }
$parameters = @('--resource-group', $resourceGroup, '--template-file', $template, '--parameters', "image=$Image")
$validation = Invoke-Azure -Arguments (@('deployment', 'group', 'validate') + $parameters)
if ($validation.properties.provisioningState -ne 'Succeeded') { throw 'Template validation did not succeed.' }
if ($ValidateOnly) { $validation; return }

$deployment = Invoke-Azure -Arguments (@('deployment', 'group', 'create', '--name', $DeploymentName, '--mode', 'Incremental') + $parameters)
if ($deployment.properties.provisioningState -ne 'Succeeded') { throw 'Application deployment did not succeed.' }
$deployment.properties.outputs
