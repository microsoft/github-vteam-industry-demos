Set-StrictMode -Version Latest

function Format-AzCommand {
    param([Parameter(Mandatory)][string[]]$Arguments)
    return "az " + (($Arguments | ForEach-Object {
        if ($_ -match "\s") { "'$($_ -replace "'", "''")'" } else { $_ }
    }) -join " ")
}

function Invoke-AzCli {
    param(
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$Operation
    )

    $raw = @()
    $preferenceVariable = Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
    $previousPreference = if ($preferenceVariable) { $preferenceVariable.Value } else { $null }
    try {
        if ($preferenceVariable) { $PSNativeCommandUseErrorActionPreference = $false }
        $raw = @(& az @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    } catch {
        throw "Azure CLI failed while $Operation ($(Format-AzCommand $Arguments)): $($_.Exception.Message)"
    } finally {
        if ($preferenceVariable) { $PSNativeCommandUseErrorActionPreference = $previousPreference }
    }

    $stdout = @($raw | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } | ForEach-Object { "$_" })
    $stderr = @($raw | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] } | ForEach-Object { "$_" })
    if ($exitCode -ne 0) {
        $details = (@($stdout) + @($stderr)) -join " "
        if ([string]::IsNullOrWhiteSpace($details)) { $details = "no diagnostic output" }
        throw "Azure CLI failed with exit code $exitCode while $Operation ($(Format-AzCommand $Arguments)): $details"
    }

    return [pscustomobject]@{
        Stdout = $stdout -join [Environment]::NewLine
        Stderr = $stderr -join [Environment]::NewLine
    }
}

function Invoke-AzJson {
    param(
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$Operation
    )
    $result = Invoke-AzCli -Arguments $Arguments -Operation $Operation
    if ([string]::IsNullOrWhiteSpace($result.Stdout)) {
        throw "Azure CLI returned no JSON while $Operation ($(Format-AzCommand $Arguments))."
    }
    try {
        return $result.Stdout | ConvertFrom-Json
    } catch {
        throw "Azure CLI returned malformed JSON while $Operation ($(Format-AzCommand $Arguments)): $($_.Exception.Message)"
    }
}

function Invoke-AzText {
    param(
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$Operation
    )
    return (Invoke-AzCli -Arguments $Arguments -Operation $Operation).Stdout.Trim()
}

function Get-ObjectPropertyValue {
    param(
        [AllowNull()][object]$InputObject,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Context,
        [switch]$Required
    )
    if ($null -eq $InputObject) {
        if ($Required) { throw "$Context is missing required property '$Name'." }
        return $null
    }
    $property = $InputObject.PSObject.Properties[$Name]
    if ($null -eq $property) {
        if ($Required) { throw "$Context is missing required property '$Name'." }
        return $null
    }
    if ($Required -and $null -eq $property.Value) {
        throw "$Context required property '$Name' cannot be null."
    }
    return $property.Value
}

function Get-RequiredStringProperty {
    param(
        [Parameter(Mandatory)][object]$InputObject,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Context
    )
    $value = Get-ObjectPropertyValue -InputObject $InputObject -Name $Name -Context $Context -Required
    if ($value -isnot [string] -or [string]::IsNullOrWhiteSpace($value)) {
        throw "$Context property '$Name' must be a non-empty string."
    }
    return $value
}

function Assert-ManagedIdentityRegistry {
    param(
        [Parameter(Mandatory)][object]$Workload,
        [Parameter(Mandatory)][string]$WorkloadName,
        [Parameter(Mandatory)][string]$ExpectedServer
    )

    $identity = Get-ObjectPropertyValue -InputObject $Workload -Name "identity" -Context $WorkloadName -Required
    $identityType = Get-RequiredStringProperty -InputObject $identity -Name "type" -Context "$WorkloadName identity"
    if ($identityType -notmatch "(^|,\s*)UserAssigned($|,\s*)") {
        throw "$WorkloadName must use a user-assigned managed identity."
    }
    $assignedIdentities = Get-ObjectPropertyValue -InputObject $identity -Name "userAssignedIdentities" -Context "$WorkloadName identity" -Required
    $assignedIdentityIds = @($assignedIdentities.PSObject.Properties | ForEach-Object { $_.Name })
    if ($assignedIdentityIds.Count -eq 0) {
        throw "$WorkloadName identity must contain at least one user-assigned identity resource ID."
    }

    $properties = Get-ObjectPropertyValue -InputObject $Workload -Name "properties" -Context $WorkloadName -Required
    $configuration = Get-ObjectPropertyValue -InputObject $properties -Name "configuration" -Context "$WorkloadName properties" -Required
    $registries = @(Get-ObjectPropertyValue -InputObject $configuration -Name "registries" -Context "$WorkloadName configuration" -Required)
    if ($registries.Count -ne 1 -or $null -eq $registries[0]) {
        throw "$WorkloadName must declare exactly one ACR registry."
    }

    $registry = $registries[0]
    $server = Get-RequiredStringProperty -InputObject $registry -Name "server" -Context "$WorkloadName registry"
    if (-not $server.Equals($ExpectedServer, [StringComparison]::OrdinalIgnoreCase)) {
        throw "$WorkloadName registry server '$server' does not match expected ACR '$ExpectedServer'."
    }
    $registryIdentity = Get-RequiredStringProperty -InputObject $registry -Name "identity" -Context "$WorkloadName registry"
    if (-not @($assignedIdentityIds | Where-Object {
        $_.Equals($registryIdentity, [StringComparison]::OrdinalIgnoreCase)
    }).Count) {
        throw "$WorkloadName registry identity '$registryIdentity' is not assigned to the workload."
    }

    $passwordSecretRef = Get-ObjectPropertyValue -InputObject $registry -Name "passwordSecretRef" -Context "$WorkloadName registry"
    if ($null -ne $passwordSecretRef -and -not [string]::IsNullOrEmpty("$passwordSecretRef")) {
        throw "$WorkloadName unexpectedly uses ACR password secret '$passwordSecretRef'."
    }
}
