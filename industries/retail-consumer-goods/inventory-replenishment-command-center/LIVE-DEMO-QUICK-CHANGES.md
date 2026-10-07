# Retail Inventory & Replenishment — Live Demo Quick Changes

Use this playbook to demonstrate a customer request becoming a small application change through GitHub Copilot and Squad. Choose ONE change per demo. Aim for 2–3 minutes of visible coding and validation; image builds and Azure deployments may take longer. Rehearse the exact change and deployment before presenting.

## Baseline and customer story

Harbour & Lane is a fictional retailer. The command center uses synthetic inventory to investigate stockout risks, compare replenishment options, and record simulated human approval and dispatch. It does not update a real ERP or move real stock.

Demo application:
https://ca-retail-consumer-goods-ne-02.thankfulocean-b1b09e44.norwayeast.azurecontainerapps.io

Azure resource group: `rg-retail-consumer-goods-01`.

Hero product: Everyday Knit, Forest Green, Size M (`HL-KNT-EVD-FGN-M`).

The baseline already has Store, Category, Risk and Minimum Exposure filters, overview KPIs, inventory investigation, replenishment recommendations, and simulated approval/dispatch. Demonstrate those first; do not present existing features as new changes. Revenue exposure is a projection, not revenue recovered.

## Before the customer meeting

1. Open the app and complete one investigation/replenishment workflow. Restore the demo data using the application's documented reset procedure.
2. Read the project's README and verify the existing application-only deployment command. Sign in to the correct Azure subscription before the meeting if deployment needs Azure CLI authentication.
3. Ensure the repository working tree is clean. Record the deployed baseline commit and image/revision so you can restore both code and deployment.
4. Rehearse ONE prompt below. Confirm that the necessary fields already exist in the current API response; skip an option if it requires a new API, data model or infrastructure.
5. Have a second browser tab ready to refresh the application after deployment.

From the project repository, create a disposable branch:

```powershell
git status --short
# Continue only when the working tree is clean.
$baselineCommit = git rev-parse HEAD
git switch -c customer-demo/retail-quick-change
copilot --agent squad --yolo
```

Use your established Copilot/Squad startup command if your installed setup differs. Use a unique branch name for each meeting.

## Common instructions for every change

The prompts below include the essential constraints. Keep the existing Squad team. Use at most the frontend implementer and one reviewer/tester; involve the backend owner only if needed to understand existing fields. Do not create a new agent team.

Keep the existing public demo behavior, two Foundry agents, synthetic data, deterministic risk calculations and human approval workflow. Do not change Azure resources, authentication, identity, networking, model deployments, or stock/approval business rules. Never put credentials or access tokens into browser code.

Use existing project dependencies and existing deployment scripts. Run focused checks relevant to the change. Report what changed and the checks run. If a prerequisite is absent, explain it instead of expanding scope. Application deployment must keep the same URL and use the documented application-only process.

## Option 1 — Maximum days of cover

**Customer request:** “I only have time to review products that will run out within the next three days.”

**Show:** Set maximum cover to 3, observe the exception queue shrink, clear it and show the queue return. Other filters continue to apply.

**Paste into Copilot/Squad:**

```text
Add one small frontend feature to the Retail Inventory & Replenishment Command Center: an optional “Maximum days of cover” numeric filter alongside the existing exception-queue filters. Use the existing numeric cover field, with inclusive comparison (cover <= selected maximum). Leave the default unset so the existing queue is unchanged. Combine it with the existing Store, Category, Risk and Minimum Exposure filters. Support clearing it, reject negative/non-numeric values, and explain missing cover values consistently without treating them as zero. Update the visible result count and empty state. Reuse the current UI components; no dependencies, APIs or business-rule changes. Keep the existing Squad team and use at most one implementer and one reviewer. Run focused checks. Do not change Azure infrastructure or deploy yet. Summarize the change and how to verify it.
```

## Option 2 — Sort by exposure or cover

**Customer request:** “Can I see the largest revenue exposure first, or the items with the least cover?”

**Show:** Switch between default priority, highest exposure and lowest cover. Demonstrate that the filters still work.

**Paste into Copilot/Squad:**

```text
Add a compact sort selector to the existing inventory exception queue with “Default priority”, “Highest revenue exposure”, and “Lowest days of cover”. Preserve the current ordering as the default. Sort numeric values from the existing response, not formatted currency/text, and put missing values last. Make ties stable and preserve all existing filters, row actions and selection behavior. Reuse current components; no new dependencies or backend changes. Keep the existing Squad team and use at most one implementer and one reviewer. Run focused checks for sorting and filter interaction. Do not change Azure infrastructure or deploy yet. Summarize the change and verification.
```

## Option 3 — Export the filtered exception queue

**Customer request:** “I want to send this store's priority list to the store manager.”

**Show:** Apply a store filter, click Export CSV, and open the downloaded file. Check that it matches the filtered queue.

**Paste into Copilot/Squad:**

```text
Add an “Export CSV” button for the currently filtered and sorted inventory exception queue, using only data already loaded in the browser. Include the existing product name, exact SKU, store, risk/priority, available units, days of cover, projected revenue exposure in EUR, and recommendation status when those fields exist. Export numeric values without display formatting. Correctly escape commas, quotes and line breaks and neutralize spreadsheet-formula prefixes in text cells. Use UTF-8 and a clear filename. Disable the button for an empty result set. If the queue is paginated or partially loaded, label the export scope explicitly and do not claim to export all records. No packages, API changes or infrastructure changes. Keep the existing Squad team and use at most one implementer and one reviewer. Run focused checks for CSV output and filter scope. Do not deploy yet. Summarize the change and verification.
```

## Option 4 — Compare replenishment options at a glance

**Customer request:** “Which feasible transfer arrives first, and which costs least?”

**Show:** Investigate an item with multiple transfer options. Point out the comparison badges and explain why the recommended option can differ.

**Paste into Copilot/Squad:**

```text
On the existing replenishment option cards, add small “Earliest arrival” and “Lowest cost” comparison badges using existing comparable arrival and cost fields. Compare only feasible options. Label ties honestly; if the necessary numeric/time fields are missing or incomparable, omit the badge instead of guessing. An option can have both badges. Preserve the current recommendation, donor protections, calculations and human approval workflow. Add a short explanation that comparison badges do not override the recommendation. Reuse current styles and dependencies. Keep the existing Squad team and use at most one implementer and one reviewer. Run focused checks. No backend or Azure infrastructure changes; do not deploy yet. Summarize the change and verification.
```

## Deploy the selected change

After reviewing the result, use this follow-up:

```text
Review the diff for the single quick change we just made. Run the project's relevant existing checks and resolve failures caused by this change. Find the application's documented deployment process in the README/scripts and use it to deploy the application change to the existing environment in rg-retail-consumer-goods-01, preserving the public application URL. Do not provision, destroy or modify infrastructure, identity, authentication, networking or Foundry agents. If the documented command would make those changes, stop and explain. Verify the deployed revision is healthy and the chosen feature works at the existing URL. Report the URL, deployed revision/image, and verification result. Do not push to GitHub unless separately requested.
```

## Suggested live narration

- “This is a synthetic retail scenario: the team sees stockout exposure and investigates a replenishment decision.”
- “The customer has asked for one small improvement. I'll give the existing team a focused request.”
- Show the prompt, a concise diff and the check result; avoid displaying credentials or environment-file contents.
- Refresh the deployed app and demonstrate the requested change with the same scenario.
- “The approval remains a human decision, and dispatch here is simulated.”

If deployment takes longer than the demo window, show the tested local change and be explicit that cloud deployment is still running. Do not present a local result as already deployed.

## Restore the baseline

Save or commit the quick change before switching branches. Restore the previously recorded baseline code/image through the project's documented application deployment procedure, then verify the URL and reset synthetic demo data. Switching Git branches alone does not restore the running Azure application. Keep the demo branch until you have decided whether to retain it; do not discard colleagues' work or delete resources to reset a demo.
