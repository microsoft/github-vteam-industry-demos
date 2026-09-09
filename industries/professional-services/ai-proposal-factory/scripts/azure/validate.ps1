[CmdletBinding()]
param(
    [string]$ResourceGroupName = "rg-aipf-dev-swc-001",
    [string]$Location = "swedencentral",
    [string]$ExpectedImageTag,
    [string]$SessionCookie = $env:AIPF_VALIDATION_SESSION_COOKIE
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. "$PSScriptRoot\deployment-validation-contract.ps1"

if ($Location -ne "swedencentral") {
    throw "Only swedencentral is authorized."
}

$expectedResources = @(
    @{ Name = "acraipfdevswce2d6ac891bb7"; Type = "Microsoft.ContainerRegistry/registries" },
    @{ Name = "staipfdevswce2d6ac891bb7"; Type = "Microsoft.Storage/storageAccounts" },
    @{ Name = "cosmos-aipf-dev-swc-e2d6ac891bb7"; Type = "Microsoft.DocumentDB/databaseAccounts" },
    @{ Name = "srch-aipf-dev-swc-e2d6ac891bb7"; Type = "Microsoft.Search/searchServices" },
    @{ Name = "aoai-aipf-dev-swc-e2d6ac891bb7"; Type = "Microsoft.CognitiveServices/accounts" },
    @{ Name = "law-aipf-dev-swc-001"; Type = "Microsoft.OperationalInsights/workspaces" },
    @{ Name = "appi-aipf-dev-swc-001"; Type = "Microsoft.Insights/components" },
    @{ Name = "cae-aipf-dev-swc-001"; Type = "Microsoft.App/managedEnvironments" },
    @{ Name = "ca-aipf-dev-swc-web-001"; Type = "Microsoft.App/containerApps" },
    @{ Name = "ca-aipf-dev-swc-worker-001"; Type = "Microsoft.App/containerApps" },
    @{ Name = "caj-aipf-dev-swc-seed-001"; Type = "Microsoft.App/jobs" }
)

foreach ($resource in $expectedResources) {
    $result = Invoke-AzJson -Arguments @(
        "resource", "show",
        "--resource-group", $ResourceGroupName,
        "--name", $resource.Name,
        "--resource-type", $resource.Type,
        "--output", "json"
    ) -Operation "reading resource $($resource.Type)/$($resource.Name)"
    [void](Get-RequiredStringProperty -InputObject $result -Name "id" -Context "$($resource.Type)/$($resource.Name)")
    $resourceLocation = Get-ObjectPropertyValue -InputObject $result -Name "location" -Context "$($resource.Type)/$($resource.Name)"
    if ($resourceLocation -and (("$resourceLocation" -replace "\s", "").ToLowerInvariant() -ne $Location)) {
        throw "$($resource.Name) is in unexpected location '$resourceLocation'."
    }
}

$webApp = Invoke-AzJson -Arguments @(
    "containerapp", "show",
    "--resource-group", $ResourceGroupName,
    "--name", "ca-aipf-dev-swc-web-001",
    "--output", "json"
) -Operation "reading the web Container App"
$workerApp = Invoke-AzJson -Arguments @(
    "containerapp", "show",
    "--resource-group", $ResourceGroupName,
    "--name", "ca-aipf-dev-swc-worker-001",
    "--output", "json"
) -Operation "reading the worker Container App"
$seedJob = Invoke-AzJson -Arguments @(
    "containerapp", "job", "show",
    "--resource-group", $ResourceGroupName,
    "--name", "caj-aipf-dev-swc-seed-001",
    "--output", "json"
) -Operation "reading the seeder Container Apps Job"

$expectedRegistryServer = "acraipfdevswce2d6ac891bb7.azurecr.io"
Assert-ManagedIdentityRegistry -Workload $webApp -WorkloadName "Web Container App" -ExpectedServer $expectedRegistryServer
Assert-ManagedIdentityRegistry -Workload $workerApp -WorkloadName "Worker Container App" -ExpectedServer $expectedRegistryServer
Assert-ManagedIdentityRegistry -Workload $seedJob -WorkloadName "Seeder Container Apps Job" -ExpectedServer $expectedRegistryServer

$webProperties = Get-ObjectPropertyValue -InputObject $webApp -Name "properties" -Context "Web Container App" -Required
$webTemplate = Get-ObjectPropertyValue -InputObject $webProperties -Name "template" -Context "Web Container App properties" -Required
$webContainers = @(Get-ObjectPropertyValue -InputObject $webTemplate -Name "containers" -Context "Web Container App template" -Required)
$workerProperties = Get-ObjectPropertyValue -InputObject $workerApp -Name "properties" -Context "Worker Container App" -Required
$workerTemplate = Get-ObjectPropertyValue -InputObject $workerProperties -Name "template" -Context "Worker Container App properties" -Required
$workerContainers = @(Get-ObjectPropertyValue -InputObject $workerTemplate -Name "containers" -Context "Worker Container App template" -Required)
$seedProperties = Get-ObjectPropertyValue -InputObject $seedJob -Name "properties" -Context "Seeder Container Apps Job" -Required
$seedTemplate = Get-ObjectPropertyValue -InputObject $seedProperties -Name "template" -Context "Seeder Container Apps Job properties" -Required
$seedContainers = @(Get-ObjectPropertyValue -InputObject $seedTemplate -Name "containers" -Context "Seeder Container Apps Job template" -Required)
if ($webContainers.Count -ne 2 -or $workerContainers.Count -ne 1 -or $seedContainers.Count -ne 1) {
    throw "Deployed workload container counts do not match the web/API, worker, and seeder contract."
}
if ($ExpectedImageTag) {
    $images = @(
        (Get-RequiredStringProperty -InputObject $webContainers[0] -Name "image" -Context "Web container"),
        (Get-RequiredStringProperty -InputObject $webContainers[1] -Name "image" -Context "API container"),
        (Get-RequiredStringProperty -InputObject $workerContainers[0] -Name "image" -Context "Worker container"),
        (Get-RequiredStringProperty -InputObject $seedContainers[0] -Name "image" -Context "Seeder container")
    )
    foreach ($image in $images) {
        if (-not $image.EndsWith(":$ExpectedImageTag", [StringComparison]::Ordinal)) {
            throw "Deployed image '$image' does not use expected immutable tag '$ExpectedImageTag'."
        }
    }
}

$webConfiguration = Get-ObjectPropertyValue -InputObject $webProperties -Name "configuration" -Context "Web Container App properties" -Required
$webIngress = Get-ObjectPropertyValue -InputObject $webConfiguration -Name "ingress" -Context "Web Container App configuration" -Required
$fqdn = Get-RequiredStringProperty -InputObject $webIngress -Name "fqdn" -Context "Web Container App ingress"
$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$http = [System.Net.Http.HttpClient]::new($handler)
try {
    $http.DefaultRequestHeaders.Add("X-Requested-With", "XMLHttpRequest")
    $anonymous = $http.GetAsync("https://$fqdn/api/dashboard").GetAwaiter().GetResult()
    if ([int]$anonymous.StatusCode -notin @(302, 401, 403)) {
        throw "Anonymous public dashboard access was not denied."
    }
} finally { $http.Dispose(); $handler.Dispose() }
if ($SessionCookie) {
    $dashboard = Invoke-RestMethod -Uri "https://$fqdn/api/dashboard" -Method Get -TimeoutSec 30 `
        -Headers @{ Cookie = $SessionCookie; "X-Requested-With" = "XMLHttpRequest" }
    if (-not $dashboard.opportunities) { throw "Authenticated dashboard smoke returned no seeded opportunities." }
} else {
    Write-Warning "Authenticated browser/workflow validation is pending. Supply an ephemeral assigned-user AIPF_VALIDATION_SESSION_COOKIE for the authenticated dashboard smoke; never persist it."
}

$failedRevisions = Invoke-AzText -Arguments @(
    "containerapp", "revision", "list",
    "--resource-group", $ResourceGroupName,
    "--name", "ca-aipf-dev-swc-web-001",
    "--query", "[?properties.healthState!='Healthy' && properties.active==``true``].name",
    "--output", "tsv"
) -Operation "reading active web Container App revision health"
if ($failedRevisions) {
    throw "Web app has an active unhealthy revision: $failedRevisions"
}

Write-Host "Resource, managed identity, ACR auth, revision health, and anonymous dashboard denial checks passed."
if ($SessionCookie) { Write-Host "Authenticated dashboard smoke passed." }
Write-Host "Complete the manual evidence checklist in docs\deployment-azure.md, including seed counts, proposal generation/export, RBAC, and Application Insights."
