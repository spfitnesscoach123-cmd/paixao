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
- Dashboard PDF export
- UI Modernization (react-native-reanimated animations, skeleton loaders)
- Rolling Load Engine (EWMA calculator, spike detector, monotony/strain)

## What's Been Done (Latest)
### Feb 2026 - ACWR EWMA Fix
- **Audit completed**: Identified 4 coexisting ACWR implementations (inline Coupled, calculate_metric_acwr, calculate_rolling_acwr, EWMA load_engine)
- **Root cause**: Team Dashboard used inline Coupled ACWR (sum-based) → always 4.0 when data concentrated in acute window
- **Fix applied**: Refactored `get_team_dashboard()` to use EWMA ACWR from `athlete_load_metrics` collection
- **Metrics expanded**: Added `high_intensity_distance` and `number_of_sprints` to load_engine (now 6 metrics total)
- **Auto-population**: Startup task populates `athlete_load_metrics` if empty
- **Testing**: 15/15 tests passed (iteration_31.json)
- **Audit report**: `/app/memory/ACWR_AUDIT_REPORT.md`

## Prioritized Backlog

### P0 (Critical)
- (none currently)

### P1 (High)
- User verification: UI Modernization, PDF Export, Date Selector UX
- User verification: Features from previous forks (Dashboard, Periodization, Jump, Camera)

### P2 (Medium)
- PDF Generation crash in "Análise Científica" (recurring >3 times)
- Migrate other frontend dashboards to Rolling Load Engine API
- Complete internationalization of ScientificAnalysisTab.tsx

### P3 (Low)
- Fix ESLint configuration for TypeScript
- Build UI for merging duplicate athlete profiles
- Remove `frontend/ios_backup_before_removal/` directory
- Extract `RiskDonut` component from team.tsx
- VBT Rep Counting & regressions (known from previous sessions)

## Key Endpoints
- `GET /api/dashboard/team` — Team Dashboard (now uses EWMA ACWR)
- `POST /api/dashboard/overview/pdf` — Dashboard PDF export
- `GET /api/load-metrics/{athlete_id}` — Individual EWMA metrics
- `GET /api/load-metrics/team/latest` — Team EWMA metrics
- `POST /api/load-metrics/{athlete_id}/recalculate` — Recalculate EWMA

## Credentials
- Coach: `contato@loadmanagerpro.com.br` / `#UAE2026`
- App Review Token: `APPS26`
