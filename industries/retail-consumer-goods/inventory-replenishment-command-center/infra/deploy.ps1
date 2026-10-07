[CmdletBinding()]
param(
    [string] $SubscriptionId = '',
    [string] $ResourceGroupName = 'rg-retail-consumer-goods-01',
    [string] $FoundationLocation = 'swedencentral',
    [string] $RuntimeLocation = 'norwayeast',
    [string] $FoundryAccountName = 'ai-retail-consumer-goods-01',
    [string] $FoundryProjectName = 'proj-retail-consumer-goods-01',
    [string] $ModelDeploymentName = 'gpt-4-1-mini',
    [string] $ModelName = 'gpt-4.1-mini',
    [string] $ModelVersion = '2025-04-14',
    [string] $ModelSkuName = 'Standard',
    [ValidateRange(1, 1000)]
    [int] $ModelCapacity = 10,
    [string] $ContainerRegistryName = 'acrretailconsumergoods01',
    [string] $ContainerAppsEnvironmentName = 'cae-retail-consumer-goods-ne-02',
    [string] $ManagedIdentityName = 'id-retail-consumer-goods-01',
    [string] $LogAnalyticsWorkspaceName = 'log-retail-consumer-goods-ne-01',
    [string] $ApplicationInsightsName = 'appi-retail-consumer-goods-ne-01',
    [string] $StorageAccountName = 'stretailconsumergoods01',
    [string] $StateContainerName = 'application-state',
    [string] $ContainerAppName = 'ca-retail-consumer-goods-ne-02',
    [string] $ContainerImageRepository = 'inventory-command-center',
    [string] $ContainerImageTag = 'phase2-private-20261006-final2',
    [ValidateSet('public-demo', 'entra')]
    [string] $AccessMode = 'public-demo',
    [string] $PublicDemoOrigin = 'https://ca-retail-consumer-goods-ne-02.thankfulocean-b1b09e44.norwayeast.azurecontainerapps.io',
    [string] $VirtualNetworkName = 'vnet-retail-consumer-goods-ne-01',
    [string] $VirtualNetworkAddressPrefix = '10.60.0.0/26',
    [string] $ContainerAppsSubnetName = 'snet-containerapps-infra-ne-01',
    [string] $ContainerAppsSubnetPrefix = '10.60.0.0/27',
    [string] $ContainerAppsSubnetNetworkSecurityGroupId = '',
    [string] $PrivateEndpointSubnetName = 'snet-private-endpoints-ne-01',
    [string] $PrivateEndpointSubnetPrefix = '10.60.0.32/28',
    [string] $PrivateEndpointSubnetNetworkSecurityGroupId = '',
    [string] $BlobPrivateEndpointName = 'pe-stretailconsumergoods01-blob-ne-01',
    [string] $BlobPrivateDnsLinkName = 'link-vnet-retail-consumer-goods-ne-01',
    [string] $BlobPrivateDnsZoneGroupName = 'pdzg-blob',
    [ValidateRange(1, 30)]
    [int] $MinReplicas = 1,
    [ValidateRange(1, 30)]
    [int] $MaxReplicas = 1,
    [ValidateSet('foundation', 'network', 'environment', 'application')]
    [string] $Stage = 'application',
    [ValidateSet('validate', 'what-if', 'deploy')]
    [string] $Mode = 'validate',
    [switch] $CreateResourceGroup
)

$ErrorActionPreference = 'Stop'

function Invoke-AzJson {
    param([string[]] $Arguments)
    $result = az @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI command failed: az $($Arguments -join ' ')"
    }
    if (-not $result) { return $null }
    return $result | ConvertFrom-Json
}

if ($SubscriptionId) {
    az account set --subscription $SubscriptionId
    if ($LASTEXITCODE -ne 0) { throw "Unable to select subscription '$SubscriptionId'." }
}

$account = Invoke-AzJson @('account', 'show', '--output', 'json')
if ($account.state -ne 'Enabled') {
    throw 'The selected Azure subscription must be enabled.'
}
if ($SubscriptionId -and $account.id -ne $SubscriptionId) {
    throw "Selected subscription '$($account.id)' does not match '$SubscriptionId'."
}

$resourceGroup = $null
$resourceGroupJson = az group show --name $ResourceGroupName --output json 2>$null
if ($LASTEXITCODE -eq 0 -and $resourceGroupJson) {
    $resourceGroup = $resourceGroupJson | ConvertFrom-Json
}

if (-not $resourceGroup) {
    if (-not ($CreateResourceGroup -and $Mode -eq 'deploy' -and $Stage -eq 'foundation')) {
        throw "Resource group '$ResourceGroupName' does not exist. Create it explicitly or use -CreateResourceGroup with foundation deploy."
    }
    $resourceGroup = Invoke-AzJson @(
        'group', 'create',
        '--name', $ResourceGroupName,
        '--location', $FoundationLocation,
        '--output', 'json'
    )
}

if ($resourceGroup.location -ne $FoundationLocation) {
    throw "Resource group location '$($resourceGroup.location)' does not match foundation location '$FoundationLocation'."
}
if ($MinReplicas -gt $MaxReplicas) {
    throw 'MinReplicas cannot exceed MaxReplicas.'
}
if ($Stage -eq 'application' -and $ContainerImageTag -eq 'not-built') {
    throw 'An immutable ContainerImageTag is required for the application stage.'
}
if ($AccessMode -eq 'public-demo' -and $PublicDemoOrigin -notmatch '^https://[^/]+$') {
    throw 'PublicDemoOrigin must be an exact HTTPS origin with no path for public-demo mode.'
}

function Get-ExistingSubnetNetworkSecurityGroupId {
    param([string] $SubnetName)
    $value = az network vnet subnet show `
        --resource-group $ResourceGroupName `
        --vnet-name $VirtualNetworkName `
        --name $SubnetName `
        --query 'networkSecurityGroup.id' `
        --output tsv 2>$null
    if ($LASTEXITCODE -ne 0) {
        $global:LASTEXITCODE = 0
        return ''
    }
    return "$value".Trim()
}

if (-not $ContainerAppsSubnetNetworkSecurityGroupId) {
    $ContainerAppsSubnetNetworkSecurityGroupId =
        Get-ExistingSubnetNetworkSecurityGroupId -SubnetName $ContainerAppsSubnetName
}
if (-not $PrivateEndpointSubnetNetworkSecurityGroupId) {
    $PrivateEndpointSubnetNetworkSecurityGroupId =
        Get-ExistingSubnetNetworkSecurityGroupId -SubnetName $PrivateEndpointSubnetName
}

$foundationParameters = @(
    "foundationLocation=$FoundationLocation"
    "runtimeLocation=$RuntimeLocation"
    "foundryAccountName=$FoundryAccountName"
    "foundryProjectName=$FoundryProjectName"
    "modelDeploymentName=$ModelDeploymentName"
    "modelName=$ModelName"
    "modelVersion=$ModelVersion"
    "modelSkuName=$ModelSkuName"
    "modelCapacity=$ModelCapacity"
    "containerRegistryName=$ContainerRegistryName"
    "managedIdentityName=$ManagedIdentityName"
    "logAnalyticsWorkspaceName=$LogAnalyticsWorkspaceName"
    "applicationInsightsName=$ApplicationInsightsName"
)

$deployEnvironment = $Stage -in @('environment', 'application')
$deployApplication = $Stage -eq 'application'
$runtimeParameters = @(
    "foundationLocation=$FoundationLocation"
    "runtimeLocation=$RuntimeLocation"
    "foundryAccountName=$FoundryAccountName"
    "foundryProjectName=$FoundryProjectName"
    "modelDeploymentName=$ModelDeploymentName"
    "containerRegistryName=$ContainerRegistryName"
    "containerAppsEnvironmentName=$ContainerAppsEnvironmentName"
    "managedIdentityName=$ManagedIdentityName"
    "logAnalyticsWorkspaceName=$LogAnalyticsWorkspaceName"
    "applicationInsightsName=$ApplicationInsightsName"
    "storageAccountName=$StorageAccountName"
    "stateContainerName=$StateContainerName"
    "containerAppName=$ContainerAppName"
    "containerImageRepository=$ContainerImageRepository"
    "containerImageTag=$ContainerImageTag"
    "accessMode=$AccessMode"
    "publicDemoOrigin=$PublicDemoOrigin"
    "virtualNetworkName=$VirtualNetworkName"
    "virtualNetworkAddressPrefix=$VirtualNetworkAddressPrefix"
    "containerAppsSubnetName=$ContainerAppsSubnetName"
    "containerAppsSubnetPrefix=$ContainerAppsSubnetPrefix"
    "containerAppsSubnetNetworkSecurityGroupId=$ContainerAppsSubnetNetworkSecurityGroupId"
    "privateEndpointSubnetName=$PrivateEndpointSubnetName"
    "privateEndpointSubnetPrefix=$PrivateEndpointSubnetPrefix"
    "privateEndpointSubnetNetworkSecurityGroupId=$PrivateEndpointSubnetNetworkSecurityGroupId"
    "blobPrivateEndpointName=$BlobPrivateEndpointName"
    "blobPrivateDnsLinkName=$BlobPrivateDnsLinkName"
    "blobPrivateDnsZoneGroupName=$BlobPrivateDnsZoneGroupName"
    "minReplicas=$MinReplicas"
    "maxReplicas=$MaxReplicas"
    "deployEnvironment=$($deployEnvironment.ToString().ToLowerInvariant())"
    "deployApplication=$($deployApplication.ToString().ToLowerInvariant())"
)

$templateFile = if ($Stage -eq 'foundation') {
    Join-Path $PSScriptRoot 'foundation.bicep'
} else {
    Join-Path $PSScriptRoot 'main.bicep'
}
$parameters = if ($Stage -eq 'foundation') { $foundationParameters } else { $runtimeParameters }
$deploymentName = "phase3-$Stage"
$baseArguments = @(
    '--name', $deploymentName,
    '--resource-group', $ResourceGroupName,
    '--template-file', $templateFile,
    '--parameters'
) + $parameters + @('--only-show-errors')

if ($Mode -eq 'what-if') {
    $raw = az deployment group what-if @baseArguments `
        --result-format ResourceIdOnly `
        --query 'changes[].[changeType,resourceId]' `
        --output tsv
    if ($LASTEXITCODE -ne 0) {
        throw "Azure what-if failed with exit code $LASTEXITCODE."
    }
    $changeTypes = @{
        '+' = 'Create'
        '!' = 'Deploy'
        '*' = 'Ignore'
        '-' = 'Delete'
        '~' = 'Modify'
    }
    $safeChanges = @($raw | ForEach-Object {
        if ($_ -notmatch '^\s*([+!*~-])\s+([A-Za-z0-9.]+/.+)$') { return }
        $symbol = $Matches[1]
        $resourcePath = $Matches[2].Trim()
        $parts = $resourcePath -split '/'
        $isRoleAssignment = $resourcePath -match '/providers/Microsoft\.Authorization/roleAssignments/'
        $resourceType = if ($isRoleAssignment) {
            'Microsoft.Authorization/roleAssignments'
        } else {
            "$($parts[0])/$($parts[1])"
        }
        $resourceName = if ($isRoleAssignment) {
            '<deterministic-role-assignment>'
        } elseif ($resourceType -eq 'Microsoft.Network/networkInterfaces') {
            '<private-endpoint-nic>'
        } else {
            $parts[-1]
        }
        [pscustomobject]@{
            changeType = $changeTypes[$symbol]
            resourceType = $resourceType
            resourceName = $resourceName
        }
    })
    [pscustomobject]@{
        subscriptionId = $account.id
        resourceGroup = $ResourceGroupName
        stage = $Stage
        changes = $safeChanges
        deleteCount = @($safeChanges | Where-Object changeType -eq 'Delete').Count
    } | ConvertTo-Json -Depth 5
    exit 0
}

$verb = if ($Mode -eq 'validate') { 'validate' } else { 'create' }
az deployment group $verb @baseArguments --output none
if ($LASTEXITCODE -ne 0) {
    throw "Azure deployment command failed with exit code $LASTEXITCODE."
}

$outputs = $null
if ($Mode -eq 'deploy') {
    $outputs = Invoke-AzJson @(
        'deployment', 'group', 'show',
        '--name', $deploymentName,
        '--resource-group', $ResourceGroupName,
        '--query', 'properties.outputs',
        '--output', 'json'
    )
}

[pscustomobject]@{
    subscriptionId = $account.id
    resourceGroup = $ResourceGroupName
    stage = $Stage
    mode = $Mode
    result = 'Succeeded'
    outputs = $outputs
} | ConvertTo-Json -Depth 10
