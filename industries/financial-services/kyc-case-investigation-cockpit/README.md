# KYC Case Investigation Cockpit


## 🚀 Demo Resources

**Live Application:**  
https://ca-kyc-fs01.salmonpebble-2b6fa79e.norwayeast.azurecontainerapps.io/

**Demo Video:**  
[Watch the end-to-end demo](./demo/financial-services-kyc-demo.mp4)

**GitHub Copilot CLI + Squad Live Demo Changes:**  
[Open the quick-change playbook](./LIVE-DEMO-QUICK-CHANGES.md)

> All customer and KYC data used in this demo is synthetic.

Phase 3 is a single-container React + FastAPI demonstration for reviewing synthetic KYC cases and running a checkpointed, human-controlled investigation through four Microsoft Foundry Prompt Agents and the existing Azure AI Search index.

## Target

- Resource group: `rg-financial-services-01` (must already exist)
- Primary AI/data region: `swedencentral`
- Phase 2 Container Apps hosting exception: `norwayeast`
- Foundry resource: `foundry-financial-services-01`
- Foundry project: `proj-financial-services-01`

## Run locally

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r requirements-dev.txt
Push-Location app\frontend
npm install
npm run build
Pop-Location
.\.venv\Scripts\uvicorn app.backend.main:app --reload
```

Open `http://localhost:8000`. Local mode uses deterministic in-memory synthetic data.

## Deploy

```powershell
az account set --subscription e2d6ac89-1bb7-420c-97fb-a96dea6c0635
az bicep build --file infra\main.bicep
az deployment group create `
  --resource-group rg-financial-services-01 `
  --template-file infra\main.bicep `
  --parameters infra\main.parameters.json
```

The deployment preserves the failed `cae-kyc-fs01` as capacity-failure evidence and reuses `cae-kyc-fs01-norwayeast` plus the public `ca-kyc-fs01`. Phase 3 uses deterministic image tag `acrkycfs017jkdk72fhocg2.azurecr.io/kyc-cockpit:phase3-20260930-184342`.

All AI, data, identity, and registry resources remain in Sweden Central. The Norway East hosting network contains a private endpoint to the existing Sweden Central Storage Account because public storage access remains disabled. The application authenticates to Storage and Document Intelligence with `id-kyc-fs01` through `DefaultAzureCredential`; no credentials or connection strings are required.

## Validate

```powershell
pytest
Push-Location app\frontend; npm run typecheck; npm run build; Pop-Location
Invoke-RestMethod https://ca-kyc-fs01.salmonpebble-2b6fa79e.norwayeast.azurecontainerapps.io/api/health
Invoke-RestMethod https://ca-kyc-fs01.salmonpebble-2b6fa79e.norwayeast.azurecontainerapps.io/api/cases
az resource list --resource-group rg-financial-services-01 --output table
```

The final focused live acceptance completed on September 30, 2026 against `KYC-2026-001`. The accepted investigation is `INV-4c667b09-757b-48d1-80b6-347a976682a9`; all seven stages and four Foundry outputs completed, the advisory recommendation was `Request More Information`, and the human action moved the case from `Ready for Decision` to `Awaiting Information`. Run `scripts\live_smoke.py` to revalidate the persisted completed investigation and idempotent decision without starting another investigation.

The visible disclaimer is mandatory: this is synthetic demonstration data and is not a compliance decision system. Agent recommendations are advisory only; only the explicit human decision endpoint changes the final case status.

## Phase 3 Azure/AI platform

The four managed Prompt Agents and `kyc-screening-v1` Search index are data-plane objects created by `scripts\deploy_phase3_ai.py`; they are intentionally not represented as ARM resources. Bicep contains only the existing-resource RBAC and non-secret Container App configuration.

```powershell
python scripts\deploy_phase3_ai.py --generate-only
python scripts\deploy_phase3_ai.py --azure-cli-credential --configure-container-app
az bicep build --file infra\main.bicep
```

The deployment is idempotent: an agent version is reused when its model, instructions, and strict response schema hash match. See `docs\phase3-ai-platform.md` and `artifacts\phase3-azure-ai-handoff.json`.

## Phase 3 application flow

FastAPI owns the sequential workflow and persists every checkpoint in the existing Blob-backed `demo-state.json`:

1. Read submitted documents and consume existing or newly completed Document Intelligence extraction.
2. Invoke `kyc-document-entity-extractor:1`.
3. Invoke `kyc-completeness-validator:1`.
4. Query `kyc-screening-v1` for relevant fictional entities.
5. Invoke `kyc-risk-investigator:1` with grounded Search candidates.
6. Invoke `kyc-analyst-summary:1`.
7. Save the investigation and move the case to `Ready for Decision`.

The UI polls once per second, preserves successful sections after a later failure, permits retry from the first incomplete stage, labels screening results as unconfirmed synthetic similarities, and requires analyst name/reason for Approve, Request More Information, or Escalate.

## Redeploy Phase 3

```powershell
$tag = "phase3-20260930-184342"
az acr build --registry acrkycfs017jkdk72fhocg2 --image "kyc-cockpit:$tag" .
az containerapp revision set-mode --name ca-kyc-fs01 --resource-group rg-financial-services-01 --mode multiple
az containerapp update --name ca-kyc-fs01 --resource-group rg-financial-services-01 `
  --image "acrkycfs017jkdk72fhocg2.azurecr.io/kyc-cockpit:$tag" `
  --revision-suffix "phase3-20260930"
```

Verify the new revision through its revision FQDN before shifting ingress traffic, then retain the Phase 2 revision at zero traffic for rollback.
