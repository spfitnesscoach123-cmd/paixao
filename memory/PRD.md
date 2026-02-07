# PRD - Peak Perform - Athlete Performance Tracking

## Original Problem Statement
Sistema de rastreamento de desempenho de atletas com avaliações físicas, composição corporal, integração com wearables e sistemas VBT.

## Current Architecture
- **Backend**: FastAPI (Python) + MongoDB
- **Frontend**: React Native (Expo) + TypeScript
- **AI Integration**: OpenAI via Emergent LLM Key

## What's Been Implemented (Feb 7, 2026)

### ✅ Core Features
- User authentication (login/register)
- Athlete CRUD operations
- GPS data tracking with filters
- Wellness questionnaires + QTR gauge
- Strength assessments with auto fatigue calculation
- Subscription system (3 tiers)
- Team dashboard with power/body fat averages
- i18n support (PT/EN)

### ✅ VBT Integration in Strength Page
**Features:**
- Integrated VBT into add-strength.tsx with tabs (Traditional Strength / VBT)
- Exercise selector with 12 preset exercises
- Device/Provider selection with input method info (GymAware, PUSH Band, Vitruve, etc.)
- Multi-set data entry with decimal support (formatDecimalInput helper)
- Load-Velocity Profile chart with regression line and 1RM estimation
- Velocity Loss per Set bar chart with **>30% fatigue alert**
- AI-powered recommendations

**Endpoints:**
- `GET /api/vbt/providers`
- `POST /api/vbt/data`
- `GET /api/vbt/analysis/{athlete_id}`

### ✅ Body Composition
**Protocols:**
- Guedes (1985) - 3 skinfolds (Brazilian) - FORMULA FIXED to use log10
- Pollock & Jackson 7 - 7 skinfolds
- Pollock & Jackson 9 - 9 skinfolds
- Faulkner 4 - 4 skinfolds (athletes)

**Features:**
- Dynamic form with protocol selector
- SVG body diagram showing measurement points
- Protocol-specific skinfold fields

### ✅ 3D Body Model Visualization
**Features:**
- Enhanced SVG 3D model with gradients and highlights
- Front view and Side view toggle
- **Improved value visibility**: White text on black background labels
- Color-coded fat distribution (green/yellow/red)
- Interactive region details with progress bars

### ✅ Team Dashboard Enhancements
**New Stats Cards:**
- **Avg Power (W)**: Team average strength from assessments
- **Body Fat %**: Team average body composition

**Alerts:**
- Power drop alerts (>30%)
- High ACWR alerts
- Fatigue alerts

### ✅ Responsiveness Improvements
- Charts use responsive dimensions based on screen width
- `Dimensions.get('window')` for adaptive layouts
- Mobile-first design approach

## Prioritized Backlog

### P1 - Next
- [ ] Full i18n audit - translate remaining hardcoded strings
- [ ] Global theme implementation (Light/Dark mode)

### P2 - Planned
- [ ] Push Notifications for critical alerts
- [ ] UI for downloading PDF/CSV reports
- [ ] Full OAuth wearable integration (Garmin Connect, Polar Flow)

### P3 - Future
- [ ] Gamification/Leaderboards
- [ ] Advanced team analytics dashboard
- [ ] Video analysis integration

## Key Technical Notes

### VBT Device Input Methods
| Device | Input Method |
|--------|-------------|
| GymAware | API/Bluetooth |
| PUSH Band | App Sync |
| Vitruve | App Sync |
| Beast Sensor | Bluetooth |
| Tendo Unit | USB/CSV |
| Manual | Manual Entry |

### Decimal Input Fix
```typescript
const formatDecimalInput = (value: string): string => {
  return value.replace(',', '.');
};
```

### VBT Fatigue Detection
- Velocity loss >30% triggers fatigue alert
- Alert displayed as banner with warning message
- Recommendation to reduce volume or load

## Test Credentials
- **Email**: test@test.com
- **Password**: password
- **Athlete ID**: 69862b75fc9efff29476e3ce

## Last Updated
February 7, 2026
