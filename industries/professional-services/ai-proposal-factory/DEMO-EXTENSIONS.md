# Live Demo Extensions

These optional enhancements are deliberately independent of the complete core workflow. Each can be implemented without redesigning the application.

## 1. Dark mode

- **Complexity:** Easy
- **Business value:** Improves accessibility and gives customers an immediately visible example of Copilot changing a polished product.
- **Affected files:** `apps\web\src\styles.css`, `apps\web\src\App.tsx`
- **Suggested prompt:** “Add an accessible dark-mode toggle to AI Proposal Factory. Persist the preference in localStorage, respect prefers-color-scheme, and update the existing CSS variables without changing component layouts.”

## 2. Industry filter on the dashboard

- **Complexity:** Easy
- **Business value:** Helps sales leaders focus the opportunity portfolio and demonstrates a small typed UI enhancement.
- **Affected files:** `apps\web\src\App.tsx`
- **Suggested prompt:** “Add an Industry filter beside the existing scenario filter on the opportunity dashboard. Derive unique industries from loaded opportunities and keep the empty state accurate.”

## 3. Risk severity summary

- **Complexity:** Easy
- **Business value:** Gives reviewers an at-a-glance risk profile before reading individual findings.
- **Affected files:** `apps\web\src\App.tsx`, `apps\web\src\styles.css`
- **Suggested prompt:** “Add a compact low/medium/high risk summary above the proposal risk cards. Compute counts from the current proposal and use the existing badge colors with accessible labels.”

## 4. Customer logo in exports

- **Complexity:** Easy
- **Business value:** Makes exported proposals feel customer-specific and presentation-ready.
- **Affected files:** `packages\contracts\src\index.ts`, `apps\web\src\App.tsx`, `apps\api\src\adapters.ts`, API tests
- **Suggested prompt:** “Add an optional customer logo URL to opportunity intake and render it safely in Markdown/PDF exports. Preserve deterministic tests and keep export valid when no logo is supplied.”

## 5. Proposal comments

- **Complexity:** Medium
- **Business value:** Supports collaborative review without changing approved proposal content.
- **Affected files:** `packages\contracts\src\index.ts`, `packages\domain\src\index.ts`, `apps\api\src\application.ts`, `apps\api\src\app.ts`, `apps\web\src\App.tsx`, tests
- **Suggested prompt:** “Add timestamped reviewer comments to proposal sections. Comments should not create a content revision, but adding and resolving them must create audit events.”

## 6. Proposal quality score

- **Complexity:** Medium
- **Business value:** Helps reviewers focus on incomplete or weak sections and creates a strong AI-assistance demo.
- **Affected files:** `packages\contracts\src\index.ts`, new scoring adapter in `apps\api\src`, proposal routes/UI, tests
- **Suggested prompt:** “Introduce a ProposalQualityAdapter and deterministic local implementation scoring clarity, completeness, grounding, and risk coverage. Show the score in the proposal workspace without blocking approval.”

## 7. Revision comparison

- **Complexity:** Medium
- **Business value:** Makes human and AI changes transparent and strengthens governance.
- **Affected files:** `apps\web\src\App.tsx`, new comparison component, `apps\web\src\styles.css`, UI tests
- **Suggested prompt:** “Add a revision comparison drawer for any proposal section with more than one revision. Highlight added and removed lines using a small dependency-free diff helper.”

## 8. Estimated margin indicator

- **Complexity:** Medium
- **Business value:** Connects proposal delivery assumptions to commercial decision-making.
- **Affected files:** contracts, opportunity intake, domain validation, dashboard/workspace UI, API tests
- **Suggested prompt:** “Add delivery cost and estimated margin fields to opportunities. Show margin percentage with warning thresholds on the dashboard and proposal header, using shared typed calculations.”

## 9. DOCX export

- **Complexity:** Medium
- **Business value:** Provides a familiar editable handoff format for account and legal teams.
- **Affected files:** `packages\domain\src\index.ts`, new exporter adapter, export route, proposal UI, export tests
- **Suggested prompt:** “Extend ProposalExporter with deterministic DOCX output. Use approved revisions, include the risk register and citations, and add an Export DOCX action beside PDF.”

## 10. Proposal translation action

- **Complexity:** Medium
- **Business value:** Helps global account teams create a localized review copy while retaining the approved source.
- **Affected files:** contracts, generation adapter interface, API route/application service, proposal UI, audit events, tests
- **Suggested prompt:** “Add a Translate proposal action that creates a non-approved translated revision set for a selected language. Implement a deterministic local translator fixture and preserve the approved source revisions.”

## 11. Executive portfolio dashboard

- **Complexity:** Medium
- **Business value:** Shows pipeline value, proposal cycle time, approval status, and scenario mix for leadership.
- **Affected files:** new dashboard contracts/API aggregation, new React route/components, styles, tests
- **Suggested prompt:** “Create an executive dashboard route with pipeline value, opportunities by scenario, proposal status mix, and recent activity. Use CSS charts and existing API data without adding a charting dependency.”
