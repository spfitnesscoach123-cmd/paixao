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
├── utils/                 # 3 arquivos de funcoes puras
│   ├── body_calculations.py
│   ├── jump_calculations.py
│   └── load_calculations.py
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
