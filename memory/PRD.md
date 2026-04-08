# Load Manager Pro — PRD

## Produto
App de monitoramento de carga atletica com camera inteligente para avaliacao de saltos (CMJ, SL-CMJ) e VBT.

## Stack
- **Frontend**: React Native Expo (TypeScript)
- **Backend**: FastAPI (Python)
- **DB**: MongoDB
- **Camera**: MediaPipe Pose Tasks (iOS nativo)

## Arquitetura do Jump Camera Pipeline
```
Camera Frame → MediaPipe → onLandmark(landmarks, timestamp)
→ handleMediapipeLandmark(event, nativeTimestamp)
→ convertMediapipeLandmarks → keypoints[]
→ processFrame(keypoints, nativeTimestamp)
  ├─ Scanning: orientation check + calibration frames
  ├─ Countdown: continue collecting calibration
  ├─ Recording: jump detection frames
  └─ Processing: analyzeJumpFrames()
→ OverlayLayer (visual only, isolated)
```

## Implementado

### Session 1-2 (antes)
- [x] Pipeline completo Jump Camera com MediaPipe
- [x] Pre-Jump Scanner 3 fases (collect + analyze + decision)
- [x] Flight time com compensacao de latencia
- [x] MIN_LANDING_FRAMES=2 simetrico
- [x] RSImod classificacao cientifica (CMJ thresholds)
- [x] Backend reclassificacao on-the-fly
- [x] ScientificAnalysisTab com tooltips

### Session 3 (2026-02-XX)
- [x] Auditoria tecnica completa do Jump Camera (7 secoes)

### Session 4 (2026-04-06) — P0 + P1
- [x] **P0.1 — Validacao de Orientacao**: `checkAthleteOrientation()` em jumpDetector.ts
  - Captura coordenadas X de ombros e quadril
  - Threshold `ORIENTATION_MIN_WIDTH: 0.06`
  - Tracking durante scanning (visual feedback)
  - Bloqueio apenas no ponto de decisao (nao durante ajuste)
  - >= 0.80 + orientacao invalida → bloqueia
  - 0.65-0.79 + confirmContinue verifica orientacao
- [x] **P0.2 — Timestamp Nativo**: Propagacao do timestamp do MediaPipe
  - handleMediapipeLandmark(event, nativeTimestamp?)
  - processFrame(keypoints, nativeTimestamp?)
  - getFrameTimestamp(nativeTimestamp) usa nativo quando disponivel
- [x] **P1.1 — OverlayLayer**: Componente visual isolado
  - /components/jump/OverlayLayer.tsx
  - pointerEvents="none", nunca altera logica
  - onLayout para medir dimensoes do container
- [x] **P1.2 — Scanner Visual Animado**:
  - Scan line animada (top→bottom loop, 2s)
  - Linha do solo com animacao pulse
  - Pontos nos pes (12px, cor por qualidade)
  - Skeleton leve (8 conexoes, ~45% opacidade, sem maos/face)
  - Dots nas articulacoes (8px)
  - Banner de orientacao invalida
- [x] **P1.3/P1.4 — Fluxo de Confianca Controlado**:
  - >= 80% + orientacao OK → auto-start
  - 65-79% → fase 'ready', botao "Continuar mesmo assim" apos 500ms estavel
  - < 65% → retry automatico (2x) ou bloqueio
  - confirmContinue() verifica orientacao antes de prosseguir
- [x] **Performance**: Overlay throttled a ~15fps (cada 2 frames)

### Session 5 (2026-04-07) — Bug Fixes + SL-CMJ Continuous Pipeline
- [x] **P0.1 — Auto-stop baseado em Landing**: Landing detection no processFrame
  - CMJ: 3 frames consecutivos no solo apos takeoff → auto-stop 300ms
  - Timeout fallback mantido (6s CMJ, 15s SL-CMJ)
- [x] **P0.2 — Consistencia de Timestamp**: normalizeTimestamp() em frameTime.ts
  - Converte timestamps nativos de segundos para ms quando necessario
  - recordingStartTimeRef agora usa timestamp do primeiro frame (mesma fonte)
- [x] **P0.3 — Orientacao Lateral Obrigatoria**: Inversao da logica
  - Lateral (ombros/quadril < 0.05) = VALIDO
  - Frontal (ombros/quadril >= 0.05) = INVALIDO → bloqueia
  - Mensagem: "Posicione-se de lado para a camera"
- [x] **P1.4 — Confidence Score Sempre Visivel**: Badge durante countdown e recording
- [x] **P1.5 — Frame Count Removido**: Removido da UI, apenas interno
- [x] **P1.6 — Botao "Ver Detalhes Cientificos"**: Na tela de resultados
- [x] **P1.5 — SL-CMJ Continuous Pipeline**: Gravacao unica com 2 saltos
  - State machine: WAITING_FIRST → FIRST_DETECTED → WAITING_SECOND → COMPLETED
  - Intervalo minimo 500ms entre saltos (ignora ruido)
  - Split de frames para analise independente de cada salto
  - Reset limpo de refs de deteccao entre saltos
- [x] **P1.5.8 — Selecao de Perna**: UI para escolher qual perna primeiro (SL-CMJ)
  - Exibe ordem: "1o salto: PERNA DIREITA / 2o salto: PERNA ESQUERDA"
- [x] **P1.5.10 — Feedback em Tempo Real**: Mensagens durante gravacao SL-CMJ
  - "Aguardando salto 1..."
  - "Salto 1 detectado (Perna Direita) / Prepare-se..."
  - "Aguardando salto 2..."
  - "Salto 2 detectado / Processando..."

### Session 5b (2026-04-07) — VBT V2 Implementation
- [x] **MovementDetector** (NEW): Displacement-based movement detection
  - Direction detection via deltaY with 3-frame confirmation
  - Min displacement threshold: 8% of screen (0.08)
  - Direction threshold: 0.5% (0.005)
  - Phase displacement tracking with reset between reps
- [x] **RepDetectorV2** (NEW): Displacement-driven rep state machine
  - Transitions driven by displacement, NOT velocity
  - Velocity collected for metrics only, not for gating
  - Supports eccentric-first (Squat/Bench) and concentric-first (Deadlift)
  - Min phase displacement: 3% (0.03)
  - Same timing guards: 150ms min phase, 300ms lockout, 10s max
- [x] **VBTAnalyzer** (NEW): Performance analysis brain
  - Baseline = max(first 3 reps mean velocities)
  - Optional baseline update when faster rep detected
  - Rep classification: FAST (>=75% baseline), NORMAL, FATIGUED (<50%)
  - Calibration phase: first 3 reps show "CALIBRANDO..."
  - Drop % clamped to 0 (no negative drops)
- [x] **VelocityCalculator** (MODIFIED): Lower noise + adaptive smoothing
  - noiseThreshold: 0.02 -> 0.005 m/s
  - Adaptive window: 3 frames for slow (<0.1 m/s), 5 frames for fast
- [x] **VBTGauge** (NEW): SVG circular gauge component
  - 270-degree arc with progress (velocity/baseline)
  - Center: rep count (large), velocity (small), drop % with trend arrow
  - Color: green (<10%), yellow (10-20%), red (>20%), blue (calibrating)
- [x] **UI Layout V2**: Gauge-based overlay
  - Top-left: REPS badge, Top-right: DROP % badge
  - Center: VBTGauge, Bottom: phase indicator
  - Applied to both native and web/simulation camera views

## New Files Created (Session 5b)
- `services/vbt/MovementDetector.ts`
- `services/vbt/RepDetectorV2.ts`
- `services/vbt/VBTAnalyzer.ts`
- `components/vbt/VBTGauge.tsx`

## Files Modified (Session 5b)
- `services/vbt/VelocityCalculator.ts` — noise threshold + adaptive smoothing
- `services/vbt/useProtectedBarTracking.ts` — V2 module integration
- `app/athlete/[id]/vbt-camera.tsx` — Gauge UI layout

### Session 6 (2026-04-08) — SL-CMJ State Machine Fix (P0)
- [x] **P0 — SL-CMJ Landing Detection**: `detectSLCMJLanding` corrigida
  - Removido OR logic (pé inativo disparava landing falso durante takeoff)
  - Agora verifica APENAS o pé ativo — simétrico com `detectSLCMJTakeoff`
- [x] **P1 — Active Leg Priority**: Protocolo do usuário tem prioridade absoluta
  - `detectActiveLeg` rebaixada para fallback/log
  - `setActiveLeg(protocolLeg)` sempre usa escolha do protocolo
- [x] **CMJ INTOCADO**: `detectCMJTakeoff`, `detectCMJLanding`, pipeline CMJ sem alterações
- [x] **P1 — JumpGraph CMJ Visual Fix**: Grafico em tempo real corrigido
  - Causa raiz: `useMemo` nao recomputava (ref array mesmo reference) — fix: spread `[...ref]`
  - Fundo escuro removido (background transparente)
  - Curva suavizada com Quadratic Bezier (nao mais Polyline linear)
  - Efeito area chart com fill 15% opacity
  - Smoothing 5-point moving average
  - Buffer limitado a 120 pontos
  - Zero alteracao em logica de deteccao/metricas/SL-CMJ

## Pendente / Backlog

### P1
- [ ] Nova UI moderna para VBT e Jump Camera (design do usuario)
- [ ] Skeleton completo no VBT camera
- [ ] Redesign navegacao "Activity Hub" (Atividade → Atleta)
- [ ] identifyJumpLeg() — validar perna detectada vs perna esperada no SL-CMJ

### P2
- [ ] Importacao de dados via PDF (PDF → CSV)
- [ ] Exportacao de dados para CSV
- [ ] UI para merge de perfis duplicados
- [ ] Detalhe no PDF Export

### P3
- [ ] i18n de ScientificAnalysisTab e Avaliacoes
- [ ] Refatoracao trackingProtection.ts (codigo legacy VBT)
- [ ] Gate de logs com __DEV__
- [ ] Remover codigo morto (between_jumps, startSecondJump)

## Credenciais
- User: contato@loadmanagerpro.com.br
- Password: #UAE2026
