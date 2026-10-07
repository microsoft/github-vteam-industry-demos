# Deployment and operator guide

## Application contract

One Node.js 24/TypeScript service hosts the REST API and React production build
on port 8080. Azure uses Blob-backed optimistic concurrency and the
user-assigned managed identity for Blob, ACR, and Microsoft Foundry. No
application secret, registry password, Storage key, or Foundry key is required.

The canonical scenario is deterministic:

- Dublin `HL-KNT-EVD-FGN-M`: 12 available, demand 8/day, 1.5 cover days;
- inbound arrives day 5 and projected shortage is 28 units;
- Cork transfer: 32 units, day 1, cost EUR 31;
- Cork donor floor: 28 units; 48 remain, preserving 12 cover days.

AI receives backend-generated evidence and options only. Responses are schema
validated, grounded to supplied IDs, constrained to the deterministic preferred
option, and given the exact promotion caveat. Human approval remains mandatory.

## Clean local validation

Node.js 22 or later is required; the container uses Node.js 24.

```powershell
Set-Location app
npm ci --no-audit --no-fund
npm run seed
npm run typecheck
npm run test:unit
npm run test:integration
npm test
npm run build:full
```

Playwright validation remains Frontend-owned. The final integrated image must
contain `app/dist/web`; do not build or publish it until Frontend integration is
complete.

## Portable configuration

Do not copy the current subscription, resource group, generated hostname,
globally unique names, CIDRs, model capacity, or image tag blindly. For each
deployment explicitly select:

- subscription and resource group;
- foundation and runtime regions;
- Foundry account/project, model name/version/SKU/capacity;
- ACR, identity, monitoring, Storage, Container Apps environment/app names;
- image repository and immutable tag;
- VNet/subnet CIDRs and private endpoint/DNS link names;
- public-demo exact origin or Entra access.

Run the read-only preflight and the complete foundation/runtime sequence in
`infra/README.md`. It covers provider registration, model availability/quota,
global-name checks, CIDR overlap, policy visibility, role permissions, and the
fresh-app FQDN bootstrap. `deploy.ps1` returns outputs; scripts use
`$PSScriptRoot` and Azure discovery, not workstation-specific paths.

## Local API

```powershell
Set-Location app
$env:APP_ENV = 'local'
$env:APP_AUTH_MODE = 'local'
$env:APP_STATE_MODE = 'file'
npm run dev
```

Local requests may use `x-demo-role` and `x-demo-actor-id`. Azure startup rejects
local authentication and non-Blob state.

## Foundry agents

After foundation deployment, use its outputs:

```powershell
Set-Location app
$env:FOUNDRY_PROJECT_ENDPOINT = '<foundation foundryProjectEndpoint output>'
$env:FOUNDRY_MODEL_DEPLOYMENT = '<foundation modelDeploymentName output>'
npm run provision:agents
```

The operator requires Foundry User at project scope. Runtime RBAC is created by
IaC: `AcrPull`, `Storage Blob Data Contributor`, `Cognitive Services OpenAI
User`, `Foundry Agent Consumer`, and project-scoped `Foundry User`.

## Access modes

### Public demo

The immutable synthetic actor is:

`anonymous-public-demo` / `Anonymous Public Demo Actor (synthetic)`,
role `planner`, kind `public-demo`, `authenticated=false`.

Cookies, Easy Auth headers, demo role headers, and caller identity headers do
not change that actor. POST/PATCH requests require the exact configured Origin,
same-origin fetch metadata when present, and JSON. CORS is not enabled. Only the
canonical hero AI/workflow/reset operations are permitted. Unknown mutations
are denied.

Process-local limits are:

- reads: 120/client/minute, 600 global/minute;
- AI: 6/client/10 minutes, 30 global/10 minutes;
- workflow: 30/client/10 minutes, 150 global/10 minutes;
- reset: 3/client/10 minutes, 20 global/10 minutes;
- AI concurrency: two.

One trusted ingress proxy is configured, preventing attacker-prepended
`X-Forwarded-For` values from selecting a new client bucket.

### Entra

Deploy the application with `-AccessMode entra`, then run:

```powershell
.\infra\configure-auth.ps1 `
  -SubscriptionId '<subscription-id>' `
  -ResourceGroupName '<resource-group>' `
  -ContainerAppName '<container-app>' `
  -ApplicationDisplayName '<tenant-unique-display-name>'
```

The script discovers the FQDN, preserves callbacks, and configures Planner and
Viewer roles. Optionally supply a planner object ID. Treat creation of the
short-lived client secret as a privileged operation; it is sent directly to
Container Apps and must never be logged or persisted.

## Read-only deployed validation

The following check does not create, transition, reset, or otherwise write
workflow state. It validates health, exact Dublin calculations, donor
protection, spoofing protection, origin denial, both grounded AI responses,
the promotion caveat, current audit/action state, Blob configuration reporting,
and that state is unchanged before/after:

```powershell
Set-Location app
$env:DEPLOYED_BASE_URL = 'https://<discovered-container-app-fqdn>'
npm run smoke:deployed:read-only
```

AI routes are POST endpoints but are operationally read-only: they read
deterministic evidence and call Foundry without changing Blob state.

For Azure control-plane evidence, verify:

```powershell
az containerapp show --subscription '<subscription-id>' `
  --resource-group '<resource-group>' --name '<container-app>' `
  --query "{fqdn:properties.configuration.ingress.fqdn,revision:properties.latestRevisionName,provisioning:properties.provisioningState}"

az storage account show --subscription '<subscription-id>' `
  --resource-group '<resource-group>' --name '<storage-account>' `
  --query "{publicNetworkAccess:publicNetworkAccess,allowSharedKeyAccess:allowSharedKeyAccess,allowBlobPublicAccess:allowBlobPublicAccess,defaultAction:networkRuleSet.defaultAction}"
```

## Mutating validation and reset

Use mutating deployed validation only in an exclusive validation window. The
existing helper performs canonical propose → approve → dispatch → receive and
must reset afterward:

```powershell
Set-Location app
$env:DEPLOYED_BASE_URL = 'https://<discovered-container-app-fqdn>'
npm run smoke:deployed
```

If manual recovery is needed, first GET `/api/v1/actions` and capture its ETag.
Then POST `/api/v1/demo/reset` with:

- `Origin: <exact deployed origin>` in public-demo mode;
- `Sec-Fetch-Site: same-origin`;
- `Content-Type: application/json`;
- `If-Match: <current ETag>`;
- a new bounded `Idempotency-Key`;
- body `{"reason":"Restore deterministic demo state."}`.

Confirm a subsequent GET returns zero actions and zero audit entries. Never
reset shared live state without explicit coordination.

## Clean export/package validation

Source control and container contexts exclude local agent state, editor state,
environment files, credentials, dependencies, builds, reports, test output,
caches, logs, and local application state. Safe `.env.example`, `.env.sample`,
and `.env.template` files remain allowed.

Create a new dedicated path outside the repository, preferably under the
current Copilot session `files` directory:

```powershell
.\app\scripts\validate-clean-package.ps1 `
  -ExportRoot '<session-files-path>\phase3-clean-package'
```

The script refuses an existing path, creates only that exact root, produces a
clean `package` child, verifies required and forbidden files, copies it to a
separate `validation-work` child, then runs npm install, typecheck, unit and
integration tests, production build, both Bicep builds, and PowerShell parsing.
The clean `package` child remains free of `node_modules`, `dist`, secrets, and
local Squad/Copilot state.

## Current deployment compatibility

The existing public demo remains at its current discovered Norway East URL and
uses its existing resource names, CIDRs, model, capacity, and explicit origin.
The new templates preserve those defaults in `deploy.ps1`; changing them is an
operator choice, not an implicit requirement. No current Azure resource should
be changed during preparatory portability validation.
