"""Read-only forensic audit reproducing the EXACT runtime path that powers the
Team Dashboard StackedBarChart tooltip the user is seeing in the screenshot.

DOES NOT mutate DB, DOES NOT alter any code. Only reads, prints, verifies.

Backend access logs prove the actual frontend call uses:
    GET /api/dashboard/team-table?lang=pt&date_range=90d&session_name=ctr-report-md4-w3-league-hatta

So the *real* runtime path uses the slug 'ctr-report-md4-w3-league-hatta',
NOT just 'HATTA' (which is only the UI display label).
"""
import asyncio
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta

sys.path.insert(0, "/app/backend")

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from bson import ObjectId  # noqa: E402

from utils.gps_session_resolver import (  # noqa: E402
    resolve_session_records,
    _is_legacy_session_keyword,
)

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


async def _resolve_athlete_name(db, aid):
    if aid is None:
        return "<no-athlete_id>"
    doc = await db.athletes.find_one({"_id": aid})
    if doc is None:
        try:
            doc = await db.athletes.find_one({"_id": ObjectId(aid)})
        except Exception:
            doc = None
    return doc.get("name") if doc else f"<unknown {aid}>"


async def _audit_session_window(db, coach_id, window_days, window_label, session_filter):
    print(f"\n{'#'*82}")
    print(f"# WINDOW={window_label}  session_name=={session_filter!r}")
    print(f"{'#'*82}")
    today = datetime.utcnow()
    filter_start = today - timedelta(days=window_days)
    filter_start_str = filter_start.strftime("%Y-%m-%d")
    print(f"[WINDOW] today={today.strftime('%Y-%m-%d')}  start={filter_start_str}")

    all_gps = await db.gps_data.find({
        "coach_id": coach_id,
        "date": {"$gte": filter_start_str},
    }).to_list(5000)
    print(f"[GPS-all] {len(all_gps)} records in window")

    distinct = sorted({(r.get("session_name") or "").strip() for r in all_gps})
    print(f"[GPS-all] distinct session_name values: {distinct}")

    filtered = [r for r in all_gps if (r.get("session_name") or "").strip() == session_filter.strip()]
    print(f"[GPS-filtered] {len(filtered)} records after session_name filter")
    if not filtered:
        return

    sessions_with_designated_total = {
        f"{r.get('date')}_{r.get('session_name') or 'default'}"
        for r in filtered if r.get("record_type") == "session_total"
    }
    print(f"[P2C] sessions_with_designated_total={sessions_with_designated_total}")

    by_athlete = defaultdict(list)
    for r in filtered:
        by_athlete[r.get("athlete_id")].append(r)
    print(f"[P2C] athletes touching this session: {len(by_athlete)}")

    for aid, recs in by_athlete.items():
        aname = await _resolve_athlete_name(db, aid)
        print(f"\n  → {aname}  athlete_id={aid}  records={len(recs)}")
        for r in recs:
            print(
                "      date={d:<12} period={p!r:<26} record_type={rt!r:<18} "
                "has_session_total={hst!r:<5} TD={td!r}".format(
                    d=str(r.get("date")), p=r.get("period_name"),
                    rt=r.get("record_type"), hst=r.get("has_session_total"),
                    td=r.get("total_distance"),
                )
            )

        grouped = defaultdict(lambda: defaultdict(list))
        for r in recs:
            d = r.get("date")
            try:
                datetime.strptime(d, "%Y-%m-%d")
            except Exception:
                continue
            sname = r.get("session_name") or "default"
            grouped[d][sname].append(r)

        athlete_total = 0.0
        for date_str, sessions_map in grouped.items():
            for sname, records in sessions_map.items():
                key = f"{date_str}_{sname}"
                in_designated = key in sessions_with_designated_total
                has_total = any(rr.get("record_type") == "session_total" for rr in records)
                if in_designated and not has_total:
                    print(f"      [P2C-SKIP] key={key}")
                    continue
                source = resolve_session_records(records)
                if any(rr.get("record_type") == "session_total" for rr in records):
                    priority = "P1"
                elif any(rr.get("record_type") for rr in records):
                    priority = "P2"
                elif any(rr.get("has_session_total") is True for rr in records):
                    priority = "P3"
                elif any(_is_legacy_session_keyword(rr) for rr in records):
                    priority = "P4"
                else:
                    priority = "P5"
                td_subtotal = sum((rr.get("total_distance") or 0) for rr in source)
                athlete_total += td_subtotal
                print(
                    f"      [RESOLVE] key={key} priority={priority} "
                    f"src_count={len(source)} subtotal_TD={td_subtotal}"
                )
        print(f"      [TOTAL TD for {aname}] = {athlete_total} m  ({athlete_total/1000:.2f} km)")


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    print("=" * 82)
    print("FORENSIC RUNTIME AUDIT — Team Dashboard → /api/dashboard/team-table")
    print("=" * 82)

    larry = await db.athletes.find_one({"name": {"$regex": "Larry", "$options": "i"}})
    if not larry:
        print("[FATAL] Larry not found")
        return
    print(f"[ATHLETE] Larry _id={larry['_id']}  coach_id={larry.get('coach_id')}")
    coach_id = larry["coach_id"]

    for window_days, window_label in [(7, "7d"), (90, "90d")]:
        for session_filter in ["HATTA", "ctr-report-md4-w3-league-hatta"]:
            await _audit_session_window(db, coach_id, window_days, window_label, session_filter)

    client.close()
    print("\n[AUDIT COMPLETE]")


if __name__ == "__main__":
    asyncio.run(main())
