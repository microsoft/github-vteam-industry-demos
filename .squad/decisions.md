# Squad Decisions

## Active Decisions

### 2026-07-23T12:59:03+02:00: Added Seraph (Security Engineer) to the ClaimProcessing team

**By:** Squad (Coordinator), requested by @erydrn  
**Status:** Accepted

**What:** Cast a seventh domain specialist — **Seraph** (Security Engineer, Reviewer) — from The Matrix universe. Seraph owns portal authentication/authorization, sensitive claims/PII data protection, secrets management (Key Vault / managed identities), secure handling of AI Foundry credentials, threat modeling, and a **blocking security review gate** on PRs touching auth, cryptography, or access control.

**Why:** User explicitly requested a dedicated Security Engineer for the claim-processing app, which handles sensitive PII, gated approve/reject workflows, and privileged AI Foundry credentials — a surface that warrants a specialist owner rather than diffuse responsibility. Adds a security review gate that complements Ghost's QA gate and Rai's RAI checks. Name chosen for Matrix-theme consistency; "Seraph" (guardian of access) fits the gatekeeping function and is spoiler-free. Matrix capacity now 7/10 used (3 slots free).

**Open items:**
- Seraph to draft an initial threat model for the claim intake → decision → audit pipeline once Trinity's architecture pass lands.
- Confirm Key Vault + managed-identity approach with Tank before any secret is introduced.

### 2026-07-23T12:34:44+02:00: Initial team casting for ClaimProcessing

**By:** Squad (Coordinator), requested by @erydrn  
**Status:** Accepted

**What:** Cast six domain specialists for the ClaimProcessing web app (Fidelis partnership) from The Matrix universe: Trinity (Lead/Solution Architect), Tank (Azure Architect), Switch (AI/Foundry Developer), Mouse (Frontend/Portal Developer), Dozer (Backend/API Developer), Ghost (QA/Tester/Reviewer). Built-ins (Scribe, Ralph, Rai, Fact Checker) remain active.

**Why:** User explicitly requested an AI Developer and Azure Architect with full specialist coverage for a policy-based claim-processing portal with AI Foundry agentic automation. Roster covers complete vertical: infra → AI automation → backend/policy → portal UI → coordination → QA. The Matrix universe was selected for systems/engineering resonance with capacity headroom (4 free slots) for future expansion.

**Open items:**
- Azure credentials NOT yet provided; required before Tank does live provisioning. IaC authoring can proceed.
- Tech stack for portal/backend not yet chosen — Trinity to propose in architecture pass.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
