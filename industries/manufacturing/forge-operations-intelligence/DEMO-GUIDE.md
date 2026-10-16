# Three-minute customer demo

**Target: three minutes when Foundry responds promptly.** Service latency, shared
usage or 429 throttling can extend this; never substitute a canned AI success.

Open <https://ca-manufacturing-01.ambitioussky-87dc9783.swedencentral.azurecontainerapps.io>.

## Before recording

- Check **AI agents** / the shared AI strip: **no active job**, cooldown zero,
  and **at least two calls remaining** in the 12-attempt daily allowance.
  Other anonymous visitors share this budget and data.
- Choose an existing **Open**, nonresolved incident with no investigation/plan.
  Search in **Incidents** and inspect its current state; do not blindly reuse an ID.
  Phase 3 used `INC-1043`, resolved it, then a necessary replacement reseeded it.
- Do not reset state, restart the app, raise quota or retry automatically.
  Reserve two sequential calls, not parallel requests.
- Use only fictional reviewer **Demo reviewer**. All review/approval below is
  explicitly **synthetic-demo self-attestation**, not industrial signoff.

## Timed narrative and real controls

| Target time | Show / say / do |
|---|---|
| **0:00–0:20** | **Overview → Operations overview**. “Three sites, six lines, eighteen machines. OEE combines availability, performance and quality.” Show approximately **85.3% OEE**, output **28,532 / 33,120**, and **188 minutes** line downtime. This is a fixed synthetic shift, not live factory data; incident durations are not additive line downtime. |
| **0:20–0:35** | **Factories & lines**: show machine health, utilization, last maintenance and current alert. Open **Incidents**, select the prepared eligible incident and review **overview** observations and recent equipment signal. |
| **0:35–0:50** | Click **Investigate with AI** once. Explain that **Downtime Investigation Agent** uses actual incident observations and three readings. When complete, show supplied facts, evidence-linked hypothesis, confidence, uncertainty and **Real Foundry response** attribution. |
| **0:50–1:55** | **Use the enforced waiting gap**, not another request: contrast measured facts with possible causes; discuss missing inspection evidence, questions and business impact. In **investigation**, click **Record qualified human review**; enter **Demo reviewer**, synthetic-only review notes, read/check the explicit acknowledgement, then **Save human review**. Explain this is not verified professional identity. Wait until the shared cooldown actually reaches zero—**at least 65 seconds after investigation completion**, even if the target clock has advanced. |
| **1:55–2:10** | Click **Generate maintenance plan** once. **Maintenance Advisor Agent** consumes that saved investigation. Show suggested action, owner, urgency, benefit, safety review and prevention; the generated plan is **not approved**. Suggested safety checks do not prove safe work occurred. |
| **2:10–2:35** | **Edit & save maintenance actions**: change **Owner role** to a fictional role such as `Demo maintenance lead`; click **Save revised plan**. Click **Review & explicitly approve plan**, enter **Demo reviewer** and synthetic-only notes, read/check the acknowledgement, then **Explicitly approve this plan**. Point out the visible approval record. |
| **2:35–3:00** | Click **Move to Action Planned**, then **Move to Resolved**. Open incident **activity**, or workspace **Activity history**, and show investigation/plan/review/edit/approval/state events. Return to the incident, **reload the browser at its deep link**, open **maintenance**, and show the saved owner, approval and real response ID. |

## If the service needs longer

Keep presenting facts, uncertainty and human controls while the countdown elapses.
Honor a longer `Retry-After` on **429**; check the saved job before any deliberate,
bounded retry. Failed attempts still consume budget. If fewer than two calls remain,
stop the live two-agent demonstration and report that limitation honestly.
Never call an agent from the CLI to stand in for the application.

## Close with the boundary

“Real AI assists; people decide. This fictional workflow neither diagnoses equipment
nor authorizes real-world maintenance. Refresh persistence is proven only for the
current container. **Restart/replacement may erase all state, approval, history,
jobs, cooldown and daily budget**; this is not durable enterprise storage.”
