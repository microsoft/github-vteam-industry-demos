# AI Proposal Factory — Squad Build Brief (Speed-First Foundry Edition)

## Read this first

You are leading the design, implementation, Azure provisioning, deployment, and validation of a **customer-demo prototype** called **AI Proposal Factory**.

This is a GitHub Copilot + Squad demonstration for Professional Services customers.

The objective is to demonstrate two things:

1. A polished AI-powered Professional Services application running in Azure.
2. How quickly GitHub Copilot CLI + Squad can build and extend a real solution.

**Execution speed, simplicity, and demo reliability are primary requirements.**

**REGION REQUIREMENT: all regional Azure resources must be deployed in Sweden Central (`swedencentral`). Do not silently fall back to another region.**

This is **NOT** a production certification exercise.

Choose the simplest architecture that produces a convincing, working end-to-end demo.

---

# 1. NON-NEGOTIABLE EXECUTION RULES

These rules take precedence over anything else in this brief.

## 1.1 Keep the Squad team small

Use approximately **3–4 Squad members maximum**.

Suggested roles:

1. **Lead / Architect**
   - owns architecture
   - coordinates work
   - prevents over-engineering
   - keeps the critical path small

2. **Full-Stack Engineer**
   - frontend
   - backend/API
   - application state
   - export
   - UI integration

3. **Azure + AI Engineer**
   - Microsoft Foundry
   - Foundry Agents
   - Azure AI Search
   - Bicep
   - azd
   - managed identity
   - deployment

4. **Tester / Integrator**
   - only if useful
   - focuses on final smoke tests and integration failures

Do **not** create a large specialist team.

Do **not** create separate permanent agents for:
- Assurance
- Architecture review
- Security review
- Compliance
- Red teaming
- Performance review
- Accessibility review
- Documentation review
- DevOps review
- QA review

unless there is a concrete blocking issue that genuinely requires one.

---

## 1.2 Do NOT create dedicated Assurance agents

Do **not** create background Assurance agents that continuously inspect, re-review, re-test, or revalidate the project.

Do not repeatedly validate components that already work.

Do not spawn agents whose main purpose is to review other Squad members.

Validation for this prototype should be a **single focused smoke-test pass near the end**.

If a concrete deployment or integration error appears, investigate that error directly.

---

## 1.3 Deploy early

Do not build the entire application before deploying.

Use this implementation order:

1. Create minimal repository structure.
2. Provision minimal Azure infrastructure.
3. Deploy a basic web application.
4. Confirm the browser URL works.
5. Add Foundry integration.
6. Add proposal workflow.
7. Add remaining demo functionality.
8. Run final smoke tests.
9. Stop.

The first successful browser deployment is a milestone, not the final step.

---

## 1.4 One browser URL

The final deployed experience should have **one primary application URL**.

Prefer:

- one Azure Container App
- public HTTPS ingress
- frontend and backend served from the same application

Recommended pattern:

- React frontend built to static assets
- FastAPI backend
- FastAPI serves the built React application
- API routes under `/api/*`

This avoids:
- multiple deployments
- CORS configuration
- multiple application URLs
- frontend/backend authentication mismatches
- unnecessary networking complexity

---

## 1.5 No authentication on the critical path

This is a development-subscription customer demo using **synthetic data only**.

Do **not** configure Microsoft Entra ID authentication, Easy Auth, App Registration, OAuth, or login flows during the initial build.

The deployed demo should open directly in the browser.

Add a small visible banner in the application:

> Demo environment — synthetic data only

Authentication can be documented as a future extension.

Only add authentication if an Azure policy makes public anonymous access impossible.

If authentication becomes necessary because of policy:
1. first prove the application works without it locally,
2. keep the auth design minimal,
3. do not allow authentication troubleshooting to redesign the entire solution.

---

## 1.6 No unnecessary enterprise complexity

Do not add a service merely because it would be appropriate in a large production implementation.

Avoid unless clearly necessary:

- API Management
- Service Bus
- Event Grid
- Functions
- AKS
- private networking
- private endpoints
- VNet integration
- Front Door
- Redis
- separate frontend hosting
- custom identity provider
- multi-region architecture
- complex event-driven workflows
- custom agent hosting
- elaborate approval engines
- custom distributed tracing frameworks

This is a demo.

---

## 1.7 Sweden Central only

All regional Azure resources must be created in **Sweden Central (`swedencentral`)**.

This is mandatory.

Do not use another Azure region automatically.

If a preferred model is unavailable:
- choose a suitable model available in Sweden Central,
- keep the architecture in Sweden Central.

If a mandatory requirement cannot be met in Sweden Central:
- stop,
- explain the blocker,
- wait for explicit approval before deploying anything in another region.

---

## 1.8 Failure handling

Do not get stuck repeatedly retrying an optional feature.

For any noncritical feature:

- after a small number of reasonable implementation attempts,
- if it remains blocked,
- move it to `DEMO-EXTENSIONS.md`,
- continue the core demo flow.

Do not sacrifice the working demo because an optional enhancement is imperfect.

---

# 2. PROJECT GOAL

## Project name

**AI Proposal Factory**

## Business purpose

A consulting / Professional Services firm needs to respond to opportunities faster.

Sales and delivery teams currently spend significant time manually searching through:

- previous proposals
- statements of work
- meeting notes
- case studies
- project plans
- service descriptions
- delivery methodologies
- pricing assumptions
- effort assumptions

This causes:

- slow proposal creation
- duplicated work
- inconsistent quality
- dependency on senior consultants
- poor reuse of organizational knowledge
- inconsistent risk identification
- limited traceability

AI Proposal Factory should demonstrate how Microsoft Foundry and Foundry Agents can accelerate this process while keeping a human reviewer in control.

---

# 3. CRITICAL DEMO FLOW

The following flow is the most important requirement.

Everything else is secondary.

The deployed application must allow me to:

1. Open the AI Proposal Factory website.
2. See seeded opportunities immediately.
3. Select an opportunity.
4. Review its business requirements.
5. Select or upload meeting notes.
6. Click **Generate Proposal**.
7. See clear progress updates.
8. Have Microsoft Foundry Agents analyse the opportunity.
9. Retrieve relevant reusable organizational content.
10. Generate a professional proposal.
11. Review proposal sections.
12. Review risks, assumptions, dependencies, and open questions.
13. Edit a section manually.
14. Regenerate one section.
15. Approve sections.
16. Approve the complete proposal.
17. Export the proposal as PDF.
18. View a simple audit/history trail.

This flow must work from the deployed Azure URL.

---

# 4. REQUIRED MICROSOFT FOUNDRY DESIGN

Use **Microsoft Foundry** as the AI platform.

Use **Foundry Agents** for runtime AI behavior.

Prefer the simplest managed Foundry Agent pattern available in the installed/current Microsoft SDK.

## Important

Prefer **managed prompt-style Foundry Agents**.

Do **not** use Hosted Agents, custom agent containers, or a custom multi-agent runtime unless there is a strong blocking reason.

Do not build a separate orchestration framework when the backend can simply call the Foundry Agents in sequence.

---

# 5. RUNTIME FOUNDRY AGENTS

Keep the runtime agent architecture intentionally small.

Create **three Foundry Agents**.

## Agent 1 — Requirements Analyst

Purpose:

Analyse:
- opportunity data
- meeting notes
- uploaded requirements

Return structured JSON containing:

- business goals
- business problems
- expected outcomes
- scope
- stakeholders
- constraints
- success criteria
- timeline
- budget / effort assumptions
- open questions
- missing information

The backend should persist the structured result.

---

## Agent 2 — Proposal Writer

Purpose:

Generate the proposal.

This agent should have access to reusable organizational knowledge through the simplest supported Foundry / Azure AI Search integration.

The agent should retrieve relevant:

- previous proposal snippets
- case studies
- service descriptions
- delivery methodologies
- templates
- pricing / effort assumptions

Generate these proposal sections:

1. Executive Summary
2. Customer Challenges
3. Proposed Solution
4. Scope
5. Deliverables
6. Delivery Approach
7. Milestones
8. Assumptions
9. Dependencies
10. Risks
11. Success Criteria
12. Next Steps

Where practical, return source references for reusable knowledge used during generation.

Do not build a separate Content Retrieval Agent unless it materially simplifies the implementation.

Retrieval is a capability of the Proposal Writer, not necessarily a fourth autonomous agent.

---

## Agent 3 — Risk Reviewer

Purpose:

Review the generated proposal and identify:

- delivery risks
- assumptions
- dependencies
- ambiguous requirements
- missing information
- open customer questions

Return structured findings.

Do **not** silently rewrite the proposal.

Risk findings must be displayed separately to the user.

---

# 6. SIMPLE ORCHESTRATION

The backend owns the workflow.

Recommended generation sequence:

1. Requirements Analyst
2. Proposal Writer using:
   - opportunity
   - requirements analysis
   - meeting notes
   - retrieved organizational knowledge
3. Risk Reviewer
4. Persist results
5. Return proposal to UI

Do not introduce:
- Semantic Kernel orchestration
- Durable Functions
- custom workflow engines
- event buses
- distributed state machines

unless a blocking technical requirement makes them necessary.

A normal backend service is enough.

---

# 7. RECOMMENDED AZURE ARCHITECTURE

Use the following minimal architecture unless a strong technical limitation is discovered.

## Required

### 1. Azure Container Apps

One Container App hosting:

- React frontend
- FastAPI API
- PDF export logic

Public HTTPS ingress.

One application URL.

---

### 2. Microsoft Foundry

One Foundry project containing the three runtime agents.

Use an appropriate Azure OpenAI model available in the selected region.

Do not deploy multiple models unless necessary.

---

### 3. Azure AI Search

Used for reusable organizational knowledge.

One search service.

One main index is sufficient.

Do not create multiple indexes unless required.

---

### 4. Azure Storage Account

Use a single Storage Account for:

- uploaded documents
- reusable synthetic documents
- exported PDFs if needed
- application state where practical

Use Blob Storage for documents.

For simple metadata/state, prefer Azure Table Storage if practical.

---

## Optional

### Application Insights

Use only if it can be added with minimal effort.

Basic logs from the Container App are sufficient for this prototype.

Do not spend significant time building observability dashboards.

---

# 8. DO NOT REQUIRE COSMOS DB

Cosmos DB is **not mandatory**.

For this prototype, prefer the lowest-complexity storage option.

A good default is:

- Azure Table Storage:
  - opportunities
  - proposals
  - proposal section state
  - audit records

- Azure Blob Storage:
  - documents
  - meeting notes
  - knowledge files
  - exports

If Table Storage becomes awkward, a lightweight alternative is acceptable.

Only add Cosmos DB if it clearly reduces implementation complexity.

---

# 9. DO NOT REQUIRE KEY VAULT

Prefer:

- Managed Identity
- Azure RBAC
- DefaultAzureCredential

Do not create Key Vault if there are no secrets.

Do not hard-code credentials.

Do not store secrets in Git.

If an unavoidable secret exists, Key Vault may be used.

---

# 10. REGION — MANDATORY: SWEDEN CENTRAL

**All regional Azure resources for this solution must be deployed in Sweden Central.**

This is a hard requirement, not a preference.

Use:

```text
swedencentral
```

where Azure CLI, Bicep, azd, SDKs, or configuration require the region identifier.

This includes, where region-scoped:

- Azure Container Apps
- Container Apps Environment
- Microsoft Foundry resources
- Microsoft Foundry project
- Foundry Agent resources/configuration
- Azure OpenAI / Foundry model deployments
- Azure AI Search
- Azure Storage
- Application Insights, if used
- Log Analytics, if used
- any additional regional Azure resource that is genuinely required

The dedicated resource group should also be created with:

```text
location = swedencentral
```

## 10.1 No automatic regional fallback

Do **not** automatically deploy any part of the solution to:

- UK South
- West Europe
- North Europe
- East US
- East US 2
- or any other Azure region

Do not create a split-region architecture merely because a preferred model is unavailable.

## 10.2 Model availability rule

Before deploying the Foundry model:

1. inspect which suitable models are available in Sweden Central,
2. choose a model that supports the required proposal-generation experience,
3. deploy that model in Sweden Central.

If the initially preferred model is unavailable in Sweden Central, choose another compatible model that **is available in Sweden Central**.

Do not move the model deployment to another region just to preserve a specific model choice.

## 10.3 Hard blocker behavior

If a mandatory application requirement is technically impossible to implement in Sweden Central:

**STOP before creating the affected resource in another region.**

Report clearly:

- which required capability is unavailable,
- which Azure resource or model is affected,
- what Sweden Central alternatives were checked,
- the simplest alternative design that would keep the solution in Sweden Central,
- whether another region would be required as a last resort.

Do not proceed with another region without explicit user approval.

## 10.4 Region validation

Before provisioning, print a short region plan showing that the target is:

```text
Primary and only deployment region: Sweden Central
Azure region code: swedencentral
```

After deployment, the final smoke-test pass must verify that all regional resources were created in Sweden Central.
# 11. INFRASTRUCTURE AS CODE

Use:

- Bicep
- Azure Developer CLI (`azd`)

Repository example:

```text
infra/
  main.bicep
  modules/
  main.parameters.json
azure.yaml
```

Goal:

A colleague should eventually be able to clone the repository and run approximately:

```bash
azd auth login
azd env new
azd up
```

and get their own deployed demo.

Do not depend on a long sequence of undocumented manual Azure CLI commands.

Azure CLI is allowed for:

- inspection
- diagnostics
- RBAC
- model availability checks
- troubleshooting
- verification

But the core infrastructure must live in Bicep.

---

# 12. DEPLOYMENT STRATEGY

## Phase 1 — Skeleton

Create:

- repository structure
- React application
- FastAPI application
- health endpoint
- Dockerfile
- Bicep
- azd configuration

Deploy immediately.

Success condition:

```text
https://<container-app-url>/
```

opens successfully.

Do not move on until this works.

---

## Phase 2 — Seeded application UI

Add:

- opportunity dashboard
- opportunity detail page
- synthetic opportunity data
- navigation

Deploy again.

Verify browser experience.

---

## Phase 3 — Foundry

Provision / configure:

- Foundry project
- model deployment
- Requirements Analyst
- Proposal Writer
- Risk Reviewer

Create backend integration.

Test each agent independently with a simple request before integrating the full workflow.

Do not debug the entire workflow if a single agent can be tested independently.

---

## Phase 4 — Knowledge retrieval

Create reusable synthetic knowledge.

Index it in Azure AI Search.

Connect it to Proposal Writer using the simplest supported Foundry knowledge/search mechanism.

Verify one test query returns relevant results.

Do not build an elaborate RAG pipeline.

---

## Phase 5 — Proposal workflow

Connect:

- opportunity
- meeting notes
- requirements analysis
- proposal generation
- risk review
- persistence

Add visible progress states to UI.

---

## Phase 6 — Review + export

Add:

- section editing
- section regeneration
- section approval
- full proposal approval
- PDF export
- Markdown export
- audit history

---

## Phase 7 — Final smoke tests

Run only the focused tests in the Definition of Done section.

Fix blockers.

Do not launch a new general assurance cycle after the smoke tests pass.

---

# 13. WEB APPLICATION UX

Build a polished but pragmatic customer-demo UI.

Recommended stack:

## Frontend

- React
- TypeScript
- Vite
- a lightweight component library if useful

Do not spend significant time creating a custom design system.

## Backend

- Python
- FastAPI
- Azure SDKs
- Microsoft Foundry SDK

Keep the code easy for GitHub Copilot to understand and modify.

---

# 14. APPLICATION PAGES

## 14.1 Opportunity Dashboard

Display:

- customer
- opportunity
- industry
- estimated value
- expected delivery duration
- status
- proposal progress
- last modified

Actions:

- open opportunity
- create opportunity

---

## 14.2 Opportunity Workspace

Display/edit:

- customer name
- opportunity name
- business problem
- expected outcomes
- scope
- stakeholders
- constraints
- target timeline
- budget / effort assumptions
- notes

---

## 14.3 Documents / Meeting Notes

Allow:

- selecting seeded meeting notes
- uploading `.txt`, `.md`, and `.pdf` where practical
- reviewing uploaded filenames
- removing/replacing selected notes

Store uploaded documents in Blob Storage.

Do not build complex document-management functionality.

---

## 14.4 Proposal Generation

One clear CTA:

**Generate Proposal**

Show understandable progress, for example:

1. Analysing requirements
2. Searching reusable knowledge
3. Drafting proposal
4. Reviewing risks
5. Saving proposal

Do not expose raw agent traces to the end user.

---

## 14.5 Proposal Workspace

Each proposal section appears separately.

Support:

- edit
- save
- regenerate
- approve

Show state:

- Draft
- Generated
- In Review
- Approved

Show source references where available.

---

## 14.6 Risk Review

Display:

- severity
- category
- description
- mitigation / question

Suggested categories:

- Risk
- Assumption
- Dependency
- Missing Information
- Open Question

Keep this as a straightforward table or cards.

---

## 14.7 Knowledge Library

Allow user to browse:

- case studies
- proposal snippets
- service descriptions
- delivery methodologies
- templates

Support:

- simple text search
- type filter
- industry filter if available

---

## 14.8 Audit History

Display a chronological list of:

- opportunity created
- document uploaded
- generation started
- proposal generated
- section regenerated
- section edited
- section approved
- proposal approved
- proposal exported

Do not build a separate audit service.

Store these as application records.

---

# 15. PDF EXPORT

PDF export is required.

Generate it directly in the backend.

Do not provision another Azure service just to create PDFs.

The PDF should include:

- AI Proposal Factory branding
- customer
- opportunity
- date
- all proposal sections
- clear headings
- professional formatting

A clean customer-ready PDF is enough.

Do not spend excessive effort on pixel-perfect document design.

---

# 16. SYNTHETIC DEMO DATA

The application must be useful immediately after deployment.

Seed automatically.

Use fictional organizations and fictional people only.

Minimum:

- 8–10 opportunities
- 15–20 reusable proposal snippets
- 6–10 case studies
- 4–5 delivery methodologies
- 5+ service descriptions
- several meeting-note documents
- pricing / effort examples

Scenarios should include:

- cloud modernization
- AI adoption
- data platform modernization
- application modernization
- customer service transformation

Different opportunities should produce visibly different retrieval results.

---

# 17. SEEDING RULE

Seeding must be deterministic and idempotent.

A new deployment should automatically become demo-ready.

Do not require me to manually upload documents or create records before the first demo.

Use one script/command such as:

```text
python scripts/seed_demo.py
```

and integrate it into deployment where reliable.

If automatic deployment-time seeding is fragile, run it once immediately after infrastructure deployment from the deployment script.

Do not repeatedly reseed on every application startup.

---

# 18. STATE MODEL

Keep the domain model simple.

Suggested entities:

```text
Opportunity
Proposal
ProposalSection
RiskFinding
KnowledgeItem
AuditEvent
Document
```

Do not create a large enterprise domain model.

---

# 19. API DESIGN

Use straightforward REST APIs.

Example:

```text
GET    /api/opportunities
POST   /api/opportunities
GET    /api/opportunities/{id}

GET    /api/opportunities/{id}/documents
POST   /api/opportunities/{id}/documents

POST   /api/opportunities/{id}/generate

GET    /api/proposals/{id}
PATCH  /api/proposals/{id}/sections/{sectionId}
POST   /api/proposals/{id}/sections/{sectionId}/regenerate
POST   /api/proposals/{id}/sections/{sectionId}/approve
POST   /api/proposals/{id}/approve

GET    /api/proposals/{id}/export/markdown
GET    /api/proposals/{id}/export/pdf

GET    /api/knowledge
GET    /api/audit
GET    /api/health
```

Do not over-engineer API versioning.

---

# 20. PROGRESS UPDATES

Proposal generation should show progress in the browser.

Keep implementation simple.

Preferred approaches:

- Server-Sent Events, or
- polling a generation status endpoint

Choose whichever is faster and more reliable.

Do not introduce WebSockets unless there is a clear reason.

---

# 21. ERROR HANDLING

The demo must fail gracefully.

If an AI call fails:

- show a friendly error
- preserve the user's opportunity
- allow retry

If retrieval fails:

- show an understandable message
- do not crash the entire site

Log enough backend detail to troubleshoot.

Do not build an elaborate error-management platform.

---

# 22. SECURITY

This is a demo, but basic Azure security still applies.

Use:

- Managed Identity
- RBAC
- DefaultAzureCredential
- HTTPS
- no credentials in Git

Do not:

- hard-code API keys
- commit secrets
- create unnecessary secrets
- expose Azure management credentials

Because the application uses only synthetic demo data, public browser access is acceptable for this development deployment.

---

# 23. REPOSITORY STRUCTURE

Prefer a simple monorepo.

Example:

```text
AI-Proposal-Factory/
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
│       └── ...
│
├── infra/
│   ├── main.bicep
│   └── modules/
│
├── data/
│   ├── opportunities/
│   ├── knowledge/
│   └── meeting-notes/
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
├── DEMO-EXTENSIONS.md
└── STATUS.md
```

Keep naming obvious.

---

# 24. STATUS.md

Maintain a small `STATUS.md` while building.

It should contain:

```text
Current phase:
Last successful deployment:
Application URL:
Working:
Blocked:
Next:
```

Do not turn this into a large project-management document.

The purpose is to let another Copilot/Squad session understand the current state immediately.

---

# 25. TESTING

Testing should protect the demo without becoming the project.

Required automated tests:

- opportunity CRUD service
- proposal state transitions
- mock proposal generation service
- proposal export
- basic API health/startup

AI services should be mocked in normal CI tests.

Do not consume Foundry capacity during every automated test run.

One live smoke test is sufficient after deployment.

Avoid trying to reach enterprise code-coverage targets.

---

# 26. GITHUB ACTIONS

Create one simple CI workflow.

On pull request / push:

1. install dependencies
2. lint backend
3. run backend tests
4. build frontend
5. optionally validate Bicep

Do not build elaborate multi-stage release pipelines.

Azure deployment can remain primarily `azd up` for the demo repository.

A CD workflow may be added only if it is trivial after the core demo is complete.

---

# 27. LIVE DEMO EXTENSIBILITY

Create:

`DEMO-EXTENSIONS.md`

Include approximately 8–10 optional enhancements.

Each should contain:

- feature
- business value
- likely files/components
- complexity: Easy or Medium
- sample GitHub Copilot prompt

At least 3 must be extremely easy live-demo changes.

Good examples:

### Easy

- Dark mode
- Industry filter
- Add a new proposal section
- Customer logo field
- Risk severity chart

### Medium

- Proposal comparison
- DOCX export
- Translation
- Proposal quality score
- Commenting on sections

Do not deliberately leave bugs.

The baseline application must work.

---

# 28. DEMO EXTENSION DESIGN PRINCIPLE

Structure the application so new features have obvious insertion points.

Examples:

```text
frontend/components/
backend/agents/
backend/services/
backend/models/
```

Avoid large monolithic files.

Avoid excessive abstraction.

The goal is:

> A GitHub Copilot live prompt should be able to modify the application confidently without first understanding a complex framework.

---

# 29. INITIAL AZURE INSPECTION

Before provisioning:

1. inspect active Azure tenant
2. inspect active Azure subscription
3. print the detected tenant/subscription
4. confirm required service/model availability in Sweden Central
5. confirm that no regional resource will be created outside Sweden Central
6. choose a new dedicated resource group in Sweden Central

Do not modify unrelated resources.

Use a clearly identifiable resource group, for example:

```text
rg-aipf-dev-swc
```

Use consistent tags such as:

```text
project = ai-proposal-factory
purpose = customer-demo
environment = dev
managed-by = azd
```

---

# 30. RESOURCE NAMING

Keep resource names short.

Avoid spending time designing elaborate naming standards.

Suggested pattern:

```text
rg-aipf-dev-swc
ca-aipf-dev
st<a-short-unique-suffix>
srch-aipf-dev
foundry project/resource names with aipf
```

Follow Azure naming restrictions.

---

# 31. WHAT NOT TO DO

Explicitly do NOT:

- create dedicated Assurance agents
- continuously rerun validation
- keep reviewing successful work
- require every optional feature to be perfect
- implement authentication before the application works
- configure private networking
- create multiple web applications when one is enough
- create a separate Content Retrieval agent just to increase agent count
- use Hosted Agents without a technical requirement
- build custom orchestration frameworks
- build a distributed event architecture
- create Cosmos DB automatically just because it is listed in an old architecture
- create Key Vault without secrets
- build API Management
- add infrastructure that is not used
- attempt production-grade security certification
- perform load testing
- run exhaustive performance optimization
- spend long periods fixing cosmetic issues
- block completion because an optional extension is incomplete

---

# 32. DECISION PRIORITY

When making technical decisions, use this order:

1. Does the end-to-end customer demo work?
2. Is it reliable?
3. Is it fast to deploy?
4. Is it easy to understand?
5. Is it easy for GitHub Copilot to extend?
6. Is it reasonably secure for synthetic demo data?
7. Is it aesthetically polished?

Production enterprise completeness is not a primary objective.

---

# 33. FINAL SMOKE TEST

Do one final smoke-test pass.

The test should verify:

## Infrastructure

- Container App exists
- Foundry project exists
- expected agents exist
- Azure AI Search exists
- Storage Account exists

## Website

- `GET /api/health` returns success
- homepage loads through public application URL
- opportunities are visible

## Data

- synthetic opportunities exist
- reusable knowledge exists
- meeting-note samples exist

## AI

- Requirements Analyst responds
- Proposal Writer responds
- retrieval returns useful content
- Risk Reviewer responds

## Workflow

Using one seeded opportunity:

1. open opportunity
2. select meeting notes
3. generate proposal
4. confirm all main sections appear
5. confirm risk findings appear
6. edit one section
7. regenerate one section
8. approve one section
9. approve proposal
10. export PDF
11. confirm audit records exist

If this works, the project is complete.

Do not start a separate assurance cycle after this passes.

---

# 34. DEFINITION OF DONE

The task is complete when:

- Azure deployment succeeds
- I have one working browser URL
- the website opens without requiring a login
- seeded opportunities are visible
- reusable knowledge is available
- meeting notes are available
- Foundry Agents are deployed/configured
- Requirements Analyst works
- Proposal Writer works
- Azure AI Search retrieval works
- Risk Reviewer works
- a complete proposal can be generated
- proposal sections can be edited
- individual sections can be regenerated
- sections can be approved
- the proposal can be approved
- PDF export works
- Markdown export works
- basic audit history is visible
- infrastructure is represented in Bicep
- `azd` deployment is documented
- tests pass
- repository documentation exists
- `DEMO-EXTENSIONS.md` exists
- the final smoke test passes

Then STOP.

Do not continue adding architecture, agents, reviews, optimizations, or optional features after the Definition of Done passes.

---

# 35. EXPECTED FINAL HANDOFF

At completion, give me:

1. **Application URL**
2. **Resource group**
3. **Foundry project name**
4. **Foundry agent names**
5. **Main Azure resources**
6. **How to redeploy**
7. **How a colleague can deploy their own copy**
8. **Demo flow**
9. **Known optional limitations**
10. **Recommended live GitHub Copilot extension to demonstrate first**

Keep this handoff concise.

---

# 36. START NOW

Start by:

1. casting the small Squad team,
2. inspecting the active Azure tenant/subscription,
3. confirming Sweden Central as the mandatory and only deployment region,
4. proposing the minimal resource list,
5. creating the repository skeleton,
6. deploying the initial web application as early as possible.

Do not wait for another approval step unless an action would be destructive or the Azure subscription cannot be determined.

Prioritize a working deployed URL before secondary functionality.

The governing principle for the entire project is:

> **Build the smallest polished Foundry-powered solution that demonstrates the full customer story reliably, deploy it early, validate it once, and stop when it works.**
