[CmdletBinding()]
param(
    [string] $SubscriptionId = '',
    [string] $ResourceGroupName = 'rg-retail-consumer-goods-01',
    [string] $FoundationLocation = 'swedencentral',
    [string] $RuntimeLocation = 'norwayeast',
    [string] $FoundryAccountName = 'ai-retail-consumer-goods-01',
    [string] $ModelName = 'gpt-4.1-mini',
    [string] $ModelVersion = '2025-04-14',
    [string] $ModelSkuName = 'Standard',
    [ValidateRange(1, 1000)]
    [int] $ModelCapacity = 10,
    [string] $ContainerRegistryName = 'acrretailconsumergoods01',
    [string] $StorageAccountName = 'stretailconsumergoods01',
    [string] $VirtualNetworkAddressPrefix = '10.60.0.0/26',
    [string] $ContainerAppsSubnetPrefix = '10.60.0.0/27',
    [string] $PrivateEndpointSubnetPrefix = '10.60.0.32/28',
    [ValidateSet('public-demo', 'entra')]
    [string] $AccessMode = 'public-demo',
    [string] $PublicDemoOrigin = ''
)

$ErrorActionPreference = 'Stop'
$issues = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()

function Invoke-AzJson {
    param([string[]] $Arguments, [switch] $AllowFailure)
    $raw = az @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        if ($AllowFailure) { return $null }
        throw "Azure CLI command failed: az $($Arguments -join ' ')"
    }
    if (-not $raw) { return $null }
    return $raw | ConvertFrom-Json
}

function ConvertTo-IPv4Number {
    param([string] $Address)
    $bytes = [System.Net.IPAddress]::Parse($Address).GetAddressBytes()
    if ($bytes.Length -ne 4) { throw "Only IPv4 CIDRs are supported: $Address" }
    [array]::Reverse($bytes)
    return [BitConverter]::ToUInt32($bytes, 0)
}

function Get-CidrRange {
    param([string] $Cidr)
    $parts = $Cidr -split '/'
    if ($parts.Count -ne 2) { throw "Invalid CIDR: $Cidr" }
    $prefix = [int]$parts[1]
    if ($prefix -lt 0 -or $prefix -gt 32) { throw "Invalid CIDR prefix: $Cidr" }
    $ip = ConvertTo-IPv4Number $parts[0]
    $mask = if ($prefix -eq 0) { [uint32]0 } else { [uint32]::MaxValue -shl (32 - $prefix) }
    $start = $ip -band $mask
    $size = [uint64]1 -shl (32 - $prefix)
    return [pscustomobject]@{
        Cidr = $Cidr
        Prefix = $prefix
        Start = [uint64]$start
        End = [uint64]$start + $size - 1
    }
}

function Test-CidrOverlap {
    param($Left, $Right)
    return $Left.Start -le $Right.End -and $Right.Start -le $Left.End
}

if ($SubscriptionId) {
    az account set --subscription $SubscriptionId
    if ($LASTEXITCODE -ne 0) { throw "Unable to select subscription '$SubscriptionId'." }
}
$account = Invoke-AzJson @('account', 'show', '--output', 'json')
if ($account.state -ne 'Enabled') { $issues.Add('Selected subscription is not enabled.') }

$requiredProviders = @(
    'Microsoft.Authorization',
    'Microsoft.App',
    'Microsoft.CognitiveServices',
    'Microsoft.ContainerRegistry',
    'Microsoft.Insights',
    'Microsoft.ManagedIdentity',
    'Microsoft.Network',
    'Microsoft.OperationalInsights',
    'Microsoft.Storage'
)
$providerStates = foreach ($namespace in $requiredProviders) {
    $state = az provider show --namespace $namespace --query registrationState --output tsv
    if ($LASTEXITCODE -ne 0) { throw "Unable to inspect provider '$namespace'." }
    if ($state -ne 'Registered') { $issues.Add("Provider '$namespace' is '$state'.") }
    [pscustomobject]@{ namespace = $namespace; state = $state }
}

$vnet = Get-CidrRange $VirtualNetworkAddressPrefix
$containerSubnet = Get-CidrRange $ContainerAppsSubnetPrefix
$privateEndpointSubnet = Get-CidrRange $PrivateEndpointSubnetPrefix
foreach ($subnet in @($containerSubnet, $privateEndpointSubnet)) {
    if ($subnet.Start -lt $vnet.Start -or $subnet.End -gt $vnet.End) {
        $issues.Add("Subnet '$($subnet.Cidr)' is not contained by VNet '$($vnet.Cidr)'.")
    }
}
if (Test-CidrOverlap $containerSubnet $privateEndpointSubnet) {
    $issues.Add('Container Apps and private endpoint subnet CIDRs overlap.')
}
$visibleCidrs = @(az network vnet list --query '[].addressSpace.addressPrefixes[]' --output tsv)
if ($LASTEXITCODE -ne 0) { throw 'Unable to list visible VNet address spaces.' }
$cidrOverlaps = @()
foreach ($visible in $visibleCidrs) {
    if (-not $visible) { continue }
    try {
        $candidate = Get-CidrRange $visible
        if ($candidate.Cidr -ne $vnet.Cidr -and (Test-CidrOverlap $vnet $candidate)) {
            $cidrOverlaps += $candidate.Cidr
        }
    } catch {
        $warnings.Add("Could not compare visible CIDR '$visible': $($_.Exception.Message)")
    }
}
if ($cidrOverlaps.Count) {
    $issues.Add("Requested VNet CIDR overlaps visible address spaces: $($cidrOverlaps -join ', ').")
}

$acrAvailability = Invoke-AzJson @(
    'acr', 'check-name', '--name', $ContainerRegistryName, '--output', 'json'
) -AllowFailure
$storageAvailability = Invoke-AzJson @(
    'storage', 'account', 'check-name', '--name', $StorageAccountName, '--output', 'json'
) -AllowFailure
$resourceGroup = Invoke-AzJson @(
    'group', 'show', '--name', $ResourceGroupName, '--output', 'json'
) -AllowFailure
$existingAcr = Invoke-AzJson @(
    'acr', 'show', '--name', $ContainerRegistryName, '--output', 'json'
) -AllowFailure
$existingStorage = Invoke-AzJson @(
    'storage', 'account', 'show', '--name', $StorageAccountName, '--output', 'json'
) -AllowFailure
if (-not $existingAcr -and $acrAvailability -and -not $acrAvailability.nameAvailable) {
    $issues.Add("ACR name '$ContainerRegistryName' is unavailable: $($acrAvailability.reason).")
}
if (-not $existingStorage -and $storageAvailability -and -not $storageAvailability.nameAvailable) {
    $issues.Add("Storage name '$StorageAccountName' is unavailable: $($storageAvailability.reason).")
}

$domainBody = @{ subdomainName = $FoundryAccountName; type = 'Microsoft.CognitiveServices/accounts' } |
    ConvertTo-Json -Compress
$domainAvailability = Invoke-AzJson @(
    'rest', '--method', 'post',
    '--url', "https://management.azure.com/subscriptions/$($account.id)/providers/Microsoft.CognitiveServices/checkDomainAvailability?api-version=2025-06-01",
    '--body', $domainBody,
    '--output', 'json'
) -AllowFailure
$existingFoundry = Invoke-AzJson @(
    'cognitiveservices', 'account', 'show',
    '--resource-group', $ResourceGroupName,
    '--name', $FoundryAccountName,
    '--output', 'json'
) -AllowFailure
if (-not $existingFoundry -and $domainAvailability -and -not $domainAvailability.isSubdomainAvailable) {
    $issues.Add("Foundry subdomain '$FoundryAccountName' is unavailable.")
}
if (-not $domainAvailability -and -not $existingFoundry) {
    $warnings.Add('Foundry global-name availability API was unavailable; deployment validation must confirm it.')
}

$encodedFoundationLocation = [Uri]::EscapeDataString($FoundationLocation)
$models = Invoke-AzJson @(
    'rest', '--method', 'get',
    '--url', "https://management.azure.com/subscriptions/$($account.id)/providers/Microsoft.CognitiveServices/locations/$encodedFoundationLocation/models?api-version=2024-10-01",
    '--output', 'json'
) -AllowFailure
$matchingModels = @()
$matchingSku = $null
if ($models) {
    $matchingModels = @($models.value | Where-Object {
        $_.model.name -eq $ModelName -and
        $_.model.version -eq $ModelVersion -and
        ($_.model.skus.name -contains $ModelSkuName)
    })
    if (-not $matchingModels.Count) {
        $issues.Add("Model '$ModelName' version '$ModelVersion' with SKU '$ModelSkuName' was not found in '$FoundationLocation'.")
    } else {
        $matchingSku = $matchingModels[0].model.skus |
            Where-Object name -eq $ModelSkuName |
            Select-Object -First 1
    }
} else {
    $warnings.Add('Regional model catalog could not be queried; confirm model/version/SKU before deployment.')
}

$usage = Invoke-AzJson @(
    'rest', '--method', 'get',
    '--url', "https://management.azure.com/subscriptions/$($account.id)/providers/Microsoft.CognitiveServices/locations/$encodedFoundationLocation/usages?api-version=2024-10-01",
    '--output', 'json'
) -AllowFailure
$quotaCandidates = @()
if ($usage) {
    $quotaCandidates = if ($matchingSku.usageName) {
        @($usage.value | Where-Object {
            $_.name.value -eq $matchingSku.usageName
        } | Select-Object @{n='name';e={$_.name.value}}, currentValue, limit, unit)
    } else {
        @()
    }
    if (-not $quotaCandidates.Count) {
        $warnings.Add("No model-specific quota record was identified automatically; verify at least $ModelCapacity capacity units are available.")
    } else {
        $availableCapacity = ($quotaCandidates | Measure-Object -Property limit -Sum).Sum -
            ($quotaCandidates | Measure-Object -Property currentValue -Sum).Sum
        if ($availableCapacity -lt $ModelCapacity) {
            $issues.Add("Only $availableCapacity model capacity units are visibly available; $ModelCapacity requested.")
        }
    }
} else {
    $warnings.Add('Regional Cognitive Services quota could not be queried.')
}

$scope = "/subscriptions/$($account.id)"
$principal = Invoke-AzJson @('ad', 'signed-in-user', 'show', '--output', 'json') -AllowFailure
if ($principal) {
    $roleAssignments = @(Invoke-AzJson @(
        'role', 'assignment', 'list',
        '--assignee-object-id', $principal.id,
        '--scope', $scope,
        '--include-inherited',
        '--output', 'json'
    ) -AllowFailure)
    $roleNames = @($roleAssignments | ForEach-Object roleDefinitionName | Sort-Object -Unique)
    if (-not ($roleNames -contains 'Owner' -or $roleNames -contains 'Contributor')) {
        $warnings.Add('Signed-in user is not visibly Owner/Contributor at subscription scope; resource deployment permissions may come from narrower or custom roles.')
    }
    if (-not ($roleNames -contains 'Owner' -or $roleNames -contains 'User Access Administrator' -or $roleNames -contains 'Role Based Access Control Administrator')) {
        $warnings.Add('Signed-in user has no visible subscription-scope role-assignment permission; RBAC resources may fail.')
    }
} else {
    $roleNames = @()
    $warnings.Add('Signed-in principal is not a user; verify deployment and roleAssignments/write permissions for the service principal or managed identity.')
}

$policyAssignments = @(Invoke-AzJson @(
    'policy', 'assignment', 'list',
    '--scope', $scope,
    '--disable-scope-strict-match',
    '--output', 'json'
) -AllowFailure)
$relevantPolicies = @($policyAssignments | Where-Object {
    ($_.displayName + ' ' + $_.name) -match 'Storage|Network|Container|Cognitive|Location|Public'
} | Select-Object name, displayName, enforcementMode, scope)

if ($AccessMode -eq 'public-demo') {
    if ($PublicDemoOrigin -and $PublicDemoOrigin -notmatch '^https://[^/]+$') {
        $issues.Add('PublicDemoOrigin must be an exact HTTPS origin with no path.')
    }
    if (-not $PublicDemoOrigin) {
        $warnings.Add('A fresh Container App has no known FQDN. Deploy Entra-first, discover the FQDN from outputs, then reconcile public-demo mode with the exact origin.')
    }
} else {
    $warnings.Add('Entra mode requires Microsoft Graph application permissions and configure-auth.ps1 after the Container App exists.')
}

$result = [pscustomobject]@{
    ready = $issues.Count -eq 0
    subscription = [pscustomobject]@{
        id = $account.id
        name = $account.name
        tenantId = $account.tenantId
    }
    resourceGroup = [pscustomobject]@{
        name = $ResourceGroupName
        exists = [bool]$resourceGroup
        expectedLocation = $FoundationLocation
        actualLocation = $resourceGroup.location
    }
    locations = [pscustomobject]@{
        foundation = $FoundationLocation
        runtime = $RuntimeLocation
    }
    providers = $providerStates
    names = [pscustomobject]@{
        foundry = $FoundryAccountName
        containerRegistry = $ContainerRegistryName
        storage = $StorageAccountName
    }
    network = [pscustomobject]@{
        virtualNetwork = $VirtualNetworkAddressPrefix
        containerAppsSubnet = $ContainerAppsSubnetPrefix
        privateEndpointSubnet = $PrivateEndpointSubnetPrefix
        visibleOverlaps = $cidrOverlaps
    }
    model = [pscustomobject]@{
        name = $ModelName
        version = $ModelVersion
        sku = $ModelSkuName
        requestedCapacity = $ModelCapacity
        catalogMatchCount = $matchingModels.Count
        quotaCandidates = $quotaCandidates
    }
    accessMode = $AccessMode
    visibleRoleNames = $roleNames
    relevantPolicyAssignments = $relevantPolicies
    issues = $issues
    warnings = $warnings
}
$result | ConvertTo-Json -Depth 10
if ($issues.Count) { exit 1 }
