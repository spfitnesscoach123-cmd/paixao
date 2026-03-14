# PRD — Load Manager Pro

## Problema Original
Aplicacao de gestao de carga atletica com dashboards de monitoramento (Team Dashboard, Dashboard Overview), perfil de atleta, importacao CSV de dados GPS, wellness, readiness, VBT, jumps, analise cientifica e exportacao PDF.

## Usuarios
- **Coach/Preparador Fisico**: Monitora metricas de carga, wellness e readiness de atletas
- **Credenciais de teste**: `contato@loadmanagerpro.com.br` / `#UAE2026`

## Arquitetura
- **Frontend**: Expo (React Native Web) na porta 3000 / TestFlight (iOS)
- **Backend**: FastAPI na porta 8001
- **Producao (Railway)**: `https://paixao-production.up.railway.app`
- **Preview (Emergent)**: `https://load-metrics-unify.preview.emergentagent.com`
- **Banco**: MongoDB via `MONGO_URL`
- **App iOS (TestFlight)**: Aponta para Railway via `RAILWAY_PRODUCTION_URL` hardcoded em `services/api.ts`

## Fonte Unica de Verdade para Metricas GPS
- `athlete_load_metrics` (EWMA via RollingLoadEngine com dedup) → Acute Load, Chronic Load, ACWR, Monotony, Strain
- `gps_data` com dedup Session/Period → Total Distance diario, timeline, heatmap
- `wellness` → wellness_score (0-10), readiness_score (0-10, exibido como 0-100%)
- Team Dashboard = referencia de verdade para logica GPS

## Funcionalidades Implementadas

### Core
- Autenticacao JWT + RevenueCat
- CRUD de atletas (28 atletas em producao)
- Import CSV de dados GPS (catapult, statsports, etc.)
- Rolling Load Engine (EWMA) com dedup GPS
- Dashboard Overview com camadas: Load Intelligence, Team Status, Jump, VBT, Body Comp
- Team Dashboard com tabela de atletas e metricas agregadas
- Perfil individual do atleta com navegacao por botoes
- Filtros globais de data: 7d, 14d, 28d, 90d, Hoje, Ontem
- Exportacao PDF do Dashboard Overview
- Analise Cientifica com recomendacoes
- Wellness form e tracking

### Correcoes Mar 2026
- [x] Dedup GPS no `aggregate_gps_for_date()` — deployado + recalculado em producao
- [x] Endpoint `POST /api/load-metrics/recalculate-all` — criado e executado em Railway
- [x] Gauge "Prontidao" usa `readiness_score` real + exibe Wellness Medio
- [x] Codigo morto removido (calc_acwr, calc_monotony_strain)
- [x] Recalculo global executado em Railway (28 atletas)
- [x] KHOSAIF ABDALLAH: acute_load corrigido de 22130 → 11125 (alinhado com Team Dashboard)
- [x] team_acwr alinhado: 0.94 em ambos os dashboards
- [x] team_readiness alinhado: 72.3% em ambos os dashboards

### Correcoes Fev 2026
- [x] Alinhamento ACWR (EWMA centralizado)
- [x] Correcao PDF Export
- [x] Redesign menu perfil atleta
- [x] Filtros "Hoje"/"Ontem"

## Backlog

### P1
- PDF generation crash em "Analise Cientifica" (recorrente >3x)
- Refatorar outros dashboards para Rolling Load Engine

### P2
- Internacionalizacao (ScientificAnalysisTab, Avaliacoes)
- ESLint config TypeScript

### P3
- UI para merge perfis duplicados
- Remover `frontend/ios_backup_before_removal/`

## Arquivos Chave
- `backend/server.py` — Endpoints principais
- `backend/load_engine/rolling_load_engine.py` — EWMA, ACWR, dedup GPS
- `frontend/services/api.ts` — Config API URL (Railway hardcoded para producao)
- `frontend/app/(tabs)/data.tsx` — Dashboard Overview
- `frontend/app/(tabs)/team.tsx` — Team Dashboard
