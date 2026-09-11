import { useEffect, useState } from "react";

import { getInvestigationList } from "../services/api";
import type { InvestigationListItem } from "../types";

interface InvestigationsPageProps {
  onOpenCase: (caseId: string) => void;
}

export function InvestigationsPage({ onOpenCase }: InvestigationsPageProps) {
  const [items, setItems] = useState<InvestigationListItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getInvestigationList().then(setItems).catch((requestError: Error) => {
      setError(requestError.message);
    });
  }, []);

  return (
    <section className="aggregate-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Cross-case view</span>
          <h1>Investigations</h1>
          <p>Track investigation readiness and advisory outcomes across KYC cases.</p>
        </div>
      </header>
      {error && <div className="error-banner">{error}</div>}
      <div className="aggregate-list panel">
        <div className="aggregate-row aggregate-row--header investigations-grid">
          <span>Case</span><span>Status</span><span>Risk</span>
          <span>Latest activity</span><span>Recommendation</span>
        </div>
        {items.map((item) => (
          <button
            className="aggregate-row investigations-grid"
            key={item.case_id}
            onClick={() => onOpenCase(item.case_id)}
            type="button"
          >
            <span className="aggregate-identity"><strong>{item.company}</strong><small>{item.case_id} · {item.case_status}</small></span>
            <span className={`aggregate-status aggregate-status--${item.investigation_status === "Completed" ? "complete" : "pending"}`}>{item.investigation_status}</span>
            <span><em className={`pill pill--${item.risk_level.toLowerCase()}`}>{item.risk_level}</em></span>
            <span className="aggregate-detail"><strong>{item.latest_investigation_status}</strong><small>{item.latest_investigation_at ? new Date(item.latest_investigation_at).toLocaleString() : "Not yet run"}</small></span>
            <span className="aggregate-detail"><strong>{item.recommended_action ?? "Pending investigation"}</strong><small>Advisory only</small></span>
          </button>
        ))}
      </div>
    </section>
  );
}
