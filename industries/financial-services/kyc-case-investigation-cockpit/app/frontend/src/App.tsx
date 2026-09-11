import { useCallback, useEffect, useMemo, useState } from "react";

import { CaseQueue } from "./components/CaseQueue";
import { CaseWorkspace } from "./components/CaseWorkspace";
import { DisclaimerBanner } from "./components/DisclaimerBanner";
import { FilterBar } from "./components/FilterBar";
import { MetricCard } from "./components/MetricCard";
import { Sidebar } from "./components/Sidebar";
import { AuditHistoryPage } from "./pages/AuditHistoryPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { InvestigationsPage } from "./pages/InvestigationsPage";
import {
  activePrimaryRoute,
  caseRoutePath,
  parseRoute,
  primaryRoutePath,
  type PrimaryRoute,
} from "./routing";
import {
  getCase,
  getCases,
  getInvestigation,
  startInvestigation,
  submitDecision,
} from "./services/api";
import type { CaseListItem, KycCase } from "./types";

const investigationStages = [
  "Reading submitted documents",
  "Extracting company information",
  "Building ownership profile",
  "Checking required evidence",
  "Investigating risk indicators",
  "Preparing analyst summary",
  "Saving investigation",
];

function App() {
  const [route, setRoute] = useState(parseRoute);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [selectedCase, setSelectedCase] = useState<KycCase | null>(null);
  const [filters, setFilters] = useState({ search: "", status: "", risk: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [investigating, setInvestigating] = useState(false);
  const [activeStage, setActiveStage] = useState(-1);

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      setCases(await getCases(filters));
      setError("");
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (!window.location.hash) {
      window.location.replace(primaryRoutePath("dashboard"));
    }
    const handleHashChange = () => setRoute(parseRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (route.page !== "case") {
      setSelectedCase(null);
      return;
    }
    setLoading(true);
    getCase(route.caseId)
      .then((item) => {
        setSelectedCase(item);
        setError("");
      })
      .catch((requestError: Error) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [route]);

  useEffect(() => {
    if (route.page !== "dashboard") return;
    const timeout = window.setTimeout(loadCases, 180);
    return () => window.clearTimeout(timeout);
  }, [loadCases, route.page]);

  const selectCase = async (caseId: string) => {
    window.location.hash = caseRoutePath(caseId);
  };

  const investigate = async () => {
    if (!selectedCase) return;
    setInvestigating(true);
    setActiveStage(0);
    try {
      let job = await startInvestigation(selectedCase.id);
      while (job.status === "Running") {
        setActiveStage(Math.max(0, job.completed_stages.length));
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        job = await getInvestigation(selectedCase.id, job.id);
      }
      if (job.status === "Failed") {
        throw new Error(job.error ?? "The investigation stage failed. Please retry.");
      }
      setActiveStage(investigationStages.length - 1);
      setSelectedCase(await getCase(selectedCase.id));
      setError("");
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setInvestigating(false);
    }
  };

  const decide = async (action: string, reason: string) => {
    if (!selectedCase) return;
    const updated = await submitDecision(selectedCase.id, action, reason);
    setSelectedCase(updated);
    await loadCases();
  };

  const metrics = useMemo(() => ({
    open: cases.filter((item) => !["Approved", "Escalated"].includes(item.status)).length,
    review: cases.filter((item) => ["Investigating", "Ready for Decision"].includes(item.status)).length,
    completed: cases.filter((item) => ["Approved", "Escalated"].includes(item.status)).length,
  }), [cases]);

  const openAggregateCase = (
    caseId: string,
    tab: string,
    returnPage: PrimaryRoute,
    documentId?: string,
  ) => {
    window.location.hash = caseRoutePath(caseId, {
      tab,
      documentId,
      returnPage,
    });
  };

  return (
    <div className="app-shell">
      <Sidebar activeRoute={activePrimaryRoute(route)} />
      <main>
        <DisclaimerBanner />

        {error && <div className="error-banner">{error}</div>}
        {route.page === "case" && selectedCase ? (
          <CaseWorkspace
            activeStage={activeStage}
            initialDocumentId={route.documentId}
            initialTab={route.tab}
            investigating={investigating}
            item={selectedCase}
            onBack={() => {
              window.location.hash = primaryRoutePath(route.returnPage);
            }}
            onDecision={decide}
            onInvestigate={investigate}
            onTabChange={(tab) => {
              window.history.replaceState(
                null,
                "",
                caseRoutePath(route.caseId, {
                  tab,
                  documentId:
                    tab === "Documents" ? route.documentId : undefined,
                  returnPage: route.returnPage,
                }),
              );
              setRoute(parseRoute());
            }}
            stages={investigationStages}
          />
        ) : route.page === "case" ? (
          <div className="loading-state">Loading case workspace...</div>
        ) : route.page === "investigations" ? (
          <InvestigationsPage
            onOpenCase={(caseId) =>
              openAggregateCase(caseId, "AI Summary", "investigations")
            }
          />
        ) : route.page === "documents" ? (
          <DocumentsPage
            onOpenDocument={(caseId, documentId) =>
              openAggregateCase(caseId, "Documents", "documents", documentId)
            }
          />
        ) : route.page === "audit" ? (
          <AuditHistoryPage
            onOpenCase={(caseId) =>
              openAggregateCase(caseId, "Audit History", "audit")
            }
          />
        ) : (
          <>
            <header className="page-header">
              <div>
                <span className="eyebrow">Business onboarding</span>
                <h1>KYC case dashboard</h1>
                <p>Review synthetic onboarding cases and continue active investigations.</p>
              </div>
              <div className="analyst">
                <div className="analyst__avatar">AR</div>
                <div>
                  <strong>Alex Rivera</strong>
                  <span>KYC Analyst</span>
                </div>
              </div>
            </header>

            <section className="metrics" aria-label="Case metrics">
              <MetricCard label="Visible open cases" value={String(metrics.open)} detail="Based on current filters" />
              <MetricCard label="Awaiting review" value={String(metrics.review)} detail="Investigation or decision" tone="amber" />
              <MetricCard label="Completed / escalated" value={String(metrics.completed)} detail="Historical demo outcomes" tone="green" />
            </section>

            <FilterBar
              {...filters}
              onChange={(field, value) => setFilters((current) => ({ ...current, [field]: value }))}
            />

            {loading ? (
              <div className="loading-state">Loading synthetic cases...</div>
            ) : (
              <CaseQueue cases={cases} onSelect={selectCase} />
            )}
          </>
        )}

        <footer>
          KYC Case Investigation Cockpit · Customer demonstration environment
        </footer>
      </main>
    </div>
  );
}

export default App;
