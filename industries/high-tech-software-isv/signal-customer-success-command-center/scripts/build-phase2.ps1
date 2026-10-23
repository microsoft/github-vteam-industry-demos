param(
    [ValidateSet('phase2', 'phase3')]
    [string]$Phase = 'phase2'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$context = Join-Path $root '.phase2-build-context'
if (Test-Path $context) { throw 'Build context already exists; inspect it before proceeding.' }
$tag = $Phase + '-' + (Get-Date -AsUTC -Format 'yyyyMMddTHHmmssZ')
$evidence = Join-Path $root "infra\evidence\$Phase-build-request.json"
$subscription = 'e2d6ac89-1bb7-420c-97fb-a96dea6c0635'

$account = & az account show --subscription $subscription --only-show-errors -o json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $account.id -ne $subscription -or $account.state -ne 'Enabled') {
    throw 'The approved subscription is not available.'
}

try {
    New-Item -ItemType Directory -Path $context | Out-Null
    foreach ($folder in @('backend', 'frontend', 'frontend\src', 'scripts')) {
        New-Item -ItemType Directory -Path (Join-Path $context $folder) | Out-Null
    }
    foreach ($file in @('Dockerfile', '.dockerignore', 'backend\requirements.txt',
        'frontend\package.json', 'frontend\package-lock.json', 'frontend\index.html',
        'frontend\tsconfig.json', 'frontend\vite.config.ts', 'scripts\foundry-agent-definitions.json')) {
        Copy-Item (Join-Path $root $file) (Join-Path $context $file)
    }
    Get-ChildItem (Join-Path $root 'backend') -Filter '*.py' -File |
        Copy-Item -Destination (Join-Path $context 'backend')
    Get-ChildItem (Join-Path $root 'frontend\src') -File -Recurse | ForEach-Object {
        if ($_.Extension -notin @('.ts', '.tsx', '.css', '.svg')) {
            throw "Unapproved frontend source extension: $($_.Extension)"
        }
        $relative = [IO.Path]::GetRelativePath($root, $_.FullName)
        $destination = Join-Path $context $relative
        New-Item -ItemType Directory -Force (Split-Path $destination -Parent) | Out-Null
        Copy-Item $_.FullName $destination
    }
    $files = @(Get-ChildItem $context -Recurse -File)
    $inventory = @($files | ForEach-Object {
        [ordered]@{path=[IO.Path]::GetRelativePath($context, $_.FullName); bytes=$_.Length;
            sha256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
    })
    [ordered]@{tag=$tag; repository='signal-command-center'; registry='acrhtisvf4ee1f29.azurecr.io';
        requestedAt=(Get-Date -AsUTC -Format o); contextBytes=($files | Measure-Object Length -Sum).Sum;
        files=$inventory; note='Explicit source-only staging; no host node_modules, credentials, state or evidence'} |
        ConvertTo-Json -Depth 6 | Set-Content $evidence
    $queued = & az acr build --subscription $subscription --registry acrhtisvf4ee1f29 `
        --image "signal-command-center:$tag" --file Dockerfile --platform linux/amd64 `
        --timeout 1200 --no-logs --output json $context
    if ($LASTEXITCODE -ne 0) { throw 'ACR build submission failed; inspect remote run before retrying.' }
    $run = $queued | ConvertFrom-Json
    $deadline = (Get-Date).AddMinutes(22)
    do {
        $status = & az acr task show-run --subscription $subscription --registry acrhtisvf4ee1f29 `
            --run-id $run.runId --output json
        if ($LASTEXITCODE -ne 0) { throw 'Cannot read remote build status; do not blindly rebuild.' }
        $status = $status | ConvertFrom-Json
        if ($status.status -in @('Succeeded', 'Failed', 'Canceled', 'Error', 'Timeout')) { break }
        Start-Sleep -Seconds 15
    } while ((Get-Date) -lt $deadline)
    $status | Select-Object runId, status, createTime, startTime, finishTime, outputImages, platform, runType |
        ConvertTo-Json -Depth 10 | Set-Content (Join-Path $root "infra\evidence\$Phase-acr-build.json")
    if ($status.status -ne 'Succeeded') { throw "ACR run $($run.runId): $($status.status)" }
    Write-Output "Built signal-command-center:$tag"
}
finally {
    if (Test-Path $context) { Remove-Item $context -Recurse -Force }
}
