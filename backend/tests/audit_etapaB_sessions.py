"""ETAPA B — SESSION TRACE.
Exhaustively list every session candidate matching the screenshot label
'HATTA' / 'match vs hatta league' across ALL databases and ALL coaches.
ZERO writes, ZERO assumptions."""
import os
import sys
from collections import defaultdict

from pymongo import MongoClient

MONGO_URL = "mongodb://localhost:27017"
client = MongoClient(MONGO_URL)

print("=" * 90)
print("ETAPA B — exhaustive SESSION TRACE across ALL DBs / ALL coaches / ALL collections")
print("=" * 90)

PATTERNS = ["hatta", "match", "league"]

for dbname in client.list_database_names():
    if dbname in ("admin", "config", "local"):
        continue
    db = client[dbname]
    cols = db.list_collection_names()
    print(f"\n{'#'*80}\n[DB={dbname}] collections={cols}\n{'#'*80}")

    # Search for any collection that might hold session-level docs
    for col in cols:
        # Inspect any collection that has a "session_name" or "session_id" or "name" field
        sample = db[col].find_one()
        if not sample:
            continue
        fields = list(sample.keys())
        has_sn = "session_name" in fields
        has_sid = "session_id" in fields
        has_name = "name" in fields or "title" in fields
        if not (has_sn or has_sid or has_name):
            continue
        print(f"\n  --- collection={col} (sample fields: {fields[:15]})")
        # 1) distinct session_name matching patterns
        if has_sn:
            for pat in PATTERNS:
                vals = db[col].distinct("session_name", {"session_name": {"$regex": pat, "$options": "i"}})
                if vals:
                    print(f"      session_name~={pat!r}: {vals}")
        # 2) distinct session_id matching patterns
        if has_sid:
            for pat in PATTERNS:
                vals = db[col].distinct("session_id", {"session_id": {"$regex": pat, "$options": "i"}})
                if vals:
                    print(f"      session_id~={pat!r}: {vals}")
        # 3) name / title matching
        if "name" in fields:
            for pat in PATTERNS:
                vals = db[col].distinct("name", {"name": {"$regex": pat, "$options": "i"}})
                if vals:
                    print(f"      name~={pat!r}: {vals}")
        if "title" in fields:
            for pat in PATTERNS:
                vals = db[col].distinct("title", {"title": {"$regex": pat, "$options": "i"}})
                if vals:
                    print(f"      title~={pat!r}: {vals}")

# Deep-dive into football_training.gps_data: full enumeration of session_name values
print("\n" + "=" * 90)
print("DEEP DIVE — football_training.gps_data ALL DISTINCT session_name")
print("=" * 90)
fdb = client["football_training"]
all_sn = fdb.gps_data.distinct("session_name")
for sn in sorted([s for s in all_sn if s], key=lambda s: s.lower()):
    n = fdb.gps_data.count_documents({"session_name": sn})
    dates = fdb.gps_data.distinct("date", {"session_name": sn})
    coaches = fdb.gps_data.distinct("coach_id", {"session_name": sn})
    print(f"  {sn!r:<50} count={n:<4} coaches={len(coaches)} dates={sorted(dates)[:5]}{'...' if len(dates)>5 else ''}")

# Find coach for "loadmanagerpro" user
print("\n" + "=" * 90)
print("USERS audit — find coach matching contato@loadmanagerpro.com.br")
print("=" * 90)
for dbname in ["football_training", "loadmanager", "sports_science"]:
    db = client[dbname]
    if "users" in db.list_collection_names():
        u = db.users.find_one({"email": {"$regex": "loadmanagerpro", "$options": "i"}})
        if u:
            print(f"  DB={dbname}  user._id={u.get('_id')}  email={u.get('email')}")
            # athletes for that coach
            coach_id_str = str(u["_id"])
            n_ath = db.athletes.count_documents({"coach_id": coach_id_str}) if "athletes" in db.list_collection_names() else "no athletes col"
            print(f"  athletes for coach_id={coach_id_str}: {n_ath}")
            if "gps_data" in db.list_collection_names():
                n_gps = db.gps_data.count_documents({"coach_id": coach_id_str})
                sns = db.gps_data.distinct("session_name", {"coach_id": coach_id_str})
                print(f"  gps_data for this coach: count={n_gps}  session_names={sns}")

print("\n[DONE]")
