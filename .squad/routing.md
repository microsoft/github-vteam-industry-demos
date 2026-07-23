# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Architecture & sequencing | Trinity | System design, component boundaries, decomposition, what to build next |
| Azure infra & provisioning | Tank | Bicep/IaC, App Service/Container Apps, storage, Key Vault, identity, AI Foundry resources |
| AI / Foundry agentic flows | Switch | Claim extraction, policy-matching flows, approve/reject recommendation, agent evaluation |
| Frontend / portal | Mouse | Claim upload UI, claim list/detail views, reviewer approve/reject UX, visual polish |
| Backend / API & policy engine | Dozer | Claims API, policy-evaluation logic, data model, decision audit trail, auth enforcement |
| Code review | Ghost | Review PRs, check quality, suggest improvements |
| Testing | Ghost | Write tests, find edge cases, verify approve/reject correctness |
| Security & auth | Seraph | AuthN/AuthZ for the portal, PII/claims data protection, secrets (Key Vault / managed identities), securing AI Foundry credentials, threat modeling |
| Security review gate | Seraph | Approve/reject PRs touching authentication, cryptography, or access control |
| Scope & priorities | Trinity | What to build next, trade-offs, decisions |
| Session logging | Scribe | Automatic — never needs routing |
| RAI review | Rai | Content safety, bias/fairness in automated claim decisions, credential detection |
| Verification & devil's advocate | Fact Checker | Verify claims/refs, challenge design assumptions before shipping |

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, assign `squad:{member}` label | Trinity (Lead) |
| `squad:{name}` | Pick up issue and complete the work | Named member |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, the **Lead (Trinity)** triages it — analyzing content, assigning the right `squad:{member}` label, and commenting with triage notes.
2. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by removing their label and adding another member's label.
4. The `squad` label is the "inbox" — untriaged issues waiting for Lead review.

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn the tester to write test cases from requirements simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. The Lead handles all `squad` (base label) triage.
8. **Security gate** — any PR touching authentication, cryptography, or access control routes to **Seraph** for a review verdict before merge. Seraph's gate is blocking; other reviews stay advisory.
