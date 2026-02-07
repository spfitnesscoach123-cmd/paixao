# PRD - Peak Perform - Athlete Performance Tracking

## Original Problem Statement
Sistema de rastreamento de desempenho de atletas com avaliações físicas, composição corporal, integração com wearables e sistemas VBT.

## Current Architecture
- **Backend**: FastAPI (Python) + MongoDB
- **Frontend**: React Native (Expo) + TypeScript
- **AI Integration**: OpenAI via Emergent LLM Key

## What's Been Implemented

### ✅ Core Features
- User authentication (login/register)
- Athlete CRUD operations
- GPS data tracking with filters
- Wellness questionnaires + QTR gauge
- Strength assessments with auto fatigue calculation
- Team dashboard with comprehensive metrics
- i18n support (PT/EN)

### ✅ ACWR Classification System (Feb 7, 2026)
| Range | Classification | Status |
|-------|----------------|--------|
| <0.8 | Losing Performance | Undertrained |
| 0.8-1.3 | Sweet Spot | Optimal |
| 1.3-1.5 | Caution Zone | Warning |
| >1.5 | High Risk | Overtrained |

**Components:**
- `ACWRBadge.tsx` - Visual badge with color coding
- `ACWRLegend.tsx` - Legend explaining ranges
- `getACWRClassification()` - Helper function

### ✅ Export Buttons PDF/CSV (Feb 7, 2026)
**Component:** `ExportButtons.tsx`
- CSV export (All data, GPS, Wellness, Strength)
- PDF report export
- Body Composition PDF report
- Located on athlete detail page (Info tab)

### ✅ Wellness Link Duration Options (Feb 7, 2026)
**Updated Options:**
- 30 minutes
- 2 hours
- 8 hours
- 24 hours (default)

**Backend:** `/api/wellness/generate-link?expires_hours=X`

### ✅ Subscription Plans Updated (Feb 7, 2026)

| Feature | Essencial | Profissional | Elite |
|---------|-----------|--------------|-------|
| **Max Athletes** | **20** | 50 | Ilimitado |
| **Price BRL** | R$ 39,90 | R$ 89,90 | R$ 159,90 |
| VBT Analysis | ❌ | ✅ | ✅ |
| Body Composition | ❌ | ✅ | ✅ |
| 3D Body Model | ❌ | ❌ | ✅ |
| Fatigue Alerts | ❌ | ✅ | ✅ |
| Export PDF/CSV | ❌ | ✅ | ✅ |
| AI Insights | ❌ | ❌ | ✅ |
| Multi-user | ❌ | ❌ | ✅ (2) |

### ✅ VBT Integration
- Integrated into Strength page with tabs
- Load-Velocity Profile chart
- Velocity Loss chart with 30% fatigue threshold
- Device providers with input methods

### ✅ Body Composition
- 4 scientific protocols (Guedes, Pollock 7/9, Faulkner)
- Dynamic form fields
- 3D body model visualization (Elite only)

### ✅ Team Dashboard
- 6 stat cards (ACWR, Wellness, Fatigue, Power, Body Fat, Sessions)
- ACWR Legend with classification
- Risk distribution chart
- Athlete list with ACWR badges
- Position group averages section

### ✅ Bug Fixes (Feb 7, 2026 - Latest Session)

| Issue | Fix | Status |
|-------|-----|--------|
| Dashboard session count incorrect | Changed to count unique sessions by `date + session_name` | ✅ Fixed |
| Position groups showing individuals | Implemented GROUP AVERAGES for each position | ✅ Fixed |
| Training zones using heart rate | Already using velocity-based zones (% Vmax) | ✅ Verified |
| Wellness colors inverted | Implemented `getValueColor()` with inverted logic for fatigue/stress/pain | ✅ Fixed |
| Decimal input for m/s fields | Added `formatDecimalInput()` to convert comma to dot | ✅ Fixed |
| QTRGauge component cut off | Fixed height/viewBox calculations (containerHeight = size * 0.85) | ✅ Fixed |
| injury_risk None type error | Changed to proper boolean validation | ✅ Fixed |

**Position Summary now includes:**
- `count` - Number of athletes
- `avg_acwr` - Group average ACWR
- `avg_wellness` - Group average wellness
- `avg_fatigue` - Group average fatigue
- `avg_distance` - Group average distance (meters)
- `avg_sprints` - Group average sprints
- `avg_max_speed` - Group average max speed (km/h)
- `high_risk_count` - Athletes at high risk

## Prioritized Backlog

### P1 - Next
- [ ] Full i18n audit
- [ ] Global theme (Light/Dark)

### P2 - Planned
- [ ] Push Notifications
- [ ] Full OAuth wearable integration
- [ ] PDF/CSV report preview mechanism

### P3 - Future
- [ ] Gamification/Leaderboards
- [ ] Video analysis integration

## Test Credentials
- **Email**: testuser@test.com
- **Password**: Test123!

## Last Updated
February 7, 2026
