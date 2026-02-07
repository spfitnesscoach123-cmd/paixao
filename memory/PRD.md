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
- Guedes (1985) - 3 skinfolds (Brazilian) - FORMULA FIXED to use log10
- Pollock & Jackson 7 - 7 skinfolds
- Pollock & Jackson 9 - 9 skinfolds
- Faulkner 4 - 4 skinfolds (athletes)

**Calculated Metrics:**
- Body Fat % (Siri equation)
- Lean/Fat/Bone Mass (kg)
- BMI + Classification
- Fat Distribution for 3D visualization

**Frontend:**
- Dynamic form with protocol selector
- SVG body diagram showing measurement points
- Protocol-specific skinfold fields

**Endpoints:**
- `GET /api/body-composition/protocols`
- `POST /api/body-composition`
- `GET /api/body-composition/athlete/{id}`
- `GET /api/analysis/body-composition/{id}`

### ✅ 3D Body Model Visualization (Feb 7, 2026)
**Features:**
- Enhanced SVG 3D model with gradients and highlights
- Front view and Side view toggle
- Color-coded fat distribution (green/yellow/red)
- Interactive region details with progress bars
- Fat percentage labels on body regions

**Components:**
- `BodyCompositionCharts.tsx` - Complete visualization component

### ✅ VBT Integration in Strength Page (Feb 7, 2026)
**Features:**
- Integrated VBT into add-strength.tsx with tabs (Traditional Strength / VBT)
- Exercise selector with 12 preset exercises
- Device/Provider selection (GymAware, PUSH Band, Vitruve, etc.)
- Multi-set data entry (load, velocity, power)
- Load-Velocity Profile chart with regression line and 1RM estimation
- Velocity Loss per Set bar chart
- AI-powered recommendations

**Endpoints:**
- `GET /api/vbt/providers`
- `POST /api/vbt/data`
- `GET /api/vbt/analysis/{athlete_id}`

### ✅ Reports & Export (Feb 2026)
**CSV Export:**
- `GET /api/reports/athlete/{id}/csv?data_type=all|gps|wellness|strength|body_composition`
- `GET /api/reports/team/csv`

**PDF Reports:**
- `GET /api/reports/athlete/{id}/pdf` - Complete athlete report
- `GET /api/reports/body-composition/{id}/pdf` - Body composition report

### ✅ Wearables (Basic - Feb 2026)
- Manual .FIT file upload endpoint
- `POST /api/wearables/upload` - Placeholder for full integration

## Prioritized Backlog

### P1 - In Progress
- [ ] Full i18n audit - translate remaining hardcoded strings
- [ ] Global theme implementation (Light/Dark mode) - POSTPONED

### P2 - Planned
- [ ] Push Notifications for critical alerts
- [ ] UI for downloading PDF/CSV reports
- [ ] Full OAuth wearable integration (Garmin Connect, Polar Flow)

### P3 - Future
- [ ] Gamification/Leaderboards
- [ ] Advanced team analytics dashboard
- [ ] Video analysis integration

## Key Technical Notes

### Body Composition Formulas
- **Guedes (1985)**: Uses log10 transformation for body density
  - Male: BD = 1.1714 - 0.0671 × log10(sum_3)
  - Female: BD = 1.1665 - 0.0706 × log10(sum_3)
- **Siri Equation**: %BF = (495 / BD) - 450

### VBT Load-Velocity Profile
- Linear regression: V = V0 + slope × Load
- MVT (Minimum Velocity Threshold): 0.3 m/s for most exercises
- Estimated 1RM calculated at MVT intercept

## Test Credentials
- **Email**: test@test.com
- **Password**: password
- **Athlete ID**: 69862b75fc9efff29476e3ce

## Last Updated
February 7, 2026
