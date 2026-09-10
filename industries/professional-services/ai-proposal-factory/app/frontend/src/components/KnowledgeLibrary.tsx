import { useEffect, useState } from "react";
import { api } from "../api";
import type { KnowledgeItem } from "../types";

const types = ["", "Proposal Snippet", "Case Study", "Methodology", "Service Description", "Template", "Pricing & Effort"];

export function KnowledgeLibrary() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      api.knowledge(search, type).then(setItems).finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search, type]);

  return (
    <div className="page">
      <header className="page-header"><div><p className="eyebrow">REUSABLE CONTENT</p><h1>Knowledge library</h1><p>Browse the synthetic practice assets used to ground proposal generation.</p></div><span className="count-badge">{items.length} assets</span></header>
      <section className="panel knowledge-panel">
        <div className="knowledge-toolbar">
          <label className="search wide"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search case studies, methods, and service descriptions" /></label>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {types.map((item) => <option key={item} value={item}>{item || "All content types"}</option>)}
          </select>
        </div>
        <div className="knowledge-grid">
          {loading ? <div className="empty-state">Searching the library…</div> : items.map((item) => (
            <article className="knowledge-card" key={item.id}>
              <div><span className={`type-icon type-${item.type.charAt(0).toLowerCase()}`}>▤</span><span className="knowledge-type">{item.type}</span></div>
              <h3>{item.title}</h3><p>{item.content}</p>
              <div className="tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <footer><span>{item.industry}</span><small>{item.source}</small></footer>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
