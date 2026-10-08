# ─────────────────────────────────────────────────────────────────────────────
# Create the ClaimProcessing multi-agent workflow in Microsoft AI Foundry.
#
# Builds four agents in the Foundry project and wires them into one orchestrator
# that delegates via connected-agent tools and can consult the Microsoft Learn
# MCP server:
#
#     claim-orchestrator (gpt-4.1-mini)
#        ├── connected: intake          → claim-intake-agent  (gpt-5-mini)
#        ├── connected: fraud_risk       → fraud-risk-agent    (gpt-5-mini)
#        ├── connected: claim_assessor   → claim-assessor      (gpt-5-mini)
#        └── mcp:        microsoft_learn  → https://learn.microsoft.com/api/mcp
#
# Idempotent: if an agent with the same name exists it is reused (updated).
# Connected-agent + MCP tools require a tool-capable model on the orchestrator
# (gpt-4.1-mini) — gpt-5-mini only supports Responses-API tools on this endpoint.
#
# Usage:
#   ./create-workflow.ps1 -ProjectEndpoint "https://<acct>.services.ai.azure.com/api/projects/<proj>"
#
# Auth: uses your `az login` token for resource https://ai.azure.com.
# ─────────────────────────────────────────────────────────────────────────────
param(
    [Parameter(Mandatory = $true)] [string] $ProjectEndpoint,
    [string] $ApiVersion         = "2025-05-15-preview",
    [string] $OrchestratorModel  = "gpt-4.1-mini",
    [string] $SpecialistModel    = "gpt-5-mini",
    [string] $McpServerLabel     = "microsoft_learn",
    [string] $McpServerUrl       = "https://learn.microsoft.com/api/mcp"
)

$ErrorActionPreference = "Stop"
$ep = $ProjectEndpoint.TrimEnd('/')

function Get-Headers {
    $token = (az account get-access-token --resource "https://ai.azure.com" --query accessToken -o tsv)
    if (-not $token) { throw "Could not get an Azure token. Run 'az login' first." }
    return @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
}

# Create or reuse an agent by name (assistants are not unique by name, so we list).
function New-Agent {
    param([string]$Name, [string]$Model, [string]$Instructions, [array]$Tools)

    $headers = Get-Headers
    $existing = (Invoke-RestMethod -Uri "$ep/assistants?api-version=$ApiVersion&limit=100" -Headers $headers -Method Get).data |
        Where-Object { $_.name -eq $Name } | Select-Object -First 1

    $payload = @{ model = $Model; name = $Name; instructions = $Instructions }
    if ($Tools) { $payload.tools = $Tools }
    $body = $payload | ConvertTo-Json -Depth 12

    if ($existing) {
        $r = Invoke-RestMethod -Uri "$ep/assistants/$($existing.id)?api-version=$ApiVersion" -Headers $headers -Method Post -Body $body
        Write-Host "Updated $Name -> $($r.id)"
    }
    else {
        $r = Invoke-RestMethod -Uri "$ep/assistants?api-version=$ApiVersion" -Headers $headers -Method Post -Body $body
        Write-Host "Created $Name -> $($r.id)"
    }
    return $r.id
}

$intakeInstr = @"
You are a claims intake specialist for Fidelis Insurance. Given a raw insurance claim (JSON or free text), extract and validate the key fields. Check completeness and obvious data-quality issues (missing fields, future incident dates, non-positive amounts). Return ONLY a JSON object of the form {"fields":{"claimantName":string|null,"policyNumber":string|null,"amount":number|null,"incidentDate":"YYYY-MM-DD"|null,"description":string|null},"issues":[string],"complete":true|false}. Output no prose.
"@

$fraudInstr = @"
You are an insurance fraud and risk analyst for Fidelis Insurance. Given a claim and its policy context, assess fraud and risk signals such as: late submission relative to the incident date, claim amount suspiciously close to the coverage limit, suspiciously round amounts, incident-date anomalies, and description inconsistencies. Return ONLY a JSON object of the form {"riskScore":0-100,"riskLevel":"Low"|"Medium"|"High","flags":[string],"rationale":string}. Output no prose.
"@

$assessorInstr = @"
You are an insurance claim assessment assistant for Fidelis Insurance. Assess the claim against the policy and return ONLY a JSON object of the form {"recommendation":"Approve"|"Reject"|"Review","confidenceScore":0.0-1.0,"rationale":string}. Your output is advisory only. Do not include prose outside the JSON.
"@

$orchInstr = @"
You are the claim-processing orchestrator for Fidelis Insurance. For each submitted claim you coordinate specialist agents and produce ONE final structured recommendation.

Process:
1. Call the 'intake' tool to extract and validate the claim fields.
2. Call the 'fraud_risk' tool to assess fraud and risk signals.
3. Call the 'claim_assessor' tool to evaluate policy coverage and get an approve/reject recommendation.
4. If you need external regulatory or insurance-domain guidance, use the Microsoft Learn documentation tool.

Then synthesize everything into ONE final JSON object (output ONLY this JSON, no prose):
{"recommendation":"Approve|Reject|Review","confidence":0.0-1.0,"riskLevel":"Low|Medium|High","reasons":[string],"subAgentSummary":{"intake":string,"fraud":string,"assessment":string}}

The deterministic policy engine and the human adjuster remain the authoritative decision-makers; your output is advisory.
"@

Write-Host "== Creating specialist agents =="
$intakeId   = New-Agent -Name "claim-intake-agent" -Model $SpecialistModel -Instructions $intakeInstr
$fraudId    = New-Agent -Name "fraud-risk-agent"   -Model $SpecialistModel -Instructions $fraudInstr
$assessorId = New-Agent -Name "claim-assessor"     -Model $SpecialistModel -Instructions $assessorInstr

Write-Host "== Creating orchestrator with connected agents + MCP =="
$tools = @(
    @{ type = "connected_agent"; connected_agent = @{ id = $intakeId;   name = "intake";         description = "Extracts and validates claim fields from raw claim data. Use first." } },
    @{ type = "connected_agent"; connected_agent = @{ id = $fraudId;    name = "fraud_risk";     description = "Assesses fraud and risk signals for a claim and returns a risk score and flags." } },
    @{ type = "connected_agent"; connected_agent = @{ id = $assessorId; name = "claim_assessor"; description = "Evaluates a claim against its policy and recommends approve, reject, or review." } },
    @{ type = "mcp";             server_label = $McpServerLabel; server_url = $McpServerUrl }
)
$orchId = New-Agent -Name "claim-orchestrator" -Model $OrchestratorModel -Instructions $orchInstr -Tools $tools

$result = [ordered]@{
    projectEndpoint = $ep
    apiVersion      = $ApiVersion
    mcp             = @{ serverLabel = $McpServerLabel; serverUrl = $McpServerUrl }
    agents          = [ordered]@{
        orchestrator  = $orchId
        intake        = $intakeId
        fraudRisk     = $fraudId
        claimAssessor = $assessorId
    }
}
$json = $result | ConvertTo-Json -Depth 8
$outFile = Join-Path $PSScriptRoot "workflow.json"
$json | Out-File -FilePath $outFile -Encoding utf8
Write-Host "`nWorkflow created. IDs written to $outFile"
Write-Host $json
