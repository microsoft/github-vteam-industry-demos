import { useEffect, useState } from "react";

import { getDocumentContent } from "../services/api";
import type { CaseDocument, KycCase } from "../types";
import { DecisionPanel } from "./DecisionPanel";
import { InvestigationProgress } from "./InvestigationProgress";

const tabs = [
  "Overview",
  "Documents",
  "Ownership",
  "Completeness",
  "Risk Review",
  "AI Summary",
  "Audit History",
] as const;

interface CaseWorkspaceProps {
  item: KycCase;
  investigating: boolean;
  stages: string[];
  activeStage: number;
  onBack: () => void;
  onInvestigate: () => Promise<void>;
  onDecision: (action: string, reason: string) => Promise<void>;
  initialTab?: string;
  initialDocumentId?: string;
  onTabChange?: (tab: (typeof tabs)[number]) => void;
}

function Documents({ caseId, documents, initialDocumentId }: { caseId: string; documents: CaseDocument[]; initialDocumentId?: string }) {
  const initialDocument = documents.find((document) => document.id === initialDocumentId) ?? documents[0];
  const [selected, setSelected] = useState(initialDocument);
  const [content, setContent] = useState(selected.preview);

  useEffect(() => {
    const requested = documents.find((document) => document.id === initialDocumentId);
    if (requested) setSelected(requested);
  }, [documents, initialDocumentId]);

  useEffect(() => {
    setContent("Loading protected synthetic document...");
    getDocumentContent(caseId, selected.id)
      .then(setContent)
      .catch(() => setContent(selected.preview));
  }, [caseId, selected]);

  return (
    <div className="document-workspace">
      <div className="document-list">
        {documents.map((document) => (
          <button
            className={selected.id === document.id ? "document-item document-item--active" : "document-item"}
            key={document.id}
            onClick={() => setSelected(document)}
            type="button"
          >
            <span>▤</span>
            <div>
              <strong>{document.document_type}</strong>
              <small>{document.name}</small>
            </div>
            <em>{Math.round(document.confidence * 100)}%</em>
          </button>
        ))}
      </div>
      <div className="document-preview">
        <div className="preview-label">Synthetic document preview</div>
        <pre>{content}</pre>
        <h4>Extracted facts and source evidence</h4>
        {selected.extracted_facts.length ? (
          selected.extracted_facts.map((fact) => (
            <div className="fact-row" key={fact.field}>
              <div><span>{fact.field}</span><strong>{fact.value}</strong></div>
              <small>{fact.source_document} · {Math.round(fact.confidence * 100)}%</small>
            </div>
          ))
        ) : (
          <p className="muted">No structured facts are assigned to this preview yet.</p>
        )}
      </div>
    </div>
  );
}

export function CaseWorkspace({
  item,
  investigating,
  stages,
  activeStage,
  onBack,
  onInvestigate,
  onDecision,
  initialTab = "Overview",
  initialDocumentId,
  onTabChange,
}: CaseWorkspaceProps) {
  const resolvedInitialTab = tabs.includes(initialTab as (typeof tabs)[number])
    ? (initialTab as (typeof tabs)[number])
    : "Overview";
  const [tab, setTab] = useState<(typeof tabs)[number]>(resolvedInitialTab);

  useEffect(() => {
    setTab(resolvedInitialTab);
  }, [resolvedInitialTab]);

  const selectTab = (nextTab: (typeof tabs)[number]) => {
    setTab(nextTab);
    onTabChange?.(nextTab);
  };

  return (
    <div className="case-workspace">
      <button className="back-button" onClick={onBack} type="button">
        ← Back to case dashboard
      </button>
      <header className="case-header">
        <div>
          <span className="eyebrow">{item.id} · {item.onboarding_type}</span>
          <h1>{item.company}</h1>
          <p>{item.scenario}</p>
        </div>
        <div className="case-header__badges">
          <span className={`pill pill--${item.risk_level.toLowerCase()}`}>{item.risk_level} risk</span>
          <span className="status-badge">{item.status}</span>
          <button className="primary-button" disabled={investigating} onClick={onInvestigate} type="button">
            {investigating ? "Investigation running..." : "Run AI Investigation"}
          </button>
        </div>
      </header>

      {investigating && <InvestigationProgress activeIndex={activeStage} stages={stages} />}

      <nav className="tabs" aria-label="Case workspace">
        {tabs.map((label) => (
          <button className={tab === label ? "tab tab--active" : "tab"} key={label} onClick={() => selectTab(label)} type="button">
            {label}
            {label === "Risk Review" && item.risks.length > 0 && <span>{item.risks.length}</span>}
          </button>
        ))}
      </nav>

      <section className="workspace-content panel">
        {tab === "Overview" && (
          <div className="overview-grid">
            <div>
              <span className="eyebrow">Company profile</span>
              <h2>Registration details</h2>
              <dl className="detail-grid">
                <div><dt>Legal name</dt><dd>{item.profile.legal_name}</dd></div>
                <div><dt>Registration number</dt><dd>{item.profile.registration_number}</dd></div>
                <div><dt>Incorporation</dt><dd>{item.profile.incorporation_country} · {item.profile.incorporation_date}</dd></div>
                <div><dt>Assigned analyst</dt><dd>{item.assigned_analyst}</dd></div>
                <div><dt>Registered address</dt><dd>{item.profile.registered_address}</dd></div>
                <div><dt>Trading address</dt><dd>{item.profile.trading_address}</dd></div>
              </dl>
            </div>
            <div>
              <span className="eyebrow">Directors</span>
              <h2>Authorised leadership</h2>
              {item.profile.directors.map((director) => (
                <div className="person-card" key={director.name}>
                  <span>{director.name.split(" ").map((part) => part[0]).join("")}</span>
                  <div><strong>{director.name}</strong><small>{director.role} · {director.country}</small></div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === "Documents" && <Documents caseId={item.id} documents={item.documents} initialDocumentId={initialDocumentId} />}
        {tab === "Ownership" && (
          <div>
            <div className="section-heading"><div><span className="eyebrow">Beneficial ownership</span><h2>Ownership relationships</h2></div><p>All entities and people are fictional.</p></div>
            <div className="ownership-table">
              {item.ownership.map((link) => (
                <div key={`${link.owner}-${link.owned_entity}`}>
                  <strong>{link.owner}</strong><span>owns {link.percentage}% of</span><strong>{link.owned_entity}</strong><small>{link.relationship} · {link.jurisdiction}<br />Source: {link.source_document}</small>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === "Completeness" && (
          item.completeness.length ? (
            <div className="finding-list">
              {item.completeness.map((finding) => (
                <article className="finding" key={finding.requirement}>
                  <span className={`finding-status finding-status--${finding.status.toLowerCase().replace(" ", "-")}`}>{finding.status}</span>
                  <div><h3>{finding.requirement}</h3><p>{finding.explanation}</p><small>Evidence: {finding.evidence}</small></div>
                </article>
              ))}
            </div>
          ) : <EmptyInvestigation onInvestigate={onInvestigate} />
        )}
        {tab === "Risk Review" && (
          item.risks.length ? (
            <div className="finding-list">
              <div className="demo-mode-note">Synthetic local screening dataset · potential matches are unconfirmed and require analyst review.</div>
              {item.risks.map((finding) => (
                <article className="risk-finding" key={finding.category}>
                  <span className={`pill pill--${finding.severity.toLowerCase()}`}>{finding.severity}</span>
                  <div><h3>{finding.category}</h3><p>{finding.description}</p><small>Evidence: {finding.evidence}<br />Source: {finding.source} · confidence {Math.round(finding.confidence * 100)}%</small><strong>Analyst action: {finding.recommended_action}</strong></div>
                </article>
              ))}
            </div>
          ) : <EmptyInvestigation onInvestigate={onInvestigate} />
        )}
        {tab === "AI Summary" && (
          item.summary ? (
            <div className="summary-layout">
              <div className="demo-mode-note">AI-generated analyst assistance · live Microsoft Foundry agents · human decision required</div>
              {[
                ["Customer Overview", item.summary.customer_overview],
                ["Ownership", item.summary.ownership_summary],
                ["Evidence Reviewed", item.summary.evidence_summary],
                ["Risk Indicators", item.summary.risk_summary],
              ].map(([title, content]) => <section key={title}><h3>{title}</h3><p>{content}</p></section>)}
              <section><h3>Open questions</h3><ul>{item.summary.open_questions.map((question) => <li key={question}>{question}</li>)}</ul></section>
              <section className="recommended-action"><span>Recommended next action</span><strong>{item.summary.recommended_action}</strong><p>{item.summary.rationale}</p></section>
              <DecisionPanel onSubmit={onDecision} recommendedAction={item.summary.recommended_action} />
            </div>
          ) : <EmptyInvestigation onInvestigate={onInvestigate} />
        )}
        {tab === "Audit History" && (
          <div className="audit-timeline">
            {item.audit.slice().reverse().map((event) => (
              <article key={event.id}>
                <span className={`audit-dot audit-dot--${event.actor_type.toLowerCase().replace(" ", "-")}`} />
                <div><small>{new Date(event.timestamp).toLocaleString()} · {event.actor_type}</small><h3>{event.action}</h3><p>{event.detail}</p><strong>{event.actor}</strong></div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyInvestigation({ onInvestigate }: { onInvestigate: () => Promise<void> }) {
  return (
    <div className="empty-investigation">
      <span>◎</span><h2>Investigation not run yet</h2><p>Run live Azure AI assistance to prepare completeness, risk, and summary findings.</p>
      <button className="primary-button" onClick={onInvestigate} type="button">Run AI Investigation</button>
    </div>
  );
}
