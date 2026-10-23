# Ten optional live-Copilot improvements

Live Phase 3 COMPLETE demo:
https://ca-high-tech-software-isv-01.gentlebeach-d66a7b07.swedencentral.azurecontainerapps.io
Current deployment: `ca-high-tech-software-isv-01--0000001`, ACR `dt3`, digest
`sha256:46dc1505599ad4b8dfe506a29e0bbe3dadf8f38578cb34b73c4a578fdd7924c9`.
See [current evidence, real response IDs and accepted limitations](PHASE-3-RESULTS.md).

These are **future, independent small tasks**, not implemented Phase 3 features
or authorization to start work. Each stays within React/FastAPI/ephemeral SQLite,
preserves real AI and needs no additional Azure dependency or agent recreation.
Run only focused local checks; no extra paid generations are needed to verify
these UI/data improvements.

| # | Bounded goal | Suggested live Copilot prompt | Lightweight success check |
|---|---|---|---|
| 1 | Persist portfolio filters in the URL | “Encode search, health, owner, plan and sort in the portfolio hash query. Restore them on refresh without changing API or database architecture.” | Set two filters, copy URL into a fresh tab, verify the same visible customers and sort. |
| 2 | Download the filtered portfolio as CSV | “Add Export visible CSV to the portfolio using only the currently filtered/sorted rows. Quote commas/newlines and neutralize spreadsheet formula prefixes.” | A two-row filtered download matches table order and safely handles a formula-like fictional field in a local test. |
| 3 | Show a non-triggering AI cooldown countdown | “After an account AI request starts, show the remaining 25-second cooldown on that account's AI controls. Keep backend guards authoritative and make no background AI requests.” | A local stubbed failed attempt starts the countdown; buttons become available afterward without any new request. |
| 4 | Add print-only plan styling | “Add a Print plan control and print CSS for the currently saved real plan and human edits. Hide navigation, preserve provenance/disclaimer, and add no PDF service.” | Browser print preview includes edits, action states and response IDs without sidebar clipping. |
| 5 | Local unsaved-navigation protection | “Warn before leaving a customer with dirty plan or account-note edits, including browser close. Preserve existing save/regeneration behavior; do not autosave or add storage.” | Edit a field, cancel navigation and retain it; save and navigate without a warning. |
| 6 | Sort recommendations by priority | “Add a recommendation display order switch: original order or priority. Keep original action indices so accept/complete always targets the correct saved recommendation.” | Reorder locally, accept one item, refresh and confirm the same original item has the updated status. |
| 7 | Filter the existing activity timeline | “Add All, AI runs and Human edits/decisions timeline filters with a visible count. Keep seeded fictional activity clearly distinct and do not change stored events.” | Toggle each filter on an existing account; timestamps/order remain correct and All restores the original timeline. |
| 8 | Show evidence freshness without regeneration | “Display the saved risk and plan ages plus a stale-context warning when their existing context fingerprints differ from current account context. Never call AI automatically.” | A local account-note edit marks old evidence stale; viewing the warning sends zero AI POSTs. |
| 9 | Compact two-account comparison | “Let a user select exactly two portfolio accounts and compare ARR, adoption, renewal, support and heuristic components in a small read-only panel. Do not generate analysis.” | Compare the escalation and healthy accounts, dismiss the panel, and verify no account mutation or AI call occurred. |
| 10 | Local light/dark display preference | “Add an accessible light/dark theme toggle using CSS variables and a browser-only preference. Preserve contrast for all health badges, banners and AI error/loading states.” | Switch themes at desktop and 390px width; refresh retains preference and warnings remain legible without API writes. |
