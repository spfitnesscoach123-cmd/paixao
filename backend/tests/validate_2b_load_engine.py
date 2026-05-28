"""
Validação matemática Etapa 2B — comparação antes vs depois.

Compara o resultado de `aggregate_gps_for_date` ANTES (cópia local
congelada da implementação pré-Etapa-2B) versus DEPOIS (atual, via resolver
central). Cobertura: 2 atletas, janelas 7d e 28d, dia a dia.

Não persiste nada. Não dispara recálculo. Apenas diff em memória.
"""

import asyncio
import os
import sys
from datetime import datetime, timedelta
from typing import Dict, List

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from config import db, load_engine


# -------------------------------------------------------------------------
# Cópia LITERAL do aggregate_gps_for_date ANTES da Etapa 2B
# (keyword matching inline). Reproduz exatamente o read-path antigo.
# -------------------------------------------------------------------------
_OLD_SESSION_KW = {"session", "total", "full", "complete", "summary", "sessão"}
_OLD_PERIOD_KW = {"half", "1st", "2nd", "period", "split", "tempo", "parte"}


async def OLD_aggregate_gps_for_date(athlete_id, coach_id, date):
    gps_records = await db.gps_data.find({
        "athlete_id": athlete_id,
        "coach_id": coach_id,
        "date": date
    }).to_list(100)

    totals = {
        "distance": 0.0, "hsr": 0.0, "sprint_distance": 0.0,
        "acc_dec_load": 0.0, "high_intensity_distance": 0.0,
        "number_of_sprints": 0.0,
    }
    if not gps_records:
        return totals

    grouped: Dict[str, list] = {}
    for record in gps_records:
        sname = record.get("session_name") or "default"
        grouped.setdefault(sname, []).append(record)

    for sname, records in grouped.items():
        session_total = None
        period_recs = []
        for r in records:
            pname = (r.get("period_name") or "").lower()
            is_sess = any(kw in pname for kw in _OLD_SESSION_KW)
            is_per = any(kw in pname for kw in _OLD_PERIOD_KW)
            if is_sess and not is_per:
                if session_total is None:
                    session_total = r
            else:
                period_recs.append(r)
        source = [session_total] if session_total else (period_recs if period_recs else records)
        for r in source:
            totals["distance"] += float(r.get("total_distance", 0) or 0)
            totals["hsr"] += float(r.get("high_speed_running", 0) or 0)
            totals["sprint_distance"] += float(r.get("sprint_distance", 0) or 0)
            totals["high_intensity_distance"] += float(r.get("high_intensity_distance", 0) or 0)
            totals["number_of_sprints"] += float(r.get("number_of_sprints", 0) or 0)
            acc = float(r.get("number_of_accelerations", 0) or 0)
            dec = float(r.get("number_of_decelerations", 0) or 0)
            totals["acc_dec_load"] += acc + dec
    return totals


async def fetch_athletes_with_gps(limit=2):
    candidates = await db.athletes.find({}).limit(50).to_list(50)
    selected = []
    for a in candidates:
        aid = str(a["_id"])
        cnt = await db.gps_data.count_documents({"athlete_id": aid})
        if cnt > 0:
            selected.append({
                "id": aid,
                "name": a.get("name", "?"),
                "coach_id": a.get("coach_id"),
                "gps_count": cnt,
            })
        if len(selected) >= limit:
            break
    return selected


async def list_dates_in_window(athlete_id, window_days):
    latest = await db.gps_data.find_one(
        {"athlete_id": athlete_id}, sort=[("date", -1)]
    )
    if not latest:
        return []
    latest_dt = datetime.strptime(latest["date"], "%Y-%m-%d")
    cutoff_dt = latest_dt - timedelta(days=window_days)
    dates = await db.gps_data.distinct("date", {
        "athlete_id": athlete_id,
        "date": {"$gte": cutoff_dt.strftime("%Y-%m-%d")},
    })
    return sorted(dates)


async def validate(athlete, window_days):
    aid = athlete["id"]
    coach_id = athlete["coach_id"]
    # `coach_id` may be ObjectId in some legacy docs; the engine uses the
    # same value the GPS records carry, so we pass through unchanged.
    dates = await list_dates_in_window(aid, window_days)
    identical = 0
    diverged = []
    metric_keys = list({
        "distance", "hsr", "sprint_distance", "acc_dec_load",
        "high_intensity_distance", "number_of_sprints",
    })
    metric_diverged_count = {k: 0 for k in metric_keys}
    metric_total_abs_diff = {k: 0.0 for k in metric_keys}

    for d in dates:
        # Try with the raw coach_id; if no records, try with str form (some
        # legacy docs stored coach_id as ObjectId, others as str).
        old = await OLD_aggregate_gps_for_date(aid, coach_id, d)
        new = await load_engine.aggregate_gps_for_date(aid, coach_id, d)
        # Fallback to string coach_id if old returned all zeros (possible
        # coach_id type mismatch in legacy data) — but compare same path.
        if all(v == 0.0 for v in old.values()):
            coach_id_str = str(coach_id)
            old2 = await OLD_aggregate_gps_for_date(aid, coach_id_str, d)
            if any(v != 0.0 for v in old2.values()):
                old = old2
                new = await load_engine.aggregate_gps_for_date(aid, coach_id_str, d)

        if old == new:
            identical += 1
        else:
            diverged.append({"date": d, "old": old, "new": new})
            for k in metric_keys:
                if old.get(k, 0) != new.get(k, 0):
                    metric_diverged_count[k] += 1
                    metric_total_abs_diff[k] += abs(float(new.get(k, 0)) - float(old.get(k, 0)))

    return {
        "athlete": athlete["name"], "id": aid, "window_days": window_days,
        "days": len(dates), "identical": identical,
        "diverged_count": len(diverged),
        "diverged_examples": diverged[:3],
        "metric_diverged_count": metric_diverged_count,
        "metric_total_abs_diff": metric_total_abs_diff,
    }


async def main():
    athletes = await fetch_athletes_with_gps(limit=2)
    print(f"Selected athletes: {[(a['name'], a['gps_count']) for a in athletes]}")
    print()
    for a in athletes:
        for win in (7, 28):
            r = await validate(a, win)
            print(f"=== {r['athlete']} ({r['id'][:8]}…) — window {win}d ===")
            print(f"  days={r['days']} identical={r['identical']} diverged={r['diverged_count']}")
            if r["diverged_count"] > 0:
                print(f"  metric_diverged_count: {r['metric_diverged_count']}")
                print(f"  metric_total_abs_diff: {r['metric_total_abs_diff']}")
                for d in r["diverged_examples"]:
                    print(f"   - {d['date']}: old={d['old']}")
                    print(f"     new={d['new']}")
            print()


if __name__ == "__main__":
    asyncio.run(main())
