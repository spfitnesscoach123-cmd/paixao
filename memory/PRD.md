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

## Arquivos Modificados/Criados (Session 5)
- `services/jump/types.ts` — ORIENTATION_MIN_WIDTH: 0.05, constantes SL-CMJ
- `services/frameTime.ts` — normalizeTimestamp(), integracao em getFrameTimestamp
- `services/jump/jumpDetector.ts` — checkAthleteOrientation invertida, identifyJumpLeg()
- `services/jump/useJumpCamera.ts` — Landing auto-stop, SL-CMJ continuous pipeline, firstLeg
- `app/athlete/[id]/jump-camera.tsx` — Leg selection UI, confidence badge, feedback, scientific btn
- `components/jump/OverlayLayer.tsx` — Mensagem de orientacao atualizada

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
