from datetime import datetime, timedelta, timezone


def seed():
    anchor = datetime(2026, 10, 15, 14, 0, tzinfo=timezone.utc)

    def stamp(minutes):
        return (anchor + timedelta(minutes=minutes)).isoformat().replace("+00:00", "Z")

    sites = [
        {"id": "s1", "name": "Northstar Works", "location": "Gothenburg, Sweden", "specialty": "Precision assemblies"},
        {"id": "s2", "name": "Riverside Plant", "location": "Turku, Finland", "specialty": "Fluid systems"},
        {"id": "s3", "name": "Atlas Foundry", "location": "Aarhus, Denmark", "specialty": "Industrial components"},
    ]
    causes = [
        ("Elevated drive vibration", "VIB-204", "Vibration rose during the last batch; unusual drive noise reported.", "critical"),
        ("Conveyor feed interruption", "JAM-112", "Intermittent product accumulation at the infeed sensor.", "high"),
        ("Cooling temperature excursion", "TMP-087", "Housing temperature drifted upward after changeover.", "high"),
        ("Dimensional reject increase", "QAL-031", "Quality sampling flagged variation on the latest batch.", "medium"),
        ("Pneumatic pressure instability", "PRS-056", "Pressure fluctuated during the clamping cycle.", "high"),
        ("Cycle time drift", "CYC-019", "Cycles are taking longer; no confirmed mechanical diagnosis.", "medium"),
    ]
    lines, machines, telemetry, incidents = [], [], [], []
    for i in range(6):
        planned = 480
        downtime = [62, 24, 37, 19, 31, 15][i]
        ideal_rate = [12, 10, 14, 9, 11, 13][i]
        output = int((planned - downtime) * ideal_rate * (0.9 + i * 0.009))
        rejects = [83, 45, 69, 31, 42, 37][i]
        lines.append({
            "id": f"l{i + 1}", "site_id": f"s{i // 2 + 1}", "name": ["Assembly A", "Packaging B", "Hydraulics A", "Finishing B", "Machining A", "Inspection B"][i],
            "planned_minutes": planned, "downtime_minutes": downtime, "ideal_rate": ideal_rate,
            "output": output, "rejects": rejects, "target": planned * ideal_rate,
        })
        for j in range(3):
            n = i * 3 + j
            fault = causes[n % 6]
            machine_id = f"m{n + 1:02}"
            machines.append({
                "id": machine_id, "line_id": f"l{i + 1}", "name": f"{['Drive station', 'Transfer conveyor', 'Process cell'][j]} {i + 1:02}",
                "health": "Critical" if n == 0 else ("Attention" if n % 3 == 0 else "Healthy"),
                "utilization": round((planned - downtime) / planned * (0.94 + j * 0.02), 3),
                "last_maintenance": stamp(-1440 * (8 + n)), "alert": fault[0] if n % 3 == 0 else "No active equipment alert",
            })
            for k in range(4):
                telemetry.append({
                    "id": f"t{n:02}-{k}", "machine_id": machine_id, "timestamp": stamp(-45 + k * 15),
                    "vibration_mm_s": round(2.1 + (k * 1.4 if n % 6 == 0 else k * 0.12) + j * 0.1, 1),
                    "temperature_c": round(58 + (k * 6 if n % 6 == 2 else k * 0.7) + i, 1),
                    "pressure_bar": round(5.8 - (k * 0.45 if n % 6 == 4 else k * 0.03), 2),
                    "cycle_seconds": round(60 / ideal_rate + k * 0.2, 2),
                    "fault_code": fault[1] if n % 3 == 0 and k > 1 else None,
                })
    for n in range(24):
        machine = machines[n % 18]
        cause = causes[n % 6]
        incidents.append({
            "id": f"INC-{1042 + n}", "machine_id": machine["id"], "title": cause[0],
            "severity": cause[3] if n < 18 else "low", "fault_code": cause[1],
            "downtime_minutes": [28, 9, 17, 6, 13, 4][n % 6],
            "timestamp": stamp(-n * 23), "impact": "Interrupted batch flow; potential output delay. Synthetic estimate, not confirmed loss.",
            "notes": cause[2], "state": "Open", "revision": 1,
            "investigation": None, "investigation_review": None, "plan": None, "approval": None,
        })
    return {
        "schema_version": 1, "synthetic": True, "snapshot_at": stamp(0),
        "sites": sites, "lines": lines, "machines": machines, "telemetry": telemetry,
        "incidents": incidents,
        "activity": [{"id": "seed", "timestamp": stamp(0), "incident_id": None, "kind": "seed",
                      "message": "Synthetic shift snapshot initialized. No AI responses are preloaded.", "actor": "System"}],
        "jobs": {}, "ai": {"active_job": None, "next_eligible_at": None, "daily_date": "", "daily_calls": 0},
    }
