# PRD — Load Manager Pro

## Problema Original
Aplicacao de gestao de carga atletica com dashboards de monitoramento (Team Dashboard, Dashboard Overview), perfil de atleta, importacao CSV de dados GPS, wellness, readiness, VBT, jumps, analise cientifica e exportacao PDF.

## Usuarios
- **Coach/Preparador Fisico**: Monitora metricas de carga, wellness e readiness de atletas
- **Credenciais de teste**: `contato@loadmanagerpro.com.br` / `#UAE2026`

## Arquitetura
- **Frontend**: Expo (React Native Web) na porta 3000
- **Backend**: FastAPI na porta 8001
- **Banco**: MongoDB via `MONGO_URL`
- **URL publica**: `https://load-metrics-unify.preview.emergentagent.com`

## Fonte Unica de Verdade para Metricas GPS
- `athlete_load_metrics` (EWMA via RollingLoadEngine) → Acute Load, Chronic Load, ACWR, Monotony, Strain
- `gps_data` com dedup Session/Period → Total Distance diario, timeline, heatmap
- `wellness` → wellness_score (0-10), readiness_score (0-10, exibido como 0-100%)
- Team Dashboard = referencia de verdade para logica GPS

## Funcionalidades Implementadas

### Core
- Autenticacao JWT + RevenueCat
- CRUD de atletas
- Import CSV de dados GPS (catapult, statsports, etc.)
- Rolling Load Engine (EWMA) com dedup GPS
- Dashboard Overview com camadas: Load Intelligence, Team Status, Jump, VBT, Body Comp
- Team Dashboard com tabela de atletas e metricas agregadas
- Perfil individual do atleta com navegacao por botoes
- Filtros globais de data: 7d, 14d, 28d, 90d, Hoje, Ontem
- Exportacao PDF do Dashboard Overview
- Analise Cientifica com recomendacoes
- Wellness form e tracking

### Correcoes Recentes (Mar 2026)
- [x] P1: Dedup GPS no `aggregate_gps_for_date()` — corrigido para nao somar Session + sub-periodos
- [x] P2: Endpoint `POST /api/load-metrics/recalculate-all` para rebuild completo — executado com sucesso
- [x] P3: Gauge "Prontidao" agora usa `readiness_score` real (nao wellness*10) + exibe Wellness Medio abaixo
- [x] P4: Codigo morto removido (calc_acwr, calc_monotony_strain inline no Overview)
- [x] Alinhamento completo validado: Team Dashboard ACWR=1.0 = Overview ACWR=1.0, Readiness=54% em ambos
- [x] Recalculo global executado e validado visualmente

### Correcoes Anteriores (Fev 2026)
- [x] Alinhamento ACWR entre Team Dashboard e Dashboard Overview (EWMA centralizado)
- [x] Correcao PDF Export (valores zerados → dados corretos)
- [x] Redesign menu do perfil do atleta (grid de botoes)
- [x] Filtros "Hoje" e "Ontem" no Dashboard Overview

## Backlog (Priorizado)

### P0 — Critico
- Nenhum pendente

### P1 — Alto
- PDF generation crash em "Analise Cientifica" (recorrente >3x)
- Refatorar outros dashboards para usar Rolling Load Engine centralizado
- Validar em producao (Railway) com dados reais do atleta Khosaif Abdallah apos deploy

### P2 — Medio
- Internacionalizacao completa do ScientificAnalysisTab e pagina "Avaliacoes"
- Corrigir configuracao ESLint para TypeScript

### P3 — Baixo
- UI para merge de perfis duplicados de atletas
- Remover diretorio backup `frontend/ios_backup_before_removal/`

## Arquivos Chave
- `backend/server.py` — Endpoints principais (12000+ linhas)
- `backend/load_engine/rolling_load_engine.py` — EWMA, ACWR, dedup GPS
- `frontend/app/(tabs)/data.tsx` — Dashboard Overview
- `frontend/app/(tabs)/team.tsx` — Team Dashboard
- `frontend/app/athlete/[id].tsx` — Perfil do atleta

## Colecoes MongoDB
- `athletes`, `gps_data`, `athlete_load_metrics`, `wellness`, `jump_assessments`, `vbt_data`, `body_compositions`, `coaches`
