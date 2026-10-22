# AI Proposal Factory — deployed Azure architecture

![AI Proposal Factory deployed Azure architecture](ai-proposal-factory.png)

| Deliverable | Use |
|---|---|
| [PNG](ai-proposal-factory.png) | 3840 × 2160, 16:9; README and high-resolution presentations |
| [SVG](ai-proposal-factory.svg) | 1920 × 1080 viewBox; self-contained vector cards, text and connectors; embedded official icons |
| [PowerPoint](ai-proposal-factory.pptx) | One 13⅓ × 7½ inch slide; native editable shapes, text and connectors; only icons are pictures |
| [Mermaid](ai-proposal-factory.mmd) | Matching semantic architecture for Markdown/Mermaid renderers; automatic layout, not pixel-identical |

## Read the diagram in 15–20 seconds

The consultant's browser connects over HTTPS to **AI Proposal Factory**, one application hosted in **Azure Container Apps** with a React frontend and Python FastAPI backend.

The application connects to three services: **Microsoft Foundry** runs **Requirements Analyst → Proposal Writer → Risk Reviewer** in sequence; **Azure AI Search** provides organizational knowledge for grounded proposals; **Azure Storage** holds documents and application data. Agent arrows show application-orchestrated execution order, not direct agent networking. PDF export is a small application output annotation, not another service.

The single footer credits build and deployment tooling, not runtime components. Resource names, model/version details, hosting internals, security, observability and prior verification evidence are retained below rather than shown in the graphic.

## Evidence and verification

**Verified read-only on 22 October 2026.** Azure CLI 2.91.0 was available and authenticated. ARM resource/configuration reads, Foundry agent-version reads, Search index metadata/count, Blob container names, Table names, identity-role reads and `GET /api/health` succeeded. No deployments, generation runs, approvals, exports, data writes, key queries, or Azure mutations were performed. No `.env` files or secrets were read. The health response was `{"status":"ok","service":"ai-proposal-factory"}`; it is not a fresh end-to-end AI validation.

### Actual resource and runtime names

All ten currently enumerated ARM resources report `swedencentral`. The model is **GlobalStandard**: resource placement in Sweden Central does **not** establish Sweden-only model inference/data residency.

| Component | Live verified value |
|---|---|
| Resource group | `rg-professional-services-04` |
| Public app | `ca-professional-services-04` |
| Container Apps Environment | `cae-professional-services-04`; no VNet configuration; log destination `log-analytics` |
| Registry | `crprofservices044udfpxkj5opki` |
| Running image | `crprofservices044udfpxkj5opki.azurecr.io/ai-proposal-factory:phase3-20260929224342` |
| Foundry account | `aif-prof-services-04-4udfpxkj5opki` |
| Foundry project | `proj-professional-services-04` |
| Requirements Analyst | `requirements-analyst:1`; model `gpt-5-mini`; zero agent tools |
| Proposal Writer | `proposal-writer:2`; model `gpt-5-mini`; zero agent tools |
| Risk Reviewer | `risk-reviewer:1`; model `gpt-5-mini`; zero agent tools |
| Model deployment | `gpt-5-mini`; model version `2025-08-07`; SKU `GlobalStandard`; provisioning `Succeeded` |
| Search | `srch-prof-services-04-4udfpxkj5opki`; sole index `knowledge-items`; 37 indexed items |
| Storage account | `stprofservices044udfpxkj` |
| Blob containers | `knowledge`, `meeting-notes`, `proposals` |
| Tables | `opportunities`, `generationjobs`, `proposals`, `auditevents` |
| User-assigned identity | `id-professional-services-04` |
| Log Analytics | `log-professional-services-04` |

Public application URL: <https://ca-professional-services-04.graysmoke-ab215499.swedencentral.azurecontainerapps.io/>.

### Material implementation nuances / deviations from assumptions

- **Frontend hosting versus execution:** compiled React assets are inside the same image and served by FastAPI; JavaScript executes in the consultant's browser. There is no separate frontend Azure host.
- **Search is backend integration**, not autonomous agent retrieval, a vector/embedding pipeline, or a fourth agent. `AzureSearch.retrieve` uses keyword search plus industry filters (top six). FastAPI passes the results as `retrievedKnowledge`. The three live prompt agents have no tools.
- **Exactly three logical agents, four versions:** Proposal Writer version 1 remains deployed, but the Container App explicitly selects version 2. Version 2 also supports single-section regeneration; it is not a fourth agent.
- **Blob versus Table:** proposal JSON contains sections, requirements analysis, risks, section approvals and full review state. The `proposals` **Table** stores status, timestamps and the JSON blob pointer, not the full section bodies. Generation progress is in `generationjobs`; audit records are in `auditevents`. Meeting notes/knowledge are seeded assets; the diagram does not claim a general document-upload UI.
- **Export is streamed**, not persisted as PDF/Markdown blobs. Calling an export route would write an audit event, so exports were verified from code and the historical final acceptance record, **not invoked during this read-only task**. The PDF export annotation is an application output, not an Azure resource; Markdown export is also implemented but omitted from the high-level graphic.
- **App access is anonymous for a synthetic-data demo.** Public ingress, `allowInsecure=false`, one `web` container and port 8000 were verified. Service-to-service access uses `DefaultAzureCredential` and the user-assigned managed identity. Search and Foundry have public networking enabled and local auth disabled. Storage has public networking enabled, anonymous Blob access disabled, Shared Key disabled and HTTPS-only enabled.
- **Actual RBAC** on the runtime identity: Storage Blob Data Contributor, Storage Table Data Contributor, Search Index Data Contributor, Foundry User, Cognitive Services OpenAI User, and AcrPull at the corresponding resource scopes. Do not infer least-privilege read-only roles from the high-level diagram.
- **Inventory drift versus September STATUS:** live inventory now contains **ten**, not nine, ARM resources. The extra resource is Storage system topic `stprofservices044udfpxkj-704a2218-82e0-4bd7-a1a8-db9907039e65` (`Microsoft.EventGrid/systemTopics`), source = this Storage account, with `StorageAntimalwareSubscription` (`WebHook`). Its origin/ownership was not determined; no app integration was found in the inspected implementation/IaC. It is omitted from the high-level **application request path**, not denied or depicted as an application event bus. No subscription destination URLs were retrieved.
- **Historical acceptance is not a new smoke test:** `STATUS.md` records completed Phase 3 validation on 29 September 2026. The older repository README/architecture note described Phase 1; entry points now link this current set. The original brief contains aspirational/optional features; this diagram follows implemented behavior plus current Azure metadata.

### Source files inspected

- `AI-PROPOSAL-FACTORY-SQUAD-BRIEF-V6-RG04.md`: overriding phased-build rules and runtime/hosting/data architecture sections.
- `STATUS.md`: Phase 3 acceptance, actual resource names and historical validation (not treated as current live proof).
- `Dockerfile`, `azure.yaml`: one runtime image, static frontend build, Bicep/azd and Phase 3 deployment hook.
- `app/backend/proposal_factory/main.py`, `api.py`, `workflow.py`, `adapters.py`: static serving, REST/review/streamed exports, backend sequencing, Search retrieval and Blob/Table persistence.
- `scripts/configure_agents.py`, `scripts/configure_search.py`: prompt-agent definitions, versioning and keyword Search schema.
- `infra/main.bicep`, `infra/modules/container-apps-environment.bicep`, `managed-identity.bicep`, `storage.bicep`, `foundry.bicep`: hosting/logging, identity, storage boundaries and model/IaC evidence.
- `.squad/team.md`, `routing.md`, `agents/lead/charter.md`, `agents/lead/history.md`, `decisions.md`: the three active development roles and architecture contracts.
- The complete user-supplied 320-line architecture request was read; it is not copied into the deliverables.

Read-only verification used scoped/sanitized forms of:

```powershell
az resource list -g rg-professional-services-04 --query "[].{name:name,type:type,location:location}"
az cognitiveservices account deployment list -g rg-professional-services-04 -n aif-prof-services-04-4udfpxkj5opki --query "[].{name:name,model:properties.model,sku:sku.name,state:properties.provisioningState}"
# Container App: inspect ingress, image, identity type, environment ID and allowlisted non-secret settings only.
# SDK + AzureCliCredential: agents.list_versions for the three known names; inspect id/model/tool count only.
# SDK reads: SearchIndexClient.list_index_names, SearchClient.get_document_count,
# BlobServiceClient.list_containers, TableServiceClient.list_tables (metadata only).
```

## Editing and reproducing

- **PowerPoint:** open the `.pptx`, select any card/text/connector and edit it directly. Each leg of a routed connector is a native editable straight connector; moving a card may require moving its connectors. The slide is not a flattened PNG. Icons alone are transparent raster images.
- **SVG:** open in a vector editor. Text, lines and boundaries are vector objects; Azure icons are embedded SVG images. It has no external assets/scripts/fonts. Segoe UI is requested with Arial/sans-serif fallbacks; fonts are not embedded.
- **Single generation source:** edit `generate.py` and regenerate all four formats together. Run both validators to preserve architectural consistency. Mermaid uses automatic layout rather than the fixed slide geometry; its footer is an unboxed annotation with an invisible layout link, not a service or data flow. Paste its contents into a Markdown `mermaid` fence or open it in a Mermaid-capable editor.

From the repository root, with Python and Chromium for Playwright already available:

```powershell
python docs\architecture\generate.py
python docs\architecture\validate.py
python docs\architecture\validate_mermaid.py
```

If dependencies are missing, install the isolated documentation requirements with `python -m pip install -r docs\architecture\requirements.txt`, then `python -m playwright install chromium` if the browser is missing. No application dependencies or Azure configuration are changed by the generator.

`generate.py` is offline: it embeds four of the retained official icons and renders locally with Chromium. All original icon assets and attribution are preserved. `validate_mermaid.py` downloads **only** the pinned Mermaid 11.12.0 public renderer into memory, verifies its SHA-256, then blocks browser networking before passing the local diagram to the renderer. No project/diagram source is uploaded.

## Validation completed

- Generator: persisted 1920 × 1080 SVG, 3840 × 2160 PNG, one-slide editable PPTX and matching high-level Mermaid.
- The actual simplified raster was visually inspected for readability and spacing.
- Offline validator: exactly five core elements and three agent subnodes, equal service-card dimensions, connection topology, exact footer, excluded-detail checks, cross-format labels, embedded icons, image dimensions, README links and native PPTX editability/bounds. Browser-measured text checks cover allocated widths, canvas bounds, text overlaps and card-border crossings.
- Mermaid 11.12.0: local parse/render check with browser networking blocked. No application test suite or live AI generation was needed for this documentation-only change.
- PPTX structure/editability is validated; it was not opened/rendered in desktop PowerPoint, so platform font substitutions may alter text metrics.

Icon attribution and permitted-use terms: [icons/NOTICE.md](icons/NOTICE.md).
