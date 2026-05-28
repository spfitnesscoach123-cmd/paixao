"""READ-ONLY probe against the CURRENT preview pod (localhost:8001). No writes."""
import requests, json, sys

BASE = "http://localhost:8001"
EMAIL = "contato@loadmanagerpro.com.br"
PASSWORD = "#UAE2026"

s = requests.Session()
r = s.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
print(f"[LOGIN preview] status={r.status_code}")
if r.status_code != 200:
    print(r.text[:400]); sys.exit(1)
tok = r.json().get("access_token") or r.json().get("token")
h = {"Authorization": f"Bearer {tok}"}

r = s.get(f"{BASE}/api/athletes", headers=h, timeout=30)
ath = r.json()
print(f"[ATHLETES preview] count={len(ath)}")
larry = next((a for a in ath if "larry" in (a.get('name') or '').lower()), None)
if not larry:
    print("Larry NOT in preview DB. Names:", [a.get('name') for a in ath]); sys.exit(0)
lid = larry.get("id") or larry.get("_id")
print(f"Larry preview id={lid}")

r = s.get(f"{BASE}/api/gps-data/athlete/{lid}", headers=h, timeout=30)
raw = r.json()
tot = sum((x.get('total_distance') or 0) for x in raw)
print(f"\n[RAW preview] records={len(raw)} client_sum={tot}m={tot/1000:.2f}km")
for x in raw:
    print(f"   date={x.get('date')} session={x.get('session_name')} period={x.get('period_name')} rt={x.get('record_type')} td={x.get('total_distance')}")

for params in ["lang=pt&date_range=7d", "lang=pt&date_range=today",
               "lang=pt&date_range=today&session_name=hatta"]:
    r = s.get(f"{BASE}/api/dashboard/team-table?{params}", headers=h, timeout=60)
    data = r.json()
    rows = data if isinstance(data, list) else (data.get("rows") or data.get("athletes") or [])
    row = next((x for x in rows if "larry" in (x.get('name') or x.get('athlete_name') or '').lower()), None)
    print(f"\n[TEAM-TABLE preview ?{params}] Larry total_distance={row.get('total_distance') if row else 'N/A'}")

r = s.get(f"{BASE}/api/dashboard/team-table/session-names?date_range=today", headers=h, timeout=30)
print(f"\n[SESSION-NAMES preview today] -> {r.text[:400]}")
r = s.get(f"{BASE}/api/dashboard/team-table/session-names?date_range=7d", headers=h, timeout=30)
print(f"[SESSION-NAMES preview 7d] -> {r.text[:400]}")
