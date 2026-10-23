import { useEffect, useRef, useState } from 'react'
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Check, CheckCircle2,
  ChevronLeft, Clock3, Download, LayoutDashboard, LoaderCircle, Search,
  ShieldCheck, Sparkles, TriangleAlert, Users, Workflow, X,
} from 'lucide-react'
import type { Account, Detail, Envelope, HealthStatus, Plan, Risk, Segment, Summary } from './types'

const money = (n: number, compact = false) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: compact ? 'compact' : 'standard', maximumFractionDigits: 0,
}).format(n)
const date = (s: string) => new Date(s.length === 10 ? `${s}T00:00:00Z` : s).toLocaleDateString(
  'en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const stamp = (s: string) => new Date(s).toLocaleString('en-US', { timeZone: 'UTC' }) + ' UTC'
const days = (s: string) => Math.ceil((Date.parse(`${s}T00:00:00Z`) -
  Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')) / 86400000)
const labels: Record<Segment, string> = { healthy: 'Healthy', watchlist: 'Watchlist', high: 'High risk' }
const go = (path: string) => { window.location.hash = '/' + path }

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 125000)
  try {
    const response = await fetch('/api' + path, {
      ...options, signal: options.signal ?? controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
    if (!response.ok) {
      let message = `Request failed (HTTP ${response.status}).`
      try {
        const value = await response.json()
        message = typeof value.detail === 'string' ? value.detail :
          response.status === 422 ? 'Please check your inputs and field length limits.' : message
      } catch { /* Transport errors can return non-JSON bodies. */ }
      throw new Error(message)
    }
    return await response.json() as T
  } finally { window.clearTimeout(timer) }
}

function Badge({ segment }: { segment: Segment }) {
  return <span className={`badge ${segment}`}><span />{labels[segment]}</span>
}
function Avatar({ account, small = false }: { account: Account; small?: boolean }) {
  return <span className={`avatar ${small ? 'small' : ''}`}>{account.name.split(' ').map(s => s[0]).slice(0, 2).join('')}</span>
}
function BulletList({ items }: { items: string[] }) {
  return items.length ? <ul className="bullet-list">{items.map((s, i) => <li key={i}>{s}</li>)}</ul> :
    <p className="muted">None identified in the supplied evidence.</p>
}
function Provenance({ value }: { value: Envelope<Risk> | Envelope<Plan> }) {
  return <div className="provenance"><ShieldCheck size={15} /><div>
    <strong>Microsoft Foundry · {value.agent}</strong><span>{stamp(value.at)} · {value.model} · REST {value.api_version}</span>
    <code>Response {value.response_id}</code>
  </div></div>
}
function Chart({ values, weeks, large = false }: { values: number[]; weeks?: string[]; large?: boolean }) {
  const max = Math.max(...values, 1) * 1.16
  const height = 180
  const points = values.map((v, i) => `${20 + i * 560 / Math.max(values.length - 1, 1)},${height - 15 - v / max * 140}`)
  return <div className={`chart ${large ? 'large' : ''}`}>
    <svg viewBox="0 0 600 190" role="img" aria-label={`Weekly active users from ${values[0]} to ${values.at(-1)}. ${values.join(', ')}`}>
      <defs><linearGradient id={large ? 'fill-large' : 'fill-small'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4d9375" stopOpacity=".24" /><stop offset="100%" stopColor="#4d9375" stopOpacity=".015" />
      </linearGradient></defs>
      {[45, 90, 135, 175].map(y => <line key={y} x1="20" x2="580" y1={y} y2={y} stroke="#e4e9e6" strokeDasharray="4 5" />)}
      <polygon points={`20,175 ${points.join(' ')} 580,175`} fill={`url(#${large ? 'fill-large' : 'fill-small'})`} />
      <polyline points={points.join(' ')} fill="none" stroke="#2f7255" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => <g key={i}><circle cx={20 + i * 560 / Math.max(values.length - 1, 1)}
        cy={height - 15 - v / max * 140} r="4" fill="#fff" stroke="#2f7255" strokeWidth="2"><title>{v} weekly active users</title></circle></g>)}
    </svg>
    <div className="chart-axis">{values.map((_, i) => <span key={i}>{weeks ? date(weeks[i]).replace(/, \d{4}/, '') : `W${i + 1}`}</span>)}</div>
    <details className="chart-data"><summary>View chart data</summary><p>{values.map((v, i) => `${weeks ? date(weeks[i]) : `Week ${i + 1}`}: ${v}`).join(' · ')}</p></details>
  </div>
}

function Dashboard({ accounts }: { accounts: Summary[] }) {
  const total = accounts.reduce((n, s) => n + s.account.arr, 0)
  const high = accounts.filter(s => s.health.segment === 'high')
  const atRisk = high.reduce((n, s) => n + s.account.arr, 0)
  const upcoming = accounts.filter(s => days(s.account.renewal_date) >= 0 && days(s.account.renewal_date) <= 90)
    .sort((a, b) => a.account.renewal_date.localeCompare(b.account.renewal_date))
  const counts = (['healthy', 'watchlist', 'high'] as Segment[]).map(segment => ({
    segment, count: accounts.filter(s => s.health.segment === segment).length,
    arr: accounts.filter(s => s.health.segment === segment).reduce((n, s) => n + s.account.arr, 0),
  }))
  const weekly = Array.from({ length: 8 }, (_, i) => accounts.reduce((n, s) => n + s.account.weekly_active_users[i], 0))
  const growth = weekly[0] ? (weekly[7] / weekly[0] - 1) * 100 : 0
  const attention = [...accounts].sort((a, b) => a.health.score - b.health.score || a.account.renewal_date.localeCompare(b.account.renewal_date)).slice(0, 4)
  const healthyPercent = accounts.length ? counts[0].count / accounts.length * 100 : 0
  const watchPercent = accounts.length ? counts[1].count / accounts.length * 100 : 0
  return <>
    <section className="page-heading"><div><p className="eyebrow">YOUR CUSTOMER SUCCESS PULSE</p>
      <h1>Clarity today. Stronger renewals tomorrow.</h1><p className="muted">A connected view of customer health, revenue exposure, and what needs your attention.</p></div>
      <span className="date-pill"><Clock3 size={15} />{date(new Date().toISOString())} · UTC</span></section>
    <div className="kpi-grid">
      <Metric title="Total recurring revenue" value={money(total, true)} detail={`${accounts.length} fictional customer accounts`} icon={<BarChart3 size={19} />} />
      <Metric title="ARR at risk" value={money(atRisk, true)} detail={`${high.length} high-risk accounts · heuristic segment`} icon={<TriangleAlert size={19} />} warning />
      <Metric title="Healthy customers" value={`${counts[0].count}`} detail={`${Math.round(healthyPercent)}% of your portfolio`} icon={<ShieldCheck size={19} />} />
      <Metric title="Renewing in 90 days" value={money(upcoming.reduce((n, s) => n + s.account.arr, 0), true)}
        detail={`${upcoming.length} upcoming renewals`} icon={<Clock3 size={19} />} />
    </div>
    <div className="dashboard-charts">
      <section className="card"><div className="card-heading"><div><p className="eyebrow">ENGAGEMENT</p><h2>Portfolio usage trend</h2></div>
        <span className={`trend ${growth < 0 ? 'negative' : ''}`}>{growth < 0 ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}{Math.abs(growth).toFixed(1)}%</span></div>
        <div className="chart-number">{weekly[7].toLocaleString()} <span>weekly active users</span></div>
        <Chart values={weekly} weeks={accounts[0]?.account.usage_weeks} large />
      </section>
      <section className="card"><div className="card-heading"><div><p className="eyebrow">HEALTH DISTRIBUTION</p><h2>Know where you stand</h2></div><Activity size={19} /></div>
        <div className="health-chart"><div className="donut" role="img"
          aria-label={counts.map(c => `${labels[c.segment]}: ${c.count}`).join(', ')}
          style={{ background: `conic-gradient(#347b5b 0% ${healthyPercent}%, #d2a249 ${healthyPercent}% ${healthyPercent + watchPercent}%, #c77368 ${healthyPercent + watchPercent}% 100%)` }}>
          <div><strong>{accounts.length}</strong><span>accounts</span></div></div></div>
        <div className="health-legend">{counts.map(c => <div key={c.segment}><Badge segment={c.segment} /><span>{money(c.arr, true)}</span><strong>{c.count}</strong></div>)}</div>
        <p className="fine-print">Illustrative score bands, not a trained churn model.</p>
      </section>
    </div>
    <div className="bottom-grid">
      <section className="card"><div className="card-heading"><div><p className="eyebrow">FOCUS YOUR DAY</p><h2>Needs your attention</h2></div><button className="text-button" onClick={() => go('portfolio')}>View portfolio <ArrowRight size={15} /></button></div>
        {attention.map(({ account: a, health: h }) => <button key={a.id} className="attention-row" onClick={() => go(`account/${a.id}`)}>
          <Avatar account={a} small /><div className="grow"><strong>{a.name}</strong><span>{h.score < 50 ? 'Adoption is slipping' : a.support.critical_cases ? 'Support escalation open' : 'Review customer health'} · renewal in {days(a.renewal_date)} days</span></div>
          <div className="align-right"><strong>{money(a.arr, true)}</strong><Badge segment={h.segment} /></div><ArrowRight size={16} /></button>)}
      </section>
      <section className="card"><div className="card-heading"><div><p className="eyebrow">ON THE HORIZON</p><h2>Upcoming renewals</h2></div><Clock3 size={19} /></div>
        {upcoming.slice(0, 4).map(({ account: a, health: h }) => <button className="renewal-row" key={a.id} onClick={() => go(`account/${a.id}`)}>
          <span className={`status-dot ${h.segment}`} /><div className="grow"><strong>{a.name}</strong><span>{date(a.renewal_date)}</span></div><strong>{money(a.arr, true)}</strong><span className="day-tag">{days(a.renewal_date)}d</span></button>)}
        {!upcoming.length && <p className="empty">No renewals in the next 90 days.</p>}
      </section>
    </div>
  </>
}

function Metric({ title, value, detail, icon, warning = false }: {
  title: string; value: string; detail: string; icon: React.ReactNode; warning?: boolean
}) {
  return <section className={`metric ${warning ? 'warning' : ''}`}><div><span>{title}</span><span className="metric-icon">{icon}</span></div>
    <strong>{value}</strong><p>{detail}</p></section>
}

function Portfolio({ accounts, query, setQuery }: { accounts: Summary[]; query: string; setQuery: (s: string) => void }) {
  const [health, setHealth] = useState('all')
  const [owner, setOwner] = useState('all')
  const [plan, setPlan] = useState('all')
  const [sort, setSort] = useState('health')
  const visible = accounts.filter(s => {
    const a = s.account
    return `${a.name} ${a.owner} ${a.industry}`.toLowerCase().includes(query.toLowerCase()) &&
      (health === 'all' || s.health.segment === health) && (owner === 'all' || a.owner === owner) && (plan === 'all' || a.plan === plan)
  }).sort((a, b) => sort === 'arr' ? b.account.arr - a.account.arr :
    sort === 'name' ? a.account.name.localeCompare(b.account.name) :
    sort === 'renewal' ? a.account.renewal_date.localeCompare(b.account.renewal_date) :
    sort === 'adoption' ? a.account.seats_active / a.account.seats_licensed - b.account.seats_active / b.account.seats_licensed :
    a.health.score - b.health.score)
  return <>
    <section className="page-heading"><div><p className="eyebrow">EVERY CUSTOMER, ONE CLEAR VIEW</p><h1>Customer portfolio</h1><p className="muted">Find your next conversation. Prioritize by health, renewal timing, or revenue.</p></div><span className="date-pill"><Users size={16} />{accounts.length} accounts</span></section>
    <section className="card portfolio-card">
      <div className="filters">
        <label className="search-field"><Search size={17} /><span className="sr-only">Search customers</span><input placeholder="Search customer, owner, industry…" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <label><span>Health</span><select value={health} onChange={e => setHealth(e.target.value)}><option value="all">All health</option>{Object.entries(labels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label><span>Owner</span><select value={owner} onChange={e => setOwner(e.target.value)}><option value="all">All owners</option>{[...new Set(accounts.map(s => s.account.owner))].map(v => <option key={v}>{v}</option>)}</select></label>
        <label><span>Plan</span><select value={plan} onChange={e => setPlan(e.target.value)}><option value="all">All plans</option>{[...new Set(accounts.map(s => s.account.plan))].map(v => <option key={v}>{v}</option>)}</select></label>
        <label><span>Sort by</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="health">Health · lowest first</option><option value="arr">ARR · highest first</option><option value="renewal">Renewal · soonest</option><option value="name">Name · A–Z</option><option value="adoption">Adoption · lowest first</option></select></label>
      </div>
      <div className="table-meta"><span>{visible.length} of {accounts.length} customers · ARR in USD</span><button className="text-button" onClick={() => { setQuery(''); setHealth('all'); setOwner('all'); setPlan('all'); setSort('health') }}>Reset filters</button></div>
      <div className="table-scroll"><table><thead><tr><th scope="col">Customer</th><th scope="col">Health</th><th scope="col">ARR</th><th scope="col">Seat adoption</th><th scope="col">Renewal</th><th scope="col">CS owner</th><th scope="col"><span className="sr-only">Open customer</span></th></tr></thead>
        <tbody>{visible.map(({ account: a, health: h }) => <tr key={a.id}>
          <td><button className="customer-cell" onClick={() => go(`account/${a.id}`)}><Avatar account={a} small /><span><strong>{a.name}</strong><small>{a.plan} · {a.industry}</small></span></button></td>
          <td><Badge segment={h.segment} /><span className="score-small">{h.score}/100</span></td><td className="numeric">{money(a.arr)}</td>
          <td><div className="adoption-cell"><strong>{Math.round(a.seats_active / a.seats_licensed * 100)}%</strong><span>{a.seats_active}/{a.seats_licensed} seats</span><div className="mini-bar"><i style={{ width: `${a.seats_active / a.seats_licensed * 100}%` }} /></div></div></td>
          <td><strong>{date(a.renewal_date)}</strong><small>{days(a.renewal_date)} days</small></td><td><span className="owner-dot">{a.owner.split(' ').map(s => s[0]).join('')}</span>{a.owner}</td>
          <td><button className="icon-button" onClick={() => go(`account/${a.id}`)} aria-label={`Open ${a.name}`}><ArrowRight size={17} /></button></td>
        </tr>)}</tbody></table></div>
      {!visible.length && <div className="empty"><Search size={28} /><h3>No matching customers</h3><p>Try a different search or reset the filters.</p></div>}
    </section>
  </>
}

function Workspace({ detail, tab, busy, mutate, onExport }: {
  detail: Detail; tab: string; busy: string; mutate: (path: string, body?: object, method?: string) => Promise<boolean>
  onExport: () => void
}) {
  const a = detail.account, h = detail.health
  const [subject, setSubject] = useState('')
  const [email, setEmail] = useState('')
  const [planNotes, setPlanNotes] = useState('')
  const [notes, setNotes] = useState(a.notes)
  const [saved, setSaved] = useState('')
  useEffect(() => {
    setSubject(detail.edits.subject ?? detail.plan?.output.draft_outreach_email.subject ?? '')
    setEmail(detail.edits.body ?? detail.plan?.output.draft_outreach_email.body ?? '')
    setPlanNotes(detail.edits.notes ?? '')
    setSaved('')
  }, [a.id, detail.plan?.response_id])
  useEffect(() => { setNotes(a.notes) }, [a.id, a.notes])
  const plan = detail.plan?.output
  const risk = detail.risk?.output
  const working = !!busy
  const run = async (kind: string) => {
    if (kind === 'plan' && detail.plan && !window.confirm('Generate a new plan? This replaces the editable plan and resets its action approvals. Previous AI source outputs remain in SQLite history.')) return
    if (await mutate('/' + kind)) go(`account/${a.id}/ai`)
  }
  const savePlan = async () => {
    setSaved('')
    if (await mutate('/plan', { subject, body: email, notes: planNotes }, 'PATCH')) setSaved('Plan edits saved. No email was sent.')
  }
  const notesDirty = notes !== a.notes
  const planDirty = plan && (subject !== (detail.edits.subject ?? plan.draft_outreach_email.subject) ||
    email !== (detail.edits.body ?? plan.draft_outreach_email.body) || planNotes !== (detail.edits.notes ?? ''))
  return <>
    <button className="back-link" onClick={() => go('portfolio')}><ChevronLeft size={15} />Customer portfolio</button>
    <section className="workspace-heading"><Avatar account={a} /><div className="grow"><div className="title-row"><h1>{a.name}</h1><Badge segment={h.segment} /></div><p className="muted">{a.industry} <span className="separator">/</span> {a.region} <span className="separator">/</span> {a.plan} plan</p></div>
      <div className="heading-actions"><button className="button secondary" disabled={working || notesDirty || !!planDirty} onClick={() => run('risk')}><Sparkles size={16} />{busy === '/risk' ? 'Analyzing…' : 'Run risk analyst'}</button>
        <button className="button primary" disabled={working || !detail.risk || notesDirty || !!planDirty} onClick={() => run('plan')}><Workflow size={16} />{busy === '/plan' ? 'Building plan…' : detail.plan ? 'Regenerate plan' : 'Create retention plan'}</button></div></section>
    {!detail.risk && <p className="helper">Start with the real Foundry risk analyst; retention planning uses its stored analysis. No mock output is provided.</p>}
    {(notesDirty || planDirty) && <p className="notice">Unsaved edits. Save before running AI. Save before leaving this customer to retain your changes.</p>}
    {working && <div className="loading-banner" role="status"><LoaderCircle className="spin" size={17} />{busy === '/risk' || busy === '/plan' ? 'Calling the real Microsoft Foundry agent. This can take up to 110 seconds; please don’t start another run.' : 'Saving your changes…'}</div>}
    <nav className="tabs" aria-label="Customer workspace">
      {[['overview', 'Customer 360'], ['ai', 'AI insights & retention'], ['history', `Activity & history (${detail.history.length})`]].map(([key, title]) =>
        <button key={key} className={tab === key ? 'active' : ''} aria-current={tab === key ? 'page' : undefined} onClick={() => go(`account/${a.id}/${key}`)}>{title}{key === 'ai' && <Sparkles size={14} />}</button>)}
    </nav>
    {tab === 'overview' && <>
      <div className="kpi-grid compact">
        <Metric title="Annual recurring revenue" value={money(a.arr)} detail={`${a.plan} · annual agreement`} icon={<BarChart3 size={18} />} />
        <Metric title="Seat adoption" value={`${Math.round(a.seats_active / a.seats_licensed * 100)}%`} detail={`${a.seats_active} active / ${a.seats_licensed} licensed`} icon={<Users size={18} />} />
        <Metric title="Next renewal" value={`${days(a.renewal_date)} days`} detail={date(a.renewal_date)} icon={<Clock3 size={18} />} />
        <Metric title="Customer satisfaction" value={`${a.csat}/5`} detail={`${a.support.open_cases} open cases · ${a.support.critical_cases} critical`} icon={<Activity size={18} />} warning={a.support.critical_cases > 0} />
      </div>
      <div className="workspace-grid">
        <div className="stack">
          <section className="card"><div className="card-heading"><div><p className="eyebrow">PRODUCT ENGAGEMENT</p><h2>Usage & adoption</h2></div><span className="subtle-tag">Last 8 weeks</span></div>
            <div className="chart-number">{a.weekly_active_users[7]} <span>weekly active users</span></div><Chart values={a.weekly_active_users} weeks={a.usage_weeks} />
            <div className="feature-grid">{a.features.map(f => <div key={f.name}><div><span>{f.name}</span><strong>{f.adoption_percent}%</strong></div><div className="feature-track"><i style={{ width: `${f.adoption_percent}%` }} /></div></div>)}</div>
          </section>
          <section className="card"><div className="card-heading"><div><p className="eyebrow">CUSTOMER CONTEXT</p><h2>The story behind the signals</h2></div></div>
            <p className="body-copy">{a.context}</p><div className="sentiment-box"><span>RECENT SENTIMENT</span><p>“{a.sentiment}”</p></div>
            <div className="two-columns"><div><h3>Observed positive signals</h3><BulletList items={a.positive_evidence} /></div><div><h3>Evidence gaps</h3><BulletList items={a.missing_evidence} /></div></div>
            <label className="editor-label" htmlFor="account-notes">CSM context notes <span>Synthetic content only · supplied to future AI runs</span></label>
            <textarea id="account-notes" maxLength={4000} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add fictional context for the next success review…" />
            <div className="editor-footer"><span>{notes.length}/4,000</span><button className="button secondary" disabled={working || !notesDirty}
              onClick={() => mutate('', { notes }, 'PATCH')}>Save account notes</button></div>
          </section>
          <section className="card"><div className="card-heading"><div><p className="eyebrow">SUPPORT INTELLIGENCE</p><h2>Current support issues</h2></div><span className="subtle-tag">{a.support.open_cases} open cases total</span></div>
            {a.support.issues.map(issue => <article key={issue.id} className="support-issue"><div><span className={`priority ${issue.severity === 'critical' ? 'high' : 'medium'}`}>{issue.severity}</span><span className="muted">{issue.id} · opened {date(issue.opened_date)}</span></div><h3>{issue.title}</h3><p>{issue.detail}</p><small>{issue.status}</small></article>)}
            <p className="fine-print">Highlighted issue shown; total counts can include other routine cases.</p>
          </section>
        </div>
        <div className="stack">
          <section className="card score-card"><p className="eyebrow">EXPLAINABLE HEALTH</p><div className={`score-circle ${h.segment}`}><strong>{h.score}</strong><span>/ 100</span></div><Badge segment={h.segment} />
            <p className="score-disclaimer">{h.disclaimer}</p>
            <div className="score-components">{h.components.map(c => <div key={c.name}><div><strong>{c.name}</strong><span>{c.points}/{c.maximum}</span></div><div className="feature-track"><i style={{ width: `${c.points / c.maximum * 100}%` }} /></div><p>{c.evidence}</p></div>)}</div>
            <p className="fine-print">Sum of five components. Healthy ≥75 · Watchlist 50–74 · High risk &lt;50. Separate from the Foundry narrative.</p>
          </section>
          <section className="card"><p className="eyebrow">RELATIONSHIP & RENEWAL</p><h2>Account essentials</h2><dl className="essentials">
            <dt>Success owner</dt><dd>{a.owner}</dd><dt>Customer champion</dt><dd>{a.contact.name}<small>{a.contact.role} · {a.contact.email}</small></dd>
            <dt>Last touchpoint</dt><dd>{date(a.last_touchpoint)}</dd><dt>Contract started</dt><dd>{date(a.contract_start)}</dd><dt>Renewal date</dt><dd>{date(a.renewal_date)}</dd>
            <dt>Terms</dt><dd>{a.renewal_terms}</dd></dl></section>
        </div>
      </div>
    </>}
    {tab === 'ai' && <div className="stack">
      <div className="ai-notice"><Sparkles size={20} /><div><strong>Real agents. Evidence-led decisions. Human control.</strong><p>Foundry narratives are qualitative decision support, not trained churn predictions. Only fictional account evidence is sent. Nothing is automatically sent to customers or executed.</p></div></div>
      <section className="card"><div className="card-heading"><div><p className="eyebrow">AGENT 01 · CUSTOMER CHURN RISK ANALYST</p><h2>Understand what’s driving risk</h2></div>{risk && <Badge segment={risk.risk_level} />}</div>
        {!risk ? <div className="empty"><Sparkles size={29} /><h3>A clearer picture starts with evidence</h3><p>Run the risk analyst to examine adoption, support, sentiment, and renewal context.</p><button className="button primary" disabled={working || notesDirty || !!planDirty} onClick={() => run('risk')}>Run real Foundry analysis</button></div> : <>
          <p className="body-copy">{risk.explanation}</p>
          <div className="three-columns"><div><h3>Risk drivers</h3><BulletList items={risk.top_risk_drivers} /></div><div><h3>Positive signals</h3><BulletList items={risk.positive_signals} /></div><div><h3>Renewal concerns</h3><BulletList items={risk.renewal_concerns} /></div></div>
          <div className="confidence-box"><strong>Confidence: {risk.confidence.level}</strong><p>{risk.confidence.rationale}</p><h3>Limitations & missing evidence</h3><BulletList items={risk.confidence.limitations} /></div>
          <Provenance value={detail.risk!} />
        </>}
      </section>
      <section className="card"><div className="card-heading"><div><p className="eyebrow">AGENT 02 · RETENTION STRATEGY ADVISOR</p><h2>Turn insight into a success plan</h2></div>{plan && <button className="button secondary" disabled={working || !!planDirty} onClick={onExport}><Download size={16} />Download Markdown</button>}</div>
        {!plan ? <div className="empty"><Workflow size={30} /><h3>Your next-best actions, with a human in the loop</h3><p>{risk ? 'Use the actual stored risk analysis and current account context to build a practical plan.' : 'Run the risk analyst first. The advisor requires a real stored analysis; there is no fabricated fallback.'}</p>
          <button className="button primary" disabled={working || !risk || notesDirty} onClick={() => run('plan')}>Generate retention plan</button></div> : <>
          {detail.plan!.risk_response_id !== detail.risk?.response_id && <p className="notice">This plan uses an earlier risk analysis. Regenerate to use the latest analysis; regeneration resets approvals and edits.</p>}
          <p className="helper">Review each recommendation before accepting. “Complete” records your assertion only; this demo never executes an action.</p>
          <div className="recommendations">{plan.recommended_actions.map((action, i) => {
            const status = detail.action_states[String(i)]?.status ?? 'recommended'
            const state = detail.action_states[String(i)]
            return <article className={`recommendation ${status}`} key={i}><span className="action-number">{status === 'completed' ? <Check size={18} /> : String(i + 1).padStart(2, '0')}</span><div className="grow"><div className="action-title"><h3>{action.action}</h3><span className={`priority ${action.priority}`}>{action.priority}</span></div>
              <div className="action-meta"><span><Users size={13} />{action.owner_role}</span><span><Clock3 size={13} />{action.suggested_timeframe}</span></div><p>{action.rationale}</p>
              {state && <small className="action-timestamp">{status === 'completed' ? 'Completed' : 'Accepted'} {stamp((state.completed_at ?? state.accepted_at)!)}</small>}
            </div><button className={`button ${status === 'completed' ? 'done' : 'secondary'}`} disabled={working || status === 'completed'}
              onClick={() => mutate(`/actions/${i}`, { status: status === 'recommended' ? 'accepted' : 'completed' }, 'PATCH')}>
              {status === 'recommended' ? 'Accept action' : status === 'accepted' ? 'Mark complete' : <><CheckCircle2 size={15} />Completed</>}</button></article>
          })}</div>
          <h3 className="section-title">Your 30-day success roadmap</h3><div className="roadmap">{plan.plan_30_days.map((period, i) => <article key={i}><span className="roadmap-step">{i + 1}</span><span className="eyebrow">{period.period}</span><h3>{period.goal}</h3><BulletList items={period.actions} /></article>)}</div>
          <div className="two-columns plan-editors"><div><h3>Renewal talking points</h3><BulletList items={plan.renewal_talking_points} />
            <label className="editor-label" htmlFor="plan-notes">Human plan notes & adjustments</label><textarea id="plan-notes" rows={7} maxLength={6000} value={planNotes} onChange={e => { setPlanNotes(e.target.value); setSaved('') }} placeholder="Refine ownership, milestones, or the success criteria before your review…" /></div>
            <div><div className="title-row"><h3>Outreach draft</h3><span className="subtle-tag">Review required · never sent</span></div>
              <label className="editor-label" htmlFor="email-subject">Subject</label><input id="email-subject" maxLength={300} value={subject} onChange={e => { setSubject(e.target.value); setSaved('') }} />
              <label className="editor-label" htmlFor="email-body">Email body</label><textarea id="email-body" rows={12} maxLength={12000} value={email} onChange={e => { setEmail(e.target.value); setSaved('') }} /></div></div>
          <div className="save-bar"><span role="status">{saved || (planDirty ? 'You have unsaved plan changes.' : 'Changes persist on refresh while this container’s SQLite database survives.')}</span><button className="button primary" disabled={working || !planDirty} onClick={savePlan}>Save plan edits</button></div>
          <div className="confidence-box"><h3>Advisor limitations</h3><BulletList items={plan.limitations} /></div><Provenance value={detail.plan!} />
          <details className="source-json"><summary>View exact unedited Foundry source JSON</summary><pre>{JSON.stringify(detail.plan!.output, null, 2)}</pre></details>
        </>}
      </section>
    </div>}
    {tab === 'history' && <section className="card history-card"><p className="eyebrow">A TRACEABLE CUSTOMER JOURNEY</p><h2>Activity & decision history</h2><p className="muted">UTC timestamps · Public demo visitors are anonymous; actions are not attributed to named people.</p>
      {[...detail.history.map(e => ({ key: `event-${e.id}`, at: e.at, title: e.title, detail: e.detail, ai: true })),
        ...a.recent_activity.map((e, i) => ({ key: `seed-${i}`, at: `${e.date}T12:00:00Z`, title: e.title, detail: e.detail, ai: false }))]
        .sort((a, b) => b.at.localeCompare(a.at)).map(e => <article key={e.key} className="timeline-item"><span className="timeline-icon">{e.ai ? <CheckCircle2 size={17} /> : <Activity size={17} />}</span><div><small>{stamp(e.at)} · {e.ai ? 'Application event' : 'Seeded fictional activity'}</small><h3>{e.title}</h3><p>{e.detail}</p></div></article>)}
      <p className="fine-print">Latest 100 application events are displayed. Original AI run outputs are retained in SQLite; editable drafts are stored separately.</p>
    </section>}
  </>
}

export default function App() {
  const [route, setRoute] = useState(window.location.hash.slice(2) || 'overview')
  const [accounts, setAccounts] = useState<Summary[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [query, setQuery] = useState('')
  const parts = route.split('/')
  const isAccount = parts[0] === 'account'
  const accountId = isAccount ? parts[1] : ''
  const activeId = useRef(accountId)
  activeId.current = accountId
  const activeRequest = useRef(false)
  const tab = ['overview', 'ai', 'history'].includes(parts[2]) ? parts[2] : 'overview'
  const refresh = async () => {
    const [a, h] = await Promise.all([api<Summary[]>('/accounts'), api<HealthStatus>('/health')])
    setAccounts(a); setHealth(h)
  }
  useEffect(() => {
    const handler = () => { setRoute(window.location.hash.slice(2) || 'overview'); setError('') }
    window.addEventListener('hashchange', handler)
    refresh().catch(e => setError(e.message)).finally(() => setLoading(false))
    return () => window.removeEventListener('hashchange', handler)
  }, [])
  useEffect(() => {
    document.title = `${isAccount ? detail?.account.name ?? 'Customer' : route === 'portfolio' ? 'Portfolio' : 'Overview'} · Signal`
  }, [route, detail?.account.name])
  useEffect(() => {
    if (!accountId) return
    const controller = new AbortController()
    setDetail(null); setDetailLoading(true)
    api<Detail>(`/accounts/${encodeURIComponent(accountId)}`, { signal: controller.signal })
      .then(setDetail).catch(e => { if (!controller.signal.aborted) setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false) })
    return () => controller.abort()
  }, [accountId])
  const mutate = async (path: string, body: object = {}, method = 'POST') => {
    if (!detail || activeRequest.current) return false
    const id = detail.account.id
    activeRequest.current = true
    setBusy(path || 'account'); setError('')
    try {
      const updated = await api<Detail>(`/accounts/${encodeURIComponent(id)}${path}`, {
        method, body: JSON.stringify({ ...body, revision: detail.revision }),
      })
      if (activeId.current === id) setDetail(updated)
      await refresh()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The request failed. Please try again.')
      return false
    } finally { activeRequest.current = false; setBusy('') }
  }
  const reload = async () => {
    setError(''); setLoading(true)
    try { await refresh(); if (accountId) setDetail(await api<Detail>(`/accounts/${encodeURIComponent(accountId)}`)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Reload failed.') }
    finally { setLoading(false) }
  }
  const download = async () => {
    if (!detail) return
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(detail.account.id)}/export`)
      if (!response.ok) throw new Error('Export failed. Generate and save a plan first.')
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = `${detail.account.id}-success-plan.md`
      anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed.') }
  }
  const validRoute = isAccount || route === 'overview' || route === 'portfolio'
  return <div className="app">
    <a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus() }}>Skip to main content</a>
    <aside className="sidebar"><a className="brand" href="#/overview"><span className="brand-mark"><Activity size={24} /></span><span>signal<span>customer success intelligence</span></span></a>
      <p className="nav-label">WORKSPACE</p><nav aria-label="Main navigation">
        <a href="#/overview" className={route === 'overview' ? 'active' : ''} aria-current={route === 'overview' ? 'page' : undefined}><LayoutDashboard size={19} />Executive overview</a>
        <a href="#/portfolio" className={route === 'portfolio' || isAccount ? 'active' : ''} aria-current={route === 'portfolio' ? 'page' : undefined}><Users size={19} />Customer portfolio<span className="nav-count">{accounts.length || '—'}</span></a>
      </nav><div className="sidebar-note"><span className="sidebar-spark"><Sparkles size={20} /></span><strong>From signals to next steps.</strong><p>Two real Foundry agents. Evidence-based guidance. Your team stays in control.</p></div>
      <div className="sidebar-bottom"><div className="system-status"><span className={`status-dot ${health ? 'healthy' : 'watchlist'}`} /><strong>{health ? 'Application online' : 'Connecting to API'}</strong></div>
        <p>{health && Object.keys(health.agents.runtime_verified_this_process).length
          ? `${Object.keys(health.agents.runtime_verified_this_process).length}/2 agent paths verified this process`
          : 'Foundry configured · runtime not yet verified'}</p>
        <div className="demo-profile"><span>SC</span><div><strong>Synthetic workspace</strong><small>Public demo · no sign-in</small></div></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div><span className="topbar-label">CUSTOMER SUCCESS</span><span className="topbar-divider">/</span><strong>{isAccount ? 'Customer workspace' : route === 'portfolio' ? 'Portfolio' : 'Command center'}</strong></div>
        <form className="top-search" onSubmit={e => { e.preventDefault(); go('portfolio') }}><Search size={16} /><label className="sr-only" htmlFor="global-search">Find a customer</label><input id="global-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a customer…" /><button type="submit" aria-label="Search customer portfolio"><ArrowRight size={16} /></button></form>
        <span className="workspace-tag">DEMO WORKSPACE</span></header>
      <div className="demo-banner"><ShieldCheck size={17} /><span><strong>Synthetic data · public anonymous access.</strong> Do not enter real customer information. SQLite storage is ephemeral: edits survive refresh but may be lost on container restart or replacement.</span></div>
      <main id="main-content" tabIndex={-1}>
        {error && <div className="error-banner" role="alert"><TriangleAlert size={20} /><div className="grow"><strong>We couldn’t complete that request</strong><p>{error}</p><button className="text-button" onClick={reload} disabled={!!busy}>Reload latest data</button><span className="fine-print"> Unsaved edits may be replaced on reload.</span></div><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={18} /></button></div>}
        {loading || (isAccount && detailLoading) ? <div className="page-loading" role="status"><LoaderCircle size={30} className="spin" /><h2>Connecting the signals…</h2><p>Loading your synthetic customer workspace.</p></div> :
          !validRoute ? <section className="empty card"><h1>Page not found</h1><button className="button primary" onClick={() => go('overview')}>Back to overview</button></section> :
          isAccount ? detail ? <Workspace detail={detail} tab={tab} busy={busy} mutate={mutate} onExport={download} /> :
            <section className="empty card"><h2>Customer unavailable</h2><p>Choose a customer in the portfolio or reload the latest data.</p><button className="button secondary" onClick={() => go('portfolio')}>Open portfolio</button></section> :
            !accounts.length ? <section className="empty card"><h2>No customer data available</h2><p>The API may be unavailable. Reload to try again.</p><button className="button secondary" onClick={reload}>Reload data</button></section> :
              route === 'portfolio' ? <Portfolio accounts={accounts} query={query} setQuery={setQuery} /> : <Dashboard accounts={accounts} />}
      </main>
      <footer className="page-footer"><span>Signal / AI Customer Success Command Center</span><span>Fictional evidence. Illustrative scoring. Human-led decisions.</span></footer>
    </div>
  </div>
}
