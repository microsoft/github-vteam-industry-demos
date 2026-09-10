import type {
  AuditEvent,
  Document,
  GenerationJob,
  KnowledgeItem,
  Opportunity,
  OpportunityCreate,
  Proposal,
} from "./types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(body.detail ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  opportunities: () => request<Opportunity[]>("/opportunities"),
  createOpportunity: (body: OpportunityCreate) =>
    request<Opportunity>("/opportunities", json("POST", body)),
  opportunity: (id: string) => request<Opportunity>(`/opportunities/${id}`),
  updateOpportunity: (id: string, body: Partial<Opportunity>) =>
    request<Opportunity>(`/opportunities/${id}`, json("PATCH", body)),
  documents: (id: string) => request<Document[]>(`/opportunities/${id}/documents`),
  selectDocument: (opportunityId: string, documentId: string, selected: boolean) =>
    request<Document>(
      `/opportunities/${opportunityId}/documents/${documentId}`,
      json("PATCH", { selected }),
    ),
  uploadDocument: async (opportunityId: string, file: File) => {
    const data = new FormData();
    data.append("file", file);
    return request<Document>(`/opportunities/${opportunityId}/documents`, {
      method: "POST",
      body: data,
    });
  },
  deleteDocument: (opportunityId: string, documentId: string) =>
    request<void>(`/opportunities/${opportunityId}/documents/${documentId}`, {
      method: "DELETE",
    }),
  generate: (id: string) =>
    request<GenerationJob>(`/opportunities/${id}/generate`, { method: "POST" }),
  generation: (id: string) => request<GenerationJob>(`/generation/${id}`),
  proposal: (id: string) => request<Proposal>(`/proposals/${id}`),
  saveSection: (proposalId: string, sectionId: string, content: string) =>
    request<Proposal>(
      `/proposals/${proposalId}/sections/${sectionId}`,
      json("PATCH", { content }),
    ),
  regenerateSection: (proposalId: string, sectionId: string) =>
    request<Proposal>(
      `/proposals/${proposalId}/sections/${sectionId}/regenerate`,
      { method: "POST" },
    ),
  approveSection: (proposalId: string, sectionId: string) =>
    request<Proposal>(
      `/proposals/${proposalId}/sections/${sectionId}/approve`,
      { method: "POST" },
    ),
  approveProposal: (proposalId: string) =>
    request<Proposal>(`/proposals/${proposalId}/approve`, { method: "POST" }),
  knowledge: (search = "", type = "") => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (type) params.set("type", type);
    return request<KnowledgeItem[]>(`/knowledge?${params}`);
  },
  audit: (opportunityId?: string) =>
    request<AuditEvent[]>(
      `/audit${opportunityId ? `?opportunity_id=${opportunityId}` : ""}`,
    ),
};
