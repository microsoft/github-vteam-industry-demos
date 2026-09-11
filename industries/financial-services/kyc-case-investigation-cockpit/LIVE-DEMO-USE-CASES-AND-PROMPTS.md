# KYC Case Investigation Cockpit — GitHub Copilot CLI + Squad Live Demo Playbook

## Purpose

This document is for colleagues who clone and deploy the **KYC Case Investigation Cockpit** baseline and then want to demonstrate **live application changes using GitHub Copilot CLI + Squad** during a Financial Services customer meeting.

The baseline application should already be fully deployed and working before attempting any live extension.

The goal of the live extension is to show:

1. A real working Financial Services application already running in Azure.
2. A customer asks for a new requirement.
3. GitHub Copilot CLI + Squad understands the existing application.
4. Squad implements the requirement.
5. Focused tests/build validation pass.
6. Only the existing application is redeployed.
7. The same application URL is refreshed.
8. The customer sees the new capability.

The live extension should demonstrate **application evolution**, not infrastructure provisioning.

---

# 1. Live Demo Principle

During a customer demo, prefer **small, visible, low-risk application changes**.

Good live-demo changes usually:

- reuse existing KYC case data,
- reuse existing APIs,
- reuse existing Foundry Agents,
- reuse existing Document Intelligence results,
- change only frontend or lightweight backend logic,
- do not provision new Azure resources,
- do not change networking,
- do not change authentication,
- do not change Managed Identity or RBAC,
- do not change the Foundry project architecture,
- do not create new model deployments,
- do not change Document Intelligence configuration,
- do not require a full `azd up`,
- can be deployed using `azd deploy web`,
- preserve the same public application URL.

Ideal flow:

```text
Customer asks for a change
        ↓
Open GitHub Copilot CLI + Squad
        ↓
Give Squad a tested prompt
        ↓
Squad modifies the existing application
        ↓
Relevant tests/build pass
        ↓
azd deploy web
        ↓
Refresh the same application URL
        ↓
New capability appears
```

The baseline must remain a complete working application without any live extension.

---

# 2. Before the Customer Demo

The colleague should already have deployed their own independent copy of the baseline.

Example:

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

Get the application URL:

```powershell
azd env get-value SERVICE_WEB_URI
```

Initialize fresh Squad state locally:

```powershell
squad init
squad doctor
copilot --agent squad
```

Each colleague should use their **own local Squad working state**.

Do not reuse another person's mutable `.squad` memories, histories, audit trails, or working-session state.

---

# 3. Standard Live-Demo Guardrail Prompt

Add the following constraints to live-demo requests when appropriate:

```text
This is a live customer demonstration.

Use the existing Squad team only.
Do not cast additional Squad members.
Do not create Assurance, audit, architecture-review, security-review, compliance-review, QA-review, or continuous-validation agents.

Do not modify Azure infrastructure.
Do not run azd up.
Do not create new Azure resources.
Do not modify networking, authentication, Managed Identity, RBAC, Foundry architecture, model deployments, or Document Intelligence configuration.

Make the minimum application change required.
Reuse the existing KYC data, APIs, persistence mechanism, Foundry Agents, and Azure services where possible.

Run only the relevant tests/build checks.

When the feature is working, deploy only the existing application using:

azd deploy web

Keep the same application URL.

Stop when the requested feature is implemented, tested, and deployed.
```

---

# 4. Recommended Live Demo Extensions

## USE CASE 1 — Country Filter

**Recommended level:** Very Easy — safest live demo  
**Live-demo risk:** Low  
**Infrastructure changes:** None

### Customer story

A KYC operations manager wants to quickly filter onboarding cases by country of incorporation.

### Why it works well live

- highly visible,
- uses data already present in the dashboard,
- normally frontend-only,
- no AI changes,
- no Azure changes,
- easy for the customer to understand immediately.

### Expected implementation area

Primarily the KYC case dashboard frontend.

### Prompt

```text
This is a live customer demonstration.

Add a Country filter to the KYC Case Dashboard.

Requirements:
- Add a clean country dropdown beside the existing dashboard filters.
- Include "All Countries".
- Populate the remaining options from countries already present in the loaded KYC case data.
- Selecting a country must immediately filter the visible cases.
- Preserve the existing status and risk filters.
- Preserve the current visual design and responsive layout.
- Do not change backend APIs unless absolutely necessary.
- Do not modify Azure infrastructure, Foundry Agents, Document Intelligence, Storage, authentication, networking, Managed Identity, or model deployments.
- Do not add Squad members or review/Assurance agents.
- Run only the relevant frontend tests/build validation.
- Deploy only the existing application using `azd deploy web`.
- Keep the same application URL.
- Stop when the filter works correctly in the deployed dashboard.
```

### Verify after deployment

- `All Countries` shows the full case list.
- Selecting Sweden, Ireland, or another seeded country filters correctly.
- Existing status/risk filters still work.
- Same URL remains valid.

---

## USE CASE 2 — Dashboard KPI Cards

**Recommended level:** Very Easy  
**Live-demo risk:** Low  
**Infrastructure changes:** None

### Customer story

A KYC operations manager wants an immediate executive overview of the onboarding queue.

### Suggested KPIs

- Active Cases
- High-Risk Cases
- Awaiting Information
- Completed / Escalated Cases

### Why it works well live

It is visually obvious, business-friendly, deterministic, and based on data already loaded by the dashboard.

### Expected implementation area

Dashboard frontend only, unless existing data loading requires a very small API adjustment.

### Prompt

```text
This is a live customer demonstration.

Add four executive KPI cards to the KYC Case Dashboard:

1. Active Cases
2. High-Risk Cases
3. Awaiting Information
4. Completed / Escalated Cases

Requirements:
- Calculate all values from case data already available to the dashboard.
- Do not introduce new persistence or backend infrastructure.
- Keep the cards visually consistent with the existing KYC Cockpit.
- Make the layout responsive.
- Preserve all current dashboard filters and navigation.
- Do not modify Azure infrastructure, Foundry Agents, Document Intelligence, Storage, authentication, networking, Managed Identity, or model deployments.
- Do not add Squad members or Assurance/review agents.
- Run only the relevant frontend tests/build validation.
- Deploy only the existing application using `azd deploy web`.
- Keep the same application URL.
- Stop when the KPI cards show correct values in the deployed application.
```

### Verify after deployment

- Counts match currently loaded case data.
- Cards remain readable at common browser sizes.
- Filtering the table does not incorrectly change global KPIs unless intentionally designed to do so.

---

## USE CASE 3 — Risk Severity Summary

**Recommended level:** Very Easy / Easy  
**Live-demo risk:** Low  
**Infrastructure changes:** None

### Customer story

A KYC analyst wants to understand the overall risk profile of a case before reading every individual finding.

### Why it works well live

It reuses existing risk findings and produces a strong visible change without altering AI logic.

### Expected implementation area

Case investigation workspace frontend.

### Prompt

```text
This is a live customer demonstration.

Add a Risk Severity Summary to the KYC case investigation workspace.

Requirements:
- Use the existing Risk Findings already returned by the application.
- Show counts for High, Medium, and Low severity findings.
- Add a simple professional visual summary above the detailed risk findings.
- Prefer lightweight HTML/CSS or an existing dependency rather than adding a large charting library.
- Keep the detailed risk findings unchanged.
- The summary must update based on the currently opened case.
- Do not modify the Risk Investigation Agent or any Foundry configuration.
- Do not modify Azure infrastructure, Document Intelligence, Storage, authentication, networking, Managed Identity, or model deployments.
- Do not create additional Squad/review agents.
- Run focused frontend validation only.
- Deploy using `azd deploy web`.
- Keep the same application URL.
- Stop when the deployed case workspace shows correct severity counts.
```

### Verify after deployment

- Counts match the detailed findings.
- The primary demo case shows its expected risk distribution.
- No changes occurred to Foundry agent behavior.

---

## USE CASE 4 — Risk Severity Filter

**Recommended level:** Very Easy  
**Live-demo risk:** Low  
**Infrastructure changes:** None

### Customer story

An analyst wants to focus only on high-priority findings instead of scanning every risk item.

### Expected implementation area

Risk findings frontend.

### Prompt

```text
This is a live customer demonstration.

Add risk severity filtering to the existing Risk Findings experience.

Requirements:
- Add filters for All, High, Medium, and Low.
- Default to All.
- Filter the already loaded risk findings client-side where practical.
- Show the number of findings for each severity if easy.
- Preserve the current cards/table and visual design.
- Do not change backend APIs or Foundry Agents unless absolutely necessary.
- Do not modify Azure infrastructure, Document Intelligence, networking, authentication, Managed Identity, or model deployment.
- Do not add Squad members or review/Assurance agents.
- Run only relevant frontend validation.
- Deploy using `azd deploy web`.
- Keep the current application URL.
- Stop when severity filtering works in the deployed application.
```

### Verify after deployment

- All shows every finding.
- High/Medium/Low show only matching findings.
- Empty states are handled cleanly.

---

## USE CASE 5 — Evidence Completeness Score

**Recommended level:** Easy  
**Live-demo risk:** Low  
**Infrastructure changes:** None

### Customer story

A KYC analyst wants one clear indicator of how complete the onboarding evidence is.

### Example

```text
4 of 5 required evidence checks complete — 80%
```

### Why it works well live

It adds an explainable business metric without introducing another AI call.

### Expected implementation area

Case detail / completeness panel.

### Prompt

```text
This is a live customer demonstration.

Add an Evidence Completeness Score to the KYC case workspace.

Requirements:
- Calculate a deterministic score from the existing completeness findings.
- Show both the percentage and an explanation such as "4 of 5 required checks complete".
- Treat statuses consistently and document the rule in code.
- Do not call a model to calculate this score.
- Do not create a new Foundry Agent.
- Keep the detailed completeness checklist unchanged.
- Preserve the existing application design.
- Do not modify Azure infrastructure, Foundry, Document Intelligence, Storage, networking, authentication, Managed Identity, or model deployment.
- Use the existing Squad team only.
- Run focused tests/build validation.
- Deploy only the application using `azd deploy web`.
- Keep the same URL.
- Stop when the score is correct for the loaded case.
```

### Verify after deployment

- Score matches the checklist.
- Missing/Needs Review/Conflicting handling is sensible and deterministic.
- Existing checklist still works.

---

## USE CASE 6 — Ownership Complexity Indicator

**Recommended level:** Easy  
**Live-demo risk:** Low / Moderate  
**Infrastructure changes:** None

### Customer story

An analyst wants a quick visual clue that a company has a more involved ownership structure.

### Suggested labels

- Simple
- Moderate
- Complex

### Important

This is a **demo indicator**, not an AML or regulatory risk conclusion.

### Expected implementation area

Ownership view / case summary frontend, with lightweight deterministic business logic.

### Prompt

```text
This is a live customer demonstration.

Add a lightweight Ownership Complexity Indicator to the KYC case workspace.

Requirements:
- Use only ownership data already present in the loaded case.
- Classify the structure as Simple, Moderate, or Complex using an explainable deterministic rule.
- Consider factors such as number of ownership layers, number of beneficial owners, and number of intermediary entities.
- Show a short explanation of why the displayed label was selected.
- Clearly label this as a demo operational indicator, not a regulatory or AML conclusion.
- Do not create a new AI Agent.
- Do not modify the Risk Investigation Agent.
- Do not modify Azure infrastructure, Foundry architecture, Document Intelligence, networking, authentication, Managed Identity, or model deployments.
- Use the existing Squad team only.
- Run focused tests/build checks.
- Deploy using `azd deploy web`.
- Keep the same application URL.
- Stop when the indicator is visible and correct for existing seeded cases.
```

### Verify after deployment

- Different ownership structures can produce different labels.
- Explanation is understandable.
- No regulatory conclusion is implied.

---

## USE CASE 7 — Request More Information Draft

**Recommended level:** Easy  
**Live-demo risk:** Low  
**Infrastructure changes:** None

### Customer story

An analyst decides more evidence is required and wants the system to prepare a clear request based on the missing information already identified.

### Why it works well live

It connects existing completeness/risk findings to the human decision process and demonstrates workflow improvement without adding another Azure service.

### Expected implementation area

Decision workflow frontend and lightweight backend logic.

### Prompt

```text
This is a live customer demonstration.

Improve the existing "Request More Information" analyst action by generating a lightweight customer-facing draft from the case's existing findings.

Requirements:
- When the analyst chooses "Request More Information", prepare a draft using the already identified missing evidence, conflicting evidence, and open questions.
- Prefer deterministic templating from existing application data for reliability.
- Do not call a new model unless the existing implementation already provides a trivial reusable method.
- The analyst must be able to edit the draft before confirming the action.
- Do not automatically send email.
- Do not change the final human-controlled decision workflow.
- Preserve audit history.
- Do not create a new Foundry Agent.
- Do not modify Azure infrastructure, Document Intelligence, authentication, networking, Managed Identity, or model deployment.
- Use the existing Squad team only.
- Run focused tests for the decision flow.
- Deploy using `azd deploy web`.
- Keep the same URL.
- Stop when the editable request draft works in the deployed application.
```

### Verify after deployment

- Draft reflects current missing/open items.
- Analyst can edit before confirmation.
- No message is sent externally.
- Decision/audit flow remains intact.

---

## USE CASE 8 — Analyst Internal Case Notes

**Recommended level:** Easy  
**Live-demo risk:** Low / Moderate  
**Infrastructure changes:** None

### Customer story

KYC analysts want to leave internal investigation notes without changing extracted evidence or AI-generated findings.

### Expected implementation area

Case workspace plus existing application persistence mechanism.

### Prompt

```text
This is a live customer demonstration.

Add lightweight Analyst Internal Notes to a KYC case.

Requirements:
- Allow the analyst to add a text note to the current case.
- Display notes chronologically.
- Store them using the application's existing persistence mechanism.
- Do not create a new database or Azure service.
- Keep analyst notes separate from AI-generated findings and extracted facts.
- If straightforward, create an audit event when a note is added.
- Do not add mentions, notifications, email, or complex collaboration.
- Preserve the existing investigation and decision workflow.
- Do not modify Foundry Agents, Document Intelligence, Azure infrastructure, networking, authentication, Managed Identity, or model deployment.
- Use the existing Squad team only.
- Add focused persistence/API tests where relevant.
- Deploy using `azd deploy web`.
- Keep the same URL.
- Stop when notes can be added and displayed correctly.
```

### Verify after deployment

- Note appears on the correct case.
- Existing findings are unchanged.
- Audit entry appears if implemented.

---

## USE CASE 9 — KYC Investigation Export

**Recommended level:** Easy / Medium  
**Live-demo risk:** Moderate  
**Infrastructure changes:** None

### Customer story

An analyst wants to export a concise investigation summary for internal review.

### Suggested content

- customer overview,
- ownership summary,
- evidence completeness,
- risk findings,
- AI recommendation,
- human decision if available,
- analyst notes where appropriate.

### Expected implementation area

Backend export logic and a small frontend action.

### Prompt

```text
This is a live customer demonstration.

Add a lightweight KYC Investigation Export for the currently opened case.

Requirements:
- Add an "Export Investigation" action.
- Prefer Markdown export first; add PDF only if the repository already has a lightweight PDF mechanism or it can be implemented safely without new infrastructure.
- Include:
  - customer overview,
  - company identifiers,
  - ownership summary,
  - evidence completeness,
  - risk findings,
  - AI recommended next action,
  - human analyst decision if one exists.
- Clearly distinguish AI-generated assistance from human decisions.
- Use only existing case data.
- Do not create another Azure service.
- Do not modify Foundry Agents, Document Intelligence, Azure infrastructure, authentication, networking, Managed Identity, or model deployment.
- Use the existing Squad team only.
- Run focused export/API tests and relevant build validation.
- Deploy using `azd deploy web`.
- Keep the same application URL.
- Stop when export works for the primary demo case.
```

### Verify after deployment

- Export contains correct case information.
- AI recommendation and human decision are clearly distinguished.
- No new Azure resources were created.

---

## USE CASE 10 — Dashboard Risk Visualization

**Recommended level:** Very Easy / Easy  
**Live-demo risk:** Low  
**Infrastructure changes:** None

### Customer story

A KYC operations manager wants to see how the onboarding queue is distributed across risk levels.

### Why it works well live

It is visual, easy to understand, and calculated from existing case data.

### Expected implementation area

Dashboard frontend.

### Prompt

```text
This is a live customer demonstration.

Add a lightweight Risk Distribution visualization to the KYC Case Dashboard.

Requirements:
- Use existing case risk levels.
- Show the number or proportion of Low, Medium, and High risk cases.
- Prefer simple CSS/HTML or an existing dependency rather than adding a large chart library.
- Keep the visualization compact and consistent with the existing dashboard design.
- Do not change backend APIs unless absolutely necessary.
- Do not modify Azure infrastructure, Foundry Agents, Document Intelligence, Storage, networking, authentication, Managed Identity, or model deployment.
- Do not cast new Squad members or review agents.
- Run relevant frontend validation.
- Deploy with `azd deploy web`.
- Keep the same application URL.
- Stop when the risk visualization renders correctly in the deployed dashboard.
```

### Verify after deployment

- Counts/distribution match seeded case data.
- Visualization works at standard screen sizes.
- Existing dashboard remains unchanged otherwise.

---

# 5. Recommended Standard Demo Set

Certify these three first:

1. **Country Filter**
2. **Dashboard KPI Cards**
3. **Risk Severity Summary**

These are the safest because they:

- make an immediate visual difference,
- are easy to explain,
- use existing data,
- normally require little or no backend work,
- do not touch the AI architecture,
- do not touch Azure infrastructure,
- should be predictable during a live customer meeting.

After those are proven, test:

4. Risk Severity Filter  
5. Evidence Completeness Score  
6. Ownership Complexity Indicator  
7. Request More Information Draft  
8. Analyst Internal Notes  
9. KYC Investigation Export  
10. Dashboard Risk Visualization

---

# 6. Extension Certification Table

| Extension | Level | Infrastructure Changes | Tested | Typical Time | Live Demo Status |
|---|---|---:|---:|---:|---|
| Country Filter | Very Easy | None | No | 3–5 min | Pending test |
| Dashboard KPI Cards | Very Easy | None | No | 3–6 min | Pending test |
| Risk Severity Summary | Very Easy / Easy | None | No | 3–6 min | Pending test |
| Risk Severity Filter | Very Easy | None | No | 3–5 min | Pending test |
| Evidence Completeness Score | Easy | None | No | 5–8 min | Pending test |
| Ownership Complexity Indicator | Easy | None | No | 5–8 min | Pending test |
| Request More Information Draft | Easy | None | No | 5–10 min | Pending test |
| Analyst Internal Notes | Easy | None | No | 5–10 min | Pending test |
| KYC Investigation Export | Easy / Medium | None | No | 8–12 min | Pending test |
| Dashboard Risk Visualization | Very Easy / Easy | None | No | 3–7 min | Pending test |

Suggested final status values:

- Recommended
- Recommended with notes
- Advanced
- Do not use live
- Pending test

Do not mark an extension **Recommended** until the exact prompt has been tested against the frozen baseline.

---

# 7. How to Test an Extension

Assume the baseline tag is:

```text
v1.0-demo-baseline
```

Create a temporary branch:

```powershell
git switch -c demo-test/country-filter v1.0-demo-baseline
```

Start Squad:

```powershell
copilot --agent squad
```

Paste the exact prompt intended for colleagues.

After implementation, deploy only the existing application:

```powershell
azd env select <environment-name>
azd deploy web
```

Record:

- Copilot implementation time,
- test/build time,
- deployment time,
- total demo time,
- files changed,
- whether infrastructure was touched,
- whether manual intervention was required,
- whether the same URL remained available,
- whether the result looked good enough for a customer meeting.

After testing:

```powershell
git switch main
git branch -D demo-test/country-filter
```

If the extension changed the deployed demo environment and you need to restore the baseline application, redeploy the baseline branch/tag before the next customer session.

---

# 8. Extension Certification Criteria

A live extension should be marked **Recommended** only when:

- the exact prompt has been tested,
- Squad does not create unnecessary agents,
- no new Azure resource is required,
- no infrastructure deployment is required,
- existing KYC functionality remains intact,
- relevant tests/build checks pass,
- `azd deploy web` succeeds,
- the same application URL remains valid,
- the feature is visually obvious,
- implementation time is predictable,
- no manual emergency fix was required.

---

# 9. Customer Demo Workflow

## Part 1 — Show the finished application

Suggested narrative:

> "This is the KYC Case Investigation Cockpit, a Microsoft Foundry-powered Financial Services demo created with GitHub Copilot CLI and Squad."

Show:

- KYC case dashboard,
- synthetic customer cases,
- customer/company profile,
- submitted synthetic documents,
- ownership information,
- completeness findings,
- risk findings,
- AI analyst summary,
- human-controlled decision,
- audit history.

Explain that:

- Azure AI Document Intelligence processes submitted evidence,
- Microsoft Foundry Agents interpret, validate, investigate, and summarize,
- the human analyst remains responsible for the final action,
- all demo data is synthetic.

## Part 2 — Introduce a new requirement

Example:

> "Now imagine the KYC operations manager asks us to quickly filter the onboarding queue by country."

## Part 3 — Start Squad

```powershell
copilot --agent squad
```

Paste the tested Country Filter prompt.

## Part 4 — Show Copilot/Squad working

Explain that Copilot is not generating an isolated sample application.

It is:

- reading an existing multi-layer repository,
- understanding existing UI patterns,
- preserving the current backend,
- respecting existing Azure integrations,
- implementing the requested change in the existing solution.

## Part 5 — Deploy only the application

```powershell
azd deploy web
```

## Part 6 — Refresh the same URL

Show the new filter or feature.

## Part 7 — Explain the value

Suggested narrative:

> "The important point is not simply that Copilot can generate code. It can understand an existing Financial Services application, make a targeted business change, validate it, and update the deployed solution while preserving the existing Azure and AI architecture."

---

# 10. Avoid These Changes During a Short Live Demo

Avoid live changes that require:

- Microsoft Entra authentication,
- private networking,
- Private Endpoints,
- API Management,
- changing Azure region,
- changing Foundry region,
- changing model deployment type,
- provisioning another model,
- adding Azure AI Search,
- redesigning Search indexes,
- adding Cosmos DB,
- Service Bus,
- Event Grid,
- another Container App,
- AKS,
- replacing persistence architecture,
- Hosted Agents,
- significant Managed Identity/RBAC changes,
- changing Document Intelligence architecture,
- connecting an external live sanctions/PEP provider,
- building a production compliance rules engine,
- major Bicep work.

These are better suited to workshops or longer engineering sessions than a short customer demonstration.

---

# 11. Baseline Rule

The baseline must remain a complete working KYC application without any live extension.

Never intentionally remove baseline functionality so GitHub Copilot can add it during the meeting.

The live extension demonstrates **adaptability**, not missing baseline functionality.

---

# 12. Reset / Rollback Strategy

Create a disposable customer branch from the frozen baseline:

```powershell
git switch -c customer-demo/<customer-name> v1.0-demo-baseline
```

Run the live extension there.

After the meeting, keep or discard the branch.

Return to normal development:

```powershell
git switch main
```

Avoid making experiments directly on the frozen baseline tag.

---

# 13. Azure Deployment Distinction

Initial environment creation:

```powershell
azd up
```

Live application-only change:

```powershell
azd env select <environment-name>
azd deploy web
```

During normal live-demo extensions, do **not** rerun infrastructure provisioning.

---

# 14. Suggested Baseline Tag

When the KYC Cockpit is fully tested and ready to share, freeze a known-good baseline:

```powershell
git tag v1.0-demo-baseline
git push origin v1.0-demo-baseline
```

Colleagues can then create a disposable branch from that exact version:

```powershell
git switch -c customer-demo/contoso v1.0-demo-baseline
```

This protects the standard customer-demo baseline from accidental live changes.

---

# 15. Quick Reference

Start Squad:

```powershell
squad status
copilot --agent squad
```

Deploy application-only change:

```powershell
azd env select <environment-name>
azd deploy web
```

Create clean demo branch:

```powershell
git switch -c customer-demo/<customer-name> v1.0-demo-baseline
```

Return to main:

```powershell
git switch main
```

---

# 16. Live Demo Checklist

## Before

- baseline application is healthy,
- correct `azd` environment is selected,
- browser URL is already open,
- Git branch is disposable,
- Squad is initialized locally,
- selected live prompt has already been tested,
- Azure login is valid,
- no infrastructure change is required,
- primary KYC case is available,
- current demo state is understood.

## During

- explain the business requirement first,
- paste the prepared prompt,
- let Squad work within the existing team,
- avoid changing scope midway,
- run only focused tests/build checks,
- deploy only the application,
- refresh the same URL,
- show the customer-visible change.

## After

- record whether the prompt was successful,
- record implementation and deployment time,
- update certification status,
- keep or discard the demo branch,
- restore baseline if necessary,
- do not modify the frozen baseline tag.

---

# 17. Governing Principle

> **Use GitHub Copilot CLI + Squad to make a small, meaningful, visible Financial Services business change to an already-working KYC application, validate only what matters, redeploy only the application, and show the result at the same URL.**
