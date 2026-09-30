import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  History,
  Layers3,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type {
  AuditEvent,
  Document,
  Generation,
  KnowledgeItem,
  Opportunity,
  Proposal,
  ProposalSection,
  RiskFinding,
} from "./types";

const statusOrder = [
  "analysing_requirements",
  "searching_knowledge",
  "drafting_proposal",
  "reviewing_risks",
  "saving",
  "completed",
];

function App() {
  const [page, setPage] = useState<"dashboard" | "knowledge">("dashboard");
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const showError = useCallback((reason: unknown, fallback: string) => {
    setError(reason instanceof Error ? reason.message : fallback);
  }, []);

  useEffect(() => {
    api
      .opportunities()
      .then(setOpportunities)
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  async function openOpportunity(opportunity: Opportunity) {
    setPage("dashboard");
    setSelected(opportunity);
    setProposal(null);
    setGeneration(null);
    setError("");
    try {
      const items = await api.documents(opportunity.id);
      setDocuments(items);
      setSelectedDocs(items.map((item) => item.id));
    } catch (reason) {
      showError(reason, "Unable to load meeting notes.");
    }
  }

  async function generate() {
    if (!selected || selectedDocs.length === 0) return;
    setError("");
    setProposal(null);
    try {
      const result = await api.generate(selected.id, selectedDocs);
      setGeneration({
        generation_id: result.generation_id,
        status: result.status,
        progress_message: "Proposal generation is queued.",
      });
    } catch (reason) {
      showError(reason, "Unable to start generation.");
    }
  }

  useEffect(() => {
    if (!generation || ["completed", "failed"].includes(generation.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const next = await api.generation(generation.generation_id);
        setGeneration(next);
        if (next.status === "completed" && next.proposal_id) {
          setProposal(await api.proposal(next.proposal_id));
        }
      } catch (reason) {
        showError(reason, "Unable to read generation status.");
        window.clearInterval(timer);
      }
    }, 900);
    return () => window.clearInterval(timer);
  }, [generation, showError]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><Sparkles size={22} /></div>
        <div className="brand-copy">
          <strong>AI Proposal Factory</strong>
          <span>Professional Services</span>
        </div>
        <nav className="global-nav">
          <button
            className={page === "dashboard" ? "active" : ""}
            onClick={() => { setPage("dashboard"); setSelected(null); setProposal(null); }}
          >
            Opportunities
          </button>
          <button className={page === "knowledge" ? "active" : ""} onClick={() => setPage("knowledge")}>
            Knowledge Library
          </button>
        </nav>
        <div className="demo-banner">Demo environment — synthetic data only</div>
      </header>
      <main>
        {error && (
          <div className="error-banner">
            <AlertTriangle size={18} />{error}
            <button onClick={() => setError("")}><X size={16} /></button>
          </div>
        )}
        {page === "knowledge" ? (
          <KnowledgeLibrary onError={showError} />
        ) : !selected ? (
          <Dashboard opportunities={opportunities} loading={loading} onOpen={openOpportunity} />
        ) : proposal ? (
          <ProposalView
            proposal={proposal}
            onChange={setProposal}
            onError={showError}
            onBack={() => setProposal(null)}
          />
        ) : (
          <Workspace
            opportunity={selected}
            documents={documents}
            selectedDocs={selectedDocs}
            generation={generation}
            onBack={() => setSelected(null)}
            onToggle={(id) =>
              setSelectedDocs((current) =>
                current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
              )
            }
            onGenerate={generate}
          />
        )}
      </main>
    </div>
  );
}

function Dashboard({
  opportunities,
  loading,
  onOpen,
}: {
  opportunities: Opportunity[];
  loading: boolean;
  onOpen: (opportunity: Opportunity) => void;
}) {
  const value = opportunities.reduce(
    (sum, item) => sum + Number(item.estimatedValue.replace(/[^\d.]/g, "")),
    0,
  );
  return (
    <div className="page">
      <section className="hero">
        <div>
          <span className="eyebrow">Opportunity portfolio</span>
          <h1>Turn discovery into a confident proposal.</h1>
          <p>Bring customer context, reusable knowledge, and focused AI agents into one workflow.</p>
        </div>
        <div className="hero-orbit"><Sparkles size={42} /></div>
      </section>
      <section className="metrics">
        <Metric icon={<Layers3 />} value={String(opportunities.length)} label="Active opportunities" />
        <Metric icon={<CircleDollarSign />} value={`€${value.toFixed(1)}M`} label="Pipeline value" />
        <Metric icon={<Target />} value="3" label="Specialist AI agents" />
      </section>
      <div className="section-heading">
        <div><span className="eyebrow">Current work</span><h2>Opportunities</h2></div>
        <span className="muted">Select an opportunity to open its proposal workspace</span>
      </div>
      {loading ? (
        <div className="loading-state"><LoaderCircle className="spin" /> Loading opportunities</div>
      ) : (
        <section className="opportunity-grid">
          {opportunities.map((item) => (
            <button className="opportunity-card" key={item.id} onClick={() => onOpen(item)}>
              <div className="card-top">
                <span className="industry">{item.industry}</span>
                <span className="status">{item.status}</span>
              </div>
              <div className="customer"><Building2 size={16} />{item.customer}</div>
              <h3>{item.name}</h3>
              <p>{item.businessProblem}</p>
              <div className="card-facts">
                <span><CircleDollarSign size={15} />{item.estimatedValue}</span>
                <span><Clock3 size={15} />{item.duration}</span>
              </div>
              <div className="progress-line"><i style={{ width: `${item.progress}%` }} /></div>
              <div className="card-footer">
                <span>{item.progress}% proposal readiness</span>
                <ChevronRight size={18} />
              </div>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

function KnowledgeLibrary({
  onError,
}: {
  onError: (reason: unknown, fallback: string) => void;
}) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [filters, setFilters] = useState({ kinds: [] as string[], industries: [] as string[] });
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [industry, setIndustry] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      api
        .knowledge({ q: query, kind, industry })
        .then((result) => {
          setItems(result.items);
          setFilters(result.filters);
        })
        .catch((reason) => onError(reason, "Unable to browse organizational knowledge."))
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, kind, industry, onError]);

  return (
    <div className="page">
      <section className="library-header">
        <div>
          <span className="eyebrow">Reusable organizational knowledge</span>
          <h1>Knowledge Library</h1>
          <p>Browse the curated content used to ground proposal generation and regeneration.</p>
        </div>
        <BookOpen size={42} />
      </section>
      <section className="library-controls">
        <label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, content, and tags" /></label>
        <select value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="">All types</option>
          {filters.kinds.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={industry} onChange={(event) => setIndustry(event.target.value)}>
          <option value="">All industries</option>
          {filters.industries.map((item) => <option key={item}>{item}</option>)}
        </select>
      </section>
      {loading ? (
        <div className="loading-state"><LoaderCircle className="spin" /> Searching knowledge</div>
      ) : items.length === 0 ? (
        <div className="empty-state"><BookOpen /><h2>No matching knowledge</h2><p>Clear a filter or try a broader search.</p></div>
      ) : (
        <>
          <p className="result-count">{items.length} knowledge item{items.length === 1 ? "" : "s"}</p>
          <section className="knowledge-grid">
            {items.map((item) => (
              <article className="knowledge-card" key={item.id}>
                <div><span className="kind-badge">{formatLabel(item.kind)}</span><span>{item.industry}</span></div>
                <h2>{item.title}</h2>
                <p>{item.content}</p>
                <div className="tag-row">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                <small>{item.sourceBlobName}</small>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return <div className="metric"><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></div>;
}

function Workspace({
  opportunity,
  documents,
  selectedDocs,
  generation,
  onBack,
  onToggle,
  onGenerate,
}: {
  opportunity: Opportunity;
  documents: Document[];
  selectedDocs: string[];
  generation: Generation | null;
  onBack: () => void;
  onToggle: (id: string) => void;
  onGenerate: () => void;
}) {
  const generating = generation && !["completed", "failed"].includes(generation.status);
  return (
    <div className="page">
      <button className="back-link" onClick={onBack}><ArrowLeft size={17} />All opportunities</button>
      <section className="workspace-title">
        <div>
          <span className="eyebrow">{opportunity.customer} · {opportunity.industry}</span>
          <h1>{opportunity.name}</h1>
          <p>{opportunity.businessProblem}</p>
        </div>
        <div className="workspace-value"><small>Estimated value</small><strong>{opportunity.estimatedValue}</strong><span>{opportunity.duration}</span></div>
      </section>
      <div className="workspace-grid">
        <div className="workspace-main">
          <Panel title="Opportunity brief" icon={<Target size={19} />}>
            <InfoBlock title="Expected outcomes" items={opportunity.expectedOutcomes} />
            <InfoBlock title="Scope" items={opportunity.scope} />
            <div className="detail-grid">
              <Detail icon={<Users />} title="Stakeholders" value={opportunity.stakeholders.join(", ")} />
              <Detail icon={<CalendarDays />} title="Target timeline" value={opportunity.targetTimeline} />
              <Detail icon={<ShieldAlert />} title="Constraints" value={opportunity.constraints.join(", ")} />
              <Detail icon={<CircleDollarSign />} title="Effort assumption" value={opportunity.budgetAssumptions} />
            </div>
          </Panel>
          <Panel title="Discovery meeting notes" icon={<FileText size={19} />}>
            <p className="panel-intro">Select the customer notes the Requirements Analyst should consider.</p>
            <div className="document-list">
              {documents.map((document) => {
                const checked = selectedDocs.includes(document.id);
                return (
                  <button className={`document ${checked ? "selected" : ""}`} key={document.id} onClick={() => onToggle(document.id)}>
                    <span className="check">{checked && <Check size={15} />}</span>
                    <div><strong>{document.name}</strong><p>{document.content}</p></div>
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>
        <aside>
          <div className="generation-card">
            <div className="ai-icon"><Sparkles /></div>
            <span className="eyebrow">Agent workflow</span>
            <h2>Generate proposal</h2>
            <p>Three specialist agents will analyse, draft, and review this proposal using reusable knowledge.</p>
            {generation ? <GenerationProgress generation={generation} /> : (
              <ol className="mini-flow"><li>Requirements Analyst</li><li>Proposal Writer + Search</li><li>Risk Reviewer</li></ol>
            )}
            <button className="primary-button" disabled={!!generating || selectedDocs.length === 0} onClick={onGenerate}>
              {generating ? <><LoaderCircle className="spin" size={18} />Generating…</> : <><Sparkles size={18} />Generate Proposal</>}
            </button>
            <small>{selectedDocs.length} meeting note{selectedDocs.length === 1 ? "" : "s"} selected</small>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="panel"><h2>{icon}{title}</h2>{children}</section>;
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return <div className="info-block"><h3>{title}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}

function Detail({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return <div className="detail"><span>{icon}</span><div><small>{title}</small><p>{value}</p></div></div>;
}

function GenerationProgress({ generation }: { generation: Generation }) {
  const currentIndex = statusOrder.indexOf(generation.status);
  const labels = ["Analyse requirements", "Search knowledge", "Draft proposal", "Review risks", "Save proposal"];
  return (
    <div className="generation-progress">
      {labels.map((label, index) => (
        <div className={index < currentIndex ? "done" : index === currentIndex ? "active" : ""} key={label}>
          <span>{index < currentIndex ? <Check size={13} /> : index + 1}</span>{label}
        </div>
      ))}
      {generation.status === "failed" && <p className="inline-error">{generation.error}</p>}
      <small>{generation.progress_message}</small>
    </div>
  );
}

function ProposalView({
  proposal,
  onChange,
  onError,
  onBack,
}: {
  proposal: Proposal;
  onChange: (proposal: Proposal) => void;
  onError: (reason: unknown, fallback: string) => void;
  onBack: () => void;
}) {
  const [active, setActive] = useState<"proposal" | "risks" | "audit">("proposal");
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [busy, setBusy] = useState("");
  const approved = proposal.sections.filter((section) => section.status === "Approved").length;

  async function mutate(key: string, operation: () => Promise<Proposal>, fallback: string) {
    setBusy(key);
    try {
      onChange(await operation());
      if (active === "audit") setAudit((await api.audit(proposal.id)).items);
    } catch (reason) {
      onError(reason, fallback);
    } finally {
      setBusy("");
    }
  }

  async function loadAudit() {
    setActive("audit");
    try {
      setAudit((await api.audit(proposal.id)).items);
    } catch (reason) {
      onError(reason, "Unable to load audit history.");
    }
  }

  async function download(format: "markdown" | "pdf") {
    setBusy(`export-${format}`);
    try {
      await api.download(proposal.id, format);
      if (active === "audit") setAudit((await api.audit(proposal.id)).items);
    } catch (reason) {
      onError(reason, `Unable to export ${format}.`);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="page proposal-page">
      <button className="back-link" onClick={onBack}><ArrowLeft size={17} />Opportunity workspace</button>
      <section className="proposal-header">
        <div><span className="eyebrow">Proposal workspace</span><h1>{proposal.opportunityName}</h1><p>Prepared for {proposal.customer} · Updated {formatDate(proposal.updatedAt)}</p></div>
        <div className="header-actions">
          <span className={`ready-badge ${proposal.status === "Approved" ? "approved" : ""}`}><Check size={16} />{proposal.status}</span>
          <button className="secondary-button" onClick={() => download("markdown")} disabled={!!busy}><Download size={16} />Markdown</button>
          <button className="secondary-button" onClick={() => download("pdf")} disabled={!!busy}><Download size={16} />PDF</button>
          <button
            className="approve-all"
            disabled={approved !== 12 || proposal.status === "Approved" || !!busy}
            onClick={() => mutate("approve-proposal", () => api.approveProposal(proposal.id), "Unable to approve proposal.")}
          >
            <FileCheck2 size={17} />Approve proposal ({approved}/12)
          </button>
        </div>
      </section>
      <div className="proposal-tabs">
        <button className={active === "proposal" ? "active" : ""} onClick={() => setActive("proposal")}>Proposal · 12 sections</button>
        <button className={active === "risks" ? "active" : ""} onClick={() => setActive("risks")}>Risk review · {proposal.riskFindings.length}</button>
        <button className={active === "audit" ? "active" : ""} onClick={loadAudit}>Audit history</button>
      </div>
      {active === "proposal" ? (
        <div className="proposal-layout">
          <nav className="section-nav">
            {proposal.sections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                <span>{String(section.order).padStart(2, "0")}</span>{section.title}
                {section.status === "Approved" && <Check size={12} />}
              </a>
            ))}
          </nav>
          <article className="proposal-document">
            {proposal.sections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                busy={busy}
                onSave={(content) => mutate(section.id, () => api.saveSection(proposal.id, section.id, content), "Unable to save section.")}
                onRegenerate={(instruction) => mutate(section.id, () => api.regenerateSection(proposal.id, section.id, instruction), "Unable to regenerate section.")}
                onApprove={() => mutate(section.id, () => api.approveSection(proposal.id, section.id), "Unable to approve section.")}
              />
            ))}
          </article>
        </div>
      ) : active === "risks" ? (
        <RiskReview
          proposal={proposal}
          busy={busy}
          onNavigate={(sectionId) => {
            setActive("proposal");
            window.setTimeout(() => document.getElementById(sectionId)?.scrollIntoView(), 0);
          }}
          onAction={(risk, acknowledged, disposition) =>
            mutate(risk.id, () => api.acknowledgeRisk(proposal.id, risk.id, acknowledged, disposition), "Unable to update risk disposition.")
          }
        />
      ) : (
        <AuditHistory items={audit} />
      )}
    </div>
  );
}

function SectionCard({
  section,
  busy,
  onSave,
  onRegenerate,
  onApprove,
}: {
  section: ProposalSection;
  busy: string;
  onSave: (content: string) => void;
  onRegenerate: (instruction?: string) => void;
  onApprove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(section.content);
  const [instruction, setInstruction] = useState("");
  const [showRegenerate, setShowRegenerate] = useState(false);

  useEffect(() => setContent(section.content), [section.content]);

  return (
    <section id={section.id} className="proposal-section">
      <div className="section-title-row">
        <div><span>{String(section.order).padStart(2, "0")}</span><h2>{section.title}</h2></div>
        <span className={`section-status ${section.status.toLowerCase().replace(" ", "-")}`}>{section.status}</span>
      </div>
      {editing ? (
        <textarea className="section-editor" value={content} onChange={(event) => setContent(event.target.value)} />
      ) : (
        <p>{section.content}</p>
      )}
      <div className="section-actions">
        {editing ? (
          <>
            <button onClick={() => { setEditing(false); setContent(section.content); }}><X size={15} />Cancel</button>
            <button className="action-primary" disabled={!content.trim() || busy === section.id} onClick={() => { onSave(content); setEditing(false); }}><Save size={15} />Save</button>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(true)}><Pencil size={15} />Edit</button>
            <button onClick={() => setShowRegenerate((value) => !value)}><RefreshCw size={15} />Regenerate</button>
            <button className="action-primary" disabled={section.status === "Approved" || !!busy} onClick={onApprove}><Check size={15} />Approve</button>
          </>
        )}
      </div>
      {showRegenerate && (
        <div className="regenerate-box">
          <input value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Optional direction for the Proposal Writer" />
          <button disabled={!!busy} onClick={() => { onRegenerate(instruction); setShowRegenerate(false); }}><Sparkles size={15} />Regenerate this section</button>
        </div>
      )}
      {section.sources.length > 0 && (
        <details className="sources">
          <summary>{section.sources.length} grounding source{section.sources.length === 1 ? "" : "s"}</summary>
          {section.sources.map((source) => (
            <article key={source.id}>
              <strong>{source.title}</strong>
              <span>{formatLabel(source.kind)} · {source.industry}</span>
              <p>{source.snippet}</p>
              <small>{source.sourceBlobName}</small>
            </article>
          ))}
        </details>
      )}
    </section>
  );
}

function RiskReview({
  proposal,
  busy,
  onNavigate,
  onAction,
}: {
  proposal: Proposal;
  busy: string;
  onNavigate: (sectionId: string) => void;
  onAction: (risk: RiskFinding, acknowledged: boolean, disposition?: string) => void;
}) {
  const [severity, setSeverity] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const filtered = proposal.riskFindings.filter(
    (item) =>
      (!severity || item.severity === severity) &&
      (!category || item.category === category) &&
      (!status || item.status === status),
  );
  const categories = [...new Set(proposal.riskFindings.map((item) => item.category))].sort();
  const severityCounts = proposal.riskFindings.reduce<Record<string, number>>(
    (result, item) => ({ ...result, [item.severity]: (result[item.severity] || 0) + 1 }),
    {},
  );
  return (
    <section className="risk-view">
      <div className="risk-summary">
        <div><strong>{proposal.riskFindings.length}</strong><span>Total findings</span></div>
        <div><strong>{severityCounts.High || 0}</strong><span>High priority</span></div>
        <div><strong>{proposal.requirementsAnalysis.openQuestions.length}</strong><span>Open questions</span></div>
        <div><strong>{proposal.requirementsAnalysis.missingInformation.length}</strong><span>Missing information</span></div>
      </div>
      <div className="risk-context">
        <div><h3>Open customer questions</h3>{proposal.requirementsAnalysis.openQuestions.length ? <ul>{proposal.requirementsAnalysis.openQuestions.map((item) => <li key={item}>{item}</li>)}</ul> : <p>None recorded.</p>}</div>
        <div><h3>Missing information</h3>{proposal.requirementsAnalysis.missingInformation.length ? <ul>{proposal.requirementsAnalysis.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No missing information recorded.</p>}</div>
      </div>
      <div className="risk-filters">
        <select value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="">All severities</option><option>High</option><option>Medium</option><option>Low</option></select>
        <select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option>Open</option><option>Acknowledged</option></select>
      </div>
      <div className="risk-list">
        {filtered.map((risk) => (
          <article key={risk.id} className={risk.status === "Acknowledged" ? "acknowledged" : ""}>
            <span className={`severity ${risk.severity.toLowerCase()}`}>{risk.severity}</span>
            <div>
              <div className="risk-heading"><small>{risk.category}</small><span>{risk.status}</span></div>
              <h3>{risk.description}</h3>
              <p><strong>Mitigation / question:</strong> {risk.mitigationOrQuestion}</p>
              {risk.relatedSectionIds.length > 0 && (
                <p className="related-links">
                  Related: {risk.relatedSectionIds.map((id) => <button key={id} onClick={() => onNavigate(id)}>{proposal.sections.find((section) => section.id === id)?.title || id}</button>)}
                </p>
              )}
              {risk.disposition && <p className="disposition"><strong>Disposition:</strong> {risk.disposition}</p>}
              <div className="risk-action">
                <input value={notes[risk.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [risk.id]: event.target.value }))} placeholder="Optional acknowledgment note" />
                <button disabled={busy === risk.id} onClick={() => onAction(risk, risk.status !== "Acknowledged", notes[risk.id])}>
                  {risk.status === "Acknowledged" ? "Reopen" : "Acknowledge"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AuditHistory({ items }: { items: AuditEvent[] }) {
  return (
    <section className="audit-view">
      <div className="audit-title"><History /><div><h2>Audit history</h2><p>Newest activity first. Browser actions are attributed to the demo user.</p></div></div>
      {items.length === 0 ? <div className="empty-state"><History /><h2>No audit events</h2></div> : (
        <div className="timeline">
          {items.map((item) => (
            <article key={item.id}>
              <span className="timeline-dot" />
              <div><strong>{item.summary}</strong><p>{formatLabel(item.eventType)} · {item.actorType === "user" ? "demo-user" : "system"}</p><time>{formatDate(item.createdAt)}</time></div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatLabel(value: string) {
  return value.replace(/[._-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export default App;
