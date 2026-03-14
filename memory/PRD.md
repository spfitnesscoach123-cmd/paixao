# Load Manager Pro - PRD

## Problem Statement
A comprehensive athlete load management platform for coaches, featuring VBT camera, jump assessments, wellness monitoring, GPS data import, and team dashboards. Built with React Native (Expo) frontend and FastAPI + MongoDB backend.

## Core Features (Implemented)
- Coach authentication with JWT
- Athlete CRUD management
- VBT Camera with barbell tracking (MediaPipe pose detection)
- Jump Assessment (manual + camera) with protocol architecture (CMJ/DJ/SL-CMJ)
- Wellness forms with shareable tokens
- Team dashboard with risk indicators
- GPS/Catapult data import (CSV)
- Rolling Load Engine (backend)
- RevenueCat subscription management
- Scientific Analysis tab
- Periodization planning
- Dashboard Visao Geral da Equipe (5-layer Intelligence Dashboard)
- GPS Activity Deletion with selection mode
- Jump Assessment deletion with confirmation
- Animated Wellness QTR Gauge
- UI Modernization (skeleton loaders, animated counters, card press physics, fade transitions)
- **Dashboard PDF Export with layer selection modal**
- **Scientific Analysis date dropdown for jump assessments**

## Dashboard PDF Export
- Button in header (red tint, document icon + "PDF" text)
- Modal: "EXPORT DASHBOARD REPORT" with 5 checkboxes (Load Intelligence, Smart Summary, Team Status, Neuromuscular, Risk Intelligence)
- Backend: GET /api/report/dashboard-overview generates styled HTML with selected layers
- Each section on separate page in PDF
- Web: opens new window with print dialog; Mobile: expo-print + expo-sharing

## Key API Endpoints
- GET /api/dashboard/overview - Dashboard data
- GET /api/report/dashboard-overview - Dashboard PDF HTML (layers param)
- GET /api/team-dashboard - Team dashboard
- GET /api/jump/analysis/{id} - Jump analysis
- POST/DELETE /api/jump/assessment - Jump CRUD
- POST /api/gps-data/delete-activities - GPS delete
- GET /api/gps-data/athlete/{id}/sessions - GPS sessions

## Pending/Backlog
- (P2) PDF Generation fix in Scientific Analysis (recurring crash)
- (P2) Frontend dashboards migration to Rolling Load Engine API
- (P3) ESLint TypeScript configuration
- Internationalization completion
- Duplicate athlete merge UI
- Remove ios_backup directory
- Extract RiskDonut component
