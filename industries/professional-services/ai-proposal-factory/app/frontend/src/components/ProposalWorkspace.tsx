import { useState } from "react";
import { api } from "../api";
import type { Proposal } from "../types";

type Props = {
  proposal: Proposal;
  onChange: (proposal: Proposal) => void;
  notify: (message: string, error?: boolean) => void;
};

export function ProposalWorkspace({ proposal, onChange, notify }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(proposal.sections.map((item) => [item.id, item.content])),
  );
  const [busy, setBusy] = useState<string>();

  const action = async (key: string, operation: () => Promise<Proposal>, message: string) => {
    setBusy(key);
    try {
      const next = await operation();
      setDrafts(Object.fromEntries(next.sections.map((item) => [item.id, item.content])));
      onChange(next);
      notify(message);
    }
    catch (error) { notify(error instanceof Error ? error.message : "Action failed", true); }
    finally { setBusy(undefined); }
  };

  return (
    <div className="proposal-layout">
      <div className="proposal-main">
        <div className="proposal-summary">
          <div><span className={`proposal-status ${proposal.status.toLowerCase().replace(" ", "-")}`}>{proposal.status}</span><h2>{proposal.title}</h2><p>{proposal.sections.filter((item) => item.status === "Approved").length} of {proposal.sections.length} sections approved</p></div>
          <div className="export-actions">
            <a href={`/api/proposals/${proposal.id}/export/markdown`} download>↓ Markdown</a>
            <a href={`/api/proposals/${proposal.id}/export/pdf`} download>↓ PDF</a>
            <button disabled={busy === "all" || proposal.status === "Approved"} onClick={() => action("all", () => api.approveProposal(proposal.id), "Complete proposal approved.")}>✓ Approve proposal</button>
          </div>
        </div>
        {proposal.sections.map((section) => (
          <article className="section-card" id={section.id} key={section.id}>
            <header><div><span className="section-number">{String(section.order).padStart(2, "0")}</span><h3>{section.title}</h3></div><span className={`section-status ${section.status.toLowerCase().replace(" ", "-")}`}>{section.status}</span></header>
            <textarea value={drafts[section.id] ?? section.content} onChange={(event) => setDrafts({ ...drafts, [section.id]: event.target.value })} aria-label={`${section.title} content`} />
            {section.source_references.length > 0 && <div className="sources"><strong>Sources</strong>{section.source_references.map((source) => <span key={source}>↗ {source}</span>)}</div>}
            <footer>
              <button disabled={busy === section.id} onClick={() => action(section.id, () => api.saveSection(proposal.id, section.id, drafts[section.id]), `${section.title} saved.`)}>Save changes</button>
              <button disabled={busy === section.id} onClick={() => action(section.id, () => api.regenerateSection(proposal.id, section.id), `${section.title} regenerated.`)}>✦ Regenerate</button>
              <button className="approve" disabled={busy === section.id || section.status === "Approved"} onClick={() => action(section.id, () => api.approveSection(proposal.id, section.id), `${section.title} approved.`)}>✓ Approve</button>
            </footer>
          </article>
        ))}
      </div>
      <aside className="proposal-outline">
        <p>PROPOSAL SECTIONS</p>
        {proposal.sections.map((section) => <a href={`#${section.id}`} key={section.id}><i className={section.status === "Approved" ? "done" : ""}>{section.status === "Approved" ? "✓" : section.order}</i>{section.title}</a>)}
      </aside>
    </div>
  );
}
