# PRD - Peak Perform - Athlete Performance Tracking

## Original Problem Statement
Sistema de rastreamento de desempenho de atletas com:
- Autenticação de usuários
- Gerenciamento de atletas
- Dados GPS e wellness
- Avaliações físicas (força e composição corporal)
- Análises de IA para insights de desempenho
- Sistema de assinaturas em 3 níveis
- Dashboard de equipe
- Suporte a múltiplos idiomas (PT/EN)

## Current Architecture
- **Backend**: FastAPI (Python) + MongoDB
- **Frontend**: React Native (Expo) + TypeScript
- **AI Integration**: OpenAI via Emergent LLM Key
- **Auth**: JWT-based authentication

## What's Been Implemented

### ✅ Core Features (Completed)
- User authentication (login/register)
- Athlete CRUD operations
- GPS data tracking and analysis
- Wellness questionnaires
- QTR (Quality of Recovery) gauge
- Strength assessments with auto fatigue calculation
- Subscription system (3 tiers: Essencial, Profissional, Elite)
- Team dashboard with aggregated stats
- i18n support (PT/EN)

### ✅ Body Composition Feature (NEW - Feb 2026)
**Backend Endpoints:**
- `GET /api/body-composition/protocols` - List available protocols
- `POST /api/body-composition` - Create new assessment
- `GET /api/body-composition/athlete/{id}` - Get athlete's assessments
- `GET /api/body-composition/{id}` - Get specific assessment
- `DELETE /api/body-composition/{id}` - Delete assessment
- `GET /api/analysis/body-composition/{id}` - AI analysis

**Supported Protocols:**
1. Guedes (1985) - 3 skinfolds (Brazilian validated)
2. Pollock & Jackson 7 - 7 skinfolds
3. Pollock & Jackson 9 - 9 skinfolds (most comprehensive)
4. Faulkner 4 - 4 skinfolds (athletes)

**Calculated Metrics:**
- Body Fat % (using Siri equation)
- Lean Mass (kg)
- Fat Mass (kg)
- Bone Mass (kg) (estimated)
- BMI + Classification
- Fat Distribution for 3D body visualization

**Frontend:**
- Form page at `/athlete/[id]/add-body-composition.tsx`
- Charts component at `/components/BodyCompositionCharts.tsx`
- Updated translations (PT/EN)

## Backlog (Prioritized)

### P1 - High Priority
- [ ] **Complete Global Theme Implementation** - 30+ files need refactoring
- [ ] **Full i18n Audit** - Find and replace remaining hardcoded strings

### P2 - Medium Priority
- [ ] **Push Notifications** - Critical alerts system
- [ ] **PDF Export for Body Composition** - Print-ready reports
- [ ] **Body Composition in Team Dashboard** - Aggregated body comp stats
- [ ] **3D Body Model Enhancement** - More detailed visualization
- [ ] **Gamification/Leaderboards**

### P3 - Future
- [ ] **Advanced Reporting** - CSV/PDF export for all data
- [ ] **Wearable Integration** - Garmin, Polar APIs
- [ ] **VBT Integration** - GymAware and similar systems

## Key API Endpoints

### Authentication
- `POST /api/auth/register`
- `POST /api/auth/login`

### Athletes
- `GET/POST /api/athletes`
- `GET/PUT/DELETE /api/athletes/{id}`

### Body Composition
- `GET /api/body-composition/protocols`
- `POST /api/body-composition`
- `GET /api/body-composition/athlete/{id}`
- `GET /api/analysis/body-composition/{id}`

### Analysis
- `GET /api/analysis/comprehensive/{athlete_id}`
- `GET /api/analysis/strength/{athlete_id}`
- `GET /api/analysis/body-composition/{athlete_id}`
- `GET /api/dashboard/team`

## Database Collections
- `users` - User accounts
- `athletes` - Athlete profiles
- `gps_data` - GPS tracking data
- `wellness` - Wellness questionnaires
- `assessments` - Physical assessments (strength)
- `body_compositions` - Body composition assessments (NEW)
- `subscriptions` - User subscriptions

## Technical Notes

### Body Composition Calculations
The system implements scientifically validated formulas:
- **Body Density**: Calculated using protocol-specific equations
- **Body Fat %**: Siri equation: `(495/density) - 450`
- **BMI**: `weight(kg) / height(m)²`
- **Bone Mass**: Estimated using Martin formula approximation

### Theme System
- ThemeContext exists at `/contexts/ThemeContext.tsx`
- Toggle available in Profile screen
- ~30 files still use hardcoded colors from `/constants/theme.ts`
- Refactoring needed to apply theme globally

## Test Credentials
- Email: `test@test.com`
- Password: `password`

## Last Updated
February 7, 2026
