# High Tech / Software / ISV — Live Copilot CLI + Squad Quick Changes

**Application:** AI Customer Success Command Center  
**Audience:** Colleagues demonstrating GitHub Copilot CLI + Squad to SaaS / ISV customers  
**Target:** One visible, small change per demo, aiming for **2–3 minutes of implementation** (not a guaranteed runtime).  
**Scope:** Existing React/TypeScript + FastAPI application; preserve both real Microsoft Foundry runtime agents.

> **Important:** These are *candidate* prompts based on the delivered project description. The exact current component names and the contents of `DEMO-EXTENSIONS.md` were not provided for review. Squad must inspect the local repository before editing. Never promise a change is possible in a fixed time. For the tightest live demo, use a pre-running local dev server and demonstrate the change locally. Building, pushing, and redeploying to Azure Container Apps may take longer than 2–3 minutes and will replace the container's ephemeral SQLite state.

## 1. Presenter setup — before the customer call

1. Open a **fresh working branch** from a clean, known-working commit. Prepare one branch per rehearsal/session; do not share an actively edited directory between presenters.
2. Ensure Git, Node/npm, Python, GitHub Copilot CLI, and Squad are already installed and signed in. Confirm `squad doctor` passes.
3. Install the project's existing dependencies **before** the demo. Start the app using the instructions in the repository's `README.md` (do not invent launch commands). Open the local UI and make sure it is reachable.
4. Inspect `DEMO-EXTENSIONS.md`; choose a feature not already implemented. Rehearse it once on the actual repository and measure the duration. Have a reset/rollback plan.
5. Prefer a fast **frontend-only** change. Do not needlessly invoke or change Foundry agents, database schema, Azure resources, Bicep, pipelines, or dependencies.
6. Keep the public Azure website intact. Use the local dev app for the change unless you explicitly budget extra time for deployment. The deployed site is a shared, anonymous demo with ephemeral SQLite.

### Open the project and Squad

```powershell
cd "C:\Users\savacristian\Desktop\GitHub Copilot Initiative\High Tech Software ISV"
git status --short
squad doctor
copilot --agent squad
```

Do **not** run `git init` or `squad init` again in the existing initialized project. Colleagues cloning a copy should follow the repo's setup guide; `squad init` is only needed if that copy has no Squad configuration.

### Universal speed and safety instructions

Every example below contains the key constraints. If Squad begins expanding scope, interrupt and use this instruction:

> **Stay within the one requested UI change. Use at most one existing Squad specialist to implement it; do not spawn new agents, conduct extended planning, provision Azure resources, redeploy, or run broad tests. Make the smallest change, verify quickly, report the files changed, and stop.**

## 2. Best three prompts for a 2–3-minute demonstration

### Demo A — Add an ARR-at-risk explanation tooltip (safest)

**Customer value:** Makes an important revenue KPI understandable to executive stakeholders.  
**Show before:** Executive dashboard with the ARR-at-risk KPI.  
**Show after:** Hover/focus over an info icon to see a concise explanation.  
**Expected scope:** Small React component and styling. No API changes.

**Paste into Copilot CLI with Squad:**

```text
Implement ONE quick customer-requested change in the existing AI Customer Success Command Center.

On the Executive Overview dashboard, add a small accessible info icon next to the existing "ARR at Risk" KPI label. On hover and keyboard focus, show this short explanation: "Illustrative revenue associated with accounts currently flagged as at risk. This is not a predicted loss or an AI-generated churn probability."

First locate the actual KPI component. Reuse existing tooltip/CSS patterns if present; do not add a library. Keep the layout responsive and preserve the existing KPI calculation.

Assign this to the existing Fullstack Squad specialist only. No extra agents, architecture changes, backend work, Azure changes, or deployment. Run the smallest practical frontend check, tell me the files changed, and STOP. Aim to finish in 2–3 minutes.
```

### Demo B — Add a one-click "At-risk only" portfolio filter

**Customer value:** Helps customer success managers focus immediately on accounts requiring attention.  
**Show before:** Customer Portfolio with all accounts.  
**Show after:** Toggle shows only accounts flagged as at risk and can be cleared.  
**Expected scope:** UI state and filtering; use the existing health/risk categorization (never invent a threshold).

```text
Implement ONE small, live-demo feature in the existing Customer Portfolio.

Add an "At-risk only" checkbox/toggle beside the existing customer search and filters. When enabled, show only accounts that the application ALREADY categorizes as at risk; when disabled, show the normal list. Combine correctly with the existing search and filters. Show a useful empty result message when nothing matches.

Inspect the existing components and reuse the current account risk classification; do not introduce a new churn score or change any backend logic. Keep styling consistent and responsive.

Use the existing Fullstack Squad specialist only. Do not create agents, add packages, modify Foundry, provision/deploy Azure, or run a full test suite. Do one quick verification, report what changed, and STOP. Target 2–3 minutes.
```

### Demo C — Add a "Copy outreach email" action

**Customer value:** Lets a CSM take AI-generated outreach content directly into their workflow.  
**Show before:** Generated retention plan with an editable outreach draft.  
**Show after:** Click Copy, then paste the text into a scratch editor.  
**Expected scope:** A small browser clipboard action; no new API.

```text
Implement ONE quick usability improvement in the Retention Plan / Customer 360 view.

Next to the existing editable AI-generated outreach email, add a "Copy email" button that copies the CURRENT edited email text to the clipboard, not the original draft. Show a short success or failure message using existing UI patterns. Disable the action if there is no email text. Preserve all save, approve, export, and Foundry behavior.

Find and reuse the existing form state and button styles. Do not add dependencies or create backend endpoints.

Use only the existing Fullstack Squad specialist. Do not add Squad agents, change Azure/Foundry/SQLite, redeploy, or run deep tests. Make the smallest change, verify it quickly, report changed files, and STOP. Target 2–3 minutes.
```

## 3. Additional compact demo options

Use these only after verifying that the feature is not already present.

### Demo D — Highlight renewals coming soon

```text
In the existing Customer Portfolio, add a subtle "Renewing soon" badge for customers whose renewal date is within the next 30 calendar days, excluding dates already past. Reuse the existing date field and UI badge styling; keep current sort/filter behavior unchanged. Make the smallest frontend-only change. Assign only the existing Fullstack Squad specialist. No new packages, backend/Foundry/Azure changes, broad tests, or deployment. Verify briefly, report files changed, and STOP.
```

### Demo E — Add a "Clear filters" button

```text
In Customer Portfolio, add a "Clear filters" button that resets the existing search field, filter selections, and sorting to the page's current default state. Show it only when something differs from the default, if easy with the existing implementation. Reuse the current component state and styling. Frontend-only; one existing Fullstack Squad specialist; no dependencies, Foundry, backend, Azure, deployment, or deep testing. Quick check, list changed files, then STOP.
```

### Demo F — Add a health-status legend

```text
Add a compact, responsive legend beside the existing customer health visualization explaining the health categories ALREADY USED by this application. Use the existing labels and colors (do not redefine thresholds or imply a machine-learned churn probability). Make this a small frontend-only improvement. Use just the existing Fullstack Squad specialist, no new agents/dependencies, no backend/Foundry/Azure modifications or deployment. Check quickly and STOP.
```

### Demo G — Add a "Last AI analysis" timestamp

```text
On Customer 360, display a small "Last AI analysis" timestamp when the existing account history already contains a successful churn-risk analysis event. Read it from data the UI already fetches; if this cannot be done without a new endpoint or schema, STOP and report that rather than expand scope. Use existing formatting patterns. One existing Fullstack Squad specialist only. No additional services, Foundry changes, Azure deployment, deep testing, or extra agents. Report changed files and STOP.
```

### Demo H — Add a customer-level renewal countdown

```text
In the Customer 360 account header, show "Renewal in N days" using the existing renewal date, with "Renewal date passed" for past dates. Avoid misleading language for missing/invalid dates. Reuse the present date utilities and account styling. Change only the necessary frontend files. One existing Fullstack Squad specialist; no new packages, backend/Foundry/SQLite/Azure changes, redeployment, or broad testing. Verify quickly, summarize, and STOP.
```

## 4. Recommended live customer flow (about 3 minutes for the change)

| Approx. time | Presenter action | Suggested talk track |
|---|---|---|
| 0:00–0:25 | Show the existing feature and describe a business request. | "Imagine a customer success leader asks us for one more capability. We can describe that change in natural language without manually writing all the code." |
| 0:25–0:40 | Open Copilot CLI running Squad; paste one prompt. | "Squad coordinates specialist development roles. For a small change, we're deliberately using just the Fullstack specialist." |
| 0:40–2:30 | Let Squad implement; show its progress without changing screens repeatedly. | "Copilot is inspecting the current app, using existing patterns, and applying a narrowly scoped change. We aren't rebuilding the platform or changing the AI agents." |
| 2:30–3:00 | Show the change in the locally running app and demonstrate it. | "The feature is now visible in the application. This is an example of how a SaaS product team can iterate quickly on customer feedback." |

These times are **presentation targets**, not assurances. If the code change runs over, explain what is happening; do not claim completion before checking the UI. A live Azure redeployment is **not** included in this 3-minute window.

## 5. Quick post-change validation

- Check the UI locally and verify the exact requested interaction.
- Ensure previous key workflows still render and there are no obvious browser errors.
- Run only the narrow lint/type/build command already documented in the repository when practical.
- Keep both real Foundry agents unchanged; these quick edits do not need new AI requests.
- Review `git diff --stat` and `git diff` so only the intended files changed.
- Do not commit, push, or deploy without the presenter's explicit decision.

**Reset between demos:** return to the clean rehearsal baseline using a fresh branch or restore only the specific demo files after verifying there are no unrelated changes. Avoid `git reset --hard` or `git clean -fd` on a shared working directory.

## 6. Optional: deploying the change to the public site

The existing publicly accessible application is hosted on **Azure Container Apps in Sweden Central** and uses **ephemeral SQLite**. Rebuilding/redeploying a container can reset saved demo plans and analysis history. That is why these prompts intentionally stop after local implementation. If the customer needs to see the change on the public URL, schedule a separate deployment window, confirm that resetting the synthetic demo state is acceptable, then use the existing documented deployment scripts. Do not make cloud changes during a two-minute live edit by default.

## 7. Presenter selection guide

| Option | Impact | Relative uncertainty | Recommendation |
|---|---|---|---|
| A — ARR tooltip | Executive clarity | Very low | **Best first demo** |
| B — At-risk filter | Workflow efficiency | Low–medium | Best functional demo |
| C — Copy outreach | AI-to-action story | Low | Best AI-adjacent demo |
| D — Renewal badge | Customer prioritization | Low | Good backup |
| E — Clear filters | Usability | Low | Quick backup |
| F — Health legend | Explainability | Very low | Most conservative backup |
| G — AI timestamp | Traceability | Medium; history shape dependent | Rehearse first |
| H — Renewal countdown | Renewal planning | Low | Good backup |

**Tip:** Rehearse A, B, and C against the actual latest repository. If any one is already implemented, choose a different option or adapt the prompt instead of asking Squad to duplicate existing functionality.
