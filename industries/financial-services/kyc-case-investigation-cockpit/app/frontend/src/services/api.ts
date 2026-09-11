import type {
  AuditListItem,
  CaseListItem,
  DocumentListItem,
  InvestigationJob,
  InvestigationListItem,
  KycCase,
} from "../types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? "The request could not be completed.");
  }
  return response.json() as Promise<T>;
}

export function getCases(filters: {
  search?: string;
  status?: string;
  risk?: string;
}): Promise<CaseListItem[]> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const suffix = params.size ? `?${params.toString()}` : "";
  return request<CaseListItem[]>(`/api/cases${suffix}`);
}

export function getCase(caseId: string): Promise<KycCase> {
  return request<KycCase>(`/api/cases/${caseId}`);
}

export function getInvestigationList(): Promise<InvestigationListItem[]> {
  return request<InvestigationListItem[]>("/api/investigations");
}

export function getDocumentList(): Promise<DocumentListItem[]> {
  return request<DocumentListItem[]>("/api/documents");
}

export function getAuditList(filters?: {
  caseId?: string;
  eventType?: string;
}): Promise<AuditListItem[]> {
  const params = new URLSearchParams();
  if (filters?.caseId) params.set("case_id", filters.caseId);
  if (filters?.eventType) params.set("event_type", filters.eventType);
  const suffix = params.size ? `?${params.toString()}` : "";
  return request<AuditListItem[]>(`/api/audit${suffix}`);
}

export function startInvestigation(caseId: string): Promise<InvestigationJob> {
  return request<InvestigationJob>(`/api/cases/${caseId}/investigations`, {
    method: "POST",
  });
}

export function getInvestigation(
  caseId: string,
  jobId: string,
): Promise<InvestigationJob> {
  return request<InvestigationJob>(
    `/api/cases/${caseId}/investigations/${jobId}`,
  );
}

export async function getDocumentContent(
  caseId: string,
  documentId: string,
): Promise<string> {
  const response = await fetch(
    `/api/cases/${caseId}/documents/${documentId}/content`,
  );
  if (!response.ok) throw new Error("Document preview is unavailable.");
  return response.text();
}

export function submitDecision(
  caseId: string,
  action: string,
  reason: string,
): Promise<KycCase> {
  return request<KycCase>(`/api/cases/${caseId}/decision`, {
    method: "POST",
    body: JSON.stringify({ action, reason, analyst: "Alex Rivera" }),
  });
}
