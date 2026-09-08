import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type {
  AuditEvent,
  Citation,
  ContentLibraryEntry,
  ContentKind,
  DashboardSummary,
  DocumentMetadata,
  GenerationRun,
  Opportunity,
  OpportunityInput,
  Proposal,
  ProposalSection,
  ReusableContentInput,
  RetrievalPreview,
  ScenarioCategory
} from "@proposal-factory/contracts";
import { accessDeniedEvent, api, downloadExport, ReviewConflictError, UploadConnectionError } from "./api.js";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const scenarios: ScenarioCategory[] = [
  "Cloud modernization",
  "AI adoption",
  "Data platform modernization",
  "Application modernization",
  "Customer service transformation"
];
const contentKinds: ContentKind[] = [
  "Proposal Snippet",
  "Case Study",
  "Delivery Methodology",
  "Service Description",
  "Pricing Assumption"
];

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <BrandMark />
          <span>
            <strong>AI Proposal Factory</strong>
            <small>Professional Services Studio</small>
          </span>
        </Link>
        <nav aria-label="Primary navigation">
          <NavLink to="/">Opportunities</NavLink>
          <NavLink to="/library">Content library</NavLink>
          <NavLink to="/audit">Audit history</NavLink>
        </nav>
        <div className="profile">
          <span className="status-dot" /> Demo workspace
          <span className="avatar" aria-label="Workspace member">WM</span>
        </div>
      </header>
      <main>{children}</main>
      <footer>
        <span>AI Proposal Factory</span>
        <span>Human-reviewed · Grounded · Auditable</span>
      </footer>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="lede">{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

function LoadingState({ label = "Loading workspace" }: { label?: string }) {
  return (
    <div className="state-panel" role="status">
      <span className="spinner" />
      <strong>{label}</strong>
      <span>Preparing the latest proposal data.</span>
    </div>
  );
}

function ErrorState({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="state-panel error" role="alert">
      <span className="state-icon">!</span>
      <strong>Something needs attention</strong>
      <span>{error}</span>
      {retry && (
        <button className="button secondary" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge status-${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span>;
}

function DashboardPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>();
  const [summary, setSummary] = useState<DashboardSummary>();
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const scenario = searchParams.get("scenario") ?? "";
  const setFilter = (name: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    setSearchParams(next);
  };

  const load = () => {
    setError("");
    Promise.all([api.opportunities(), api.dashboard()])
      .then(([items, totals]) => {
        setError("");
        setOpportunities(items);
        setSummary(totals);
      })
      .catch((reason: Error) => setError(reason.message));
  };
  useEffect(load, []);

  const filtered = useMemo(
    () =>
      opportunities?.filter(
        (item) =>
          (!scenario || item.scenario === scenario) &&
          `${item.customerName} ${item.name} ${item.industry}`.toLowerCase().includes(query.toLowerCase())
      ) ?? [],
    [opportunities, query, scenario]
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="Opportunity portfolio"
        title="Turn qualified opportunities into review-ready proposals."
        description="Bring customer context, reusable knowledge, and human approvals into one transparent workflow."
        actions={
          <Link className="button primary" to="/opportunities/new">
            + New opportunity
          </Link>
        }
      />
      {error ? (
        <ErrorState error={error} retry={load} />
      ) : !opportunities || !summary ? (
        <LoadingState label="Loading opportunity portfolio" />
      ) : (
        <>
          <section className="metrics-grid" aria-label="Portfolio summary">
            <Metric label="Open opportunities" value={summary.opportunities.toString()} detail="Across five service scenarios" />
            <Metric label="Active pipeline" value={currency.format(summary.activeValue)} detail="Estimated engagement value" />
            <Metric label="In human review" value={summary.proposalsInReview.toString()} detail="Awaiting section approvals" />
            <Metric label="Approved" value={summary.approvedProposals.toString()} detail="Ready for export" />
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Customer opportunities</h2>
                <p>Select an opportunity to review intake, documents, retrieval, and proposal progress.</p>
              </div>
              <div className="filters">
                <label>
                  <span className="sr-only">Search opportunities</span>
                  <input
                    type="search"
                    placeholder="Search customer or opportunity"
                    value={query}
                    onChange={(event) => setFilter("q", event.target.value)}
                  />
                </label>
                <label>
                  <span className="sr-only">Filter by scenario</span>
                  <select value={scenario} onChange={(event) => setFilter("scenario", event.target.value)}>
                    <option value="">All scenarios</option>
                    {scenarios.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            {filtered.length === 0 ? (
              <div className="empty-state">
                <strong>No matching opportunities</strong>
                <span>Adjust your search or create a new opportunity.</span>
              </div>
            ) : (
              <div className="opportunity-list">
                {filtered.map((item) => (
                  <Link className="opportunity-row" to={`/opportunities/${item.id}`} key={item.id}>
                    <span className="customer-monogram">{item.customerName.slice(0, 2).toUpperCase()}</span>
                    <span className="opportunity-primary">
                      <strong>{item.name}</strong>
                      <small>
                        {item.customerName} · {item.industry}
                      </small>
                    </span>
                    <span>
                      <small>Estimated value</small>
                      <strong>{currency.format(item.estimatedValue)}</strong>
                    </span>
                    <span>
                      <small>Duration</small>
                      <strong>{item.expectedDurationWeeks} weeks</strong>
                    </span>
                    <span className="progress-cell">
                      <small>Proposal progress</small>
                      <span className="progress-track">
                        <span style={{ width: `${item.proposalProgress}%` }} />
                      </span>
                      <small>{item.proposalProgress}%</small>
                    </span>
                    <StatusBadge status={item.proposalStatus} />
                    <span className="row-arrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function IntakePage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    customerName: "",
    name: "",
    industry: "",
    estimatedValue: "350000",
    expectedDurationWeeks: "16",
    businessProblem: "",
    expectedOutcomes: "",
    scope: "",
    stakeholders: "",
    constraints: "",
    targetTimeline: "Q1 2027",
    budgetAssumptions: "",
    additionalNotes: "",
    scenario: scenarios[0]!
  });
  const field = (name: keyof typeof form, value: string) => setForm((current) => ({ ...current, [name]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const split = (value: string) => value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
    const input: OpportunityInput = {
      customerName: form.customerName,
      name: form.name,
      industry: form.industry,
      estimatedValue: Number(form.estimatedValue),
      expectedDurationWeeks: Number(form.expectedDurationWeeks),
      businessProblem: form.businessProblem,
      expectedOutcomes: split(form.expectedOutcomes),
      scope: form.scope,
      stakeholders: split(form.stakeholders),
      constraints: split(form.constraints),
      targetTimeline: form.targetTimeline,
      budgetAssumptions: form.budgetAssumptions,
      additionalNotes: form.additionalNotes,
      scenario: form.scenario
    };
    try {
      const opportunity = await api.createOpportunity(input);
      navigate(`/opportunities/${opportunity.id}`);
    } catch (reason) {
      setError((reason as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="page narrow">
      <PageHeader
        eyebrow="Opportunity intake"
        title="Capture the customer context once."
        description="Structured intake gives the proposal team a clear, auditable starting point."
        actions={
          <Link className="button ghost" to="/">
            Cancel
          </Link>
        }
      />
      <form className="form-panel" onSubmit={submit}>
        {error && <div className="inline-alert">{error}</div>}
        <FormSection title="Opportunity" description="Commercial and customer context for the dashboard.">
          <Field label="Customer name" required>
            <input value={form.customerName} onChange={(event) => field("customerName", event.target.value)} required />
          </Field>
          <Field label="Opportunity name" required>
            <input value={form.name} onChange={(event) => field("name", event.target.value)} required />
          </Field>
          <Field label="Industry" required>
            <input value={form.industry} onChange={(event) => field("industry", event.target.value)} required />
          </Field>
          <Field label="Service scenario" required>
            <select value={form.scenario} onChange={(event) => field("scenario", event.target.value)}>
              {scenarios.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="Estimated value (USD)" required>
            <input
              type="number"
              min="0"
              value={form.estimatedValue}
              onChange={(event) => field("estimatedValue", event.target.value)}
            />
          </Field>
          <Field label="Expected duration (weeks)" required>
            <input
              type="number"
              min="1"
              value={form.expectedDurationWeeks}
              onChange={(event) => field("expectedDurationWeeks", event.target.value)}
            />
          </Field>
        </FormSection>
        <FormSection title="Customer need" description="Describe the problem, outcomes, and intended engagement boundary.">
          <Field label="Business problem" wide required>
            <textarea
              rows={4}
              value={form.businessProblem}
              onChange={(event) => field("businessProblem", event.target.value)}
              required
            />
          </Field>
          <Field label="Expected outcomes" hint="Separate items with commas or new lines" wide>
            <textarea rows={3} value={form.expectedOutcomes} onChange={(event) => field("expectedOutcomes", event.target.value)} />
          </Field>
          <Field label="Scope" wide required>
            <textarea rows={4} value={form.scope} onChange={(event) => field("scope", event.target.value)} required />
          </Field>
        </FormSection>
        <FormSection title="Delivery context" description="Surface the assumptions that shape effort, risk, and governance.">
          <Field label="Stakeholders" hint="Separate items with commas or new lines">
            <textarea rows={3} value={form.stakeholders} onChange={(event) => field("stakeholders", event.target.value)} />
          </Field>
          <Field label="Constraints" hint="Separate items with commas or new lines">
            <textarea rows={3} value={form.constraints} onChange={(event) => field("constraints", event.target.value)} />
          </Field>
          <Field label="Target timeline" required>
            <input value={form.targetTimeline} onChange={(event) => field("targetTimeline", event.target.value)} required />
          </Field>
          <Field label="Budget or effort assumptions" required>
            <input
              value={form.budgetAssumptions}
              onChange={(event) => field("budgetAssumptions", event.target.value)}
              required
            />
          </Field>
          <Field label="Additional notes" wide>
            <textarea rows={3} value={form.additionalNotes} onChange={(event) => field("additionalNotes", event.target.value)} />
          </Field>
        </FormSection>
        <div className="form-actions">
          <span>Required fields are marked with *</span>
          <button className="button primary" disabled={saving}>
            {saving ? "Creating opportunity…" : "Create opportunity"}
          </button>
        </div>
      </form>
    </div>
  );
}

function FormSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <fieldset className="form-section">
      <legend>{title}</legend>
      <p>{description}</p>
      <div className="form-grid">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  hint,
  required,
  wide,
  children
}: {
  label: string;
  hint?: string;
  required?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={wide ? "field wide" : "field"}>
      <span>
        {label}
        {required && " *"}
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function OpportunityPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [opportunity, setOpportunity] = useState<Opportunity>();
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [retrieval, setRetrieval] = useState<RetrievalPreview>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectionRetry, setSelectionRetry] = useState<DocumentMetadata>();
  const [uploadKind, setUploadKind] = useState<DocumentMetadata["kind"]>("Meeting Notes");
  const [uploadState, setUploadState] = useState<{
    status: "idle" | "uploading" | "success" | "error";
    percent: number;
    message: string;
  }>({ status: "idle", percent: 0, message: "" });
  const documentQuery = searchParams.get("documentQuery") ?? "";
  const documentKind = searchParams.get("documentKind") ?? "";
  const setDocumentFilter = (name: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    setSearchParams(next);
  };

  const load = () => {
    setError("");
    Promise.all([api.opportunity(id), api.documents(id), api.retrievalPreviewEvidence(id)])
      .then(([item, docs, evidence]) => {
        setError("");
        setOpportunity(item);
        setDocuments(docs);
        setRetrieval(evidence);
      })
      .catch((reason: Error) => setError(reason.message));
  };
  useEffect(load, [id]);

  const toggleDocument = async (documentId: string) => {
    if (!opportunity) return;
    const selected = opportunity.selectedDocumentIds.includes(documentId)
      ? opportunity.selectedDocumentIds.filter((item) => item !== documentId)
      : [...opportunity.selectedDocumentIds, documentId];
    try {
      setError("");
      setOpportunity(await api.selectDocuments(opportunity.id, selected));
      if (selectionRetry?.id === documentId) setSelectionRetry(undefined);
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  const selectUploadedDocument = async (document: DocumentMetadata) => {
    if (!opportunity) return;
    const selected = [...new Set([...opportunity.selectedDocumentIds, document.id])];
    try {
      const updated = await api.selectDocuments(opportunity.id, selected);
      setOpportunity(updated);
      setSelectionRetry(undefined);
      setUploadState({
        status: "success",
        percent: 100,
        message: `${document.name} uploaded, text extracted, and selected.`
      });
    } catch (reason) {
      setSelectionRetry(document);
      setUploadState({
        status: "error",
        percent: 100,
        message: `${document.name} uploaded but not selected. ${(reason as Error).message}`
      });
    }
  };
  const upload = async (file?: File) => {
    if (!file || !opportunity) return;
    setBusy(true);
    setUploadState({ status: "uploading", percent: 0, message: `Uploading ${file.name}…` });
    try {
      const document = await api.uploadDocument(
        opportunity.id,
        file,
        uploadKind,
        (percent) => setUploadState({ status: "uploading", percent, message: `Uploading ${file.name}…` })
      );
      setDocuments((items) => [...items.filter((item) => item.id !== document.id), document]);
      await selectUploadedDocument(document);
    } catch (reason) {
      if (reason instanceof UploadConnectionError) {
        try {
          const latest = await api.documents(opportunity.id);
          setDocuments(latest);
          const persisted = latest
            .filter((document) =>
              document.source === "Upload" && document.name === file.name && document.sizeBytes === file.size
            )
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
          if (persisted) {
            await selectUploadedDocument(persisted);
            return;
          }
        } catch {
          // Preserve the original transport error when reconciliation cannot verify persistence.
        }
      }
      const message = (reason as Error).message;
      setUploadState({ status: "error", percent: 0, message });
    } finally {
      setBusy(false);
    }
  };
  const generate = async () => {
    if (!opportunity) return;
    setBusy(true);
    try {
      const run = await api.startGeneration(opportunity.id);
      navigate(`/opportunities/${opportunity.id}/generate/${run.id}`);
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  };

  if (error && !opportunity) return <div className="page"><ErrorState error={error} retry={load} /></div>;
  if (!opportunity) return <div className="page"><LoadingState label="Loading opportunity" /></div>;
  const filteredDocuments = documents.filter((document) =>
    (!documentKind || document.kind === documentKind) &&
    `${document.name} ${document.summary}`.toLowerCase().includes(documentQuery.toLowerCase())
  );
  return (
    <div className="page">
      <PageHeader
        eyebrow={`${opportunity.customerName} · ${opportunity.industry}`}
        title={opportunity.name}
        description={opportunity.businessProblem}
        actions={
          <>
            {opportunity.proposalStatus !== "Draft" && opportunity.proposalStatus !== "Generating" && (
              <Link className="button secondary" to={`/opportunities/${opportunity.id}/proposal`}>
                Open proposal
              </Link>
            )}
            <button className="button primary" onClick={generate} disabled={busy}>
              {busy ? "Preparing…" : opportunity.proposalStatus === "Draft" ? "Generate proposal" : "Regenerate proposal"}
            </button>
          </>
        }
      />
      {error && <div className="inline-alert">{error}</div>}
      <div className="detail-grid">
        <section className="panel span-2">
          <div className="panel-heading">
            <div>
              <h2>Opportunity brief</h2>
              <p>Human-entered opportunity facts and selected document metadata used to assemble the generation brief.</p>
            </div>
            <StatusBadge status={opportunity.proposalStatus} />
          </div>
          <div className="brief-grid">
            <BriefItem label="Expected outcomes" value={opportunity.expectedOutcomes.join(" · ")} />
            <BriefItem label="Scope" value={opportunity.scope} />
            <BriefItem label="Stakeholders" value={opportunity.stakeholders.join(", ")} />
            <BriefItem label="Constraints" value={opportunity.constraints.join(" · ")} />
            <BriefItem label="Target timeline" value={opportunity.targetTimeline} />
            <BriefItem label="Commercial assumption" value={opportunity.budgetAssumptions} />
          </div>
        </section>
        <aside className="panel commercial-card">
          <h2>Engagement profile</h2>
          <strong>{currency.format(opportunity.estimatedValue)}</strong>
          <span>Estimated value</span>
          <div><span>Duration</span><b>{opportunity.expectedDurationWeeks} weeks</b></div>
          <div><span>Scenario</span><b>{opportunity.scenario}</b></div>
          <div><span>Stage</span><b>{opportunity.status}</b></div>
        </aside>
      </div>
      <div className="detail-grid">
        <section className="panel span-2">
          <div className="panel-heading">
            <div>
              <h2>Documents and meeting notes</h2>
              <p>Open authenticated same-origin details, filter the list, and select evidence for requirements analysis.</p>
            </div>
            <div className="upload-controls">
              <select
                aria-label="Uploaded document type"
                value={uploadKind}
                onChange={(event) => setUploadKind(event.target.value as DocumentMetadata["kind"])}
                disabled={busy}
              >
                <option>Meeting Notes</option>
                <option>Requirements</option>
                <option>Project Brief</option>
                <option>Pricing</option>
              </select>
              <label className="button secondary file-button">
                {uploadState.status === "uploading" ? `${uploadState.percent}% uploaded` : "+ Add document"}
                <input
                  type="file"
                  accept=".txt,.md,.markdown,.docx,.pdf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void upload(file);
                  }}
                  disabled={busy}
                />
              </label>
            </div>
          </div>
          {uploadState.status !== "idle" && (
            <div className={`upload-status upload-${uploadState.status}`} role="status" aria-live="polite">
              <span>{uploadState.message}</span>
              {uploadState.status === "uploading" && (
                <span className="progress-track">
                  <span style={{ width: `${uploadState.percent}%` }} />
                </span>
              )}
              {selectionRetry && (
                <button className="button secondary" disabled={busy} onClick={() => void selectUploadedDocument(selectionRetry)}>
                  Retry selection
                </button>
              )}
            </div>
          )}
          <div className="document-filters">
            <input
              type="search"
              aria-label="Search documents and meeting notes"
              placeholder="Search documents and meeting notes"
              value={documentQuery}
              onChange={(event) => setDocumentFilter("documentQuery", event.target.value)}
            />
            <select
              aria-label="Filter documents by type"
              value={documentKind}
              onChange={(event) => setDocumentFilter("documentKind", event.target.value)}
            >
              <option value="">All document types</option>
              {(["Meeting Notes", "Requirements", "Project Brief", "Pricing"] as const).map((kind) =>
                <option key={kind}>{kind}</option>
              )}
            </select>
          </div>
          <div className="document-list">
            {filteredDocuments.map((document) => (
              <div className="document-row" key={document.id}>
                <input
                  aria-label={`Select ${document.name}`}
                  type="checkbox"
                  checked={opportunity.selectedDocumentIds.includes(document.id)}
                  onChange={() => void toggleDocument(document.id)}
                />
                <span className="document-icon">DOC</span>
                <Link to={`/opportunities/${opportunity.id}/documents/${document.id}`}>
                  <strong>{document.name}</strong>
                  <small>{document.summary}</small>
                  {document.source === "Upload" && document.extractionMethod && (
                    <small>
                      {document.extractionMethod} extraction · {document.extractedTextCharacters ?? 0} characters
                    </small>
                  )}
                </Link>
                <span>
                  <StatusBadge status={document.source} />
                  <small>{Math.ceil(document.sizeBytes / 1024)} KB</small>
                </span>
              </div>
            ))}
            {filteredDocuments.length === 0 && <div className="empty-state compact"><strong>No matching documents</strong></div>}
          </div>
        </section>
        <aside className="panel">
          <div className="panel-heading compact">
            <div>
              <h2>Retrieval preview</h2>
              <p>Evidence search performed before generation; it does not draft or alter proposal content.</p>
            </div>
          </div>
          {retrieval && (
            <div className="evidence-summary">
              <StatusBadge status={retrieval.mode} />
              <span>{retrieval.citations.length} evidence matches</span>
              {retrieval.warnings.map((warning) => <small key={warning}>{warning}</small>)}
            </div>
          )}
          <div className="source-stack">
            {retrieval?.citations.slice(0, 5).map((citation) => (
              <article key={citation.id}>
                <span>{Math.round(citation.relevance)}% match</span>
                <strong>{citation.title}</strong>
                <small>{citation.kind}</small>
              </article>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function BriefItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <p>{value || "Not yet supplied"}</p>
    </div>
  );
}

function DocumentDetailPage() {
  const { id = "", documentId = "" } = useParams();
  const [document, setDocument] = useState<DocumentMetadata>();
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    api.document(id, documentId)
      .then((item) => {
        setError("");
        setDocument(item);
      })
      .catch((reason: Error) => setError(reason.message));
  };
  useEffect(load, [documentId, id]);
  if (error && !document) return <div className="page narrow"><ErrorState error={error} retry={load} /></div>;
  if (!document) return <div className="page narrow"><LoadingState label="Loading document" /></div>;
  return (
    <div className="page narrow">
      <PageHeader
        eyebrow={`${document.kind} · ${document.source}`}
        title={document.name}
        description="Opened through the authenticated application API; no Blob, SAS, or storage URL is exposed."
        actions={<Link className="button secondary" to={`/opportunities/${id}`}>Back to opportunity</Link>}
      />
      <section className="panel detail-content">
        <div className="metadata-row">
          <StatusBadge status={document.storageProvider ?? "Application"} />
          <span>{document.contentType}</span>
          <span>{Math.ceil(document.sizeBytes / 1024)} KB</span>
          {document.extractionMethod && <span>{document.extractionMethod} extraction</span>}
        </div>
        <h2>Extracted document content</h2>
        <p>{document.extractedText ?? document.summary}</p>
      </section>
    </div>
  );
}

const stagePurpose: Record<GenerationRun["stages"][number]["key"], string> = {
  requirements: "Structures business goals, scope, stakeholders, constraints, success criteria, and open questions.",
  retrieval: "Finds relevant reusable organizational evidence before drafting.",
  drafting: "Builds the twelve proposal sections from the brief and retrieved evidence.",
  "risk-review": "Surfaces assumptions, dependencies, delivery risks, missing information, and customer questions."
};

function executionLabel(execution: GenerationRun["stages"][number]["execution"]) {
  if (execution === "deterministic") return "Deterministic fixture";
  if (execution === "model-backed") return "Azure model-backed";
  if (execution === "service-backed") return "Azure service-backed";
  return "Not executed";
}

function GenerationPage() {
  const { id = "", runId = "" } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState<GenerationRun>();
  const [error, setError] = useState("");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    const poll = async () => {
      try {
        const next = await api.generationRun(runId);
        if (!active) return;
        setRun(next);
        if (next.status === "Complete") {
          timer = setTimeout(() => navigate(`/opportunities/${id}/proposal`), 700);
        } else timer = setTimeout(poll, 850);
      } catch (reason) {
        if (active) setError((reason as Error).message);
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, navigate, runId]);

  return (
    <div className="page generation-page">
      <PageHeader
        eyebrow="Agent workflow"
        title="Building a grounded, review-ready proposal."
        description="Each stage reports its purpose and recorded execution evidence without inferring provider activity."
      />
      {error ? (
        <ErrorState error={error} />
      ) : !run ? (
        <LoadingState label="Starting proposal workflow" />
      ) : (
        <section className="generation-panel">
          <div className="generation-summary">
            <div className="orb"><BrandMark /></div>
            <div>
              <StatusBadge status={run.status} />
              <h2>{run.status === "Complete" ? "Proposal ready for review" : "Specialist agents are collaborating"}</h2>
              <p>
                {run.status === "Complete"
                  ? "All twelve sections, citations, and visible risk findings are ready."
                  : "Requirements, organizational knowledge, drafting, and risk review are progressing in sequence."}
              </p>
            </div>
            <strong>{run.progress}%</strong>
          </div>
          <div className="large-progress"><span style={{ width: `${run.progress}%` }} /></div>
          <ol className="stage-list">
            {run.stages.map((stage, index) => (
              <li className={`stage-${stage.status.toLowerCase()}`} key={stage.key}>
                <span>{stage.status === "Complete" ? "✓" : index + 1}</span>
                <div>
                  <strong>{stage.label}</strong>
                  <small>{stage.detail}</small>
                  <small>{stagePurpose[stage.key]}</small>
                  <small>{executionLabel(stage.execution)} · {stage.completedOperations} completed operation{stage.completedOperations === 1 ? "" : "s"}</small>
                </div>
                <StatusBadge status={stage.status} />
              </li>
            ))}
          </ol>
          <section className="provider-evidence">
            <h3>Recorded provider evidence</h3>
            <div className="metadata-row">
              <StatusBadge status={run.providerEvidence.provider} />
              <span>{run.providerEvidence.successfulModelOperations} model operations</span>
              <span>{run.providerEvidence.successfulRetrievalOperations} retrieval operations</span>
              <span>{run.providerEvidence.successfulEmbeddingOperations} embedding operations</span>
              <span>{run.providerEvidence.deterministicOperations} deterministic operations</span>
            </div>
            {run.providerEvidence.generationDeployment && <p>Generation deployment: {run.providerEvidence.generationDeployment}</p>}
            {run.providerEvidence.embeddingDeployment && <p>Embedding deployment: {run.providerEvidence.embeddingDeployment}</p>}
            {run.providerEvidence.searchIndex && <p>Search index: {run.providerEvidence.searchIndex}</p>}
            {run.retrieval.warnings.map((warning) => <p className="evidence-warning" key={warning}>{warning}</p>)}
            {run.providerEvidence.fallbacks.map((fallback) => <p className="evidence-warning" key={fallback}>{fallback}</p>)}
          </section>
          <div className="generation-note">
            <strong>Human control remains active.</strong>
            Generated content cannot be exported until every current section revision is approved.
          </div>
        </section>
      )}
    </div>
  );
}

function ProposalPage() {
  const { id = "" } = useParams();
  const [proposal, setProposal] = useState<Proposal>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [staleReview, setStaleReview] = useState(false);
  const [editingSections, setEditingSections] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"proposal" | "risks" | "sources">("proposal");

  const load = () => {
    setError("");
    setProposal(undefined);
    setEditingSections([]);
    setBusy("refresh");
    api.proposalForOpportunity(id).then((latest) => {
      setProposal(latest);
      setStaleReview(false);
    }).catch((reason: Error) => setError(reason.message)).finally(() => setBusy(""));
  };
  useEffect(load, [id]);
  const run = async (label: string, operation: () => Promise<Proposal>) => {
    setBusy(label);
    setError("");
    try {
      setProposal(await operation());
    } catch (reason) {
      if (reason instanceof ReviewConflictError) setStaleReview(true);
      setError((reason as Error).message);
    } finally {
      setBusy("");
    }
  };
  const approved = proposal?.sections.filter((section) => section.approvedRevisionId === section.currentRevisionId).length ?? 0;

  if (error && !proposal) return <div className="page"><ErrorState error={error} retry={load} /></div>;
  if (!proposal) return <div className="page"><LoadingState label="Loading proposal workspace" /></div>;
  return (
    <div className="page proposal-page">
      <PageHeader
        eyebrow="Proposal workspace"
        title={proposal.title}
        description="Review evidence, refine each section, and approve the exact revisions that will be exported."
        actions={
          <>
            <StatusBadge status={proposal.status} />
            <button
              className="button primary"
              disabled={approved !== proposal.sections.length || Boolean(busy) || staleReview || editingSections.length > 0 || proposal.status === "Approved"}
              onClick={() => void run("proposal", () => api.approveProposal(proposal.id, proposal.reviewVersion))}
            >
              {proposal.status === "Approved" ? "Proposal approved" : "Approve complete proposal"}
            </button>
          </>
        }
      />
      {error && <div className="inline-alert" role="alert">{error}</div>}
      {staleReview && <div className="inline-alert" role="alert">
        Approval was not applied. Refresh the proposal, then review the changed content before approving again.
        <button className="button secondary" disabled={Boolean(busy)} onClick={load}>Refresh proposal for review</button>
      </div>}
      <section className="review-toolbar">
        <div>
          <strong>{approved} of {proposal.sections.length} sections approved</strong>
          {editingSections.length > 0 && <span>Save or cancel edits before approving the complete proposal.</span>}
          <span className="progress-track"><span style={{ width: `${(approved / proposal.sections.length) * 100}%` }} /></span>
        </div>
        <div className="tabs" role="tablist" aria-label="Proposal views">
          {(["proposal", "risks", "sources"] as const).map((tab) => (
            <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
              {tab === "proposal" ? "Proposal sections" : tab === "risks" ? `Risks (${proposal.risks.length})` : `Sources (${proposal.citations.length})`}
            </button>
          ))}
        </div>
        <div className="export-actions">
          <button
            className="button secondary"
            disabled={proposal.status !== "Approved" || staleReview}
            onClick={() => void downloadExport(proposal.id, "markdown").catch((reason: Error) => setError(reason.message))}
          >
            Export Markdown
          </button>
          <button
            className="button secondary"
            disabled={proposal.status !== "Approved" || staleReview}
            onClick={() => void downloadExport(proposal.id, "pdf").catch((reason: Error) => setError(reason.message))}
          >
            Export PDF
          </button>
        </div>
      </section>
      {activeTab === "proposal" && (
        <div className="section-stack">
          {proposal.sections.map((section, index) => (
            <ProposalSectionCard
              key={`${section.key}-${section.currentRevisionId}`}
              index={index + 1}
              section={section}
              citations={proposal.citations}
              busy={staleReview ? "stale-review" : busy}
              onEditingChange={(editing) => setEditingSections((current) => editing
                ? [...new Set([...current, section.key])] : current.filter((key) => key !== section.key))}
              onSave={(content) => run(section.key, () => api.editSection(proposal.id, section.key, content))}
              onRegenerate={() => run(section.key, () => api.regenerateSection(proposal.id, section.key))}
              onApprove={() => run(section.key, () => api.approveSection(proposal.id, section.key, section.currentRevisionId))}
            />
          ))}
        </div>
      )}
      {activeTab === "risks" && (
        <section className="risk-grid">
          {proposal.risks.map((risk) => (
            <article className={`risk-card risk-${risk.severity.toLowerCase()}`} key={risk.id}>
              <div><StatusBadge status={risk.severity} /><span>{risk.category}</span></div>
              <h2>{risk.title}</h2>
              <p>{risk.description}</p>
              <strong>Recommended mitigation</strong>
              <p>{risk.mitigation}</p>
            </article>
          ))}
        </section>
      )}
      {activeTab === "sources" && (
        <section className="source-grid">
          {proposal.citations.map((citation) => (
            <article className="source-card" key={citation.id}>
              <div><StatusBadge status={citation.kind} /><strong>{Math.round(citation.relevance)}% relevance</strong></div>
              <h2>{citation.title}</h2>
              <p>{citation.excerpt}</p>
              <small>Source ID: {citation.contentId}</small>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function ProposalSectionCard({
  section,
  citations,
  index,
  busy,
  onEditingChange,
  onSave,
  onRegenerate,
  onApprove
}: {
  section: ProposalSection;
  citations: Citation[];
  index: number;
  busy: string;
  onEditingChange: (editing: boolean) => void;
  onSave: (content: string) => Promise<void>;
  onRegenerate: () => Promise<void>;
  onApprove: () => Promise<void>;
}) {
  const current = section.revisions.find((revision) => revision.id === section.currentRevisionId)!;
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(current.content);
  useEffect(() => setContent(current.content), [current.content]);
  const isApproved = section.approvedRevisionId === section.currentRevisionId;
  const sources = citations.filter((citation) => current.citationIds.includes(citation.id));
  return (
    <article className={`proposal-section ${isApproved ? "approved" : ""}`}>
      <div className="section-number">{index.toString().padStart(2, "0")}</div>
      <div className="section-body">
        <div className="section-heading">
          <div>
            <h2>{section.title}</h2>
            <span>Revision {current.revision} · {current.source}</span>
          </div>
          {isApproved ? <StatusBadge status="Approved" /> : <StatusBadge status="Pending approval" />}
        </div>
        {editing ? (
          <textarea className="section-editor" rows={12} value={content} onChange={(event) => setContent(event.target.value)} />
        ) : (
          <div className="section-content">
            {current.content.split("\n").map((line, lineIndex) => line ? <p key={lineIndex}>{line}</p> : <br key={lineIndex} />)}
          </div>
        )}
        {sources.length > 0 && (
          <div className="citation-row">
            <span>Grounded in</span>
            {sources.map((source) => <span key={source.id}>{source.title}</span>)}
          </div>
        )}
        <div className="section-actions">
          {editing ? (
            <>
              <button className="button ghost" onClick={() => { setEditing(false); onEditingChange(false); setContent(current.content); }}>Cancel</button>
              <button className="button secondary" disabled={Boolean(busy)} onClick={() => void onSave(content).then(() => { setEditing(false); onEditingChange(false); })}>
                Save revision
              </button>
            </>
          ) : (
            <>
              <button className="button ghost" disabled={Boolean(busy)} onClick={() => { setEditing(true); onEditingChange(true); }}>Edit</button>
              <button className="button ghost" disabled={Boolean(busy)} onClick={() => void onRegenerate()}>Regenerate</button>
              <button className="button secondary" disabled={isApproved || Boolean(busy)} onClick={() => void onApprove()}>
                {isApproved ? "Approved" : "Approve section"}
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function LibraryPage() {
  const [items, setItems] = useState<ContentLibraryEntry[]>();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const kind = searchParams.get("kind") ?? "";
  const scenario = searchParams.get("scenario") ?? "";
  const [error, setError] = useState("");
  const setFilter = (name: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    setSearchParams(next);
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      const parameters = new URLSearchParams();
      if (query) parameters.set("q", query);
      if (kind) parameters.set("kind", kind);
      if (scenario) parameters.set("scenario", scenario);
      api.content(parameters).then((results) => {
        setError("");
        setItems(results);
      }).catch((reason: Error) => setError(reason.message));
    }, 180);
    return () => clearTimeout(timer);
  }, [kind, query, scenario]);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Organizational knowledge"
        title="Reusable content library"
        description="Browse the same synthetic proposals, case studies, services, methods, and assumptions used by retrieval."
        actions={<Link className="button primary" to="/library/new">+ Add reusable content</Link>}
      />
      <section className="library-toolbar">
        <input type="search" placeholder="Search titles, tags, and content" value={query} onChange={(event) => setFilter("q", event.target.value)} />
        <select value={kind} onChange={(event) => setFilter("kind", event.target.value)}>
          <option value="">All content types</option>
          {contentKinds.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={scenario} onChange={(event) => setFilter("scenario", event.target.value)}>
          <option value="">All scenarios</option>
          {scenarios.map((item) => <option key={item}>{item}</option>)}
        </select>
      </section>
      {error ? <ErrorState error={error} /> : !items ? <LoadingState label="Searching reusable content" /> : items.length === 0 ? (
        <div className="empty-state panel"><strong>No reusable content matched</strong><span>Try a broader query or clear a filter.</span></div>
      ) : (
        <section className="library-grid">
          {items.map((item) => (
            <Link className="library-card" to={`/library/${item.id}`} key={item.id}>
              <div><StatusBadge status={item.kind} /><span>{item.scenario}</span></div>
              <h2>{item.title}</h2>
              <p>{item.summary}</p>
              <div className="tag-row">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <small>{item.indexing.message}</small>
              <small>Updated {new Date(item.updatedAt).toLocaleDateString()}</small>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}

function ContentDetailPage() {
  const { contentId = "" } = useParams();
  const [item, setItem] = useState<ContentLibraryEntry>();
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    api.contentItem(contentId).then((content) => {
      setError("");
      setItem(content);
    }).catch((reason: Error) => setError(reason.message));
  };
  useEffect(load, [contentId]);
  if (error && !item) return <div className="page narrow"><ErrorState error={error} retry={load} /></div>;
  if (!item) return <div className="page narrow"><LoadingState label="Loading reusable content" /></div>;
  return (
    <div className="page narrow">
      <PageHeader
        eyebrow={`${item.kind} · ${item.scenario}`}
        title={item.title}
        description={item.summary}
        actions={<Link className="button secondary" to="/library">Back to library</Link>}
      />
      <section className="panel detail-content">
        <div className="metadata-row">
          <StatusBadge status={item.indexing.retrievalIndex} />
          <span>{item.indexing.message}</span>
        </div>
        <div className="tag-row">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        <h2>Reusable content</h2>
        {item.body.split("\n").map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        <h2>Applicable industries</h2>
        <p>{item.industries.join(", ")}</p>
      </section>
    </div>
  );
}

function ContentCreatePage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState<ReusableContentInput>({
    title: "",
    kind: "Proposal Snippet",
    scenario: "Cloud modernization",
    industries: [],
    tags: [],
    summary: "",
    body: ""
  });
  const update = <K extends keyof ReusableContentInput>(key: K, value: ReusableContentInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api.createContent(input);
      navigate(`/library/${created.id}`);
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="page narrow">
      <PageHeader
        eyebrow="Organizational knowledge"
        title="Add reusable content"
        description="Create an immediately searchable local entry. Azure entries clearly report when AI Search ingestion is still pending."
      />
      {error && <div className="inline-alert" role="alert">{error}</div>}
      <form className="form-panel" onSubmit={(event) => void submit(event)}>
        <fieldset className="form-section">
          <legend>Content details</legend>
          <p>Use fictional, reusable Professional Services material.</p>
          <div className="form-grid">
            <Field label="Title" required wide><input required value={input.title} onChange={(event) => update("title", event.target.value)} /></Field>
            <Field label="Content type" required>
              <select value={input.kind} onChange={(event) => update("kind", event.target.value as ContentKind)}>
                {contentKinds.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Scenario" required>
              <select value={input.scenario} onChange={(event) => update("scenario", event.target.value as ScenarioCategory)}>
                {scenarios.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Industries" hint="Comma-separated" required>
              <input required value={input.industries.join(", ")} onChange={(event) => update("industries", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} />
            </Field>
            <Field label="Tags" hint="Comma-separated" required>
              <input required value={input.tags.join(", ")} onChange={(event) => update("tags", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} />
            </Field>
            <Field label="Summary" required wide><textarea required rows={3} value={input.summary} onChange={(event) => update("summary", event.target.value)} /></Field>
            <Field label="Content body" required wide><textarea required rows={12} value={input.body} onChange={(event) => update("body", event.target.value)} /></Field>
          </div>
        </fieldset>
        <div className="form-actions">
          <Link className="button secondary" to="/library">Cancel</Link>
          <button className="button primary" disabled={busy}>{busy ? "Creating…" : "Create content"}</button>
        </div>
      </form>
    </div>
  );
}

function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("opportunity") ?? "";
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api.audit(filter || undefined), api.opportunities()])
      .then(([history, items]) => { setError(""); setEvents(history); setOpportunities(items); })
      .catch((reason: Error) => setError(reason.message));
  }, [filter]);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Governance and traceability"
        title="Audit history"
        description="A chronological record of customer inputs, generated content, human changes, approvals, and exports."
        actions={
          <select
            aria-label="Filter audit by opportunity"
            value={filter}
            onChange={(event) => {
              const next = new URLSearchParams(searchParams);
              if (event.target.value) next.set("opportunity", event.target.value);
              else next.delete("opportunity");
              setSearchParams(next);
            }}
          >
            <option value="">All opportunities</option>
            {opportunities.map((item) => <option value={item.id} key={item.id}>{item.customerName} — {item.name}</option>)}
          </select>
        }
      />
      {error ? <ErrorState error={error} /> : !events ? <LoadingState label="Loading audit history" /> : events.length === 0 ? (
        <div className="empty-state panel">
          <strong>No activity yet</strong>
          <span>Create or generate an opportunity to start the audit trail.</span>
        </div>
      ) : (
        <section className="audit-timeline">
          {events.map((event) => (
            <article key={event.id}>
              <span className="timeline-dot" />
              <div>
                <div><StatusBadge status={event.type} /><time>{new Date(event.occurredAt).toLocaleString()}</time></div>
                <h2>{event.description}</h2>
                <p>By {event.actor} · Opportunity {event.opportunityId}</p>
                {Object.keys(event.metadata).length > 0 && (
                  <div className="metadata-row">
                    {Object.entries(event.metadata).map(([key, value]) => <span key={key}>{key}: {String(value)}</span>)}
                  </div>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

export function App() {
  const [accessState, setAccessState] = useState<"checking" | "authorized" | "unavailable" | 401 | 403>("checking");
  const [sessionMode, setSessionMode] = useState<"development" | "entra">();
  const verifyAccess = () => {
    setAccessState("checking");
    api.session()
      .then((session) => {
        setSessionMode(session.mode);
        setAccessState("authorized");
      })
      .catch(() => {
        // The request layer emits the exact 401/403 state. Non-auth failures remain retryable.
        setAccessState((current) => current === "checking" ? "unavailable" : current);
      });
  };
  useEffect(() => {
    const listener = (event: Event) => setAccessState((event as CustomEvent<401 | 403>).detail);
    window.addEventListener(accessDeniedEvent, listener);
    verifyAccess();
    return () => window.removeEventListener(accessDeniedEvent, listener);
  }, []);
  return (
    <AppLayout>
      {accessState === "checking" ? (
        <LoadingState label="Verifying workspace access" />
      ) : accessState === "unavailable" ? (
        <ErrorState error="Workspace access could not be verified." retry={verifyAccess} />
      ) : accessState === 401 || accessState === 403 ? (
        <div className="state-panel error" role="alert">
          <h1>{accessState === 401 ? "Sign-in required" : "Workspace access denied"}</h1>
          <p>{accessState === 401
            ? "Your session is missing or expired. Sign in using the application's Microsoft Entra authentication."
            : "Your account cannot access this workspace. Ask an administrator to verify your tenant and Workspace Member assignment."}</p>
          {sessionMode !== "development" && (
            <a className="button primary" href="/.auth/login/aad?post_login_redirect_uri=%2F">
              Sign in with Microsoft Entra ID
            </a>
          )}
          <button className="button secondary" onClick={verifyAccess}>
            Recheck access
          </button>
        </div>
      ) : <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/opportunities/new" element={<IntakePage />} />
        <Route path="/opportunities/:id" element={<OpportunityPage />} />
        <Route path="/opportunities/:id/documents/:documentId" element={<DocumentDetailPage />} />
        <Route path="/opportunities/:id/generate/:runId" element={<GenerationPage />} />
        <Route path="/opportunities/:id/proposal" element={<ProposalPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/library/new" element={<ContentCreatePage />} />
        <Route path="/library/:contentId" element={<ContentDetailPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>}
    </AppLayout>
  );
}
