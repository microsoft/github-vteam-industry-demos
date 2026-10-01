# KYC Case Investigation Cockpit --- Live Demo Quick Changes

## Purpose

Use this playbook when the **KYC Case Investigation Cockpit is already
deployed and working** and you want to demonstrate a small
customer-requested change live with **GitHub Copilot CLI + Squad**.

The goal is a **2--3 minute application change**, not another
infrastructure deployment.

**Baseline application:**
https://ca-kyc-fs01.salmonpebble-2b6fa79e.norwayeast.azurecontainerapps.io/

## Live-demo guardrails

For every quick change: use the existing Squad team; reuse existing KYC
data, APIs, Foundry agents and Azure services; do not create or modify
Azure infrastructure; do not change networking, authentication, Managed
Identity, RBAC, model deployments or Document Intelligence; run only
focused validation; deploy only the existing application; preserve the
same URL; stop when the requested change works.

Start from a disposable branch:

``` powershell
git switch -c customer-demo/<customer-name> v1.0-demo-baseline
squad status
copilot --agent squad --yolo
```

# Option 1 --- Country Filter

**Best default \| Frontend only \| Very low risk**

Customer request: "Can we quickly filter the onboarding queue by
country?"

``` text
This is a live customer demo. Make one small change to the existing KYC Cockpit.

Add a Country filter beside the existing dashboard filters. Use countries already present in the loaded case data, include "All Countries", and filter visible cases immediately. Preserve the existing status/risk filters and visual design.

Do not modify backend APIs unless absolutely necessary. Do not change Azure infrastructure, Foundry agents, Document Intelligence, authentication, networking, identity, RBAC or model deployments. Use the existing Squad team only.

Run only relevant frontend validation, deploy only the existing application, keep the same URL, and stop when the feature is working.
```

Show: refresh the same URL, select a seeded country, show the filtered
cases, return to All Countries.

# Option 2 --- Executive KPI Cards

**Very visual \| Frontend only \| Very low risk**

Customer request: "Could we have a quick management view of the current
KYC queue?"

``` text
This is a live customer demo. Make one small change to the existing KYC Cockpit.

Add four compact executive KPI cards above the dashboard: Active Cases, High-Risk Cases, Awaiting Information, and Completed / Escalated Cases.

Calculate values from case data already available to the dashboard. Keep the cards responsive and consistent with the current design. Preserve existing filters and navigation.

Do not add new persistence or infrastructure. Do not change Azure infrastructure, Foundry agents, Document Intelligence, authentication, networking, identity, RBAC or model deployments. Use the existing Squad team only.

Run only relevant frontend validation, deploy only the existing application, keep the same URL, and stop when the cards display correctly.
```

Show: refresh the same URL and point out the four new KPI cards.

# Option 3 --- Risk Severity Summary

**Best case-workspace change \| Low risk**

Customer request: "Can the analyst see the overall risk picture without
reading every finding?"

``` text
This is a live customer demo. Make one small change to the existing KYC Cockpit.

Add a Risk Severity Summary above the existing Risk Findings for the opened case. Use the risk findings already returned by the application and show counts for High, Medium and Low severity. Keep the detailed findings unchanged and use lightweight existing UI/CSS.

Do not change the Risk Investigation Agent or Foundry configuration. Do not change Azure infrastructure, Document Intelligence, authentication, networking, identity, RBAC or model deployments. Use the existing Squad team only.

Run only relevant frontend validation, deploy only the existing application, keep the same URL, and stop when the summary displays correct counts.
```

Show: open the primary case, navigate to risk findings, refresh, and
show the new severity summary.

# Option 4 --- Risk Severity Filter

**Fast alternative \| Frontend only \| Very low risk**

``` text
This is a live customer demo. Add client-side severity filters to the existing Risk Findings: All, High, Medium and Low. Default to All and, if straightforward, show the number of findings beside each option.

Reuse already loaded risk findings and preserve the current visual design. Do not change backend APIs or Foundry agents unless absolutely necessary. Do not modify Azure infrastructure, Document Intelligence, authentication, networking, identity, RBAC or model deployments. Use the existing Squad team only.

Run only relevant frontend validation, deploy only the existing application, keep the same URL, and stop when filtering works.
```

# Standard live-demo flow

1.  Show the working baseline application.
2.  Introduce one customer request.
3.  Start `copilot --agent squad --yolo`.
4.  Paste one tested prompt and do not expand scope.
5.  Validate and deploy only the application.
6.  Refresh the same application URL.
7.  Show the customer-visible change.

If deployment is not already performed by Squad:

``` powershell
azd env select <environment-name>
azd deploy web
```

Do **not** run `azd up` for a quick live extension.

# Before the meeting

-   Baseline application is healthy.
-   Correct Azure/azd environment is selected.
-   Application URL is already open.
-   Work from a disposable customer-demo branch.
-   Squad is initialized locally.
-   Exact prompt has been tested.
-   Azure login is valid.
-   No infrastructure change is required.

# Reset

``` powershell
git switch main
git branch -D customer-demo/<customer-name>
```

Avoid authentication changes, private networking, new Azure services,
new Foundry agents, new model deployments, new databases, major Bicep
work, new Container Apps, or external compliance integrations during a
2--3 minute live change.

**Principle:** demonstrate the adaptability of an already-working
solution, not infrastructure provisioning.
