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

### ✅ Bug Fixes (Feb 8, 2026 - Latest Session)

| Issue | Fix | Status |
|-------|-----|--------|
| VBT decimal input (m/s) not working | Implemented `vbtInputs` state for raw input tracking with `getVbtInputValue()` helper | ✅ Fixed |
| Body Composition Donut chart incorrect | Fixed SVG strokeDasharray/strokeDashoffset calculation, added zero-check | ✅ Fixed |
| PDF/CSV Preview not available | Created `ReportPreviewModal.tsx` component and backend preview endpoints | ✅ Fixed |
| Query invalidation key mismatch | Added `body-composition` key to invalidation in `add-body-composition.tsx` | ✅ Fixed |

**New Components/Endpoints:**
- `ReportPreviewModal.tsx` - Modal for previewing reports before download
- `GET /api/reports/athlete/{id}/preview` - Athlete report preview data
- `GET /api/reports/athlete/{id}/csv-preview` - CSV preview with sample rows
- `GET /api/reports/body-composition/{id}/preview` - Body composition preview

### ✅ Dashboard & VBT Enhancements (Dezembro 2025)

| Feature | Implementation | Status |
|---------|---------------|--------|
| RSI card em branco no dashboard | Backend corrigido para buscar RSI de `metrics.rsi` em vez de `assessment.rsi` | ✅ Fixed |
| HSR em metros | `team.tsx` já mostra em metros (team_avg_hid) | ✅ Verified |
| Card duplicado de distância | Substituído por card de HSR Médio em `data.tsx` | ✅ Fixed |
| Carga ótima (VBT) | Backend calcula optimal_load, optimal_velocity, optimal_power usando fórmula P=carga×velocidade | ✅ Implemented |
| Evolução da carga ótima | Backend retorna `optimal_load_evolution` com histórico por sessão | ✅ Implemented |
| PDF força tradicional | Seção de força tradicional adicionada com tabela separada (Supino, Agachamento, Levantamento Terra, Salto Vertical) | ✅ Implemented |
| OptimalLoadEvolutionChart | Novo componente em `add-strength.tsx` para visualizar evolução | ✅ Implemented |
| **Gráfico comparação força** | Atualizado para mostrar valores da última avaliação vs anterior | ✅ Implemented |
| **PDF seção de força** | PDF agora mostra seção de força com VBT e tradicional | ✅ Fixed |

**New Backend Fields (Strength Analysis):**
- `previous_assessment_date` - Data da avaliação anterior
- `metrics[].variation_from_previous` - % de mudança vs avaliação anterior
- `metrics[].previous_value` - Valor da avaliação anterior
- `comparison_with_previous` - Objeto com comparação detalhada

**New Frontend Features:**
- Seção "Comparação com Avaliação Anterior" no `StrengthAnalysisCharts.tsx`
- Barras visuais mostrando anterior vs atual com % de mudança
- Indicadores de melhora/piora com cores (verde/vermelho)

## Prioritized Backlog

### P1 - Next
- [ ] Full i18n audit
- [ ] Global theme (Light/Dark)
- [ ] Corrigir contagem de sessões em `charts.tsx` (1 CSV = 1 sessão)

### P2 - Planned
- [ ] Push Notifications
- [ ] Full OAuth wearable integration

### P3 - Future
- [ ] Gamification/Leaderboards
- [ ] Video analysis integration

## Test Credentials
- **Email**: preview_test@test.com
- **Password**: test123

## Last Updated
February 8, 2026
