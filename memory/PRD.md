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
- Metrics: distance, high intensity, sprints, accelerations, decelerations, max speed

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

---

## What's Been Implemented

### December 6, 2025 (Current Session)
- Fixed duplicated `ANALYSIS_TRANSLATIONS` and `get_analysis_text` definitions in server.py
- Added `lang` parameter to `get_fatigue_analysis()` function
- Added `lang` parameter to `get_ai_insights()` function with language-specific prompts
- Updated `get_ai_insights()` to generate AI content in user's selected language
- Fixed hardcoded Portuguese text in `get_fatigue_analysis()` to use translations
- Fixed hardcoded UI strings in athlete detail page to use t() function
- Created test user (test@test.com / test)
- Created test athlete (ID: 69862b75fc9efff29476e3ce)
- All backend analysis endpoints now respect `lang` parameter

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
- [x] Fix backend duplicate code issue
- [x] Add multilingual support to analysis functions
- [x] Verify GPS session grouping

### P1 (Next Priority)
- [ ] Full i18n audit - find and translate any remaining hardcoded strings
- [ ] Add more GPS test data for comprehensive analysis testing
- [ ] Improve error handling in analysis endpoints

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

### Analysis (all support `?lang=en|pt|es|fr`)
- `GET /api/analysis/acwr/{id}` - Basic ACWR
- `GET /api/analysis/acwr-detailed/{id}` - Detailed ACWR by metric
- `GET /api/analysis/acwr-history/{id}` - ACWR evolution data
- `GET /api/analysis/fatigue/{id}` - Fatigue analysis
- `GET /api/analysis/ai-insights/{id}` - AI-generated insights
- `GET /api/analysis/comprehensive/{id}` - All analyses combined

### Reports
- `GET /api/reports/athlete/{id}/pdf?lang=xx` - Generate PDF report

---

## Test Credentials
- Email: `test@test.com`
- Password: `test`

## Database Schema (MongoDB Collections)
- `users`: id, email, hashed_password, name, created_at
- `athletes`: id, coach_id, name, birth_date, position, height, weight, photo_base64
- `gps_data`: id, athlete_id, coach_id, date, session_id, session_name, period_name, metrics...
- `wellness`: id, athlete_id, coach_id, date, sleep_hours, sleep_quality, fatigue, muscle_soreness, stress, mood, readiness_score, wellness_score
- `assessments`: id, athlete_id, coach_id, date, assessment_type, metrics...
