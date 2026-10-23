# Three-minute customer demonstration

Open https://ca-high-tech-software-isv-01.gentlebeach-d66a7b07.swedencentral.azurecontainerapps.io

**Phase 3 COMPLETE. Recommended account: Cobalt Cloudworks (`acct-002`).**
Current revision `ca-high-tech-software-isv-01--0000001`, ACR `dt3`, digest
`sha256:46dc1505599ad4b8dfe506a29e0bbe3dadf8f38578cb34b73c4a578fdd7924c9`.
Use a desktop window around 1440×900; the 390×844 compact layout also passed.

**Before presenting:** confirm **Application online**, 24 accounts, and Cobalt's
saved real plan. At final verification it was revision 6 with five events,
human notes/outreach and recommendation 1 completed. Public visitors can change
this state. Do not reset/redeploy or regenerate just to show saved output.
The CSS replacement actually erased previous plans; Northstar (`acct-001`) no
longer has its old live plan. Cobalt was prepared afterward with genuine calls:

- Analyst: `resp_0080a14dc1cebe85006ad0e1d0eaac819597e0c28f3e92ef81`,
  `2026-10-15T14:23:17.631364Z`.
- Advisor: `resp_0e763d64f4fef0de006ad0e1e6c0308197974d4b77b99ee049`,
  `2026-10-15T14:23:48.223602Z`, linked to that analyst.

## 0:00–0:30 · Prioritize revenue

Click **Executive overview**. Point to **ARR at risk**, usage and health charts:
“24 fictional customers; $845K across eight high-risk accounts at validation.
This is the high-risk heuristic segment, not a trained churn forecast or
guaranteed financial loss.”

## 0:30–1:00 · Open the customer

Click **Customer portfolio**, type **Cobalt** in **Search customers**, then click
**Cobalt Cloudworks**. If previous filters hide it, click **Reset filters** and
search again. In **Customer 360**, show **Usage & adoption**, support escalation
and the transparent 59/100 health breakdown:
“Broad adoption, but an unresolved webhook escalation and 3.1/5 satisfaction
weaken sponsor confidence. Support stability contributes zero of 15 points.”

## 1:00–2:00 · Show both real agent results

Click **AI insights & retention**. Show the analyst's evidence, confidence and
limitations, then scroll to the advisor and its response provenance:
“This is a **previous saved real Foundry result**, generated through this
deployment's managed identity, not a mock or a fresh call during this talk.
The advisor used the actual saved risk response; here are their matching IDs.”

Show recommendations and the 30-day plan. Explain the live buttons
**Run risk analyst** and **Regenerate plan** without clicking them for this
saved-result three-minute route. Regeneration prompts for confirmation because
it replaces current human edits and approvals. Use the optional procedure below
only when new generation is deliberately desired.

## 2:00–3:00 · Demonstrate human ownership and export

Recommendation 1 is already **Completed** and disabled. On another
still-recommended action, click **Accept action**, wait for save, then
**Mark complete**. If visitors already completed all items, show their actual
timestamps; do not invent an available action.

In **Human plan notes & adjustments**, append a short fictional review note.
Optionally edit **Subject** or **Email body**, then click **Save plan edits**.
Refresh: the saved text and completed state remain while SQLite survives.
Click **Activity & history (N)** to show the new UTC events; return to
**AI insights & retention**, click **Download Markdown**, and open the file to
show the human edits, completed status and linked provenance.

Close at 3:00: “No email was sent and no business action executed. This public,
anonymous, shared synthetic demo uses ephemeral SQLite, not production
persistence or security.” The times are a presentation timebox, not a guarantee
against network latency.

## Optional fresh generation — allow extra time, not required for the script

Each model request can take up to **110 seconds**; two calls may exceed three
minutes. Phase 3 validation already made four calls total, two on each image;
this guide does not trigger any additional calls automatically.

On Cobalt, save/download anything you want to keep before intentional regeneration.
Click **Run risk analyst** once and show **Analyzing…**. Wait **at least 25 seconds
between the risk and advisor request starts**, even if the analyst finished
quickly; failed attempts also count. Then click **Regenerate plan**, read its
warning and confirm only if replacing edits/approvals is intended. Show
**Building plan…**, inspect the new provenance, and human-review before acting.
An ungenerated fictional account instead has **Create retention plan** or
**Generate retention plan** after its real analyst succeeds.

Never double-click or repeatedly retry. Guards are process-local: two concurrent,
one/account, 25 seconds/account, 40 attempts/hour and 150/day. They reset on
restart and are not durable spending caps. Usage-billed AI and the always-on
replica/Basic ACR cost money; there is no verified fixed-price promise.

## Honest fallback if AI or the public demo is unavailable

The UI shows **We couldn’t complete that request** with its safe actual reason;
there is no simulated fallback. Respect cooldown and use **Reload latest data**
after a conflict, knowing unsaved edits may be replaced.

If Cobalt's saved output still exists, explicitly call it a **previous saved real
result**, not today's failed request. If SQLite reset or connectivity prevents
live access, open the actual recorded export
`infra\evidence\phase3-cycle2-acct-002-success-plan.md` and label it an **offline
historical export of a real response**. Never imply it is still available live.
Earlier Northstar and pre-patch Cobalt exports are historical only.

See [current results, screenshots and limitations](PHASE-3-RESULTS.md) and
[architecture, existing roles and API versions](ARCHITECTURE.md).
