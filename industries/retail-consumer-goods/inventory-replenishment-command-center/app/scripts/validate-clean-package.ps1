[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $ExportRoot
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$resolvedParent = (Resolve-Path (Split-Path -Parent $ExportRoot)).Path
$exportRootFull = Join-Path $resolvedParent (Split-Path -Leaf $ExportRoot)
if (
    $exportRootFull -eq $repositoryRoot -or
    $repositoryRoot.StartsWith("$exportRootFull\", [StringComparison]::OrdinalIgnoreCase) -or
    $exportRootFull.StartsWith("$repositoryRoot\", [StringComparison]::OrdinalIgnoreCase)
) {
    throw 'ExportRoot must be outside the repository and cannot contain it.'
}
if (Test-Path $exportRootFull) {
    throw "ExportRoot already exists. Supply a new, dedicated session path: $exportRootFull"
}

$packageRoot = Join-Path $exportRootFull 'package'
$validationRoot = Join-Path $exportRootFull 'validation-work'
New-Item -ItemType Directory -Path $packageRoot, $validationRoot | Out-Null

$excludedDirectories = @(
    '.git', '.squad', '.copilot', '.vscode',
    'node_modules', 'dist', 'coverage', 'reports', 'test-results',
    'playwright-report', '.cache', '.parcel-cache', '.turbo'
)
$excludedFileNames = @(
    '.mcp.json', '.DS_Store', 'Thumbs.db', 'desktop.ini',
    'local-state.json', 'playwright-state.json', 'main.json'
)
$excludedExtensions = @(
    '.log', '.tmp', '.temp', '.cache', '.pfx', '.p12', '.pem', '.key',
    '.publishsettings', '.sqlite', '.sqlite3'
)
$safeEnvironmentFiles = @('.env.example', '.env.sample', '.env.template')

function Test-IncludedFile {
    param([System.IO.FileInfo] $File)
    if ($File.Name -in $excludedFileNames) { return $false }
    if ($File.Extension -in $excludedExtensions) { return $false }
    if ($File.Name -like '.env*' -and $File.Name -notin $safeEnvironmentFiles) { return $false }
    if ($File.Name -match '\.(next|bak|backup|swp)$') { return $false }
    return $true
}

function Copy-CleanTree {
    param(
        [string] $Source,
        [string] $Destination
    )
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    foreach ($item in Get-ChildItem -LiteralPath $Source -Force) {
        if ($item.PSIsContainer) {
            if ($item.Name -in $excludedDirectories) { continue }
            Copy-CleanTree -Source $item.FullName -Destination (Join-Path $Destination $item.Name)
            continue
        }
        if (Test-IncludedFile $item) {
            Copy-Item -LiteralPath $item.FullName -Destination (Join-Path $Destination $item.Name)
        }
    }
}

Copy-CleanTree -Source $repositoryRoot -Destination $packageRoot

$required = @(
    'app\package.json',
    'app\package-lock.json',
    'app\Dockerfile',
    'app\src\server\app.ts',
    'app\src\shared\contracts.ts',
    'app\tests\unit\calculations.test.ts',
    'app\tests\integration\api.test.ts',
    'app\tests\deployed\read-only.ts',
    'infra\foundation.bicep',
    'infra\main.bicep',
    'infra\preflight.ps1',
    'infra\deploy.ps1',
    'infra\README.md',
    'docs\DEPLOYMENT.md',
    '.gitignore',
    '.gitattributes'
)
$missing = @($required | Where-Object { -not (Test-Path (Join-Path $packageRoot $_)) })
if ($missing.Count) {
    throw "Clean package is missing required files: $($missing -join ', ')"
}

$forbidden = @(Get-ChildItem -LiteralPath $packageRoot -Recurse -Force | Where-Object {
    ($_.PSIsContainer -and $_.Name -in $excludedDirectories) -or
    (-not $_.PSIsContainer -and (
        $_.Name -in $excludedFileNames -or
        $_.Extension -in $excludedExtensions -or
        ($_.Name -like '.env*' -and $_.Name -notin $safeEnvironmentFiles)
    ))
})
if ($forbidden.Count) {
    throw "Clean package contains excluded content: $($forbidden.FullName -join ', ')"
}

Copy-CleanTree -Source $packageRoot -Destination $validationRoot

Push-Location (Join-Path $validationRoot 'app')
try {
    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed in the clean validation copy.' }
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed in the clean validation copy.' }
    npm run test:unit
    if ($LASTEXITCODE -ne 0) { throw 'Unit tests failed in the clean validation copy.' }
    npm run test:integration
    if ($LASTEXITCODE -ne 0) { throw 'Integration tests failed in the clean validation copy.' }
    npm run build:full
    if ($LASTEXITCODE -ne 0) { throw 'Production build failed in the clean validation copy.' }
} finally {
    Pop-Location
}

foreach ($template in Get-ChildItem (Join-Path $validationRoot 'infra') -Filter '*.bicep') {
    az bicep build --file $template.FullName --stdout | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Bicep build failed: $($template.Name)" }
}
foreach ($script in Get-ChildItem (Join-Path $validationRoot 'infra') -Filter '*.ps1') {
    $tokens = $null
    $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile(
        $script.FullName,
        [ref]$tokens,
        [ref]$errors
    ) | Out-Null
    if ($errors.Count) {
        throw "PowerShell parse failed for '$($script.Name)': $($errors.Message -join '; ')"
    }
}

$packageForbiddenAfterValidation = @(Get-ChildItem -LiteralPath $packageRoot -Recurse -Force | Where-Object {
    ($_.PSIsContainer -and $_.Name -in $excludedDirectories) -or
    (-not $_.PSIsContainer -and (
        $_.Name -in $excludedFileNames -or
        $_.Extension -in $excludedExtensions -or
        ($_.Name -like '.env*' -and $_.Name -notin $safeEnvironmentFiles)
    ))
})
if ($packageForbiddenAfterValidation.Count) {
    throw 'Validation contaminated the clean package directory.'
}

[pscustomobject]@{
    result = 'Succeeded'
    packagePath = $packageRoot
    validationPath = $validationRoot
    requiredFileCount = $required.Count
    excludedStateVerified = $true
    npmCi = 'Passed'
    typecheck = 'Passed'
    unitTests = 'Passed'
    integrationTests = 'Passed'
    productionBuild = 'Passed'
    bicepBuild = 'Passed'
    powershellParse = 'Passed'
} | ConvertTo-Json -Depth 4
