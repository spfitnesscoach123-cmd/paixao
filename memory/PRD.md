# Load Manager Pro - PRD

## Original Problem Statement
Aplicativo de monitoramento de carga esportiva com React Native (frontend) + FastAPI (backend) + MongoDB.

## Bug Crítico P0 - Dashboard Visão Geral: Dados Desatualizados
**Status: CORRIGIDO (2026-03-14)**

### Causa Raiz
A função `get_dashboard_overview` em `server.py` computava métricas de carga (ACWR, LMPI, RSI, monotony, strain, acute/chronic load) **independentemente** da existência de GPS data para cada atleta. O `get_team_dashboard` gateava essas computações dentro de `if gps_data:`. Isso causava divergência: após deletar GPS activities, o Team Dashboard zerava tudo, mas o Overview continuava mostrando valores de wellness, RSI e LMPI.

### Correção Aplicada
1. Adicionado flag `has_gps_data` por atleta
2. ACWR/monotony/strain/acute/chronic só computados quando `has_gps_data=True`
3. LMPI = None quando `has_gps_data=False`
4. Team summary averages (team_acwr, team_rsimod, team_lmpi, etc.) filtrados por atletas com GPS data
5. Wellness/readiness mantidos para todos atletas (dados válidos independentes de GPS)

### Validação
- Testado com curl: delete GPS → ambos dashboards zeram métricas de carga ✓
- Testado: add GPS → ambos dashboards mostram dados consistentes ✓
- Testado: recalculate-all após delete → métricas permanecem null ✓
- **NÃO validado em produção Railway** — requer deploy pelo usuário

## Pendentes

### P1
- PDF generation crash em "Análise Científica"
- Verificação de features anteriores pelo usuário

### P2
- Refatorar dashboards para usar Rolling Load Engine consistentemente
- RSI discrepância entre dashboards (Overview usa latest CMJ RSI, Team usa agregação diferente)

### P3/Backlog
- Internacionalização de ScientificAnalysisTab.tsx e Avaliações
- ESLint config para TypeScript
- UI para merge de perfis duplicados
- Remover diretório ios_backup_before_removal/

## Arquitetura
- Backend: FastAPI (`/app/backend/server.py`) - 12K+ lines
- Frontend: React Native/Expo (`/app/frontend/`)
- DB: MongoDB (football_training)
- Deploy produção: Railway

## Endpoints Chave
- GET /api/dashboard/overview — Dashboard Visão Geral
- GET /api/dashboard/team — Team Dashboard
- POST /api/gps-data/delete-activities — Deletar atividades GPS
- POST /api/load-metrics/recalculate-all — Recalcular métricas
