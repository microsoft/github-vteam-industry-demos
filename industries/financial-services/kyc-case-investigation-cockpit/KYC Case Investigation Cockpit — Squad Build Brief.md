# KYC Case Investigation Cockpit — Squad Build Brief  
## Speed-First Microsoft Foundry Edition

## Read this first

You are leading the design, implementation, Azure provisioning, deployment, and validation of a **customer-demo prototype** called:

# KYC Case Investigation Cockpit

This is a **GitHub Copilot CLI + Squad demonstration for Financial Services customers**.

The objective is to demonstrate two things:

1. A polished AI-assisted Financial Services KYC investigation application running in Azure.
2. How quickly GitHub Copilot CLI + Squad can build and extend a realistic industry solution.

The application should demonstrate how AI can assist analysts during business-customer onboarding by:

- processing submitted documents,
- extracting company and ownership information,
- checking onboarding completeness,
- highlighting potential risk indicators,
- helping investigate those indicators,
- preparing an analyst review summary,
- supporting a human decision,
- maintaining a clear audit trail.

**Execution speed, simplicity, visual quality, and demo reliability are primary requirements.**

**REGION REQUIREMENT: all regional Azure resources must be deployed in Sweden Central (`swedencentral`). Do not silently fall back to another region.**

This is **NOT** a production AML/KYC compliance platform and must not be presented as one.

Use **synthetic customers, synthetic documents, synthetic watchlist/sanctions-style records, and fictional people only**.

AI-generated risk findings are **analyst-support signals**. The application must keep a human analyst in control of the final onboarding decision.

Choose the simplest architecture that produces a convincing, working end-to-end demo.

---

# 1. NON-NEGOTIABLE EXECUTION RULES

These rules take precedence over anything else in this brief.

## 1.1 Keep the Squad team small

Use approximately **3–4 Squad members maximum**.

Suggested roles:

### 1. Lead / Architect

Owns:

- architecture,
- critical path,
- Squad coordination,
- scope control,
- technical decisions,
- prevention of over-engineering.

### 2. Full-Stack Engineer

Owns:

- React frontend,
- FastAPI backend,
- case workflow,
- decision actions,
- audit history,
- UI integration.

### 3. Azure + AI Engineer

Owns:

- Microsoft Foundry,
- Foundry Agents,
- Azure AI Document Intelligence,
- Azure AI Search if used,
- Bicep,
- azd,
- managed identity,
- Azure deployment.

### 4. Tester / Integrator

Only if useful.

Focus on:

- final integration,
- deployment failures,
- smoke tests,
- demo-critical defects.

Do **not** create a large specialist team.

Do not create permanent separate Squad members for:

- Assurance,
- Security review,
- Architecture review,
- Compliance review,
- Red teaming,
- Accessibility,
- Documentation,
- Performance,
- DevOps review,
- QA review.

If a concrete issue appears, investigate that issue directly.

---

## 1.2 Do NOT create dedicated Assurance agents

Do not create background Assurance agents that continuously:

- inspect the solution,
- review other Squad members,
- rerun tests,
- reconsider architecture,
- repeatedly validate working functionality.

This is a customer-demo prototype.

Validation should be a **single focused smoke-test pass near the end**.

If a concrete deployment or application problem exists, troubleshoot that specific problem.

---

## 1.3 Deploy early

Do not build the full KYC solution locally before deploying.

Use this order:

1. Create minimal repository structure.
2. Provision minimal Azure infrastructure.
3. Deploy a basic web application.
4. Confirm the public browser URL works.
5. Add seeded KYC cases.
6. Add Document Intelligence.
7. Add Microsoft Foundry Agents.
8. Add screening/risk workflow.
9. Add analyst decision flow.
10. Add audit history.
11. Run final smoke tests.
12. Stop.

The first successful browser deployment is a major milestone.

---

## 1.4 One browser URL

The deployed customer experience should have **one primary application URL**.

Prefer:

- one Azure Container App,
- public HTTPS ingress,
- frontend and backend served from the same application.

Recommended pattern:

- React + TypeScript frontend,
- React compiled to static assets,
- Python FastAPI backend,
- FastAPI serves the built frontend,
- API routes under `/api/*`.

Avoid:

- separate frontend and backend applications,
- multiple URLs,
- CORS complexity,
- multiple authentication configurations,
- unnecessary network dependencies.

---

## 1.5 No authentication on the critical path

This is a development-subscription customer demo containing **synthetic data only**.

Do not configure:

- Microsoft Entra ID,
- Easy Auth,
- App Registrations,
- OAuth,
- login flows,

during the initial build.

The application should open directly from its Azure URL.

Display a visible banner such as:

> Demo environment — synthetic data only — not for real compliance decisions

Authentication can be documented as a future enterprise extension.

Only introduce authentication if an Azure policy makes anonymous access impossible.

Do not allow authentication troubleshooting to derail the demo.

---

## 1.6 No unnecessary enterprise complexity

Do not add Azure services simply because they might appear in a production KYC architecture.

Avoid unless clearly necessary:

- API Management,
- Service Bus,
- Event Grid,
- Functions,
- AKS,
- private endpoints,
- VNets,
- private networking,
- Front Door,
- Redis,
- separate frontend hosting,
- custom identity providers,
- complex workflow engines,
- distributed orchestration,
- multiple databases,
- custom agent runtimes.

This is a demo.

---

## 1.7 Sweden Central only

All regional Azure resources must be deployed in:

```text
swedencentral
```

Do not automatically fall back to:

- West Europe,
- North Europe,
- UK South,
- East US,
- East US 2,
- or another region.

If a preferred model is unavailable, select a suitable model available in Sweden Central.

If a mandatory capability cannot be implemented in Sweden Central:

**STOP before creating that resource elsewhere.**

Explain the blocker and wait for explicit approval before using another region.

---

## 1.8 Failure handling

Do not repeatedly retry optional functionality.

If a noncritical feature remains blocked after a small number of reasonable attempts:

1. document it in `DEMO-EXTENSIONS.md`,
2. preserve the working baseline,
3. continue with the critical demo flow.

A working customer demonstration is more important than a perfect optional feature.

---

# 2. PROJECT GOAL

## Project name

**KYC Case Investigation Cockpit**

## Industry

**Financial Services**

## Business scenario

A financial services organisation needs to onboard new business customers while satisfying Know Your Customer and internal risk-review requirements.

KYC analysts currently need to manually inspect:

- company registration documents,
- proof-of-address evidence,
- directors and authorised representatives,
- beneficial ownership structures,
- ownership percentages,
- onboarding forms,
- risk information,
- watchlist-style screening results,
- previous analyst notes,
- approval reasoning.

The process can be:

- slow,
- repetitive,
- difficult to investigate consistently,
- difficult to summarise,
- difficult to audit,
- dependent on experienced analysts.

The **KYC Case Investigation Cockpit** should demonstrate how Microsoft Foundry and Azure AI can accelerate investigation while keeping the **human analyst responsible for the final decision**.

---

# 3. CRITICAL DEMO FLOW

This is the most important requirement.

Everything else is secondary.

The deployed application must allow me to:

1. Open the KYC Case Investigation Cockpit.
2. Immediately see seeded KYC onboarding cases.
3. Filter or view cases by status and risk level.
4. Select a seeded **medium-risk case**.
5. Review the customer's company profile.
6. Review submitted synthetic onboarding documents.
7. Start an **AI Investigation**.
8. See understandable investigation progress.
9. Have documents processed with Azure AI Document Intelligence.
10. Have Microsoft Foundry Agents interpret and validate extracted information.
11. See the beneficial ownership structure.
12. See whether required onboarding evidence is complete.
13. See potential risk indicators.
14. See supporting evidence for each risk indicator.
15. See a concise AI-generated analyst review summary.
16. See a recommended next action.
17. Keep the human analyst in control.
18. Select **Request More Information**.
19. Enter a reason / analyst note.
20. Confirm the case status changes.
21. See the complete action recorded in the audit trail.

The entire flow must work from the deployed Azure URL.

---

# 4. REQUIRED MICROSOFT FOUNDRY DESIGN

Use **Microsoft Foundry** as the AI platform.

Use **Foundry Agents** for runtime AI reasoning.

Prefer the simplest managed Foundry Agent pattern supported by the current Microsoft SDK.

Do not use Hosted Agents or custom agent containers unless there is a strong technical requirement.

The backend should own the overall workflow.

Do not build a separate orchestration framework when FastAPI can call the required services and agents sequentially.

---

# 5. RUNTIME AI ARCHITECTURE

Keep the runtime agent architecture intentionally small.

Create **four logical AI agents**.

Azure AI Document Intelligence performs the underlying document extraction.

The Foundry agents interpret, validate, correlate, and summarise the resulting information.

---

## Agent 1 — Document & Entity Extraction Agent

Purpose:

Turn extracted document information into a consistent KYC customer profile.

Azure AI Document Intelligence should first process the uploaded or seeded documents.

The agent then receives extracted text / fields and returns structured JSON.

Extract and normalise where available:

- legal company name,
- company registration number,
- incorporation country,
- incorporation date,
- registered address,
- trading address,
- directors,
- authorised representatives,
- beneficial owners,
- ownership percentages,
- document type,
- document date,
- document expiration date,
- issuing authority,
- identifiers relevant to the synthetic scenario.

Also identify:

- contradictions between documents,
- different spellings of names,
- inconsistent addresses,
- potentially outdated documents,
- fields requiring analyst confirmation.

Do not invent missing information.

Every extracted fact should retain information about its originating document where practical.

---

## Agent 2 — Completeness Validation Agent

Purpose:

Determine whether the synthetic onboarding evidence satisfies the demo KYC checklist.

Check for required evidence such as:

- company registration evidence,
- registered address evidence,
- directors,
- beneficial ownership declaration,
- ownership percentages,
- proof of address,
- relevant identity evidence where included,
- onboarding declaration,
- other configured synthetic requirements.

Return structured results containing:

- requirement,
- status,
- evidence,
- missing information,
- explanation.

Suggested statuses:

```text
Complete
Missing
Needs Review
Conflicting
```

Do not make the final onboarding decision.

---

## Agent 3 — Risk Investigation Agent

Purpose:

Investigate potential KYC risk signals.

Use **synthetic screening data only**.

Possible risk categories include:

- ownership complexity,
- unusual ownership layers,
- missing beneficial ownership information,
- conflicting company information,
- synthetic watchlist-style name similarity,
- synthetic PEP-style indicator,
- geography indicator,
- expired evidence,
- inconsistent addresses,
- unusual corporate structure,
- previous synthetic analyst concern.

Where helpful, connect the agent to a small Azure AI Search index containing:

- fictional watchlist-style entries,
- fictional PEP-style entries,
- fictional internal risk indicators,
- simple synthetic KYC policy/reference information.

For every finding return:

- category,
- severity,
- description,
- supporting evidence,
- source,
- confidence where appropriate,
- recommended analyst question or action.

Suggested severity:

```text
Low
Medium
High
```

Important:

A similarity or synthetic screening hit must be presented as a **potential match requiring analyst review**, not as a confirmed sanction or compliance conclusion.

The Risk Investigation Agent must not automatically approve, reject, or escalate the customer.

---

## Agent 4 — Analyst Summary Agent

Purpose:

Prepare the final investigation summary for the human analyst.

Use:

- extracted customer profile,
- document evidence,
- completeness findings,
- risk findings,
- existing analyst notes.

Generate:

### Customer overview

A concise description of the organisation and onboarding request.

### Ownership summary

Directors, beneficial owners, and relevant ownership relationships.

### Evidence summary

What was supplied and what is missing.

### Risk summary

The important risk signals and why they matter.

### Open questions

Questions requiring analyst/customer follow-up.

### Recommended next action

One of:

```text
Approve
Request More Information
Escalate
```

Include a short rationale.

This recommendation is advisory.

The analyst must explicitly choose the final action.

---

# 6. SIMPLE ORCHESTRATION

The FastAPI backend owns the workflow.

Recommended sequence:

1. Load KYC case.
2. Load associated documents.
3. Process documents using Azure AI Document Intelligence.
4. Call Document & Entity Extraction Agent.
5. Persist structured customer information.
6. Call Completeness Validation Agent.
7. Call Risk Investigation Agent.
8. Call Analyst Summary Agent.
9. Persist investigation results.
10. Return final case investigation to UI.

Do not introduce:

- Semantic Kernel orchestration,
- Durable Functions,
- Logic Apps,
- Service Bus,
- distributed state machines,
- event-driven microservices,

unless a concrete blocker requires them.

A normal backend workflow is enough.

---

# 7. RECOMMENDED AZURE ARCHITECTURE

Use this minimal architecture unless a genuine technical limitation is discovered.

## Required

### 1. Azure Container Apps

One Container App hosting:

- React frontend,
- FastAPI backend,
- document preview support,
- case workflow.

Public HTTPS ingress.

One URL.

---

### 2. Microsoft Foundry

One Foundry project.

Containing the runtime KYC agents.

Use one appropriate model available in Sweden Central unless another model is technically required.

Do not deploy multiple models unnecessarily.

---

### 3. Azure AI Document Intelligence

Use for processing synthetic KYC documents.

Prefer prebuilt models and simple extraction first.

Do not train a custom document model unless it becomes necessary for the demo.

The objective is reliable document processing, not custom model training.

---

### 4. Azure Storage Account

Use one Storage Account.

Blob Storage for:

- seeded KYC documents,
- uploaded KYC documents,
- generated artifacts if required.

Prefer Azure Table Storage for lightweight application state where practical.

Potential tables:

```text
KycCases
CaseDocuments
ExtractedEntities
CompletenessFindings
RiskFindings
AnalystDecisions
AuditEvents
```

---

### 5. Azure AI Search

Use if it simplifies synthetic screening and risk reference lookup.

One small search service and one index are sufficient.

Potential content:

- synthetic watchlist entries,
- synthetic PEP-style entries,
- internal fictional risk entries,
- KYC reference rules.

Do not build a large enterprise retrieval architecture.

---

## Optional

### Application Insights

Add only if straightforward.

Basic Container App logs are sufficient.

Do not spend significant time building custom dashboards.

---

# 8. DO NOT REQUIRE COSMOS DB

Cosmos DB is not mandatory.

Although it may be appropriate for some production architectures, it adds unnecessary complexity to this prototype unless there is a concrete reason to use it.

Prefer:

```text
Azure Table Storage → structured demo state
Azure Blob Storage  → documents
```

Only use Cosmos DB if Squad discovers that it clearly simplifies implementation.

Do not introduce it automatically because it appeared in the initial architecture.

---

# 9. DO NOT REQUIRE KEY VAULT

Prefer:

- Managed Identity,
- Azure RBAC,
- `DefaultAzureCredential`.

Do not create Key Vault if the solution has no secrets.

Do not:

- hard-code credentials,
- store keys in Git,
- commit connection strings.

If an unavoidable secret exists, Key Vault may be introduced.

---

# 10. REGION — MANDATORY SWEDEN CENTRAL

All regional Azure resources must be deployed in:

```text
swedencentral
```

This applies to, where region-scoped:

- Azure Container Apps,
- Container Apps Environment,
- Microsoft Foundry,
- Foundry project,
- model deployments,
- Foundry Agents,
- Azure AI Document Intelligence,
- Azure AI Search,
- Storage Account,
- Application Insights,
- Log Analytics,
- any genuinely required additional resource.

Before provisioning print:

```text
Primary and only deployment region: Sweden Central
Azure region code: swedencentral
```

## No automatic fallback

Do not silently use another region.

## Model availability

Before model deployment:

1. inspect suitable models available in Sweden Central,
2. choose a model supporting the required structured KYC investigation experience,
3. deploy it in Sweden Central.

If the preferred model is unavailable, use another suitable Sweden Central model.

## Hard blocker

If a mandatory capability genuinely cannot be implemented in Sweden Central:

STOP.

Report:

- capability affected,
- resource affected,
- Sweden Central alternatives checked,
- simplest Sweden Central-compatible alternative,
- whether another region would be required.

Do not proceed outside Sweden Central without explicit approval.

---

# 11. INFRASTRUCTURE AS CODE

Use:

- Bicep,
- Azure Developer CLI (`azd`).

Repository should contain approximately:

```text
infra/
  main.bicep
  modules/
  main.parameters.json

azure.yaml
```

A colleague should ultimately be able to clone the repository and run approximately:

```bash
azd auth login
azd env new
azd up
```

and receive their own copy of the demo.

Do not depend on a long sequence of undocumented Azure CLI commands.

Azure CLI is acceptable for:

- inspection,
- diagnostics,
- model availability,
- RBAC,
- troubleshooting,
- verification.

Core infrastructure belongs in Bicep.

---

# 12. DEPLOYMENT STRATEGY

## Phase 1 — Skeleton

Create:

- repository,
- React app,
- FastAPI app,
- `/api/health`,
- Dockerfile,
- Bicep,
- `azure.yaml`.

Deploy immediately.

Success condition:

```text
https://<container-app-url>/
```

opens successfully without login.

Do not proceed until the base browser deployment works.

---

## Phase 2 — Seeded KYC Cockpit

Add:

- dashboard,
- case list,
- case detail page,
- synthetic cases,
- navigation,
- risk/status badges.

Deploy again.

Verify the browser experience.

---

## Phase 3 — Document Processing

Add:

- seeded documents,
- document preview,
- Blob Storage,
- Document Intelligence processing,
- extracted field display.

Test one case independently.

---

## Phase 4 — Foundry Agents

Configure:

- Document & Entity Extraction Agent,
- Completeness Validation Agent,
- Risk Investigation Agent,
- Analyst Summary Agent.

Test each agent individually before connecting the entire workflow.

Do not debug four agents simultaneously.

---

## Phase 5 — Screening / Risk Data

Create synthetic screening data.

If Azure AI Search is used:

- create one index,
- seed synthetic entries,
- connect Risk Investigation Agent,
- verify one search query.

Do not integrate any external live sanctions provider.

---

## Phase 6 — Investigation Workflow

Connect:

- documents,
- extraction,
- completeness,
- risk investigation,
- analyst summary,
- persistence.

Add understandable progress indicators.

---

## Phase 7 — Human Decision + Audit

Add analyst actions:

- Approve,
- Request More Information,
- Escalate.

Require an analyst comment/reason.

Record the action in audit history.

---

## Phase 8 — Final Smoke Test

Execute the Definition of Done tests.

Fix blockers only.

Do not launch another general review cycle after the smoke test passes.

---

# 13. WEB APPLICATION UX

Build a polished Financial Services customer-demo interface.

The experience should visually resemble a modern analyst investigation cockpit.

Recommended stack:

### Frontend

- React,
- TypeScript,
- Vite,
- lightweight component library if useful.

### Backend

- Python,
- FastAPI,
- Azure SDKs,
- Microsoft Foundry SDK.

Keep files understandable and easy for GitHub Copilot to modify.

Do not build a custom design system.

---

# 14. APPLICATION PAGES

## 14.1 KYC Dashboard

Display case cards/table containing:

- Case ID,
- company,
- country,
- onboarding type,
- submitted date,
- status,
- risk level,
- completeness,
- assigned analyst,
- last modified.

Suggested statuses:

```text
New
Investigating
Awaiting Information
Ready for Decision
Approved
Escalated
```

Suggested risk levels:

```text
Low
Medium
High
```

Support:

- status filter,
- risk filter,
- simple text search.

---

# 14.2 Case Investigation Workspace

The main case page should provide a clear analyst cockpit.

Display:

- customer/company profile,
- registration details,
- directors,
- beneficial owners,
- addresses,
- risk rating,
- case status,
- analyst.

Prefer tabs or clearly separated panels such as:

```text
Overview
Documents
Ownership
Completeness
Risk Review
AI Summary
Audit History
```

---

# 14.3 Document Workspace

Display submitted synthetic documents.

Support:

- document list,
- upload where practical,
- preview,
- extracted status,
- document type,
- extraction confidence where available.

Synthetic examples:

- Certificate of Incorporation,
- Company Registration Extract,
- Proof of Registered Address,
- Beneficial Ownership Declaration,
- Director Identification Document,
- Corporate Structure Document,
- Onboarding Form.

Do not build a full document management system.

---

# 14.4 Extracted Customer Profile

Show structured extracted information.

Examples:

```text
Legal Name
Registration Number
Country
Registered Address
Trading Address
Directors
Beneficial Owners
Ownership %
Document Dates
```

Allow the analyst to understand **which document supported an extracted fact** where practical.

Highlight conflicting information rather than silently resolving it.

---

# 14.5 Ownership View

Show beneficial ownership clearly.

A simple ownership table is sufficient.

If practical, create a lightweight ownership visualisation.

Display:

- entity/person,
- relationship,
- ownership percentage,
- jurisdiction,
- source document.

Do not build a complex graph database.

---

# 14.6 Completeness Checklist

Display requirements as a checklist/table.

Example:

| Requirement | Status | Evidence |
|---|---|---|
| Company registration | Complete | Certificate of Incorporation |
| Registered address | Complete | Utility statement |
| Beneficial owners | Needs Review | Ownership declaration |
| Ownership percentages | Conflicting | Registration extract / ownership declaration |
| Director information | Complete | Corporate filing |

Allow clear visual distinction for:

- Complete,
- Missing,
- Needs Review,
- Conflicting.

---

# 14.7 Risk Investigation

Display risk indicators separately from completeness.

Each finding should contain:

- severity,
- category,
- description,
- evidence,
- source,
- recommended analyst action.

Examples:

```text
MEDIUM — Ownership Complexity
The company is controlled through multiple synthetic holding entities.

MEDIUM — Potential Name Similarity
A beneficial owner has a similar name to a fictional screening record.
This is not a confirmed match and requires analyst verification.

LOW — Address Difference
Trading and registered addresses differ across submitted evidence.
```

Do not label a fictional person as sanctioned unless the synthetic scenario explicitly defines that fictional record as such.

---

# 14.8 AI Analyst Summary

Display an analyst-friendly summary.

Suggested sections:

```text
Customer Overview
Ownership
Evidence Reviewed
Missing Information
Risk Indicators
Open Questions
Recommended Next Action
```

Clearly label:

```text
AI-generated analyst assistance
```

The recommended decision should never automatically change the case status.

---

# 14.9 Analyst Decision

Provide three obvious actions:

### Approve

### Request More Information

### Escalate

Require an analyst reason/comment before confirmation.

Example demo action:

```text
Request More Information
```

Reason:

```text
Additional evidence is required to validate the beneficial ownership structure and resolve the potential screening similarity.
```

After confirmation:

- update status,
- record analyst,
- record timestamp,
- record reason,
- create audit event.

---

# 14.10 Audit History

Display a chronological timeline.

Example events:

- case created,
- document uploaded,
- investigation started,
- document processed,
- entities extracted,
- completeness validation completed,
- screening performed,
- risk findings generated,
- analyst summary generated,
- analyst decision recorded,
- status changed.

AI activity and human decisions must be distinguishable.

Do not build a separate audit service.

Store simple application events.

---

# 15. INVESTIGATION PROGRESS

When the user selects:

# Run AI Investigation

show understandable progress.

Suggested stages:

```text
1. Reading submitted documents
2. Extracting company information
3. Building ownership profile
4. Checking required evidence
5. Investigating risk indicators
6. Preparing analyst summary
7. Saving investigation
```

Do not expose raw Foundry traces or internal prompts in the normal UI.

Use:

- Server-Sent Events, or
- polling.

Choose whichever is simpler and more reliable.

Do not introduce WebSockets without a concrete need.

---

# 16. SYNTHETIC DEMO DATA

The application must be demo-ready immediately after deployment.

Seed approximately:

- **25 KYC cases**
- company registration documents,
- proof-of-address documents,
- beneficial ownership declarations,
- onboarding forms,
- corporate ownership tables,
- synthetic screening records,
- previous analyst notes,
- previous case decisions.

Use only fictional companies and fictional people.

Never use real personal information.

---

# 17. CASE MIX

Create cases with visibly different scenarios.

For example:

### Low risk

Complete straightforward onboarding case.

### Medium risk — Ownership Complexity

Multiple ownership layers but no confirmed adverse result.

### Medium risk — Missing Evidence

Beneficial ownership information incomplete.

### Medium risk — Potential Screening Similarity

Synthetic person name resembles a fictional watchlist record.

### High risk — Multiple Concerns

Missing evidence plus complex ownership and conflicting data.

### Approved historical case

Shows previous completed investigation.

### Awaiting Information case

Previously requested customer evidence.

### Escalated historical case

Demonstrates a prior human escalation.

The dashboard should feel populated and realistic.

---

# 18. PRIMARY DEMO CASE

Create one intentionally polished seeded case specifically for the main customer demo.

It should be **medium risk**.

The scenario should include:

- valid company registration documentation,
- valid registered address evidence,
- several directors,
- a multi-layer beneficial ownership structure,
- one ownership-related inconsistency or missing supporting document,
- one potential synthetic name-screening similarity,
- no confirmed prohibited party.

The AI investigation should conclude approximately:

```text
The majority of required onboarding evidence is available.

Additional supporting evidence is required to validate one layer of the beneficial ownership structure.

A potential synthetic screening similarity was identified for one beneficial owner and should be manually verified.

Recommended next action: Request More Information.
```

The analyst then selects:

```text
Request More Information
```

This should be the default live demo scenario.

---

# 19. SYNTHETIC SCREENING DATA

Create approximately 30–50 fictional screening records.

They may include:

- fictional watchlist-style records,
- fictional PEP-style records,
- fictional internal risk records.

Fields might include:

```text
Record ID
Name
Aliases
Country
Date of Birth
Entity Type
Category
Synthetic Risk Description
```

This dataset exists solely to demonstrate investigation.

Clearly mark it as:

```text
Synthetic demo screening data
```

Do not connect a real sanctions or PEP provider during the baseline build.

---

# 20. SEEDING RULE

Seeding must be:

- deterministic,
- idempotent,
- repeatable.

A new deployment should automatically become demo-ready.

Use something similar to:

```text
python scripts/seed_demo.py
```

Seed:

- cases,
- documents,
- screening records,
- analyst notes,
- previous decisions.

If deployment-time seeding is fragile, run it once immediately after Azure deployment.

Do not reseed every application restart.

---

# 21. DOMAIN MODEL

Keep the domain model small.

Suggested entities:

```text
KycCase
CompanyProfile
Person
OwnershipRelationship
Document
ExtractedFact
CompletenessFinding
RiskFinding
Investigation
AnalystDecision
AuditEvent
ScreeningRecord
```

Do not build an enterprise banking data model.

---

# 22. API DESIGN

Prefer simple REST APIs.

Example:

```text
GET    /api/cases
GET    /api/cases/{id}
POST   /api/cases

GET    /api/cases/{id}/documents
POST   /api/cases/{id}/documents

POST   /api/cases/{id}/investigate
GET    /api/cases/{id}/investigation

GET    /api/cases/{id}/profile
GET    /api/cases/{id}/ownership
GET    /api/cases/{id}/completeness
GET    /api/cases/{id}/risks
GET    /api/cases/{id}/summary

POST   /api/cases/{id}/decision

GET    /api/cases/{id}/audit

GET    /api/health
```

Do not over-engineer versioning.

---

# 23. ERROR HANDLING

The demo should fail gracefully.

If Document Intelligence fails:

- display a friendly document-processing error,
- preserve the case,
- allow retry.

If an agent fails:

- preserve completed results,
- show a friendly message,
- allow retry.

If synthetic screening retrieval fails:

- do not crash the entire case,
- show an understandable risk-screening error.

Backend logs should contain enough technical information for troubleshooting.

Do not create an elaborate error-management platform.

---

# 24. SECURITY

Use basic Azure security best practices.

Use:

- Managed Identity,
- Azure RBAC,
- `DefaultAzureCredential`,
- HTTPS,
- no committed credentials.

Do not:

- hard-code API keys,
- store secrets in Git,
- expose Azure management credentials.

Because all customer information is synthetic, public browser access is acceptable for this development demo.

Add a visible disclaimer:

> Synthetic data only. AI recommendations are for demonstration purposes and do not constitute KYC, AML, sanctions, or compliance decisions.

---

# 25. REPOSITORY STRUCTURE

Prefer a simple monorepo.

Example:

```text
KYC-Case-Investigation-Cockpit/
│
├── app/
│   ├── backend/
│   │   ├── api/
│   │   ├── agents/
│   │   ├── services/
│   │   ├── models/
│   │   ├── storage/
│   │   └── main.py
│   │
│   └── frontend/
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   └── services/
│       └── ...
│
├── infra/
│   ├── main.bicep
│   └── modules/
│
├── data/
│   ├── cases/
│   ├── documents/
│   └── screening/
│
├── scripts/
│   ├── seed_demo.py
│   └── smoke_test.py
│
├── tests/
│
├── docs/
│   └── architecture.md
│
├── .github/
│   └── workflows/
│
├── azure.yaml
├── Dockerfile
├── README.md
├── STATUS.md
└── DEMO-EXTENSIONS.md
```

Avoid monolithic files.

Do not introduce unnecessary abstractions.

---

# 26. STATUS.md

Maintain a small `STATUS.md`.

It should contain:

```text
Current phase:
Last successful deployment:
Application URL:
Primary demo case:
Working:
Blocked:
Next:
```

Keep it short.

The objective is to allow another GitHub Copilot / Squad session to understand the current state quickly.

---

# 27. TESTING

Testing should protect the customer demo without becoming the project.

Required automated tests:

- case CRUD/service behaviour,
- decision state transitions,
- completeness logic,
- mock investigation workflow,
- audit event creation,
- API health/startup.

Mock:

- Microsoft Foundry,
- Document Intelligence,
- AI Search,

in normal CI tests.

Do not consume Azure AI capacity for every test run.

One deployed live smoke test is sufficient.

Do not target enterprise code-coverage percentages.

---

# 28. GITHUB ACTIONS

Create one simple CI pipeline.

On push / pull request:

1. install dependencies,
2. lint backend,
3. run backend tests,
4. build frontend,
5. optionally validate Bicep.

Keep Azure deployment primarily based on:

```bash
azd up
```

Only add CD if it is trivial after the baseline works.

---

# 29. LIVE DEMO EXTENSIBILITY

Create:

```text
DEMO-EXTENSIONS.md
```

Include approximately 8–10 features suitable for demonstrating GitHub Copilot + Squad extending the solution live.

Each extension should include:

- feature,
- business value,
- likely files/components,
- complexity: Easy or Medium,
- example Copilot prompt.

Include easy examples such as:

### Easy

- Add country filter to KYC dashboard.
- Add a risk severity chart.
- Add analyst avatars.
- Add export-to-PDF case summary.
- Add dashboard KPI cards.
- Add dark mode.

### Medium

- Visual ownership graph.
- Side-by-side document comparison.
- Investigation report export.
- Multi-language analyst summary.
- Four-eyes approval workflow.
- Configurable onboarding checklist.

At least three extensions should be extremely easy to implement during a live demonstration.

Do not deliberately leave defects in the baseline.

---

# 30. DEMO EXTENSION DESIGN PRINCIPLE

Structure the application so GitHub Copilot can easily identify where functionality belongs.

For example:

```text
frontend/components/
frontend/pages/
backend/agents/
backend/services/
backend/models/
```

Avoid giant files.

Avoid unnecessary design patterns.

The governing principle is:

> A live GitHub Copilot prompt should be able to make a meaningful change without first understanding an enterprise framework.

---

# 31. INITIAL AZURE INSPECTION

Before provisioning:

1. inspect active Azure tenant,
2. inspect active Azure subscription,
3. print tenant/subscription,
4. confirm Sweden Central,
5. inspect required AI/model availability,
6. confirm Document Intelligence availability,
7. confirm no resource will be silently created outside Sweden Central,
8. create a dedicated resource group.

Do not modify unrelated Azure resources.

Suggested resource group:

```text
rg-kyc-dev-swc
```

Suggested tags:

```text
project = kyc-case-investigation-cockpit
industry = financial-services
purpose = customer-demo
environment = dev
managed-by = azd
```

---

# 32. RESOURCE NAMING

Keep names short and obvious.

Example:

```text
rg-kyc-dev-swc
ca-kyc-dev
st<shortsuffix>
srch-kyc-dev
di-kyc-dev
foundry project/resource names containing kyc
```

Follow Azure resource naming restrictions.

Do not spend excessive time designing a naming convention.

---

# 33. WHAT NOT TO DO

Explicitly do **NOT**:

- create dedicated Assurance agents,
- continuously rerun validation,
- repeatedly review already-working components,
- implement authentication before the demo works,
- configure private networking,
- build a production banking architecture,
- create multiple frontend/backend applications,
- use Hosted Agents without a technical need,
- add Semantic Kernel merely for orchestration,
- use Durable Functions unnecessarily,
- create Service Bus,
- create API Management,
- create Cosmos DB automatically,
- create Key Vault automatically,
- integrate a real sanctions provider,
- use real customers,
- use real people,
- present AI risk findings as regulatory decisions,
- allow AI to automatically approve or reject customers,
- create a complex rules engine,
- build an enterprise audit platform,
- build a graph database solely for ownership display,
- implement production-grade AML transaction monitoring,
- perform load testing,
- attempt compliance certification,
- spend large amounts of time on cosmetic perfection,
- block completion because optional functionality is incomplete.

---

# 34. DECISION PRIORITY

When making technical decisions, use this priority order:

1. Does the end-to-end customer demo work?
2. Is the human analyst clearly in control?
3. Is the workflow reliable?
4. Is it fast to deploy?
5. Is it visually convincing?
6. Is it easy to understand?
7. Is it easy for GitHub Copilot to extend?
8. Is it reasonably secure for synthetic data?

Production banking completeness is not the objective.

---

# 35. FINAL SMOKE TEST

Run one focused smoke-test pass.

## Infrastructure

Verify:

- Container App exists,
- Microsoft Foundry project exists,
- expected Foundry Agents exist,
- Azure AI Document Intelligence exists,
- Storage Account exists,
- Azure AI Search exists if used,
- all regional resources are in Sweden Central.

## Website

Verify:

```text
GET /api/health
```

returns success.

Verify:

- homepage loads through public URL,
- no authentication required,
- synthetic-data warning appears,
- KYC cases are visible.

## Demo data

Verify:

- approximately 25 cases exist,
- documents exist,
- screening records exist,
- analyst history exists.

## AI

Using the primary medium-risk case verify:

- document processing works,
- Document & Entity Extraction Agent responds,
- Completeness Validation Agent responds,
- Risk Investigation Agent responds,
- Analyst Summary Agent responds.

## Full workflow

Perform:

1. Open dashboard.
2. Select primary medium-risk case.
3. Review customer profile.
4. Review documents.
5. Run AI Investigation.
6. Confirm extraction completes.
7. Confirm ownership information appears.
8. Confirm completeness findings appear.
9. Confirm risk findings appear.
10. Confirm AI analyst summary appears.
11. Confirm recommended action is displayed.
12. Choose **Request More Information**.
13. Enter analyst reasoning.
14. Submit decision.
15. Confirm status changes.
16. Confirm analyst decision appears in audit history.

If this works, the project is complete.

Do not start a separate Assurance cycle afterwards.

---

# 36. DEFINITION OF DONE

The project is complete when:

- Azure deployment succeeds,
- one public browser URL exists,
- application opens without login,
- synthetic-data disclaimer is visible,
- approximately 25 KYC cases are seeded,
- dashboard works,
- case investigation workspace works,
- documents can be reviewed,
- Document Intelligence processes the seeded documents,
- extracted company information appears,
- directors appear,
- beneficial ownership appears,
- completeness validation works,
- synthetic screening works,
- risk findings work,
- supporting evidence is visible,
- AI analyst summary works,
- recommended next action is displayed,
- analyst can Approve,
- analyst can Request More Information,
- analyst can Escalate,
- analyst decision requires reasoning,
- decisions are persisted,
- audit history works,
- Foundry Agents are deployed/configured,
- core infrastructure exists in Bicep,
- `azd` deployment is documented,
- automated tests pass,
- README exists,
- architecture documentation exists,
- `STATUS.md` exists,
- `DEMO-EXTENSIONS.md` exists,
- final smoke test passes,
- all regional Azure resources are in Sweden Central.

Then **STOP**.

Do not continue adding architecture, agents, reviews, optimisations, or optional capabilities after the Definition of Done passes.

---

# 37. EXPECTED FINAL HANDOFF

At completion give me:

1. Application URL
2. Resource group
3. Foundry project name
4. Foundry agent names
5. Document Intelligence resource
6. Main Azure resources
7. Primary demo case ID/company
8. How to redeploy
9. How another colleague can clone and deploy their own copy
10. Customer demo flow
11. Known optional limitations
12. Recommended first live GitHub Copilot extension

Keep the handoff concise.

---

# 38. START NOW

Start by:

1. casting the small Squad team,
2. inspecting the active Azure tenant/subscription,
3. confirming Sweden Central as the mandatory and only region,
4. checking required model/service availability,
5. proposing the smallest required Azure resource list,
6. creating the repository skeleton,
7. deploying the initial application immediately,
8. confirming the public browser URL works,
9. then building the KYC functionality incrementally.

Do not wait for another approval step unless:

- an action would be destructive,
- the Azure subscription cannot be determined,
- a mandatory requirement cannot be implemented in Sweden Central.

Prioritise a working deployed URL before secondary functionality.

The governing principle for the entire project is:

> **Build the smallest polished Microsoft Foundry-powered KYC investigation experience that tells a credible Financial Services story, keeps the analyst in control, deploys quickly, works reliably, can be extended live with GitHub Copilot, and stops when the customer-demo flow works.**