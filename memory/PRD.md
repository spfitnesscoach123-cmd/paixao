# LoadManager Pro - PRD

## Original Problem Statement
Sports performance management app for coaches to track athletes' GPS data, wellness, assessments, body composition, and scientific analysis. Built with React Native (Expo) + FastAPI + MongoDB.

## Core Features Implemented
- Athlete CRUD with photo upload
- GPS data tracking with session grouping and period selection
- Wellness questionnaires with QTR gauge
- Physical assessments (Strength/VBT, Body Composition)
- Scientific Analysis with injury risk evaluation
- Team Dashboard with ACWR metrics (EWMA-based)
- Dashboard Overview with PDF export
- Periodization planning
- Compare athletes
- Wellness token/link generation
- Account management with deletion scheduling
- RevenueCat subscription integration
- Multi-language support (PT/EN)

## Architecture
- Frontend: React Native (Expo) with expo-router
- Backend: FastAPI (Python) with MongoDB
- Auth: JWT-based
- Key collections: athletes, gps_data, wellness_questionnaires, physical_assessments, athlete_load_metrics, body_composition, comprehensive_analyses

## Recent Changes

### 2026-03-14: Athlete Profile Navigation Menu Redesign
- Replaced horizontal tab bar with grid-style navigation buttons
- 5 buttons (Info, GPS Data, Wellness, Assessments, Analysis) in 2-column grid
- Active state: highlighted background, purple border, solid icon background
- Inactive state: subtle translucent background, clearly clickable
- No logic/route/content changes - purely visual
- File changed: `/app/frontend/app/athlete/[id].tsx`

### 2026-03-14 (Previous fork): ACWR Calculation Fix
- Fixed incorrect ACWR showing 4.0 on Team Dashboard
- Implemented RollingLoadEngine startup population of athlete_load_metrics collection
- Refactored /api/dashboard/team endpoint

### 2026-03-14 (Previous fork): Dashboard PDF Export Fixes
- Backend: SVG charts embedded, print-friendly white CSS
- Frontend: Native share sheet instead of new tab

## Pending Issues
- P1: PDF generation crash in "Análise Científica" (recurring >3 times)
- P2: Frontend dashboards not using RollingLoadEngine consistently
- P3: ESLint configuration for TypeScript

## Backlog
- Complete internationalization of ScientificAnalysisTab.tsx and "Avaliações" page
- Build UI for merging duplicate athlete profiles
- Remove backup directory frontend/ios_backup_before_removal/
- Extract RiskDonut component from team.tsx

## Credentials
- Coach: contato@loadmanagerpro.com.br / #UAE2026
- App Review Token: APPS26
