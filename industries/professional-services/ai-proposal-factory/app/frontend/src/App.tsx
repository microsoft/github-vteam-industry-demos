import { useEffect, useState } from "react";
import { api } from "./api";
import { AuditTimeline } from "./components/AuditTimeline";
import { CreateOpportunityModal } from "./components/CreateOpportunityModal";
import { Dashboard } from "./components/Dashboard";
import { KnowledgeLibrary } from "./components/KnowledgeLibrary";
import { OpportunityWorkspace } from "./components/OpportunityWorkspace";
import { Sidebar } from "./components/Sidebar";
import type { AuditEvent, Opportunity } from "./types";

type View = "dashboard" | "knowledge" | "audit" | "workspace";

function App() {
  const [view, setView] = useState<View>("dashboard");
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [selected, setSelected] = useState<Opportunity>();
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");

  const loadOpportunities = () => {
    setLoading(true);
    api.opportunities()
      .then(setOpportunities)
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  };
  useEffect(loadOpportunities, []);
  useEffect(() => {
    if (view === "audit") api.audit().then(setAudit).catch((reason) => setError(reason.message));
  }, [view]);

  const navigate = (next: "dashboard" | "knowledge" | "audit") => {
    setView(next);
    setSelected(undefined);
    if (next === "dashboard") loadOpportunities();
  };

  const createOpportunity = async (payload: Parameters<typeof api.createOpportunity>[0]) => {
    const created = await api.createOpportunity(payload);
    setOpportunities((current) => [created, ...current.filter((item) => item.id !== created.id)]);
    setCreating(false);
    setNotice(`${created.name} was created and is ready for meeting notes.`);
    window.setTimeout(() => setNotice(""), 4200);
  };

  return (
    <div className="app-shell">
      <Sidebar view={view} onNavigate={navigate} />
      <main>
        <div className="demo-banner"><span>i</span><strong>Demo environment — synthetic data only</strong><span>No customer data is used</span></div>
        {error && <div className="global-error">Unable to load part of the workspace: {error}<button onClick={() => setError("")}>×</button></div>}
        {notice && <div className="toast">✓ {notice}</div>}
        {view === "dashboard" && <Dashboard opportunities={opportunities} loading={loading} onCreate={() => setCreating(true)} onOpen={(item) => { setSelected(item); setView("workspace"); }} />}
        {view === "knowledge" && <KnowledgeLibrary />}
        {view === "audit" && <AuditTimeline events={audit} />}
        {view === "workspace" && selected && <OpportunityWorkspace initial={selected} onBack={() => { navigate("dashboard"); }} />}
      </main>
      {creating && <CreateOpportunityModal onCancel={() => setCreating(false)} onSave={createOpportunity} />}
    </div>
  );
}

export default App;
