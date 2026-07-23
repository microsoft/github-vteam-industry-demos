#!/usr/bin/env sh
# ─────────────────────────────────────────────────────────────────────────────
# ClaimProcessing — postprovision hook (Tank + Switch), POSIX/bash version.
# Mirrors postprovision.ps1: creates/reuses the Foundry claim-assessment agent
# and stores its ID in azd env (FOUNDRY_AGENT_ID) + the web app (Foundry__AgentId).
# Requires: az, curl, jq.
# ─────────────────────────────────────────────────────────────────────────────
set -eu

echo '==> ClaimProcessing postprovision: configuring Foundry agent'

eval "$(azd env get-values | sed 's/^/export AZDVAL_/')" 2>/dev/null || true
PROJECT_ENDPOINT="$(azd env get-value AZURE_AI_PROJECT_ENDPOINT 2>/dev/null || echo '')"
MODEL_NAME="$(azd env get-value FOUNDRY_MODEL_NAME 2>/dev/null || echo 'gpt-4o')"
WEBAPP_NAME="$(azd env get-value SERVICE_WEB_NAME 2>/dev/null || echo '')"
RESOURCE_GROUP="$(azd env get-value AZURE_RESOURCE_GROUP 2>/dev/null || echo '')"

if [ -z "$PROJECT_ENDPOINT" ]; then
  echo 'ERROR: AZURE_AI_PROJECT_ENDPOINT is empty — did azd provision succeed?' >&2
  exit 1
fi
[ -z "$MODEL_NAME" ] && MODEL_NAME='gpt-4o'

AGENT_NAME='claim-assessor'
API_VERSION='2025-05-01'
BASE="${PROJECT_ENDPOINT%/}"

INSTRUCTIONS='You are the claim-assessment agent for a Fidelis insurance claim-processing portal. Given a claim and its policy, you: (1) extract structured fields from an attached claim document (claimantName, amount, incidentDate ISO-8601, description) when provided; (2) recommend a decision as strict JSON: {"recommendation":"Approve|Reject|Review","confidenceScore":<0.0-1.0>,"rationale":"<concise explanation>"}. Your output is ADVISORY ONLY. The deterministic PolicyEngine is the authoritative approve/reject decision-maker. Never invent policy terms.'

echo '    acquiring access token...'
TOKEN="$(az account get-access-token --resource 'https://ai.azure.com' --query accessToken -o tsv)"
if [ -z "$TOKEN" ]; then
  echo 'ERROR: could not acquire token. Run `az login` and retry.' >&2
  exit 1
fi

echo '    looking up existing agent...'
AGENT_ID="$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/assistants?api-version=$API_VERSION" \
  | jq -r --arg n "$AGENT_NAME" '.data[]? | select(.name==$n) | .id' | head -n1)"

if [ -z "$AGENT_ID" ] || [ "$AGENT_ID" = 'null' ]; then
  echo "    creating agent '$AGENT_NAME'..."
  BODY="$(jq -n --arg m "$MODEL_NAME" --arg n "$AGENT_NAME" --arg i "$INSTRUCTIONS" \
    '{model:$m, name:$n, instructions:$i}')"
  AGENT_ID="$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "$BODY" "$BASE/assistants?api-version=$API_VERSION" | jq -r '.id')"
  echo "    created agent ($AGENT_ID)"
else
  echo "    reusing existing agent '$AGENT_NAME' ($AGENT_ID)"
fi

azd env set FOUNDRY_AGENT_ID "$AGENT_ID" >/dev/null

if [ -n "$WEBAPP_NAME" ] && [ -n "$RESOURCE_GROUP" ]; then
  echo '    updating web app setting Foundry__AgentId...'
  az webapp config appsettings set --name "$WEBAPP_NAME" --resource-group "$RESOURCE_GROUP" \
    --settings "Foundry__AgentId=$AGENT_ID" --output none
fi

echo "==> Foundry agent ready: $AGENT_ID"
