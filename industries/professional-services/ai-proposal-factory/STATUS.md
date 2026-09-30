# Status

Current phase: Phase 3 — Human Review + Grounding + Finalization **COMPLETE**

Solution status: **COMPLETE**. The brief-required deployed workflow passed the focused final live validation on September 29, 2026. No optional extensions were started.

## Deployment

- Application URL: `https://ca-professional-services-04.graysmoke-ab215499.swedencentral.azurecontainerapps.io`
- Resource group: `rg-professional-services-04`
- Region: Sweden Central (`swedencentral`)
- Container App: `ca-professional-services-04`
- Active revision: `ca-professional-services-04--0000001`
- Revision state: Healthy, Provisioned, one replica, 100% traffic
- Revision created: September 29, 2026 at 22:48:22 UTC
- Image: `crprofservices044udfpxkj5opki.azurecr.io/ai-proposal-factory:phase3-20260929224342`
- Image digest: `sha256:44de282fa0828c782b944ef7191d63e920a4fcd64e8858445e6e935a2a12bf22`
- Phase 3 platform deployment: `phase3-platform-20260929224342` — Succeeded
- Phase 3 app deployment: `phase3-app-20260929224342` — Succeeded

## Focused final live validation

One focused end-to-end validation was run against the public URL after deployment.

- Frontend loaded without authentication and exposed the `Demo environment — synthetic data only` banner.
- `GET /api/health` returned `200 {"status":"ok","service":"ai-proposal-factory"}` and was reconfirmed after the final IaC/tag deployment.
- All 8 deterministic opportunities remained available; the selected cloud-modernization opportunity exposed its business requirements and 2 meeting-note documents.
- The reported real generation `gen-a84ca064dd70` was independently confirmed completed as approved proposal `prop-2bece0970c43` with 12 sections and 11 risk findings.
- A second fresh real three-agent generation, `gen-4c5d6ba84bc6`, completed as `prop-ac40892c1b3c`.
- The fresh proposal contained all 12 required ordered sections, requirements analysis, 9 separate risk findings, and resolved visible grounding metadata on all 12 sections.
- Manual edit/save persisted after reload and set the edited section/proposal to `In Review`.
- Proposal Writer version 2 regenerated one different section; its content changed and every other section remained byte-for-byte unchanged.
- Premature full-proposal approval returned `409`; all 12 sections were then approved and explicit full approval persisted as `Approved`.
- Risk Review exposed severity/category/status filters, summary counts, mitigations/questions, open questions, missing-information context, and related-section links.
- Risk `missing-baseline-metrics` was acknowledged with a disposition and remained acknowledged after reload.
- Markdown export returned `text/markdown; charset=utf-8`, 14,491 bytes, all 12 sections, customer/opportunity metadata, and source references.
- PDF export returned `application/pdf`, 11,956 bytes and 6 pages, with AI Proposal Factory branding, customer/opportunity metadata, all 12 sections, source notes, page footers, and a separate Risk Review appendix.
- The validated proposal has 22 durable audit records after the follow-up export-content checks. Required event classes are present: `generation.started`, `proposal.generated`, `section.edited`, `section.regenerated`, `section.approved`, `proposal.approved`, `risk.acknowledged`, `proposal.exported_markdown`, and `proposal.exported_pdf`.
- Direct Storage inspection confirmed the completed generation row, approved proposal row, 18,452-byte proposal JSON blob, and proposal-scoped audit records.
- Phase 1/2 behavior remained working: public SPA, health, dashboard, opportunity detail, meeting-note selection, polling workflow, Requirements Analyst, Search retrieval, Proposal Writer, Risk Reviewer, persisted jobs/proposals, proposal display, and separate risk findings.

The two-second polling sample observed `analysing_requirements`, `drafting_proposal`, `reviewing_risks`, and `completed`. Short-lived `queued`, `searching_knowledge`, and `saving` transitions completed between polls; those states remain implemented by the persisted workflow and UI.

## Foundry, Search, and data state

- Foundry account: `aif-prof-services-04-4udfpxkj5opki`
- Foundry project: `proj-professional-services-04`
- Model deployment: `gpt-5-mini`, model version `2025-08-07`, `GlobalStandard`, capacity 10, Succeeded
- Logical Foundry Agents remain exactly three:
  - `requirements-analyst:1`
  - `proposal-writer:2` — supports full proposal and `single_section` regeneration
  - `risk-reviewer:1`
- Azure AI Search service: `srch-prof-services-04-4udfpxkj5opki`
- Search index: `knowledge-items` — exactly one index used by the application
- Indexed knowledge: 37 items
  - 15 proposal snippets
  - 6 case studies
  - 5 service descriptions
  - 4 methodologies
  - 4 pricing assumptions
  - 3 templates
- Search industries: Cross-industry 22, Professional Services 3, Automotive 2, Financial Services 2, Manufacturing 2, Retail 2, Travel 2, Energy 1, Healthcare 1
- Blob counts: `knowledge` 37, `meeting-notes` 10, `proposals` 5
- Table counts: `opportunities` 8, `generationjobs` 7, `proposals` 5, `auditevents` 42

## Azure resource inventory

The resource group contains exactly 9 Azure Resource Manager resources:

1. `Microsoft.App/containerApps` — `ca-professional-services-04`
2. `Microsoft.App/managedEnvironments` — `cae-professional-services-04`
3. `Microsoft.ContainerRegistry/registries` — `crprofservices044udfpxkj5opki`
4. `Microsoft.OperationalInsights/workspaces` — `log-professional-services-04`
5. `Microsoft.ManagedIdentity/userAssignedIdentities` — `id-professional-services-04`
6. `Microsoft.Storage/storageAccounts` — `stprofservices044udfpxkj`
7. `Microsoft.Search/searchServices` — `srch-prof-services-04-4udfpxkj5opki`
8. `Microsoft.CognitiveServices/accounts` — `aif-prof-services-04-4udfpxkj5opki`
9. `Microsoft.CognitiveServices/accounts/projects` — `aif-prof-services-04-4udfpxkj5opki/proj-professional-services-04`

Additional logical/deployment resources:

- One `gpt-5-mini` model deployment
- Exactly three logical Foundry Agents and four total agent versions because Proposal Writer has versions 1 and 2
- One Search index, `knowledge-items`
- Blob containers: `knowledge`, `meeting-notes`, `proposals`
- Tables: `opportunities`, `generationjobs`, `proposals`, `auditevents`
- Storage policy exemption: `ai-proposal-factory-public-network`, scoped only to this Storage Account and only to `StorageAccountPublicNetworkModify`

Phase 3 Azure delta:

- No new Azure service or Azure Resource Manager resource was added.
- Added immutable application image `phase3-20260929224342` and active revision `ca-professional-services-04--0000001`.
- Added Proposal Writer version 2 without adding a fourth logical agent.
- Expanded Search from 34 to 37 documents by adding 3 deterministic templates.
- Added Phase 3 proposal review state and durable audit records within the existing Storage Account.
- Reapplied the final Phase 3 Bicep tags to 8 existing resources; all 9 resources in the Azure Resource Manager inventory now report `phase: 3`.
- The tag-only deployment did not add or replace any resource and did not change the active revision or immutable application image.

## Architecture and security preservation

- Exactly one public Container App serves the React frontend, FastAPI API, and export logic on port 8000.
- Revision mode is Single; ingress is external HTTPS, insecure traffic is disabled, and no login is required for this synthetic-data demo.
- All 9 regional resources report Sweden Central.
- No VNet, subnet, private endpoint, Private DNS zone, NAT Gateway, Application Gateway, Front Door, or Container Apps VNet integration exists.
- Storage preserves public network access with anonymous Blob access disabled, Shared Key disabled, OAuth default enabled, HTTPS-only, TLS 1.2, and no virtual-network rules.
- Search and Foundry preserve public network access with local authentication disabled.
- The Container App uses the existing user-assigned managed identity and `DefaultAzureCredential`.
- Runtime RBAC remains limited to required access: Storage Blob Data Contributor, Storage Table Data Contributor, Search Index Data Contributor, Foundry User, Cognitive Services OpenAI User, and ACR Pull.
- No Cosmos DB, Key Vault, API Management, Functions, queue, event bus, WebSocket service, second web application, private networking, vector pipeline, orchestration framework, fourth agent, or export service was added.

## Infrastructure and deployment representation

- `infra/main.bicep` builds successfully, applies the final `phase: 3` tag state, and represents the current Storage, Search, Foundry/project/model, identity/RBAC, Log Analytics, Container Apps Environment, Container Registry, single public Container App, health probes, runtime agent IDs, and preserved networking/security configuration.
- `azure.yaml` represents the one Container Apps web service and the supported reproducible deployment contract: Bicep provisioning through `azd provision`, followed by the `postup` hook running `scripts/deploy_phase3.ps1`.
- `scripts/configure_agents.py` idempotently preserves exactly three logical agents and Proposal Writer version 2 behavior.
- `scripts/configure_search.py` represents the single keyless index and deterministic 37-item corpus.
- `scripts/deploy_phase3.ps1` is the Phase 3 `postup` implementation: it validates target/region, reapplies Bicep/RBAC, configures agents and Search, builds an immutable image, updates the one Container App, seeds/indexes data, and runs the focused live smoke.

## Blocked

- None.

## Limitations and caveats

- The repository still has no baseline commit and all project files remain untracked; no commit was created during phase close.
- Two earlier failed generation records from the resolved Phase 2 Foundry agent-read RBAC issue remain as historical demo state.
- Meeting-note selection is on the completed critical path. Upload/removal, authentication, opportunity CRUD UI, comments, comparison, DOCX, translation, quality scoring, advanced version diff, and a separate risk-resolution workflow remain optional extensions.

## Completion boundary

The requested AI Proposal Factory solution is complete. All required Phase 1, Phase 2, and Phase 3 capabilities are deployed and validated at the public URL. No optional extensions, additional services, additional agents, private networking, or further assurance cycle were started. Stop at this boundary.
