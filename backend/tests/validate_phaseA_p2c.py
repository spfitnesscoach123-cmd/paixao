"""End-to-end validation of the P2C fix on real data (Fase A).

Compares OLD vs NEW behaviour of the read-paths using the actual session
'Match vs Al Araby' where W-UP was designated as session_total_period.
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from bson import ObjectId
from config import db
from utils.gps_session_resolver import resolve_session_records


def _sum_distance(records):
    return sum(r.get("total_distance", 0) or 0 for r in records)


async def simulate_endpoint_aggregation(records, sessions_with_designated_total):
    """Mirror the inner loop of /dashboard/team-table after P2C."""
    grouped = {}
    for rec in records:
        try:
            d = rec["date"]
        except KeyError:
            continue
        sname = rec.get("session_name") or "default"
        grouped.setdefault(d, {}).setdefault(sname, []).append(rec)

    total_dist = 0.0
    for date_str, sessions_map in grouped.items():
        for sname, recs in sessions_map.items():
            if (f"{date_str}_{sname}" in sessions_with_designated_total
                    and not any(r.get("record_type") == "session_total" for r in recs)):
                continue  # P2C skip
            source = resolve_session_records(recs)
            for r in source:
                total_dist += r.get("total_distance", 0) or 0
    return total_dist


async def main():
    session_name = "Match vs Al Araby"
    all_recs = await db.gps_data.find({"session_name": session_name}).to_list(2000)
    coach_id = all_recs[0]["coach_id"]
    print(f"Session '{session_name}' — total records: {len(all_recs)}, coach_id={coach_id}")

    # Build the session-wide designation set the way the endpoints do
    sessions_with_designated_total = {
        f"{r.get('date')}_{r.get('session_name') or 'default'}"
        for r in all_recs if r.get("record_type") == "session_total"
    }
    print(f"Designated keys: {sessions_with_designated_total}")

    # Index per athlete
    by_ath = {}
    for r in all_recs:
        by_ath.setdefault(r.get("athlete_id"), []).append(r)

    print("\n=== Per-athlete OLD vs NEW (Match vs Al Araby) ===")
    print(f"{'Athlete':30}  has_session_total  OLD (P2 inflated)   NEW (P2C)   Δ")
    for aid, recs in by_ath.items():
        ath = await db.athletes.find_one({"_id": ObjectId(aid)}) if len(aid) == 24 else None
        name = (ath.get("name") if ath else aid)[:28]
        has_total = any(r.get("record_type") == "session_total" for r in recs)
        old = _sum_distance(resolve_session_records(recs))
        new = await simulate_endpoint_aggregation(recs, sessions_with_designated_total)
        marker = "✓" if has_total else "✗"
        print(f"{name:30}  {marker}                {old:12.2f}   {new:12.2f}   {new-old:+.2f}")

    print("\n=== Legacy session check (no designation) ===")
    # Pick a legacy session (no record_type) and verify both paths produce identical numbers
    legacy_session = await db.gps_data.find_one({
        "record_type": None,
        "session_name": {"$ne": session_name}
    })
    if legacy_session:
        ls_name = legacy_session["session_name"]
        ls_recs_all = await db.gps_data.find({"session_name": ls_name}).to_list(2000)
        ls_designated = {
            f"{r.get('date')}_{r.get('session_name') or 'default'}"
            for r in ls_recs_all if r.get("record_type") == "session_total"
        }
        print(f"Legacy session: '{ls_name}'  (designated keys: {ls_designated or '∅'})")
        # Pick first athlete with records there
        first_ath = ls_recs_all[0].get("athlete_id") if ls_recs_all else None
        if first_ath:
            ath_recs = [r for r in ls_recs_all if r.get("athlete_id") == first_ath]
            old = _sum_distance(resolve_session_records(ath_recs))
            new = await simulate_endpoint_aggregation(ath_recs, ls_designated)
            print(f"  OLD = {old:.2f}   NEW = {new:.2f}   Δ = {new-old:+.2f}")


if __name__ == "__main__":
    asyncio.run(main())
