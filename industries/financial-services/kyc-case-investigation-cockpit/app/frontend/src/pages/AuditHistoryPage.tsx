import { useEffect, useMemo, useState } from "react";

import { getAuditList } from "../services/api";
import type { AuditListItem } from "../types";

interface AuditHistoryPageProps {
  onOpenCase: (caseId: string) => void;
}

export function AuditHistoryPage({ onOpenCase }: AuditHistoryPageProps) {
  const [items, setItems] = useState<AuditListItem[]>([]);
  const [caseId, setCaseId] = useState("");
  const [eventType, setEventType] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getAuditList().then(setItems).catch((requestError: Error) => {
      setError(requestError.message);
    });
  }, []);

  const cases = useMemo(
    () => Array.from(new Map(items.map((item) => [item.case_id, item.company]))),
    [items],
  );
  const filtered = items.filter(
    (item) =>
      (!caseId || item.case_id === caseId) &&
      (!eventType || item.event_type === eventType),
  );

  return (
    <section className="aggregate-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Cross-case timeline</span>
          <h1>Audit history</h1>
          <p>Distinguish system, AI-assistance, and human analyst activity.</p>
        </div>
      </header>
      <div className="filter-bar audit-filters">
        <select aria-label="Filter audit by case" onChange={(event) => setCaseId(event.target.value)} value={caseId}>
          <option value="">All cases</option>
          {cases.map(([id, company]) => <option key={id} value={id}>{id} · {company}</option>)}
        </select>
        <select aria-label="Filter audit by event type" onChange={(event) => setEventType(event.target.value)} value={eventType}>
          <option value="">All event types</option>
          <option>System</option>
          <option>AI Assistance</option>
          <option>Human Analyst</option>
        </select>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="aggregate-list panel">
        <div className="aggregate-row aggregate-row--header audit-grid">
          <span>Event</span><span>Case</span><span>Type / source</span><span>Timestamp</span>
        </div>
        {filtered.map((item) => (
          <button
            className="aggregate-row audit-grid"
            key={`${item.case_id}-${item.event_id}`}
            onClick={() => onOpenCase(item.case_id)}
            type="button"
          >
            <span className="aggregate-identity"><strong>{item.action}</strong><small>{item.description}</small></span>
            <span className="aggregate-identity"><strong>{item.company}</strong><small>{item.case_id}</small></span>
            <span className="aggregate-identity"><strong className={`actor actor--${item.event_type.toLowerCase().replace(" ", "-")}`}>{item.event_type}</strong><small>{item.actor}</small></span>
            <span>{new Date(item.timestamp).toLocaleString()}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
