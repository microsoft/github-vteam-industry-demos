[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-Condition {
    param(
        [Parameter(Mandatory)][bool]$Condition,
        [Parameter(Mandatory)][string]$Message
    )
    if (-not $Condition) { throw $Message }
}

$dockerfilePath = Join-Path $PSScriptRoot "..\..\containers\Dockerfile.seed"
$validatorPath = Join-Path $PSScriptRoot "validate-images.ps1"
$buildPath = Join-Path $PSScriptRoot "build-images.ps1"
$dockerfile = Get-Content -LiteralPath $dockerfilePath -Raw
$validator = Get-Content -LiteralPath $validatorPath -Raw
$build = Get-Content -LiteralPath $buildPath -Raw

$entrypointMatch = [regex]::Match($dockerfile, "(?m)^\s*ENTRYPOINT\s+(.+?)\s*$")
$cmdMatch = [regex]::Match($dockerfile, "(?m)^\s*CMD\s+(.+?)\s*$")
Assert-Condition $entrypointMatch.Success "Seeder Dockerfile must declare an exec-form ENTRYPOINT."
Assert-Condition $cmdMatch.Success "Seeder Dockerfile must declare an exec-form CMD."

try {
    $parsedEntrypoint = $entrypointMatch.Groups[1].Value | ConvertFrom-Json
    $parsedCommand = $cmdMatch.Groups[1].Value | ConvertFrom-Json
    $entrypoint = @($parsedEntrypoint)
    $command = @($parsedCommand)
} catch {
    throw "Seeder ENTRYPOINT and CMD must be valid JSON arrays: $($_.Exception.Message)"
}

$expectedEntrypoint = @("dumb-init", "--", "node", "containers/dist/seed-entrypoint.js")
Assert-Condition ($entrypoint.Count -eq $expectedEntrypoint.Count) "Seeder ENTRYPOINT must launch the Node seeder through dumb-init."
for ($index = 0; $index -lt $expectedEntrypoint.Count; $index++) {
    Assert-Condition ($entrypoint[$index] -ceq $expectedEntrypoint[$index]) "Seeder ENTRYPOINT element $index is incorrect."
}
Assert-Condition ($command.Count -eq 0) "Seeder CMD must be empty so runtime arguments append to the Node seeder command."

$helpInvocation = @($entrypoint) + @("--help")
$dryRunInvocation = @($entrypoint) + @("--dry-run")
Assert-Condition (($helpInvocation -join " ") -ceq "dumb-init -- node containers/dist/seed-entrypoint.js --help") "Seeder --help does not resolve to the Node seeder."
Assert-Condition (($dryRunInvocation -join " ") -ceq "dumb-init -- node containers/dist/seed-entrypoint.js --dry-run") "Seeder --dry-run does not resolve to the Node seeder."

Assert-Condition ($validator -match '(?m)\$SeederImage\s+--help\s*$') "Final-image validation must pass --help through the seeder ENTRYPOINT."
Assert-Condition ($validator -match '(?m)\$SeederImage\s+--dry-run\s*$') "Final-image validation must pass --dry-run through the seeder ENTRYPOINT."
Assert-Condition ($validator -notmatch '(?m)^\s*--entrypoint[^\r\n]*\$SeederImage') "Final-image validation must not replace the seeder ENTRYPOINT."
Assert-Condition ($validator -match 'docker image inspect \$SeederImage') "Final-image validation must inspect the built seeder command metadata."
Assert-Condition ($dockerfile -match 'COPY\s+--from=verification\s+/tmp/seed-verification-ok') "The final seeder image must depend on its verification stage."
Assert-Condition ($build -match '(?m)^\s*& "\$PSScriptRoot\\validate-container-sources\.ps1"\s*$') "Every image build path must run offline source and command-contract validation."
Assert-Condition (($build | Select-String -Pattern '--target\s+runtime' -AllMatches).Matches.Count -eq 2) "Local and ACR builds must explicitly target the verified runtime stage."
Assert-Condition ($build -match '(?m)^\s*docker pull \$image\.Reference\s*$') "ACR builds must pull their pushed final images for execution."
Assert-Condition (($build | Select-String -Pattern '\\validate-images\.ps1"' -AllMatches).Matches.Count -eq 1) "Every build path must converge on one mandatory final-image validation."
Assert-Condition ($build.IndexOf("docker pull `$image.Reference") -lt $build.IndexOf('& "$PSScriptRoot\validate-images.ps1"')) "ACR final images must be pulled before validation executes."
Assert-Condition ($build -match '\{\{\.OSType\}\}') "Image builds must require a Linux Docker engine, not merely any Docker daemon."
Assert-Condition ($build -notmatch 'SkipValidation') "Final-image validation must not expose a skip switch."

Write-Host "PASS offline seeder ENTRYPOINT/CMD composition and non-skippable local/ACR final-image validation contract."
