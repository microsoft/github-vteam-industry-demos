import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingHttpHeaders } from "node:http";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuditActor } from "@proposal-factory/contracts";

export const workspaceRole = "ProposalFactory.WorkspaceMember";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const zeroUuid = "00000000-0000-0000-0000-000000000000";
const tenantClaim = "http://schemas.microsoft.com/identity/claims/tenantid";
const objectClaim = "http://schemas.microsoft.com/identity/claims/objectidentifier";
const roleClaim = "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";

export interface AuthenticatedPrincipal {
  readonly id: string;
  readonly tenantId: string;
  readonly displayName: string;
  readonly roles: readonly string[];
  readonly mode: "development" | "entra";
}

export interface AuthenticatedRequestContext {
  readonly principal: AuthenticatedPrincipal;
  readonly requestId: string;
}

export type AuthConfiguration =
  | { mode: "development"; applicationOrigins: readonly string[] }
  | { mode: "entra"; tenantId: string; clientId: string; publicOrigin: string };

declare module "fastify" {
  interface FastifyRequest {
    authContext: AuthenticatedRequestContext | null;
  }
}

export class AccessError extends Error {
  constructor(readonly statusCode: 401 | 403, readonly code: string, message: string) {
    super(message);
  }
}

export function loadAuthConfiguration(environment: NodeJS.ProcessEnv = process.env): AuthConfiguration {
  const mode = environment.AUTH_MODE;
  const host = environment.HOST ?? "127.0.0.1";
  if (host !== "127.0.0.1") throw new Error("The API must bind exclusively to HOST=127.0.0.1.");
  if (mode === "development") {
    if (!["development", "test"].includes(environment.NODE_ENV ?? "") || environment.CONTAINER_APP_NAME) {
      throw new Error("AUTH_MODE=development requires NODE_ENV=development or test and is forbidden in Container Apps.");
    }
    const applicationOrigins = [...new Set((environment.AUTH_DEVELOPMENT_ORIGINS ?? "")
      .split(",").map((value) => value.trim()).filter(Boolean))];
    const validOrigin = (value: string) => {
      try {
        const url = new URL(value);
        return url.protocol === "http:" && url.origin === value && !!url.port &&
          (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
          !url.username && !url.password;
      } catch { return false; }
    };
    if (applicationOrigins.length === 0 || applicationOrigins.length > 4 ||
        !applicationOrigins.every(validOrigin)) {
      throw new Error(
        "Development mode requires one to four exact loopback HTTP AUTH_DEVELOPMENT_ORIGINS with explicit ports."
      );
    }
    return { mode, applicationOrigins: Object.freeze(applicationOrigins) };
  }
  if (mode !== "entra") throw new Error("Explicit AUTH_MODE=entra or development is required; there is no fallback.");
  if (environment.AUTH_DEVELOPMENT_ORIGINS) {
    throw new Error("AUTH_DEVELOPMENT_ORIGINS is forbidden in Entra production mode.");
  }
  if (environment.AUTH_TRUSTED_PROXY !== "container-apps") {
    throw new Error("Entra mode requires AUTH_TRUSTED_PROXY=container-apps and the built-in authentication ingress.");
  }
  const tenantId = environment.AUTH_TENANT_ID ?? "";
  const clientId = environment.AUTH_CLIENT_ID ?? "";
  if (![tenantId, clientId].every((value) => uuid.test(value) && value !== zeroUuid)) {
    throw new Error("Entra mode requires non-placeholder AUTH_TENANT_ID and AUTH_CLIENT_ID UUIDs.");
  }
  const publicOrigin = environment.AUTH_PUBLIC_ORIGIN ?? "";
  let validOrigin = false;
  try {
    const url = new URL(publicOrigin);
    validOrigin = url.protocol === "https:" && url.origin === publicOrigin &&
      !url.username && !url.password && !url.hostname.includes("*");
  } catch { /* Configuration errors are reported without echoing environment values. */ }
  if (!validOrigin) throw new Error("Entra mode requires an exact HTTPS AUTH_PUBLIC_ORIGIN (no path or wildcard).");
  return { mode, tenantId: tenantId.toLowerCase(), clientId: clientId.toLowerCase(), publicOrigin };
}

export const developmentPrincipal: AuthenticatedPrincipal = Object.freeze({
  mode: "development", id: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  displayName: "Local Development Member", roles: Object.freeze([workspaceRole])
});

const contexts = new AsyncLocalStorage<AuthenticatedRequestContext>();

export function currentRequestContext(): AuthenticatedRequestContext {
  const context = contexts.getStore();
  if (!context) throw new AccessError(401, "AUTHENTICATION_REQUIRED", "Sign in with Microsoft Entra ID.");
  return context;
}

export function currentAuditActor(): AuditActor {
  const { principal } = currentRequestContext();
  return {
    actor: principal.displayName, actorId: principal.id, actorTenantId: principal.tenantId,
    actorType: principal.mode === "entra" ? "User" : "Development"
  };
}

function header(headers: IncomingHttpHeaders, key: string): string {
  const value = headers[key];
  if (typeof value !== "string" || !value || value.includes(",")) {
    throw new AccessError(401, "INVALID_PRINCIPAL", "A verified Microsoft Entra principal is required.");
  }
  return value;
}

export function authenticate(headers: IncomingHttpHeaders, config: AuthConfiguration): AuthenticatedPrincipal {
  if (config.mode === "development") {
    // Never interpret caller-supplied identity as a development identity.
    if (Object.keys(headers).some((key) => key.startsWith("x-ms-"))) {
      throw new AccessError(401, "INVALID_PRINCIPAL", "Identity headers are not accepted in development mode.");
    }
    return developmentPrincipal;
  }
  const invalid = () => new AccessError(401, "INVALID_PRINCIPAL", "A verified Microsoft Entra principal is required.");
  const encoded = header(headers, "x-ms-client-principal");
  if (encoded.length > 24_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw invalid();
  }
  let value: unknown;
  try { value = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")); } catch { throw invalid(); }
  if (!value || typeof value !== "object") throw invalid();
  const envelope = value as Record<string, unknown>;
  if (envelope.auth_typ !== "aad" || header(headers, "x-ms-client-principal-idp") !== "aad" ||
      !Array.isArray(envelope.claims) || envelope.claims.length > 200 ||
      !envelope.claims.every((claim: unknown) => !!claim && typeof claim === "object" &&
        typeof (claim as Record<string, unknown>).typ === "string" &&
        typeof (claim as Record<string, unknown>).val === "string")) throw invalid();
  const claims = envelope.claims as { typ: string; val: string }[];
  const single = (...types: string[]) => {
    const values = [...new Set(claims.filter((claim) => types.includes(claim.typ)).map((claim) => claim.val))];
    if (values.length !== 1 || !values[0]) throw invalid();
    return values[0];
  };
  const tenantId = single("tid", tenantClaim).toLowerCase();
  const id = single("oid", objectClaim).toLowerCase();
  const subjectValues = [...new Set(claims.filter((claim) =>
    claim.typ === "sub" || claim.typ === "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"
  ).map((claim) => claim.val))];
  const assertedId = header(headers, "x-ms-client-principal-id");
  if (!uuid.test(tenantId) || !uuid.test(id) || id === zeroUuid ||
      subjectValues.length > 1 || (assertedId.toLowerCase() !== id && assertedId !== subjectValues[0]) ||
      single("aud").toLowerCase() !== config.clientId) throw invalid();
  if (tenantId !== config.tenantId) {
    throw new AccessError(403, "WORKSPACE_ACCESS_DENIED", "This account is not a member of the demo workspace.");
  }
  if (single("iss") !== `https://login.microsoftonline.com/${config.tenantId}/v2.0`) throw invalid();
  if (claims.some((claim) => claim.typ === "idtyp" && claim.val === "app") ||
      (envelope.role_typ !== "roles" && envelope.role_typ !== roleClaim)) {
    throw new AccessError(403, "WORKSPACE_ACCESS_DENIED", "A workspace user assignment is required.");
  }
  const roles = claims.filter((claim) => claim.typ === envelope.role_typ).map((claim) => claim.val);
  if (!roles.includes(workspaceRole)) {
    throw new AccessError(403, "WORKSPACE_ACCESS_DENIED", "Ask an administrator to assign the Workspace Member role.");
  }
  const displayName = claims.find((claim) => claim.typ === "name")?.val ?? id;
  if (displayName.length > 256 || [...displayName].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw invalid();
  return Object.freeze({ mode: "entra", tenantId, id, displayName, roles: Object.freeze(roles) });
}

function validateBrowserBoundary(request: FastifyRequest, config: AuthConfiguration) {
  let permittedOrigin: (origin: string) => boolean;
  if (config.mode === "entra") {
    permittedOrigin = (origin) => origin === config.publicOrigin;
    if (request.ip !== "127.0.0.1" && request.ip !== "::ffff:127.0.0.1") {
      throw new AccessError(401, "UNTRUSTED_PROXY", "Requests must pass through the authenticated application ingress.");
    }
  } else {
    const host = request.headers.host ?? "";
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.ip) ||
        !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
      throw new AccessError(403, "ORIGIN_DENIED", "Development access is loopback-only.");
    }
    permittedOrigin = (origin) => config.applicationOrigins.includes(origin);
  }
  if ((request.headers.origin && !permittedOrigin(request.headers.origin)) ||
      request.headers["sec-fetch-site"] === "cross-site" ||
      ((config.mode === "entra" || request.headers.cookie) && request.headers["x-requested-with"] !== "XMLHttpRequest")) {
    throw new AccessError(403, "ORIGIN_DENIED", "Use the same-origin application to access this workspace.");
  }
}

export function installAuthentication(app: FastifyInstance, config: AuthConfiguration) {
  app.decorateRequest("authContext", null);
  // This global onRequest gate executes before body parsing and any repository/AI access, including unknown routes.
  app.addHook("onRequest", (request, reply, done) => {
    reply.header("cache-control", "no-store");
    if (request.method === "GET" && request.url.split("?")[0] === "/health") return done();
    try {
      const principal = authenticate(request.headers, config);
      validateBrowserBoundary(request, config);
      const context = Object.freeze({ principal, requestId: request.id });
      request.authContext = context;
      contexts.run(context, done);
    } catch (error) { done(error as Error); }
  });
}
