import { useEffect, useState } from "react";

import { getDocumentList } from "../services/api";
import type { DocumentListItem } from "../types";

interface DocumentsPageProps {
  onOpenDocument: (caseId: string, documentId: string) => void;
}

export function DocumentsPage({ onOpenDocument }: DocumentsPageProps) {
  const [items, setItems] = useState<DocumentListItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getDocumentList().then(setItems).catch((requestError: Error) => {
      setError(requestError.message);
    });
  }, []);

  return (
    <section className="aggregate-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Synthetic evidence</span>
          <h1>Documents</h1>
          <p>Review document processing status across fictional onboarding cases.</p>
        </div>
      </header>
      {error && <div className="error-banner">{error}</div>}
      <div className="aggregate-list panel">
        <div className="aggregate-row aggregate-row--header documents-grid">
          <span>Document</span><span>Source case</span><span>Status</span>
          <span>Submitted</span><span>Confidence</span>
        </div>
        {items.map((item) => (
          <button
            className="aggregate-row documents-grid"
            key={`${item.case_id}-${item.document_id}`}
            onClick={() => onOpenDocument(item.case_id, item.document_id)}
            type="button"
          >
            <span className="aggregate-identity"><strong>{item.document_type}</strong><small>{item.name}</small></span>
            <span className="aggregate-identity"><strong>{item.company}</strong><small>{item.case_id}</small></span>
            <span className="aggregate-status aggregate-status--complete">{item.status}</span>
            <span>{item.submitted_at}</span>
            <span>{Math.round(item.confidence * 100)}%</span>
          </button>
        ))}
      </div>
    </section>
  );
}
