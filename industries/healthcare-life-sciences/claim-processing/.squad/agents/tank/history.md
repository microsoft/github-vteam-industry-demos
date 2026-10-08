# Project Context

- **Project:** ClaimProcessing
- **Created:** 2026-07-23

## Core Context

Agent Tank (Azure Architect) initialized and ready for work. Owns Azure infra,
infrastructure-as-code (Bicep), and Microsoft AI Foundry resource provisioning.

## Recent Updates

📌 Team initialized on 2026-07-23 for @erydrn (Fidelis partnership build).
⚠️ Azure credentials will be required before any live provisioning — not yet provided.

## Learnings

Initial setup complete.

### 2026-07-23 — Full IaC authored (`azd up`)
- Built `infra/` (Bicep) + `azure.yaml`: AI Foundry (AIServices S0) account +
  project + gpt-4o, App Service (Linux, .NET 9) with user-assigned MI,
  Log Analytics + App Insights, least-privilege RBAC to Foundry.
- `claim-assessor` agent created via postprovision hook (Agents API); ID pushed
  to the web app as `Foundry__AgentId`.
- Foundry resource type: `Microsoft.CognitiveServices/accounts` kind `AIServices`;
  projects + deployments are child resources. `disableLocalAuth: true` (Entra only).
- `az bicep build` passes (exit 0); 2025-06-01 API emits harmless BCP081 warnings.
- Still needs Azure creds to run `azd up`. Switch owns wiring the app to the real agent.
