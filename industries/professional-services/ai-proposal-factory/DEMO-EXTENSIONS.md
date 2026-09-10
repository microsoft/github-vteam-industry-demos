# AI Proposal Factory — Live Demo Extensions

These optional changes are intentionally isolated and suitable for a GitHub
Copilot coding demonstration. The baseline application works without them.

## 1. Dark mode

- **Business value:** Improves comfort and demonstrates instant visual branding.
- **Likely files:** `app/frontend/src/styles.css`, `components/Sidebar.tsx`
- **Complexity:** Easy
- **Sample prompt:** “Add a persisted dark-mode toggle to the sidebar using CSS variables.”

## 2. Industry filter shortcuts

- **Business value:** Helps sales leaders focus on a market segment quickly.
- **Likely files:** `components/Dashboard.tsx`
- **Complexity:** Easy
- **Sample prompt:** “Replace the industry dropdown with clickable filter chips.”

## 3. Customer logo field

- **Business value:** Makes exported proposals feel customer-specific.
- **Likely files:** `models/domain.py`, `components/OpportunityWorkspace.tsx`, `services/exports.py`
- **Complexity:** Easy
- **Sample prompt:** “Add an optional customer logo URL and show it in the workspace.”

## 4. Risk severity chart

- **Business value:** Gives reviewers an instant visual summary of exposure.
- **Likely files:** `components/OpportunityWorkspace.tsx`, `styles.css`
- **Complexity:** Easy
- **Sample prompt:** “Add a dependency-free severity bar above the risk findings.”

## 5. New Commercial Model section

- **Business value:** Makes pricing assumptions more prominent for approvers.
- **Likely files:** `services/agents.py`
- **Complexity:** Easy
- **Sample prompt:** “Add Commercial Model after Milestones in every generated proposal.”

## 6. Proposal comparison

- **Business value:** Lets reviewers compare regenerated versions before choosing.
- **Likely files:** `services/workflow.py`, `components/ProposalWorkspace.tsx`
- **Complexity:** Medium
- **Sample prompt:** “Persist section revisions and add a side-by-side comparison drawer.”

## 7. DOCX export

- **Business value:** Supports familiar offline customer editing.
- **Likely files:** `services/exports.py`, `api/routes.py`, `components/ProposalWorkspace.tsx`
- **Complexity:** Medium
- **Sample prompt:** “Add a professional DOCX export alongside PDF and Markdown.”

## 8. Proposal translation

- **Business value:** Accelerates localization for international customers.
- **Likely files:** `services/agents.py`, `api/routes.py`, `components/ProposalWorkspace.tsx`
- **Complexity:** Medium
- **Sample prompt:** “Add an agent-backed translate action that creates a new proposal version.”

## 9. Proposal quality score

- **Business value:** Helps reviewers focus on weak or incomplete sections.
- **Likely files:** `models/domain.py`, `services/workflow.py`, `components/ProposalWorkspace.tsx`
- **Complexity:** Medium
- **Sample prompt:** “Score clarity, evidence, and completeness without adding another runtime agent.”

## 10. Reviewer comments

- **Business value:** Captures human feedback before approval.
- **Likely files:** `models/domain.py`, `api/routes.py`, `components/ProposalWorkspace.tsx`
- **Complexity:** Medium
- **Sample prompt:** “Add threaded human comments to each proposal section.”
