# Load Manager Pro - PRD

## Original Problem Statement
Aplicativo de monitoramento de carga esportiva com React Native (frontend) + FastAPI (backend) + MongoDB.

## Bugs Corrigidos

### Bug P0 - Dashboard Visão Geral: Dados Desatualizados (2026-03-14)
**Causa raiz**: `get_dashboard_overview` computava ACWR, LMPI, RSI, monotony, strain independente de GPS data. Team Dashboard gateava tudo dentro de `if gps_data:`.
**Correção**: Flag `has_gps_data` por atleta gates toda computação de load metrics. Team summary averages filtrados por atletas com GPS.

### Bug - Wellness Residual no Estado Vazio (2026-03-14)
**Causa raiz**: Frontend `data.tsx` usava `|| 5` como fallback nas HorizontalBar de wellness (fatigue, stress, soreness). Quando não há dados, `0 || 5 = 5`, mostrando valores artificiais.
**Correção**: Substituído `|| 5` por check `hasWellnessData ? value : 0`. Agregação de wellness agora filtra apenas atletas COM wellness_details.

### Bug - Dashboard Equipe Desaparece no Estado Vazio (2026-03-14)
**Causa raiz**: `team.tsx` fazia early return com view simplificada quando `hasNoData`, removendo filtros, botão CSV e cards da página.
**Correção**: Removido early return. Empty state integrado dentro do fluxo normal da página (após botão CSV import). Estrutura mantida mesmo com zero atletas.

## Arquivos Alterados
- `/app/backend/server.py` - `get_dashboard_overview`: has_gps_data gating
- `/app/frontend/app/(tabs)/data.tsx` - Wellness aggregation + HorizontalBar fallback
- `/app/frontend/app/(tabs)/team.tsx` - Removido early return, empty state inline

## Pendentes

### P1
- PDF generation crash em "Análise Científica"
- Verificação de features anteriores pelo usuário

### P2
- Refatorar dashboards para usar Rolling Load Engine consistentemente
- RSI discrepância entre Overview (latest CMJ) e Team (agregação diferente)

### P3/Backlog
- Internacionalização de ScientificAnalysisTab.tsx e Avaliações
- ESLint config para TypeScript
- UI para merge de perfis duplicados
- Remover diretório ios_backup_before_removal/

## Arquitetura
- Backend: FastAPI (`/app/backend/server.py`)
- Frontend: React Native/Expo (`/app/frontend/`)
- DB: MongoDB (football_training)
- Deploy produção: Railway
