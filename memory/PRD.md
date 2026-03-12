# Load Manager Pro - PRD

## Problem Statement
A comprehensive athlete load management platform for coaches, featuring VBT (Velocity-Based Training) camera, jump assessments, wellness monitoring, GPS data import, and team dashboards. Built with React Native (Expo) frontend and FastAPI + MongoDB backend.

## Core Features (Implemented)
- Coach authentication with JWT
- Athlete CRUD management
- VBT Camera with barbell tracking (MediaPipe pose detection)
- Jump Assessment (manual entry + camera-based)
- Wellness forms with shareable tokens
- Team dashboard with risk indicators
- GPS data import
- Rolling Load Engine (backend)
- RevenueCat subscription management

## Jump Camera Pipeline

### Architecture
```
services/jump/
  types.ts          - Type definitions (JumpMetrics, JumpEvents, LiveMetrics, etc.)
  jumpDetector.ts   - Core detection algorithms (calibration, takeoff/landing, metrics)
  useJumpCamera.ts  - React hook (state machine, frame processing, SL-CMJ dual jump)
  index.ts          - Public exports

app/athlete/[id]/jump-camera.tsx - Full UI (protocol selection, camera, results)
app/athlete/[id]/jump-assessment.tsx - Analysis dashboard with charts
```

### Supported Protocols
- **CMJ** - RSImod = jumpHeight(m) / timeToTakeoff(s). contactTime = 0.
- **DJ** - RSI = jumpHeight(m) / contactTime(s). Classic reactive strength.
- **SL-CMJ Left/Right** - Two-jump sequence, bilateral comparison, asymmetry detection.

### Key Metrics
- Flight Time (ms)
- Contact Time (ms) - **DJ only**
- Jump Height (cm) - h = (g * t^2) / 8
- Time to Takeoff (ms) - CMJ/SL-CMJ: eccentric + concentric phase
- Eccentric Duration (ms) - CMJ countermovement phase
- RSImod - jumpHeight / timeToTakeoff (CMJ/SL-CMJ)
- RSI classic - jumpHeight / contactTime (DJ)
- Takeoff Velocity (m/s)
- Bilateral asymmetry (%) - SL-CMJ with red flag >10%

### SL-CMJ Save Pipeline
- When user saves SL-CMJ, BOTH legs saved via Promise.all (two separate API calls)
- Each leg: sl_cmj_left or sl_cmj_right protocol with time_to_takeoff_ms
- Analysis endpoint returns R/L data with rsi_modified and time_to_takeoff_ms
- AsymmetryCard shows: RSImod R/L, Jump Height R/L, Takeoff Time R/L

### Bug Fix History
- **Pipeline break** (Feb 2026): useEffect transition required metrics (now transitions on phase='review')
- **RSImod formula** (Mar 2026): CMJ was using contactTime. Fixed to use timeToTakeoff.
- **SL-CMJ persistence** (Mar 2026): Only leg2 was saved. Fixed to save BOTH legs.
- **Chart refresh** (Mar 2026): useFocusEffect added for refetch on screen focus.
- **Backend weight null** (Feb 2026): `athlete.get('weight') or 70` fix.

### Backend Schema
```python
class JumpAssessmentCreate(BaseModel):
    athlete_id: str
    date: str
    protocol: JumpProtocol  # cmj, sl_cmj_left, sl_cmj_right, dj
    flight_time_ms: float
    contact_time_ms: float  # DJ only, 0 for CMJ/SL-CMJ
    jump_height_cm: Optional[float]
    box_height_cm: Optional[float]  # DJ only
    time_to_takeoff_ms: Optional[float]  # CMJ/SL-CMJ: eccentric+concentric
    notes: Optional[str]
```

### Safety Isolation
- Jump Camera and VBT Camera share ZERO imports
- No shared camera config or MediaPipe initialization modified

## Versioning System
- Source of truth: `frontend/package.json` -> version 1.0.83
- Auto-sync: `frontend/scripts/sync-version.js`

## Periodization Page Visual Fixes (Mar 2026)
### Changes Applied
1. **Table alignment**: Metric column headers and values changed from `textAlign: 'right'` to `'center'`. "Atleta" column remains left-aligned.
2. **Non-functional buttons removed**: `daysOverview` static badges (D.O, MD-5, etc.) removed from rendering. No code deleted — only JSX block replaced.
3. **Functional day selector moved above table**: Interactive day buttons (with onPress) relocated from below to above the table in `renderTableView`.
4. **Zero logic changes**: Only `textAlign` style properties and JSX ordering modified.

## Backlog
- P1: PDF generation crash in "Analise Cientifica"
- P1: Refactor dashboards to use Rolling Load Engine API
- P2: Internationalization
- P2: UI for merging duplicate athlete profiles
- P3: Remove ios_backup_before_removal/
- P3: Extract RiskDonut component
- P3: ESLint config for TypeScript

## Team Dashboard Metrics Audit (Mar 2026)
### Changes Applied
1. **FADIGA → READINESS**: Athlete cards and stats now display "Readiness" (0-100%) from wellness `readiness_score * 10` instead of fatigue. Fatigue code preserved (not deleted).
2. **GPS Period Dedup**: Dashboard now uses only "Session" records when aggregating GPS data. Prevents double-counting when Session + 1st Half + 2nd Half exist for same date/session.
3. **Monotony/Strain Audit**: Confirmed already using `acwr_metric` selector correctly. No code changes needed.

### Key Implementation Details
- Backend: `TeamDashboardAthlete.readiness_score` (0-100%), `TeamDashboardStats.team_avg_readiness`
- GPS dedup uses keywords: session/total/full vs half/1st/2nd/period
- Readiness color thresholds: ≥80 green, ≥60 cyan, ≥40 amber, <40 red

## Credentials
- Coach (PRO): contato@loadmanagerpro.com.br / #UAE2026
- App Review Token: APPS26
