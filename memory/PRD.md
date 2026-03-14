# Load Manager Pro - PRD

## Original Problem Statement
Sistema completo de monitoramento esportivo para treinadores, incluindo GPS tracking, avaliações de salto, periodização, análise VBT (Velocity Based Training), e gestão de atletas com dashboards analíticos em tempo real.

## Architecture
- **Frontend**: React Native (Expo) — Web + iOS
- **Backend**: FastAPI + MongoDB
- **Deployment**: Railway (production), Emergent (preview)

## Key Features Implemented
- Auth system (JWT + PRO override)
- Athlete CRUD, GPS data management, jump assessments
- Team Dashboard with EWMA ACWR, risk distribution, alerts
- Individual athlete profiles with periodization
- Scientific analysis (ACWR rolling, jump protocols)
- VBT camera module (MediaPipe)
- Dashboard PDF export (with SVG charts, white background, native share)
- Scientific Analysis PDF export
- UI Modernization (react-native-reanimated animations, skeleton loaders)
- Rolling Load Engine (EWMA calculator, spike detector, monotony/strain)

## What's Been Done (Latest)

### Mar 2026 - ACWR EWMA Fix
- Audit: Identified 4 coexisting ACWR implementations; Team Dashboard used Coupled ACWR (always 4.0)
- Fix: Refactored `get_team_dashboard()` to use EWMA ACWR from `athlete_load_metrics`
- Added `high_intensity_distance` and `number_of_sprints` to load_engine (6 metrics total)
- Auto-population on startup. Tests: 15/15 passed (iteration_31.json)

### Mar 2026 - Dashboard PDF Export Fix
- Problem 1: Charts not exported → Added inline SVG charts (gauges, bars, lines)
- Problem 2: Dark background → Changed to white background CSS for print
- Problem 3: Opens new tab → Changed to hidden iframe (no new window on web)
- Tests: 16/16 passed (iteration_32.json)

## Prioritized Backlog

### P0 (Critical)
- (none currently)

### P1 (High)
- User verification: UI Modernization, PDF Export, Date Selector UX
- User verification: Features from previous forks

### P2 (Medium)
- PDF Generation crash in "Análise Científica" (recurring >3 times)
- Migrate other frontend dashboards to Rolling Load Engine API
- Complete internationalization of ScientificAnalysisTab.tsx

### P3 (Low)
- Fix ESLint configuration for TypeScript
- Build UI for merging duplicate athlete profiles
- Remove `frontend/ios_backup_before_removal/` directory
- Extract `RiskDonut` component from team.tsx
- VBT Rep Counting & regressions

## Key Endpoints
- `GET /api/dashboard/team` — Team Dashboard (EWMA ACWR)
- `GET /api/report/dashboard-overview` — Dashboard PDF (SVG charts, white bg)
- `GET /api/report/scientific/{athlete_id}` — Scientific Analysis PDF
- `GET /api/load-metrics/{athlete_id}` — Individual EWMA metrics
- `GET /api/load-metrics/team/latest` — Team EWMA metrics

## Credentials
- Coach: `contato@loadmanagerpro.com.br` / `#UAE2026`
- App Review Token: `APPS26`
