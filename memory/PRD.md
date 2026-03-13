# Load Manager Pro - PRD

## Problem Statement
A comprehensive athlete load management platform for coaches, featuring VBT (Velocity-Based Training) camera, jump assessments, wellness monitoring, GPS data import, and team dashboards. Built with React Native (Expo) frontend and FastAPI + MongoDB backend.

## Core Features (Implemented)
- Coach authentication with JWT
- Athlete CRUD management
- VBT Camera with barbell tracking (MediaPipe pose detection)
- Jump Assessment (manual entry + camera-based) with protocol-specific architecture (CMJ/DJ/SL-CMJ)
- Wellness forms with shareable tokens
- Team dashboard with risk indicators
- GPS/Catapult data import (CSV)
- Rolling Load Engine (backend)
- RevenueCat subscription management
- Scientific Analysis tab (Análise Científica)
- Periodization planning
- **Dashboard Visão Geral da Equipe (Advanced Intelligence Dashboard)**
- **GPS Activity Deletion with selection mode**
- **Jump Assessment deletion with confirmation**
- **Animated Wellness QTR Gauge (no needle)**

## Dashboard Visão Geral da Equipe (data.tsx)

### Architecture
- Backend: `GET /api/dashboard/overview` — aggregation & visualization layer over existing metrics
- Frontend: `app/(tabs)/data.tsx` — complete rebuild with 5 layers
- Does NOT recalculate ACWR/Monotony/Strain — reuses existing calculations
- LMPI (LoadManager Performance Indicator) is the only new composite metric (0-100 scale)

### 3 Automatic Modes
- **TEAM MODE**: athlete=all → team averages, all athletes in charts
- **POSITION MODE**: position selected → position group averages
- **ATHLETE MODE**: 1 athlete → individual longitudinal analysis

### 5 Layers
1. **Load Intelligence**: Acute/Chronic Load gauges, Total Distance timeline, ACWR scatter, Velocity Zones donut, Weekly Heatmap, Load Ranking table
2. **Smart Summary**: LMPI Gauge, Performance Profile radar, ACWR vs Wellness quadrant, Availability donut, High Risk table
3. **Team Status**: Readiness gauge, Wellness bars, Cumulative Load, Availability, Low Readiness table
4. **Neuromuscular Status**: Neuro Score gauge, RSImod longitudinal/comparison, CMJ Radar, VBT Fatigue by exercise
5. **Risk Intelligence**: Risk Score gauge, ACWR vs Wellness quadrant, RSImod vs ACWR scatter, SL-CMJ Asymmetry alerts, Full Risk Panel table

### LMPI Formula
ACWR→30% + Wellness→25% + RSImod→20% + VBT Fatigue→15% + Monotony→10%

## Key API Endpoints
- `GET /api/dashboard/overview` — Advanced dashboard data (filters: athlete_id, position, date_range, lang)
- `GET /api/team-dashboard` — Team operational dashboard
- `GET /api/jump/analysis/{athlete_id}` — Jump analysis by protocol
- `POST /api/jump/assessment` — Save jump assessment
- `DELETE /api/jump/assessment/{id}` — Delete jump assessment
- `POST /api/gps-data` — GPS data import
- `POST /api/gps-data/delete-activities` — Delete GPS activities by session_ids
- `GET /api/gps-data/athlete/{id}/sessions` — Get athlete GPS sessions
- `GET /api/athletes` — List athletes

## Tech Stack
- Frontend: React Native (Expo), TypeScript, react-native-svg, react-native-gifted-charts
- Backend: FastAPI, Motor (MongoDB async), JWT auth
- Database: MongoDB
- Charts: Custom SVG (Gauge, Radar, Quadrant, Heatmap, Line, Donut, Bar)

## Status
### Completed (Mar 2026 - System Cleanup & UX)
- Removed "View Detailed Charts" button from Athlete Profile
- Removed "Upload CSV" button from GPS Data tab
- Added GPS Activity Deletion with selection mode, checkboxes, confirmation modal
- Fixed Scientific Analysis activity counting (only SESSION periods)
- Improved Wellness QTR Gauge: animated progress, no needle
- Improved Jump Test Date Display: collapsible dropdown selector
- Added Jump Assessment deletion with confirmation modal
- Merged SL-CMJ (D) and SL-CMJ (E) into single "SL-CMJ" protocol across all pages
- Fixed NoneType errors in GPS sessions endpoint

### Previously Completed
- All 5 layers of Dashboard Visão Geral
- CSV Import button moved to Team Dashboard
- Backend aggregation endpoint with 3 modes
- Global filters with instant reactivity

### Pending/Backlog
- (P2) PDF Generation fix in Análise Científica (recurring issue)
- (P2) Frontend dashboards migration to Rolling Load Engine API
- (P3) ESLint TypeScript configuration
- Internationalization completion
- Duplicate athlete merge UI
- Remove ios_backup directory
- Extract RiskDonut component from team.tsx
