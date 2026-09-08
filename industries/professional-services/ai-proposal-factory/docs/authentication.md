# Authentication and demo workspace authorization

## Two explicit modes, never a fallback

| Mode | Required configuration | Identity |
|---|---|---|
| Local development/tests | `AUTH_MODE=development`, `NODE_ENV=development` or `test`, `HOST=127.0.0.1`, exact loopback HTTP `AUTH_DEVELOPMENT_ORIGINS` with explicit ports | Deterministic **Local Development Member**, object ID `11111111-1111-4111-8111-111111111111`, synthetic tenant `22222222-2222-4222-8222-222222222222`. |
| Azure production | `AUTH_MODE=entra`, `AUTH_TRUSTED_PROXY=container-apps`, `AUTH_TENANT_ID`, `AUTH_CLIENT_ID`, exact HTTPS `AUTH_PUBLIC_ORIGIN`, `HOST=127.0.0.1` | Verified Microsoft Entra user supplied by Container Apps built-in authentication. |

Missing/unknown modes fail startup before store initialization. Development auth is rejected with production/unspecified `NODE_ENV`, inside Container Apps, or without one to four exact `http://127.0.0.1:<port>` / `http://localhost:<port>` application origins. The development-origin setting is rejected in Entra production mode. The API refuses non-loopback binding in either mode. No environment file is silently loaded and no production authentication failure becomes a development identity.

Data and AI providers remain independent: local tests use `DATA_PROVIDER=local`, `AI_PROVIDER=fixture`; Azure Bicep continues to require both providers `azure`. Authentication does not switch providers or weaken Sweden Central/model settings.

## Azure flow and trust boundary

1. HTTPS ingress on the **web Container App** passes through Container Apps Easy Auth. Bicep enables the platform/provider, requires authentication using `RedirectToLoginPage`, sets no excluded paths, and pins the issuer to the deployment tenant and audience to the dedicated application registration.
2. Easy Auth performs Entra sign-in at `/.auth/login/aad`. Entra posts the ID token to the exact registered `/.auth/login/aad/callback`; the platform validates it and manages the session cookie. The SPA never implements password login, parses tokens, or stores tokens in browser storage.
3. Only the authenticated ingress supplies `X-MS-CLIENT-PRINCIPAL`, `X-MS-CLIENT-PRINCIPAL-ID`, and `X-MS-CLIENT-PRINCIPAL-IDP`. Microsoft documents that external requests cannot set these identity headers. They are **trusted platform assertions, not independently signed HTTP headers**.
4. Nginx on port 8080 preserves these three headers to Fastify on **127.0.0.1:3001** in the same replica network namespace. It strips unused identity-name/token/Authorization headers. There is no external API Container App, additional ingress port, or public API listener. API probes go through Nginx `/health` on 8080; public `/health` remains covered by Easy Auth.
5. A global Fastify `onRequest` gate runs before body parsing, route handlers, repositories, document extraction, or AI. It validates strict bounded Base64/JSON claims, `aad` provider, tenant/object IDs, audience, issuer, principal-ID agreement, user-only identity, and the required role. It rejects conflicting/invalid claims and non-loopback proxy connections.
6. Each request gets a typed immutable principal/context. Async-local isolation derives audit actor, immutable object ID, tenant ID, and actor type without a process-global mutable user. New generation runs persist their initiating actor; asynchronous worker publication and local polling preserve that initiator rather than attributing the work to a later polling user. Old running jobs without an initiator must be resubmitted.

The application assumes its container/replica, trusted Nginx, Easy Auth configuration, and deployment administrators are trusted. **Never expose Nginx via an alternate public path that bypasses Easy Auth, and never deploy these proxy-header semantics behind an arbitrary reverse proxy.** Disabling Easy Auth leaves the API denying requests without verified headers, not anonymously accessible. Local header-emulation tests are not proof of deployed platform header sanitization.

## Membership policy

This is **one synthetic workspace in one Entra tenant**, not a multitenant application or a per-opportunity ACL implementation. Every intended human user must have the application's enabled user-only app role:

```text
ProposalFactory.WorkspaceMember
Role definition ID: 7733d477-960b-4e57-a6c0-1ec26e9c5637
```

The enterprise application requires assignment. Wrong-tenant, role-less/unassigned, and application-only principals receive 403. Merely belonging to the tenant or possessing an Azure resource managed identity is insufficient.

For portable deployments, assign the role to either:

- individual user object IDs; or
- a **security-enabled Entra group** whose direct members are workspace users.

Group assignment is the preferred ongoing-access model where the tenant has the required Entra licensing. A directory/application administrator performs the one-time application registration and group-to-app-role assignment. After that, authorized group owners can add and remove ordinary users without giving those users Azure subscription roles or Entra administrator roles. Use direct group membership; nested groups are not a supported access assumption.

`Workspace Member` is an **application role**, not an Azure RBAC role and not an Entra directory administrator role. It grants access only to this application's single synthetic workspace. It grants no permission to create Azure resources, change the app registration, administer the tenant, or manage other users.

All assigned workspace members can read and mutate **all demo opportunities**, associated documents/extracted content, proposals/sections/approvals, generation runs/progress, exports, reusable content, and audit. Dashboard/global list endpoints are authorized *before* listing any data. Document selection additionally requires that IDs belong to the selected opportunity or the shared demo document library. An unknown ID or another opportunity's document cannot be injected into generation input.

There are deliberately no separate sales/reviewer/admin roles in this demo. Add a real workspace/resource partition and corresponding authorization checks before importing private customer data or onboarding another tenant. Permission revocation is bounded by already-issued platform/token session validity; use tenant session revocation controls for urgent removals.

## Same-origin and browser behavior

CORS is disabled: no reflected origins or wildcard origins are used. Production requests with `Origin` must match the configured exact public HTTPS origin. In development, the API listener and request Host remain loopback-only, while browser `Origin` must match the explicit loopback Vite application-origin list. This permits the same-application Vite proxy even though its browser origin port differs from the API upstream port, without trusting `Forwarded` or `X-Forwarded-*` headers. Cross-site Fetch Metadata and foreign origins are denied.

All production API requests (and cookie-bearing development requests) require `X-Requested-With: XMLHttpRequest`, including GET progress/export routes that may mutate state/audit. The client sets this on JSON requests, uploads, and downloads. This protects even when an upstream component consumes the cookie instead of forwarding it. Cross-origin form/image/fetch requests fail closed; no permissive preflight exposes the custom header. Successful responses and access errors are `Cache-Control: no-store`.

The canonical `/api/session` response controls the global workspace gate. Its 401/403 responses, opaque authentication redirects, and explicit authentication-boundary error codes replace the UI workspace with a clear sign-in or access-denied message. Resource-level 403 responses such as document/opportunity access denials remain local page or action errors; they must not hide the entire workspace or imply that the user's Entra assignment is invalid. In Entra mode, the only sign-in link targets the platform `/.auth/login/aad`. The UI does not create a second authentication mechanism.

## Diagnosing the access-denied screen

The API returns `WORKSPACE_ACCESS_DENIED` only after a principal has reached the authorization boundary. The exact production causes are:

1. the token tenant differs from `AUTH_TENANT_ID`;
2. the principal is application-only rather than a human user;
3. the ID token lacks `ProposalFactory.WorkspaceMember`; or
4. the Easy Auth role claim shape is not the configured user-role shape.

An invalid/missing platform principal, issuer, audience, object ID, or proxy path returns 401 instead. In local development, no Entra assignment is consulted: `AUTH_MODE=development`, `NODE_ENV=development`, and loopback `HOST=127.0.0.1` produce the deterministic Local Development Member. The mode is read at process startup, so changing shell configuration or code requires restarting the API process.

The web application verifies `/api/session` before rendering private routes and offers **Recheck access** after a canonical denial. This prevents a previous session 403 from remaining latched after the local API has been restarted with valid development configuration or after a production role assignment has propagated and the user has refreshed their Entra session. A successful session records its mode: development-mode resource and document errors remain local and never offer or follow an Entra sign-in redirect. Meeting notes and documents are opened through same-origin application endpoints under the deterministic development principal.

## Secretless registration/bootstrap contract

The Container Apps Entra documentation explicitly supports a no-client-secret **ID-token-only implicit sign-in**. This prototype deliberately uses that built-in platform-managed flow: `response_type=id_token`, `response_mode=form_post`, nonce validation, exact HTTPS callback, token store disabled, and no downstream delegated APIs or access-token implicit grants.

**Trade-off:** Microsoft recommends avoiding implicit grants where more secure alternatives are viable. This constrained secretless demo does not claim authorization-code/PKCE or workload-federated Easy Auth support. It uses no browser-JavaScript token handling or refresh/access tokens. If organizational policy requires code/hybrid flow or delegated API tokens, revise the design to use a Key Vault-held client credential referenced through managed identity; do not add a plaintext secret setting or silently switch flows. No Key Vault or credential is needed for the current ID-token-only contract.

`scripts\azure\bootstrap-auth.ps1` is an explicit one-time tenant administrator operation. It requires directory permissions to create/update the dedicated application and service principal and assign users or security groups (for example, an appropriately authorized Application Administrator with the applicable Microsoft Graph permissions). Do not grant these directory-write permissions to the API/worker, ordinary users, group owners, or the deployment pipeline.

When provisioning is separately approved:

```powershell
# Directory bootstrap before workload provisioning; no Azure resource is created by this script.
.\scripts\azure\bootstrap-auth.ps1 `
  -TenantId '<deployment-tenant-uuid>' `
  -MemberGroupObjectIds '<workspace-security-group-object-id>'

# Use the returned dedicated end-user client ID, NOT AZURE_CLIENT_ID (resource/CI identity).
$env:AIPF_ENTRA_CLIENT_ID = '<returned-app-registration-client-id>'
.\scripts\azure\validate-auth-registration.ps1 -ClientId $env:AIPF_ENTRA_CLIENT_ID
```

The bootstrap creates/reconciles a marked dedicated `AzureADMyOrg` registration, v2 token configuration, user-only workspace role, no delegated API permissions/public-client fallback, and a service principal requiring assignment. Repeated runs reuse its unique marker/name or the supplied `-ClientId`. It refuses to change another registration and preserves existing assignments. Membership removals are explicit administrator operations, not implicit reconciliation.

Initial registration has no callback, so sign-in remains unavailable while infrastructure/images are prepared. After the workload's actual FQDN is known:

```powershell
.\scripts\azure\bootstrap-auth.ps1 `
  -TenantId '<deployment-tenant-uuid>' `
  -ClientId $env:AIPF_ENTRA_CLIENT_ID `
  -AppOrigin 'https://<actual-web-container-app-fqdn>' `
  -MemberGroupObjectIds '<workspace-security-group-object-id>'
.\scripts\azure\validate-auth-registration.ps1 -ClientId $env:AIPF_ENTRA_CLIENT_ID -RequireRedirectUri
```

For a tenant that cannot use group-based application assignment, pass `-MemberObjectIds '<user-object-id>'` instead. Both parameters are additive and idempotent; the script preserves existing assignments. Revocation remains explicit. Group owners manage group membership after bootstrap, while only an authorized application/directory administrator can change the app-role assignment itself.

`deploy.ps1` and `what-if.ps1` validate the registration read-only before deploying workloads, then pass `entraClientId` into Bicep. `tenant().tenantId` supplies the tenant; the production origin is derived from the managed environment's actual domain. The all-zero ID in the committed parameter file is **compile-only**, rejected by workload deployment scripts and application startup. Bootstrap-without-workloads can compile/use that placeholder, but cannot publish an anonymous API.

The GitHub `development` environment needs the separate non-secret variable `AIPF_ENTRA_CLIENT_ID`, in addition to its existing OIDC deployment identity variables. Runtime identities never receive user-role assignments.

## Validation and limits

```powershell
npm run check
az bicep build --file .\infra\main.bicep --stdout 1>$null
az bicep lint --file .\infra\main.bicep
az bicep build-params --file .\infra\parameters\dev.swedencentral.bicepparam --stdout 1>$null
node .\scripts\auth-smoke.mjs
pwsh -NoProfile -File .\scripts\azure\test-auth-contract.ps1
```

The built-server smoke uses actual HTTP, loopback binding, explicit production-mode configuration, synthetic trusted-header fixtures, local data, and fixture AI. It checks denial paths, uploads, generation, edits/regeneration, approvals, both exports, persisted actor attribution, explicit local mode, and misconfigured startup. It never calls Entra or Azure services.

September 7, 2026 revision evidence: full `npm run check` passed with 156 tests; Bicep build/lint/parameter compilation passed without diagnostics; the built authentication smoke and offline registration/bootstrap tests passed. A real headless Edge run also completed the local upload/generation/review/approval/export/audit flow (33 observed API responses, no uncaught browser exceptions) under explicit development authentication, using a loopback test proxy rather than Nginx. Evidence is under `.squad\agents\identity\audit\2026-09-07`.

Deployed validation must still demonstrate real Entra login/logout, tenant/role denial, expired sessions, forged external header removal, no direct port-3001 access, API/UI upload/export behavior through **actual Nginx**, and authentic audit after worker execution. The resource validator checks anonymous dashboard denial; an ephemeral assigned-user `AIPF_VALIDATION_SESSION_COOKIE` enables its authenticated dashboard smoke. Never log, persist, commit, or put this session credential in shell history. Without it, the validator explicitly reports authenticated validation as pending; its control-plane result is not completion of the demo Definition of Done.

## Primary references checked September 8, 2026

- `https://learn.microsoft.com/en-us/azure/container-apps/authentication`
- `https://learn.microsoft.com/en-us/azure/container-apps/authentication-entra`
- `https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-user-identities`
- `https://learn.microsoft.com/en-us/azure/templates/microsoft.app/2025-01-01/containerapps/authconfigs`
- `https://learn.microsoft.com/en-us/graph/api/resources/implicitgrantsettings?view=graph-rest-1.0`
- `https://learn.microsoft.com/en-us/graph/api/group-post-approleassignments?view=graph-rest-1.0`
- `https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/assign-user-or-group-access-portal`
- `https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/error-code-aadsts50105-user-not-assigned-role`

These document platform contracts, not observed deployed validation.
