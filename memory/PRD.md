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
- Scientific Analysis tab (Analise Cientifica)
- Periodization planning
- Dashboard Visao Geral da Equipe (Advanced Intelligence Dashboard)
- GPS Activity Deletion with selection mode
- Jump Assessment deletion with confirmation
- Animated Wellness QTR Gauge (no needle)

## UI Modernization Layer (Mar 2026)

### Animation Architecture
All animations at `/app/frontend/components/animations/`:

| Component | Purpose | Duration |
|-----------|---------|----------|
| `useAnimatedCounter` | Numbers count up from 0 to value | 700ms |
| `AnimatedMetric` | Reusable animated number display | 700ms |
| `AnimatedCard` | Press physics (scale 1→0.97→1) | 140ms |
| `FadeInView` | Fade-in + slide-up entry | 400ms |
| `ChartEntryView` | Chart bar growth animation | 600ms |
| `SkeletonBar` | Single skeleton bar with shimmer | 1200ms loop |
| `SkeletonCard/Dashboard/List/Profile` | Pre-built skeleton layouts | shimmer |
| `PulseView` | Subtle pulse for live data | 3000ms loop |

### Pages Updated
- Dashboard (data.tsx) - FadeInView, ChartEntryView, AnimatedMetric, SkeletonDashboard
- Team Dashboard (team.tsx) - AnimatedMetric, AnimatedCard, FadeInView, SkeletonDashboard
- Athletes list (athletes.tsx) - AnimatedCard press physics, SkeletonList
- Athlete Profile ([id].tsx) - SkeletonProfile, SkeletonList, FadeInView
- Jump Assessment (jump-assessment.tsx) - FadeInView, SkeletonDashboard
- WellnessCharts - FadeInView, ChartEntryView
- ScientificAnalysisTab - SkeletonDashboard, FadeInView
- Periodization - SkeletonDashboard
- Compare Athletes - SkeletonDashboard

### Pages EXCLUDED (Camera Screens)
- VBT Camera (vbt-camera.tsx) - NO animations
- Jump Camera (jump-camera.tsx) - NO animations

## Key API Endpoints
- `GET /api/dashboard/overview` - Advanced dashboard data
- `GET /api/team-dashboard` - Team operational dashboard
- `GET /api/jump/analysis/{athlete_id}` - Jump analysis by protocol
- `POST /api/jump/assessment` - Save jump assessment
- `DELETE /api/jump/assessment/{id}` - Delete jump assessment
- `POST /api/gps-data` - GPS data import
- `POST /api/gps-data/delete-activities` - Delete GPS activities by session_ids
- `GET /api/gps-data/athlete/{id}/sessions` - Get athlete GPS sessions

## Tech Stack
- Frontend: React Native (Expo 54), TypeScript, react-native-svg, gifted-charts
- Backend: FastAPI, Motor (MongoDB async), JWT auth
- Database: MongoDB
- Animations: React Native Animated API (web-safe)

## Pending/Backlog
- (P2) PDF Generation fix in Analise Cientifica (recurring issue)
- (P2) Frontend dashboards migration to Rolling Load Engine API
- (P3) ESLint TypeScript configuration
- Internationalization completion
- Duplicate athlete merge UI
- Remove ios_backup directory
- Extract RiskDonut component from team.tsx
