import { useMemo, useState } from "react";
import type { Opportunity } from "../types";

type Props = {
  opportunities: Opportunity[];
  loading: boolean;
  onCreate: () => void;
  onOpen: (opportunity: Opportunity) => void;
};

const industryColors = ["blue", "violet", "teal", "orange", "pink"];

export function Dashboard({ opportunities, loading, onCreate, onOpen }: Props) {
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("All industries");
  const industries = useMemo(
    () => ["All industries", ...new Set(opportunities.map((item) => item.industry))],
    [opportunities],
  );
  const filtered = opportunities.filter((item) => {
    const matchesSearch = `${item.customer} ${item.name}`
      .toLowerCase()
      .includes(search.toLowerCase());
    return matchesSearch && (industry === "All industries" || item.industry === industry);
  });
  const inReview = opportunities.filter((item) => item.proposal_id).length;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">PROPOSAL OPERATIONS</p>
          <h1>Opportunity pipeline</h1>
          <p>Turn customer context into clear, review-ready proposals.</p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          <span>＋</span> New opportunity
        </button>
      </header>

      <section className="welcome-panel">
        <div>
          <span className="pill">WORKSPACE READY</span>
          <h2>Build stronger proposals, faster.</h2>
          <p>
            Bring requirements, organizational knowledge, and human review into
            one focused workflow powered by three specialized AI agents.
          </p>
          <span className="app-online"><i /> Application online</span>
        </div>
        <div className="workflow-visual">
          {["Requirements", "Proposal", "Risk review"].map((label, index) => (
            <div className={`agent-card agent-${index + 1}`} key={label}>
              <b>✦</b><span>{label}</span><small>Agent {index + 1}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="metric-grid">
        <article><span className="metric-icon blue">◇</span><div><small>Active opportunities</small><strong>{opportunities.length}</strong></div><em>Seeded and ready</em></article>
        <article><span className="metric-icon violet">✦</span><div><small>Proposals in review</small><strong>{inReview}</strong></div><em>Human controlled</em></article>
        <article><span className="metric-icon green">✓</span><div><small>Knowledge assets</small><strong>46</strong></div><em>Reusable content</em></article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><h2>Opportunities</h2><p>Fictional customer scenarios ready for the demo workflow.</p></div>
          <div className="filters">
            <label className="search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search opportunities" /></label>
            <select value={industry} onChange={(event) => setIndustry(event.target.value)}>
              {industries.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
        </div>
        <div className="opportunity-table">
          <div className="table-row table-head">
            <span>Customer & opportunity</span><span>Industry</span><span>Value</span><span>Status</span><span>Progress</span><span />
          </div>
          {loading ? <div className="empty-state">Loading demo opportunities…</div> : filtered.map((item, index) => (
            <button className="table-row opportunity-row" key={item.id} onClick={() => onOpen(item)}>
              <span className="opportunity-name"><i className={industryColors[index % industryColors.length]}>{item.customer.charAt(0)}</i><span><strong>{item.name}</strong><small>{item.customer}</small></span></span>
              <span>{item.industry}</span>
              <strong>{item.estimated_value}</strong>
              <span><b className={`status ${item.proposal_id ? "review" : "discovery"}`}>{item.status}</b></span>
              <span className="progress"><i><b style={{ width: `${item.proposal_progress || 12}%` }} /></i><small>{item.proposal_progress || 12}%</small></span>
              <span className="arrow">→</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
