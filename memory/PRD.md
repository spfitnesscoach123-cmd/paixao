# PRD — Load Manager Pro

## Problema Original
Aplicacao de gestao de carga atletica com dashboards de monitoramento (Team Dashboard, Dashboard Overview), perfil de atleta, importacao CSV de dados GPS, wellness, readiness, VBT, jumps, analise cientifica e exportacao PDF.

## Usuarios
- **Coach/Preparador Fisico**: Monitora metricas de carga, wellness e readiness de atletas
- **Credenciais de teste**: `contato@loadmanagerpro.com.br` / `#UAE2026`

## Arquitetura
- **Frontend**: Expo (React Native Web) porta 3000 / TestFlight (iOS)
- **Backend**: FastAPI porta 8001
- **Producao (Railway)**: `https://paixao-production.up.railway.app`
- **Preview (Emergent)**: `https://load-metrics-unify.preview.emergentagent.com`
- **Banco**: MongoDB via `MONGO_URL`
- **App iOS**: Aponta para Railway via `RAILWAY_PRODUCTION_URL` em `services/api.ts`

## Fonte Unica de Verdade
- `athlete_load_metrics` (EWMA via RollingLoadEngine com dedup) → Acute/Chronic/ACWR/Monotony/Strain
- `gps_data` com dedup Session/Period → Total Distance diario, timeline, heatmap
- `wellness` → wellness_score (0-10), readiness_score (0-10, exibido como 0-100%)
- Demais colecoes (jump_assessments, body_compositions, vbt_data, assessments) → queries ao vivo

## Recalculo Automatico (Mar 2026)
| Operacao | Recalcula athlete_load_metrics? |
|----------|-------------------------------|
| CREATE GPS | SIM (update_athlete_metrics) |
| DELETE GPS | SIM (clean stale + recalculate_from_date) |
| UPDATE activity-type GPS | SIM (recalculate_from_date) |
| DELETE Athlete | SIM (cascade delete 7 colecoes) |
| CREATE/DELETE wellness/jumps/bodycomp/VBT | N/A (live-queried) |

## Funcionalidades Implementadas
### Core
- Auth JWT + RevenueCat, CRUD atletas, Import CSV GPS
- Rolling Load Engine (EWMA) com dedup GPS + recalculo automatico em create/update/delete
- Dashboard Overview (Load Intelligence, Team Status, Jump, VBT, Body Comp)
- Team Dashboard com tabela de atletas
- Perfil individual do atleta (botoes)
- Filtros globais: 7d, 14d, 28d, 90d, Hoje, Ontem
- Exportacao PDF Dashboard Overview
- Analise Cientifica, Wellness form/tracking
- Cascade delete de atletas (7 colecoes)

### Correcoes Mar 2026
- [x] Dedup GPS no aggregate_gps_for_date (Session/Period keywords)
- [x] Recalculo automatico no DELETE GPS (3 fases: collect → delete → clean+recalc)
- [x] Recalculo automatico no UPDATE activity-type GPS
- [x] Cascade delete de atleta (7 colecoes)
- [x] Gauge Prontidao usa readiness_score real
- [x] Codigo morto removido (calc_acwr, calc_monotony_strain)
- [x] Recalculo global executado em Railway (28 atletas)
- [x] Khosaif acute corrigido: 22130 → 11125

## Backlog
### P1
- PDF crash em Analise Cientifica (recorrente >3x)
- Refatorar dashboards para Rolling Load Engine centralizado

### P2
- Internacionalizacao ScientificAnalysisTab e Avaliacoes
- ESLint config TypeScript

### P3
- UI merge perfis duplicados
- Remover frontend/ios_backup_before_removal/

## Arquivos Chave
- `backend/server.py` — Endpoints
- `backend/load_engine/rolling_load_engine.py` — EWMA, dedup, recalculo
- `frontend/services/api.ts` — Config API URL
- `frontend/app/(tabs)/data.tsx` — Dashboard Overview
- `frontend/app/(tabs)/team.tsx` — Team Dashboard
