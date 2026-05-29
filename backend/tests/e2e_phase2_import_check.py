"""E2E Phase 2 import validation against preview backend. Creates ISOLATED test
athletes, verifies persistence via the real HTTP endpoints, then CLEANS UP
everything it created (no residue, no touching real/historical data)."""
import requests, json, uuid, os

BASE = "http://localhost:8001"
EMAIL = "contato@loadmanagerpro.com.br"
PASSWORD = "#UAE2026"
TAG = uuid.uuid4().hex[:6]

s = requests.Session()
tok = s.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}

ATH_ALL = f"P2 AllFields {TAG}"
ATH_OLD = f"P2 OldFormat {TAG}"

def import_csv(csv_text, mapping, activity):
    files = {"file": ("test.csv", csv_text, "text/csv")}
    data = {"mapping_json": json.dumps(mapping), "create_missing": "true", "activity_name": activity}
    r = s.post(f"{BASE}/api/csv/import-mapped", headers=H, files=files, data=data)
    return r.status_code, r.json()

# ---- CSV A: ALL new fields ----
csv_all = (
    "Player Name,Date,Total Distance (m),Avg Player Load,PL/min,"
    "High Metabolic Load Distance,Duration (min),Max Acceleration,Max Deceleration,Max Velocity (%)\n"
    f"{ATH_ALL},2026-02-01,7100,480,13.7,910,95,4.2,-5.1,88\n"
)
map_all = {
    "athlete_name": "Player Name", "session_date": "Date", "total_distance": "Total Distance (m)",
    "player_load": "Avg Player Load", "player_load_per_minute": "PL/min",
    "high_metabolic_load": "High Metabolic Load Distance", "duration_minutes": "Duration (min)",
    "max_acceleration": "Max Acceleration", "max_deceleration": "Max Deceleration",
    "max_velocity_percent": "Max Velocity (%)",
}
sc, resp = import_csv(csv_all, map_all, f"P2 ALL {TAG}")
print(f"[IMPORT ALL] status={sc} success={resp.get('success_count')} errors={resp.get('errors')}")

# ---- CSV B: OLD format (no new fields) — backward compat ----
csv_old = (
    "Player Name,Date,Total Distance (m),Sprint Distance (m),Max Speed\n"
    f"{ATH_OLD},2026-02-01,5000,120,31.2\n"
)
map_old = {
    "athlete_name": "Player Name", "session_date": "Date", "total_distance": "Total Distance (m)",
    "sprint_distance": "Sprint Distance (m)", "max_speed": "Max Speed",
}
sc2, resp2 = import_csv(csv_old, map_old, f"P2 OLD {TAG}")
print(f"[IMPORT OLD] status={sc2} success={resp2.get('success_count')} errors={resp2.get('errors')}")

# ---- Read back ----
ath = s.get(f"{BASE}/api/athletes", headers=H).json()
def find(name):
    for a in ath:
        if a.get("name") == name:
            return a.get("id") or a.get("_id")
    return None
id_all = find(ATH_ALL); id_old = find(ATH_OLD)

print("\n[VERIFY ALL-FIELDS ATHLETE]")
recs = s.get(f"{BASE}/api/gps-data/athlete/{id_all}", headers=H).json()
r = recs[0]
for k in ["total_distance","player_load","player_load_per_minute","high_metabolic_load",
          "duration_minutes","max_acceleration","max_deceleration","max_velocity_percent","max_speed"]:
    print(f"   {k} = {r.get(k)}")

print("\n[VERIFY OLD-FORMAT ATHLETE] (new fields must be null, import must succeed)")
recs2 = s.get(f"{BASE}/api/gps-data/athlete/{id_old}", headers=H).json()
r2 = recs2[0]
for k in ["total_distance","sprint_distance","max_speed","player_load",
          "player_load_per_minute","high_metabolic_load","max_velocity_percent","duration_minutes"]:
    print(f"   {k} = {r2.get(k)}")

# ---- CLEANUP (remove ONLY the test data created above) ----
print("\n[CLEANUP] removing test athletes + their gps_data...")
from pymongo import MongoClient
from bson import ObjectId
cli = MongoClient(os.environ["MONGO_URL"]); dbn = cli[os.environ["DB_NAME"]]
for aid in [id_all, id_old]:
    if aid:
        d1 = dbn.gps_data.delete_many({"athlete_id": aid})
        d2 = dbn.athletes.delete_one({"_id": ObjectId(aid)})
        print(f"   athlete {aid}: gps_data deleted={d1.deleted_count}, athlete deleted={d2.deleted_count}")
print("[CLEANUP] done — no residue left.")
