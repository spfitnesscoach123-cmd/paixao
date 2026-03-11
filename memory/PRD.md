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

## Jump Camera Pipeline (Implemented - Feb 2026)

### Architecture
```
services/jump/
  types.ts          - Type definitions (JumpMetrics, JumpEvents, LiveMetrics, etc.)
  jumpDetector.ts   - Core detection algorithms (calibration, takeoff/landing, metrics)
  useJumpCamera.ts  - React hook (state machine, frame processing, SL-CMJ dual jump)
  index.ts          - Public exports

app/athlete/[id]/jump-camera.tsx - Full UI (protocol selection, camera, results)
```

### Supported Protocols
- **CMJ** (Counter Movement Jump) - with countermovement/eccentric detection
- **DJ** (Drop Jump) - with ground contact time and RSI
- **SL-CMJ Left/Right** - with automatic two-jump sequence and bilateral comparison

### Pipeline Flow
```
Start Capture → Camera Ready → Pose Detection Active → Record Pressed
→ Countdown (calibration) → Jump Performed → Recording Stops
→ Jump Analysis → Metrics Calculated → Results Screen
→ Save or Repeat → Graphs Updated
```

### Key Metrics
- Flight Time (ms)
- Contact Time (ms) - DJ and CMJ
- Jump Height (cm) - from flight time formula: h = (g * t²) / 8
- Eccentric Duration (ms) - CMJ countermovement phase
- RSI modified - jumpHeight / contactTime
- Takeoff Velocity (m/s)
- Bilateral asymmetry (%) - SL-CMJ

### Critical Bug Fixed (Feb 2026)
- **useEffect transition bug**: Previously required `phase === 'review' && metrics` to show results. Now transitions to results on `phase === 'review'` regardless of metrics (null = detection failed, shows error UI)
- **Backend weight null bug**: `athlete.get('weight', 70)` returned None when weight key exists but value is None. Fixed to `athlete.get('weight') or 70`

### Safety Isolation
- Jump Camera and VBT Camera share ZERO imports
- Jump Camera only uses `services/jump/*`
- VBT Camera only uses `services/vbt/*`
- No shared camera configuration or MediaPipe initialization modified

## Versioning System
- Single source of truth: `frontend/package.json` → version field
- Auto-sync script: `frontend/scripts/sync-version.js`
- Current version: **1.0.83**

## Tech Stack
- **Frontend**: React Native, Expo, TypeScript
- **Backend**: FastAPI, Python
- **Database**: MongoDB Atlas
- **Hosting**: Railway (backend), EAS (iOS builds)
- **Pose Detection**: @thinksys/react-native-mediapipe (patched)
- **Subscriptions**: RevenueCat

## Pending Verification
- Jump Camera crash fix on physical iOS device
- Deployment stability (npx patch-package)
- Version 1.0.83 in TestFlight
- Team Dashboard backend optimization
- Team Dashboard UI refactor

## Backlog
- P1: Refactor frontend dashboards to use Rolling Load Engine API
- P1: PDF generation crash in "Análise Científica"
- P2: Internationalization of ScientificAnalysisTab and Avaliações
- P2: UI for merging duplicate athlete profiles
- P3: Remove frontend/ios_backup_before_removal/
- P3: Extract RiskDonut component with React.memo
- P3: ESLint configuration for TypeScript

## Credentials
- Coach (PRO): contato@loadmanagerpro.com.br / #UAE2026
- App Review Token: APPS26
