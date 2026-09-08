[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$dockerfiles = Get-ChildItem ".\containers\Dockerfile.*"
if ($dockerfiles.Count -ne 4) {
    throw "Expected four production Dockerfiles."
}

foreach ($dockerfile in $dockerfiles) {
    $content = Get-Content $dockerfile.FullName -Raw
    if ($content -match "(?im)^\s*FROM\s+\S+:latest") {
        throw "$($dockerfile.Name) uses a floating latest base image."
    }
    if ($content -notmatch "(?im)^\s*ARG\s+BUILD_VERSION") {
        throw "$($dockerfile.Name) does not accept the immutable build version."
    }
    if ($content -notmatch "org\.opencontainers\.image\.version") {
        throw "$($dockerfile.Name) does not label the immutable build version."
    }
    if ($content -notmatch "(?im)^\s*USER\s+(node|101)\s*$") {
        throw "$($dockerfile.Name) does not declare a non-root final user."
    }
    if ($dockerfile.Name -ne "Dockerfile.web" -and $content -notmatch "AS verification") {
        throw "$($dockerfile.Name) is missing its final-runtime verification stage."
    }
}

$nginx = Get-Content ".\containers\nginx\default.conf.template" -Raw
if ($nginx -notmatch "listen 8080" -or
    $nginx -notmatch [regex]::Escape('proxy_pass ${API_UPSTREAM}') -or
    $nginx -notmatch "location /api/" -or
    $nginx -notmatch "location = /health" -or
    $nginx -notmatch "client_max_body_size 25m") {
    throw "Nginx same-origin proxy contract is incomplete."
}
$openBraces = ([regex]::Matches($nginx, "\{")).Count
$closeBraces = ([regex]::Matches($nginx, "\}")).Count
if ($openBraces -ne $closeBraces) {
    throw "Nginx template braces are unbalanced."
}

$ignore = Get-Content ".\.dockerignore" -Raw
foreach ($required in @("**/node_modules", "**/dist", ".git", ".env")) {
    if ($ignore -notmatch [regex]::Escape($required)) {
        throw ".dockerignore is missing '$required'."
    }
}

& "$PSScriptRoot\test-container-contract.ps1"
& "$PSScriptRoot\test-final-image-contract.ps1"
& "$PSScriptRoot\test-worker-liveness.ps1"
Write-Host "Container source policy checks passed for pinned bases, non-root users, verification stages, command semantics, proxy routes, and build-context exclusions."
