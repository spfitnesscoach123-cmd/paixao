# PRD - Peak Perform - Athlete Performance Tracking

## Original Problem Statement
Sistema de rastreamento de desempenho de atletas com avaliações físicas, composição corporal, integração com wearables e sistemas VBT.

## Current Architecture
- **Backend**: FastAPI (Python) + MongoDB
- **Frontend**: React Native (Expo) + TypeScript
- **AI Integration**: OpenAI via Emergent LLM Key

## What's Been Implemented

### ✅ Core Features
- User authentication (login/register)
- Athlete CRUD operations
- GPS data tracking with filters
- Wellness questionnaires + QTR gauge
- Strength assessments with auto fatigue calculation
- Subscription system (3 tiers)
- Team dashboard
- i18n support (PT/EN)

### ✅ Body Composition (Feb 2026)
**Protocols:**
- Guedes (1985) - 3 skinfolds (Brazilian)
- Pollock & Jackson 7 - 7 skinfolds
- Pollock & Jackson 9 - 9 skinfolds
- Faulkner 4 - 4 skinfolds (athletes)

**Calculated Metrics:**
- Body Fat % (Siri equation)
- Lean/Fat/Bone Mass (kg)
- BMI + Classification
- Fat Distribution for 3D visualization

**Endpoints:**
- `GET /api/body-composition/protocols`
- `POST /api/body-composition`
- `GET /api/body-composition/athlete/{id}`
- `GET /api/analysis/body-composition/{id}`

### ✅ Reports & Export (Feb 2026)
**CSV Export:**
- `GET /api/reports/athlete/{id}/csv?data_type=all|gps|wellness|strength|body_composition`
- `GET /api/reports/team/csv`

**PDF Reports:**
- `GET /api/reports/athlete/{id}/pdf` - Complete athlete report
- `GET /api/reports/body-composition/{id}/pdf` - Body composition report

### ✅ Wearable Integration (Feb 2026)
**Supported Methods:**
- FIT file import (Garmin, Polar, Suunto, Wahoo, Coros)
- CSV import (any device)

**Endpoints:**
- `GET /api/wearables/supported`
- `POST /api/wearables/import/csv`

**Planned (requires developer credentials):**
- Garmin Connect direct sync
- Polar Flow direct sync

### ✅ VBT Integration (Feb 2026)
**Supported Providers:**
- GymAware
- PUSH Band
- Vitruve
- Beast Sensor
- Tendo Unit
- Manual entry

**Features:**
- Load-Velocity Profile (LVP)
- Estimated 1RM calculation
- Velocity loss analysis (fatigue)
- Trend analysis
- AI recommendations

**Endpoints:**
- `GET /api/vbt/providers`
- `POST /api/vbt/data`
- `GET /api/vbt/athlete/{id}`
- `POST /api/vbt/import/csv`
- `GET /api/vbt/analysis/{id}?exercise=...`

## Backlog

### P1 - High Priority
- [ ] **Complete Global Theme** - 30+ files need refactoring for light mode
- [ ] **Full i18n Audit** - Replace remaining hardcoded strings

### P2 - Medium Priority
- [ ] **Push Notifications** - Critical alerts
- [ ] **VBT Frontend UI** - Charts and forms for VBT data
- [ ] **Wearable Import UI** - File upload interface

### P3 - Future
- [ ] **Direct Garmin/Polar API** - Requires developer program enrollment
- [ ] **FIT file parser** - Parse binary FIT files directly

## Key API Endpoints Summary

### Authentication
- `POST /api/auth/register`, `POST /api/auth/login`

### Athletes
- `GET/POST/PUT/DELETE /api/athletes/{id}`

### Body Composition
- `GET /api/body-composition/protocols`
- `POST /api/body-composition`
- `GET /api/analysis/body-composition/{id}`

### VBT
- `GET /api/vbt/providers`
- `POST /api/vbt/data`
- `GET /api/vbt/analysis/{id}?exercise=...`

### Reports
- `GET /api/reports/athlete/{id}/csv`
- `GET /api/reports/body-composition/{id}/pdf`

### Wearables
- `GET /api/wearables/supported`
- `POST /api/wearables/import/csv`

## Database Collections
- `users`, `athletes`, `gps_data`, `wellness`
- `assessments`, `body_compositions`
- `vbt_data`, `heart_rate_data` (NEW)
- `subscriptions`

## Test Credentials
- Email: `test@test.com`
- Password: `password`

## Last Updated
February 7, 2026
