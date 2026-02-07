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
- Subscription-based monetization system with regional pricing
- Team-wide dashboard for coaches

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
- Date range filtering (7 days, 30 days, this month, custom)
- Metrics: distance, high intensity, sprints, accelerations, decelerations, max speed

### Wellness / Recovery
- Daily questionnaire tracking (fatigue, sleep, stress, mood, muscle soreness)
- QTR Score (Qualidade Total de Recuperação) - 0-100 scale with gauge visualization
- Parameter correlation charts (14-day evolution)
- Trend analysis (improving/declining/stable)

### Strength Assessments
- **Parameters tracked:**
  - Mean Power (W)
  - Peak Power (W)
  - Mean Speed (m/s)
  - Peak Speed (m/s)
  - RSI (Reactive Strength Index)
  - Fatigue Index (%) - **NOW AUTO-CALCULATED**
- Normative classifications based on football literature
- Historical comparison with athlete's personal peak values
- **Peripheral fatigue detection**: RSI drop + Peak Power drop = injury risk alert
- **Auto fatigue calculation**:
  - Power drop > 30% → Fatigue index > 80% (high fatigue/low recovery)
  - Power drop 20-30% → Fatigue index 70-80%
  - Power drop 10-20% → Fatigue index 50-70%
  - Power drop < 10% → Fatigue index < 50% (well recovered)
- AI-powered insights for strength profile analysis

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

## Subscription System (IMPLEMENTED - Feb 7, 2025)

### Plan Tiers

| Plan | Brazil (BRL) | International (USD) | Athletes | History |
|------|-------------|---------------------|----------|---------|
| Essencial | R$ 39,90 | $ 7,99 | 25 | 3 months |
| Profissional | R$ 89,90 | $ 17,99 | 50 | Unlimited |
| Elite | R$ 159,90 | $ 29,99 | Unlimited | Unlimited |

### Plan Features

**Essencial**
- Up to 25 athletes
- Quick GPS and Wellness registration
- Weekly load visualization
- 3 months history
- Basic performance reports
- NO: Detailed ACWR, Athlete comparison, Fatigue alerts, PDF/CSV export, AI insights

**Profissional** (⭐ Most Popular)
- Up to 50 athletes
- Everything in Essencial
- Detailed ACWR by metric
- Athlete comparison
- Contextual risk alerts
- Complete monthly reports
- PDF and CSV export
- Unlimited history
- NO: AI insights, Multiple users, Priority support

**Elite**
- Unlimited athletes
- Everything in Profissional
- AI-generated insights
- Peripheral fatigue detection
- Up to 2 simultaneous users
- Priority support
- Custom reports
- Integration API (coming soon)

### Trial Period
- All plans include 7-day free trial
- Full access to plan features during trial
- Auto-detects user region for pricing (Brazil = BRL, other = USD)
- Payment via In-App Purchase (App Store / Google Play) - **MOCKED**

---

## Team Dashboard (IMPLEMENTED - Feb 7, 2025)

### Features
- **Aggregated Stats**: Total athletes, high risk count, optimal count, fatigued count
- **Team Averages**: Avg ACWR, Avg Wellness, Avg Fatigue, Sessions/Week
- **Alerts Section**: Prioritized alerts for power drops, high ACWR, high fatigue
- **Risk Distribution**: Donut chart showing athletes by risk level
- **Athletes List**: Sortable by risk level, shows ACWR, fatigue %, injury risk indicators
- **Position Summary**: Stats grouped by player position (Midfielder, Forward, etc.)
- **Weekly Distance**: Total team distance this week

### Automatic Alerts Generated
- ⚡ Power drop > 30% (peripheral fatigue)
- ⚠️ High ACWR (> 1.5)
- 🔴 High fatigue (> 70%)

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
- **Team Dashboard**: Complete backend endpoint `/api/dashboard/team` + Frontend page
- **Auto Fatigue Calculation**: fatigue_index now calculated from power_drop when not manually entered
- **Subscription System**: 3 plans with regional pricing (BRL/USD), 7-day trial
- **Bug Fix P0**: Navigation to add-strength.tsx working (import paths fixed)
- **New Tab**: "Team" tab added to bottom navigation

### February 6-7, 2025 (Previous Sessions)
- GPS Date Filter: Added GPSDateFilter component with quick filter buttons
- QTR Gauge: Created QTRGauge component with SVG-based speedometer visualization
- Wellness Charts: Added WellnessCharts component with parameter evolution graphs
- Strength Assessment Form: Created add-strength.tsx for manual entry of strength metrics
- Strength Analysis API: Endpoint `/api/analysis/strength/{athlete_id}`
- Strength Analysis Charts: Frontend component for visualizing strength metrics
- Peripheral Fatigue Detection: Algorithm to detect accumulated muscle fatigue
- Theme toggle: Basic Dark/Light mode toggle in Profile

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

### P0 (Completed ✅)
- [x] GPS Date Filter with quick buttons
- [x] QTR Gauge for wellness recovery score
- [x] Wellness parameter correlation charts
- [x] Strength assessment form with new parameters
- [x] Strength analysis with normative comparisons
- [x] Peripheral fatigue detection algorithm
- [x] Subscription system with 3 tiers
- [x] Regional pricing (BRL/USD)
- [x] Bug fix: add-strength.tsx navigation
- [x] Team Dashboard with aggregated stats
- [x] Auto fatigue calculation from power drop

### P1 (Pending)
- [ ] Full i18n audit - ensure all strings use t() function
- [ ] Theme switching (Dark/Light) applied to all screens

### P2 (Backlog)
- [ ] Push notifications for wellness reminders
- [ ] Export strength assessment reports
- [ ] Comparison of strength between athletes
- [ ] Performance optimizations for large datasets

### P3 (Future)
- [ ] Email alerts for critical fatigue levels
- [ ] Team averages comparison
- [ ] Advanced filtering for comparisons
- [ ] Integration API for Elite plan
- [ ] Multi-user authentication for Elite plan
- [ ] Gamification/Leaderboards

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
- `POST /api/assessments` - Add assessment

### Analysis (all support `?lang=en|pt|es|fr`)
- `GET /api/analysis/acwr/{id}` - Basic ACWR
- `GET /api/analysis/acwr-detailed/{id}` - Detailed ACWR by metric
- `GET /api/analysis/acwr-history/{id}` - ACWR evolution data
- `GET /api/analysis/fatigue/{id}` - Fatigue analysis
- `GET /api/analysis/ai-insights/{id}` - AI-generated insights
- `GET /api/analysis/comprehensive/{id}` - All analyses combined
- `GET /api/analysis/strength/{id}` - Strength analysis with auto fatigue calculation

### Team Dashboard (NEW)
- `GET /api/dashboard/team` - Get aggregated team statistics

### Subscription
- `GET /api/subscription/plans` - Get all plans with regional pricing
- `GET /api/subscription/current` - Get user's current subscription
- `POST /api/subscription/subscribe` - Subscribe to a plan (starts trial)
- `POST /api/subscription/cancel` - Cancel subscription
- `GET /api/subscription/check-feature/{feature}` - Check feature access

### Reports
- `GET /api/reports/athlete/{id}/pdf?lang=xx` - Generate PDF report

---

## Test Credentials
- Email: `test@test.com`
- Password: `test`
- Athlete ID: `69862b75fc9efff29476e3ce`

## Preview URL
- https://peak-perform-4.preview.emergentagent.com
