# Manufacturing AI Operations Command Center — Squad Project Brief

## Mission
Build and deploy a polished, functional, public customer-demo web application for the Manufacturing industry using GitHub Copilot CLI and Squad. Demonstrate a three-phase implementation process, with a hard stop and handoff after each phase. Use only fictional synthetic data. The app must be functional, not a static mockup.

## Azure scope and constraints
- Existing resource group: `rg-manufacturing-01`. Inspect it and its actual location with `az group show`; expected location is `swedencentral` (Sweden Central). Do not create a replacement resource group or modify unrelated resources.
- Preferred deployment region for all resources: `swedencentral`. If a required service, SKU, model deployment, or quota is unavailable there, try `northeurope` (North Europe), then `westeurope` (West Europe), **for only the blocked resource or a tightly coupled set**. Validate service/model availability and quota before attempting. Document the actual region for every resource and any cross-region AI data processing. Do not repeatedly retry capacity failures. Keep the existing resource group in Sweden Central even if some resources are deployed elsewhere.
- Use the currently authenticated Azure subscription only. Check subscription and tenant and print a concise inventory before provisioning. Do not change subscription without user authorization.
- Public HTTPS website with anonymous access (Azure Container Apps external ingress, or App Service if justified). **No VNet, private endpoints, private DNS, VPN, APIM, internal-only ingress, or other private networking.**
- Public demo means anyone with the URL can access it. Use only synthetic data, avoid customer secrets, use reasonable input limits and basic abuse/cost safeguards. No user sign-in required.
- Prefer managed identity and RBAC; do not commit secrets. Use Bicep IaC. Keep Azure services minimal, low-cost and easy to deploy; do not introduce Azure AI Search, Cosmos DB, IoT Hub, Event Hubs, or Key Vault unless a demonstrated requirement makes them essential. A small Azure Storage account for persistent demo state is acceptable.
- Use Microsoft Foundry with **two actual deployed, callable runtime AI agents**, not only labels in the UI. Prefer a supported Foundry agent service/API/SDK with a model deployment available in the chosen region; verify actual availability. Use a supported alternative Foundry agent deployment mode if needed and document it. Do not silently replace live AI with mock responses.
- Name resources consistently with manufacturing and `01`, respecting Azure naming constraints. Name the Foundry project clearly, preferably `manufacturing-operations-01` (or the closest supported name), and record its portal link.

## Business story
A fictional manufacturer operates multiple production lines. Operators struggle with unplanned downtime, equipment faults, production target misses and inconsistent maintenance decisions. The application turns machine telemetry and incident notes into prioritized investigations and actionable, human-reviewed maintenance plans.

## Core user journey (must work on deployed URL)
1. Open a modern **Operations Dashboard** with KPI cards for overall equipment effectiveness (OEE), availability, performance, quality, downtime minutes, and production output versus target. Use plausible calculated values, not arbitrary contradictory figures.
2. Browse **Factories & Production Lines** and filter by site, line and health status. Show machine cards or table with last maintenance, status, utilization and current alert.
3. Open **Incidents** with severity, affected equipment, downtime, timestamp, impact and state. Seed a high-priority, compelling incident at the top for demos.
4. Select an incident and click **Investigate with AI**. Call the actual Foundry **Downtime Investigation Agent** with incident details, recent synthetic telemetry and operator notes. Return structured suspected causes, evidence, confidence/uncertainty, business impact, and questions. Clearly label hypotheses, not verified diagnoses.
5. Click **Generate Maintenance Plan**. Call the actual Foundry **Maintenance Advisor Agent** with the incident and investigation results. Return prioritized actions, owner roles, urgency, expected benefits, required safety checks and preventive steps. Do not issue autonomous machine commands or assert safety-critical procedures without qualified review.
6. Review, edit and save action items, approve the maintenance plan, and change incident state (Open → Investigating → Action Planned → Resolved). Human approval is mandatory before a plan is marked approved.
7. Open **Activity History** to show a timestamped trail of investigation, generated plan, edits, approvals and state changes.
8. Refresh the browser and confirm the saved incident/action state persists.

## Functional requirements
- Frontend: React + TypeScript + Vite, professional responsive manufacturing command-center design, clear navigation, accessible contrast, real loading/error/empty states, charts and readable equipment/incident detail panels. Avoid a generic admin template or raw JSON display.
- Backend: lightweight Python FastAPI (or a compelling simpler equivalent). One public Container App serving both UI and API to avoid CORS complexity. Use clean separation of UI, API, AI services, persistence and seed data.
- Synthetic demo dataset: at least 3 fictional factory sites, 6 production lines, 18 machines, 20 incidents, and 30+ recent telemetry snapshots, with believable timestamps, production targets, fault codes, operator notes, and different incident causes (bearing vibration, temperature spikes, conveyor jams, reject rate, pressure instability, etc.). Seed deterministically; never overwrite human changes on restart.
- State persistence: use Azure Blob Storage or Azure Table Storage with an explicit, simple concurrency approach. Do not rely solely on in-memory state or ephemeral container filesystem. Keep reads/writes robust across restarts. No need for multi-user enterprise workflows.
- Foundry agent 1: `Downtime Investigation Agent` — analyze incident, telemetry and notes, distinguish observations from hypotheses, output a short structured explanation and ranked likely causes.
- Foundry agent 2: `Maintenance Advisor Agent` — produce human-reviewable, prioritized maintenance and prevention actions using the first agent's output and incident context.
- Agents must be visible/identifiable in the Microsoft Foundry portal and callable from the deployed app. Store project/agent identifiers in configuration, not hardcoded secrets. Show real response, model/agent attribution and friendly failures; do not silently fake success. Limit tokens and retries for demo cost control.
- UI includes a small `AI agents` information section explaining the two roles and their actual connectivity/status without exposing sensitive config.
- Activity log must record meaningful actions. Expose a lightweight health endpoint.
- Optional: simple Markdown export of a maintenance plan, if easy. Avoid PDF generation, uploads, real-time streaming, external systems and advanced RAG for this prototype.

## Squad development team — strictly limited
Cast **at most three Squad specialist agents** (plus any required Squad coordinator):
1. **Azure & AI**: Bicep, Azure provisioning, Foundry model/agents, identity and runtime connection.
2. **Fullstack**: React, FastAPI, seed data, persistence, UI and API.
3. **Integration**: lightweight validation, deployment handoff, critical bug fixes and documentation.
Do not spawn additional architecture, security, design, QA, DevOps, research or sub-agents. Avoid parallel changes to the same files. Reuse the same agents across phases. These Squad agents are development roles and are separate from the two Foundry runtime AI agents.

## Three phases — strict stop gates
### PHASE 1 — Infrastructure and Foundry ONLY
- Inspect Azure account/subscription, RG location, service availability, and existing resources.
- Define and deploy minimal Bicep infrastructure: hosting foundation, storage for persistent state, observability if inexpensive, and a Foundry-capable AI resource/project plus available model deployment.
- Create/configure the **two actual Foundry agents** with concise domain instructions and a reliable structured response format. Confirm agent IDs and perform a minimal live invocation of each, if supported. Handle identity/permissions and app configuration.
- Document exact resource names, regions, resource group, Foundry project, agent names/IDs, selected model, quota issues and any fallback. Save a `PHASE-1-HANDOFF.md` and required config template (no secrets).
- **STOP. Do not build the application, seed the app dataset or start Phase 2.** Show status and any blockers.

### PHASE 2 — Complete app, real AI integration and public deployment ONLY
- Implement the application and all core user journey screens/API endpoints with realistic synthetic data, working controls, persisted state and real calls to both Foundry agents.
- Deploy to Azure Container Apps with public external HTTPS ingress and anonymous access. Ensure SPA routing works on refresh, backend endpoints work, and the public FQDN is returned. Use Bicep for resource definitions; Azure CLI can perform deployment operations.
- Make one real live AI call from the deployed app/API to each Foundry agent and confirm non-empty structured responses; if blocked by capacity/auth, report explicitly and resolve rather than misrepresenting a mock as live AI.
- Save `PHASE-2-HANDOFF.md` with live URL, services, supported demo path, and known issues.
- **STOP. Do not start Phase 3.**

### PHASE 3 — Lightweight validation and demo handoff ONLY
- Validate the actual deployed path: dashboard → incident → AI investigation → maintenance plan → edit/save → approve → change state → history → refresh persistence.
- Perform only smoke checks (health, app loads, API basic operations, 1 live invocation per Foundry agent if Phase 2 evidence is stale or incomplete). No broad test suites, load tests, penetration tests, complex CI/CD, or refactoring.
- Fix only critical functional failures and obvious customer-facing UI issues; redeploy only if needed. Do not create additional Azure services or change architecture.
- Create `README.md`, `ARCHITECTURE.md`, `DEMO-GUIDE.md` with a 2-minute customer journey, `DEMO-EXTENSIONS.md` with 6–8 small optional enhancements, and `FINAL-HANDOFF.md` with verified public URL, Foundry portal navigation, region mapping, evidence of real AI, and known limitations.
- Do not claim success without checking the public app and real agent responses.
- **STOP and summarize.**

## Implementation principles
- Optimize for a compelling 3-phase GitHub Copilot CLI + Squad screen recording, minimal agent chatter and fast turnaround.
- Never perform a phase beyond the one explicitly authorized in the current user prompt. At every gate provide a concise summary: created files, Azure resources, Foundry agents, verification, issues, and next phase.
- Avoid asking unnecessary questions; make reasonable engineering decisions and document them. Seek approval before destructive operations, unexpected paid/high-cost SKUs, subscription changes, or any broad permission elevation.
- Keep code modular and understandable, with a short `.gitignore` and no committed environment secrets.
- Keep existing unrelated resources untouched. Do not delete the resource group. If region failover is required, explain it in the handoff.
- Keep all customer data synthetic. Clearly label this as a demonstration, not a real industrial safety or predictive maintenance system.

## Definition of done
A customer can open the public URL, see realistic manufacturing operations data, investigate an incident using a **real Foundry agent**, obtain a **real Foundry maintenance recommendation**, edit/approve a plan, and revisit the persisted activity trail. The Azure resources are documented and represented in Bicep. All three phase handoffs and the final demo guide exist.
