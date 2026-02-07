# ACWR Analytics - Product Requirements Document

## Project Overview
A full-stack athlete performance tracking and analysis application with advanced workload monitoring using ACWR (Acute:Chronic Workload Ratio) methodology.

## Original Problem Statement
Build and maintain a comprehensive athlete analytics platform featuring:
- User authentication system
- Athlete management (CRUD operations)
- GPS training data collection and analysis
- Wellness questionnaire tracking
- ACWR analysis with risk assessment
- Performance comparison dashboards
- Multilingual support (i18n)
- PDF report generation
- Strength assessments with fatigue detection

## User Personas
- **Head Coaches**: Need team-wide overview, player comparisons, workload management
- **Sports Scientists**: Require detailed ACWR metrics, fatigue analysis, training zones
- **Fitness Coaches**: Focus on individual athlete progression and recovery status

## Core Requirements

### Authentication
- JWT-based authentication with email/password
- Session persistence across app navigation
- Biometric login support (FaceID/fingerprint) on native platforms

### Athlete Management
- Create, read, update, delete athletes
- Profile photo support (base64)
- Position, age, height, weight tracking

### GPS Data
- Manual entry and CSV import (Catapult format)
- Session-based grouping with period breakdowns
- **NEW: Date range filtering** (7 days, 30 days, this month, custom)
- Metrics: distance, high intensity, sprints, accelerations, decelerations, max speed

### Wellness / Recovery
- Daily questionnaire tracking (fatigue, sleep, stress, mood, muscle soreness)
- **NEW: QTR Score (Qualidade Total de Recuperação)** - 0-100 scale with gauge visualization
  - 0-30: Ruim (Poor)
  - 31-60: Regular
  - 61-85: Bom (Good)
  - 85-100: Excelente (Excellent)
- **NEW: Parameter correlation charts** (14-day evolution)
- **NEW: Trend analysis** (improving/declining/stable)

### Strength Assessments (NEW)
- **Parameters tracked:**
  - Mean Power (W)
  - Peak Power (W)
  - Mean Speed (m/s)
  - Peak Speed (m/s)
  - RSI (Reactive Strength Index)
  - Fatigue Index (%)
- **Normative classifications** based on football literature
- **Historical comparison** with athlete's personal peak values
- **Peripheral fatigue detection**: RSI drop + Peak Power drop = injury risk alert
- **AI-powered insights** for strength profile analysis

### Analysis Features
- ACWR calculation (Acute 7-day vs Chronic 28-day)
- Detailed ACWR by metric type (distance, HSR, HID, sprint, acc/dec)
- Fatigue analysis based on wellness data
- AI-powered insights using GPT-4o (via Emergent LLM)
- Risk level categorization (low, optimal, moderate, high)
- ACWR evolution charts

### Internationalization (i18n)
- Languages: English, Portuguese, Spanish, French, Chinese, Arabic
- All UI text translatable via locales/*.json
- API responses support `lang` parameter for translated content
- LLM prompts adapt to user's selected language

### Reporting
- PDF export with translated content
- Personal info, GPS summary, ACWR analysis, recent sessions

---

## Tech Stack
- **Frontend**: React Native (Expo for Web), TypeScript, React Navigation, React Query
- **Backend**: Python, FastAPI, Motor (MongoDB async driver)
- **Database**: MongoDB
- **AI/LLM**: OpenAI GPT-4o via Emergent Integrations
- **PDF Generation**: fpdf2
- **Charts**: react-native-svg

---

## What's Been Implemented

### February 7, 2025 (Current Session)
- **GPS Date Filter**: Added GPSDateFilter component with quick filter buttons (All, 7 days, 30 days, This month, Custom)
- **QTR Gauge**: Created QTRGauge component with SVG-based speedometer visualization
- **Wellness Charts**: Added WellnessCharts component with parameter evolution graphs and QTR calculation
- **Strength Assessment Form**: Created add-strength.tsx for manual entry of strength metrics
- **Strength Analysis API**: New endpoint `/api/analysis/strength/{athlete_id}` with normative comparisons
- **Strength Analysis Charts**: Frontend component for visualizing strength metrics and fatigue detection
- **Peripheral Fatigue Detection**: Algorithm to detect accumulated muscle fatigue (RSI + Peak Power drops)
- **Updated translations**: Added assessments section to en.json and pt.json

### February 6, 2025 (Previous Session)
- Fixed duplicated `ANALYSIS_TRANSLATIONS` and `get_analysis_text` definitions
- Added `lang` parameter to analysis functions for multilingual AI content
- Completed translation of AI-generated insights

### Previously Implemented
- Full authentication system (login, register, password reset)
- Athletes CRUD with photo support
- GPS data import (manual + Catapult CSV)
- Session/period grouping with expandable UI
- Wellness questionnaire system
- Comprehensive analysis page with ACWR, fatigue, AI insights
- ACWR evolution charts
- Comparison dashboard
- PDF report export
- i18n framework with 6 languages

---

## Prioritized Backlog

### P0 (Completed)
- [x] GPS Date Filter with quick buttons
- [x] QTR Gauge for wellness recovery score
- [x] Wellness parameter correlation charts
- [x] Strength assessment form with new parameters
- [x] Strength analysis with normative comparisons
- [x] Peripheral fatigue detection algorithm

### P1 (Next Priority)
- [ ] Add sample GPS data for testing date filter
- [ ] Add sample wellness data for testing QTR calculations
- [ ] Strength assessment history graphs (evolution over season)
- [ ] Full i18n audit - remaining hardcoded strings

### P2 (Future)
- [ ] Push notifications for wellness reminders
- [ ] Team-wide statistics dashboard
- [ ] Export functionality enhancements
- [ ] Performance optimizations for large datasets

---

## API Endpoints Reference

### Authentication
- `POST /api/auth/register` - Create new user
- `POST /api/auth/login` - Login and get JWT token
- `POST /api/auth/forgot-password` - Request password reset

### Athletes
- `GET /api/athletes` - List user's athletes
- `POST /api/athletes` - Create athlete
- `GET /api/athletes/{id}` - Get athlete details
- `PUT /api/athletes/{id}` - Update athlete
- `DELETE /api/athletes/{id}` - Delete athlete

### GPS Data
- `GET /api/gps-data/athlete/{id}` - Get GPS data for athlete
- `GET /api/gps-data/sessions/{id}` - Get grouped sessions
- `POST /api/gps-data` - Add GPS entry
- `POST /api/gps-data/import` - Import Catapult CSV

### Wellness
- `GET /api/wellness/athlete/{id}` - Get wellness data
- `POST /api/wellness` - Add wellness questionnaire

### Assessments
- `GET /api/assessments/athlete/{id}` - Get all assessments
- `POST /api/assessments` - Add assessment (strength, aerobic, body_composition)

### Analysis (all support `?lang=en|pt|es|fr`)
- `GET /api/analysis/acwr/{id}` - Basic ACWR
- `GET /api/analysis/acwr-detailed/{id}` - Detailed ACWR by metric
- `GET /api/analysis/acwr-history/{id}` - ACWR evolution data
- `GET /api/analysis/fatigue/{id}` - Fatigue analysis
- `GET /api/analysis/ai-insights/{id}` - AI-generated insights
- `GET /api/analysis/comprehensive/{id}` - All analyses combined
- `GET /api/analysis/strength/{id}` - **NEW** Strength analysis with normatives

### Reports
- `GET /api/reports/athlete/{id}/pdf?lang=xx` - Generate PDF report

---

## Strength Assessment Normatives (Football Players)

| Metric | Excellent | Good | Average | Below Average | Unit |
|--------|-----------|------|---------|---------------|------|
| Mean Power | ≥2500 | ≥2200 | ≥1900 | ≥1600 | W |
| Peak Power | ≥4000 | ≥3500 | ≥3000 | ≥2500 | W |
| Mean Speed | ≥1.5 | ≥1.3 | ≥1.1 | ≥0.9 | m/s |
| Peak Speed | ≥3.0 | ≥2.6 | ≥2.2 | ≥1.8 | m/s |
| RSI | ≥2.5 | ≥2.0 | ≥1.5 | ≥1.0 | - |
| Fatigue Index | <30% | <50% | <70% | ≥70% | % |

**Peripheral Fatigue Detection:**
- RSI drop >10% from peak + Peak Power drop >10% from peak = Accumulated peripheral fatigue
- Fatigue Index >70% = High fatigue alert
- Both conditions = Injury risk warning

---

## Test Credentials
- Email: `test@test.com`
- Password: `test`
- Athlete ID: `69862b75fc9efff29476e3ce`

## Database Schema (MongoDB Collections)
- `users`: id, email, hashed_password, name, created_at
- `athletes`: id, coach_id, name, birth_date, position, height, weight, photo_base64
- `gps_data`: id, athlete_id, coach_id, date, session_id, session_name, period_name, metrics...
- `wellness`: id, athlete_id, coach_id, date, sleep_hours, sleep_quality, fatigue, muscle_soreness, stress, mood, readiness_score, wellness_score
- `assessments`: id, athlete_id, coach_id, date, assessment_type, metrics (flexible dict), notes
