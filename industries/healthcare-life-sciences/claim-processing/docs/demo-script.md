# Fidelis Claim Processing — Customer Demo Script

**Audience:** Fidelis Insurance stakeholders (claims ops + technology)
**Duration:** ~20 minutes (12 min demo + 8 min Q&A)
**Goal:** Show a modern claims portal whose decisions are enriched by a governed,
multi-agent **Microsoft AI Foundry** workflow — and show that same orchestration
running natively inside Foundry.

---

## 0. Before the meeting (prep checklist)

- [ ] Portal is live and warm (open it once so the container is spun up):
      **https://ca-web-4c5kuzbpd4uw6.icysmoke-92629667.eastus2.azurecontainerapps.io**
- [ ] Signed in to the **Azure AI Foundry portal** (https://ai.azure.com) →
      project **claim-processing** (account `aif-4c5kuzbpd4uw6`, rg `rg-claimproc`, eastus2).
- [ ] Two browser tabs ready: **(A)** the portal, **(B)** Foundry **Workflows** tab.
- [ ] Sample claim JSON handy (see Appendix A) and the sample policies memorized
      (Appendix B — use **POL-001** for the happy path).
- [ ] Network check: the portal calls Foundry live; confirm one test submission works
      end-to-end 10 minutes before the call.
- [ ] In browser developer tools, keep the **Network** tab open and filter for
      `api/claims` so the browser → API request is visible.
- [ ] In APIM metrics or tracing, keep the `aif-4c5kuzbpd4uw6` API ready to show the
      backend → AI gateway → Foundry leg.

> **One-liner for the room:** "A deterministic policy engine makes the *authoritative*
> decision; Foundry agents *enrich* it with intake validation, fraud/risk scoring, and a
> policy assessment — every step visible and auditable."

---

## 1. Framing (1 min)

> "Today I'll show three things:
> 1. A **modern claims portal** your adjusters would actually use.
> 2. The **agentic workflow** behind each decision — multiple specialized AI agents
>    coordinated by an orchestrator, plus a live documentation tool.
> 3. That same orchestration **running natively in Microsoft AI Foundry**, so your
>    team can see, govern, and evolve it — not a black box."

Emphasize the **governance boundary**: the AI is *advisory*; the deterministic
PolicyEngine and a human adjuster remain authoritative. This resonates with insurers.

---

## 2. The portal — dashboard (2 min)

Open **tab A → Dashboard**.

Talking points:
- Point out the **"Powered by Microsoft AI Foundry"** live indicator (green) — the app
  is calling real agents, not a mock.
- Walk the **stat cards** (Total / Approved / Rejected / Pending) and the recent-claims
  table — "full audit trail for every outcome."
- Note the clean, branded UI ("ClaimPortal · Fidelis").

---

## 3. Submit a claim — instant decision (3 min)

Open **Submit Claim**. Enter the happy-path claim (Appendix A, **POL-001**):

| Field | Value |
|-------|-------|
| Policy number | `POL-001` |
| Claimant | `Jane Doe` |
| Amount | `12000` |
| Incident date | ~2 weeks ago |
| Description | `Water damage to kitchen following a burst pipe.` |

Submit and narrate:
- Browser developer tools show `POST /api/claims`; the UI is using the same API that
  another channel or partner application could use.
- The backend sends the AI leg through the APIM AI gateway. APIM validates the
  workload identity, applies gateway governance, and authenticates to Foundry with
  its own managed identity.
- The **PolicyEngine** evaluates coverage/validity/deductible deterministically → the
  authoritative **Approve/Reject**.
- The **🤖 AI Recommendation** line shows the Foundry `claim-assessor` agent's advisory
  opinion + confidence + rationale.

> "The decision your regulator cares about is deterministic and explainable. The AI adds
> a second opinion and speeds up the adjuster — it never overrides policy."

**Optional contrast:** submit a rejecting case (e.g. amount `75000` on POL-001 which
exceeds the 50k limit, or use inactive **POL-002**) to show a clean rejection with reason.

---

## 4. The Agentic Workflow page (3 min) — the wow moment

Open **Agentic Workflow** (nav → 🧠).

Walk the **topology diagram**:
- **Orchestrator** (gpt-4.1-mini) delegates to three connected specialist agents —
  **Intake**, **Fraud & Risk**, **Policy Assessor** — and can consult the
  **Microsoft Learn MCP** tool for documentation.

Click **Run Agentic Workflow** (default POL-001 scenario). Narrate the **live trace** as
each step appears:
1. **Intake** — extracts & validates the claim fields.
2. **Fraud & Risk** — returns a risk score and flags.
3. **Microsoft Learn (MCP)** — pulls in external guidance via an open tool protocol.
4. **Policy Assessor** — produces the final synthesized recommendation.

Then show the **synthesized JSON** (recommendation, confidence, riskLevel, reasons,
per-agent summary).

> "Each agent is specialized and independently improvable. The orchestrator coordinates
> them, and because it speaks **MCP**, it can reach any compliant tool — internal fraud
> databases, policy systems, or public docs — without custom glue."

---

## 5. Inside Microsoft AI Foundry (3 min) — governance & extensibility

Switch to **tab B → Foundry portal**.

**Agents tab:** show the registered agents — `claim-orchestrator`, `claim-intake-agent`,
`fraud-risk-agent`, `claim-assessor`. "Every agent is a first-class, versioned,
governed asset — not code buried in the app."

**Workflows tab:** open **ClaimProcessingWorkflow** (the native visual canvas).
- Show the sequential flow: Intake → Fraud & Risk → Policy Assessor.
- Highlight that it's editable **visually or in YAML**, every save is an **immutable
  version**, and runs are **traceable** with built-in evaluators.

> "This is the part your team owns going forward. Business analysts can adjust the flow
> on the canvas; engineers can manage it as YAML in CI/CD. Same artifact, two audiences."

**Extensibility pitch:** "Adding a new capability — say a *subrogation* agent or a
connection to your claims system of record — is a new node, not a rewrite. And it's built
in **VS Code with GitHub Copilot**, so your developers move fast."

---

## 6. Close (1 min)

Recap the three pillars:
- **Trustworthy:** deterministic decisions + human authority; AI is advisory and auditable.
- **Transparent:** every agent step is visible in the app and in Foundry.
- **Extensible:** governed agents + visual/YAML workflows + MCP tools + Copilot-built.

Suggested next step with the customer: "Pick one real claim type and we'll wire a
production data source into the workflow in a short follow-up."

---

## Appendix A — Sample claim JSON (for upload demo)

```json
{
  "policyNumber": "POL-001",
  "claimantName": "Jane Doe",
  "amount": 12000,
  "incidentDate": "2026-07-10",
  "description": "Water damage to kitchen following a burst pipe."
}
```

## Appendix B — Seeded policies

| Policy | Status | Coverage | Max | Deductible | Use for |
|--------|--------|----------|-----|-----------|---------|
| **POL-001** | Active | Comprehensive | $50,000 | $500 | Happy path / approve |
| **POL-002** | Inactive/expired | — | — | — | Clean rejection (inactive) |
| **POL-003** | Active | Premium | $100,000 | — | Larger approvals |

Rejection ideas: amount **> $50,000** on POL-001 (exceeds limit); any claim on **POL-002**
(inactive); amount at/under the deductible.

## Appendix C — Key facts / cheat sheet

- **Portal URL:** https://ca-web-4c5kuzbpd4uw6.icysmoke-92629667.eastus2.azurecontainerapps.io
- **Foundry project:** `claim-processing` (account `aif-4c5kuzbpd4uw6`, eastus2, rg `rg-claimproc`)
- **Orchestrator model:** gpt-4.1-mini (tool-capable); specialist agents: gpt-5-mini
- **MCP tool:** Microsoft Learn (`https://learn.microsoft.com/api/mcp`)
- **Native workflow:** `ClaimProcessingWorkflow` (Foundry Workflows tab)
- **Governance line:** "PolicyEngine + human adjuster are authoritative; agents are advisory."

## Appendix D — If something fails (graceful fallbacks)

- **Portal slow on first hit:** the container cold-starts; pre-warm before the call.
- **Live agent call errors:** the app degrades to a low-confidence "Review" — the
  deterministic decision still stands. Say: "Notice the system never drops the claim —
  it fails safe to human review."
- **Foundry portal hiccup:** fall back to the app's **Agentic Workflow** page, which
  visualizes the same orchestration.
- **No network:** unset `Foundry__OrchestratorAgentId` locally to run the workflow page
  in **Simulation** mode — identical UX, deterministic output.
