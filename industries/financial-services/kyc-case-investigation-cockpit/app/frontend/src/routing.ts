export type PrimaryRoute = "dashboard" | "investigations" | "documents" | "audit";

export type AppRoute =
  | { page: PrimaryRoute }
  | {
      page: "case";
      caseId: string;
      tab: string;
      documentId?: string;
      returnPage: PrimaryRoute;
    };

const routePaths: Record<PrimaryRoute, string> = {
  dashboard: "/",
  investigations: "/investigations",
  documents: "/documents",
  audit: "/audit",
};

export function parseRoute(hash = window.location.hash): AppRoute {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const [path = "/", query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  const match = path.match(/^\/cases\/([^/]+)$/);
  if (match) {
    const requestedReturn = params.get("return");
    const returnPage: PrimaryRoute =
      requestedReturn === "investigations" ||
      requestedReturn === "documents" ||
      requestedReturn === "audit"
        ? requestedReturn
        : "dashboard";
    return {
      page: "case",
      caseId: decodeURIComponent(match[1]),
      tab: params.get("tab") ?? "Overview",
      documentId: params.get("document") ?? undefined,
      returnPage,
    };
  }
  if (path === "/investigations") return { page: "investigations" };
  if (path === "/documents") return { page: "documents" };
  if (path === "/audit") return { page: "audit" };
  return { page: "dashboard" };
}

export function primaryRoutePath(route: PrimaryRoute): string {
  return `#${routePaths[route]}`;
}

export function caseRoutePath(
  caseId: string,
  options: {
    tab?: string;
    documentId?: string;
    returnPage?: PrimaryRoute;
  } = {},
): string {
  const params = new URLSearchParams();
  if (options.tab) params.set("tab", options.tab);
  if (options.documentId) params.set("document", options.documentId);
  if (options.returnPage && options.returnPage !== "dashboard") {
    params.set("return", options.returnPage);
  }
  const query = params.size ? `?${params.toString()}` : "";
  return `#/cases/${encodeURIComponent(caseId)}${query}`;
}

export function activePrimaryRoute(route: AppRoute): PrimaryRoute {
  return route.page === "case" ? route.returnPage : route.page;
}
