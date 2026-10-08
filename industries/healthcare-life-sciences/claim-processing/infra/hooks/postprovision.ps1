#!/usr/bin/env pwsh
# ─────────────────────────────────────────────────────────────────────────────
# ClaimProcessing — postprovision hook (Tank + Switch)
#
# Runs automatically after `azd provision`. Creates (or updates) the
# claim-assessment agent in the Foundry project, then stores its ID as the azd
# env value FOUNDRY_AGENT_ID and pushes it to the web app as Foundry__AgentId.
#
# Idempotent: re-running reuses the existing agent (matched by name).
# ─────────────────────────────────────────────────────────────────────────────
$ErrorActionPreference = 'Stop'

Write-Host '==> ClaimProcessing postprovision: configuring Foundry agent'

# Pull provisioning outputs from the azd environment.
$values = azd env get-values | ConvertFrom-StringData
$projectEndpoint = $values.AZURE_AI_PROJECT_ENDPOINT
$modelName       = $values.FOUNDRY_MODEL_NAME
$webAppName      = $values.SERVICE_WEB_NAME
$resourceGroup   = $values.AZURE_RESOURCE_GROUP

if ([string]::IsNullOrWhiteSpace($projectEndpoint)) {
  throw 'AZURE_AI_PROJECT_ENDPOINT is empty — did azd provision succeed?'
}
if ([string]::IsNullOrWhiteSpace($modelName)) { $modelName = 'gpt-4o' }

$agentName    = 'claim-assessor'
$instructions = @'
You are the claim-assessment agent for a Fidelis insurance claim-processing portal.
Given a claim and its policy, you do two things:
1. Extract structured fields from an attached claim document (claimantName, amount,
   incidentDate in ISO-8601, description) when a document is provided.
2. Recommend a decision as strict JSON:
   { "recommendation": "Approve|Reject|Review", "confidenceScore": <0.0-1.0>,
     "rationale": "<concise explanation>" }.
Your output is ADVISORY ONLY. The deterministic PolicyEngine is the authoritative
approve/reject decision-maker. Never invent policy terms; base reasoning only on the
claim and policy provided.
'@

# ── Get an Entra token for the Foundry data plane (AI Services audience) ──────
Write-Host '    acquiring access token...'
$token = az account get-access-token --resource 'https://ai.azure.com' --query accessToken -o tsv
if ([string]::IsNullOrWhiteSpace($token)) {
  throw 'Failed to acquire an access token. Run `az login` and retry `azd provision`.'
}
$headers = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }
$apiVersion = '2025-05-01'
$base = $projectEndpoint.TrimEnd('/')

# ── Reuse an existing agent with the same name, else create one ──────────────
$agentId = $null
try {
  $list = Invoke-RestMethod -Method Get -Uri "$base/assistants?api-version=$apiVersion" -Headers $headers
  $existing = $list.data | Where-Object { $_.name -eq $agentName } | Select-Object -First 1
  if ($existing) {
    $agentId = $existing.id
    Write-Host "    reusing existing agent '$agentName' ($agentId)"
  }
} catch {
  Write-Host "    (could not list agents yet: $($_.Exception.Message))"
}

if (-not $agentId) {
  Write-Host "    creating agent '$agentName'..."
  $body = @{
    model        = $modelName
    name         = $agentName
    instructions = $instructions
  } | ConvertTo-Json -Depth 5
  $created = Invoke-RestMethod -Method Post -Uri "$base/assistants?api-version=$apiVersion" -Headers $headers -Body $body
  $agentId = $created.id
  Write-Host "    created agent ($agentId)"
}

# ── Persist the agent ID: azd env + live web app setting ─────────────────────
azd env set FOUNDRY_AGENT_ID $agentId | Out-Null

if (-not [string]::IsNullOrWhiteSpace($webAppName) -and -not [string]::IsNullOrWhiteSpace($resourceGroup)) {
  Write-Host '    updating web app setting Foundry__AgentId...'
  az webapp config appsettings set `
    --name $webAppName --resource-group $resourceGroup `
    --settings "Foundry__AgentId=$agentId" --output none
}

Write-Host "==> Foundry agent ready: $agentId"
