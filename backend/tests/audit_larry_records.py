"""Direct DB probe: what GPS records does Larry have, period?"""
import asyncio, os, sys
sys.path.insert(0, "/app/backend")
from motor.motor_asyncio import AsyncIOMotorClient
from collections import defaultdict

async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    larry = await db.athletes.find_one({"name": {"$regex": "Larry", "$options": "i"}})
    aid = str(larry["_id"])
    coach_id = larry["coach_id"]
    print(f"Larry _id={aid}  coach_id={coach_id}")

    # All Larry's GPS records (all-time)
    cursor = db.gps_data.find({"athlete_id": aid, "coach_id": coach_id}).sort("date", -1)
    recs = await cursor.to_list(2000)
    print(f"Total GPS records for Larry: {len(recs)}")

    by_date_session = defaultdict(list)
    for r in recs:
        key = f"{r.get('date')} / {r.get('session_name')}"
        by_date_session[key].append(r)

    for key, group in sorted(by_date_session.items(), reverse=True)[:30]:
        print(f"\n  [{key}]   records={len(group)}")
        for r in group:
            print(
                f"    period={r.get('period_name')!r:<25} "
                f"record_type={r.get('record_type')!r:<18} "
                f"has_session_total={r.get('has_session_total')!r:<5} "
                f"TD={r.get('total_distance')}  "
                f"Z3={r.get('high_intensity_distance')} "
                f"Z4={r.get('high_speed_running')} "
                f"Z5={r.get('sprint_distance')}"
            )

    # Also check date range last 7d
    from datetime import datetime, timedelta
    today = datetime.utcnow()
    start = (today - timedelta(days=7)).strftime("%Y-%m-%d")
    print(f"\n7d window starts at: {start}")
    recent = await db.gps_data.find({
        "athlete_id": aid, "coach_id": coach_id, "date": {"$gte": start}
    }).to_list(2000)
    print(f"Larry records in 7d: {len(recent)}")
    for r in recent:
        print(f"    date={r.get('date')} sess={r.get('session_name')!r} period={r.get('period_name')!r} TD={r.get('total_distance')} record_type={r.get('record_type')!r}")

    client.close()

if __name__ == "__main__":
    asyncio.run(main())
