# PRD — Load Manager Pro

## Problema Original
Aplicacao de gestao de carga atletica com dashboards, perfil de atleta, import CSV GPS, wellness, readiness, VBT, jumps, analise cientifica e PDF.

## Credenciais
- **Coach**: `contato@loadmanagerpro.com.br` / `#UAE2026`

## Arquitetura
- Frontend: Expo (React Native Web) porta 3000 / TestFlight (iOS)
- Backend: FastAPI porta 8001
- Producao: `https://paixao-production.up.railway.app`
- Preview: `https://load-metrics-unify.preview.emergentagent.com`
- iOS aponta Railway via `RAILWAY_PRODUCTION_URL` em `services/api.ts`

## Fonte Unica de Verdade
- `athlete_load_metrics` (EWMA/RollingLoadEngine com dedup) → Acute/Chronic/ACWR/Monotony/Strain
- `gps_data` com dedup Session/Period → Timeline, Heatmap, Velocity Zones
- Demais colecoes (wellness, jump_assessments, body_compositions, vbt_data) → live-queried

## Recalculo Automatico
| Operacao | Recalcula athlete_load_metrics? |
|----------|-------------------------------|
| CREATE GPS | SIM (update_athlete_metrics) |
| DELETE GPS | SIM (clean stale + recalculate_from_date) |
| UPDATE activity-type GPS | SIM (recalculate_from_date) |
| DELETE Athlete | SIM (cascade delete 7 colecoes) |
| CREATE/DELETE wellness/jumps/bodycomp/VBT | N/A (live-queried) |

## Frontend Tab Refetch (useFocusEffect)
- data.tsx (Overview): useFocusEffect → refetch() ao ganhar foco
- team.tsx (Team Dashboard): useFocusEffect → refetch() ao ganhar foco
- Garante que tabs nunca mostram dados stale apos navegacao

## Correcoes Mar 2026
- [x] Dedup GPS no aggregate_gps_for_date
- [x] Recalculo automatico CREATE/DELETE/UPDATE GPS
- [x] Cascade delete de atleta (7 colecoes)
- [x] Gauge Prontidao usa readiness_score real
- [x] Codigo morto removido
- [x] useFocusEffect em Overview e Team Dashboard (fix stale data)
- [x] Delete GPS Phase 3: clean stale metrics from affected date forward
- [x] Recalculo global Railway (28 atletas, Khosaif corrigido 22130→11125)

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
- backend/server.py, backend/load_engine/rolling_load_engine.py
- frontend/app/(tabs)/data.tsx, frontend/app/(tabs)/team.tsx
- frontend/app/_layout.tsx, frontend/services/api.ts
