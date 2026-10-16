# Manufacturing Operations Command Center — Live Copilot CLI + Squad Quick Changes

**Audience:** colleagues demonstrating small customer-driven changes during a live meeting.
**Target:** ~2–3 minutes per change **for Copilot implementation and local preview**, depending on machine, dependencies, and agent response times. **Azure container rebuild/redeployment can take longer and is not part of that time estimate.**
**App:** Manufacturing Operations Command Center (React/TypeScript frontend, FastAPI backend, two real Microsoft Foundry agents).
**Demo URL:** https://ca-manufacturing-01.ambitioussky-87dc9783.swedencentral.azurecontainerapps.io

> **Important:** These are proposed low-risk extensions based on the project brief and Phase 3 handoff described by the project owner. File paths and UI components must be confirmed against the local repository before implementation. They have not been trial-timed against the final source code.

## 1. Before your customer session (once)

1. Clone/open a **separate local working copy** of the finished project; use your own Git branch. Do **not** modify another presenter's working directory. Make sure dependencies have been installed and a local preview can run.
2. Verify `git status --short` is clean or commit/stash existing work before beginning. Avoid `git reset --hard` unless you have checked that nothing important will be lost.
3. Check the application and its local preview work **without needing real Foundry calls**. Avoid spending the live-change slot on AI rate limits (the deployed model was reported to have 1 request/minute and 1,000 tokens/minute).
4. Launch GitHub Copilot CLI with Squad from the repository root:

   ```powershell
   squad doctor
   copilot --agent squad
   ```

   If using a fresh clone where Squad has not been initialized, follow that repository's existing Squad setup instructions. **Do not run `squad init` over an established `.squad` configuration.**
5. Open a terminal/tab for local preview. Follow `README.md` for the actual run commands. For a typical frontend-only change, the frontend may be started with:

   ```powershell
   npm --prefix frontend install
   npm --prefix frontend run dev
   ```

   This is a local preview; it does **not** update the Azure URL.

## 2. Reusable one-line instruction for every prompt

All prompts below already include the constraints, so **pick one only**. Do not submit multiple feature requests in a single turn.

**Rules for all live changes**
- Use the **existing Squad team**; route to **Fullstack only** unless an actual dependency requires Integration. Do not add specialist agents or start ceremonies/planning discussions.
- Inspect relevant files and choose the **smallest possible UI-only change**. Preserve incident workflows, state, APIs, approval logic, and Foundry agent calls.
- No Azure CLI, provisioning, deployment, new dependencies, database migration, backend rewrite, broad refactor or deep testing.
- Run **only the quickest relevant check** (`typecheck` or targeted frontend build), not an entire test suite.
- Show changed files, 1–2 verification facts, and the exact page/interaction for the presenter. Then **STOP**.

## 3. Pick ONE live-demo prompt

### Option A — Highlight critical incidents (recommended first)
**Customer request:** “Can we make urgent incidents easier for an operations manager to spot?”
**Expected change:** An understated **Critical** visual indicator on existing critical-severity incident rows/cards, using existing severity values.
**Why this is a good demo:** Easy to understand, visually obvious, and no new data needed.

**Copy/paste into Copilot CLI + Squad:**

```text
Customer live-change request: Make critical manufacturing incidents stand out.

Use the existing Squad team and assign only Fullstack. Inspect the current Incidents UI and implement the smallest frontend-only enhancement: for incidents already marked Critical, show a clear red-tinted severity badge and a subtle row/card accent. Leave other severities readable and unchanged. Use existing data, existing styling conventions, and accessible contrast.

Do not change the API, state, Foundry agents, Azure resources, dependencies, or incident logic. No deployment or deep tests. Run a quick frontend typecheck or build, summarize the files changed and where to see it locally, then STOP.
```

**Show after implementation:** Open **Incidents**; point at a Critical incident and contrast it with a lower-severity one.

### Option B — Add a production-status legend
**Customer request:** “Can you help first-time users understand what the machine colors mean?”
**Expected change:** Compact legend explaining existing machine health/status labels/colors.
**Why it's fast:** Mostly static explanatory UI, no API integration.

```text
Customer live-change request: Add a clear machine-health legend.

Use the existing Squad team; Fullstack only. Inspect the existing Production Lines / Machines screen and add a small, responsive legend that explains the status colors and labels ALREADY used by the application (do not invent states). Reuse current design tokens and components where possible. Keep the legend near the existing filters or above the machine list.

Frontend only. No new packages, API/data/AI changes, Azure operations, refactors, or deep tests. Run a quick frontend typecheck or build, list changed files and the place to demonstrate it locally, then STOP.
```

**Show:** Open **Factories & Production Lines**; point to the new legend and corresponding machine indicators.

### Option C — Add a dashboard demo-data indicator
**Customer request:** “How do we make it clear the figures are demonstration data?”
**Expected change:** Small **Synthetic demo data** label on Operations Dashboard.
**Why it's fast:** Extremely small and useful for transparent customer demos.

```text
Customer live-change request: Make the synthetic-data nature of this manufacturing demo explicit.

Use existing Squad team; Fullstack only. Add a subtle, professional "Synthetic demo data" indicator near the Operations Dashboard heading, plus one brief tooltip or helper sentence clarifying that figures do not come from real machines. Do not obscure KPIs or alter existing calculations. Match the application's current styles and responsive behavior.

Minimal frontend-only edit. No API, agents, infrastructure, packages, or deployments. Run one quick frontend verification command, tell me where to show the change locally, and STOP.
```

**Show:** Refresh **Operations Dashboard**; read the indicator beside the title.

### Option D — Add an OEE explanation tooltip
**Customer request:** “Not every stakeholder knows what OEE measures. Can we explain it in the dashboard?”
**Expected change:** Info icon/tooltip on OEE KPI: Overall Equipment Effectiveness = Availability × Performance × Quality.
**Why it's fast:** No metric recalculation required.

```text
Customer live-change request: Explain the OEE KPI for business viewers.

Use existing Squad team; Fullstack only. Find the Operations Dashboard OEE KPI card and add a small accessible info affordance (tooltip or click-to-show helper) that says: "Overall Equipment Effectiveness (OEE) combines availability, performance, and quality." Add the formula "OEE = Availability × Performance × Quality" only if it fits cleanly. Do NOT change metric values or calculations.

Keep this frontend-only and minimal. No new dependencies, backend work, Foundry changes, Azure actions, or deep tests. Run a quick frontend check, provide the files changed and where to click locally, then STOP.
```

**Show:** Point at the **OEE** card and hover or click the information icon.

### Option E — Improve empty-filter messaging
**Customer request:** “What if a factory filter returns no machines?”
**Expected change:** Better empty state on the machine/production lines view.
**Why it's fast:** A local UI branch, if filters already exist.

```text
Customer live-change request: Make an empty production-line filter result more helpful.

Use the existing Squad team; Fullstack only. In the existing Factories & Production Lines view, when filters return zero machines/lines, replace any blank area or generic message with a helpful empty state: "No equipment matches these filters" and "Try adjusting site, line, or health status." If an existing clear-filters action exists, reuse it; otherwise do not add new state-management complexity.

Frontend only. No API, sample-data, AI, Azure, dependencies, or deep tests. Perform the quickest frontend check and tell me how to show the empty state in the local preview, then STOP.
```

**Show:** Apply a combination of filters with no matches and highlight the empty state.

### Option F — Add a local-time clarification on incident dates
**Customer request:** “Can operators tell what timezone incident timestamps are shown in?”
**Expected change:** Label indicating existing displayed timezone (without modifying stored dates).
**Caution:** Only select this if incident timestamps already have consistent, identifiable formatting.

```text
Customer live-change request: Clarify the timezone used for incident timestamps.

Use existing Squad team; Fullstack only. Inspect how the Incidents screen currently formats timestamps. Make the smallest UI-only clarification that accurately labels the existing display timezone (for example, "Displayed in your local time" ONLY if dates truly use the browser timezone). Do not alter stored timestamps, parsing, sorting, or business logic. If the current implementation cannot support an accurate label with a small change, report that and STOP without guessing.

No backend, Foundry, Azure, packages, or deep tests. Run a quick frontend check if code changed. Summarize exactly what changed, then STOP.
```

**Show:** Open **Incidents** and point to the timestamp label.

## 4. Recommended 2–3-minute on-screen sequence

| Target time | Presenter action | Suggested narration |
|---|---|---|
| 0:00–0:20 | Show the current local UI and state the request. | “A manufacturing customer has asked for one small improvement to the operator experience.” |
| 0:20–0:35 | Open Copilot CLI with Squad and paste **one** prompt. | “I'm describing the change in natural language and asking Squad to use our existing Fullstack specialist.” |
| 0:35–2:15 | Let Squad inspect, edit and run the quick check; avoid switching windows repeatedly. | “Squad works directly against the project, preserving the AI and Azure architecture while changing only what's required.” |
| 2:15–3:00 | Refresh **local** preview and show the result. | “We now have a visible improvement without redesigning the app or manually editing code.” |

These timings are **targets, not guaranteed execution times**. Practise your selected prompt on the actual repository and measure it before a customer meeting.

## 5. Important: local preview vs live Azure site

The prompts deliberately **do not deploy**. Your edits appear in the **local preview only**. The shared Azure website stays unchanged until a separate approved build and redeployment. Do not tell customers the public website has been updated when only local code was changed.

The shared deployed app has restart-sensitive SQLite state: a redeployment may reset incident edits, approvals, and history. Rebuilding the container may also take longer than 2–3 minutes. Therefore **do not redeploy during the quick-change segment** unless you have deliberately rehearsed and approved the impact.

If colleagues need to showcase changes on the **public** URL instead, schedule a separate deployment afterward using the existing deployment scripts and appropriate subscription checks.

## 6. Safe wrap-up for each colleague

After the demo:

```powershell
git status --short
git diff --stat
```

Review and commit the intended change to a **personal demo branch** if you want to keep it. Otherwise restore only the specific demo-edited files after checking for work you want to preserve. Do not push directly to a shared default branch or redeploy the shared Container App as part of this exercise.

### Best choices

- **First choice:** Option A — Highlight critical incidents (visible impact, simple business value).
- **Very safe backup:** Option C — Synthetic demo-data indicator.
- **Business explanation:** Option D — OEE tooltip.

If any option takes longer than your rehearsed time budget, stop after the local code changes and explain that the quick check or deployment would be completed separately. Do not imply unverified success.
