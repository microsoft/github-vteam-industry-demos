[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-Condition {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Assert-Rejected {
    param([scriptblock]$Operation, [string]$ExpectedMessage)
    try { & $Operation } catch {
        Assert-Condition ($_.Exception.Message.Contains($ExpectedMessage)) "Expected '$ExpectedMessage', got '$($_.Exception.Message)'."
        return
    }
    throw "Expected rejection containing '$ExpectedMessage'."
}

$root = Join-Path $PSScriptRoot "..\.."
$validatorPath = Join-Path $PSScriptRoot "validate-images.ps1"
$lock = Get-Content (Join-Path $root "package-lock.json") -Raw | ConvertFrom-Json -AsHashtable
$productionDependencies = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($manifestPath in Get-ChildItem (Join-Path $root "apps\*\package.json"), (Join-Path $root "packages\*\package.json")) {
    $manifest = Get-Content $manifestPath.FullName -Raw | ConvertFrom-Json -AsHashtable
    if ($manifest.ContainsKey("dependencies")) {
        foreach ($name in $manifest.dependencies.Keys) { [void]$productionDependencies.Add($name) }
    }
}

function Get-RuntimeImports {
    param([string]$Source)
    foreach ($match in [regex]::Matches($Source, 'import\([''"](?<module>[^''"]+)[''"]\)')) {
        $match.Groups["module"].Value
    }
}

function Assert-ProductionImports {
    param([string]$Source)
    $imports = @(Get-RuntimeImports $Source)
    Assert-Condition ($imports.Count -gt 0) "Runtime dependency probe must not be empty."
    foreach ($specifier in $imports) {
        $parts = $specifier.Split("/")
        $package = if ($specifier.StartsWith("@")) { $parts[0..1] -join "/" } else { $parts[0] }
        $entry = $lock.packages["node_modules/$package"]
        Assert-Condition ($productionDependencies.Contains($package) -and $null -ne $entry -and
            (-not $entry.ContainsKey("dev") -or $entry.dev -ne $true)) "Probe imports non-production dependency '$specifier'."
    }
    foreach ($required in @("marked", "playwright-core", "pdfjs-dist/legacy/build/pdf.mjs")) {
        Assert-Condition ($imports -ccontains $required) "Production renderer probe is missing '$required'."
    }
}

$validatorSource = Get-Content $validatorPath -Raw
Assert-ProductionImports $validatorSource
foreach ($name in @("api", "worker", "seed")) {
    $dockerfile = Get-Content (Join-Path $root "containers\Dockerfile.$name") -Raw
    Assert-ProductionImports $dockerfile
    Assert-Condition ($dockerfile -match 'npm ci --omit=dev') "$name image must omit development dependencies."
    Assert-Condition (((Get-RuntimeImports $dockerfile | Sort-Object) -join ",") -ceq
        ((Get-RuntimeImports $validatorSource | Sort-Object) -join ",")) "$name build/runtime dependency probes have diverged."
}
Assert-Condition ($lock.packages["node_modules/pdf-lib"].dev -eq $true) "pdf-lib must remain a development-only fixture dependency."
Assert-Rejected { Assert-ProductionImports ($validatorSource.Replace("import('marked')", "import('pdf-lib')")) } "non-production dependency 'pdf-lib'"
$apiDockerfile = Get-Content (Join-Path $root "containers\Dockerfile.api") -Raw
foreach ($required in @("chromium --version", "fonts-noto-core", "fonts-noto-extra", "fonts-noto-cjk",
        "fonts-noto-color-emoji", "Production Chromium/Noto Unicode PDF smoke passed.",
        "COPY --from=verification /tmp/api-verification-ok")) {
    Assert-Condition ($apiDockerfile.Contains($required)) "API image must retain '$required'."
}

$template = Get-Content (Join-Path $root "containers\nginx\default.conf.template") -Raw
$rendered = $template.Replace('${API_UPSTREAM}', 'http://127.0.0.1:3001')
$configMount = "/etc/nginx/conf.d:rw,nosuid,nodev,noexec,size=1m,uid=101,gid=101,mode=0755"
$replayState = @{}

function Assert-WebRuntimeArguments {
    param([object[]]$Arguments)
    Assert-Condition ($Arguments -ccontains "--read-only") "Web root filesystem must remain read-only."
    Assert-Condition ($Arguments -ccontains $configMount) "Nginx template destination needs an explicit UID-101 writable tmpfs."
    Assert-Condition ($Arguments -ccontains "NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d") "Nginx template output must target the writable config mount."
    Assert-Condition ($Arguments -ccontains "/tmp:rw,nosuid,nodev,size=32m") "Nginx PID/cache paths need the bounded writable tmpfs."
    Assert-Condition (@($Arguments | Where-Object { $_ -ceq "--tmpfs" }).Count -eq 2) "Only Nginx runtime/config directories may be writable mounts."
    Assert-Condition ($Arguments -ccontains "API_UPSTREAM=http://127.0.0.1:3001") "Proxy upstream must remain loopback-only."
    foreach ($forbidden in @("--privileged", "--user", "--entrypoint", "--mount", "--volume", "-v")) {
        Assert-Condition ($Arguments -cnotcontains $forbidden) "Web runtime must not override its non-root inherited entrypoint or mount policy."
    }
}

# Replay the actual script, replacing only process/HTTP/wait boundaries; no Docker or Azure is invoked.
function docker {
    $arguments = @($args)
    $replayState.Calls.Add($arguments)
    $global:LASTEXITCODE = 0
    switch ($arguments[0]) {
        "info" {
            if ($replayState.Failure -eq "engine") { $global:LASTEXITCODE = 1; return }
            return "linux"
        }
        "network" { return }
        "rm" { return }
        "port" { return "127.0.0.1:49152" }
        "image" {
            Assert-Condition (($arguments -join " ") -ceq 'image inspect offline-seeder --format {{json .Config}}') "Unexpected seeder inspection."
            if ($replayState.Failure -eq "inspect") { $global:LASTEXITCODE = 17; return "inspect failed" }
            return $replayState.ConfigJson
        }
        "exec" {
            Assert-Condition (($arguments[2..3] -join " ") -ceq "nginx -T") "Generated Nginx configuration must be validated and dumped."
            if ($replayState.Failure -eq "nginx-exit") { $global:LASTEXITCODE = 1; return }
            if ($replayState.Failure -eq "nginx-missing") { return "# configuration file /etc/nginx/nginx.conf:`nevents {}" }
            $config = switch ($replayState.Failure) {
                "nginx-default" { "server { listen 8080; location / { root /usr/share/nginx/html; } }" }
                "nginx-unexpanded" { $template }
                "nginx-upstream" { $rendered.Replace("127.0.0.1:3001", "other-api:3001") }
                "nginx-auth" { $rendered.Replace('proxy_set_header Authorization "";', 'proxy_set_header Authorization $http_authorization;') }
                default { $rendered }
            }
            return "# configuration file /etc/nginx/nginx.conf:`nevents {}`n# configuration file /etc/nginx/conf.d/default.conf:`n$config`n# configuration file /etc/nginx/mime.types:`ntypes {}"
        }
        "run" {
            Assert-Condition ($arguments -ccontains "--read-only") "Every final-image run must retain the read-only root policy."
            if ($arguments -ccontains "offline-web") {
                Assert-WebRuntimeArguments $arguments
                return "offline-web-container"
            }
            if ($arguments -ccontains "offline-api") {
                if ($arguments -ccontains "--entrypoint") {
                    $probe = $arguments[[array]::IndexOf($arguments, "-e") + 1]
                    Assert-ProductionImports $probe
                    if ($replayState.Failure -eq "dependencies") { $global:LASTEXITCODE = 1 }
                } else {
                    Assert-Condition (@($arguments | Where-Object { $_ -clike "container:aipf-web-*" }).Count -eq 1) "API must share the web network namespace."
                }
                return
            }
            if ($arguments -ccontains "offline-worker") { return "Fixture/local mode" }
            if ($arguments -ccontains "offline-seeder") {
                Assert-Condition ($arguments -cnotcontains "--entrypoint") "Seeder must use its real dumb-init/Node entrypoint."
                if ($arguments[-1] -ceq "--help") { return "Usage: --dry-run" }
                if ($arguments[-1] -ceq "--dry-run") { return "Dry run complete" }
            }
            throw "Unexpected container run: $($arguments -join ' ')"
        }
        default { throw "Unexpected Docker boundary: $($arguments -join ' ')" }
    }
}

function Invoke-WebRequest {
    param([string]$Uri, [int]$TimeoutSec, [switch]$UseBasicParsing)
    $replayState.Requests.Add($Uri)
    $content = switch ($Uri) {
        "http://127.0.0.1:49152/health" { '{"status":"ok"}' }
        "http://127.0.0.1:49152/" { '<div id="root"></div>' }
        "http://127.0.0.1:49152/api/dashboard" {
            if ($replayState.Failure -eq "dashboard-html") { '<div id="root"></div>' }
            else { '{"opportunities":10,"activeValue":150000}' }
        }
        default { throw "Unexpected HTTP boundary: $Uri" }
    }
    return [pscustomobject]@{ StatusCode = 200; Content = $content }
}

function Start-Sleep { param([int]$Seconds) }

function Invoke-Replay {
    param([string]$Json, [string]$Failure = "")
    $replayState.ConfigJson = $Json
    $replayState.Failure = $Failure
    $replayState.Calls = [System.Collections.Generic.List[object]]::new()
    $replayState.Requests = [System.Collections.Generic.List[string]]::new()
    & $validatorPath -WebImage offline-web -ApiImage offline-api -WorkerImage offline-worker -SeederImage offline-seeder 6>$null
}

$entrypoint = '["dumb-init","--","node","containers/dist/seed-entrypoint.js"]'
$expectedMetadata = '{"Entrypoint":' + $entrypoint + ',"Cmd":[],"User":"node","WorkingDir":"/app","Env":["NODE_ENV=production"]}'
foreach ($metadata in @(
    $expectedMetadata,
    ('{"Entrypoint":' + $entrypoint + ',"Cmd":null}'),
    ('{"Entrypoint":' + $entrypoint + '}')
)) {
    Invoke-Replay $metadata
    $Calls = $replayState.Calls
    $Requests = $replayState.Requests
    foreach ($uri in @("/", "/health", "/api/dashboard")) {
        Assert-Condition ($Requests.Contains("http://127.0.0.1:49152$uri")) "Final image replay omitted route '$uri'."
    }
    Assert-Condition (@($Calls | Where-Object { $_[0] -ceq "exec" }).Count -eq 1) "Final image replay must validate generated Nginx configuration."
    foreach ($argument in @("--help", "--dry-run")) {
        Assert-Condition (@($Calls | Where-Object { $_[0] -ceq "run" -and $_ -ccontains "offline-seeder" -and $_[-1] -ceq $argument }).Count -eq 1) "Seeder replay omitted ordinary $argument execution."
    }
    Assert-Condition ($Calls[-2][0] -ceq "rm" -and ($Calls[-1][0..1] -join " ") -ceq "network rm") "Final-image validation must clean up its own containers/network."
}
$webArguments = @($Calls | Where-Object { $_[0] -ceq "run" -and $_ -ccontains "offline-web" })[0]
Assert-Rejected { Assert-WebRuntimeArguments @($webArguments | Where-Object { $_ -cne $configMount }) } "explicit UID-101 writable tmpfs"
Assert-Rejected { Assert-WebRuntimeArguments @($webArguments | Where-Object { $_ -cne "--read-only" }) } "must remain read-only"
Assert-Rejected { Assert-WebRuntimeArguments @($webArguments | ForEach-Object { if ($_ -ceq $configMount) { $_.Replace("uid=101", "uid=0") } else { $_ } }) } "explicit UID-101 writable tmpfs"

$malformedCases = @(
    @{ Json = ""; Error = "Could not inspect" },
    @{ Json = "{invalid"; Error = "malformed JSON" },
    @{ Json = "null"; Error = "Config object" },
    @{ Json = "false"; Error = "Config object" },
    @{ Json = "1"; Error = "Config object" },
    @{ Json = '"config"'; Error = "Config object" },
    @{ Json = "[]"; Error = "Config object" },
    @{ Json = "[$expectedMetadata]"; Error = "Config object" },
    @{ Json = "[$expectedMetadata,$expectedMetadata]"; Error = "Config object" },
    @{ Json = "{}"; Error = "omitted Config.Entrypoint" },
    @{ Json = '{"Cmd":[]}'; Error = "omitted Config.Entrypoint" },
    @{ Json = '{"Entrypoint":null,"Cmd":[]}'; Error = "ENTRYPOINT contract" },
    @{ Json = '{"Entrypoint":[],"Cmd":[]}'; Error = "ENTRYPOINT contract" },
    @{ Json = '{"Entrypoint":{},"Cmd":[]}'; Error = "ENTRYPOINT contract" },
    @{ Json = '{"Entrypoint":"dumb-init -- node containers/dist/seed-entrypoint.js","Cmd":[]}'; Error = "ENTRYPOINT contract" },
    @{ Json = '{"Entrypoint":["sh","-c","node","containers/dist/seed-entrypoint.js"],"Cmd":null}'; Error = "ENTRYPOINT element" },
    @{ Json = '{"Entrypoint":[["dumb-init"],"--","node","containers/dist/seed-entrypoint.js"],"Cmd":[]}'; Error = "ENTRYPOINT element" },
    @{ Json = '{"Entrypoint":["DUMB-INIT","--","node","containers/dist/seed-entrypoint.js"],"Cmd":[]}'; Error = "ENTRYPOINT element" },
    @{ Json = '{"Entrypoint":["dumb-init","--",1,"containers/dist/seed-entrypoint.js"],"Cmd":[]}'; Error = "ENTRYPOINT element" }
)
foreach ($command in @('["node"]', '[""]', '[null]', '[[]]', '""', '"[]"', '{}', 'false', '0')) {
    $malformedCases += @{ Json = '{"Entrypoint":' + $entrypoint + ',"Cmd":' + $command + '}'; Error = "CMD must be empty" }
}
foreach ($case in $malformedCases) {
    Assert-Rejected { Invoke-Replay $case.Json } $case.Error
}

$boundaryFailures = [ordered]@{
    "engine" = "A running Linux Docker engine is required"
    "inspect" = "Could not inspect"
    "dependencies" = "missing production runtime dependencies"
    "nginx-exit" = "generated Nginx configuration is invalid"
    "nginx-missing" = "must load the generated same-origin"
    "nginx-default" = "must load the generated same-origin"
    "nginx-unexpanded" = "must load the generated same-origin"
    "nginx-upstream" = "must load the generated same-origin"
    "nginx-auth" = "must load the generated same-origin"
    "dashboard-html" = "did not become ready"
}
foreach ($failure in $boundaryFailures.Keys) {
    Assert-Rejected { Invoke-Replay $expectedMetadata $failure } $boundaryFailures[$failure]
}
$global:LASTEXITCODE = 0
Write-Host "PASS offline final-image contracts: production-only imports across validator/three Dockerfiles; null/[] metadata; $($malformedCases.Count) malformed metadata denials; read-only writable-config mounts; generated Nginx/API/static routing; $($boundaryFailures.Count) fail-closed boundaries. No Linux image execution."
