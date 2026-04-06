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

## Arquivos Modificados/Criados (Session 4)
- `services/jump/types.ts` — JumpPoseLandmarks + OrientationResult + ORIENTATION_MIN_WIDTH
- `services/jump/jumpDetector.ts` — checkAthleteOrientation + shoulders/knees
- `services/jump/useJumpCamera.ts` — timestamp, orientacao, confirmContinue, showContinueButton
- `app/athlete/[id]/jump-camera.tsx` — OverlayLayer, timestamp, overlay keypoints, scanner 'ready'
- `components/jump/OverlayLayer.tsx` — NOVO componente visual isolado

## Pendente / Backlog

### P1
- [ ] Nova UI moderna para VBT e Jump Camera (design do usuario)
- [ ] Skeleton completo no VBT camera
- [ ] Redesign navegacao "Activity Hub" (Atividade → Atleta)

### P2
- [ ] Importacao de dados via PDF (PDF → CSV)
- [ ] Exportacao de dados para CSV
- [ ] UI para merge de perfis duplicados
- [ ] Detalhe no PDF Export

### P3
- [ ] i18n de ScientificAnalysisTab e Avaliacoes
- [ ] Refatoracao trackingProtection.ts (codigo legacy VBT)
- [ ] Gate de logs com __DEV__

## Credenciais
- User: contato@loadmanagerpro.com.br
- Password: #UAE2026
