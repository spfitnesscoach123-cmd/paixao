"""READ-ONLY forensic probe against Railway production. No writes."""
import requests, json, sys

BASE = "https://paixao-production.up.railway.app"
EMAIL = "contato@loadmanagerpro.com.br"
PASSWORD = "#UAE2026"

def jprint(label, obj):
    print(f"\n===== {label} =====")
    print(json.dumps(obj, indent=2, ensure_ascii=False, default=str)[:4000])

s = requests.Session()
# 1. LOGIN
r = s.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
print(f"[LOGIN] host={BASE} status={r.status_code}")
if r.status_code != 200:
    print(r.text[:500]); sys.exit(1)
tok = r.json().get("access_token") or r.json().get("token")
print(f"[LOGIN] token_obtained={bool(tok)}")
h = {"Authorization": f"Bearer {tok}"}

# 2. LIST ATHLETES -> find Larry
r = s.get(f"{BASE}/api/athletes", headers=h, timeout=30)
ath = r.json()
print(f"\n[ATHLETES] count={len(ath)}")
larry = None
for a in ath:
    nm = (a.get("name") or "").lower()
    if "larry" in nm:
        larry = a
        print(f"  FOUND Larry keys={list(a.keys())}")
        print(f"  Larry full obj: {json.dumps(a, ensure_ascii=False, default=str)[:800]}")
if not larry:
    print("  Larry NOT found. All names:")
    for a in ath:
        print("   -", a.get("name"), a.get("id"))
    sys.exit(0)

lid = larry.get("id") or larry.get("_id")

# 3. RAW gps-data (what athlete/[id].tsx fetches) -> client sums these
r = s.get(f"{BASE}/api/gps-data/athlete/{lid}", headers=h, timeout=30)
raw = r.json()
print(f"\n[RAW /api/gps-data/athlete/{lid}] status={r.status_code} records={len(raw)}")
total_raw = 0
for rec in raw:
    nm = rec.get("session_name"); pn = rec.get("period_name"); rt = rec.get("record_type")
    td = rec.get("total_distance") or 0
    total_raw += td
    print(f"   date={rec.get('date')} session={nm} period={pn} record_type={rt} total_distance={td}")
print(f"   >>> CLIENT-SIDE SUM of total_distance = {total_raw} m = {total_raw/1000:.2f} km")

# 4. RESOLVED sessions endpoint (backend resolver)
r = s.get(f"{BASE}/api/gps-data/athlete/{lid}/sessions", headers=h, timeout=30)
print(f"\n[RESOLVED /api/gps-data/athlete/{lid}/sessions] status={r.status_code}")
try:
    jprint("RESOLVED sessions payload", r.json())
except Exception:
    print(r.text[:1000])

# 5. TEAM-TABLE — exact call the iOS Team Dashboard makes (the 11.5km screen)
def larry_row(rows):
    for row in rows:
        nm = (row.get("athlete_name") or row.get("name") or "").lower()
        if "larry" in nm:
            return row
    return None

for params in [
    "lang=pt&date_range=7d",
    "lang=pt&date_range=today",
    "lang=pt&date_range=today&session_name=hatta",
    "lang=pt&date_range=today&session_name=HATTA",
]:
    r = s.get(f"{BASE}/api/dashboard/team-table?{params}", headers=h, timeout=60)
    print(f"\n[TEAM-TABLE ?{params}] host={BASE} status={r.status_code}")
    try:
        data = r.json()
        rows = data if isinstance(data, list) else (data.get("rows") or data.get("table") or data.get("athletes") or [])
        row = larry_row(rows)
        if row:
            print(f"   LARRY row: total_distance={row.get('total_distance')} | "
                  f"keys={[k for k in row.keys() if 'dist' in k.lower() or 'sprint' in k.lower()]}")
            print(f"   LARRY full: {json.dumps(row, ensure_ascii=False, default=str)[:600]}")
        else:
            print(f"   Larry not in rows (rows count={len(rows)})")
    except Exception as e:
        print("   parse error:", e, r.text[:400])

# 6. session-names discovery on Railway (does HATTA exist in prod DB?)
r = s.get(f"{BASE}/api/dashboard/team-table/session-names?date_range=today", headers=h, timeout=30)
print(f"\n[SESSION-NAMES today] status={r.status_code} -> {r.text[:500]}")
r = s.get(f"{BASE}/api/dashboard/team-table/session-names?date_range=7d", headers=h, timeout=30)
print(f"[SESSION-NAMES 7d] status={r.status_code} -> {r.text[:500]}")
