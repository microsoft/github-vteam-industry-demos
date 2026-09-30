# AI Proposal Factory — Solution Engineer Live Demo Quick Changes

## Purpose

This playbook is for Solution Engineers who already have the **AI Proposal Factory** deployed and want to demonstrate a small customer-requested change using **GitHub Copilot CLI + Squad** during a customer call.

The baseline application should already be healthy and working before attempting a live change.

The goal is simple:

1. Show the working AI Proposal Factory.
2. Introduce a small customer requirement.
3. Give the requirement to GitHub Copilot CLI + Squad.
4. Let Squad implement and validate the change.
5. Deploy the application update.
6. Refresh the same application URL and show the new capability.

> **Target:** choose changes designed to take approximately **2–3 minutes for implementation and validation**. Azure deployment time can vary, so test the complete flow before using it with a customer.

---

## Live Demo Guardrails

For a short live demo, prefer changes that:

- are immediately visible in the UI;
- reuse data already available in the application;
- are frontend-only where possible;
- require only a very small number of code changes;
- do not provision Azure resources;
- do not change networking or authentication;
- do not change Managed Identity or RBAC;
- do not change Microsoft Foundry agents or model deployments;
- do not change Azure AI Search architecture or indexes;
- do not require a full `azd up`.

Use the existing Squad team. Do not cast additional agents for these quick changes.

---

# Recommended Quick Changes

## 1. Opportunity Industry Filter

**Customer request:**  
> "Can we filter the opportunities by industry?"

**Why it works well:**  
Uses opportunity data already loaded by the dashboard and should normally be a small frontend-only change.

### Prompt

```text
This is a short live customer demonstration.

Add an Industry filter to the Opportunity Dashboard.

Requirements:
- Add a clean Industry dropdown near the existing dashboard controls.
- Include "All Industries".
- Populate the remaining options from industries already present in the loaded opportunity data.
- Selecting an industry must immediately filter the displayed opportunities.
- Preserve the current styling and responsive layout.

Make the smallest change possible.
Do not modify backend APIs unless absolutely necessary.
Do not modify Azure infrastructure, Microsoft Foundry, Azure AI Search, Storage, authentication, networking, Managed Identity, or RBAC.
Use the existing Squad team only and do not create additional agents.

Run only the minimum relevant frontend validation and stop when the change is ready.
```

---

## 2. Opportunity Search

**Customer request:**  
> "When we have more opportunities, can I quickly search for one?"

**Why it works well:**  
Highly visible and can use the opportunity data already loaded in the browser.

### Prompt

```text
This is a short live customer demonstration.

Add a Search box to the Opportunity Dashboard.

Requirements:
- Filter the opportunities already loaded in the application as the user types.
- Match against customer name and opportunity name.
- Make the search case-insensitive.
- Show a clear empty-state message when there are no matches.
- Preserve the existing dashboard design and responsive layout.

Make the smallest frontend change possible.
Do not modify backend APIs, Azure AI Search, Azure infrastructure, Microsoft Foundry, Storage, authentication, networking, Managed Identity, or RBAC.
Use the existing Squad team only and do not create additional agents.

Run only the minimum relevant frontend validation and stop when the change is ready.
```

---

## 3. Sort Opportunities by Value

**Customer request:**  
> "Can I see our highest-value opportunities first?"

**Why it works well:**  
Simple client-side behavior using an existing opportunity value.

### Prompt

```text
This is a short live customer demonstration.

Add a simple sorting control to the Opportunity Dashboard.

Requirements:
- Provide "Highest Value" and "Lowest Value" options.
- Sort the opportunities already loaded in the application using their existing estimated value.
- Do not change the underlying opportunity data.
- Preserve the existing dashboard design.

Make the smallest frontend change possible.
Do not modify backend APIs, Azure infrastructure, Microsoft Foundry, Azure AI Search, Storage, authentication, networking, Managed Identity, or RBAC.
Use the existing Squad team only and do not create additional agents.

Run only the minimum relevant frontend validation and stop when the change is ready.
```

---

## 4. Risk Severity Filter

**Customer request:**  
> "Can I look only at the high-risk findings?"

**Why it works well:**  
Uses risk findings already returned by the application and makes a visible change to the proposal review experience.

### Prompt

```text
This is a short live customer demonstration.

Add risk severity filtering to the existing Risk Review experience.

Requirements:
- Add filters for All, High, Medium, and Low.
- Default to All.
- Filter the risk findings already loaded in the UI.
- Keep the existing risk findings display unchanged apart from the new filtering control.
- Preserve the current application design.

Make the smallest frontend change possible.
Do not modify backend APIs or the Risk Reviewer Agent.
Do not modify Azure infrastructure, Microsoft Foundry configuration, Azure AI Search, Storage, authentication, networking, Managed Identity, or RBAC.
Use the existing Squad team only and do not create additional agents.

Run only the minimum relevant frontend validation and stop when the change is ready.
```

---

## 5. Risk Severity Summary

**Customer request:**  
> "Can I immediately see how risky this proposal is?"

**Why it works well:**  
Turns existing risk findings into a simple visual summary without changing the Risk Reviewer Agent.

### Prompt

```text
This is a short live customer demonstration.

Add a compact Risk Severity Summary above the existing risk findings in the Proposal Workspace.

Requirements:
- Use the risk findings already loaded by the application.
- Show the number of High, Medium, and Low severity findings.
- Make the result visually clear using the application's existing UI patterns and lightweight HTML/CSS.
- Keep the detailed risk findings unchanged.
- The summary must update for the currently loaded proposal.

Make the smallest frontend change possible.
Do not change the Risk Reviewer Agent or backend workflow.
Do not modify Azure infrastructure, Microsoft Foundry configuration, Azure AI Search, Storage, authentication, networking, Managed Identity, or RBAC.
Use the existing Squad team only and do not create additional agents.

Run only the minimum relevant frontend validation and stop when the change is ready.
```

---

## 6. Executive KPI Cards

**Customer request:**  
> "Could leadership see a quick summary of the pipeline?"

**Why it works well:**  
Creates an obvious executive-facing improvement using data already available to the dashboard.

### Prompt

```text
This is a short live customer demonstration.

Add four compact KPI cards above the Opportunity Dashboard:

1. Total Opportunities
2. Estimated Pipeline Value
3. Proposals In Review
4. Approved Proposals

Requirements:
- Calculate the values from data already available to the dashboard.
- Format the pipeline value professionally.
- Keep the cards visually consistent with the existing application.
- Keep the layout responsive.
- Do not introduce a charting library.

Make the smallest change possible.
Do not modify Azure infrastructure, backend architecture, Microsoft Foundry, Azure AI Search, Storage, authentication, networking, Managed Identity, or RBAC.
Use the existing Squad team only and do not create additional agents.

Run only the minimum relevant validation and stop when the change is ready.
```

---

# Recommended Order for Customer Calls

For the lowest-risk live demonstration, start with:

1. **Industry Filter**
2. **Opportunity Search**
3. **Sort Opportunities by Value**
4. **Risk Severity Filter**

After testing them in your own deployment, also consider:

5. **Risk Severity Summary**
6. **Executive KPI Cards**

The best live change is not necessarily the most technically sophisticated one. It should be **small, visible, predictable, and relevant to the customer conversation**.

---

# Deploying the Change

Once Squad has completed the code change and the relevant validation has passed, deploy **only the existing application** using the deployment approach documented by the project.

Do not reprovision the Azure foundation for a quick live-demo change.

After deployment:

1. Return to the already-open AI Proposal Factory URL.
2. Refresh the page.
3. Show the customer the new capability.
4. Explain which existing application context Squad understood and changed.

---

# Do Not Attempt These in a 2–3 Minute Live Change

Avoid changes involving:

- new Microsoft Foundry agents;
- new model deployments;
- Azure resource provisioning;
- Bicep/infrastructure changes;
- authentication;
- networking or Private Endpoints;
- Managed Identity or RBAC;
- Azure AI Search schema/index changes;
- new databases or persistence architecture;
- major backend workflow changes;
- proposal translation;
- complex versioning;
- major PDF/export changes;
- large UI redesigns.

These are better suited to a longer workshop or prepared demo.

---

# Suggested Customer Demo Narrative

**1. Show the baseline**

> "This is the AI Proposal Factory running in Azure. The application was built using GitHub Copilot CLI and Squad."

**2. Introduce the requirement**

For example:

> "Imagine you tell us that your sales managers need to filter these opportunities by industry."

**3. Ask Squad**

Start GitHub Copilot CLI + Squad and paste the tested prompt.

**4. Let Squad work**

Explain that Squad is working against the existing codebase rather than generating an isolated code sample.

**5. Deploy and refresh**

Deploy the application update and refresh the existing URL.

**6. Show the result**

> "We started with an existing working application, introduced a new business requirement, and GitHub Copilot CLI + Squad understood the codebase, implemented the change, validated it, and evolved the solution."

---

# Solution Engineer Checklist

Before the customer call:

- Baseline application is healthy.
- Azure authentication is valid.
- Correct deployment environment is selected.
- Squad is initialized locally.
- You are using a disposable demo branch.
- The exact prompt has been tested.
- You have timed the change yourself.
- No infrastructure change is required.
- You know how to roll back the demo branch.

During the customer call:

- Keep the requirement small.
- Use one of the tested prompts.
- Do not expand the scope midway.
- Do not allow unnecessary new Squad agents.
- Run only relevant validation.
- Deploy only the application change.
- Refresh the same application URL.

---

## Governing Principle

> **Use GitHub Copilot CLI + Squad to make a small, meaningful and visible business change to an already-working application. Keep the scope narrow enough that the customer sees the result quickly and the demo remains predictable.**
