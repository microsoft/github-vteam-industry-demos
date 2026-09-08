[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$WebImage,
    [Parameter(Mandatory)]
    [string]$ApiImage,
    [Parameter(Mandatory)]
    [string]$WorkerImage,
    [Parameter(Mandatory)]
    [string]$SeederImage
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$dockerOperatingSystem = docker info --format "{{.OSType}}" 2>$null
if ($LASTEXITCODE -ne 0 -or "$dockerOperatingSystem".Trim() -cne "linux") {
    throw "A running Linux Docker engine is required for final-image validation."
}

$suffix = "$PID-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
$networkName = "aipf-verify-$suffix"
$apiName = "aipf-api-$suffix"
$webName = "aipf-web-$suffix"

function Invoke-ContainerRequest {
    param(
        [Parameter(Mandatory)][string]$Uri,
        [string]$ExpectedText,
        [int]$Attempts = 30
    )
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Uri -TimeoutSec 5 -UseBasicParsing
            if ($response.StatusCode -eq 200 -and
                (-not $ExpectedText -or $response.Content.Contains($ExpectedText))) {
                return $response
            }
        } catch {
            if ($attempt -eq $Attempts) { throw }
        }
        Start-Sleep -Seconds 1
    }
    throw "Image endpoint '$Uri' did not become ready."
}

function Assert-SeederImageCommand {
    $configJson = docker image inspect $SeederImage --format "{{json .Config}}"
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($configJson -join ""))) {
        throw "Could not inspect the final seeder image command."
    }
    try {
        $config = ($configJson -join [Environment]::NewLine) | ConvertFrom-Json -NoEnumerate
    } catch {
        throw "Final seeder image inspection returned malformed JSON: $($_.Exception.Message)"
    }
    if ($config -isnot [System.Management.Automation.PSCustomObject]) {
        throw "Final seeder image inspection must return a Config object."
    }

    $entrypointProperty = $config.PSObject.Properties["Entrypoint"]
    if ($null -eq $entrypointProperty) {
        throw "Final seeder image inspection omitted Config.Entrypoint."
    }
    $actualEntrypoint = $entrypointProperty.Value
    $expectedEntrypoint = @("dumb-init", "--", "node", "containers/dist/seed-entrypoint.js")
    if ($actualEntrypoint -isnot [array] -or $actualEntrypoint.Count -ne $expectedEntrypoint.Count) {
        throw "Final seeder image does not preserve the dumb-init/Node ENTRYPOINT contract."
    }
    for ($index = 0; $index -lt $expectedEntrypoint.Count; $index++) {
        if ($actualEntrypoint[$index] -isnot [string] -or
            $actualEntrypoint[$index] -cne $expectedEntrypoint[$index]) {
            throw "Final seeder image ENTRYPOINT element $index is incorrect."
        }
    }
    $cmdProperty = $config.PSObject.Properties["Cmd"]
    # Docker Engine omits Config.Cmd when an exec-form `CMD []` is serialized.
    # Omitted and explicit null are therefore equivalent only after the exact
    # immutable ENTRYPOINT above has been validated.
    if ($null -ne $cmdProperty -and
        $null -ne $cmdProperty.Value -and
            ($cmdProperty.Value -isnot [array] -or $cmdProperty.Value.Count -ne 0)) {
        throw "Final seeder image CMD must be empty so runtime arguments reach the Node seeder."
    }
}

function Assert-WebProxyConfiguration {
    $configDump = docker exec $webName nginx -T
    if ($LASTEXITCODE -ne 0) {
        throw "Final web image generated Nginx configuration is invalid."
    }
    $generated = [regex]::Match(
        ($configDump -join "`n"),
        '(?ms)^# configuration file /etc/nginx/conf\.d/default\.conf:\r?\n(?<config>.*?)(?=^# configuration file |\z)'
    )
    $template = Get-Content -LiteralPath (Join-Path $PSScriptRoot "..\..\containers\nginx\default.conf.template") -Raw
    $expected = $template.Replace('${API_UPSTREAM}', 'http://127.0.0.1:3001')
    if (-not $generated.Success -or
        ($generated.Groups["config"].Value -replace "`r`n", "`n").Trim() -cne
        ($expected -replace "`r`n", "`n").Trim()) {
        throw "Final web image must load the generated same-origin Nginx template, not the base-image default."
    }
}

try {
    docker network create $networkName 1>$null
    if ($LASTEXITCODE -ne 0) { throw "Could not create validation network." }

    docker run --rm --read-only --tmpfs "/tmp:rw,nosuid,nodev,size=64m" `
        --entrypoint node $ApiImage `
        -e "Promise.all([import('@azure/identity'),import('@azure/cosmos'),import('@azure/storage-blob'),import('@azure/storage-queue'),import('@azure/search-documents'),import('openai'),import('zod'),import('marked'),import('playwright-core'),import('mammoth'),import('pdfjs-dist/legacy/build/pdf.mjs')])"
    if ($LASTEXITCODE -ne 0) { throw "API image is missing production runtime dependencies." }

    # The inherited template hook writes here as UID 101; keep the rest of /etc read-only.
    docker run --detach --name $webName --network $networkName `
        --read-only --tmpfs "/tmp:rw,nosuid,nodev,size=32m" `
        --tmpfs "/etc/nginx/conf.d:rw,nosuid,nodev,noexec,size=1m,uid=101,gid=101,mode=0755" `
        --env "NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d" `
        --env "API_UPSTREAM=http://127.0.0.1:3001" `
        --publish "127.0.0.1::8080" $WebImage 1>$null
    if ($LASTEXITCODE -ne 0) { throw "Web image did not start." }
    $webPort = (docker port $webName "8080/tcp" | Select-Object -First 1) -replace "^.*:", ""

    docker run --detach --name $apiName --network "container:$webName" `
        --read-only --tmpfs "/tmp:rw,nosuid,nodev,size=64m" `
        --env DATA_PROVIDER=local --env AI_PROVIDER=fixture --env NODE_ENV=test --env AUTH_MODE=development `
        --env "AUTH_DEVELOPMENT_ORIGINS=http://127.0.0.1:$webPort" `
        $ApiImage 1>$null
    if ($LASTEXITCODE -ne 0) { throw "API image did not start." }
    Invoke-ContainerRequest -Uri "http://127.0.0.1:$webPort/health" -ExpectedText '"status":"ok"' | Out-Null
    Assert-WebProxyConfiguration

    $workerOutput = docker run --rm --read-only --tmpfs "/tmp:rw,nosuid,nodev,size=16m" `
        --env DATA_PROVIDER=local $WorkerImage
    if ($LASTEXITCODE -ne 0 -or ($workerOutput -join "`n") -notmatch "Fixture/local mode") {
        throw "Worker image startup check failed."
    }

    Assert-SeederImageCommand
    $seedHelp = docker run --rm --read-only --tmpfs "/tmp:rw,nosuid,nodev,size=16m" $SeederImage --help
    if ($LASTEXITCODE -ne 0 -or ($seedHelp -join "`n") -notmatch "--dry-run") {
        throw "Seeder image help check failed."
    }
    $seedDryRun = docker run --rm --read-only --tmpfs "/tmp:rw,nosuid,nodev,size=16m" `
        --env DATA_PROVIDER=azure `
        --env AI_PROVIDER=azure `
        --env AZURE_LOCATION=swedencentral `
        --env AZURE_REGION_CODE=swc `
        --env AZURE_RESOURCE_GROUP=rg-aipf-dev-swc-001 `
        --env AZURE_COSMOS_ENDPOINT=https://dryrun.documents.azure.com `
        --env AZURE_STORAGE_BLOB_ENDPOINT=https://dryrun.blob.core.windows.net `
        --env AZURE_STORAGE_QUEUE_ENDPOINT=https://dryrun.queue.core.windows.net `
        --env AZURE_SEARCH_ENDPOINT=https://dryrun.search.windows.net `
        --env AZURE_OPENAI_ENDPOINT=https://dryrun.openai.azure.com `
        --env AZURE_CLIENT_ID=11111111-2222-3333-4444-555555555555 `
        $SeederImage --dry-run
    if ($LASTEXITCODE -ne 0 -or ($seedDryRun -join "`n") -notmatch "Dry run complete") {
        throw "Seeder image dry-run check failed."
    }

    Invoke-ContainerRequest -Uri "http://127.0.0.1:$webPort/" -ExpectedText '<div id="root"></div>' | Out-Null
    Invoke-ContainerRequest -Uri "http://127.0.0.1:$webPort/health" -ExpectedText '"status":"ok"' | Out-Null
    Invoke-ContainerRequest -Uri "http://127.0.0.1:$webPort/api/dashboard" -ExpectedText '"opportunities":' | Out-Null

    Write-Host "Final images passed dependency, generated Nginx configuration, API health, static UI, same-origin proxy, worker startup, seeder command inspection, help, and dry-run checks."
} finally {
    docker rm --force $apiName $webName 1>$null 2>$null
    docker network rm $networkName 1>$null 2>$null
}
