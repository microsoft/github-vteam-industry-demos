interface FilterBarProps {
  search: string;
  status: string;
  risk: string;
  onChange: (field: "search" | "status" | "risk", value: string) => void;
}

export function FilterBar({
  search,
  status,
  risk,
  onChange,
}: FilterBarProps) {
  return (
    <div className="filter-bar">
      <label className="search-field">
        <span>⌕</span>
        <input
          aria-label="Search cases"
          onChange={(event) => onChange("search", event.target.value)}
          placeholder="Search company or case ID"
          value={search}
        />
      </label>
      <select
        aria-label="Filter by status"
        onChange={(event) => onChange("status", event.target.value)}
        value={status}
      >
        <option value="">All statuses</option>
        <option>New</option>
        <option>Investigating</option>
        <option>Awaiting Information</option>
        <option>Ready for Decision</option>
        <option>Approved</option>
        <option>Escalated</option>
      </select>
      <select
        aria-label="Filter by risk"
        onChange={(event) => onChange("risk", event.target.value)}
        value={risk}
      >
        <option value="">All risk levels</option>
        <option>Low</option>
        <option>Medium</option>
        <option>High</option>
      </select>
    </div>
  );
}
