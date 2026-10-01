# Phase 3 Azure/AI platform

## Preserved architecture

- Microsoft Foundry, project, `gpt-5-mini`, AI Search, Document Intelligence, Storage, ACR, and `id-kyc-fs01` remain in Sweden Central.
- The existing `gpt-5-mini` `GlobalStandard` deployment is retained at capacity `20`, providing 20 requests/minute and 20,000 tokens/minute. Capacity `1` was insufficient for the contract-sized four-agent sequence.
- `cae-kyc-fs01-norwayeast` and `ca-kyc-fs01` remain in Norway East.
- The public URL is preserved. The Phase 2 revision remains available at zero traffic for rollback after Phase 3 validation.
- No Key Vault, secrets, extra model, Hosted Agent, custom agent container, or orchestration service is introduced.

## Managed data-plane deployment

`scripts\deploy_phase3_ai.py` uses `azure-ai-projects` 2.3.0 Prompt Agents and the Responses protocol. It creates or reuses a version by deterministic contract hash, routes 100% of endpoint traffic to the accepted version, invokes each agent with a fresh conversation, validates strict JSON, and deletes the conversation best-effort.

The deployment script records the exact model SKU/capacity and per-agent response IDs and elapsed times in the generated artifacts. Model deployment capacity is enforced for the preserved deployment by the always-run `infra\modules\phase3.bicep` module and is also represented in `infra\modules\foundry.bicep` for a fresh foundation deployment. The script does not replace the Foundry resource, project, or model deployment.

The script also creates/updates `kyc-screening-v1`, merges 40 stable fictional records, and verifies the deliberate `Elara Vos` potential-similarity record. All records are marked `synthetic=true`.

```powershell
python -m pip install -r requirements.txt
python scripts\deploy_phase3_ai.py --azure-cli-credential --configure-container-app
```

For managed-identity execution, omit `--azure-cli-credential` and set `AZURE_CLIENT_ID`. The executor needs Foundry agent management/invocation permissions and Search index/data permissions. The application identity needs only:

For a model-capacity-only revalidation where the existing Search seed is unchanged, use `--skip-search-seed`. This preserves the previous Search evidence and avoids requiring temporary Search write access.

- `Foundry User` on `foundry-financial-services-01`
- `Search Index Data Contributor` on `srch-kyc-fs01-7jkdk72fhocg2`

## Artifacts

- `artifacts\phase3-agent-definitions.json`: versioned instructions, strict output schemas, and focused fixtures.
- `artifacts\phase3-search-seed.json`: deterministic synthetic seed version `1.0.0`.
- `artifacts\phase3-validation.json`: response IDs and schema-validated outputs.
- `artifacts\phase3-azure-ai-handoff.json`: secret-free FullStack handoff.

Foundry agents and Search documents are unsupported as accurate ARM/Bicep data-plane resources, so Bicep represents only RBAC and non-secret runtime settings.

## Validation

```powershell
python -m py_compile scripts\phase3_contract.py scripts\deploy_phase3_ai.py
az bicep build --file infra\main.bicep --outfile infra\main.json
pytest
Push-Location app\frontend
npm run typecheck
npm run build
Pop-Location
```

Search scores are retrieval signals, not probabilities. Every screening result remains a potential synthetic similarity requiring analyst review. Agent recommendations are advisory; a human controls the final decision.

## Application integration

The FastAPI backend invokes the four agents sequentially using a fresh Foundry conversation per stage and validates each strict response before persistence. It queries the existing lexical Search index itself so the risk agent receives bounded, explicit candidate records rather than direct tool access.

The existing Blob state now also stores investigations, structured stage outputs, agent/version/response metadata, evidence references, analyst decisions, and chronological audit events. No prompts, hidden reasoning, credentials, or raw service traces are persisted.

Container Apps uses multiple-revision mode for deployment safety. A new image revision is health-checked on its revision FQDN before the unchanged public hostname is moved to the Phase 3 revision.

## Final live acceptance

Focused acceptance completed on September 30, 2026 with no rebuild, redeployment, configuration change, or new service. The public homepage and health API remained available, all 25 cases were present, and `KYC-2026-001` exposed its processed documents, normalized profile, ownership, completeness, risk, summary, and evidence.

The accepted investigation `INV-4c667b09-757b-48d1-80b6-347a976682a9` completed all seven stages with four persisted version `1` Foundry responses. The potential `Elara Vos` screening similarity is explicitly unconfirmed, synthetic, evidence-linked to `EV-SEARCH-SYN-WATCH-001`, and requires analyst verification. The AI summary is labeled AI-generated and advisory, recommends `Request More Information`, and includes the required overview, ownership, evidence, risk, open questions, next action, and rationale.

The fictional analyst `Elin Berg (fictional)` submitted `Request More Information` with the required reason. The case persisted as `Awaiting Information`, and chronological audit events separately identify the AI investigation and the human decision. The only public Container App remains `ca-kyc-fs01`; revision `ca-kyc-fs01--phase3-20260930h` is healthy at 100% traffic. AI, data, identity, and ACR remain in Sweden Central; only the approved hosting layer remains in Norway East. Detailed evidence is in `artifacts\phase3-live-acceptance.json`.
