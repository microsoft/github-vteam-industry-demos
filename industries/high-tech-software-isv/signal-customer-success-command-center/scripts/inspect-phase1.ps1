$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$config = Get-Content infra\phase1-handoff.json -Raw | ConvertFrom-Json -AsHashtable
$subscription = $config.subscriptionId
if ($subscription -ne 'e2d6ac89-1bb7-420c-97fb-a96dea6c0635' -or
    $config.resourceGroupName -ne 'rg-high-tech-software-isv-01') {
    throw 'Refusing inspection outside the approved subscription/resource group.'
}
$rg = $config.resourceGroupName
function Get-AzureJson {
    param([string[]]$Arguments)
    $result = & az @Arguments --subscription $subscription --only-show-errors --output json
    if ($LASTEXITCODE -ne 0) { throw "Azure inspection failed: $($Arguments[0]) $($Arguments[1])" }
    return ($result | ConvertFrom-Json)
}
$snapshot = @{
    checkedAtUtc = [DateTime]::UtcNow.ToString('o')
    subscription = Get-AzureJson @('account', 'show', '--query', '{id:id,name:name,tenantId:tenantId,state:state}')
    resources = Get-AzureJson @('resource', 'list', '-g', $rg, '--query', '[].{id:id,name:name,type:type,location:location,tags:tags}')
    storage = Get-AzureJson @('storage', 'account', 'show', '-g', $rg, '-n', 'sthtisvf4ee1f29', '--query',
        '{id:id,name:name,location:location,state:provisioningState,publicNetworkAccess:publicNetworkAccess,networkRuleSet:networkRuleSet,allowSharedKeyAccess:allowSharedKeyAccess,allowBlobPublicAccess:allowBlobPublicAccess}')
    registry = Get-AzureJson @('acr', 'show', '-g', $rg, '-n', 'acrhtisvf4ee1f29', '--query',
        '{id:id,name:name,sku:sku.name,state:provisioningState,publicNetworkAccess:publicNetworkAccess,adminUserEnabled:adminUserEnabled,loginServer:loginServer}')
    environment = Get-AzureJson @('resource', 'show', '--ids', $config.environmentId, '--api-version', '2025-01-01', '--query',
        '{id:id,name:name,location:location,state:properties.provisioningState,logs:properties.appLogsConfiguration,profiles:properties.workloadProfiles,vnet:properties.vnetConfiguration,domain:properties.defaultDomain}')
    foundry = Get-AzureJson @('cognitiveservices', 'account', 'show', '-g', $rg, '-n', 'foundry-high-tech-isv-f4ee1f29', '--query',
        '{id:id,name:name,location:location,state:properties.provisioningState,publicNetworkAccess:properties.publicNetworkAccess,disableLocalAuth:properties.disableLocalAuth,allowProjectManagement:properties.allowProjectManagement}')
    project = Get-AzureJson @('resource', 'show', '--ids', $config.projectId, '--api-version', '2025-06-01', '--query',
        '{id:id,name:name,location:location,state:properties.provisioningState,identity:identity,properties:properties}')
    model = Get-AzureJson @('cognitiveservices', 'account', 'deployment', 'show', '-g', $rg, '-n', 'foundry-high-tech-isv-f4ee1f29',
        '--deployment-name', $config.modelDeployment, '--query', '{id:id,name:name,sku:sku,state:properties.provisioningState,model:properties.model}')
    container = Get-AzureJson @('resource', 'show', '--ids', "$($config.storageId)/blobServices/default/containers/snapshots",
        '--api-version', '2023-05-01', '--query', '{id:id,name:name,publicAccess:properties.publicAccess}')
    rbac = Get-AzureJson @('role', 'assignment', 'list', '--all', '--query',
        '[?contains(scope, `rg-high-tech-software-isv-01`)].{id:id,principalId:principalId,roleDefinitionId:roleDefinitionId,scope:scope,principalType:principalType}')
}
if ($config.cosmosAccountId) {
    $snapshot['cosmos'] = Get-AzureJson @('cosmosdb', 'show', '-g', $rg, '-n', 'cosmos-high-tech-isv-f4ee1f29', '--query',
        '{id:id,state:provisioningState,publicNetworkAccess:publicNetworkAccess,disableLocalAuth:disableLocalAuth,capabilities:capabilities,locations:locations}')
    $snapshot['cosmosRoleAssignments'] = Get-AzureJson @('cosmosdb', 'sql', 'role', 'assignment', 'list',
        '-g', $rg, '-a', 'cosmos-high-tech-isv-f4ee1f29')
    $config['cosmosPublicNetworkAccessActual'] = $snapshot.cosmos.publicNetworkAccess
}
$snapshot | ConvertTo-Json -Depth 15 | Set-Content infra\evidence\resource-snapshot.json
$config['storagePublicNetworkAccessActual'] = $snapshot.storage.publicNetworkAccess
$config['phase1Status'] = 'accepted-complete-persistence-revision-unverified'
$config['phase2Ready'] = $false
if ($snapshot.cosmos -and $snapshot.cosmos.publicNetworkAccess -eq 'Disabled') {
    $config['phase1Status'] = 'accepted-complete-revision-blocked-cosmos-public-network-policy'
}
$config['futureAcaIdentityInvocationVerified'] = $false
$config['storagePolicyBlockerEvidence'] = 'infra\evidence\storage-policy-blocker.json'
$config['modelVersion'] = $snapshot.model.model.version
$config['modelSku'] = $snapshot.model.sku.name
$config['modelCapacity'] = $snapshot.model.sku.capacity
$config | ConvertTo-Json -Depth 12 | Set-Content infra\phase1-handoff.json
Write-Host "Saved actual resource snapshot; storage public networking: $($snapshot.storage.publicNetworkAccess)."
Write-Host 'Blob is retained, not an app prerequisite. Inspection alone never marks persistence data-plane ready.'
