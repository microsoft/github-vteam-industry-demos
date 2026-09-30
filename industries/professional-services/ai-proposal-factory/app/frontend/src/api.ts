import type {
  AuditEvent,
  Document,
  Generation,
  KnowledgeItem,
  Opportunity,
  Proposal,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(body.detail || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  opportunities: () => request<Opportunity[]>("/api/opportunities"),
  opportunity: (id: string) => request<Opportunity>(`/api/opportunities/${id}`),
  documents: (id: string) => request<Document[]>(`/api/opportunities/${id}/documents`),
  generate: (id: string, documentIds: string[]) =>
    request<{ generation_id: string; status: string }>(`/api/opportunities/${id}/generate`, {
      method: "POST",
      body: JSON.stringify({ document_ids: documentIds }),
    }),
  generation: (id: string) => request<Generation>(`/api/generations/${id}`),
  proposal: (id: string) => request<Proposal>(`/api/proposals/${id}`),
  knowledge: (filters: { q?: string; kind?: string; industry?: string }) => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && query.set(key, value));
    return request<{
      items: KnowledgeItem[];
      filters: { kinds: string[]; industries: string[] };
    }>(`/api/knowledge?${query}`);
  },
  saveSection: (proposalId: string, sectionId: string, content: string) =>
    request<Proposal>(`/api/proposals/${proposalId}/sections/${sectionId}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    }),
  regenerateSection: (proposalId: string, sectionId: string, instruction?: string) =>
    request<Proposal>(`/api/proposals/${proposalId}/sections/${sectionId}/regenerate`, {
      method: "POST",
      body: JSON.stringify({ instruction: instruction || null }),
    }),
  approveSection: (proposalId: string, sectionId: string) =>
    request<Proposal>(`/api/proposals/${proposalId}/sections/${sectionId}/approve`, {
      method: "POST",
    }),
  approveProposal: (proposalId: string) =>
    request<Proposal>(`/api/proposals/${proposalId}/approve`, { method: "POST" }),
  acknowledgeRisk: (
    proposalId: string,
    riskId: string,
    acknowledged: boolean,
    disposition?: string,
  ) =>
    request<Proposal>(`/api/proposals/${proposalId}/risks/${riskId}/acknowledge`, {
      method: "POST",
      body: JSON.stringify({ acknowledged, disposition: disposition || null }),
    }),
  audit: (proposalId: string) =>
    request<{ items: AuditEvent[] }>(`/api/audit?proposal_id=${proposalId}`),
  download: async (proposalId: string, format: "markdown" | "pdf") => {
    const response = await fetch(`/api/proposals/${proposalId}/export/${format}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(body.detail || `Export failed (${response.status})`);
    }
    const disposition = response.headers.get("Content-Disposition") || "";
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `proposal.${format}`;
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  },
};
