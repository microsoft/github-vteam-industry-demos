import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Action, Activity, Attribution, Incident, Line, Metrics, Plan, State, Telemetry } from './types';
import './style.css';

const number = (n: number) => n.toLocaleString('en-US');
const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
const time = (s: string) => new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const sortIncidents = (a: Incident, b: Incident) => (a.state === 'Resolved' ? 1 : 0) - (b.state === 'Resolved' ? 1 : 0) ||
  severityOrder[a.severity] - severityOrder[b.severity] || b.downtime_minutes - a.downtime_minutes || b.timestamp.localeCompare(a.timestamp);
const calculate = (lines: Line[]): Metrics => {
  const sum = (f: (l: Line) => number) => lines.reduce((a, l) => a + f(l), 0);
  const planned = sum(l => l.planned_minutes), running = sum(l => l.planned_minutes - l.downtime_minutes);
  const output = sum(l => l.output), ideal = sum(l => (l.planned_minutes - l.downtime_minutes) * l.ideal_rate);
  const rejects = sum(l => l.rejects);
  const availability = planned ? running / planned : 0, performance = ideal ? output / ideal : 0, quality = output ? (output - rejects) / output : 0;
  return { availability, performance, quality, oee: availability * performance * quality, downtime: planned - running, output, rejects, target: sum(l => l.target) };
};

async function api<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST', signal: controller.signal,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail :
      response.status === 422 ? 'Some fields are invalid. Check required text, lengths and positive priorities.' : 'The request failed. Please try again.');
    return data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('The request timed out. Refresh to check saved demo state before retrying.');
    throw error;
  } finally { window.clearTimeout(timeout); }
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="11" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="18" width="7" height="3" rx="1" /></>,
    factories: <><path d="M3 21V9l6 3V8l6 4V3h5v18Z" /><path d="M7 16v2m5-2v2m5-2v2" /></>,
    incidents: <><path d="m12 3 10 18H2Z" /><path d="M12 9v5m0 3v.5" /></>,
    history: <><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v6l4 2" /></>,
    agents: <><rect x="4" y="6" width="16" height="15" rx="4" /><path d="M12 2v4M8 12h1m6 0h1m-8 5h8M1 11v5m22-5v5" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    spark: <><path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z" /></>,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
    menu: <path d="M3 6h18M3 12h18M3 18h18" />,
    bolt: <path d="m13 2-9 12h7l-1 8 10-13h-7Z" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.bolt}</svg>;
}
function Pill({ value }: { value: string }) {
  return <span className={`pill ${value.toLowerCase().replaceAll(' ', '-')}`}>{value}</span>;
}
function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><Icon name="search" size={30} /><h3>{title}</h3><p>{text}</p></div>;
}
function AttributionView({ value }: { value: Attribution }) {
  return <div className="attribution"><Icon name="agents" size={16} /><div><strong>Real Foundry response · {value.agent} v{value.version}</strong><span>{value.model} · {time(value.timestamp)}</span><code>{value.response_id}</code></div></div>;
}
function Trend({ records, compact = false }: { records: Telemetry[]; compact?: boolean }) {
  const values = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (!values.length) return <Empty title="No telemetry" text="No readings are available in this scope." />;
  const points = values.map((x, i) => `${20 + i * 460 / Math.max(values.length - 1, 1)},${128 - x.vibration_mm_s * 13}`).join(' ');
  return <div className={`trend ${compact ? 'compact' : ''}`}><svg viewBox="0 0 500 160" role="img" aria-label={`Vibration readings: ${values.map(x => `${x.vibration_mm_s} millimeters per second`).join(', ')}`}>
    <defs><linearGradient id={compact ? 'fade-sm' : 'fade'} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#168d7a" stopOpacity=".22" /><stop offset="100%" stopColor="#168d7a" stopOpacity="0" /></linearGradient></defs>
    {[30, 75, 120].map(y => <line key={y} x1="20" x2="480" y1={y} y2={y} stroke="#dfe6eb" strokeDasharray="4 4" />)}
    <polygon points={`20,140 ${points} 480,140`} fill={`url(#${compact ? 'fade-sm' : 'fade'})`} />
    <polyline points={points} fill="none" stroke="#087c69" strokeWidth="3" strokeLinejoin="round" />
    {values.map((x, i) => <circle key={x.id} cx={20 + i * 460 / Math.max(values.length - 1, 1)} cy={128 - x.vibration_mm_s * 13} r="4" fill="#087c69" stroke="white" strokeWidth="2" />)}
    <text x="20" y="157" fontSize="10" fill="#617084">{new Date(values[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</text>
    <text x="480" y="157" textAnchor="end" fontSize="10" fill="#617084">{new Date(values[values.length - 1].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</text>
  </svg><div className="chart-key"><i /> Measured synthetic vibration · mm/s</div></div>;
}
function ActivityList({ items, onSelect }: { items: Activity[]; onSelect?: (id: string) => void }) {
  return items.length ? <div className="timeline">{[...items].reverse().map(x =>
    <div className="timeline-item" key={x.id}><div className={`event-dot ${x.kind.includes('failed') ? 'error-dot' : ''}`} /><div>
      <div className="timeline-heading"><strong>{x.kind.replaceAll('_', ' ')}</strong><time dateTime={x.timestamp}>{time(x.timestamp)}</time></div>
      <p>{x.message}</p><small>{x.actor}{x.incident_id && <> · {onSelect ? <button className="text-button" onClick={() => onSelect(x.incident_id!)}>{x.incident_id}</button> : <span>{x.incident_id}</span>}</>}</small>
      {x.attribution && <span className="history-model">{x.attribution.agent} v{x.attribution.version} · {x.attribution.model} · {x.attribution.response_id}</span>}
    </div></div>)}</div> : <Empty title="No activity yet" text="Saved changes and real agent calls will appear here." />;
}

const pages = [
  ['dashboard', 'Overview'], ['factories', 'Factories & lines'], ['incidents', 'Incidents'],
  ['history', 'Activity history'], ['agents', 'AI agents'],
];
function route() {
  const parts = location.pathname.split('/').filter(Boolean);
  return { page: pages.some(x => x[0] === parts[0]) ? parts[0] : 'dashboard', id: parts[0] === 'incidents' ? parts[1] || null : null };
}

function App() {
  const [data, setData] = useState<State | null>(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState(route), [mobile, setMobile] = useState(false);
  const [site, setSite] = useState(''), [line, setLine] = useState('');
  const [health, setHealth] = useState(''), [search, setSearch] = useState('');
  const [severity, setSeverity] = useState(''), [status, setStatus] = useState('');
  const [clock, setClock] = useState(Date.now()), [receivedAt, setReceivedAt] = useState(Date.now()), [toast, setToast] = useState('');
  const inFlight = useRef(false);
  const refresh = useCallback(async (manual = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (manual) setRefreshing(true);
    try { setData(await api<State>('/state')); setReceivedAt(Date.now()); setError(''); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); setRefreshing(false); inFlight.current = false; }
  }, []);
  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    const tick = window.setInterval(() => setClock(Date.now()), 1000);
    const pop = () => setView(route());
    window.addEventListener('popstate', pop);
    return () => { clearInterval(poll); clearInterval(tick); window.removeEventListener('popstate', pop); };
  }, [refresh]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 6500); return () => clearTimeout(timer); } }, [toast]);
  const navigate = (page: string, id?: string) => {
    history.pushState({}, '', `/${page}${id ? `/${id}` : ''}`);
    setView({ page, id: id || null }); setMobile(false);
    if (!id) window.scrollTo(0, 0);
  };
  const done = async (message: string) => { setToast(message); await refresh(); };
  // Count down server-reported time rather than trusting the browser clock.
  const cooldown = Math.max(0, (data?.ai.cooldown_seconds || 0) - Math.floor((clock - receivedAt) / 1000));
  const activeJob = data?.ai.active_job ? data.jobs[data.ai.active_job] : null;
  const blocked = !!activeJob || cooldown > 0 || !!(data && data.ai.calls_today >= data.ai.daily_limit);
  const lines = data?.lines.filter(l => (!site || l.site_id === site) && (!line || l.id === line)) || [];
  const machines = data?.machines.filter(m => lines.some(l => l.id === m.line_id)) || [];
  const incidents = data?.incidents.filter(i => machines.some(m => m.id === i.machine_id)).sort(sortIncidents) || [];
  const selected = data?.incidents.find(i => i.id === view.id);
  const m = calculate(lines);
  const machineName = (id: string) => data?.machines.find(x => x.id === id)?.name || id;

  return <div className="app">
    {mobile && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobile(false)} />}
    <aside className={`sidebar ${mobile ? 'is-open' : ''}`}>
      <a className="brand" href="/dashboard" onClick={e => { e.preventDefault(); navigate('dashboard'); }}><span className="brand-mark"><Icon name="factories" size={25} /></span><div>FORGE<span>OPERATIONS INTELLIGENCE</span></div></a>
      <div className="workspace"><span className="workspace-icon">N</span><div>Northstar Manufacturing<small>Global operations workspace</small></div><span className="workspace-chevron">⌄</span></div>
      <p className="nav-label">COMMAND CENTER</p>
      <nav>{pages.map(([key, label]) => <a href={`/${key}`} className={view.page === key ? 'active' : ''} key={key} onClick={e => { e.preventDefault(); navigate(key); }}><Icon name={key} />{label}{key === 'incidents' && data && <b>{data.incidents.filter(i => i.state !== 'Resolved').length}</b>}</a>)}</nav>
      <div className="sidebar-bottom"><div className="connection"><i className={error ? 'offline' : ''} />{loading ? 'Connecting to local database' : error ? 'Connection needs attention' : 'Local demo database connected'}</div><div className="demo-tag"><Icon name="spark" size={16} /><div>SYNTHETIC DEMO<small>Real AI. Fictional operations.<br />Not an industrial safety system.<br />Local SQLite: refresh-safe; container restart/replacement may reset data and AI limits.</small></div></div><div className="operator"><span>DO</span><div>Demo operator<small>Shared, anonymous workspace</small></div></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobile(true)}><Icon name="menu" /></button><span>Workspace</span><span>/</span><strong>{pages.find(x => x[0] === view.page)?.[1]}</strong></div><div className="topbar-right"><span className="live-label"><i /> SYNTHETIC SHIFT</span><button className="icon-button" disabled={refreshing} onClick={() => void refresh(true)} aria-label="Refresh workspace"><Icon name="refresh" /></button><span className="avatar">DO</span></div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow">MANUFACTURING OPERATIONS / GLOBAL VIEW</div><h1>{({ dashboard: 'Operations overview', factories: 'Your production network', incidents: 'Incident command', history: 'Every action, accounted for.', agents: 'Intelligence, with accountability.' } as Record<string, string>)[view.page]}</h1><p>{({ dashboard: 'A clear view of production. A faster path from signal to action.', factories: 'Site to station. Understand the health behind your output.', incidents: 'Prioritize the disruption. Investigate the cause. Keep people in control.', history: 'A saved demo trail of decisions, AI responses and human review.', agents: 'Two real Foundry agents. One carefully controlled workflow.' } as Record<string, string>)[view.page]}</p></div><div className="snapshot"><span className="calendar-icon">15</span><div>Demo shift · 15 Oct 2026<small>06:00–14:00 UTC · Fixed synthetic snapshot</small></div></div></div>
        {error && <div className="alert error" role="alert"><Icon name="incidents" /><div><strong>Workspace could not be synchronized</strong><p>{error} {data && 'Displayed data may be stale. Avoid repeating saves until refreshed.'}</p></div><button onClick={() => void refresh(true)}>Retry</button></div>}
        {loading ? <div className="loading-screen" role="status"><div className="spinner" /><h2>Bringing your operations into focus</h2><p>Opening the local demo database…</p></div> : !data ? <Empty title="Workspace unavailable" text="The local demo database is required. Retry when it is available." /> : <>
          <div className="ai-strip"><span className={`strip-icon ${activeJob ? 'pulsing' : ''}`}><Icon name="spark" /></span><div><strong>{activeJob ? 'Foundry is investigating' : cooldown ? `Shared AI cooldown · ${cooldown}s` : data.ai.calls_today >= data.ai.daily_limit ? 'Daily demo AI budget reached' : 'From observation to informed action'}</strong><span>{activeJob ? activeJob.progress : 'Real agent responses. Qualified human review. No autonomous equipment control.'}</span></div><button className="text-button" onClick={() => navigate('agents')}>{data.ai.calls_today}/{data.ai.daily_limit} calls today <Icon name="arrow" size={16} /></button></div>
          {['dashboard', 'factories', 'incidents'].includes(view.page) && <div className="filters">
            <span className="filter-caption">VIEW SCOPE</span><label><span className="sr-only">Factory site</span><select value={site} onChange={e => { setSite(e.target.value); setLine(''); }}><option value="">All factory sites</option>{data.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label><span className="sr-only">Production line</span><select value={line} onChange={e => setLine(e.target.value)}><option value="">All production lines</option>{data.lines.filter(l => !site || l.site_id === site).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            {(site || line) && <button className="text-button" onClick={() => { setSite(''); setLine(''); }}>Clear scope</button>}
            <span className="scope-count">{lines.length} lines · {machines.length} machines</span>
          </div>}
          {view.page === 'dashboard' && <>
            <section className="kpi-grid" aria-label="Scoped shift key performance indicators">
              <div className="kpi primary-kpi"><span>Overall equipment effectiveness</span><div className="kpi-value">{percent(m.oee)}<Icon name="bolt" size={25} /></div><div className="kpi-note">OEE = availability × performance × quality</div><div className="mini-track"><i style={{ width: percent(m.oee) }} /></div></div>
              {([['Availability', m.availability, 'Scheduled time actually running'], ['Performance', m.performance, 'Actual / ideal running output'], ['Quality', m.quality, `${number(m.rejects)} units rejected`]] as const).map(([title, value, note]) => <div className="kpi" key={title}><span>{title}</span><div className="kpi-value">{percent(value)}</div><div className="kpi-note">{note}</div><div className="mini-track"><i style={{ width: percent(value) }} /></div></div>)}
            </section>
            <div className="dashboard-grid">
              <section className="panel production-panel"><div className="panel-heading"><div><span className="eyebrow">SHIFT PERFORMANCE</span><h2>Production, in perspective</h2></div><span className="small-badge">8-HOUR SHIFT</span></div><div className="production-totals"><div><small>Total output</small><strong>{number(m.output)} <span>units</span></strong></div><div><small>Shift target</small><strong>{number(m.target)}</strong></div><div><small>Line downtime</small><strong className="amber-text">{m.downtime} <span>min</span></strong></div></div>
                <div className="bar-chart">{lines.map(l => <div className="bar-row" key={l.id}><div><strong>{l.name}</strong><small>{data.sites.find(s => s.id === l.site_id)?.name}</small></div><div className="bar-track"><div className="bar-output" style={{ width: percent(l.output / l.target) }} /><span>{percent(l.output / l.target)}</span></div><span className="bar-amount">{number(l.output)}<small>/ {number(l.target)}</small></span></div>)}</div><div className="chart-key"><i /> Actual output <i className="target-key" /> Scheduled target · targets include downtime</div>
              </section>
              <section className="panel priority-panel"><div className="panel-heading"><div><span className="eyebrow">NEEDS YOUR ATTENTION</span><h2>Priority incident</h2></div><span className="alert-circle"><Icon name="incidents" /></span></div>{incidents.filter(i => i.state !== 'Resolved')[0] ? (() => { const i = incidents.filter(i => i.state !== 'Resolved')[0]; return <><div className="priority-meta"><Pill value={i.severity} /><span>{i.id}</span></div><h3>{i.title}</h3><p>{machineName(i.machine_id)}</p><div className="priority-impact"><strong>{i.downtime_minutes}<span> min</span></strong><span>Incident duration<br />Not additive to line downtime</span></div><p className="priority-notes">{i.notes}</p><button className="primary wide" onClick={() => navigate('incidents', i.id)}>Open investigation <Icon name="arrow" size={17} /></button></>; })() : <Empty title="No open incidents" text="There are no active incidents in this scope." />}</section>
              <section className="panel"><div className="panel-heading"><div><span className="eyebrow">EQUIPMENT SIGNAL</span><h2>{machines[0]?.name || 'Machine'} · vibration</h2></div><span className="small-badge">4 READINGS</span></div><Trend records={data.telemetry.filter(t => t.machine_id === machines[0]?.id)} /><p className="panel-footnote">Observed readings are signals, not a diagnosis. Open an investigation to review evidence.</p></section>
              <section className="panel"><div className="panel-heading"><div><span className="eyebrow">NETWORK PULSE</span><h2>Equipment health</h2></div><button className="text-button" onClick={() => navigate('factories')}>Explore <Icon name="arrow" size={15} /></button></div><div className="health-summary">{['Healthy', 'Attention', 'Critical'].map(h => <div key={h}><span className={`health-dot ${h.toLowerCase()}`} /><strong>{machines.filter(x => x.health === h).length}</strong><small>{h}</small></div>)}</div><div className="machine-tiles">{machines.map(x => <button key={x.id} title={`${x.name}: ${x.health}`} className={`machine-tile ${x.health.toLowerCase()}`} onClick={() => navigate('factories')}><Icon name="factories" size={18} /><span>{x.id.toUpperCase()}</span></button>)}</div><p className="panel-footnote">Current synthetic equipment flags · {machines.length} monitored machines</p></section>
            </div>
          </>}
          {view.page === 'factories' && <>
            <div className="section-toolbar"><h2>Production network <span className="count">{machines.length}</span></h2><label>Equipment health <select value={health} onChange={e => setHealth(e.target.value)}><option value="">All health statuses</option>{['Healthy', 'Attention', 'Critical'].map(h => <option key={h}>{h}</option>)}</select></label></div>
            {data.sites.filter(s => !site || s.id === site).map(s => {
              const scoped = lines.filter(l => l.site_id === s.id);
              if (!scoped.length) return null;
              return <section className="site-section" key={s.id}><div className="site-title"><span className="site-symbol"><Icon name="factories" /></span><div><h2>{s.name}</h2><p>{s.location} <span>·</span> {s.specialty}</p></div><span className="small-badge">{scoped.length} LINES</span></div>
                {scoped.map(l => {
                  const equipment = machines.filter(x => x.line_id === l.id && (!health || x.health === health));
                  return <div className="panel line-panel" key={l.id}><div className="line-heading"><h3>{l.name}</h3><div><span>OEE <strong>{percent(calculate([l]).oee)}</strong></span><span>Output <strong>{number(l.output)} / {number(l.target)}</strong></span><span>Downtime <strong>{l.downtime_minutes} min</strong></span></div></div>
                    {equipment.length ? <div className="machine-grid">{equipment.map(machine => <article className="machine-card" key={machine.id}><div className="machine-card-top"><span className="machine-glyph"><Icon name="bolt" /></span><Pill value={machine.health} /></div><small>{machine.id.toUpperCase()}</small><h3>{machine.name}</h3><div className="utilization"><span>Utilization</span><strong>{percent(machine.utilization)}</strong></div><div className="mini-track"><i style={{ width: percent(machine.utilization) }} /></div><dl><div><dt>Last maintenance</dt><dd>{time(machine.last_maintenance)}</dd></div><div><dt>Current alert</dt><dd className={machine.health !== 'Healthy' ? 'amber-text' : ''}>{machine.alert}</dd></div></dl>
                      <div className="machine-readings">{(() => { const t = data.telemetry.filter(t => t.machine_id === machine.id).at(-1); return t ? <><span>{t.temperature_c}°C<small>Temperature</small></span><span>{t.vibration_mm_s} mm/s<small>Vibration</small></span><span>{t.pressure_bar} bar<small>Pressure</small></span></> : null; })()}</div><button className="text-button" onClick={() => { const i = data.incidents.filter(i => i.machine_id === machine.id).sort(sortIncidents)[0]; if (i) navigate('incidents', i.id); }}>View incident <Icon name="arrow" size={15} /></button></article>)}</div> : <Empty title="No matching equipment" text="Choose a different equipment health filter." />}</div>;
                })}</section>;
            })}
          </>}
          {view.page === 'incidents' && <section className="panel incident-panel">
            <div className="incident-toolbar"><div className="search-field"><Icon name="search" size={18} /><input aria-label="Search incidents" placeholder="Search incident, fault or equipment…" value={search} onChange={e => setSearch(e.target.value)} /></div><select aria-label="Severity" value={severity} onChange={e => setSeverity(e.target.value)}><option value="">All severities</option>{['critical', 'high', 'medium', 'low'].map(s => <option key={s}>{s}</option>)}</select><select aria-label="Incident state" value={status} onChange={e => setStatus(e.target.value)}><option value="">All states</option>{['Open', 'Investigating', 'Action Planned', 'Resolved'].map(s => <option key={s}>{s}</option>)}</select></div>
            <div className="table-caption"><span>Active incidents ranked by severity, then duration</span><span>All timestamps shown in your local time</span></div>
            <div className="table-wrap"><table><thead><tr><th>Incident / equipment</th><th>Priority</th><th>Duration</th><th>State</th><th>Reported</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>{incidents.filter(i => (!severity || i.severity === severity) && (!status || i.state === status) && `${i.id} ${i.title} ${i.fault_code} ${machineName(i.machine_id)}`.toLowerCase().includes(search.toLowerCase())).map(i => <tr key={i.id}><td><button className="incident-link" onClick={() => navigate('incidents', i.id)}><small>{i.id} <span>· {i.fault_code}</span></small><strong>{i.title}</strong><span>{machineName(i.machine_id)}</span></button></td><td><Pill value={i.severity} /></td><td><strong>{i.downtime_minutes}</strong> <span className="muted">min</span></td><td><Pill value={i.state} /></td><td className="date-cell">{time(i.timestamp)}</td><td><button className="icon-button" aria-label={`Open ${i.id}`} onClick={() => navigate('incidents', i.id)}><Icon name="arrow" size={17} /></button></td></tr>)}</tbody></table></div>
            {!incidents.some(i => (!severity || i.severity === severity) && (!status || i.state === status) && `${i.id} ${i.title} ${i.fault_code} ${machineName(i.machine_id)}`.toLowerCase().includes(search.toLowerCase())) && <Empty title="No incidents match" text="Try clearing search or adjusting your filters." />}
          </section>}
          {view.page === 'history' && <section className="panel history-panel"><div className="panel-heading"><div><span className="eyebrow">LOCAL DEMO ACTIVITY TRAIL</span><h2>Workspace activity</h2></div><span className="small-badge">{data.activity.length} EVENTS</span></div><ActivityList items={data.activity} onSelect={id => navigate('incidents', id)} /></section>}
          {view.page === 'agents' && <>
            <div className="agent-grid">{data.ai.agents.map((agent, index) => <section className="panel agent-card" key={agent.key}><div className="agent-card-top"><span className="agent-icon"><Icon name={index === 0 ? 'search' : 'bolt'} size={27} /></span><Pill value={agent.last_call?.status === 'completed' ? 'Connected' : agent.last_call ? agent.last_call.status : 'Not yet called'} /></div><span className="eyebrow">FOUNDRY PROMPT AGENT · VERSION {agent.version}</span><h2>{agent.name}</h2><p>{index === 0 ? 'Turns incident observations and a handful of recent readings into evidence-linked hypotheses, uncertainty and focused questions.' : 'Uses the actual saved investigation to propose prioritized maintenance actions, owner roles, safety checks and prevention.'}</p><div className="agent-status"><strong>Actual application connectivity</strong><span>{!agent.last_call ? 'Not verified from this application. A real call is required.' : `${agent.last_call.status} · ${time(agent.last_call.started_at)}`}</span>{agent.last_call && <p>{agent.last_call.progress}</p>}</div>{agent.last_call?.attribution && <AttributionView value={agent.last_call.attribution} />}</section>)}</div>
            <section className="panel guardrails"><div><span className="eyebrow">PURPOSEFULLY CONSTRAINED</span><h2>AI assists. People decide.</h2><p>This is a public, shared synthetic demo, not an industrial safety system. Human reviews are anonymous self-attestations, not verified professional credentials. Never use these outputs to operate real equipment.</p></div><div className="guardrail-grid">{[['01', 'One shared lane', 'One active request across both agents. No expensive hidden queue.'], ['02', 'Respect the capacity', 'At least 65 seconds between calls, longer on service throttling. 12 attempts per UTC day.'], ['03', 'Nothing fabricated', 'Only completed, schema-valid real outputs are saved as recommendations. No mock fallback.'], ['04', 'Explicit human approval', 'Review and approve the current plan. Editing notes, actions or evidence invalidates approval.']].map(([n, title, text]) => <div key={n}><span>{n}</span><strong>{title}</strong><p>{text}</p></div>)}</div></section>
          </>}
          <footer>FORGE <span>Local demo database · Refresh-safe; may reset on container restart/replacement.</span><span>Synthetic data · Shared workspace · No machine control</span></footer>
        </>}
      </main>
    </div>
    {view.id && data && (selected ? <IncidentDrawer key={selected.id} item={selected} data={data} blocked={blocked} cooldown={cooldown} activeJob={activeJob?.id || null} close={() => navigate('incidents')} done={done} /> : <div className="drawer-overlay"><section className="drawer"><button onClick={() => navigate('incidents')}>Back to incidents</button><Empty title="Incident not found" text="Select an incident from the workspace." /></section></div>)}
    {toast && <div className="toast" role="status"><Icon name="check" />{toast}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><Icon name="close" size={16} /></button></div>}
  </div>;
}

type DrawerProps = { item: Incident; data: State; blocked: boolean; cooldown: number; activeJob: string | null; close: () => void; done: (message: string) => Promise<void> };
function IncidentDrawer({ item, data, blocked, cooldown, activeJob, close, done }: DrawerProps) {
  const [tab, setTab] = useState('overview'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [editor, setEditor] = useState(''), [reviewMode, setReviewMode] = useState('');
  const panel = useRef<HTMLElement>(null);
  const dialogState = useRef({ close, editor, reviewMode });
  dialogState.current = { close, editor, reviewMode };
  const machine = data.machines.find(m => m.id === item.machine_id)!;
  const line = data.lines.find(l => l.id === machine.line_id)!;
  const site = data.sites.find(s => s.id === line.site_id)!;
  const latestJob = Object.values(data.jobs).filter(j => j.incident_id === item.id).at(-1);
  const pending = activeJob ? data.jobs[activeJob] : null;
  const incidentPending = pending?.incident_id === item.id;
  const run = async (path: string, body: unknown, message: string) => {
    if (busy) return false;
    setBusy(true); setError('');
    try { await api(`/incidents/${item.id}/${path}`, body); await done(message); return true; }
    catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(false); }
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const keyboard = (e: KeyboardEvent) => {
      const current = dialogState.current;
      if (e.key === 'Escape' && !current.editor && !current.reviewMode) current.close();
      if (e.key === 'Tab') {
        const controls = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, textarea, select, [tabindex="0"]');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, []);
  const askAI = async (kind: string) => {
    const ok = await run(`ai/${kind}`, { revision: item.revision }, 'Real agent request accepted. Progress is saved; you can leave this panel.');
    if (ok) setTab(kind === 'investigation' ? 'investigation' : 'maintenance');
  };
  const next = ({ Open: 'Investigating', Investigating: 'Action Planned', 'Action Planned': 'Resolved' } as Record<string, string>)[item.state];
  const aiReason = pending ? 'Another AI job is running globally' : cooldown ? `Shared model cooldown: ${cooldown}s` : data.ai.calls_today >= data.ai.daily_limit ? 'Daily demo budget reached' : '';
  const disabledAI = busy || blocked || item.state === 'Resolved';

  return <div className="drawer-overlay"><button className="drawer-backdrop" aria-label="Close incident" onClick={close} /><section ref={panel} className="drawer" role="dialog" aria-modal="true" aria-labelledby="incident-title" tabIndex={-1}>
    <div className="drawer-top"><span className="eyebrow">INCIDENT WORKSPACE / {item.id}</span><button className="icon-button" aria-label="Close incident details" onClick={close}><Icon name="close" /></button></div>
    <div className="drawer-heading"><div className="detail-pills"><Pill value={item.severity} /><Pill value={item.state} /><span>{item.fault_code}</span></div><h2 id="incident-title">{item.title}</h2><p>{site.name} <span>/</span> {line.name} <span>/</span> {machine.name}</p></div>
    <div className="stepper">{['Open', 'Investigating', 'Action Planned', 'Resolved'].map((s, n, all) => <div className={all.indexOf(item.state) >= n ? 'reached' : ''} key={s}><span>{all.indexOf(item.state) > n ? <Icon name="check" size={12} /> : n + 1}</span><small>{s}</small></div>)}</div>
    <div className="detail-tabs" role="tablist" aria-label="Incident detail sections">{['overview', 'investigation', 'maintenance', 'activity'].map(t => <button key={t} role="tab" aria-selected={tab === t} aria-controls="detail-content" id={`tab-${t}`} className={tab === t ? 'selected' : ''} onClick={() => { setTab(t); setEditor(''); setReviewMode(''); }}>{t}{((t === 'investigation' && item.investigation) || (t === 'maintenance' && item.plan)) && <i />}</button>)}</div>
    <div className="drawer-content" id="detail-content" role="tabpanel" aria-labelledby={`tab-${tab}`}>
      <div className="safety-notice"><Icon name="incidents" size={17} /><span>Synthetic demo only. AI hypotheses are not verified diagnoses or safe-work instructions. Qualified personnel must validate all actions.</span></div>
      {error && <div className="alert error" role="alert"><p>{error}</p><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><Icon name="close" size={16} /></button></div>}
      {latestJob && <div className={`job-status ${latestJob.status}`} role="status">{latestJob.status === 'running' ? <div className="spinner small" /> : <Icon name={latestJob.status === 'completed' ? 'check' : 'incidents'} size={18} />}<div><strong>{latestJob.key === 'DOWNTIME' ? 'Investigation' : 'Maintenance'} · {latestJob.status}</strong><span>{latestJob.progress}</span></div></div>}
      {aiReason && <div className="cooldown-note"><Icon name="history" size={15} />{aiReason}. No request is queued.</div>}
      {tab === 'overview' && <>
        <div className="detail-stats"><div><small>Reported downtime</small><strong>{item.downtime_minutes}<span> min</span></strong></div><div><small>First observed</small><strong className="smaller">{time(item.timestamp)}</strong></div><div><small>Machine health</small><Pill value={machine.health} /></div></div>
        <section className="detail-section"><h3>Production impact</h3><p>{item.impact}</p></section>
        <section className="detail-section"><div className="section-toolbar"><h3>Operator observations</h3><button className="text-button" disabled={busy} onClick={() => setEditor(editor ? '' : 'notes')}>{editor === 'notes' ? 'Cancel editing' : 'Edit notes'}</button></div>{editor === 'notes' ? <NotesEditor item={item} busy={busy} save={async body => { if (await run('notes', body, 'Notes saved. Previous approval was invalidated.')) setEditor(''); }} /> : <blockquote>{item.notes}</blockquote>}</section>
        <section className="detail-section"><div className="section-toolbar"><h3>Recent equipment signal</h3><span className="small-badge">VIBRATION</span></div><Trend compact records={data.telemetry.filter(t => t.machine_id === item.machine_id)} /><div className="readings-table"><table><thead><tr><th>Time</th><th>Vibration</th><th>Temp.</th><th>Pressure</th><th>Fault</th></tr></thead><tbody>{data.telemetry.filter(t => t.machine_id === item.machine_id).map(t => <tr key={t.id}><td>{new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td>{t.vibration_mm_s} mm/s</td><td>{t.temperature_c} °C</td><td>{t.pressure_bar} bar</td><td>{t.fault_code || '—'}</td></tr>)}</tbody></table></div></section>
        <button className="primary wide" disabled={disabledAI} onClick={() => void askAI('investigation')}><Icon name="spark" size={18} />{item.investigation ? 'Run a new real investigation' : 'Investigate with AI'}<Icon name="arrow" size={17} /></button>
        <p className="help-text">One real call from the shared 12-call daily budget. A new investigation replaces previous evidence and invalidates its plan and approval on success.</p>
      </>}
      {tab === 'investigation' && (!item.investigation ? <div className="workflow-empty"><span className="workflow-icon"><Icon name="search" size={30} /></span><h3>Turn the signal into a hypothesis.</h3><p>The Downtime Investigation Agent will review this incident, bounded operator notes and three recent telemetry readings. Nothing is pre-generated.</p><button className="primary" disabled={disabledAI} onClick={() => void askAI('investigation')}><Icon name="spark" size={17} />Investigate with real AI</button></div> : <>
        <div className="result-heading"><span className="eyebrow">AI-GENERATED · UNVERIFIED HYPOTHESES</span><h3>{item.investigation.content.summary}</h3></div>
        <section className="detail-section"><h3>Supplied observations</h3><ul className="check-list">{item.investigation.content.facts.map((fact, n) => <li key={n}><Icon name="check" size={15} />{fact}</li>)}</ul></section>
        {item.investigation.content.hypotheses.map((h, n) => <section className="hypothesis" key={n}><div className="hypothesis-top"><span>HYPOTHESIS {n + 1}</span><strong>{percent(h.confidence)} confidence</strong></div><h3>{h.suspected_cause}</h3><div className="confidence-track"><i style={{ width: percent(h.confidence) }} /></div><h4>Evidence cited by the agent</h4><ul>{h.evidence.map((e, n) => <li key={n}>{e}</li>)}</ul><div className="uncertainty"><strong>What remains uncertain</strong><p>{h.uncertainty}</p></div></section>)}
        <section className="detail-section"><h3>Potential business impact</h3><p>{item.investigation.content.business_impact}</p></section>
        <section className="detail-section"><h3>Questions for your team</h3><ol className="questions">{item.investigation.content.questions.map((q, n) => <li key={n}>{q}</li>)}</ol></section>
        <AttributionView value={item.investigation.attribution} />
        {item.investigation_review ? <div className="human-review"><Icon name="check" /><div><strong>Human review recorded · {item.investigation_review.reviewer}</strong><p>{item.investigation_review.comment}</p><small>{time(item.investigation_review.timestamp)} · Anonymous demo self-attestation</small></div></div> : reviewMode === 'investigation' ? <ReviewForm item={item} busy={busy || incidentPending} mode="investigation" cancel={() => setReviewMode('')} save={async body => { if (await run('review', body, 'Human investigation review recorded.')) setReviewMode(''); }} /> : <button className="secondary wide" disabled={incidentPending} onClick={() => setReviewMode('investigation')}>Record qualified human review</button>}
        <button className="primary wide" disabled={disabledAI} onClick={() => void askAI('maintenance')}><Icon name="spark" size={17} />Generate maintenance plan<Icon name="arrow" size={17} /></button><p className="help-text">Uses this actual saved investigation. A hypothesis is not a confirmed cause.</p>
      </>)}
      {tab === 'maintenance' && (!item.plan ? <div className="workflow-empty"><span className="workflow-icon"><Icon name="bolt" size={30} /></span><h3>A plan with people in control.</h3><p>{item.investigation ? 'Generate a real maintenance recommendation from the saved investigation. Review every action before approval.' : 'Complete a real AI investigation first. The maintenance agent needs saved evidence, not a placeholder.'}</p><button className="primary" disabled={disabledAI || !item.investigation} onClick={() => void askAI('maintenance')}><Icon name="spark" size={17} />Generate real maintenance plan</button></div> : <>
        <div className="result-heading"><div className="section-toolbar"><span className="eyebrow">HUMAN-REVIEWABLE RECOMMENDATION</span><Pill value={item.approval ? 'Approved' : 'Review required'} /></div><h3>{item.plan.content.summary}</h3></div>
        {editor === 'plan' ? <PlanEditor item={item} busy={busy} cancel={() => setEditor('')} save={async body => { if (await run('plan', body, 'Plan saved. Explicit approval is required again.')) setEditor(''); }} /> : <>
          {[...item.plan.content.actions].sort((a, b) => a.priority - b.priority).map((action, n) => <article className="action-card" key={n}><div className="action-header"><span className="priority-number">P{action.priority}</span><div><span className="eyebrow">{action.urgency.replaceAll('_', ' ')}</span><h3>{action.action}</h3></div></div><dl><div><dt>Suggested owner role</dt><dd>{action.owner_role}</dd></div><div><dt>Expected benefit</dt><dd>{action.expected_benefit}</dd></div></dl><div className="safety-checks"><strong><Icon name="incidents" size={15} />Required safety review</strong><ul>{action.safety_checks.map((check, n) => <li key={n}>{check}</li>)}</ul></div></article>)}
          <section className="detail-section"><h3>Prevent the next disruption</h3><ul className="check-list">{item.plan.content.preventive_steps.map((x, n) => <li key={n}><Icon name="check" size={16} />{x}</li>)}</ul></section>
          <button className="secondary wide" disabled={busy} onClick={() => setEditor('plan')}>Edit & save maintenance actions</button>
        </>}
        <AttributionView value={item.plan.attribution} />{item.plan.edited && <p className="help-text">Original real-agent attribution retained. Current plan includes human edits.</p>}
        {item.approval ? <div className="human-review"><Icon name="check" /><div><strong>Explicitly approved by {item.approval.reviewer}</strong><p>{item.approval.comment}</p><small>{time(item.approval.timestamp)} · Anonymous demo self-attestation</small></div></div> : reviewMode === 'plan' ? <ReviewForm item={item} busy={busy || incidentPending} mode="plan" cancel={() => setReviewMode('')} save={async body => { if (await run('approve', body, 'Human plan approval saved. You may now advance the incident.')) setReviewMode(''); }} /> : <div className="approval-section"><strong>Approval is a human decision, never an AI result.</strong><p>{item.investigation_review ? 'Review the actions, owners, priorities, benefits and safety checks before explicitly approving.' : 'First record qualified human review in the Investigation tab.'}</p><button className="primary wide" disabled={!item.investigation_review || busy || !!editor || incidentPending} onClick={() => setReviewMode('plan')}><Icon name="check" size={17} />Review & explicitly approve plan</button></div>}
      </>)}
      {tab === 'activity' && <ActivityList items={data.activity.filter(x => x.incident_id === item.id)} />}
    </div>
    <div className="drawer-footer"><div><small>INCIDENT STATE</small><strong>{item.state}{item.approval && <span className="approval-dot" />}</strong></div>{next ? <button className="secondary" disabled={busy || incidentPending || (next !== 'Investigating' && !item.approval)} title={next !== 'Investigating' && !item.approval ? 'Review and explicitly approve the plan first' : ''} onClick={() => void run('state', { revision: item.revision, state: next }, `Incident moved to ${next}.`)}>{busy ? 'Saving…' : `Move to ${next}`}<Icon name="arrow" size={16} /></button> : <Pill value="Resolved" />}</div>
  </section></div>;
}

function NotesEditor({ item, busy, save }: { item: Incident; busy: boolean; save: (body: unknown) => Promise<void> }) {
  const [notes, setNotes] = useState(item.notes), [revision] = useState(item.revision);
  return <form className="edit-form" onSubmit={e => { e.preventDefault(); void save({ notes, revision }); }}><label>Operator notes<textarea value={notes} minLength={3} maxLength={1200} required rows={4} onChange={e => setNotes(e.target.value)} /></label><small>{notes.length}/1200 · AI receives only a bounded excerpt. Changes invalidate review and approval.</small><button className="primary" disabled={busy}>Save notes</button></form>;
}
function ReviewForm({ item, busy, mode, save, cancel }: { item: Incident; busy: boolean; mode: string; save: (body: unknown) => Promise<void>; cancel: () => void }) {
  const [reviewer, setReviewer] = useState(''), [comment, setComment] = useState(''), [checked, setChecked] = useState(false), [revision] = useState(item.revision);
  return <form className="edit-form review-form" onSubmit={e => { e.preventDefault(); void save({ reviewer, comment, qualified_review: checked, revision }); }}><h3>{mode === 'plan' ? 'Explicit human approval' : 'Qualified human investigation review'}</h3><p>This public demo records a self-attestation, not verified identity or authorization to operate equipment.</p><label>Reviewer display name (fictional only)<input value={reviewer} required minLength={2} maxLength={60} onChange={e => setReviewer(e.target.value)} placeholder="e.g. Demo maintenance lead" /></label><label>Review notes<textarea value={comment} required minLength={3} maxLength={400} rows={3} onChange={e => setComment(e.target.value)} placeholder="Record assumptions, limitations and review outcome…" /></label><label className="checkbox-label"><input type="checkbox" checked={checked} required onChange={e => setChecked(e.target.checked)} /><span>I explicitly acknowledge qualified human review is required, have reviewed this {mode === 'plan' ? 'plan including safety checks, and approve it for this synthetic demo only' : 'investigation and its uncertainty'}. This does not authorize real-world work.</span></label><div className="form-actions"><button type="button" className="secondary" onClick={cancel}>Cancel</button><button className="primary" disabled={busy || !checked}>{busy ? 'Saving…' : mode === 'plan' ? 'Explicitly approve this plan' : 'Save human review'}</button></div></form>;
}
function PlanEditor({ item, busy, save, cancel }: { item: Incident; busy: boolean; save: (body: unknown) => Promise<void>; cancel: () => void }) {
  const [plan, setPlan] = useState<Plan>(() => structuredClone(item.plan!.content)), [revision] = useState(item.revision);
  const updateAction = (index: number, patch: Partial<Action>) => setPlan(p => ({ ...p, actions: p.actions.map((a, n) => n === index ? { ...a, ...patch } : a) }));
  return <form className="edit-form" onSubmit={e => { e.preventDefault(); void save({ revision, summary: plan.summary, actions: plan.actions, preventive_steps: plan.preventive_steps }); }}>
    <div className="alert info"><p>Saving any edit invalidates prior approval. Drafts are not automatically saved. If another operator changes this incident, a conflict protects their changes.</p></div>
    <label>Plan summary<textarea value={plan.summary} minLength={3} maxLength={500} required rows={2} onChange={e => setPlan(p => ({ ...p, summary: e.target.value }))} /></label>
    {plan.actions.map((a, n) => <fieldset key={n}><legend>Action {n + 1}</legend><div className="form-row"><label>Priority (1–99)<input type="number" min={1} max={99} step={1} required value={a.priority} onChange={e => updateAction(n, { priority: Number(e.target.value) })} /></label><label>Urgency<select value={a.urgency} onChange={e => updateAction(n, { urgency: e.target.value as Action['urgency'] })}><option value="immediate_review">Immediate review</option><option value="planned">Planned</option></select></label></div><label>Action<textarea value={a.action} required minLength={3} maxLength={350} onChange={e => updateAction(n, { action: e.target.value })} /></label><label>Owner role<input value={a.owner_role} required minLength={2} maxLength={80} onChange={e => updateAction(n, { owner_role: e.target.value })} /></label><label>Expected benefit<textarea value={a.expected_benefit} required minLength={3} maxLength={250} onChange={e => updateAction(n, { expected_benefit: e.target.value })} /></label><label>Required safety checks (one per line; up to 4, 250 characters each)<textarea value={a.safety_checks.join('\n')} required maxLength={1003} rows={3} onChange={e => updateAction(n, { safety_checks: e.target.value.split('\n') })} /></label>{plan.actions.length > 1 && <button className="text-button danger-text" type="button" onClick={() => setPlan(p => ({ ...p, actions: p.actions.filter((_, index) => index !== n) }))}>Remove action</button>}</fieldset>)}
    {plan.actions.length < 4 && <button type="button" className="secondary" onClick={() => setPlan(p => ({ ...p, actions: [...p.actions, { priority: p.actions.length + 1, action: '', owner_role: '', urgency: 'planned', expected_benefit: '', safety_checks: [''] }] }))}>+ Add human action</button>}
    <label>Preventive steps (one per line; up to 4, 250 characters each)<textarea value={plan.preventive_steps.join('\n')} required maxLength={1003} rows={3} onChange={e => setPlan(p => ({ ...p, preventive_steps: e.target.value.split('\n') }))} /></label><div className="form-actions"><button type="button" className="secondary" onClick={cancel}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save revised plan'}</button></div>
  </form>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
