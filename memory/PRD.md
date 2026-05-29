# Load Manager Pro - PRD

## Produto
App React Native Expo para gestao de carga de treinamento de atletas profissionais. Backend FastAPI + MongoDB.

## Usuarios
- Treinadores/Preparadores Fisicos de futebol profissional

## Arquitetura (Modularizada - Abril 2026)

### Backend Structure
```
/app/backend/
├── server.py              # 132 linhas - Orquestrador (FastAPI app + middleware + routers)
├── config.py              # MongoDB, env vars, load_engine, logging
├── dependencies.py        # Auth (JWT, bcrypt, get_current_user)
│
├── routes/                # 16 arquivos de rotas por dominio
│   ├── auth/routes.py            # Login, registro, perfil, devices, reset
│   ├── athletes/routes.py        # CRUD atletas, identity resolution
│   ├── gps/routes.py             # GPS data, sessions, classification
│   ├── periodization/routes.py   # Peak values, prescricoes, semanas
│   ├── wellness/routes.py        # Questionarios, tokens, links publicos
│   ├── body_composition/routes.py # Avaliacoes, protocolos
│   ├── load/routes.py            # ACWR, EWMA, fatigue, AI insights
│   ├── jumps/routes.py           # CMJ/SL-CMJ, RSI, analise
│   ├── jumps/camera_routes.py    # Import saltos via camera CSV
│   ├── strength/routes.py        # Analise de forca
│   ├── scientific/routes.py      # Analise cientifica, PDF reports
│   ├── dashboard/routes.py       # Team dashboard, overview, PDFs
│   ├── csv_import/routes.py      # CSV import, wearables
│   ├── vbt/routes.py             # VBT providers, data, analise
│   ├── subscriptions/routes.py   # Planos, RevenueCat webhooks
│   └── account/routes.py         # Delecao de conta
│
├── models/                # 17 arquivos de modelos Pydantic por dominio
├── utils/                 # 4 arquivos de funcoes puras
│   ├── body_calculations.py
│   ├── jump_calculations.py
│   ├── load_calculations.py
│   └── gps_session_resolver.py   # Etapa 1 (Maio/2026) - resolver central P1->P5
│
├── gps_import/            # Modulo externo GPS
├── jump_import/           # Modulo externo Jump
├── jump_analysis/         # Modulo externo analise saltos
├── identity_resolver/     # Modulo externo resolucao identidade
├── load_engine/           # Modulo externo EWMA/ACWR
└── csv_analyzer.py        # Analisador CSV
```

## Funcionalidades Implementadas
- GPS Data Management (import CSV multi-provider, CRUD, sessions)
- ACWR/EWMA Load Analysis (load_engine integrado)
- Team Dashboard com charts SVG
- Jump Assessment (CMJ, SL-CMJ, RSI, fatigue index)
- VBT - Velocity Based Training
- Body Composition (7 protocolos: Pollock, Jackson, Durnin, Guedes, Faulkner)
- Wellness Questionnaires (tokens, links publicos)
- Periodization (peak values, prescricoes semanais)
- Scientific Analysis + AI Insights (Emergent LLM)
- Dashboard Overview (LMPI, risk intelligence)
- CSV Import (multi-provider, identity resolution)
- RevenueCat Subscription webhooks
- Account Deletion (LGPD/GDPR compliant)
- Avatar3D (expo-gl, expo-three)

## Restricoes
- **NAO TOCAR** em VBT nem Jump Camera (perfeitamente funcionais)
- **NAO adicionar** *.env ao .gitignore (necessario para deploy Emergent)
- **Avatar3D**: container precisa de height explicita e width 100%. NUNCA usar alignItems center.
- **ACWR**: SEMPRE usar load_engine (EWMA), nunca calcular manualmente

## Backlog Futuro
- (P0) Session HUB / Station Mode (em progresso - ver abaixo)
- (P1) Data Import via PDF (converter para CSV)
- (P1) Export App Data to CSV
- (P2) Link Body Scan (MediaPipe) ao modelo 3D
- (P3) Refatorar MediaPipe para JSI worklets

## Modularizacao Concluida (Abril 2026)
- server.py: 12.547 → 132 linhas
- 36 arquivos modulares criados
- 17/17 endpoints testados com sucesso
- 100% compatibilidade com API original
- Zero mudancas funcionais

## Session HUB / Station Mode — Progresso
### FASE 1A — Safety Layer (CONCLUIDA)
- `recordingAthleteIdRef` introduzido em `vbt-camera.tsx`, `jump-camera.tsx`, `body-scan.tsx`
- Freeze do athleteId no momento do "Start Recording/Scanning"
- Save usa `recordingAthleteIdRef.current` (frozen) com fallback para `athleteId` atual
- `onSuccess` do VBT usa `variables.athlete_id` (payload) para cache invalidation

### FASE 1B — Navigation Layer (CONCLUIDA)
- `SessionContext` criado em `/contexts/SessionContext.tsx` (mode, activeAthleteId, returnPath)
- `SessionProvider` integrado no root `_layout.tsx`
- Tab "Athletes" agora abre o HUB com 3 cards: Atletas, VBT, Avaliacoes Fisicas
- Submenu de Avaliacoes Fisicas: Body Scan + Jump Assessment
- Card "Atletas" navega para lista de perfis (fluxo legacy preservado)
- Cards VBT/Body Scan/Jump navegam para selecao de atleta → modulo com `?returnPath=hub`
- `navigateBack()` function nos 3 modulos: respeita `returnPath=hub` para voltar ao HUB
- Fluxo A funcional: HUB → selecionar atleta → modulo → save → volta ao HUB

### FASE 2 — Integration Points (CONCLUIDA)
- `resetForNextAthlete()` implementado nos 3 modulos (VBT, Jump, Body Scan)
- `canSwitchAthlete` lock derivado em cada modulo
- Switch sequencing: lock verificado → reset(hook) → limpa overlays → reset phase → limpa recordingRef

### GO/NO-GO GATE (PASS — 6/6)
- Backend Regression, Profile Mode, Fluxo A, Identity Integrity, Lock, Reset — todos PASS

### FASE 3 — Station Mode VBT (CONCLUIDA)
- `VBTCameraContent` aceita `stationAthleteId` prop + `onSaveComplete` callback
- Nova rota `/station/vbt.tsx` — wrapper com inline athlete picker (header dropdown)
- Camera permanece montada ao trocar atleta (zero remount)
- Picker animado abre/fecha com lista de atletas + checkmark do atleta ativo
- Badge "STATION" no header identifica modo
- Botao "Station Mode" no card VBT do HUB
- Pos-save: picker reabre automaticamente para proximo atleta
- Botao X para sair → volta ao HUB
- Profile Mode e Fluxo A preservados via fallback (useLocalSearchParams quando stationAthleteId ausente)

### FASE 3B — Station Mode Jump (CONCLUIDA)
- `JumpCameraContent` exportada com `stationAthleteId` + `onSaveComplete` props
- Nova rota `/station/jump.tsx` — wrapper identico ao VBT (picker laranja #f59e0b)
- Botao "Station Mode" no card Jump Assessment (submenu Avaliacoes Fisicas)
- useJumpCamera hook INTACTO (0 modificacoes internas)
- 10/10 integrity checks PASS

### FASE 3C — Station Mode Body Scan (CONCLUIDA)
- Chain returnPath propagation: body-scan → protocol-select → measurement → report
- Nova rota `/station/body-scan.tsx` — picker de atletas (rosa #ec4899)
- Botao "Station Mode" no card Body Composition (submenu Avaliacoes Fisicas)
- report.tsx: navigateBack suporta returnPath='station' e 'hub'
- useBodyScan hook INTACTO (0 modificacoes)
- Nota: Body Scan Station Mode usa Fluxo A (navigation chain), nao camera persistente
- 6/6 chain + integrity checks PASS

### FASE 4 — Regression Completa (CONCLUIDA — 47/47 PASS)
- Backend: 18/18 endpoints OK
- HUB UI: 5/5 elementos OK
- Fluxo A (HUB): 3/3 navegacoes OK
- Profile Mode: 3/3 fluxos OK
- Station Mode VBT: 4/4 componentes OK
- Identity Integrity: 6/6 checks OK (freeze, lock, reset, payloads, closures, propagation)
- Code Analysis: 8/8 checks OK (exports, imports, sem duplicacao, hooks intactos, backend intacto)
- GO FOR PRODUCTION

### FUTURO: FASE 2 → FASE 3 → FASE 4


## ROADMAP (P0 → P3)
- (P1) Smart Summary empty-state crash guards (RadarChart/GaugeChart/DonutChart) em `app/(tabs)/data.tsx`.
- (P1) Data Import via PDF (converter PDF para CSV internamente).
- (P1) Export App Data to CSV.
- (P1) **Backend bug confirmado**: `routes/scientific/routes.py` lê `g.get("sprint_count")` (campo inexistente) em 3 lugares (linhas 126, 142, 945) — o correto é `number_of_sprints`. Causa do card "Sprints/Sessão" sempre zerado na aba Análises. NÃO corrigido nesta sessão por ordem explícita do usuário ("NÃO modificar backend").
- (P2) Jump Camera — rejeição de gaps de timestamp grandes durante voo (feet-out-of-frame) com rejection logic + Debug Modal já entregue.
- (P2) Linkar Body Scan (MediaPipe) ao modelo 3D.
- (P3) Refatorar MediaPipe pipeline para JSI worklets.
- (P3) Cleanup `app/athlete/[id]/vbt.tsx` (dead code) + V1 `services/vbt/RepDetector.ts`.

## UI/UX Fine-tuning (Fev 2026)
- Periodização: `colors.dark.background` (inexistente → undefined) substituído por `colors.dark.primary` em `app/periodization/[id].tsx` (3 locais) e `app/periodization/create.tsx` (2 locais). Corrige gradiente de fundo e botão `multiplierAdjust` que ficavam com fundo undefined.
- Periodização: banner "Base não disponível" teve contraste reforçado (bg 0.08→0.16, border 0.25→0.45) para legibilidade em Dark Mode.
- Dashboard Equipe: no modal de detalhe do `StackedBarChart`, valor "TD" deixou de usar `ZONE_COLORS.base` (#1B4C80, quase invisível no cartão escuro) e passou a usar `colors.text.primary` (contrast-safe em dark e light).
- Wellness Gauge: `containerHeight` do `QTRGauge.tsx` corrigido de `size * 0.85` para `size` (já aplicado em iteração anterior) — elimina recorte inferior do arco SVG.

## Apple Review + Tooltips (Abr 2026)
- **Política de Privacidade** atualizada com email/endereço oficiais (`contato@loadmanagerpro.com.br`, Ouro Fino – MG, CEP 37570-000) — requisito Apple Review.
- **Cadastro (Register)**: botão Voltar reposicionado dentro de `SafeAreaView` (edges=top), 44x44px com hitSlop, fora do `ScrollView`, fundo sutil para visibilidade — corrige "muito alto / difícil clicar" reportado em iPhone.
- **Componente reutilizável** `components/InfoTooltip.tsx`: ícone (i) + Modal popover leve, fecha ao toque fora ou OK, com `data-testid` único por instância.
- **6 tooltips em Periodização** + **3 tooltips por módulo funcional** (VBT, Jump, Body Composition) — todos sem alterar lógica funcional.
- **Body Composition no Hub**: removido botão "Station Mode" (não funcionava como nos outros módulos). VBT e Jump preservados.


## CSV Import — Activity Name + Session Total Period (Fev 2026)
Implementação **estritamente aditiva** no fluxo de import assistido (`upload-csv.tsx` + `/api/csv/import-mapped`). Zero alterações em dashboards, ACWR, load engine, consolidator, athlete profile, scientific reports, keyword matching legado ou na collection `gps_data` (nenhuma migration).

### Novidades
- **Activity Name** (opcional): TextInput na tela de revisão; default = nome do arquivo sem `.csv`. Salvo em `gps_data.session_name`.
- **Session Total Period** (opcional): seletor estilo radio com os valores únicos da coluna mapeada como `period_name`. Quando selecionado, cada registro recebe `record_type` = `"session_total"` (se `period_name` coincidir) ou `"period"` (caso contrário). Quando NÃO selecionado, o campo `record_type` é simplesmente omitido do documento (100% backward compatible).
- **`source_filename`**: nome original do CSV passa a ser persistido em todos os imports (campo aditivo, apenas auditoria/debug).

### Arquivos alterados
- `backend/csv_analyzer.py`: passa a retornar `unique_values_by_column` (apenas colunas com cardinalidade ≤ 30) na resposta de `/api/csv/analyze`.
- `backend/routes/csv_import/routes.py`: `/api/csv/import-mapped` aceita dois `Form` opcionais — `activity_name` e `session_total_period`. Persistência de `session_name` (override), `source_filename`, `record_type` (condicional).
- `frontend/app/upload-csv.tsx`: nova seção "Configuração da Sessão" na tela de revisão, com mesma linguagem visual dos cards existentes.

### Edge cases tratados
- CSV sem coluna `period_name` mapeada → seletor desabilitado, mensagem informativa.
- CSV com apenas um `period_name` → seletor exibe a única opção + "Nenhum".
- Valores vazios na coluna → ignorados na extração de únicos.
- Usuário não seleciona total → `record_type` ausente do documento, comportamento idêntico ao legado.
- Usuário deixa Activity Name em branco → fallback automático para o nome do arquivo sem extensão.

### Confirmações
- ✅ Nenhum dashboard alterado.
- ✅ Nenhuma lógica científica (ACWR, EWMA, load engine, periodização, scientific reports) alterada.
- ✅ Nenhuma migration criada.
- ✅ Nenhum endpoint legado quebrado — chamadas sem os novos campos continuam idênticas ao comportamento histórico.
- ✅ Testado backend e2e com curl (4 registros, com e sem os novos parâmetros).


## Team Dashboard — Session & Period Operational Filters (Fev 2026)
Implementação **estritamente aditiva e isolada ao Team Dashboard**. Permite que o coach analise dados GPS por sessão específica e por período da sessão (Warmup / 1st Half / 2nd Half / Session, etc.), sem impactar dashboards globais, cálculos científicos ou perfis individuais.

### Novos endpoints (additivos, escopo Team Dashboard)
- `GET /api/dashboard/team-table/session-names?date_range=7d` — lista `[{ session_name, count, last_date }]` distinto **dentro da mesma janela de data** usada por `team-table`.
- `GET /api/dashboard/team-table/session-periods?session_name=X&date_range=7d` — lista `period_name` distinto da sessão informada, **respeitando o mesmo `date_range`**.

### Endpoint estendido
- `GET /api/dashboard/team-table` aceita dois novos query params opcionais: `session_name`, `period_name`. Quando ausentes, comportamento byte-idêntico ao legado. Quando presentes, filtram **apenas a agregação GPS** antes do dedup heurístico — Wellness, RSImod e Body Composition seguem inalterados (apenas date_range).

### Frontend (Team Dashboard)
- 2 novos pickers (Session + Period) ao lado do filtro de data existente, na mesma linguagem visual (mesmos `filterButton`/`Modal`/`optionRow` styles).
- Picker Period só aparece quando uma sessão é selecionada.
- Trocar `date_range` reseta automaticamente `session` e `period` (impossível filtrar por valor fora da janela atual).
- Trocar `session` reseta `period`.
- Componentes que afetam: StackedBarChart, ScatterPlot, colunas GPS da TeamTable. **Não afetados**: NeuromuscularChart, colunas RSImod/Prontidão/Fadiga/Dor/Body da TeamTable (backend já os preenche independente do filtro GPS).

### Arquivos alterados
- `backend/routes/dashboard/routes.py`: extensão do `get_team_table` (filtro GPS-only) + 2 novos endpoints discovery.
- `frontend/hooks/useTeamTableData.ts`: aceita `sessionName?` e `periodName?` opcionais.
- `frontend/app/(tabs)/team.tsx`: estado + 2 queries + 2 botões de filtro + 2 modais (mesmo padrão visual do existente).

### Confirmações (validado por screenshots e curl e2e)
- ✅ `/dashboard/team`, `/dashboard/overview`, ACWR, EWMA, load engine, scientific reports, periodization, readiness, wellness, athlete profile, neuromuscular logic — **nenhuma alteração**.
- ✅ Nenhuma migration, nenhuma collection nova, nenhuma normalização retroativa.
- ✅ Heurística de keyword matching (`_GPS_SESSION_KW`/`_GPS_PERIOD_KW`) **preservada** — funciona como fallback para imports antigos sem `record_type`.
- ✅ Discovery endpoints respeitam `date_range` (sessões/períodos fora da janela não aparecem na UI).
- ✅ Teste e2e: bar chart muda de ~9.0 km (sessão completa) para ~3.6 km (1ST HALF only) ao aplicar os filtros.


## Etapa 1 — Resolver Central de GPS Session Totals (Mai/2026)

Unificação operacional/visual da resolução de "session totals" através de um único módulo central puro, substituindo 4 implementações inline duplicadas (3 idênticas + 1 divergente). Escopo estritamente read-path operacional/visual. **Nenhuma alteração** em Load Engine, Periodization, ACWR, EWMA, Scientific Reports, Readiness, pipelines Mongo, schemas, contratos de API, response shapes, frontend ou cálculos científicos persistidos.

### Novo módulo central
- `backend/utils/gps_session_resolver.py` — função pura `resolve_session_records(records)` sem IO, sem DB, sem logs, sem mutation.
- Predicados privados separados para testabilidade: `_is_explicit_session_total`, `_has_explicit_record_types`, `_is_consolidated_session_total`, `_is_legacy_session_keyword`, `_is_legacy_period_keyword`.

### Hierarquia de prioridade P1 → P5 (estrita)
- **P1**: existe `record_type == "session_total"` → retorna o **primeiro** encontrado.
- **P2**: nenhum P1 + qualquer `record_type` truthy → retorna **apenas** os records com `record_type` truthy (agnóstico ao vocabulário — qualquer valor explícito do coach conta; keyword matching ignorado).
- **P3**: nenhum P1/P2 + `has_session_total == True` (strict) → retorna o **primeiro** encontrado.
- **P4**: keyword matching legado (session keyword AND NOT period keyword) → retorna o **primeiro** match.
- **P5**: fallback — retorna **todos** os records (caller soma).

### Endpoints migrados (4)
- `GET /api/dashboard/team` — substituído block inline de keyword matching por `resolve_session_records`.
- `GET /api/dashboard/team-table` — idem.
- `GET /api/dashboard/overview` — `build_daily_gps()` agora delega ao resolver.
- `GET /api/gps-data/athlete/{athlete_id}/sessions` — refatorado para duas passadas internas (1ª: `periods[]` + max values; 2ª: resolver + `totals`). **Response shape 100% preservado**.

### Endpoints / sistemas NÃO tocados
- Load Engine, Periodization, ACWR/EWMA, Scientific Reports, Readiness.
- `utils/load_calculations.py::extract_gps_metrics_from_session` (usada por periodization/peak values).
- `routes/periodization/routes.py`, `load_engine/rolling_load_engine.py`, `routes/scientific/routes.py`, `gps_import/consolidator.py`.
- Frontend, schemas, contratos, queries Mongo, pipelines, collections.

### Convergência numérica consciente
Em `/gps-data/athlete/{id}/sessions` (endpoint D), registros legados com `period_name ∈ {Complete, Summary, Full, Sessão}` passam a ser tratados como session total (antes só `"session"` ou `"total"` qualificavam). Alinha D ao keyword set canônico já usado por A/B/C. **Mudança aprovada explicitamente.**

### Duplicação temporária consciente
Constantes legadas de keywords são duplicadas em `utils/gps_session_resolver.py` (versus `utils/load_calculations.py`) intencionalmente durante a Etapa 1, para isolar o resolver operacional do código científico. Consolidação postergada para Etapa 2.

### Testes
- `backend/tests/test_gps_session_resolver.py` — 31 testes cobrindo P1→P5, predicados, multi-language (sessão), records vazios/None, mutação, referência idêntica, comportamento agnóstico ao vocabulário.
- ✅ 31/31 passando.

### Confirmações
- ✅ Lint do resolver: 0 erros.
- ✅ Curl e2e: HTTP 200 em todos os 4 endpoints com payload válido.
- ✅ Endpoint D retornando `periods[]` + `totals` corretamente para João Silva (6 sessões, distâncias coerentes).
- ✅ Backend reload sem erros.
- ✅ Nenhuma alteração em cálculos científicos ou pipelines.

---
## Status update — 2026-05-29
- **Épico "Speed & Metabolic Load"**: Fase 2 (Import) ✅, Fase 3 (Tabela Analítica Team) ✅ APROVADA, Fase 4 (Dashboard Overview Layer) ✅ implementada — aguardando aprovação do checkpoint. Fase 5 (regressão final) pendente.
- **Dívida técnica registrada**: `backend/models/dashboard_models.py` é duplicado morto de `TeamTableRow` (definido localmente em `routes/dashboard/routes.py`). NÃO remover agora (decisão do usuário) — remover em limpeza futura.
- Detalhes completos em CHANGELOG.md.
