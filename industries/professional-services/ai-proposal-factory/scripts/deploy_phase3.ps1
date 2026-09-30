[CmdletBinding()]
param(
    [string]$ResourceGroup = "rg-professional-services-04",
    [string]$Location = "swedencentral",
    [string]$SubscriptionId = "e2d6ac89-1bb7-420c-97fb-a96dea6c0635",
    [string]$ImageTag = "",
    [switch]$SkipSmokeTest
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$env:PYTHONUTF8 = "1"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [Console]::OutputEncoding
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $true
}

if ($ResourceGroup -ne "rg-professional-services-04") {
    throw "Refusing to deploy outside rg-professional-services-04."
}
if ($Location -ne "swedencentral") {
    throw "Refusing to deploy outside Sweden Central (swedencentral)."
}

$account = az account show --query "{subscriptionId:id,tenantId:tenantId}" -o json | ConvertFrom-Json
if ($account.subscriptionId -ne $SubscriptionId) {
    throw "Active subscription $($account.subscriptionId) is not $SubscriptionId."
}
$group = az group show --name $ResourceGroup --query "{id:id,location:location}" -o json |
    ConvertFrom-Json
if ($group.location -ne $Location) {
    throw "Resource group location $($group.location) is not $Location."
}

$expectedResources = @(
    @{ Name = "ca-professional-services-04"; Type = "Microsoft.App/containerApps" },
    @{ Name = "cae-professional-services-04"; Type = "Microsoft.App/managedEnvironments" },
    @{ Name = "id-professional-services-04"; Type = "Microsoft.ManagedIdentity/userAssignedIdentities" },
    @{ Name = "proj-professional-services-04"; Type = "Microsoft.CognitiveServices/accounts/projects" }
)
foreach ($required in $expectedResources) {
    $count = [int](az resource list --resource-group $ResourceGroup `
        --resource-type $required.Type `
        --query "[?ends_with(name, '$($required.Name)')] | length(@)" -o tsv)
    if ($count -ne 1) {
        throw "Expected exactly one $($required.Type) ending with $($required.Name); found $count."
    }
}
$containerApps = @(
    az resource list --resource-group $ResourceGroup `
        --resource-type "Microsoft.App/containerApps" -o json | ConvertFrom-Json
)
$containerAppCount = $containerApps.Count
if ($containerAppCount -ne 1) {
    throw "Expected exactly one Container App; found $containerAppCount."
}
$regionalResources = az resource list --resource-group $ResourceGroup `
    --query "[?location != null && location != 'global'].{name:name,location:location}" -o json |
    ConvertFrom-Json
$outsideRegion = @($regionalResources | Where-Object { $_.location.Replace(" ", "").ToLowerInvariant() -ne $Location })
if ($outsideRegion.Count -gt 0) {
    throw "Found regional resources outside ${Location}: $($outsideRegion.name -join ', ')."
}

if (-not (Test-Path "Dockerfile") -or -not (Test-Path "scripts\seed_demo.py")) {
    throw "The Full-Stack Phase 3 image boundary is incomplete."
}
if (-not $ImageTag) {
    $ImageTag = "phase3-" + (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
}
if ($ImageTag -notmatch "^phase3-[0-9]{14}$") {
    throw "Use an immutable Phase 3 tag in the form phase3-yyyyMMddHHmmss."
}

$principalId = az ad signed-in-user show --query id -o tsv
$deploymentName = "phase3-platform-$($ImageTag.Substring(7))"

Write-Host "Primary and only deployment region: Sweden Central"
Write-Host "Azure region code: swedencentral"
Write-Host "Validating the preserved foundation and reproducible RBAC through Bicep..."
az deployment group create `
    --name $deploymentName `
    --resource-group $ResourceGroup `
    --template-file "infra\main.bicep" `
    --parameters "@infra\main.parameters.json" `
        deployerPrincipalId=$principalId `
        deployContainerRegistry=true `
        deployContainerApp=false | Out-Null

$outputs = az deployment group show --resource-group $ResourceGroup --name $deploymentName `
    --query properties.outputs -o json | ConvertFrom-Json
$foundryEndpoint = $outputs.foundryProjectEndpoint.value
$searchEndpoint = $outputs.searchEndpoint.value
$registryName = $outputs.containerRegistryName.value
$registryServer = $outputs.containerRegistryLoginServer.value

$existingTags = @(
    az acr repository show-tags --name $registryName `
        --repository "ai-proposal-factory" -o json | ConvertFrom-Json
)
if ($existingTags -contains $ImageTag) {
    throw "Image tag $ImageTag already exists; refusing to overwrite an immutable deployment tag."
}

Write-Host "Configuring exactly three Foundry Agents with the Phase 3 Proposal Writer contract..."
$agentJson = python scripts\configure_agents.py `
    --endpoint $foundryEndpoint `
    --model "gpt-5-mini" | Out-String
if ($LASTEXITCODE -ne 0) { throw "Foundry agent configuration failed." }
$agentResult = $agentJson | ConvertFrom-Json

Write-Host "Creating or updating the existing keyless Search index..."
python scripts\configure_search.py --endpoint $searchEndpoint
if ($LASTEXITCODE -ne 0) { throw "Search index configuration failed." }

$image = "$registryServer/ai-proposal-factory:$ImageTag"
Write-Host "Building the Phase 3 image remotely in the existing Azure Container Registry..."
az acr build --registry $registryName --image "ai-proposal-factory:$ImageTag" --no-logs .

$requirementsAgentId = ($agentResult.agents | Where-Object name -eq "requirements-analyst").id
$proposalWriterAgent = $agentResult.agents | Where-Object name -eq "proposal-writer"
$proposalWriterAgentId = $proposalWriterAgent.id
$riskReviewerAgentId = ($agentResult.agents | Where-Object name -eq "risk-reviewer").id
if (-not $requirementsAgentId -or -not $proposalWriterAgentId -or -not $riskReviewerAgentId) {
    throw "The three required exact agent IDs were not returned."
}

Write-Host "Deploying the immutable image to the existing single public Container App..."
$appDeploymentName = "phase3-app-$($ImageTag.Substring(7))"
az deployment group create `
    --name $appDeploymentName `
    --resource-group $ResourceGroup `
    --template-file "infra\main.bicep" `
    --parameters "@infra\main.parameters.json" `
        deployerPrincipalId=$principalId `
        deployContainerRegistry=true `
        deployContainerApp=true `
        containerImage=$image `
        requirementsAgentId=$requirementsAgentId `
        proposalWriterAgentId=$proposalWriterAgentId `
        riskReviewerAgentId=$riskReviewerAgentId | Out-Null

$appDeployment = az deployment group show --resource-group $ResourceGroup `
    --name $appDeploymentName --query properties.outputs -o json | ConvertFrom-Json
$applicationUrl = $appDeployment.containerAppUrl.value

$env:AZURE_CLIENT_ID = $appDeployment.managedIdentityClientId.value
$env:AZURE_STORAGE_ACCOUNT_NAME = $appDeployment.storageAccountName.value
$env:AZURE_STORAGE_BLOB_ENDPOINT = $appDeployment.blobEndpoint.value
$env:AZURE_STORAGE_TABLE_ENDPOINT = $appDeployment.tableEndpoint.value
$env:AZURE_SEARCH_ENDPOINT = $appDeployment.searchEndpoint.value
$env:AZURE_SEARCH_INDEX_NAME = "knowledge-items"
$env:FOUNDRY_PROJECT_ENDPOINT = $appDeployment.foundryProjectEndpoint.value
$env:FOUNDRY_MODEL_DEPLOYMENT = "gpt-5-mini"
$env:DEMO_SEED_VERSION = "v1"

Write-Host "Re-running deterministic seeding without deleting existing Phase 2 state..."
python scripts\seed_demo.py
if ($LASTEXITCODE -ne 0) { throw "Synthetic data seeding failed." }

Write-Host "Indexing the complete Phase 3 Knowledge Library corpus..."
python scripts\configure_search.py --endpoint $searchEndpoint --data-dir "data\knowledge.json"
if ($LASTEXITCODE -ne 0) { throw "Knowledge indexing failed." }

if (-not $SkipSmokeTest) {
    Write-Host "Running the focused final live Phase 3 smoke test..."
    python tests\integration\live_smoke.py --base-url $applicationUrl
    if ($LASTEXITCODE -ne 0) { throw "Final live Phase 3 smoke test failed." }
}

$revision = az containerapp revision list --resource-group $ResourceGroup `
    --name "ca-professional-services-04" `
    --query "[?properties.active].{name:name,createdTime:properties.createdTime,healthState:properties.healthState}" `
    -o json | ConvertFrom-Json
$digest = az acr manifest show-metadata --registry $registryName `
    --name "ai-proposal-factory:$ImageTag" --query digest -o tsv

Write-Host "Phase 3 deployment ready at $applicationUrl"
Write-Output ([pscustomobject]@{
    applicationUrl = $applicationUrl
    image = $image
    imageDigest = $digest
    revision = $revision
    requirementsAgentId = $requirementsAgentId
    proposalWriterAgentId = $proposalWriterAgentId
    proposalWriterVersion = $proposalWriterAgent.version
    riskReviewerAgentId = $riskReviewerAgentId
} | ConvertTo-Json -Depth 5)
