"""
Validação matemática Etapa 2A — comparação antes vs depois.

Compara, sobre dados REAIS, o resultado de `extract_gps_metrics_from_session`
ANTES da migração (cópia local congelada) versus DEPOIS (atual, via resolver).

Cobertura: 2 atletas, janelas 7d e 28d, agrupadas por (date, session_name).
Não persiste nada. Não dispara recálculo. Apenas diff em memória.
"""

import asyncio
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from config import db
from routes.periodization.routes import extract_gps_metrics_from_session as NEW_extract


# -------------------------------------------------------------------------
# Cópia LITERAL da implementação ANTIGA (congelada antes da Etapa 2A)
# -------------------------------------------------------------------------
def OLD_extract_gps_metrics_from_session(gps_records):
    if not gps_records:
        return {
            "total_distance": 0, "hid_z3": 0, "hsr_z4": 0,
            "sprint_z5": 0, "sprints_count": 0, "acc_dec_total": 0,
        }

    if len(gps_records) == 1 and "has_session_total" in gps_records[0]:
        r = gps_records[0]
        return {
            "total_distance": r.get("total_distance", 0),
            "hid_z3": r.get("high_intensity_distance", 0),
            "hsr_z4": r.get("high_speed_running", 0),
            "sprint_z5": r.get("sprint_distance", 0),
            "sprints_count": r.get("number_of_sprints", 0),
            "acc_dec_total": (
                r.get("number_of_accelerations", 0) +
                r.get("number_of_decelerations", 0)
            ),
        }

    _SESSION_KEYWORDS = {"session", "total", "full", "complete", "summary", "sessão"}
    _PERIOD_KEYWORDS = {"half", "1st", "2nd", "period", "split", "tempo", "parte"}

    session_total_record = None
    period_records = []
    for record in gps_records:
        pname = (record.get("period_name") or "").lower()
        is_session_total = any(kw in pname for kw in _SESSION_KEYWORDS)
        is_period = any(kw in pname for kw in _PERIOD_KEYWORDS)
        if is_session_total and not is_period:
            if session_total_record is None:
                session_total_record = record
        else:
            period_records.append(record)

    if session_total_record:
        source = [session_total_record]
    elif period_records:
        source = period_records
    else:
        source = gps_records

    metrics = {
        "total_distance": 0, "hid_z3": 0, "hsr_z4": 0,
        "sprint_z5": 0, "sprints_count": 0, "acc_dec_total": 0,
    }
    for record in source:
        metrics["total_distance"] += record.get("total_distance", 0)
        metrics["hid_z3"] += record.get("high_intensity_distance", 0)
        metrics["hsr_z4"] += record.get("high_speed_running", 0)
        metrics["sprint_z5"] += record.get("sprint_distance", 0)
        metrics["sprints_count"] += record.get("number_of_sprints", 0)
        metrics["acc_dec_total"] += (
            record.get("number_of_accelerations", 0) +
            record.get("number_of_decelerations", 0)
        )
    return metrics


async def fetch_athletes(limit=2):
    """Pick 2 athletes with GPS data available."""
    cursor = db.athletes.find({}).limit(50)
    candidates = await cursor.to_list(50)
    selected = []
    for a in candidates:
        aid = str(a["_id"])
        cnt = await db.gps_data.count_documents({"athlete_id": aid})
        if cnt > 0:
            selected.append((aid, a.get("name", "?"), cnt))
        if len(selected) >= limit:
            break
    return selected


def group_by_date_session(records):
    grouped = {}
    for r in records:
        d = r.get("date") or "?"
        sname = r.get("session_name") or "default"
        grouped.setdefault((d, sname), []).append(r)
    return grouped


async def validate_for_athlete(athlete_id, name, window_days):
    # Find latest GPS date for this athlete (data is historical in pre-prod)
    latest = await db.gps_data.find_one(
        {"athlete_id": athlete_id},
        sort=[("date", -1)]
    )
    if not latest:
        return {
            "athlete_id": athlete_id, "name": name, "window_days": window_days,
            "sessions": 0, "identical": 0, "diverged_count": 0,
            "diverged_examples": [], "metric_diverged_count": {}, "metric_total_abs_diff": {},
            "note": "no GPS data"
        }
    latest_date = datetime.strptime(latest["date"], "%Y-%m-%d")
    cutoff = (latest_date - timedelta(days=window_days)).strftime("%Y-%m-%d")
    records = await db.gps_data.find({
        "athlete_id": athlete_id,
        "date": {"$gte": cutoff}
    }).to_list(2000)

    grouped = group_by_date_session(records)
    total_sessions = len(grouped)
    identical = 0
    diverged = []

    metric_keys = ["total_distance", "hid_z3", "hsr_z4", "sprint_z5", "sprints_count", "acc_dec_total"]
    metric_diffs = {k: 0.0 for k in metric_keys}
    metric_diverged_count = {k: 0 for k in metric_keys}

    for (date, sname), recs in grouped.items():
        old = OLD_extract_gps_metrics_from_session(recs)
        new = NEW_extract(recs)
        if old == new:
            identical += 1
        else:
            diverged.append({
                "date": date, "session": sname, "n_records": len(recs),
                "old": old, "new": new
            })
            for k in metric_keys:
                if old.get(k, 0) != new.get(k, 0):
                    metric_diverged_count[k] += 1
                    metric_diffs[k] += abs(float(new.get(k, 0)) - float(old.get(k, 0)))

    return {
        "athlete_id": athlete_id, "name": name, "window_days": window_days,
        "sessions": total_sessions, "identical": identical,
        "diverged_count": len(diverged), "diverged_examples": diverged[:3],
        "metric_diverged_count": metric_diverged_count,
        "metric_total_abs_diff": metric_diffs,
    }


async def main():
    athletes = await fetch_athletes(limit=2)
    print(f"Selected athletes: {[(n, c) for _, n, c in athletes]}")
    print()
    for aid, name, _cnt in athletes:
        for win in (7, 28):
            r = await validate_for_athlete(aid, name, win)
            print(f"=== {r['name']} ({r['athlete_id'][:8]}...) — window {win}d ===")
            print(f"  sessions={r['sessions']} identical={r['identical']} diverged={r['diverged_count']}")
            if r["diverged_count"] > 0:
                print(f"  metric_diverged_count: {r['metric_diverged_count']}")
                print(f"  metric_total_abs_diff: {r['metric_total_abs_diff']}")
                for d in r["diverged_examples"]:
                    print(f"   - {d['date']}/{d['session']} (n={d['n_records']}): old={d['old']} new={d['new']}")
            print()


if __name__ == "__main__":
    asyncio.run(main())
