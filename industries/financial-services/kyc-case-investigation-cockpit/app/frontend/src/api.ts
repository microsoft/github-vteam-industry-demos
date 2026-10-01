import type { AuditEvent, CaseDetail, CaseSummary, Investigation } from "./types";

async function payload<T>(response: Response, fallback: string): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || fallback);
  return data;
}

export async function fetchCases(filters: { status: string; risk: string; search: string }): Promise<CaseSummary[]> {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.risk) query.set("risk", filters.risk);
  if (filters.search) query.set("search", filters.search);
  const response = await fetch(`/api/cases?${query}`);
  if (!response.ok) throw new Error("Unable to load cases");
  return (await response.json()).items;
}

export async function fetchCase(caseId: string): Promise<CaseDetail> {
  const response = await fetch(`/api/cases/${caseId}`);
  return payload(response, "Unable to load case");
}

export async function processDocument(caseId: string, documentId: string) {
  const response = await fetch(`/api/cases/${caseId}/documents/${documentId}/process`, { method: "POST" });
  return payload(response, "Document processing failed");
}

export async function startInvestigation(caseId: string, retryFailed = false) {
  const response = await fetch(`/api/cases/${caseId}/investigate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ retry_failed: retryFailed }),
  });
  return payload<{ investigation_id: string; status: string; progress_url: string }>(
    response,
    "Unable to start AI investigation",
  );
}

export async function fetchInvestigation(caseId: string): Promise<Investigation | null> {
  const response = await fetch(`/api/cases/${caseId}/investigation`);
  if (response.status === 404) return null;
  return payload(response, "Unable to load investigation");
}

export async function fetchAudit(caseId: string): Promise<AuditEvent[]> {
  const response = await fetch(`/api/cases/${caseId}/audit`);
  return (await payload<{ items: AuditEvent[] }>(response, "Unable to load audit history")).items;
}

export async function submitDecision(
  caseId: string,
  request: {
    decision_id: string;
    action: string;
    reason: string;
    analyst_name: string;
    investigation_id: string;
  },
) {
  const response = await fetch(`/api/cases/${caseId}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return payload(response, "Unable to record analyst decision");
}
