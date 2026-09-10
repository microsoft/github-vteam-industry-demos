import { useEffect, useState } from "react";
import { api } from "../api";
import type { AuditEvent, Document, GenerationJob, Opportunity, Proposal } from "../types";
import { AuditTimeline } from "./AuditTimeline";
import { ProposalWorkspace } from "./ProposalWorkspace";

type Tab = "requirements" | "documents" | "proposal" | "risks" | "audit";

export function OpportunityWorkspace({ initial, onBack }: { initial: Opportunity; onBack: () => void }) {
  const [opportunity, setOpportunity] = useState(initial);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [proposal, setProposal] = useState<Proposal>();
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [tab, setTab] = useState<Tab>(initial.proposal_id ? "proposal" : "requirements");
  const [job, setJob] = useState<GenerationJob>();
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const [freshOpportunity, freshDocuments, freshAudit] = await Promise.all([
      api.opportunity(opportunity.id), api.documents(opportunity.id), api.audit(opportunity.id),
    ]);
    setOpportunity(freshOpportunity); setDocuments(freshDocuments); setAudit(freshAudit);
    if (freshOpportunity.proposal_id) setProposal(await api.proposal(freshOpportunity.proposal_id));
  };

  useEffect(() => { reload().catch((error) => notify(error.message, true)); }, []);
  useEffect(() => {
    if (!job || ["completed", "failed"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      const current = await api.generation(job.id);
      setJob(current);
      if (current.status === "completed" && current.proposal_id) {
        window.clearInterval(timer);
        setProposal(await api.proposal(current.proposal_id));
        await reload();
        setTab("proposal");
      }
    }, 650);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  const notify = (text: string, error = false) => {
    setMessage({ text, error });
    window.setTimeout(() => setMessage(undefined), 4200);
  };
  const updateField = (field: keyof Opportunity, value: string | string[]) =>
    setOpportunity({ ...opportunity, [field]: value });
  const updateLines = (field: "expected_outcomes" | "stakeholders" | "constraints", value: string) =>
    updateField(field, value.split("\n").map((item) => item.trim()).filter(Boolean));
  const save = async () => {
    setSaving(true);
    try { setOpportunity(await api.updateOpportunity(opportunity.id, opportunity)); notify("Opportunity saved."); await reload(); }
    catch (error) { notify(error instanceof Error ? error.message : "Save failed", true); }
    finally { setSaving(false); }
  };
  const generate = async () => {
    try { setJob(await api.generate(opportunity.id)); setTab("proposal"); }
    catch (error) { notify(error instanceof Error ? error.message : "Generation failed", true); }
  };

  return (
    <div className="page workspace">
      {message && <div className={`toast ${message.error ? "error" : ""}`}>{message.error ? "!" : "✓"} {message.text}</div>}
      <button className="back-button" onClick={onBack}>← Back to opportunities</button>
      <header className="workspace-header">
        <div className="customer-logo">{opportunity.customer.charAt(0)}</div>
        <div><p>{opportunity.customer}</p><h1>{opportunity.name}</h1><span>{opportunity.industry} · {opportunity.estimated_value} · {opportunity.delivery_duration}</span></div>
        <div className="workspace-actions"><span className="status discovery">{opportunity.status}</span><button className="primary-button" onClick={generate} disabled={job?.status === "running"}>✦ {proposal ? "Generate new version" : "Generate Proposal"}</button></div>
      </header>
      <nav className="tabs">
        {(["requirements", "documents", "proposal", "risks", "audit"] as Tab[]).map((item) => (
          <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>
            {item === "documents" ? `Meeting notes (${documents.length})` : item === "risks" ? `Risk review${proposal ? ` (${proposal.risks.length})` : ""}` : item}
          </button>
        ))}
      </nav>

      {tab === "requirements" && <section className="workspace-grid">
        <div className="panel form-panel"><div className="panel-heading"><div><h2>Business requirements</h2><p>Review and refine the customer context before generation.</p></div><button className="save-button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></div>
          <div className="form-grid">
            <label>Customer name<input value={opportunity.customer} onChange={(event) => updateField("customer", event.target.value)} /></label>
            <label>Opportunity name<input value={opportunity.name} onChange={(event) => updateField("name", event.target.value)} /></label>
            <label>Industry<input value={opportunity.industry} onChange={(event) => updateField("industry", event.target.value)} /></label>
            <label>Estimated value<input value={opportunity.estimated_value} onChange={(event) => updateField("estimated_value", event.target.value)} /></label>
            <label>Target timeline<input value={opportunity.target_timeline} onChange={(event) => updateField("target_timeline", event.target.value)} /></label>
            <label>Expected delivery duration<input value={opportunity.delivery_duration} onChange={(event) => updateField("delivery_duration", event.target.value)} /></label>
            <label className="full">Business problem<textarea value={opportunity.business_problem} onChange={(event) => updateField("business_problem", event.target.value)} /></label>
            <label className="full">Proposed scope<textarea value={opportunity.scope} onChange={(event) => updateField("scope", event.target.value)} /></label>
            <label>Expected outcomes<textarea value={opportunity.expected_outcomes.join("\n")} onChange={(event) => updateLines("expected_outcomes", event.target.value)} /></label>
            <label>Stakeholders<textarea value={opportunity.stakeholders.join("\n")} onChange={(event) => updateLines("stakeholders", event.target.value)} /></label>
            <label>Constraints<textarea value={opportunity.constraints.join("\n")} onChange={(event) => updateLines("constraints", event.target.value)} /></label>
            <label>Budget / effort assumptions<textarea value={opportunity.budget_assumptions} onChange={(event) => updateField("budget_assumptions", event.target.value)} /></label>
            <label className="full">Additional notes<textarea value={opportunity.notes} onChange={(event) => updateField("notes", event.target.value)} /></label>
          </div>
        </div>
        <aside className="panel readiness"><span className="readiness-score">82%</span><h3>Generation readiness</h3><p>This opportunity has enough context to create a strong first draft.</p>{["Business problem defined", "Outcomes captured", "Stakeholders identified", `${documents.filter((item) => item.selected).length} note selected`].map((item) => <span key={item}>✓ {item}</span>)}<button onClick={generate}>✦ Generate Proposal</button></aside>
      </section>}

      {tab === "documents" && <section className="panel documents-panel">
        <div className="panel-heading"><div><h2>Meeting notes & documents</h2><p>Select the context agents should use, or upload a supported document.</p></div><label className="upload-button">＋ Upload .txt, .md, or .pdf<input type="file" accept=".txt,.md,.pdf" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { await api.uploadDocument(opportunity.id, file); await reload(); notify(`${file.name} uploaded.`); } catch (error) { notify(error instanceof Error ? error.message : "Upload failed", true); } }} /></label></div>
        <div className="document-list">{documents.map((document) => <article key={document.id}><input type="checkbox" checked={document.selected} onChange={async (event) => { await api.selectDocument(opportunity.id, document.id, event.target.checked); await reload(); }} /><span className="file-icon">{document.filename.endsWith(".pdf") ? "PDF" : "DOC"}</span><div><strong>{document.filename}</strong><small>{document.seeded ? "Seeded discovery notes" : "Uploaded document"} · {new Date(document.created_at).toLocaleDateString()}</small></div><span className="selected-label">{document.selected ? "Selected" : "Not selected"}</span>{!document.seeded && <button onClick={async () => { await api.deleteDocument(opportunity.id, document.id); await reload(); }}>Remove</button>}</article>)}</div>
      </section>}

      {tab === "proposal" && <>
        {job && job.status !== "completed" && <section className={`generation-panel ${job.status}`}><div className="generation-orb">✦</div><div><p>THREE-AGENT WORKFLOW</p><h2>{job.status === "failed" ? "Generation paused" : job.current_step}</h2><span>{job.error ?? "Your proposal is being assembled. You can safely keep this page open."}</span><div className="generation-track"><i style={{ width: `${job.progress}%` }} /></div><small>{job.progress}% complete</small>{job.status === "failed" && <button onClick={generate}>Retry generation</button>}</div></section>}
        {proposal && <ProposalWorkspace proposal={proposal} onChange={(next) => { setProposal(next); reload(); }} notify={notify} />}
        {!proposal && !job && <div className="panel empty-proposal"><span>✦</span><h2>Ready to create a proposal</h2><p>The Requirements Analyst, Proposal Writer, and Risk Reviewer will work in sequence.</p><button className="primary-button" onClick={generate}>Generate Proposal</button></div>}
      </>}

      {tab === "risks" && <section className="panel risks-panel"><div className="panel-heading"><div><h2>Risk, assumption & dependency review</h2><p>Findings are separate from proposal content so reviewers stay in control.</p></div></div>{proposal ? <div className="risk-list">{proposal.risks.map((risk) => <article key={risk.id}><span className={`severity ${risk.severity.toLowerCase()}`}>{risk.severity}</span><div><small>{risk.category}</small><strong>{risk.description}</strong><p><b>Mitigation / question:</b> {risk.mitigation}</p></div></article>)}</div> : <div className="empty-state">Generate a proposal to run the risk review.</div>}</section>}
      {tab === "audit" && <section className="panel audit-panel"><div className="panel-heading"><div><h2>Opportunity audit history</h2><p>Chronological activity for this customer proposal.</p></div></div><AuditTimeline events={audit} embedded /></section>}
    </div>
  );
}
