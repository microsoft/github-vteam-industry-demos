# AI Proposal Factory — GitHub Copilot CLI + Squad Live Demo Playbook

## Purpose

This document is for colleagues who clone and deploy the **AI Proposal Factory** baseline and then want to demonstrate **live application changes using GitHub Copilot CLI + Squad** during a customer meeting.

The baseline application should already be fully deployed and working before attempting any live extension.

The goal of the live extension is to show:

1. A real working application already running in Azure.
2. A customer asks for a new requirement.
3. GitHub Copilot CLI + Squad implements that requirement.
4. The updated application is redeployed quickly.
5. The same application URL is refreshed and the customer sees the new capability.

## 1. Live Demo Principle

During a customer demo, prefer **small, visible, low-risk application changes**.

Good live-demo changes usually:
- reuse existing application data,
- change only frontend or lightweight backend logic,
- do not provision new Azure resources,
- do not change networking,
- do not change authentication,
- do not change the Foundry project architecture,
- do not create new model deployments,
- do not create new Search services or indexes,
- do not require a full `azd up`,
- can be deployed using `azd deploy app`.

Ideal flow:

```text
Customer asks for a change
        ↓
Open GitHub Copilot CLI + Squad
        ↓
Give Squad a tested prompt
        ↓
Squad modifies the application
        ↓
Relevant tests/build pass
        ↓
azd deploy app
        ↓
Refresh the same application URL
        ↓
New capability appears
```

## 2. Before the Customer Demo

The colleague should already have deployed the baseline successfully.

```powershell
git clone <private-repository-url>
cd <repository-folder>

az login
az account set --subscription "<subscription-id>"

azd auth login
azd env new <environment-name>
azd env set AZURE_SUBSCRIPTION_ID "<subscription-id>"
azd env set AZURE_LOCATION swedencentral

azd up
```

Initialize fresh Squad state:

```powershell
squad init
squad doctor
copilot --agent squad
```

Do not reuse another person's `.squad` state.

## 3. Standard Live-Demo Guardrail Prompt

Add the following constraints to live-demo requests when appropriate:

```text
This is a live customer demonstration.

Use the existing Squad team only.
Do not cast additional Squad members.
Do not create Assurance, audit, architecture-review, security-review, or continuous-validation agents.

Do not modify Azure infrastructure.
Do not run azd up.
Do not create new Azure resources.
Do not modify networking, authentication, Managed Identity, Search architecture, Foundry architecture, or model deployments.

Make the minimum application change required.
Reuse the existing data, APIs, persistence, Foundry Agents, and Azure services where possible.

Run only the relevant tests/build checks.

When the feature is working, deploy only the existing application using:

azd deploy app

Keep the same application URL.

Stop when the requested feature is implemented, tested, and deployed.
```

## 4. Recommended Live Demo Extensions

### USE CASE 1 — Opportunity Industry Filter

**Recommended level:** Very Easy — safest live demo

**Customer story:** A sales manager wants to quickly filter opportunities by industry.

**Why it works well live:** Existing data, highly visible, normally frontend-only, no AI or infrastructure changes.

**Prompt:**

```text
This is a live customer demonstration.

Add an Industry filter to the Opportunity Dashboard.

Requirements:
- Add a clean Industry dropdown near the existing dashboard controls.
- Include "All Industries".
- Populate remaining options from industries already present in the loaded opportunity data.
- Selecting an industry must immediately filter the opportunity list/cards.
- Preserve the current styling and responsive layout.
- Do not change backend APIs unless absolutely necessary.
- Do not change Azure infrastructure, Foundry Agents, Search, Storage, authentication, or networking.
- Do not add new Squad members or review agents.
- Run only relevant frontend tests/build validation.
- Deploy only the application update using `azd deploy app`.
- Keep the same application URL.
- Stop when the filter works in the deployed application.
```

### USE CASE 2 — Dashboard KPI Cards

**Recommended level:** Very Easy

**Customer story:** Leadership wants an executive summary of the current opportunity pipeline.

Add four KPI cards:
- Total Opportunities
- Estimated Pipeline Value
- Proposals In Review
- Approved Proposals

**Prompt:**

```text
This is a live customer demonstration.

Add four executive KPI cards above the Opportunity Dashboard:

1. Total Opportunities
2. Estimated Pipeline Value
3. Proposals In Review
4. Approved Proposals

Requirements:
- Calculate the values from data already available to the dashboard.
- Format pipeline value professionally.
- Keep the cards visually consistent with the existing application.
- Make them responsive.
- Do not introduce a charting library unless necessary.
- Do not modify Azure infrastructure, Foundry, Search, Storage, authentication, or networking.
- Do not add new Squad members or Assurance/review agents.
- Run only the relevant build/tests.
- Deploy only the existing application with `azd deploy app`.
- Keep the same URL.
- Stop after the deployed dashboard shows the new KPI cards correctly.
```

### USE CASE 3 — Risk Severity Summary

**Recommended level:** Very Easy / Easy — highly recommended

**Customer story:** A delivery executive wants an immediate overview of proposal risk.

Show counts for:
- High
- Medium
- Low

**Prompt:**

```text
This is a live customer demonstration.

Add a visual Risk Severity Summary to the Proposal Workspace.

Requirements:
- Use the existing risk findings already returned by the application.
- Show counts for High, Medium, and Low severity.
- Add a simple professional visualization above the detailed risk findings.
- Prefer lightweight CSS/HTML visualization or an existing project dependency rather than adding a large chart library.
- Keep the detailed risk list unchanged.
- The summary must update based on the currently loaded proposal.
- Preserve the existing Professional Services visual design.
- Do not modify the Risk Reviewer Agent or any Foundry configuration.
- Do not modify Azure infrastructure, Search, Storage, authentication, or networking.
- Do not create new Squad/review agents.
- Run relevant frontend tests/build checks only.
- Deploy with `azd deploy app`.
- Keep the same application URL.
- Stop when the deployed Proposal Workspace shows the severity summary correctly.
```

### USE CASE 4 — Risk Severity Filter

**Recommended level:** Very Easy

**Customer story:** A project manager only wants to review critical findings.

**Prompt:**

```text
This is a live customer demonstration.

Add risk severity filtering to the existing Risk Review experience.

Requirements:
- Add All, High, Medium, and Low filters.
- Default to All.
- Filter the already loaded risk findings client-side.
- Show the number of findings for each severity where practical.
- Preserve the current risk cards/table and design.
- Do not change backend APIs or Foundry Agents unless absolutely necessary.
- Do not change Azure infrastructure.
- Do not cast additional Squad or review agents.
- Run relevant frontend validation.
- Deploy with `azd deploy app`.
- Keep the current application URL.
- Stop when filtering works in the deployed application.
```

### USE CASE 5 — Proposal Quality Score

**Recommended level:** Easy

**Customer story:** A proposal manager wants a simple indication of whether a proposal is ready for review.

Suggested inputs:
- percentage of sections populated,
- percentage approved,
- unresolved high-severity risks,
- unresolved open questions.

**Prompt:**

```text
This is a live customer demonstration.

Add a Proposal Quality Score to the Proposal Workspace.

Requirements:
- Show an overall score from 0 to 100.
- Calculate it deterministically from information already available in the application.
- Consider section completeness, section approval state, unresolved high-severity risks, and open questions.
- Show 2–4 contributing indicators so the score is explainable.
- Do not create a new Foundry Agent.
- Do not call the model to calculate the score.
- Keep the implementation simple and easy to understand.
- Preserve the existing application design.
- Do not modify Azure infrastructure, Foundry, Search, Storage, networking, or authentication.
- Use the existing Squad team only.
- Run focused tests/build validation.
- Deploy only the application with `azd deploy app`.
- Keep the same URL.
- Stop when the score is visible and updates correctly for the loaded proposal.
```

### USE CASE 6 — Add a New Proposal Section

**Recommended level:** Easy / Medium

**Customer story:** A consulting organization wants every proposal to include change-management planning.

Add:
**Change Management & Adoption**

**Prompt:**

```text
This is a live customer demonstration.

Add a new proposal section called:

"Change Management & Adoption"

Requirements:
- Include it in the Proposal Writer instructions/output.
- Integrate it using the same section model/pattern used by existing proposal sections.
- Display it in the Proposal Workspace.
- Support manual editing.
- Support section regeneration.
- Support section approval.
- Include it in Markdown export.
- Include it in PDF export.
- Preserve compatibility with existing proposals where practical.
- Reuse the current Foundry Proposal Writer Agent rather than creating a new agent.
- Do not modify Azure infrastructure, Search architecture, networking, authentication, or model deployment.
- Do not create additional Squad/review agents.
- Run focused tests for section handling/export plus required frontend/backend builds.
- Deploy using `azd deploy app`.
- Keep the existing application URL.
- Stop after the new section works end-to-end.
```

### USE CASE 7 — Proposal Section Comments

**Recommended level:** Medium

**Customer story:** Reviewers want to leave comments without directly rewriting proposal content.

**Prompt:**

```text
This is a live customer demonstration.

Add lightweight reviewer comments to proposal sections.

Requirements:
- Allow a user to add one or more comments to an individual proposal section.
- Display comments clearly below or beside the relevant section.
- Persist comments using the existing application persistence mechanism.
- Do not introduce a new database or Azure service.
- Comments should remain separate from the proposal text.
- Keep the implementation simple: no @mentions, notifications, email, or complex collaboration workflow.
- Preserve existing editing, regeneration, and approval functionality.
- Do not modify Foundry Agents or Azure infrastructure.
- Use the existing Squad team only.
- Add focused persistence/API tests and relevant frontend validation.
- Deploy with `azd deploy app`.
- Keep the same URL.
- Stop when comments persist and reopen correctly.
```

### USE CASE 8 — Customer Branding Accent

**Recommended level:** Easy

**Customer story:** A Professional Services team wants proposals to feel more tailored to each customer.

**Prompt:**

```text
This is a live customer demonstration.

Add lightweight customer branding to opportunities.

Requirements:
- Add an optional customer accent color field to the opportunity.
- Provide a sensible default if no color is selected.
- Use the accent color subtly in the Proposal Workspace header and, where straightforward, the exported PDF header.
- Do not redesign the application.
- Do not add image/logo upload for this demo.
- Preserve accessibility/readability.
- Store the value using the existing opportunity persistence model.
- Do not modify Azure infrastructure, Foundry Agents, Search, networking, or authentication.
- Use the existing Squad team only.
- Run relevant tests/build validation.
- Deploy with `azd deploy app`.
- Keep the same URL.
- Stop once the branding change persists and renders correctly.
```

### USE CASE 9 — Proposal Comparison

**Recommended level:** Medium / Advanced live demo

**Customer story:** A reviewer wants to understand what changed after regenerating a proposal section.

**Prompt:**

```text
This is a live customer demonstration.

Add a lightweight proposal section comparison experience.

Requirements:
- When a proposal section is regenerated, preserve the immediately previous version.
- Add a "Compare previous version" action.
- Show Previous and Current content side-by-side or in a simple comparison panel.
- Only one previous version is required for this demo.
- Do not build a complete version-control system.
- Reuse the current application persistence mechanism.
- Do not add new Azure services.
- Do not modify Foundry architecture or Search.
- Use the existing Squad team only.
- Add focused tests for regeneration/version persistence.
- Deploy with `azd deploy app`.
- Keep the same application URL.
- Stop when the previous/current comparison works for regenerated sections.
```

### USE CASE 10 — Translate Approved Proposal

**Recommended level:** Medium / Advanced

**Customer story:** A global Professional Services team wants a customer-facing proposal in another language.

**Prompt:**

```text
This is a live customer demonstration.

Add a lightweight "Translate Proposal" action for approved proposals.

Requirements:
- Support Portuguese, French, and Finnish.
- Reuse the existing Microsoft Foundry model/project.
- Do not create another Azure resource or model deployment.
- Do not create a new autonomous agent unless the current application architecture absolutely requires it.
- Prefer a simple backend translation operation using the existing AI integration.
- Translate the customer-facing proposal sections while preserving headings/structure.
- Keep the original proposal unchanged.
- Present the translated result as a separate preview or downloadable Markdown result.
- Do not build a complete localization framework.
- Use the existing Squad team only.
- Run focused tests/build validation.
- Deploy with `azd deploy app`.
- Keep the same URL.
- Stop when one approved proposal can be translated successfully.
```

## 5. Recommended Demo Set

Start by certifying these three:

1. **Industry Filter**
2. **Dashboard KPI Cards**
3. **Risk Severity Summary**

They should be the safest standard live-demo options.

Then test:
4. Proposal Quality Score
5. New Proposal Section
6. Customer Branding
7. Section Comments
8. Proposal Comparison
9. Translation

## 6. Avoid These Changes During a Short Live Demo

Avoid:
- Entra authentication
- private networking
- Private Endpoints
- API Management
- changing Foundry region
- changing model deployment type
- provisioning another model
- another Search service
- redesigning Search indexes
- Cosmos DB
- Service Bus
- Event Grid
- another Container App
- AKS
- replacing persistence architecture
- Hosted Agents
- redesigning Managed Identity/RBAC
- VNet changes
- major Bicep work

These are better workshop scenarios than short live-demo extensions.

## 7. How to Test an Extension

Assume the baseline tag is:

```text
v1.0-demo-baseline
```

Create a temporary branch:

```powershell
git switch -c demo-test/industry-filter v1.0-demo-baseline
```

Start Squad:

```powershell
copilot --agent squad
```

Use the exact prompt intended for colleagues.

Record:
- implementation time,
- test/build time,
- deployment time,
- total demo time,
- files changed,
- whether infrastructure was touched,
- whether manual intervention was required,
- whether the same URL remained available,
- whether the result looked good enough for a customer.

After testing:

```powershell
git switch main
git branch -D demo-test/industry-filter
```

## 8. Extension Certification Table

| Extension | Level | Infrastructure Changes | Tested | Live Demo Status |
|---|---|---:|---:|---|
| Industry Filter | Very Easy | None | No | Pending |
| Dashboard KPI Cards | Very Easy | None | No | Pending |
| Risk Severity Summary | Very Easy / Easy | None | No | Pending |
| Risk Severity Filter | Very Easy | None | No | Pending |
| Proposal Quality Score | Easy | None | No | Pending |
| New Proposal Section | Easy / Medium | None | No | Pending |
| Customer Branding | Easy | None | No | Pending |
| Section Comments | Medium | None | No | Pending |
| Proposal Comparison | Medium | None | No | Pending |
| Translation | Medium | None | No | Pending |

Suggested status values:
- Recommended
- Recommended with notes
- Advanced
- Do not use live
- Pending test

## 9. Certification Criteria

A live extension should be marked **Recommended** only when:
- the exact prompt has been tested,
- Squad does not create unnecessary agents,
- no new Azure resource is required,
- no infrastructure deployment is required,
- existing application behavior remains intact,
- relevant tests/build pass,
- `azd deploy app` succeeds,
- the same application URL remains valid,
- the feature is visually obvious,
- the implementation is predictable enough for a customer meeting.

## 10. Reset / Rollback Strategy

Create a disposable customer branch from the baseline:

```powershell
git switch -c customer-demo/acme v1.0-demo-baseline
```

Run the live extension there.

After the meeting, keep or discard the branch.

Return to normal development:

```powershell
git switch main
```

Avoid making experiments directly on the frozen baseline tag.

## 11. Azure Deployment Distinction

Initial environment:

```powershell
azd up
```

Live application-only change:

```powershell
azd env select <environment-name>
azd deploy app
```

During normal live-demo extensions, do not rerun infrastructure provisioning.

## 12. Suggested Customer Demo Narrative

**Part 1 — Show the finished application**

> "This is AI Proposal Factory, a Microsoft Foundry-powered Professional Services solution created with GitHub Copilot CLI and Squad."

Show:
- opportunities,
- requirements,
- meeting notes,
- proposal generation,
- retrieved knowledge,
- risks,
- approvals,
- export.

**Part 2 — Introduce a requirement**

> "Imagine the delivery leader now says they need a visual overview of proposal risk."

**Part 3 — Ask Squad**

```powershell
copilot --agent squad
```

Paste the tested Risk Severity Summary prompt.

**Part 4 — Deploy only the application**

```powershell
azd deploy app
```

**Part 5 — Refresh the same URL**

Show the new feature.

**Part 6 — Explain the value**

> "The important point is not just that Copilot can generate code. It can understand an existing multi-layer application, implement a new business requirement, validate it, and update the deployed solution."

## 13. Baseline Rule

The baseline must remain a complete application without any live extension.

Live-demo extensions are optional enhancements designed to demonstrate GitHub Copilot CLI + Squad.

Never intentionally remove baseline functionality so Copilot can add it during the meeting.

## 14. Quick Reference

Start Squad:

```powershell
squad status
copilot --agent squad
```

Deploy application-only change:

```powershell
azd env select <environment-name>
azd deploy app
```

Create clean demo branch:

```powershell
git switch -c customer-demo/<customer-name> v1.0-demo-baseline
```

Return to main:

```powershell
git switch main
```

## 15. Live Demo Checklist

Before:
- baseline application is healthy,
- correct azd environment is selected,
- browser URL is open,
- Git branch is disposable,
- Squad is initialized locally,
- selected prompt has been tested,
- Azure login is valid,
- no infrastructure change is required.

During:
- explain the business requirement first,
- paste the prepared prompt,
- show Copilot/Squad working,
- avoid changing scope midway,
- deploy only the app,
- refresh the same URL.

After:
- record whether the prompt was successful,
- update the certification status,
- keep or discard the demo branch,
- do not alter the frozen baseline tag.

## 16. Governing Principle

> **Use GitHub Copilot CLI + Squad to make a small, meaningful, visible business change to an already-working application, validate only what matters, deploy only the application, and show the result at the same URL.**
