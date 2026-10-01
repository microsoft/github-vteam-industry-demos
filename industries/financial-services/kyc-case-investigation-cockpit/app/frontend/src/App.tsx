import { useEffect, useMemo, useState } from "react";
import {
  fetchAudit,
  fetchCase,
  fetchCases,
  fetchInvestigation,
  processDocument,
  startInvestigation,
  submitDecision,
} from "./api";
import type { AuditEvent, CaseDetail, CaseSummary, Evidence, Investigation } from "./types";

const DISCLAIMER =
  "Synthetic data only. AI recommendations are for demonstration purposes and do not constitute KYC, AML, sanctions, or compliance decisions.";
const MATCH_NOTICE =
  "Potential synthetic screening similarity — not a confirmed match. Analyst verification is required.";

function Badge({ value }: { value: string }) {
  return <span className={`badge ${value.toLowerCase().replaceAll(" ", "-")}`}>{value}</span>;
}

function Dashboard({ openCase }: { openCase: (id: string) => void }) {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [filters, setFilters] = useState({ status: "", risk: "", search: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchCases(filters).then(setCases).catch((err) => setError(err.message));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [filters]);

  const counts = useMemo(
    () => ({
      total: cases.length,
      medium: cases.filter((item) => item.risk_level === "Medium").length,
      awaiting: cases.filter((item) => item.status === "Awaiting Information").length,
    }),
    [cases],
  );

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">AI-ASSISTED ANALYST WORKSPACE · PHASE 3</p>
          <h1>KYC Case Investigation Cockpit</h1>
          <p>Investigate synthetic onboarding evidence with Microsoft Foundry while retaining human decision control.</p>
        </div>
        <div className="phase-chip">Four Foundry agents live</div>
      </section>
      <section className="kpis">
        <article><strong>{counts.total}</strong><span>Visible cases</span></article>
        <article><strong>{counts.medium}</strong><span>Medium risk</span></article>
        <article><strong>{counts.awaiting}</strong><span>Awaiting information</span></article>
      </section>
      <section className="panel filters">
        <input
          aria-label="Search cases"
          placeholder="Search company, case ID or country"
          value={filters.search}
          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
        />
        <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          <option value="">All statuses</option>
          {["New", "Investigating", "Awaiting Information", "Ready for Decision", "Approved", "Escalated"].map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={filters.risk} onChange={(event) => setFilters({ ...filters, risk: event.target.value })}>
          <option value="">All risk levels</option>
          {["Low", "Medium", "High"].map((item) => <option key={item}>{item}</option>)}
        </select>
      </section>
      {error && <p className="error">{error}</p>}
      <section className="panel table-wrap">
        <table>
          <thead><tr><th>Case</th><th>Company</th><th>Country</th><th>Status</th><th>Risk</th><th>Completeness</th><th>Analyst</th></tr></thead>
          <tbody>
            {cases.map((item) => (
              <tr key={item.id} onClick={() => openCase(item.id)}>
                <td><button className="link">{item.id}</button></td>
                <td><strong>{item.company}</strong><small>{item.scenario}</small></td>
                <td>{item.country}</td><td><Badge value={item.status} /></td><td><Badge value={item.risk_level} /></td>
                <td><div className="progress"><span style={{ width: `${item.completeness}%` }} /></div>{item.completeness}%</td>
                <td>{item.assigned_analyst}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function EvidenceLinks({ ids, evidence }: { ids: string[]; evidence: Evidence[] }) {
  if (!ids.length) return <span className="muted">No direct evidence reference</span>;
  return (
    <div className="evidence-links">
      {ids.map((id) => {
        const item = evidence.find((candidate) => candidate.evidence_id === id);
        if (!item) return <span className="evidence-pill" key={id}>{id}</span>;
        const content = <><strong>{id}</strong><span>{item.excerpt}</span></>;
        return item.content_url
          ? <a className="evidence-pill" href={item.content_url} target="_blank" key={id}>{content}</a>
          : <span className="evidence-pill" key={id}>{content}</span>;
      })}
    </div>
  );
}

function ProgressPanel({
  investigation,
  run,
  busy,
}: {
  investigation: Investigation | null;
  run: (retry: boolean) => void;
  busy: boolean;
}) {
  const active = investigation && ["queued", "running"].includes(investigation.status);
  return (
    <section className="panel investigation-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MICROSOFT FOUNDRY WORKFLOW</p>
          <h2>AI Investigation</h2>
          <p>Four managed agents run sequentially. Results are advisory and checkpointed after each stage.</p>
        </div>
        <button className="primary" disabled={busy || Boolean(active)} onClick={() => run(investigation?.status === "failed")}>
          {active ? "Investigation running…" : investigation?.status === "failed" ? "Retry failed stage" : "Run AI Investigation"}
        </button>
      </div>
      {investigation && (
        <>
          <div className="investigation-meta">
            <Badge value={investigation.status.replaceAll("_", " ")} />
            <span>Attempt {investigation.attempt}</span>
            <span>{investigation.percent_complete}% complete</span>
          </div>
          <div className="stage-list">
            {investigation.stages.map((stage) => (
              <div className={`stage ${stage.status}`} key={stage.stage}>
                <span className="stage-dot" />
                <div><strong>{stage.label}</strong><small>{stage.message}</small></div>
                <Badge value={stage.status.replaceAll("_", " ")} />
              </div>
            ))}
          </div>
          {investigation.error && <p className="error">{investigation.error.user_message}</p>}
        </>
      )}
    </section>
  );
}

function DecisionPanel({
  data,
  investigation,
  afterDecision,
}: {
  data: CaseDetail;
  investigation: Investigation;
  afterDecision: () => Promise<void>;
}) {
  const [action, setAction] = useState("");
  const [analyst, setAnalyst] = useState(data.assigned_analyst);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const decide = async () => {
    if (!action || reason.trim().length < 10 || !analyst.trim()) {
      setMessage("Select an action and provide the analyst name and a meaningful reason.");
      return;
    }
    if (!window.confirm(`Confirm ${action} for ${data.company}?`)) return;
    setBusy(true);
    setMessage("");
    try {
      await submitDecision(data.id, {
        decision_id: crypto.randomUUID(),
        action,
        reason,
        analyst_name: analyst,
        investigation_id: investigation.investigation_id,
      });
      setMessage("Human analyst decision recorded.");
      await afterDecision();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel decision-panel">
      <p className="eyebrow">HUMAN CONTROL</p>
      <h2>Record analyst decision</h2>
      <p>AI recommendations never change case status. A named analyst must confirm every action with a reason.</p>
      <div className="decision-actions">
        {["Approve", "Request More Information", "Escalate"].map((item) => (
          <button className={action === item ? "selected" : ""} onClick={() => setAction(item)} key={item}>{item}</button>
        ))}
      </div>
      <label>Analyst name<input value={analyst} onChange={(event) => setAnalyst(event.target.value)} /></label>
      <label>Reason / comment<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the evidence-based reason for this human decision." /></label>
      <button className="primary" disabled={busy} onClick={decide}>{busy ? "Recording…" : "Confirm human decision"}</button>
      {message && <p className={message.includes("recorded") ? "success" : "error"}>{message}</p>}
    </section>
  );
}

function CaseWorkspace({ caseId, back }: { caseId: string; back: () => void }) {
  const [data, setData] = useState<CaseDetail | null>(null);
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [tab, setTab] = useState("Overview");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const [caseData, investigationData, auditData] = await Promise.all([
      fetchCase(caseId),
      fetchInvestigation(caseId),
      fetchAudit(caseId),
    ]);
    setData(caseData);
    setInvestigation(investigationData);
    setAudit(auditData);
  };

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [caseId]);

  useEffect(() => {
    if (!investigation || !["queued", "running"].includes(investigation.status)) return;
    const timer = window.setInterval(() => {
      fetchInvestigation(caseId)
        .then((next) => {
          setInvestigation(next);
          if (next && !["queued", "running"].includes(next.status)) {
            load().catch((err) => setError(err.message));
          }
        })
        .catch((err) => setError(err.message));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [caseId, investigation?.status]);

  if (!data) return <section className="panel">{error || "Loading case…"}</section>;

  const process = async (documentId: string) => {
    setBusy(documentId); setError("");
    try { await processDocument(caseId, documentId); await load(); } catch (err) { setError((err as Error).message); }
    finally { setBusy(""); }
  };
  const run = async (retry: boolean) => {
    if (investigation?.status === "completed" || investigation?.status === "completed_with_warnings") {
      if (!window.confirm("Run a fresh investigation and retain the previous persisted result?")) return;
    }
    setBusy("investigation"); setError("");
    try {
      await startInvestigation(caseId, retry);
      const next = await fetchInvestigation(caseId);
      setInvestigation(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  };

  const tabs = ["Overview", "Documents", "Ownership", "Completeness", "Risk Review", "AI Summary", "Audit History"];
  return (
    <>
      <button className="back" onClick={back}>← Back to dashboard</button>
      <section className="case-header">
        <div><p className="eyebrow">{data.id} · {data.country}</p><h1>{data.company}</h1><p>{data.profile.business_activity as string}</p></div>
        <div className="header-badges"><Badge value={data.status} /><Badge value={`${data.risk_level} risk`} /></div>
      </section>
      <ProgressPanel investigation={investigation} run={run} busy={busy === "investigation"} />
      <nav className="tabs">{tabs.map((item) => <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</nav>
      {error && <p className="error">{error}</p>}
      {tab === "Overview" && <section className="grid two">
        <article className="panel"><h2>Company profile</h2>{Object.entries(data.profile).map(([key, value]) => <div className="field" key={key}><span>{key.replaceAll("_", " ")}</span><strong>{Array.isArray(value) ? value.join(", ") : value}</strong></div>)}</article>
        <article className="panel"><h2>Case overview</h2><div className="score">{investigation?.completeness?.completeness_percent ?? data.completeness}%<span>evidence completeness</span></div><div className="field"><span>Assigned analyst</span><strong>{data.assigned_analyst}</strong></div><div className="field"><span>Submitted</span><strong>{data.submitted_date}</strong></div><div className="notice">AI-generated findings support analyst review only. The human analyst remains responsible for the final action.</div></article>
      </section>}
      {tab === "Documents" && <section className="documents">
        {data.documents.map((doc) => <article className="panel document" key={doc.id}>
          <div className="doc-top"><div><p className="eyebrow">{doc.id}</p><h3>{doc.type}</h3><p>{doc.file_name}</p></div><Badge value={doc.processing_status.replaceAll("_", " ")} /></div>
          <div className="actions"><a href={`/api/cases/${caseId}/documents/${doc.id}/content`} target="_blank">Open synthetic PDF</a><button disabled={busy === doc.id} onClick={() => process(doc.id)}>{busy === doc.id ? "Processing…" : doc.processing_status === "processed" ? "Retry extraction" : "Process document"}</button></div>
          {doc.error && <p className="error">{doc.error}</p>}
          {doc.extraction && <div className="extraction"><p><strong>Azure AI Document Intelligence</strong> · {doc.extraction.model_id} · {doc.extraction.page_count} page(s)</p>{Object.entries(doc.extraction.fields).map(([name, field]) => <div className="evidence" key={name}><span>{name.replaceAll("_", " ")}</span><strong>{field.value}</strong><small>Evidence: “{field.evidence}” · {(field.confidence * 100).toFixed(0)}%</small></div>)}<details><summary>Extracted text evidence</summary><pre>{doc.extraction.content_excerpt}</pre></details></div>}
        </article>)}
      </section>}
      {tab === "Ownership" && <section className="panel"><h2>Normalized ownership profile</h2>{investigation?.profile ? <><table><thead><tr><th>Person</th><th>Role</th><th>Ownership</th><th>Country</th><th>Evidence</th></tr></thead><tbody>{investigation.profile.beneficial_owners.map((item) => <tr key={item.person_id}><td><strong>{item.full_name}</strong></td><td>{item.roles.join(", ")}</td><td>{item.ownership_percentage ?? "Unknown"}%</td><td>{item.nationality_or_country ?? "Unknown"}</td><td><EvidenceLinks ids={item.evidence_refs} evidence={investigation.evidence} /></td></tr>)}</tbody></table>{investigation.profile.review_flags.map((flag) => <div className="notice warning" key={flag.flag_id}>{flag.description}</div>)}</> : <p>Run AI Investigation to create the evidence-linked normalized ownership profile.</p>}</section>}
      {tab === "Completeness" && <section className="panel"><h2>AI-assisted completeness findings</h2>{investigation?.completeness ? <><div className="score">{investigation.completeness.completeness_percent}%<span>deterministically calculated from findings</span></div><div className="finding-list">{investigation.completeness.findings.map((item) => <article className="finding" key={item.finding_id}><div className="finding-title"><h3>{item.requirement}</h3><Badge value={item.status} /></div><p>{item.explanation}</p>{item.missing_information.length > 0 && <p><strong>Missing:</strong> {item.missing_information.join("; ")}</p>}<EvidenceLinks ids={item.evidence_refs} evidence={investigation.evidence} /></article>)}</div></> : <p>Run AI Investigation to validate the submitted evidence checklist.</p>}</section>}
      {tab === "Risk Review" && <section className="panel"><h2>Evidence-backed risk review</h2><div className="notice warning">{MATCH_NOTICE}</div>{investigation?.risk ? <div className="finding-list">{investigation.risk.findings.map((item) => <article className="finding risk-card" key={item.finding_id}><div className="finding-title"><div><p className="eyebrow">{item.category.replaceAll("_", " ")}</p><h3>{item.title}</h3></div><Badge value={item.severity} /></div><p>{item.description}</p><div className="risk-meta"><span><strong>Confidence:</strong> {item.confidence}</span><span><strong>Source:</strong> {item.source_labels.join(", ") || "Case evidence"}</span></div><p><strong>Recommended analyst action:</strong> {item.recommended_analyst_action}</p><EvidenceLinks ids={item.evidence_refs} evidence={investigation.evidence} /></article>)}</div> : <p>Run AI Investigation to retrieve synthetic screening context and investigate potential indicators.</p>}</section>}
      {tab === "AI Summary" && <section className="summary-layout">{investigation?.summary ? <><article className="panel summary"><div className="summary-labels"><Badge value="AI-generated analyst assistance" /><Badge value="Advisory only — analyst decision required" /></div><h2>Customer overview</h2><p>{investigation.summary.customer_overview}</p><h2>Ownership</h2><p>{investigation.summary.ownership_summary}</p><h2>Evidence</h2><p>{investigation.summary.evidence_summary}</p><h2>Risk and open questions</h2><p>{investigation.summary.risk_summary}</p><ul>{investigation.summary.open_questions.map((item) => <li key={item}>{item}</li>)}</ul><div className="recommendation"><p className="eyebrow">ADVISORY RECOMMENDED NEXT ACTION</p><h2>{investigation.summary.recommended_next_action}</h2><p>{investigation.summary.recommendation_rationale}</p></div><EvidenceLinks ids={investigation.summary.evidence_refs} evidence={investigation.evidence} /><details><summary>Limitations</summary><ul>{investigation.summary.limitations.map((item) => <li key={item}>{item}</li>)}</ul></details></article><DecisionPanel data={data} investigation={investigation} afterDecision={load} /></> : <section className="panel"><p>Run AI Investigation to prepare the advisory analyst summary.</p></section>}</section>}
      {tab === "Audit History" && <section className="panel"><h2>Chronological audit history</h2><div className="timeline">{audit.map((event) => <article className={`audit ${event.actor_type.toLowerCase()}`} key={event.event_id}><Badge value={event.actor_type} /><div><h3>{event.title}</h3><p>{event.detail}</p><small>{new Date(event.occurred_at).toLocaleString()}</small></div></article>)}</div></section>}
    </>
  );
}

export default function App() {
  const initial = window.location.pathname.match(/^\/cases\/(.+)$/)?.[1] || "";
  const [caseId, setCaseId] = useState(initial);
  const navigate = (id: string) => { window.history.pushState({}, "", id ? `/cases/${id}` : "/"); setCaseId(id); };
  useEffect(() => { const handler = () => setCaseId(window.location.pathname.match(/^\/cases\/(.+)$/)?.[1] || ""); window.addEventListener("popstate", handler); return () => window.removeEventListener("popstate", handler); }, []);
  return <><div className="disclaimer">{DISCLAIMER}</div><header className="topbar"><div className="brand"><span>FS</span>KYC Cockpit</div><div>Phase 3 · Synthetic demo · Human controlled</div></header><main>{caseId ? <CaseWorkspace caseId={caseId} back={() => navigate("")} /> : <Dashboard openCase={navigate} />}</main><footer>Microsoft Azure customer demonstration · Fictional organisations and people only</footer></>;
}
