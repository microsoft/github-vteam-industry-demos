param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("preprovision.py", "postprovision.py")]
    [string]$Script
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$venvPath = Join-Path $repoRoot ".venv"
$pythonPath = Join-Path $venvPath "Scripts\python.exe"
$requirementsPath = Join-Path $PSScriptRoot "requirements.txt"
$scriptPath = Join-Path $PSScriptRoot $Script

if (-not (Test-Path $pythonPath)) {
    python -m venv $venvPath
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to create the Python virtual environment."
    }
}

& $pythonPath -m pip install --disable-pip-version-check --quiet -r $requirementsPath
if ($LASTEXITCODE -ne 0) {
    throw "Unable to install Azure deployment hook dependencies."
}

& $pythonPath $scriptPath
exit $LASTEXITCODE
