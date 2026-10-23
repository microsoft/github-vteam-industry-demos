# High Tech / Software / ISV — AI Customer Success Command Center

> **Current Phase 3 authorization/status amendment — 2026-10-15, @Christiansava.**
> [Phase 3 is explicitly authorized](.squad/decisions/inbox/copilot-phase3-authorization.md);
> Phase 2 is deployed and its real-UAMI two-agent journey verified complete.
> **Phase 3 COMPLETE at 2026-10-15T14:24:23Z; no active blockers.** The focused
> CSS fix passes live 390/1440 checks. Following its actual ephemeral SQLite reset,
> exactly two new real calls prepared Cobalt's current saved human-reviewed plan;
> save/approve/complete/refresh/history/export all pass. Earlier calls remain
> dated historical evidence. See [PHASE-3-RESULTS.md](PHASE-3-RESULTS.md).
> Preserve this deployment, SQLite override and exactly three specialists; stop.
> Final documentation includes **10 independent optional future extensions**,
> superseding the original 6–8 count below. No further phase, services, resource
> recreation, policy/store work, commits or pushes are authorized. Original
> phase-boundary wording below is historical, not a current Phase 3 prohibition.

> **Accepted Phase 2 authorization / SQLite override — 2026-10-15, @Christiansava.**
> [The latest directive](.squad/decisions/inbox/copilot-phase2-sqlite-authorization.md)
> accepted revised Phase 1 and authorized **Phase 2 only at that time**. It supersedes every
> earlier managed-store requirement/blocker and persistence statement below.
> Use SQLite **inside the application container**, at `/app/data/command-center.sqlite3`;
> bundle ≥20 synthetic accounts and seed missing stable IDs with INSERT OR IGNORE.
> Never overwrite saved edits when the database exists. Store customer context,
> real AI source outputs/provenance, editable plans, approvals and timestamped history.
> SQLite is explicitly **ephemeral**: edits survive browser refresh only while
> the database survives and may be lost on container restart or replacement.
> Prominently disclose this alongside public anonymous access and synthetic data.
> One container, **one replica, one API worker**, public HTTPS, no volumes or
> external store. **Do not attempt Blob, Cosmos, SQL, PostgreSQL, private networking,
> exemptions or policy changes.** Retain existing resources and historical evidence
> untouched. Invoke the two existing real Foundry version-1 agents; no AI mocks.
> Fullstack implements, Azure subsequently builds/deploys, Integration performs
> essential live validation. Phase 2 deployment and managed-identity calls are
> now verified in PHASE-2-RESULTS.md; local implementation alone was never live
> deployment evidence. The original three audit phases below are retained.
> Its historical stop-before-Phase-3 boundary is superseded by the amendment above.

## Mission
Build and deploy a polished, working, publicly reachable customer demonstration of an AI Customer Success & Churn Prevention Command Center for SaaS/ISV businesses. This is a GitHub Copilot CLI + Squad three-phase demo. Execute ONLY the phase explicitly requested in the chat; report results and STOP at each phase boundary. Do not automatically continue.

## Business scenario
A B2B SaaS vendor struggles to spot churn before renewals because customer product adoption, support escalations, contract details and sentiment are scattered. Customer Success Managers need a single customer view, explainable churn signals, and practical AI-generated retention plans with human approval. Demonstrate measurable ARR-at-risk and next-best actions without pretending that a heuristic score is a trained predictive model.

## Development team — STRICT LIMIT
Cast at most THREE Squad development agents, with roles:
1. Azure & AI Engineer: Bicep, Azure, Foundry resources and runtime agents, deployment.
2. Full-Stack Engineer: React/TypeScript UI, Python FastAPI API, data.
3. Integration & Validation Engineer: runtime agent calls, integration, smoke checks, documentation.
Do not create extra Squad agents or subteams. Coordinate work sequentially where dependencies exist. The TWO runtime Foundry agents described below are Azure AI assets, NOT Squad team members. Prefer direct implementation over elaborate planning ceremonies. No deep testing, extensive research, or unnecessary refactors.

## Fixed environment
- Existing resource group: `rg-high-tech-software-isv-01` — REUSE; do not recreate or delete.
- Preferred location: `swedencentral`, matching existing resource group.
- Local working directory: `C:\Users\savacristian\Desktop\GitHub Copilot Initiative\High Tech Software ISV` (verify using PowerShell; don't assume drive if different).
- All Azure resources must be in the authenticated development subscription and preferably Sweden Central.
- Before changes inspect `az account show`, `az group show -n rg-high-tech-software-isv-01`, relevant service quotas and existing resources. Never switch subscriptions silently. Report subscription name/ID and proposed resource names.
- Fallback region: `northeurope` first, then `westeurope`, ONLY for services/deployments that cannot be provisioned in Sweden Central because of verified SKU/model/capacity limitations. Verify availability before provisioning. A Foundry model deployment may require a fallback region; keep other resources in Sweden Central when possible. Document cross-region endpoints and latency considerations. Do not claim cross-region support without verifying it.
- Use a project/Foundry naming convention related to the resource group, e.g. `foundry-high-tech-software-isv-01` or the nearest valid unique name.
- Reuse safe existing resources where appropriate, but never modify unrelated workloads. Use unique deterministic names for globally unique resources.
- Tags: `industry=high-tech-software-isv`, `demo=customer-success-command-center`, `managed-by=copilot-squad`.

## Architecture: deliberately simple
- Frontend: React + TypeScript + Vite; professional SaaS dashboard styling, responsive desktop-first layout.
- Backend: Python FastAPI, with clear service modules for data, health scoring and Foundry integration.
- Hosting: one Azure Container App serving the built frontend and API on a single publicly accessible HTTPS hostname (prefer a single container/image); public external ingress, anonymous browser access, no login required for this synthetic-data demo.
- Azure Container Registry (Basic) for image if needed; Azure Container Apps environment; Log Analytics only as needed for ACA.
- Persistence: **superseded by the dated override above**. Original audit text: keep simple. Prefer Azure Blob Storage JSON snapshots for seeded accounts, saved plans and action approvals, or another minimal reliable managed store if demonstrably easier. Do NOT add Cosmos DB, SQL, Redis, AI Search, Key Vault or extra networking solely for architectural completeness. Use managed identity/RBAC where practical; no secrets committed to source control.
- AI: Microsoft Foundry project with two REAL deployed runtime agents and a supported model deployment. Select a model that is actually available for the subscription and region, rather than assuming a specific SKU. Use supported current Azure AI/Foundry SDK or API and document the version and endpoint.
- Infrastructure as Code: Bicep files under `infra/`, with clear deployment parameters. CLI may bootstrap and deploy, but source-controlled IaC must represent the created core infrastructure.
- No VNet, private endpoints, private DNS, VPN, APIM, complex auth, or enterprise security perimeter. Public website and public service endpoints are intended for the synthetic demo. Configure CORS appropriately or avoid it by serving frontend/API from one origin.
- Minimize cloud cost and number of resources. Explain any deviation from this architecture.

## Microsoft Foundry runtime agents — EXACTLY TWO
### Agent 1: Customer Churn Risk Analyst
Given an account's product usage, renewal timing, support cases, sentiment, adoption trend and account context, return structured JSON with: risk level, evidence-based explanation, top risk drivers, positive signals, renewal concerns, and confidence/limitations. Do not invent customer facts. Use input evidence only.

### Agent 2: Retention Strategy Advisor
Given account context and risk analysis, return structured JSON with: recommended next-best actions (priority, owner role, suggested timeframe, rationale), a concise 30-day customer success plan, renewal talking points, and a draft outreach email. Avoid guaranteed churn predictions.

Provision/configure both in Foundry in Phase 1; document agent IDs, project endpoint, model deployment and region in non-secret configuration/docs. The Phase 2 application must invoke these REAL agents through the backend. If Foundry deployment is blocked, report exact issue, try verified region/model fallback, and do not falsely label local templated output as Foundry AI. A clearly labelled demo-mode fallback is acceptable ONLY for resilience and must be visually distinguishable.

## Demo data
Seed automatically at least 20 fictional B2B SaaS customer accounts, spanning healthy, watchlist and high-risk segments. Use invented names and fictional contacts. Include ARR, plan, seats licensed/active, feature adoption, weekly active usage trend, renewal date, support ticket count/severity, CSAT/sentiment, customer success owner, last touchpoint, and recent activity. Add at least 3 detailed realistic accounts with contrasting risk drivers (low adoption, support escalation, and healthy expansion). Seed data idempotently; never overwrite user edits on routine app restart.

## Main website experiences
1. **Executive Overview**: KPI cards for total ARR, ARR at risk, customers by health, upcoming renewals; charts and attention queue; functional navigation.
2. **Customer Portfolio**: sortable/filterable/searchable customer list with health status, ARR, renewal date, account owner and adoption.
3. **Customer 360 Workspace**: account summary, health score and transparent score breakdown, product adoption/usage trend, support issues, timeline and renewal details.
4. **AI Risk Analysis**: button to run the real Foundry Churn Risk Analyst; visible loading and errors; display evidence, risks and limitations. Clearly distinguish deterministic illustrative health score from agent narrative.
5. **AI Retention Plan**: button to run the real Foundry Retention Strategy Advisor; render actionable recommendations, 30-day plan, renewal talking points and editable outreach email.
6. **Human-in-the-loop**: allow users to accept/complete action recommendations and save plan edits. Persist changes so refresh retains them.
7. **Activity/History**: lightweight per-account event log for AI runs, plan saves and approvals, with timestamps.
8. **Export**: download a customer success plan as Markdown or print-friendly HTML/PDF via browser print. Do not introduce heavyweight PDF infrastructure.

UX: polished, coherent SaaS product aesthetic; clear empty/error/loading states; sensible realistic charts; accessible contrast; usable on typical demo laptop. No fake clickable buttons or hard-coded AI results disguised as live. Include a small banner indicating fictional demo data and public anonymous access.

## Three mandatory execution phases

### PHASE 1 — Azure infrastructure and Foundry setup ONLY
1. Inspect authenticated Azure subscription, resource group location, permissions, existing resources and relevant regional capacity.
2. Cast only the 3 Squad development roles above. Decide minimal naming and architecture.
3. Create Bicep IaC and provision necessary core Azure resources: ACR if needed, ACA environment, minimal storage/logging, Foundry project/model and TWO configured runtime agents. Provision a placeholder Container App only if it materially helps Phase 2; do not build full website yet.
4. Configure managed identity/permissions and document non-secret IDs/endpoints. Validate both agents exist in Foundry and can be invoked with a minimal synthetic test where supported.
5. Write `PHASE-1-RESULTS.md` with subscription, locations, created resource names, agent names/IDs, validation evidence, blockers and exact next steps. Include Azure Portal links if obtainable.
6. STOP. Do not implement the application or begin Phase 2.

### PHASE 2 — Application implementation and public deployment ONLY
1. Build the complete React/TypeScript + FastAPI app and seed fictional customer data.
2. Connect backend to the TWO deployed Foundry agents, with real structured requests and responses. Add practical timeout/error handling and visible AI status.
3. Implement working dashboard, portfolio, Customer 360, risk analysis, retention plan, edits/approvals, lightweight history and export.
4. Containerize, deploy to ACA with public external ingress and HTTPS; persist edits in container-local ephemeral SQLite under the dated override. One replica/worker; no volumes, external stores or private networking.
5. Verify the live public URL opens and the core user journey works, including at least one actual Foundry invocation. If an AI call fails, diagnose and report it instead of substituting an unlabeled mock.
6. Write `PHASE-2-RESULTS.md` with URL, deployment status, functional checklist, agent integration status, issues and demo steps.
7. STOP. Do not begin Phase 3.

### PHASE 3 — Quick validation, fixes and handoff ONLY
1. Run only essential smoke checks: public URL HTTP success, API health, seeded customers visible, one account detail, one real Foundry risk run, one real retention-plan run, save/reload plan, export.
2. Fix only broken core functions and deployment issues. Do not run extensive test suites, security scans, load testing or performance tuning.
3. Finalize `README.md`, `ARCHITECTURE.md`, `DEMO-GUIDE.md` (2–3 minute app walkthrough), and `DEMO-EXTENSIONS.md` with 6–8 independent small Copilot-friendly future improvements and suggested prompts.
4. Report exact live URL, Azure resources/regions, Foundry project and agents, any limitations and rough running-cost considerations. Confirm the deployed experience actually works; if not, report blockers explicitly.
5. STOP. Do not automatically push to GitHub or modify other repositories.

## Delivery rules
- Execute only the requested phase, without asking for repeated approval on routine non-destructive actions. Stop and ask before deleting anything, changing unrelated resources or incurring unusual cost.
- Optimize for a fast, reliable demo, not production-grade complexity.
- Avoid deep automated testing: a few smoke checks and focused fixes are enough.
- No private networking or real customer information. This is a public anonymous website with synthetic data only.
- Keep development artifacts and documentation in this local project folder. Do not push to GitHub unless explicitly instructed.
- No secrets or credential values in Git, logs, generated Markdown or frontend bundles.
- Do not claim completion until the relevant phase is demonstrably finished.
