[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $ResourceGroupName,

    [Parameter(Mandatory)]
    [string] $ContainerAppName
)

$ErrorActionPreference = 'Stop'

$app = az containerapp show `
    --resource-group $ResourceGroupName `
    --name $ContainerAppName `
    --query '{fqdn:properties.configuration.ingress.fqdn,location:location}' `
    -o json | ConvertFrom-Json

$uri = "https://$($app.fqdn)"
$health = Invoke-RestMethod -Uri "$uri/api/health" -Method Get -TimeoutSec 60
if ($health.status -ne 'ok') {
    throw "Unexpected health payload: $($health | ConvertTo-Json -Compress)"
}

$root = Invoke-WebRequest -Uri $uri -Method Get -TimeoutSec 60
if ($root.StatusCode -ne 200) {
    throw "Root returned HTTP $($root.StatusCode)"
}

$locations = az resource list `
    --resource-group $ResourceGroupName `
    --query '[].{name:name,type:type,location:location}' `
    -o json | ConvertFrom-Json

$outsideRegion = $locations | Where-Object {
    $_.location -and
    $_.location -notin @('swedencentral', 'Sweden Central', 'global')
}
if ($outsideRegion) {
    throw "Resources outside Sweden Central: $($outsideRegion | ConvertTo-Json -Compress)"
}

[pscustomobject]@{
    SERVICE_APP_URI = $uri
    HealthStatus = $health.status
    RootStatusCode = $root.StatusCode
    Locations = $locations
} | ConvertTo-Json -Depth 5
