import type { NextFunction, Request, Response } from "express";
import type { Actor, ActorRole } from "../shared/contracts.js";
import type { AppConfig } from "./config.js";

declare global {
  namespace Express {
    interface Request {
      actor: Actor;
    }
  }
}

const APP_ROLE_MAP: Record<string, ActorRole> = {
  "Inventory.Planner": "planner",
  "Inventory.Manager": "manager",
  "Inventory.Viewer": "manager",
  "Inventory.Operations": "operations",
  planner: "planner",
  manager: "manager",
  operations: "operations",
};

export const PUBLIC_DEMO_ACTOR: Actor = Object.freeze({
  id: "anonymous-public-demo",
  name: "Anonymous Public Demo Actor (synthetic)",
  role: "planner",
  kind: "public-demo",
  authenticated: false,
});

interface EasyAuthPrincipal {
  claims?: Array<{ typ: string; val: string }>;
}

function azureActor(request: Request): Actor | null {
  const encoded = request.header("x-ms-client-principal");
  if (!encoded) return null;
  try {
    const principal = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    ) as EasyAuthPrincipal;
    const claims = principal.claims ?? [];
    const value = (...types: string[]) =>
      claims.find((claim) => types.includes(claim.typ))?.val;
    const id = value(
      "http://schemas.microsoft.com/identity/claims/objectidentifier",
      "oid",
      "sub",
    );
    const name = value("name", "preferred_username") ?? "Authenticated user";
    const rawRoles = claims
      .filter((claim) =>
        ["roles", "role", "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"].includes(
          claim.typ,
        ),
      )
      .map((claim) => claim.val);
    const role = rawRoles.map((candidate) => APP_ROLE_MAP[candidate]).find(Boolean);
    return id && role ? { id, name, role, kind: "entra", authenticated: true } : null;
  } catch {
    return null;
  }
}

function localActor(request: Request): Actor {
  const role = APP_ROLE_MAP[request.header("x-demo-role") ?? "planner"] ?? "planner";
  return {
    id: request.header("x-demo-actor-id") ?? "local-planner",
    name: request.header("x-demo-actor-name") ?? "Local Demo Planner",
    role,
    kind: "local",
    authenticated: false,
  };
}

export function authentication(config: AppConfig) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const actor =
      config.authMode === "public-demo"
        ? PUBLIC_DEMO_ACTOR
        : config.authMode === "azure"
          ? azureActor(request)
          : localActor(request);
    if (!actor) {
      response.status(401).json({
        error: { code: "unauthenticated", message: "Trusted authenticated principal required" },
      });
      return;
    }
    request.actor = actor;
    next();
  };
}

export function requireRoles(...roles: ActorRole[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!roles.includes(request.actor.role)) {
      response.status(403).json({
        error: { code: "forbidden", message: `Role ${request.actor.role} is not permitted` },
      });
      return;
    }
    next();
  };
}
