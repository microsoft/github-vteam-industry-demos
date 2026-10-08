# Squad Team

> ClaimProcessing

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Trinity | 🏗️ Lead / Solution Architect | .squad/agents/trinity/charter.md | active |
| Tank | ⚙️ Azure Architect | .squad/agents/tank/charter.md | active |
| Switch | 🤖 AI / Foundry Developer | .squad/agents/switch/charter.md | active |
| Mouse | ⚛️ Frontend / Portal Developer | .squad/agents/mouse/charter.md | active |
| Dozer | 🔧 Backend / API Developer | .squad/agents/dozer/charter.md | active |
| Ghost | 🧪 QA / Tester (Reviewer) | .squad/agents/ghost/charter.md | active |
| Seraph | 🔒 Security Engineer (Reviewer) | .squad/agents/seraph/charter.md | active |

## Built-in Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Scribe | 📋 Session Logger | .squad/agents/scribe/charter.md | active |
| Ralph | 🔄 Work Monitor | .squad/agents/ralph/charter.md | active |
| Rai | 🛡️ RAI Reviewer | .squad/agents/Rai/charter.md | active |
| Fact Checker | 🔍 Verification & Devil's Advocate | .squad/agents/fact-checker/charter.md | active |

## Coding Agent

<!-- copilot-auto-assign: false -->

| Name | Role | Charter | Status |
|------|------|---------|--------|
| @copilot | Coding Agent | — | 🤖 Coding Agent |

### Capabilities

**🟢 Good fit — auto-route when enabled:**
- Bug fixes with clear reproduction steps
- Test coverage (adding missing tests, fixing flaky tests)
- Lint/format fixes and code style cleanup
- Dependency updates and version bumps
- Small isolated features with clear specs
- Boilerplate/scaffolding generation
- Documentation fixes and README updates

**🟡 Needs review — route to @copilot but flag for squad member PR review:**
- Medium features with clear specs and acceptance criteria
- Refactoring with existing test coverage
- API endpoint additions following established patterns
- Migration scripts with well-defined schemas

**🔴 Not suitable — route to squad member instead:**
- Architecture decisions and system design
- Multi-system integration requiring coordination
- Ambiguous requirements needing clarification
- Security-critical changes (auth, encryption, access control)
- Performance-critical paths requiring benchmarking
- Changes requiring cross-team discussion

## Project Context

- **Project:** ClaimProcessing
- **Created:** 2026-07-23
- **Customer:** Fidelis partnership
- **Vision:** A web portal where users upload claims and the system approves/rejects
  each claim based on the applicable policy, with Microsoft AI Foundry agentic flows
  automating parts of the workflow. Custom agents are built in VS Code + GitHub Copilot;
  the design supports adding more agents/features later.
- **Casting universe:** The Matrix (capacity 10 — 3 name slots free for future growth).
