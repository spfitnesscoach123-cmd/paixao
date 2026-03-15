# Load Manager Pro - PRD

## Original Problem Statement
Aplicativo de monitoramento de carga esportiva com React Native (frontend) + FastAPI (backend) + MongoDB.

## Bugs Corrigidos

### Bug P0 - Dashboard Visão Geral: Dados Desatualizados (2026-03-14)
**Causa raiz**: `get_dashboard_overview` computava métricas independente de GPS data.
**Correção**: Flag `has_gps_data` gates toda computação de load metrics.

### Bug - Wellness Residual no Estado Vazio (2026-03-14)
**Causa raiz**: Frontend usava `|| 5` como fallback nas barras de wellness.
**Correção**: Substituído por check `hasWellnessData ? value : 0`.

### Bug - Dashboard Equipe Desaparece no Estado Vazio (2026-03-14)
**Causa raiz**: `team.tsx` fazia early return removendo estrutura da página.
**Correção**: Empty state integrado no fluxo normal.

### UI - DJ Oculto e Entrada Manual Removida (2026-03-14)
**Alterações**:
1. DJ removido de PROTOCOLS em `jump-assessment.tsx` (comentado)
2. DJ removido do modal de protocolos em `jump-camera.tsx`
3. DJ removido de PROTO_OPTS em `ScientificAnalysisTab.tsx` (comentado)
4. Entrada manual removida da Avaliação do Salto (toggle + form)
5. Texto de empty state atualizado

**Código DJ preservado em**:
- `services/jump/types.ts` — JUMP_PROTOCOL_INFO completo
- `components/JumpAnalysisCharts.tsx` — DJ fallback para dados históricos
- Backend: endpoints e cálculos de DJ intactos
- Condicionais `selectedProtocol === 'dj'` em jump-camera.tsx preservadas (dead paths)

## Pendentes

### P1
- PDF generation crash em "Análise Científica"

### P2
- Refatorar dashboards para Rolling Load Engine
- RSI discrepância entre Overview e Team

### P3/Backlog
- Internacionalização ScientificAnalysisTab.tsx e Avaliações
- ESLint TypeScript config
- UI merge perfis duplicados
- Remover ios_backup_before_removal/

## Arquitetura
- Backend: FastAPI (`/app/backend/server.py`)
- Frontend: React Native/Expo (`/app/frontend/`)
- DB: MongoDB (football_training)
- Deploy produção: Railway
