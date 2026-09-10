type Props = {
  view: string;
  onNavigate: (view: "dashboard" | "knowledge" | "audit") => void;
};

export function Sidebar({ view, onNavigate }: Props) {
  const links = [
    ["dashboard", "⌂", "Opportunities"],
    ["knowledge", "▤", "Knowledge Library"],
    ["audit", "↗", "Audit History"],
  ] as const;

  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => onNavigate("dashboard")}>
        <span className="brand-mark">AI</span>
        <span>
          <strong>Proposal Factory</strong>
          <small>Customer workspace</small>
        </span>
      </button>
      <nav>
        <p>WORKSPACE</p>
        {links.map(([key, icon, label]) => (
          <button
            className={`nav-item ${view === key ? "active" : ""}`}
            key={key}
            onClick={() => onNavigate(key)}
          >
            <span>{icon}</span>{label}
          </button>
        ))}
      </nav>
      <div className="sidebar-card">
        <span className="sparkle">✦</span>
        <strong>Three-agent workflow</strong>
        <p>Requirements, proposal writing, and risk review in one human-led experience.</p>
        <div className="agent-dots"><i /><i /><i /></div>
      </div>
      <div className="profile">
        <div className="avatar">DE</div>
        <div><strong>Demo environment</strong><span>Sweden Central</span></div>
        <i className="online" />
      </div>
    </aside>
  );
}
