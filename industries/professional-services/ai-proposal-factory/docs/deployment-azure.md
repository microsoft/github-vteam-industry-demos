# Azure deployment

## Guardrails and target

This deployment is subscription-scoped so Bicep can create the dedicated resource group. It is intentionally locked to:

- Region: `swedencentral`
- Resource group: `rg-aipf-dev-swc-001`
- Globally unique suffix: `e2d6ac891bb7`
- No secondary region and no UK South fallback
- Container Apps Consumption for the web/API revision, worker, and manual seed job
- Key Vault disabled by default; it must remain disabled until a concrete application secret is approved

The parameter file is `infra\parameters\dev.swedencentral.bicepparam`. Model versions and capacities are pinned there and in `infra\main.bicep`.

## Resource topology

The web Container App runs two containers in one revision:

1. `web` serves the built React application on port `8080` and reverse-proxies `/api/*` to `http://localhost:3001`.
2. `api` runs Fastify on port `3001`.

The API binds **127.0.0.1 only**, in the replica's shared network namespace. API health probes use Nginx port 8080; no extra ingress mapping exposes 3001. Built-in Entra authentication precedes Nginx, and all API resources require an assigned single-tenant workspace member. Resource managed identity is not user identity.

Before deploying workloads, bootstrap a dedicated secretless Entra registration in the deployer's tenant and set `AIPF_ENTRA_CLIENT_ID` as described in `authentication.md`. Finalize its exact HTTPS callback once the app FQDN is available. No anonymous mode is supported in Azure; missing registration settings fail closed.

An Entra **Application Administrator**, **Cloud Application Administrator**, existing application owner, or equivalently authorized administrator performs the one-time registration and app-role assignment. Prefer assigning `ProposalFactory.WorkspaceMember` to a security-enabled group. Direct group members are then ordinary application users; they need no Azure subscription role or Entra administrator role, and an authorized group owner can manage ongoing membership without changing the application registration.

The same-origin topology matches the browser's relative `/api` requests without browser-visible credentials or cross-origin configuration. A separate worker Container App retains **one 0.5-vCPU/1-GiB Consumption replica**, with `proposal-jobs` queue scale-out to three. This is intentional: its startup/idle outbox loop must remain alive even when API enqueue fails into an empty queue. It adds continuous compute allocation and Cosmos/Queue polling costs instead of introducing another scheduled workload. Do not change its minimum to zero without providing another independently live dispatcher. See `reliability.md` for the tradeoff and offline evidence. The manual Container Apps Job still seeds Cosmos DB, private Blob content, and the Azure AI Search index.

The API does not currently include Fastify static-file serving. Packaging therefore uses an unprivileged Nginx sidecar for the compiled SPA and same-origin proxy rather than changing Product-owned application behavior.

`scripts\azure\test-worker-liveness.ps1` validates the retained worker/identity source contract offline and runs with container source checks and infrastructure CI. After a separately authorized deployment, run `scripts\azure\validate-worker-liveness.ps1` in addition to the unchanged `validate.ps1` response contract. The deployment workflow invokes both. The additional read-only validator requires a nonzero minimum, the identity-based queue rule and a replica in the latest ready revision. It does not substitute for live empty-queue fault injection and eventual-completion evidence.

Three user-assigned identities keep runtime search-read separate from indexing:

- Web/API: application data access, uploads, queue send, Search Index Data Reader, Azure OpenAI User.
- Worker: queue-scoped Storage Queue Data Contributor on the work queue and Storage Queue Data Message Sender on the poison queue, required Blob/Cosmos access, Search Index Data Reader, Azure OpenAI User.
- Seeder: reusable-content Blob write, Cosmos seed write, Search Index Data Contributor, Search Service Contributor, Azure OpenAI User.

ACR admin authentication, Storage shared-key access, Cosmos local auth, Search local auth, Azure OpenAI local auth, and Application Insights local auth are disabled. Blob containers are private. Public service endpoints remain enabled for the demo; access is authorized with Microsoft Entra ID and resource-scoped RBAC.

The development subscription's management-group initiative normally forces Storage and Cosmos public network access off. On September 7, 2026, the repository owner approved and Platform created the resource-group-scoped waiver `aipf-dev-public-data-plane`. It exempts only `StorageAccountPublicNetworkModify` and `CosmosDBPublicNetworkModify` under `MCAPSGovDeployPolicies` for `rg-aipf-dev-swc-001`. Do not broaden its scope or add other policy references. Removing the waiver requires a reviewed private-endpoint/VNet architecture before the application can remain operational.

## Production images

The repository contains four multi-stage Linux AMD64 image definitions:

| Repository | Dockerfile | Runtime contract |
|---|---|---|
| `aipf-web` | `containers\Dockerfile.web` | Non-root Nginx on `8080`; serves the SPA and proxies `/api/*` plus `/health` to `API_UPSTREAM`. |
| `aipf-api` | `containers\Dockerfile.api` | Non-root Node 24 process on `PORT=3001`; exposes `/health`; uses Azure data/AI composition when both providers are `azure`. |
| `aipf-worker` | `containers\Dockerfile.worker` | Non-root, continuously running Node worker with SIGTERM forwarding, queue renewal, outbox reconciliation, and durable publication. |
| `aipf-seeder` | `containers\Dockerfile.seed` | Non-root, idempotent Cosmos/Blob/Search seed/index job. Its exec-form entrypoint is `dumb-init -- node containers/dist/seed-entrypoint.js`, so image arguments such as `--help` and network-free `--dry-run` reach the Node seeder while dumb-init remains PID 1 for signal forwarding. |

All repositories use the same immutable `imageTag` parameter (normally the Git commit SHA). Bicep constructs `<acr-login-server>/<repository>:<imageTag>` and configures ACR pull with each workload identity. No registry credentials are parameters or outputs.

The API, worker, and seeder images run `npm ci --omit=dev` from the lockfile and retain installed workspace production dependencies. Their builds externalize Azure SDK packages, `openai`, `zod`, document extraction libraries, and selected export dependencies. Copying only bundled `dist` output is unsupported.

Each Dockerfile has a mandatory verification stage chained into the final image. It checks external dependency imports and its applicable API loopback, worker startup, static bundle, or seed help/dry-run behavior. `scripts\azure\test-container-contract.ps1` independently verifies the seeder ENTRYPOINT/CMD argument composition and that neither local nor ACR builds can skip the source/verification contract. `scripts\azure\validate-images.ps1` inspects the final seeder image metadata, executes that image with `--help` and `--dry-run`, starts the final web and API images together, and verifies `/`, `/health`, and `/api/dashboard` through the same public origin. Runtime containers use non-root users and restrict local validation writes to temporary filesystems.

The ACR is created by infrastructure, so the first deployment is staged with the `deployWorkloads` Bicep parameter:

1. Deploy the registry and baseline data/AI resources with `deployWorkloads=false`.
2. Build and push the four verified application images using ACR Tasks or a locally authenticated Docker engine.
3. Redeploy with `deployWorkloads=true` using the immutable tag.

Use the full Git commit SHA as `imageTag`; floating tags such as `latest`, `main`, or `dev` are rejected by deployment scripts. `scripts\azure\build-images.ps1` reports both tag and resolved digest after a push. Bicep deploys the explicit immutable tag and uses workload managed identities for pull; ACR admin credentials remain disabled.

## Managed-identity configuration contract

The API, worker, and seeder receive:

- `AZURE_CLIENT_ID`
- `DATA_PROVIDER=azure`, `AI_PROVIDER=azure`
- `AZURE_LOCATION=swedencentral`, `AZURE_REGION_CODE=swc`, `AZURE_RESOURCE_GROUP=rg-aipf-dev-swc-001`
- `AZURE_STORAGE_ACCOUNT_NAME`
- `AZURE_STORAGE_BLOB_ENDPOINT`
- `AZURE_STORAGE_QUEUE_ENDPOINT`
- Blob container and queue names
- `AZURE_COSMOS_ENDPOINT`, database, and container names
- `AZURE_SEARCH_ENDPOINT`, `AZURE_SEARCH_INDEX`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_GENERATION_DEPLOYMENT`
- `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`
- pinned client API versions and AI retrieval/token settings
- `APPLICATIONINSIGHTS_CONNECTION_STRING`
- `APPLICATIONINSIGHTS_AUTHENTICATION_STRING`

Only the API additionally receives `AUTH_MODE=entra`, `AUTH_TRUSTED_PROXY=container-apps`, `AUTH_TENANT_ID`, the dedicated end-user `AUTH_CLIENT_ID`, and `AUTH_PUBLIC_ORIGIN`. `NODE_ENV=production` cannot use development auth. These values are injected by Bicep; they do not replace the resource managed identity `AZURE_CLIENT_ID`.

These are identifiers and endpoints, not secrets. Node adapters should use `DefaultAzureCredential` with the supplied user-assigned client ID. Intelligence owns Search schema, embedding/vector dimensions, OpenAI request behavior, grounding, and citation preservation. Product owns Azure composition roots for Cosmos, Blob, Queue, and telemetry.

Search indexes are data-plane objects and are intentionally created by the idempotent seeder, not the control-plane Bicep. RBAC can take several minutes to propagate; seed retries must treat HTTP 401/403 as transient for a bounded period. No service requires staged key enablement in the target architecture. If an SDK limitation is discovered, stop and document it rather than enabling keys silently.

The Azure runtime now persists immutable `AiJob` snapshots and fenced checkpoints in the existing `generation-runs` Cosmos container. Its same-document lease renews every 20 seconds under a 60-second lease, and Queue Storage visibility renews throughout processing. Publication uses ETag checks, deterministic identifiers, pending-delivery reconciliation, and completion-last recovery across containers. No Blob lease container is required. Cloud validation must still prove lease renewal, queue renewal, retry recovery, and duplicate-delivery behavior under real latency before increasing worker replicas.

## Local validation without provisioning

Run from the repository root:

```powershell
az bicep version
.\scripts\azure\test-deployment-validation-contract.ps1
.\scripts\azure\validate-container-sources.ps1
az bicep build --file .\infra\main.bicep --stdout 1>$null
az bicep build-params --file .\infra\parameters\dev.swedencentral.bicepparam --stdout 1>$null
.\scripts\azure\preflight.ps1
.\scripts\azure\build-images.ps1 -ImageTag '<full-git-sha>' -RegistryLoginServer local
```

`preflight.ps1` is read-only. It verifies the active subscription, provider registration, Sweden Central resource-type availability, and pinned model catalog entries. It does not register providers or create deployment history.

Both image paths require a running Linux Docker engine because build completion alone is not final-image execution evidence. The local path validates before any optional push. On September 7, 2026 the Docker CLI was installed in the validation environment, but the Docker Desktop Linux engine was not running, so local image builds were not claimed. After the ACR bootstrap, the remote build-and-validation path is:

```powershell
.\scripts\azure\build-images.ps1 -ImageTag '<full-git-sha>' -UseAcrBuild
```

`build-images.ps1 -UseAcrBuild` first runs the offline source and seeder command-contract checks, then explicitly targets each Dockerfile's final `runtime` stage. Each final Node image copies a marker from its mandatory verification stage, so an ACR build cannot omit that stage. The script then signs in with Microsoft Entra ID, pulls every ACR-built image to the Linux engine, and runs the same mandatory final-image suite as a local build. There is no skip switch. ACR admin credentials remain disabled.

Until either path runs on an available Linux engine, do not claim final-image execution, the seeder configured-command checks, or the combined web/API same-origin container check.

Do not run subscription validation or what-if until deployment review is authorized. When authorized:

```powershell
.\scripts\azure\what-if.ps1 -ImageTag '<immutable-git-sha>'
```

## Provision and seed

Provisioning is deliberately not performed by repository validation:

```powershell
.\scripts\azure\deploy.ps1 -ImageTag 'bootstrap' -SkipWorkloads
.\scripts\azure\build-images.ps1 -ImageTag '<full-git-sha>' -UseAcrBuild
.\scripts\azure\deploy.ps1 -ImageTag '<immutable-git-sha>'
.\scripts\azure\seed.ps1
.\scripts\azure\validate.ps1
```

Recheck Azure OpenAI quota immediately before provisioning. The verified capacities are not reservations. If either pinned model/version/SKU/capacity is blocked in Sweden Central, stop; do not change region or model automatically.

## GitHub OIDC bootstrap

`.github\workflows\deploy-dev.yml` assumes no credentials exist until an Azure administrator explicitly bootstraps them:

1. Create or select a Microsoft Entra application/service principal for GitHub Actions.
2. Add a federated identity credential restricted to this repository and the `development` GitHub environment.
3. Grant only the control-plane roles needed for the deployment at subscription or dedicated resource-group scope. Subscription-scope resource-group creation and role assignments require carefully reviewed permissions, including `Microsoft.Authorization/roleAssignments/write`.
4. For remote `az acr build`, grant the build identity **Container Registry Tasks Contributor** on the dedicated ACR. For local Docker push, grant **AcrPush** instead. Do not enable the registry admin user.
5. Define GitHub environment variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID`.
6. Protect the `development` environment with required reviewers.
7. Add the separate non-secret `AIPF_ENTRA_CLIENT_ID` variable from the approved end-user registration bootstrap. The OIDC deploy identity needs read-only directory visibility to validate that registration, not app/user assignment write permissions.

No client secret is required. The manual workflow accepts an immutable image tag, bootstraps the platform without workloads, uses ACR Tasks to build images, pulls and executes every final image on the hosted Linux runner, performs the full what-if/deployment, optionally seeds, and validates.

## Post-deployment evidence

The deployment is not complete until all evidence is captured:

- All expected resources exist only in `rg-aipf-dev-swc-001` and Sweden Central.
- Web/API, worker, and seeder have the expected identities and resource-scoped RBAC.
- Container Apps use identity-based ACR pull and healthy revisions.
- Image labels and deployed revisions use the requested immutable build tag; pushed digests match ACR metadata.
- Blob containers are private; Storage shared-key access is disabled.
- Cosmos, Search, Azure OpenAI, and Application Insights local auth are disabled.
- Seed job succeeded and produced at least 10 opportunities plus the required reusable content.
- Search index exists, document count is nonzero, and opportunity-specific retrieval varies.
- Web dashboard responds; generation, persistence, section workflow, approval, Markdown/PDF export, and audit history work.
- Application Insights contains request/dependency/exception telemetry with no obvious recurring errors.
- Queue visibility is renewed during generation, immutable job/checkpoint persistence survives restarts, and duplicate delivery does not duplicate publication.
- Browser multipart upload transfers actual validated bytes through the same-origin proxy to the API and private Blob Storage, with bounded extraction used by generation. The proxy permits the matching 25 MB body limit and disables request buffering. Deployed validation must cover Markdown/text, DOCX, and text-based PDF uploads plus invalid, oversized, and image-only rejection paths.

Use `scripts\azure\validate.ps1` for repeatable control-plane and HTTP checks, then exercise the full demo flow manually or through the application's end-to-end validation suite.

The validator treats optional Azure response properties defensively under StrictMode. In particular, an omitted or null `passwordSecretRef` is accepted, a non-empty password reference is rejected, and every web/worker/seeder registry must provide the expected ACR server plus an identity assigned to that workload. Azure CLI nonzero exits, empty JSON, and malformed JSON are reported with the operation and command that failed. Run `scripts\azure\test-deployment-validation-contract.ps1` offline to reproduce the omitted, null, password-bearing, malformed, and CLI-failure cases without contacting Azure.
