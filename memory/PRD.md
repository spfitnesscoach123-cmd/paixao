# LoadManager Pro VBT - Product Requirements Document

## Original Problem Statement
Build a complete, production-grade Velocity Based Training (VBT) system using React Native, Expo CameraView, and MediaPipe Pose. The system must be robust, stable, and equivalent in reliability to professional VBT systems like LoadManager.

## User Language
Português (Brazilian Portuguese)

## Core Requirements

### VBT Camera System
- Real-time pose detection using `@thinksys/react-native-mediapipe`
- Velocity calculation with smoothing (5-frame moving average)
- Automatic rep counting with phase detection (eccentric → transition → concentric)
- Visual skeleton overlay with keypoint confidence display
- Recording sessions with timer
- Support for multiple exercises (Back Squat, Bench Press, Deadlift, etc.)

### Data Management
- Store VBT sessions per athlete
- Calculate power (watts), velocity drop, fatigue detection
- Generate scientific analysis charts

---

## What's Been Implemented

### December 2025 - LoadManager Corrections (Session 6)

#### CORREÇÃO 1-2: Padronização dos Campos GPS
**Problema**: Dados manuais não eram reconhecidos pela Periodização.

**Solução Implementada**:
- Formulário `add-gps.tsx` atualizado com campos padronizados:
  - `totalDistance` → "Dist. Total"
  - `hidZone3` → "HID Z3 (14.4-19.8 km/h)"
  - `hsrZone4` → "HSR Z4 (19.8-25.2 km/h)"
  - `sprintZone5` → "Sprint Z5 (>25 km/h)"
  - `sprintCount` → "Sprints"
  - `accDecCount` → "ACC+DEC"
- Campos idênticos aos usados no parser CSV Catapult

#### CORREÇÃO 3: Botão Voltar em "+ Nova Semana"
- Adicionado `SafeAreaView` com padding adequado
- Botão 100% visível em todos os dispositivos

#### CORREÇÃO 4: Botão Voltar na Tela Login do Coach
- Adicionado botão "← Voltar" no canto superior esquerdo
- Retorna para tela de seleção de role (Sou Coach / Sou Atleta)

#### CORREÇÃO 5-9: ACWR com Rolling Window Real
**Problema**: ACWR permanecia artificialmente alto sem treinos.

**Solução Implementada**:
- Novo endpoint: `GET /api/analysis/acwr-rolling/{athlete_id}`
- Novo endpoint: `GET /api/analysis/team-acwr`
- Cálculo CORRETO com rolling window:
  - Acute Load: média dos últimos 7 dias (incluindo zeros)
  - Chronic Load: média dos últimos 28 dias (incluindo zeros)
  - ACWR = Acute / Chronic
- ACWR diminui automaticamente quando não há treinos
- ACWR individual por métrica (6 métricas)
- ACWR médio da equipe

**Arquivos Modificados**:
- `/app/frontend/app/athlete/[id]/add-gps.tsx`
- `/app/frontend/app/login.tsx`
- `/app/frontend/app/periodization/create.tsx`
- `/app/backend/server.py`

---

### December 2025 - PDF Report System Fix (Session 5)

#### Issue: Redundant Buttons and Non-functional PDF Export
**Symptoms**:
- Two PDF export buttons (large button at bottom + small icon in header)
- Refresh button in header that wasn't needed
- PDF button wasn't loading HTML preview before showing modal

**Fixes Applied**:
1. **ScientificAnalysisTab.tsx**:
   - Removed large "Gerar Relatório PDF" button from bottom of page
   - Removed refresh button from header
   - Kept only small document icon button in header (top-right)
   - Fixed handler: button now calls `loadReportPreview()` to load HTML before showing modal
   - Removed unused imports (`useRef`, `useQueryClient`, `Path` from SVG)
   - Cleaned up unused state variables (`generating`)
   - Cleaned up unused styles (`refreshButton`, `exportButton`, `exportButtonText`)

**Flow After Fix**:
```
Press document button → Load HTML report → Show preview modal → User can print/share
```

**Status**: IMPLEMENTED - Ready for TestFlight testing

**Note**: Backend endpoint `/api/report/scientific/{athlete_id}` already generates complete HTML with inline SVG charts. No backend changes were needed.

---

### December 2025 - VBT Bug Fixes (Session 2)

#### Bug: Rep Counter Stuck at Zero
**Root Cause**: RepDetector was stuck in `eccentric` phase because:
- Transition depended on velocity falling below 0.02 m/s
- Real movements have velocity 0.10-0.22 m/s (never reaches threshold)

**Fix Applied**:
1. **RepDetector.ts**:
   - New direction-based transition logic (eccentric→concentric when direction changes to 'up')
   - Adjusted thresholds: `minVelocityThreshold: 0.03`, `directionChangeThreshold: 0.05`
   - Multiple conditions for rep completion (velocity_drop, direction_reversed, stationary)
   - Added debug logging

2. **VelocityCalculator.ts**:
   - Increased direction detection threshold from 0.5% to 1% of screen

3. **useProtectedBarTracking.ts**:
   - Added frame counter and detailed debug logs

**Status**: VERIFIED - Reps now count correctly (tested on iPhone via TestFlight)

---

### December 2025 - VBT Concentric-First Exercises (Session 4)

#### Bug: Deadlift/Power Clean Not Counting Reps
**Root Cause**: RepDetector was hardcoded for eccentric-first exercises (Squat, Bench). It expected movement to start with `direction === 'down'`, but Deadlift/Clean start with `direction === 'up'`.

**Fix Applied**:
1. **RepDetector.ts**:
   - Added `startDirection: 'down' | 'up'` config option
   - Modified `processIdle()` to support both directions
   - Modified `processEccentric()`, `processTransition()`, `processConcentric()` for both flows

2. **trackingProtection.ts**:
   - Added `EXERCISE_START_DIRECTION` mapping
   - Deadlift, Power Clean, Hang Clean, Pull Up, Row = 'up' (concentric-first)
   - Squat, Bench, Hip Thrust, Leg Press = 'down' (eccentric-first)

3. **useProtectedBarTracking.ts**:
   - Uses `EXERCISE_START_DIRECTION` to configure RepDetector per exercise

#### Bug: Load-Velocity Chart Inconsistency
**Fix Applied**:
1. **vbt.tsx**:
   - Added optimal load point (orange) to chart
   - Added optimal load card in summary section
   - Updated TypeScript types with `optimal_load`, `optimal_velocity`, `optimal_power`

**Status**: Ready for EAS Build and TestFlight testing

#### Bug: Velocity Data Shows 0 m/s in Reports (Critical)
**Symptoms**:
- Reps count correctly on screen during recording ✅
- Velocity meter shows real values (0.63 m/s) during recording ✅
- But saved data shows 0 m/s and -100% velocity drop ❌
- Charts show "Insufficient data" ❌

**Root Cause**: Race condition in `RepDetector.ts`:
```
1. processConcentric() calls completeRep(now) → returns true
2. completeRep() resets this.concentricVelocities = [] BEFORE createResult
3. createResult() calculates meanVelocity from EMPTY array → returns 0!
```

**Fix Applied**:
1. **RepDetector.ts**:
   - Added `lastCompletedRepData: RepData | null` property
   - `completeRep()` now stores calculated values in `lastCompletedRepData` BEFORE resetting arrays
   - `createResult()` uses stored data instead of recalculating from empty arrays
   - `reset()` clears `lastCompletedRepData`
   - Added comprehensive debug logging

2. **useProtectedBarTracking.ts**:
   - Enhanced logging when rep completes
   - Warning log if `repCompleted=true` but `currentRep=null`

**Status**: Ready for EAS Build and TestFlight testing

**Note**: Historical data in database will still show 0 m/s. Only new recordings will have correct values.

### Previous Session - Confidence Fix
- Fixed null handling for `visibility` property in MediaPipe landmarks
- Fixed camera ready state to enable record button

---

## Technical Architecture

### Frontend (React Native + Expo)
```
/app/frontend/
├── app/athlete/[id]/vbt-camera.tsx    # Main VBT camera screen
├── services/vbt/
│   ├── RepDetector.ts                  # Rep counting state machine
│   ├── VelocityCalculator.ts           # Velocity calculation with smoothing
│   ├── useProtectedBarTracking.ts      # Main VBT hook
│   ├── trackingProtection.ts           # 5-stage validation pipeline
│   └── recordingController.ts          # Recording state singleton
└── services/pose/
    └── index.ts                        # Pose data types and utilities
```

### Backend (FastAPI)
- `POST /api/v1/athlete/{athlete_id}/vbt_session` - Save VBT session data
- MongoDB for data persistence

### Third-Party Integrations
- `@thinksys/react-native-mediapipe` - Native MediaPipe pose detection
- `expo-camera` - Camera access (fallback)
- `react-native-vision-camera` - Camera support

---

## Prioritized Backlog

### P0 - Critical
- [DONE] Fix rep counter (stuck at zero)
- [PENDING] Validate fix with TestFlight build

### P1 - High Priority
- [DONE] Fix PDF report system in Scientific Analysis tab (December 2025)
- Complete internationalization of `ScientificAnalysisTab.tsx`
- Internationalize "Avaliações" (Assessments) page
- Test `gps_import` pipeline with `identity_resolver`

### P2 - Medium Priority
- Integrate identity resolution into `force_import` and `wellness_import`
- Build UI for manual resolution of ambiguous athlete names

### P3 - Low Priority
- Feature for merging duplicate athlete profiles
- EAS Project Slug Conflict (`real-time-vbt` vs `loadmanager-pro-vbt`)

---

## Test Credentials
- **Coach**: `coach_test@test.com` / `password`

---

## Known Issues
- EAS Project slug conflict needs resolution
- Some package version warnings (non-blocking)
