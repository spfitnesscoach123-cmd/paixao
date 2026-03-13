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
- **Dashboard Visão Geral da Equipe (Advanced Intelligence Dashboard)** — NEW

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
3. **Team Status**: Readiness gauge, Wellness bars (Sleep/Fatigue/Stress/Soreness/Mood), Cumulative Load, Availability, Low Readiness table
4. **Neuromuscular Status**: Neuro Score gauge, RSImod longitudinal/comparison, CMJ Radar, VBT Fatigue by exercise
5. **Risk Intelligence**: Risk Score gauge, ACWR vs Wellness quadrant, RSImod vs ACWR scatter, SL-CMJ Asymmetry alerts, Full Risk Panel table

### Filters
- Athlete (dropdown, all or specific)
- Date Range (7d/14d/28d/90d)
- Position (dropdown, from athlete profiles)

### LMPI Formula
ACWR→30% + Wellness→25% + RSImod→20% + VBT Fatigue→15% + Monotony→10%

### Rules
- ACWR always uses Total Distance
- CMJ protocol is primary for neuromuscular monitoring
- VBT data grouped by exercise, never mixed
- SL-CMJ used for asymmetry risk indicators
- Last valid assessment per athlete for team comparisons

## Key API Endpoints
- `GET /api/dashboard/overview` — Advanced dashboard data (filters: athlete_id, position, date_range, lang)
- `GET /api/team-dashboard` — Team operational dashboard
- `GET /api/jump/analysis/{athlete_id}` — Jump analysis by protocol
- `POST /api/jump/assessment` — Save jump assessment
- `POST /api/gps-data` — GPS data import
- `GET /api/athletes` — List athletes

## Tech Stack
- Frontend: React Native (Expo), TypeScript, react-native-svg, react-native-gifted-charts
- Backend: FastAPI, Motor (MongoDB async), JWT auth
- Database: MongoDB
- Charts: Custom SVG (Gauge, Radar, Quadrant, Heatmap, Line, Donut, Bar)

## Status
### Completed
- All 5 layers of Dashboard Visão Geral
- CSV Import button moved to Team Dashboard
- Backend aggregation endpoint with 3 modes
- Global filters with instant reactivity
- Layer transitions with fade animation
- Insights per layer
- All backend tests pass (20/20)
- All frontend tests pass (8/8)

### Pending/Backlog
- (P2) PDF Generation fix in Análise Científica
- (P2) Frontend dashboards migration to Rolling Load Engine API
- (P3) ESLint TypeScript configuration
- Internationalization completion
- Duplicate athlete merge UI
- Remove ios_backup directory
- Extract RiskDonut component from team.tsx
