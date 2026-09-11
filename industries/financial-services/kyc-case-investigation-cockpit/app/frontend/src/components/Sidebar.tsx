import { primaryRoutePath, type PrimaryRoute } from "../routing";

const navigation: { label: string; icon: string; route: PrimaryRoute }[] = [
  { label: "Case dashboard", icon: "▦", route: "dashboard" },
  { label: "Investigations", icon: "◎", route: "investigations" },
  { label: "Documents", icon: "▤", route: "documents" },
  { label: "Audit history", icon: "◷", route: "audit" },
];

export function Sidebar({ activeRoute }: { activeRoute: PrimaryRoute }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand__mark">K</div>
        <div>
          <strong>KYC Cockpit</strong>
          <span>Investigation workspace</span>
        </div>
      </div>

      <nav aria-label="Primary navigation">
        {navigation.map((item) => (
          <a
            aria-current={activeRoute === item.route ? "page" : undefined}
            className={`nav-item ${activeRoute === item.route ? "nav-item--active" : ""}`}
            href={primaryRoutePath(item.route)}
            key={item.label}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>

      <div className="sidebar__footer">
        <span className="status-dot" />
        Demo workspace
        <small>Sweden Central</small>
      </div>
    </aside>
  );
}
