param([switch]$ValidateOnly)

$ErrorActionPreference = 'Stop'
$subscription = 'e2d6ac89-1bb7-420c-97fb-a96dea6c0635'
$resourceGroup = 'rg-high-tech-software-isv-01'
$template = Join-Path (Split-Path $PSScriptRoot -Parent) 'infra\phase2-foundry-read.bicep'

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
$identity = Invoke-Azure -Arguments @('identity', 'show', '--resource-group', $resourceGroup,
    '--name', 'id-high-tech-software-isv-01')
if ($identity.principalId -ne '1a5b6869-b2d3-4a3a-a807-8fda903b97c9' -or
    $identity.clientId -ne '63cf5272-0d17-42ce-ac7d-982d2bb12b71') {
    throw 'The existing application identity does not match the approved identity.'
}
$parameters = @('--resource-group', $resourceGroup, '--template-file', $template)
$validation = Invoke-Azure -Arguments (@('deployment', 'group', 'validate') + $parameters)
if ($validation.properties.provisioningState -ne 'Succeeded') { throw 'RBAC validation did not succeed.' }
if ($ValidateOnly) { $validation; return }

$deployment = Invoke-Azure -Arguments (@('deployment', 'group', 'create', '--name',
    'phase2-foundry-read', '--mode', 'Incremental') + $parameters)
if ($deployment.properties.provisioningState -ne 'Succeeded') { throw 'RBAC deployment did not succeed.' }
$deployment.properties.outputs
