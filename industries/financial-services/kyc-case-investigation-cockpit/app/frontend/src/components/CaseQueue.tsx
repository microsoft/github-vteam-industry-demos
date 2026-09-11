import type { CaseListItem } from "../types";

interface CaseQueueProps {
  cases: CaseListItem[];
  onSelect: (caseId: string) => void;
}

export function CaseQueue({ cases, onSelect }: CaseQueueProps) {
  return (
    <section className="panel queue">
      <div className="panel__heading">
        <div>
          <span className="eyebrow">Analyst queue</span>
          <h2>Priority cases</h2>
        </div>
        <span className="queue-count">{cases.length} cases</span>
      </div>

      <div className="case-list">
        {cases.map((item) => (
          <article
            className="case-row"
            key={item.id}
          >
            <div className="case-row__identity">
              <span>{item.id}</span>
              <strong>{item.company}</strong>
              <small>{item.country}</small>
            </div>
            <div>
              <span className={`pill pill--${item.risk_level.toLowerCase()}`}>
                {item.risk_level} risk
              </span>
            </div>
            <div className="case-row__progress">
              <span>{item.completeness_percent}% complete</span>
              <div className="progress">
                <span style={{ width: `${item.completeness_percent}%` }} />
              </div>
            </div>
            <div className="case-row__status">
              <strong>{item.status}</strong>
              <small>{item.assigned_analyst}</small>
            </div>
            <button
              aria-label={`Open ${item.company}`}
              onClick={() => onSelect(item.id)}
              type="button"
            >
              ›
            </button>
          </article>
        ))}
        {!cases.length && (
          <div className="empty-state">No cases match the selected filters.</div>
        )}
      </div>
    </section>
  );
}
