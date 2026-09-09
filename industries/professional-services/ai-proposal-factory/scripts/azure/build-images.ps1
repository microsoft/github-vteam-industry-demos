[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern("^[a-zA-Z0-9][a-zA-Z0-9._-]{6,127}$")]
    [string]$ImageTag,
    [string]$RegistryName = "acraipfdevswce2d6ac891bb7",
    [string]$RegistryLoginServer,
    [switch]$UseAcrBuild,
    [switch]$Push
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($ImageTag -in @("latest", "dev", "main", "master", "replace-with-immutable-build-tag")) {
    throw "ImageTag must be an immutable build identifier, preferably the full Git commit SHA."
}
if ($UseAcrBuild -and $Push) {
    throw "UseAcrBuild pushes images automatically; do not also specify Push."
}

& "$PSScriptRoot\validate-container-sources.ps1"

if (-not $RegistryLoginServer) {
    if ($UseAcrBuild -or $Push) {
        $RegistryLoginServer = az acr show --name $RegistryName --query loginServer --output tsv
        if ($LASTEXITCODE -ne 0 -or -not $RegistryLoginServer) {
            throw "Could not resolve ACR '$RegistryName'. Bootstrap infrastructure first."
        }
    } else {
        $RegistryLoginServer = "local"
    }
}

$images = @(
    [pscustomobject]@{ Name = "web"; Repository = "aipf-web"; Dockerfile = (Join-Path "containers" "Dockerfile.web") },
    [pscustomobject]@{ Name = "api"; Repository = "aipf-api"; Dockerfile = (Join-Path "containers" "Dockerfile.api") },
    [pscustomobject]@{ Name = "worker"; Repository = "aipf-worker"; Dockerfile = (Join-Path "containers" "Dockerfile.worker") },
    [pscustomobject]@{ Name = "seeder"; Repository = "aipf-seeder"; Dockerfile = (Join-Path "containers" "Dockerfile.seed") }
)

foreach ($image in $images) {
    $image | Add-Member -NotePropertyName Reference -NotePropertyValue "$RegistryLoginServer/$($image.Repository):$ImageTag"
}

$dockerOperatingSystem = docker info --format "{{.OSType}}" 2>$null
if ($LASTEXITCODE -ne 0 -or "$dockerOperatingSystem".Trim() -cne "linux") {
    throw "A running Linux Docker engine is required to execute final-image validation."
}

if ($UseAcrBuild) {
    # Azure CLI's Windows log streamer otherwise inherits a legacy code page and can
    # fail while rendering Unicode emitted by modern build tools such as Vite.
    $previousPythonIoEncoding = $env:PYTHONIOENCODING
    $previousPythonUtf8 = $env:PYTHONUTF8
    $env:PYTHONIOENCODING = "utf-8"
    $env:PYTHONUTF8 = "1"
    try {
        foreach ($image in $images) {
            Write-Host "Building $($image.Reference) using Azure Container Registry..."
            $runId = az acr build `
                --registry $RegistryName `
                --platform linux/amd64 `
                --file $image.Dockerfile `
                --target runtime `
                --image "$($image.Repository):$ImageTag" `
                --build-arg "BUILD_VERSION=$ImageTag" `
                --no-logs `
                --query runId `
                --output tsv `
                .
            if ($LASTEXITCODE -ne 0 -or -not $runId) {
                throw "Could not queue ACR build for $($image.Name)."
            }
            Write-Host "Queued ACR run $runId for $($image.Name)."
            $deadline = (Get-Date).AddMinutes(45)
            do {
                Start-Sleep -Seconds 15
                $run = az acr task list-runs `
                    --registry $RegistryName `
                    --top 30 `
                    --query "[?runId=='$runId'] | [0].{status:status,finishTime:finishTime}" `
                    --output json | ConvertFrom-Json
                if ($LASTEXITCODE -ne 0 -or -not $run) {
                    throw "Could not read ACR run $runId."
                }
                Write-Host "ACR run $runId status: $($run.status)"
                if ($run.status -eq "Succeeded") { break }
                if ($run.status -in @("Failed", "Canceled", "Error", "Timeout")) {
                    throw "ACR build $runId failed for $($image.Name) with status '$($run.status)'."
                }
            } while ((Get-Date) -lt $deadline)
            if ($run.status -ne "Succeeded") {
                throw "ACR build $runId did not complete within 45 minutes."
            }
        }
    } finally {
        $env:PYTHONIOENCODING = $previousPythonIoEncoding
        $env:PYTHONUTF8 = $previousPythonUtf8
    }

    az acr login --name $RegistryName
    if ($LASTEXITCODE -ne 0) { throw "Microsoft Entra ACR login failed before final-image validation." }
    foreach ($image in $images) {
            docker pull $image.Reference
            if ($LASTEXITCODE -ne 0) { throw "Could not pull ACR-built image $($image.Reference) for final-image validation." }
    }
} else {
    foreach ($image in $images) {
            Write-Host "Building $($image.Reference) locally..."
            docker build `
            --pull `
            --platform linux/amd64 `
            --file $image.Dockerfile `
            --target runtime `
            --build-arg "BUILD_VERSION=$ImageTag" `
            --tag $image.Reference `
            .
        if ($LASTEXITCODE -ne 0) { throw "Docker build failed for $($image.Name)." }
    }
}

& "$PSScriptRoot\validate-images.ps1" `
    -WebImage ($images | Where-Object Name -eq "web").Reference `
    -ApiImage ($images | Where-Object Name -eq "api").Reference `
    -WorkerImage ($images | Where-Object Name -eq "worker").Reference `
    -SeederImage ($images | Where-Object Name -eq "seeder").Reference

if ($Push) {
    az acr login --name $RegistryName
    if ($LASTEXITCODE -ne 0) { throw "Microsoft Entra ACR login failed." }
    foreach ($image in $images) {
            docker push $image.Reference
            if ($LASTEXITCODE -ne 0) { throw "Push failed for $($image.Name)." }
    }
}

$results = foreach ($image in $images) {
    $digest = $null
    if ($UseAcrBuild -or $Push) {
        $digest = az acr repository show `
            --name $RegistryName `
            --image "$($image.Repository):$ImageTag" `
            --query digest `
            --output tsv
        if ($LASTEXITCODE -ne 0 -or -not $digest) {
            throw "Could not resolve pushed digest for $($image.Reference)."
        }
    }
    [pscustomobject]@{
        name = $image.Name
        repository = $image.Repository
        tag = $ImageTag
        reference = $image.Reference
        digest = $digest
        immutableReference = if ($digest) { "$RegistryLoginServer/$($image.Repository)@$digest" } else { $null }
    }
}

$results | ConvertTo-Json -Depth 4
