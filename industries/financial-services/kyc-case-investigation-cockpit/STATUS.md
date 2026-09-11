# Deployment Status

**Current phase:** Portable fresh-clone deployment path implemented and statically validated

**Last successful deployment:** Environment-specific deployment details are intentionally not stored in the shareable repository

**Application URL:** Run `azd env get-value SERVICE_WEB_URI` for the current environment

**Primary demo case:** `KYC-DEMO-001` — Northstar Components AB — Medium risk

**Working:** Parameterized subscription-scope Bicep, unique per-environment names, ACR remote build, managed identity/RBAC, Foundry project/model, idempotent four-agent bootstrap, Document Intelligence, deterministic 25-case/40-screening seed, public cockpit, navigation, live investigation, decisions, and audit behavior.

**Known optional limitations:** Azure AI Search is optional and the baseline uses local synthetic screening. Durable Azure Storage data-plane persistence may require enterprise network policy changes; private networking is intentionally excluded. Baseline state persists only for the running Container App replica.

**Validation:** Portability scan passed across 120 shareable text files; 31 backend tests passed; deterministic seed remained 25 cases and 40 screening records; frontend production build, Bicep build, four-agent dry-run, and bootstrap idempotency tests passed.

**Next:** A colleague can authenticate, create a new `azd` environment, and run `azd up`.
