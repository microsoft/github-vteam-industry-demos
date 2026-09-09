import { normalizeGenerationRun, type
  AuditEvent,
  ContentLibraryEntry,
  DashboardSummary,
  DocumentMetadata,
  GenerationRun,
  Opportunity,
  OpportunityInput,
  Proposal,
  ProposalSectionKey,
  RetrievalPreview,
  ReusableContentInput
} from "@proposal-factory/contracts";

export const accessDeniedEvent = "proposal-factory:access-denied";

export class ReviewConflictError extends Error {}
export class UploadConnectionError extends Error {}

function reportAccessFailure(status: number, error?: string, canonicalSession = false) {
  if (status === 401 ||
      (status === 403 && (canonicalSession || error === "WORKSPACE_ACCESS_DENIED"))) {
    window.dispatchEvent(new CustomEvent(accessDeniedEvent, { detail: status }));
  }
}

async function request<T>(path: string, options?: RequestInit, canonicalSession = false): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    redirect: "manual",
    headers: {
      "x-requested-with": "XMLHttpRequest",
      ...(options?.body ? { "content-type": "application/json" } : {}),
      ...options?.headers
    }
  });
  if (response.type === "opaqueredirect") {
    reportAccessFailure(401, "AUTHENTICATION_REQUIRED");
    throw new Error("Your session is missing or expired.");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { message?: string; error?: string } | undefined;
    reportAccessFailure(response.status, body?.error, canonicalSession);
    if ((response.status === 409 || response.status === 412) && body?.error === "STALE_REVIEW") {
      throw new ReviewConflictError(body.message ?? "The reviewed content changed. Refresh and review again.");
    }
    throw new Error(body?.message ?? `Request failed with ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  session: () => request<{
    mode: "development" | "entra";
    id: string;
    tenantId: string;
    displayName: string;
    roles: string[];
  }>("/api/session", undefined, true),
  dashboard: () => request<DashboardSummary>("/api/dashboard"),
  opportunities: () => request<Opportunity[]>("/api/opportunities"),
  opportunity: (id: string) => request<Opportunity>(`/api/opportunities/${id}`),
  createOpportunity: (input: OpportunityInput) =>
    request<Opportunity>("/api/opportunities", { method: "POST", body: JSON.stringify(input) }),
  documents: (opportunityId: string) =>
    request<DocumentMetadata[]>(`/api/documents?opportunityId=${encodeURIComponent(opportunityId)}`),
  document: (opportunityId: string, documentId: string) =>
    request<DocumentMetadata>(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/documents/${encodeURIComponent(documentId)}`
    ),
  uploadDocument: (
    opportunityId: string,
    file: File,
    kind: DocumentMetadata["kind"],
    onProgress?: (percent: number) => void
  ) =>
    new Promise<DocumentMetadata>((resolve, reject) => {
      const body = new FormData();
      body.append("kind", kind);
      body.append("file", file, file.name);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/opportunities/${opportunityId}/documents`);
      xhr.withCredentials = true;
      xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
      xhr.responseType = "json";
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          resolve(xhr.response as DocumentMetadata);
          return;
        }
        const response = xhr.response as { message?: string; error?: string } | null;
        reportAccessFailure(xhr.status, response?.error);
        reject(new Error(response?.message ?? `Upload failed with ${xhr.status}.`));
      });
      xhr.addEventListener("error", () =>
        reject(new UploadConnectionError("Upload failed because the network connection was interrupted."))
      );
      xhr.addEventListener("abort", () => reject(new Error("Upload was cancelled.")));
      xhr.send(body);
    }),
  selectDocuments: (opportunityId: string, documentIds: string[]) =>
    request<Opportunity>(`/api/opportunities/${opportunityId}/documents/selection`, {
      method: "PUT",
      body: JSON.stringify({ documentIds })
    }),
  retrievalPreview: (opportunityId: string) =>
    request<RetrievalPreview>(`/api/opportunities/${opportunityId}/retrieval-preview`).then((result) => result.citations),
  retrievalPreviewEvidence: (opportunityId: string) =>
    request<RetrievalPreview>(`/api/opportunities/${opportunityId}/retrieval-preview`),
  content: (parameters: URLSearchParams) => request<ContentLibraryEntry[]>(`/api/content?${parameters.toString()}`),
  contentItem: (id: string) => request<ContentLibraryEntry>(`/api/content/${encodeURIComponent(id)}`),
  createContent: (input: ReusableContentInput) =>
    request<ContentLibraryEntry>("/api/content", { method: "POST", body: JSON.stringify(input) }),
  startGeneration: (opportunityId: string) =>
    request<GenerationRun>(`/api/opportunities/${opportunityId}/proposals/generate`, { method: "POST" }),
  generationRun: (runId: string) =>
    request<GenerationRun>(`/api/generation-runs/${runId}`).then(normalizeGenerationRun),
  proposalForOpportunity: (opportunityId: string) =>
    request<Proposal>(`/api/opportunities/${opportunityId}/proposal`),
  editSection: (proposalId: string, key: ProposalSectionKey, content: string) =>
    request<Proposal>(`/api/proposals/${proposalId}/sections/${key}`, {
      method: "PATCH",
      body: JSON.stringify({ content })
    }),
  regenerateSection: (proposalId: string, key: ProposalSectionKey) =>
    request<Proposal>(`/api/proposals/${proposalId}/sections/${key}/regenerate`, { method: "POST" }),
  approveSection: (proposalId: string, key: ProposalSectionKey, expectedRevisionId: string) =>
    request<Proposal>(`/api/proposals/${proposalId}/sections/${key}/approve`, {
      method: "POST", body: JSON.stringify({ expectedRevisionId })
    }),
  approveProposal: (proposalId: string, expectedReviewVersion: string) =>
    request<Proposal>(`/api/proposals/${proposalId}/approve`, {
      method: "POST", body: JSON.stringify({ expectedReviewVersion })
    }),
  audit: (opportunityId?: string) =>
    request<AuditEvent[]>(`/api/audit${opportunityId ? `?opportunityId=${encodeURIComponent(opportunityId)}` : ""}`)
};

export async function downloadExport(proposalId: string, format: "markdown" | "pdf") {
  const response = await fetch(`/api/proposals/${proposalId}/export?format=${format}`, {
    credentials: "same-origin", redirect: "manual",
    headers: { "x-requested-with": "XMLHttpRequest" }
  });
  if (response.type === "opaqueredirect") {
    reportAccessFailure(401, "AUTHENTICATION_REQUIRED");
    throw new Error("Your session is missing or expired.");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { message?: string; error?: string } | undefined;
    reportAccessFailure(response.status, body?.error);
    throw new Error(body?.message ?? "Export failed.");
  }
  const disposition = response.headers.get("content-disposition");
  const fileName = disposition?.match(/filename="([^"]+)"/)?.[1] ?? `proposal.${format === "pdf" ? "pdf" : "md"}`;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
