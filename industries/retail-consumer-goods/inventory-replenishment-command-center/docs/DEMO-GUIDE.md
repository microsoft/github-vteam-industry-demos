# Harbour & Lane public demo guide

## Put the shared demo in recording state

1. Open the unchanged public HTTPS URL in a fresh browser context.
2. Confirm there is no sign-in, redirect, cookie, or browser-storage requirement.
3. Confirm **Public synthetic demo — no sign-in** and **Anonymous Public Demo Actor (synthetic)** are visible.
4. Open **History** → **Reset shared demo state**.
5. Read the shared-state warning, select **Confirm shared reset**, and wait for **Availability exceptions** to return.
6. Open **History** again and confirm **No actions yet**. Return to **Overview**.

Reset is an intentional synthetic setup action. It clears actions and audit history for every visitor. Coordinate with other presenters before using it.

## Final two-minute scenario

1. **0:00–0:20 — Prioritize.** On **Availability exceptions**, show stockout risks, projected revenue exposure, active mitigations, protected donor options, and the filters. Revenue exposure is a scenario projection, not recovered revenue.
2. **0:20–0:40 — Open the exact SKU.** Select **Everyday Knit — Forest Green — Size M** at **Dublin Grafton Street**. Confirm SKU `HL-KNT-EVD-FGN-M`, 12 available, demand of 8/day, 1.5 days cover, and inbound on day 5.
3. **0:40–1:05 — Review evidence.** Show inventory, 28-day demand, inbound, network stock, and **Dublin Autumn Knit Edit**. State that promotion is supporting evidence, not proof of causation.
4. **1:05–1:30 — Compare protected options.** Show the deterministic Cork transfer: 32 units, arrival day 1, and Cork retaining 48 units / 12 days of baseline cover. Quantities, timing, cost, feasibility, and cover are application calculations.
5. **1:30–1:45 — Use grounded AI.** Run **Inventory Investigation** and **Replenishment Recommendation**. Show evidence references and tradeoffs. If Foundry is unavailable or rate-limited, show the honest unavailable/retry state; do not claim AI success.
6. **1:45–1:55 — Keep the human decision explicit.** Select **Simulate proposal**, then **Simulate approval**. Point to **Mitigation scheduled** and say: approval reserves synthetic stock; it does not imply dispatch or receipt.
7. **1:55–2:00 — Show traceability.** Select **Simulate dispatch**, then **Simulate receipt**, and open **History**. Show the separate proposed, approved, dispatched, and received events and the **SIMULATED** label.

## Optional reject branch

After a clean reset, create the proposal and select **Simulate rejection**. Open **History** to show the rejected event, then perform the full reset confirmation before beginning the approval branch.

## Exact hero checkpoints

- Product: **Everyday Knit — Forest Green — Size M**
- SKU: `HL-KNT-EVD-FGN-M`
- Dublin: 12 available; 8 units/day; 1.5 days cover; warehouse delivery in 5 days
- Cork: 80 available; 4 units/day
- Cork-to-Dublin option: 32 units; arrival in 1 day
- Cork after transfer: 48 units; 12 days baseline cover

All values come from the API. Do not substitute remembered values when the UI reports a loading or error state.

## Workflow and safety rules

- Only the canonical hero workflow is mutable. Other exceptions remain readable.
- Proposal, approval, rejection, dispatch, receipt, and reset are simulations. No real inventory, order, or recovered revenue is created.
- Approval is not dispatch or receipt. Each later state requires its own visible control and audit event.
- Rejection and receipt are terminal; reset is required before another proposal.
- Both AI panels share a public rate limit. A retry state disables both AI controls temporarily while deterministic content and reset remain available.
- Azure calls remain server-side through managed identity. The browser receives no Azure credentials.

## Leave the URL ready for the next recording

1. Open **History**.
2. Select **Reset shared demo state**.
3. Confirm **Clear shared synthetic actions and audit history?** is visible.
4. Select **Confirm shared reset** and wait for **Availability exceptions**.
5. Return to **History** and verify **No actions yet**.
6. Close the browser context. Do not leave a rejected, approved, dispatched, or received workflow in shared state.

If another visitor changes state during the recording, follow the conflict message, review the refreshed state, and reset before restarting. Do not bypass the UI or represent a partially completed shared workflow as a clean scenario.
