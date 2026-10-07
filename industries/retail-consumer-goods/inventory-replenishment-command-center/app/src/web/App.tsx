import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionStatus, Investigation, Recommendation } from "../shared/contracts.js";
import type {
  AuditEntry,
  InventoryException,
  ReplenishmentAction,
} from "../shared/domain.js";
import {
  ApiRequestError,
  api,
  isConcurrencyError,
  isResetRequiredError,
  retryDelaySeconds,
  type ActionsResponse,
  type BootstrapResponse,
  type OverviewResponse,
  type SystemStatusResponse,
} from "./api.js";
import {
  filterByRisk,
  formatEuro,
  locationName,
  optionLabel,
  recommendedOption,
  riskLevel,
  type RiskFilter,
} from "./view-model.js";

type Page = "overview" | "workspace" | "history";
type AsyncState = "idle" | "loading" | "ready" | "error";

function StatusChip({ status }: { status: string }) {
  return <span className={`status-chip status-${status}`}>{status.replaceAll("-", " ")}</span>;
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice notice-error" role="alert">
      <div>
        <strong>We could not complete that request.</strong>
        <p>{message}</p>
      </div>
      {onRetry && <button onClick={onRetry}>Try again</button>}
    </div>
  );
}

function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-stack" aria-label="Loading content" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => <div className="skeleton" key={index} />)}
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  note: string;
  tone?: "neutral" | "risk" | "good";
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{note}</span>
    </article>
  );
}

function AppHeader({
  bootstrap,
  page,
  onNavigate,
  system,
}: {
  bootstrap: BootstrapResponse;
  page: Page;
  onNavigate: (page: Page) => void;
  system?: SystemStatusResponse;
}) {
  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">H&L</div>
        <div>
          <p>{bootstrap.company}</p>
          <span>Inventory & Replenishment Command Center</span>
        </div>
      </div>
      <nav aria-label="Primary navigation">
        {(["overview", "workspace", "history"] as Page[]).map((item) => (
          <button
            className={page === item ? "nav-active" : ""}
            aria-current={page === item ? "page" : undefined}
            key={item}
            onClick={() => onNavigate(item)}
          >
            {item === "workspace" ? "Workspace" : item[0]!.toUpperCase() + item.slice(1)}
          </button>
        ))}
      </nav>
      <div className="identity">
        <span className={`system-dot ${system?.status === "ok" ? "online" : ""}`} aria-hidden="true" />
        <div>
          <strong>{bootstrap.actor.name}</strong>
          <span>Unauthenticated · synthetic {bootstrap.actor.role}</span>
        </div>
      </div>
    </header>
  );
}

function PublicDemoBanner() {
  return (
    <div className="public-demo-banner" role="status">
      <strong>Public synthetic demo — no sign-in</strong>
      <span>State is shared with other visitors and can be reset. All workflow actions are simulated.</span>
    </div>
  );
}

function Overview({
  data,
  bootstrap,
  loading,
  error,
  filters,
  onFilters,
  onOpen,
  onRetry,
}: {
  data?: OverviewResponse;
  bootstrap: BootstrapResponse;
  loading: boolean;
  error?: string;
  filters: { storeId: string; category: string; risk: RiskFilter; minExposure: string };
  onFilters: (next: typeof filters) => void;
  onOpen: (id: string) => void;
  onRetry: () => void;
}) {
  const exceptions = filterByRisk(data?.exceptions ?? [], filters.risk);
  const excessSources = (data?.exceptions ?? []).filter((item) =>
    item.options.some((option) => option.type === "store-transfer" && option.feasible),
  ).length;

  return (
    <section className="page-shell" aria-labelledby="overview-title">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Monday planning pulse</span>
          <h1 id="overview-title">Availability exceptions</h1>
          <p>Prioritize projected risk, compare protected replenishment choices, and keep humans in control.</p>
        </div>
        <div className="mode-badge">Synthetic demo data</div>
      </div>

      {error && <ErrorNotice message={error} onRetry={onRetry} />}
      {loading && <Skeleton rows={2} />}
      {data && (
        <>
          <div className="metrics-grid">
            <MetricCard
              label="Stockout risks"
              value={data.metrics.stockoutRiskCount}
              note={`Below the ${bootstrap.settings.criticalCoverDays}-day threshold or inbound horizon`}
              tone="risk"
            />
            <MetricCard
              label="Projected revenue exposure"
              value={formatEuro(data.metrics.projectedRevenueExposureEur)}
              note="Scenario projection, not recovered revenue"
            />
            <MetricCard
              label="Active mitigations"
              value={data.metrics.activeActions}
              note="Proposed, approved, or in simulated transit"
              tone="good"
            />
            <MetricCard
              label="Protected donor options"
              value={excessSources}
              note="Feasible transfers after donor-cover constraints"
            />
          </div>

          <form className="filter-bar" onSubmit={(event) => event.preventDefault()}>
            <label>
              Store
              <select
                value={filters.storeId}
                onChange={(event) => onFilters({ ...filters, storeId: event.target.value })}
              >
                <option value="">All stores</option>
                {bootstrap.locations.filter((item) => item.type === "store").map((item) => (
                  <option value={item.id} key={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select
                value={filters.category}
                onChange={(event) => onFilters({ ...filters, category: event.target.value })}
              >
                <option value="">All categories</option>
                {["Knitwear", "Shirts", "Outerwear", "Trousers", "Accessories"].map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              Risk
              <select
                value={filters.risk}
                onChange={(event) => onFilters({ ...filters, risk: event.target.value as RiskFilter })}
              >
                <option value="all">All risk</option>
                <option value="critical">Critical · under 2 days</option>
                <option value="watch">Watch · 2+ days</option>
              </select>
            </label>
            <label>
              Minimum exposure
              <input
                type="number"
                min="0"
                step="100"
                value={filters.minExposure}
                onChange={(event) => onFilters({ ...filters, minExposure: event.target.value })}
                placeholder="€0"
              />
            </label>
          </form>

          <div className="table-card">
            <div className="table-heading">
              <div>
                <h2>Prioritized queue</h2>
                <p>{exceptions.length} exceptions match the current filters.</p>
              </div>
              <span>Ordered by deterministic priority score</span>
            </div>
            {exceptions.length === 0 ? (
              <div className="empty-state">
                <strong>No matching exceptions</strong>
                <p>Broaden the filters to see availability risks.</p>
              </div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Priority</th>
                      <th>Product / exact SKU</th>
                      <th>Store</th>
                      <th>Available</th>
                      <th>Cover</th>
                      <th>Exposure</th>
                      <th>Recommendation status</th>
                      <th><span className="sr-only">Open</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {exceptions.map((item, index) => (
                      <tr key={item.id} className={item.id === bootstrap.hero.exceptionId ? "hero-row" : ""}>
                        <td><span className="priority-number">{String(index + 1).padStart(2, "0")}</span></td>
                        <td>
                          <strong>{item.productName}</strong>
                          <span className="mono">{item.sku}</span>
                        </td>
                        <td>{locationName(bootstrap.locations, item.locationId)}</td>
                        <td>{item.available} units</td>
                        <td><StatusChip status={riskLevel(item)} /> <strong>{item.coverDays.toFixed(1)}d</strong></td>
                        <td>{formatEuro(item.projectedRevenueExposureEur)}</td>
                        <td>
                          <StatusChip status={recommendedOption(item.options) ? "action-ready" : "review"} />
                        </td>
                        <td><button className="text-button" onClick={() => onOpen(item.id)}>Investigate →</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function AiPanel({
  title,
  label,
  state,
  content,
  onRun,
  retrySeconds,
  disabled = false,
}: {
  title: string;
  label: string;
  state: AsyncState;
  content?: Investigation | Recommendation;
  onRun: () => void;
  retrySeconds: number;
  disabled?: boolean;
}) {
  const retrying = retrySeconds > 0;
  return (
    <article className="ai-card">
      <div className="ai-card-heading">
        <div>
          <span className="ai-label">Microsoft Foundry · {label}</span>
          <h3>{title}</h3>
        </div>
        <button
          onClick={onRun}
          disabled={disabled || state === "loading" || retrying}
          title={disabled ? "AI is available only for the public hero workflow." : undefined}
        >
          {state === "loading"
            ? "Running…"
            : retrying
              ? `Retry in ${retrySeconds}s`
              : content
                ? "Run again"
                : "Run AI"}
        </button>
      </div>
      {state === "loading" && <Skeleton rows={2} />}
      {state === "error" && (
        <p className="inline-error">
          {retrying
            ? `The shared public AI limit was reached. Try again in ${retrySeconds} seconds.`
            : "AI request failed. Deterministic evidence remains available."}
        </p>
      )}
      {content && (
        <div className={content.status === "unavailable" ? "ai-unavailable" : ""}>
          <StatusChip status={content.status} />
          <p>{content.summary}</p>
          {content.evidenceIds.length > 0 && (
            <div className="reference-list">
              <strong>Evidence references</strong>
              {content.evidenceIds.map((id) => <code key={id}>{id}</code>)}
            </div>
          )}
          {"caveats" in content && content.caveats.length > 0 && (
            <ul>{content.caveats.map((item) => <li key={item}>{item}</li>)}</ul>
          )}
          {"tradeoffs" in content && content.tradeoffs.length > 0 && (
            <ul>{content.tradeoffs.map((item) => <li key={item}>{item}</li>)}</ul>
          )}
        </div>
      )}
      {!content && state === "idle" && (
        <p className="muted">
          {disabled
            ? "AI is limited to the public hero workflow. Deterministic evidence remains available here."
            : "Run when ready. If Foundry is unavailable, the UI will say so without inventing output."}
        </p>
      )}
    </article>
  );
}

function Workspace({
  exception,
  bootstrap,
  actions,
  loading,
  error,
  investigation,
  recommendation,
  aiState,
  mutationState,
  message,
  onInvestigate,
  onRecommend,
  onCreate,
  onTransition,
  onRetry,
  aiRetrySeconds,
}: {
  exception?: InventoryException;
  bootstrap: BootstrapResponse;
  actions: ActionsResponse;
  loading: boolean;
  error?: string;
  investigation?: Investigation;
  recommendation?: Recommendation;
  aiState: { investigation: AsyncState; recommendation: AsyncState };
  mutationState: AsyncState;
  message?: string;
  onInvestigate: () => void;
  onRecommend: () => void;
  onCreate: (optionId: string) => void;
  onTransition: (action: ReplenishmentAction, status: ActionStatus) => void;
  onRetry: () => void;
  aiRetrySeconds: number;
}) {
  const activeAction = exception
    ? actions.actions.find((item) =>
        item.exceptionId === exception.id && !["rejected", "received"].includes(item.status))
    : undefined;
  const selected = exception
    ? exception.options.find((option) => option.id === recommendation?.selectedOptionId)
      ?? recommendedOption(exception.options)
    : undefined;
  const isHero = exception?.id === bootstrap.hero.exceptionId;
  const terminalAction = exception
    ? actions.actions.find((item) =>
        item.exceptionId === exception.id && ["rejected", "received"].includes(item.status))
    : undefined;
  const resetRequired = Boolean(terminalAction);

  if (loading) return <section className="page-shell"><Skeleton rows={6} /></section>;
  if (error) return <section className="page-shell"><ErrorNotice message={error} onRetry={onRetry} /></section>;
  if (!exception) return <section className="page-shell"><div className="empty-state">Choose an exception from Overview.</div></section>;

  return (
    <section className="page-shell workspace" aria-labelledby="workspace-title">
      <div className="workspace-hero">
        <div>
          <span className="eyebrow">Exact SKU investigation · {locationName(bootstrap.locations, exception.locationId)}</span>
          <h1 id="workspace-title">{exception.productName}</h1>
          <p className="mono">{exception.sku}</p>
        </div>
        <div className="hero-risk">
          <StatusChip status={riskLevel(exception)} />
          <strong>{exception.coverDays.toFixed(1)} days cover</strong>
          <span>{exception.available} available · {exception.dailyDemand.toFixed(0)}/day demand</span>
        </div>
      </div>

      {message && <div className="notice notice-info" role="status">{message}</div>}
      {!isHero && (
        <div className="notice notice-neutral" role="note">
          <div>
            <strong>Read-only public exception</strong>
            <p>Evidence and deterministic options remain available. Simulated mutations and AI are limited to the hero workflow.</p>
          </div>
        </div>
      )}
      {resetRequired && (
        <div className="notice notice-warning" role="status">
          <div>
            <strong>Reset required</strong>
            <p>This shared workflow ended as {terminalAction?.status}. Reset the shared demo before another simulated proposal.</p>
          </div>
        </div>
      )}

      <div className="workspace-grid">
        <div className="workspace-main">
          <article className="panel evidence-panel">
            <div className="panel-heading">
              <div><span className="section-index">01</span><h2>Evidence and risk horizon</h2></div>
              <span>Deterministic</span>
            </div>
            <div className="evidence-grid">
              {exception.evidence.map((item) => (
                <div key={item.id} className="evidence-item">
                  <span>{item.kind}</span>
                  <strong>{String(item.value)}</strong>
                  <p>{item.label}</p>
                </div>
              ))}
              <div className="evidence-item">
                <span>commercial</span>
                <strong>{formatEuro(exception.projectedRevenueExposureEur)}</strong>
                <p>Projected exposure before inbound</p>
              </div>
            </div>
            <p className="caveat">
              <strong>Evidence caveat:</strong> the local promotion is a demand signal, not proof that it caused sales.
            </p>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div><span className="section-index">02</span><h2>Option comparison</h2></div>
              <span>Policy calculations · not AI-generated</span>
            </div>
            <div className="option-grid">
              {exception.options.map((option) => (
                <article
                  className={`option-card ${option.id === selected?.id ? "option-selected" : ""} ${!option.feasible ? "option-infeasible" : ""}`}
                  key={option.id}
                >
                  <div className="option-topline">
                    <StatusChip status={option.feasible ? "feasible" : "not-feasible"} />
                    {option.id === selected?.id && <span className="recommended-tag">Best protected option</span>}
                  </div>
                  <h3>{optionLabel(option, bootstrap.locations)}</h3>
                  <div className="option-metrics">
                    <div><span>Quantity</span><strong>{option.quantity}</strong></div>
                    <div><span>Arrival</span><strong>Day {option.arrivalDay}</strong></div>
                    <div><span>Cost</span><strong>{formatEuro(option.costEur)}</strong></div>
                    <div><span>Dublin cover</span><strong>{option.projectedDestinationCoverDays.toFixed(1)}d</strong></div>
                    <div><span>Source cover</span><strong>{option.projectedSourceCoverDays?.toFixed(1) ?? "n/a"}{option.projectedSourceCoverDays !== null ? "d" : ""}</strong></div>
                  </div>
                  <ul className="constraint-list">
                    {option.constraints.map((constraint) => <li key={constraint}>{constraint}</li>)}
                  </ul>
                  {isHero &&
                    option.id === selected?.id &&
                    !activeAction &&
                    !resetRequired &&
                    option.feasible && (
                    <button
                      className="secondary-button"
                      disabled={mutationState === "loading"}
                      onClick={() => onCreate(option.id)}
                    >
                      Simulate proposal
                    </button>
                  )}
                </article>
              ))}
            </div>
          </article>

          <div className="ai-grid">
            <AiPanel
              title="Inventory Investigation"
              label="Grounded explanation"
              state={aiState.investigation}
              content={investigation}
              onRun={onInvestigate}
              retrySeconds={aiRetrySeconds}
              disabled={!isHero}
            />
            <AiPanel
              title="Replenishment Recommendation"
              label="Grounded tradeoffs"
              state={aiState.recommendation}
              content={recommendation}
              onRun={onRecommend}
              retrySeconds={aiRetrySeconds}
              disabled={!isHero}
            />
          </div>
        </div>

        <aside className="decision-rail" aria-label="Decision controls">
          <article className="decision-card">
            <span className="section-index">03</span>
            <h2>Simulated decision workflow</h2>
            {activeAction ? (
              <>
                <StatusChip status={activeAction.status} />
                <h3>{optionLabel(activeAction.option, bootstrap.locations)}</h3>
                <p>{activeAction.option.quantity} units · simulated operational request</p>
                {activeAction.status === "proposed" && (
                  <div className="button-stack">
                    <button
                      className="primary-button"
                      disabled={mutationState === "loading"}
                      onClick={() => onTransition(activeAction, "approved")}
                    >
                      Simulate approval
                    </button>
                    <button
                      className="danger-button"
                      disabled={mutationState === "loading"}
                      onClick={() => onTransition(activeAction, "rejected")}
                    >
                      Simulate rejection
                    </button>
                  </div>
                )}
                {activeAction.status === "approved" && (
                  <>
                    <div className="projection-callout">
                      <strong>Mitigation scheduled</strong>
                      <p>Approval reserves stock. It is not dispatch or receipt.</p>
                    </div>
                    <button
                      className="primary-button"
                      disabled={mutationState === "loading"}
                      onClick={() => onTransition(activeAction, "dispatched")}
                    >
                      Simulate dispatch
                    </button>
                  </>
                )}
                {activeAction.status === "dispatched" && (
                  <button
                    className="primary-button"
                    disabled={mutationState === "loading"}
                    onClick={() => onTransition(activeAction, "received")}
                  >
                    Simulate receipt
                  </button>
                )}
              </>
            ) : (
              <>
                <p>
                  {resetRequired
                    ? "The terminal workflow is retained in shared history. Reset is required before another proposal."
                    : isHero
                      ? "No active action. Simulate a feasible proposal to start the controlled workflow."
                      : "This public exception is read-only. Open the hero exception to use simulated actions."}
                </p>
              </>
            )}
          </article>
          <article className="decision-card projected">
            <span>Projected mitigation</span>
            <strong>{selected ? `${selected.quantity} units arriving day ${selected.arrivalDay}` : "No feasible option"}</strong>
            <p>Projection only. Actual state changes only after explicit simulated dispatch and receipt.</p>
          </article>
        </aside>
      </div>
    </section>
  );
}

function History({
  actions,
  bootstrap,
  loading,
  onReset,
}: {
  actions: ActionsResponse;
  bootstrap: BootstrapResponse;
  loading: boolean;
  onReset: () => void;
}) {
  const [confirmingReset, setConfirmingReset] = useState(false);
  const auditByAction = useMemo(() => {
    const groups = new Map<string, AuditEntry[]>();
    for (const entry of actions.audit) groups.set(entry.actionId, [...(groups.get(entry.actionId) ?? []), entry]);
    return groups;
  }, [actions.audit]);

  return (
    <section className="page-shell" aria-labelledby="history-title">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Traceable, simulated operations</span>
          <h1 id="history-title">Action history</h1>
          <p>Approval, dispatch, and receipt remain separate, attributable events.</p>
        </div>
        {!confirmingReset ? (
          <button
            className="danger-button"
            disabled={loading}
            onClick={() => setConfirmingReset(true)}
          >
            Reset shared demo state
          </button>
        ) : null}
      </div>
      {confirmingReset && (
        <div className="reset-confirmation" role="alert">
          <div>
            <strong>Clear shared synthetic actions and audit history?</strong>
            <p>This affects every visitor and restores the deterministic hero scenario.</p>
          </div>
          <div className="reset-confirmation-actions">
            <button
              className="danger-button"
              disabled={loading}
              onClick={() => {
                setConfirmingReset(false);
                onReset();
              }}
            >
              Confirm shared reset
            </button>
            <button
              className="secondary-button"
              disabled={loading}
              onClick={() => setConfirmingReset(false)}
            >
              Keep current state
            </button>
          </div>
        </div>
      )}
      <div className="simulation-banner">
        <strong>SIMULATED</strong>
        <span>No real stock movement, purchase order, or recovered revenue is created by this demo.</span>
      </div>
      {actions.actions.length === 0 ? (
        <div className="empty-state">
          <strong>No actions yet</strong>
          <p>Open the hero exception and propose the Cork-to-Dublin transfer.</p>
        </div>
      ) : actions.actions.map((action) => (
        <article className="history-card" key={action.id}>
          <div className="history-summary">
            <div>
              <StatusChip status={action.status} />
              <h2>{optionLabel(action.option, bootstrap.locations)}</h2>
              <p>{action.option.quantity} units · {action.option.sku}</p>
            </div>
            <span>Updated {new Date(action.updatedAt).toLocaleString("en-IE")}</span>
          </div>
          <ol className="timeline">
            {(auditByAction.get(action.id) ?? []).map((entry) => (
              <li key={entry.id}>
                <span className="timeline-dot" aria-hidden="true" />
                <div>
                  <strong>{entry.event}</strong>
                  <p>{entry.reason}</p>
                  <span>{entry.actor.name} · unauthenticated synthetic actor · {new Date(entry.at).toLocaleString("en-IE")}</span>
                </div>
              </li>
            ))}
          </ol>
        </article>
      ))}
    </section>
  );
}

export function App() {
  const [page, setPage] = useState<Page>("overview");
  const [bootstrap, setBootstrap] = useState<BootstrapResponse>();
  const [overview, setOverview] = useState<OverviewResponse>();
  const [exception, setException] = useState<InventoryException>();
  const [actions, setActions] = useState<ActionsResponse>({ actions: [], audit: [] });
  const [system, setSystem] = useState<SystemStatusResponse>();
  const [state, setState] = useState<AsyncState>("loading");
  const [workspaceState, setWorkspaceState] = useState<AsyncState>("idle");
  const [mutationState, setMutationState] = useState<AsyncState>("idle");
  const [error, setError] = useState<string>();
  const [workspaceError, setWorkspaceError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [investigation, setInvestigation] = useState<Investigation>();
  const [recommendation, setRecommendation] = useState<Recommendation>();
  const [aiRetrySeconds, setAiRetrySeconds] = useState(0);
  const [aiState, setAiState] = useState<{ investigation: AsyncState; recommendation: AsyncState }>({
    investigation: "idle",
    recommendation: "idle",
  });
  const [filters, setFilters] = useState({
    storeId: "",
    category: "",
    risk: "all" as RiskFilter,
    minExposure: "",
  });
  const overviewQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.storeId) params.set("storeId", filters.storeId);
    if (filters.category) params.set("category", filters.category);
    if (filters.minExposure) params.set("minExposureEur", filters.minExposure);
    return params.toString();
  }, [filters.storeId, filters.category, filters.minExposure]);
  const loadedOverviewQuery = useRef<string | undefined>(undefined);

  const loadActions = useCallback(async () => setActions(await api.actions()), []);

  const loadOverview = useCallback(async () => {
    setOverview(await api.overview(new URLSearchParams(overviewQuery)));
    loadedOverviewQuery.current = overviewQuery;
  }, [overviewQuery]);

  const initialize = useCallback(async () => {
    setState("loading");
    setError(undefined);
    try {
      const boot = await api.bootstrap();
      setBootstrap(boot);
      const [nextOverview, nextActions, nextSystem] = await Promise.all([
        api.overview(new URLSearchParams()),
        api.actions(),
        api.systemStatus(),
      ]);
      setOverview(nextOverview);
      loadedOverviewQuery.current = "";
      setActions(nextActions);
      setSystem(nextSystem);
      setState("ready");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The application could not start.");
      setState("error");
    }
  }, []);

  useEffect(() => { void initialize(); }, [initialize]);

  useEffect(() => {
    if (aiRetrySeconds <= 0) return;
    const timer = window.setTimeout(
      () => setAiRetrySeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [aiRetrySeconds]);

  useEffect(() => {
    if (!bootstrap || state !== "ready") return;
    if (loadedOverviewQuery.current === overviewQuery) return;
    const timer = window.setTimeout(() => {
      void loadOverview().catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "Filters could not be applied.");
      });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [bootstrap, loadOverview, overviewQuery, state]);

  const openException = useCallback(async (id: string) => {
    setPage("workspace");
    setWorkspaceState("loading");
    setWorkspaceError(undefined);
    setInvestigation(undefined);
    setRecommendation(undefined);
    setAiState({ investigation: "idle", recommendation: "idle" });
    try {
      setException(await api.exception(id));
      await loadActions();
      setWorkspaceState("ready");
    } catch (nextError) {
      setWorkspaceError(nextError instanceof Error ? nextError.message : "Exception could not be loaded.");
      setWorkspaceState("error");
    }
  }, [loadActions]);

  const refreshAfterConflict = useCallback(async (text: string) => {
    setMessage(`${text} The latest state has been refreshed; review it before trying again.`);
    if (exception) setException(await api.exception(exception.id));
    await Promise.all([loadActions(), loadOverview()]);
  }, [exception, loadActions, loadOverview]);

  const runAi = useCallback(async (kind: "investigation" | "recommendation") => {
    if (!exception || exception.id !== bootstrap?.hero.exceptionId || aiRetrySeconds > 0) return;
    setAiState((current) => ({ ...current, [kind]: "loading" }));
    try {
      if (kind === "investigation") setInvestigation(await api.investigate(exception.id));
      else setRecommendation(await api.recommend(exception.id));
      setAiState((current) => ({ ...current, [kind]: "ready" }));
    } catch (nextError) {
      const retrySeconds = retryDelaySeconds(nextError);
      if (retrySeconds) {
        setAiRetrySeconds(retrySeconds);
        setMessage(`Shared public AI limit reached. Both AI controls will be available in ${retrySeconds} seconds.`);
      }
      setAiState((current) => ({ ...current, [kind]: "error" }));
    }
  }, [aiRetrySeconds, bootstrap?.hero.exceptionId, exception]);

  const createAction = useCallback(async (optionId: string) => {
    if (!exception) return;
    setMutationState("loading");
    setMessage(undefined);
    try {
      await api.createAction(exception.id, optionId);
      setMessage("Simulated proposal created. Approval or rejection remains a separate explicit step.");
      await Promise.all([loadActions(), loadOverview()]);
      setMutationState("ready");
    } catch (nextError) {
      if (isResetRequiredError(nextError)) {
        await refreshAfterConflict("Reset is required before another simulated proposal.");
      } else if (isConcurrencyError(nextError)) {
        await refreshAfterConflict("Another update changed this exception.");
      }
      else setMessage(nextError instanceof ApiRequestError ? nextError.message : "Proposal failed.");
      setMutationState("error");
    }
  }, [exception, loadActions, loadOverview, refreshAfterConflict]);

  const transitionAction = useCallback(async (action: ReplenishmentAction, status: ActionStatus) => {
    setMutationState("loading");
    setMessage(undefined);
    try {
      const result = await api.transitionAction(action.id, status);
      setMessage(result.message);
      if (exception) {
        try {
          setException(await api.exception(exception.id));
        } catch (nextError) {
          if (!(nextError instanceof ApiRequestError && nextError.status === 404)) throw nextError;
          setMessage(`${result.message} The original exception is now resolved and no longer active.`);
        }
      }
      await Promise.all([loadActions(), loadOverview()]);
      setMutationState("ready");
    } catch (nextError) {
      if (isConcurrencyError(nextError)) await refreshAfterConflict("The action changed before this decision completed.");
      else setMessage(nextError instanceof Error ? nextError.message : "The status update failed.");
      setMutationState("error");
    }
  }, [exception, loadActions, loadOverview, refreshAfterConflict]);

  const reset = useCallback(async () => {
    setMutationState("loading");
    try {
      const result = await api.reset();
      setMessage(result.message);
      setException(undefined);
      setInvestigation(undefined);
      setRecommendation(undefined);
      await Promise.all([loadActions(), loadOverview()]);
      setPage("overview");
      setMutationState("ready");
    } catch (nextError) {
      if (isConcurrencyError(nextError)) await refreshAfterConflict("State changed before reset.");
      else setMessage(nextError instanceof Error ? nextError.message : "Reset failed.");
      setMutationState("error");
    }
  }, [loadActions, loadOverview, refreshAfterConflict]);

  if (!bootstrap) {
    return (
      <main className="startup" id="main-content" data-app-state={state}>
        <div className="startup-brand">H&L</div>
        <h1>Preparing the command center</h1>
        {state === "error" && error ? <ErrorNotice message={error} onRetry={() => void initialize()} /> : <Skeleton rows={3} />}
      </main>
    );
  }

  return (
    <div className="app" data-app-state={state}>
      <AppHeader bootstrap={bootstrap} page={page} onNavigate={setPage} system={system} />
      <PublicDemoBanner />
      <main id="main-content">
        {page === "overview" && (
          <Overview
            data={overview}
            bootstrap={bootstrap}
            loading={state === "loading"}
            error={error}
            filters={filters}
            onFilters={setFilters}
            onOpen={(id) => void openException(id)}
            onRetry={() => void initialize()}
          />
        )}
        {page === "workspace" && (
          <Workspace
            exception={exception}
            bootstrap={bootstrap}
            actions={actions}
            loading={workspaceState === "loading"}
            error={workspaceError}
            investigation={investigation}
            recommendation={recommendation}
            aiState={aiState}
            mutationState={mutationState}
            message={message}
            onInvestigate={() => void runAi("investigation")}
            onRecommend={() => void runAi("recommendation")}
            onCreate={(optionId) => void createAction(optionId)}
            onTransition={(action, next) => void transitionAction(action, next)}
            onRetry={() => void openException(bootstrap.hero.exceptionId)}
            aiRetrySeconds={aiRetrySeconds}
          />
        )}
        {page === "history" && (
          <History
            actions={actions}
            bootstrap={bootstrap}
            loading={mutationState === "loading"}
            onReset={() => void reset()}
          />
        )}
      </main>
      <footer>
        <span>Harbour & Lane · synthetic planning scenario</span>
        <span>Foundry: {system?.foundry ?? "checking"} · State: {system?.stateBackend ?? "checking"} · Operations: SIMULATED</span>
      </footer>
    </div>
  );
}
