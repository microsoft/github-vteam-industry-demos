import type { AuditEvent } from "../types";

const labels: Record<string, string> = {
  "opportunity.created": "Opportunity created",
  "opportunity.updated": "Opportunity updated",
  "document.uploaded": "Document uploaded",
  "generation.started": "Generation started",
  "generation.failed": "Generation paused",
  "proposal.generated": "Proposal generated",
  "section.edited": "Section edited",
  "section.regenerated": "Section regenerated",
  "section.approved": "Section approved",
  "proposal.approved": "Proposal approved",
  "proposal.exported": "Proposal exported",
};

export function AuditTimeline({ events, embedded = false }: { events: AuditEvent[]; embedded?: boolean }) {
  const content = (
    <div className="timeline">
      {events.length === 0 && <div className="empty-state">Activity will appear here as the proposal progresses.</div>}
      {events.map((event) => (
        <article key={event.id}>
          <span className="timeline-dot">✓</span>
          <div><strong>{labels[event.event_type] ?? event.event_type}</strong><p>{event.message}</p></div>
          <time>{new Date(event.timestamp).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>
        </article>
      ))}
    </div>
  );
  if (embedded) return content;
  return <div className="page"><header className="page-header"><div><p className="eyebrow">TRACEABILITY</p><h1>Audit history</h1><p>A chronological record of human and AI-assisted proposal activity.</p></div></header><section className="panel audit-panel">{content}</section></div>;
}
