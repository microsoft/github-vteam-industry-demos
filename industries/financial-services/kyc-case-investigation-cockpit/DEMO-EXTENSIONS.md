# Demo Extensions

All extensions must continue to use fictional data and keep the analyst responsible for
the final action.

| Feature | Business value | Likely files | Complexity | Example Copilot prompt |
|---|---|---|---|---|
| Country filter | Narrows regional queues | `FilterBar.tsx`, `cases.py` | **Easy — live-demo friendly** | “Add a country filter to the dashboard and API.” |
| Dashboard risk chart | Makes queue composition visible | `App.tsx`, new chart component | **Easy — live-demo friendly** | “Add a dependency-free risk distribution bar chart.” |
| Analyst avatars | Improves queue scannability | `CaseQueue.tsx`, CSS | **Easy — live-demo friendly** | “Show deterministic initials avatars beside assigned analysts.” |
| Dark mode | Supports presentation environments | `styles.css`, `App.tsx` | Easy | “Add a persisted light/dark theme toggle.” |
| PDF case summary | Creates a portable review pack | frontend summary, backend export API | Medium | “Export the current synthetic case summary as PDF.” |
| Ownership graph | Clarifies layered control | new ownership component | Medium | “Replace the ownership rows with an accessible visual graph.” |
| Side-by-side documents | Speeds contradiction review | document workspace | Medium | “Allow two synthetic documents to be compared side by side.” |
| Configurable checklist | Demonstrates policy variation | provider/service models | Medium | “Load completeness requirements from a small JSON configuration.” |
| Four-eyes approval | Demonstrates dual control | decision service, state, UI | Medium | “Require a second fictional analyst before approval is final.” |
| Azure AI Search screening | Enables managed retrieval in Sweden Central | new Azure provider module, provider factory | Medium | “Add an Azure AI Search screening adapter with local fallback.” |

## Optional deployment limitations

The working baseline uses 40 local synthetic screening records and does not require
Azure AI Search. Search remains an optional extension only when capacity is available
in Sweden Central.

Azure Storage data-plane persistence is also optional. Some enterprise subscriptions
disable Storage public endpoints, which would require private networking for Container
Apps access. Private networking is intentionally excluded from this customer-demo
prototype. The Storage Account and optional managed-identity adapter remain provisioned,
but the baseline uses deterministic in-process state and packaged synthetic documents.
State is retained only for the lifetime of the running Container App replica and is not
durable across process or revision replacement.

Future enterprise options are an approved policy exception or a VNet/private-endpoint
design. Neither is required for the critical live demo flow, and no credential,
cross-region, or insecure public-access fallback is used.
