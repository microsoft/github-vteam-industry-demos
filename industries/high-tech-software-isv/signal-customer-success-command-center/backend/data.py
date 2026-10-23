"""Synthetic evidence and a deliberately illustrative, explainable health score."""

from datetime import date, timedelta


def health(account):
    adoption = account["seats_active"] / account["seats_licensed"]
    usage = account["weekly_active_users"]
    trend = (usage[-1] - usage[0]) / max(usage[0], 1)
    features = sum(f["adoption_percent"] for f in account["features"]) / len(account["features"])
    components = [
        {"name": "Seat adoption", "points": round(30 * adoption), "maximum": 30,
         "evidence": f'{account["seats_active"]}/{account["seats_licensed"]} active seats'},
        {"name": "Usage momentum", "points": round(20 * min(1, max(0, (trend + .5) / .7))), "maximum": 20,
         "evidence": f"{trend:+.0%} over eight weeks; −50% = 0, +20% = 20"},
        {"name": "Feature breadth", "points": round(20 * features / 100), "maximum": 20,
         "evidence": f"{features:.0f}% mean feature adoption"},
        {"name": "Support stability", "points": max(0, 15 - account["support"]["open_cases"] * 2
                                                  - account["support"]["critical_cases"] * 7), "maximum": 15,
         "evidence": "15 minus 2/open case and 7/critical case; floor 0"},
        {"name": "Customer satisfaction", "points": round(15 * account["csat"] / 5), "maximum": 15,
         "evidence": f'{account["csat"]}/5 CSAT × 15'},
    ]
    score = sum(c["points"] for c in components)
    return {"score": score, "segment": "healthy" if score >= 75 else "watchlist" if score >= 50 else "high",
            "components": components,
            "disclaimer": "Illustrative heuristic, not a trained prediction or churn probability. "
                          "Weights are demo assumptions; renewal timing is separate context."}


def seed_accounts(today: date):
    names = [
        "Northstar Workflow", "Cobalt Cloudworks", "Juniper Metrics", "Ember Stack",
        "Harbor Logic", "Mosaic Devtools", "Lumen Systems", "Orbit Ledger",
        "Cedar Automations", "Helix Workspace", "Silverline API", "Tandem Analytics",
        "Copperleaf Software", "Prism Operations", "Atlas Fabric", "Willow Integrations",
        "Beacon Pipeline", "Quartz Intelligence", "Evergreen Platform", "Nimbus Studio",
        "Maple Dataworks", "Solstice Apps", "Kite Collaboration", "Aurora Compute",
    ]
    owners = ["Alex Morgan", "Sam Rivera", "Jordan Lee", "Casey Park"]
    accounts = []
    for i, name in enumerate(names):
        kind = i % 3
        seats = [180, 250, 120][kind] + (i // 3) * 20
        ratio = [.26, .67, .93][kind]
        active = round(seats * ratio)
        usage = [round(active * factor) for factor in (
            [1.9, 1.8, 1.6, 1.45, 1.3, 1.15, 1.06, 1] if kind == 0 else
            [.96, 1, 1.02, 1, .99, 1, .98, 1] if kind == 1 else
            [.66, .7, .76, .82, .87, .92, .97, 1])]
        issue = ("Onboarding stalled after administrator handover" if kind == 0 else
                 "Webhook delivery delays affecting reporting" if kind == 1 else
                 "Expansion workspace provisioning question")
        days = [24, 38, 112][kind] + i * 2
        contacts = ["Taylor Quinn", "Riley Brooks", "Avery Stone"]
        accounts.append({
            "id": f"acct-{i + 1:03d}", "fictional": True, "name": name,
            "industry": ["Developer productivity", "Financial operations SaaS", "Business intelligence"][kind],
            "region": ["Europe", "North America", "Europe"][kind],
            "arr": [72000, 144000, 96000][kind] + i * 3200, "currency": "USD",
            "plan": ["Growth", "Enterprise", "Scale"][kind], "owner": owners[i % 4],
            "seats_licensed": seats, "seats_active": active, "weekly_active_users": usage,
            "usage_weeks": [(today - timedelta(weeks=7 - w)).isoformat() for w in range(8)],
            "features": [{"name": feature, "adoption_percent": percent}
                         for feature, percent in zip(["Workflows", "Analytics", "Integrations", "Automation"],
                                                   [[31, 18, 23, 11], [78, 68, 71, 64], [94, 87, 91, 82]][kind])],
            "renewal_date": (today + timedelta(days=days)).isoformat(),
            "contract_start": (today - timedelta(days=365 - days)).isoformat(),
            "renewal_terms": "Annual subscription; commercial terms require account-team review.",
            "csat": [2.5, 3.1, 4.8][kind],
            "sentiment": ["Concerned about unrealized value and onboarding effort",
                          "Frustrated by a recurring production integration issue",
                          "Positive; champion requested a second-team evaluation"][kind],
            "support": {
                "open_cases": [2, 4, 1][kind], "critical_cases": [0, 1, 0][kind],
                "issues": [{"id": f"SYN-{1000 + i}", "title": issue,
                            "severity": ["medium", "critical", "low"][kind],
                            "status": ["Awaiting customer", "Escalated to engineering", "In progress"][kind],
                            "opened_date": (today - timedelta(days=[12, 6, 2][kind])).isoformat(),
                            "detail": ["New admin has not attended training; no rollout owner confirmed.",
                                       "Retry backlog remains open; engineering has a reproduction. No fix date promised.",
                                       "Champion wants to understand workspace governance before adding seats."][kind]}]},
            "contact": {"name": contacts[kind], "role": ["Operations Director", "VP Engineering", "Head of Analytics"][kind],
                        "email": f"champion@account-{i + 1:03d}.example"},
            "last_touchpoint": (today - timedelta(days=[21, 3, 5][kind])).isoformat(),
            "context": [
                "Purchased for a cross-team rollout; usage fell after the original administrator changed roles. "
                "Only the pilot group uses core workflows; executive value review has not been scheduled.",
                "Broad adoption but a critical integration escalation is weakening sponsor confidence. "
                "Weekly engineering updates were requested before the next renewal discussion.",
                "Strong multi-feature engagement; champion has requested a second-team expansion evaluation. "
                "No expansion budget or commercial commitment has been confirmed.",
            ][kind],
            "positive_evidence": [
                ["Sponsor still attends monthly steering meetings", "Pilot team continues using workflows"],
                ["Core users remain active", "Engineering has reproduced the integration defect"],
                ["Usage increased across eight weeks", "Champion requested an expansion evaluation"],
            ][kind],
            "missing_evidence": ["Cancellation terms", "Confirmed budget", "Decision-maker interview"],
            "recent_activity": [
                {"date": (today - timedelta(days=2)).isoformat(),
                 "title": ["Adoption checkpoint", "Engineering escalation update", "Expansion discovery"][kind],
                 "detail": ["Activation reminders shared with the new admin.",
                            "Reproduction shared; support case remains unresolved.",
                            "Champion asked about an additional team workspace."][kind]},
                {"date": (today - timedelta(days=9)).isoformat(), "title": "Success review",
                 "detail": "CSM reviewed usage and recorded the current account evidence."},
            ],
            "notes": "", "seeded_on": today.isoformat(),
        })
    return accounts
