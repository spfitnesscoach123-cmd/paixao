# Load Manager Pro - PRD

## Problema Original
Aplicacao full-stack React Native (Expo SDK 54) + FastAPI para monitoramento esportivo VBT e analise de saltos.

## Protocolos Ativos
- CMJ (Counter Movement Jump)
- SL-CMJ Right / Left (Single Leg CMJ)

## Formula Padrao Unica
RSImod = jumpHeight(m) / time_to_takeoff(s)
- jumpHeight = (g * flight_time^2) / 8
- time_to_takeoff = t_takeoff - t_movement_start

## Implementado

### Sessao 02/Abril/2026
1. Precisao Temporal: Date.now() -> performance.now() monotonico no pipeline
2. Frame Drop Detection: FrameIntegrityMonitor com protecao no VBT e Jump
3. Unificacao RSI -> RSImod (formula unica em todo o sistema)
4. Remocao completa de Drop Jump (DJ): enum, funcoes, UI, endpoints, analises

### Sessao 03-04/Abril/2026
5. Reintegracao MediaPipe — Expo Local Module
   - Modulo nativo: modules/mediapipe-pose/
   - iOS: AVCaptureSession + MediaPipe Tasks Vision (Swift, LIVE_STREAM)
   - Android: CameraX + MediaPipe Tasks Vision (Kotlin, VIDEO)
   - TypeScript: Types, View wrapper, NATIVE_POSE_AVAILABLE flag

6. iOS XCFramework Vendored
   - MediaPipeTasksVision + MediaPipeCommonGraphLibraries vendored (bypass CocoaPods)
   - import direto (sem #if canImport)
   - Podspec: vendored_frameworks + static_framework + linker flags

7. Fix Fabric/New Architecture compatibility
   - requireOptionalNativeModule + requireNativeViewManager (expo-modules-core)

8. Fix NSLog → os_log (privacy: .public)
   - Logger(subsystem: "com.loadmanagerpro.mediapipe", category: "pose/view")

9. Fix crash no deinit da MediaPipePoseView
   - Causa: stopSession() com [weak self] no async dispatch — self nil apos dealloc
   - Fix: videoOutput.setSampleBufferDelegate(nil) imediato + referencias locais strong
   - Resultado: ZERO crashes em device real

### MARCO: Pipeline End-to-End Funcional (04/Abril/2026)
- Camera → MediaPipe → 33 Landmarks → JS → JumpDetector/VBT → Resultados
- Jump Camera: tempo de voo registrado, graficos funcionais
- VBT Camera: repeticoes salvas com velocidade m/s
- Testado em iPhone 16 Pro Max via TestFlight
- Zero crashes ao iniciar/parar gravacao

### Sessao 05/Abril/2026 — Correcao Timing Jump Camera v2
10. Simetria de Eventos (Parte 1.1)
    - MIN_LANDING_FRAMES = 2 (simetrico com MIN_TAKEOFF_FRAMES = 2)
    - Landing agora exige 2 frames consecutivos confirmando contato
    - Timestamp do landing = primeiro frame da sequencia confirmada

11. Compensacao de Latencia (Parte 1.2)
    - takeoffFrameIdx compensado: max(0, idx - 1)
    - landingFrameIdx compensado: min(totalFrames - 1, idx + 1)
    - Aplicado APOS confirmacao do evento e validacao de limites

12. Threshold Adaptativo com Clamp (Parte 2)
    - Substituido max(0.025, stdDev * 2.5) por clamp(stdDev * 1.5, 0.008, 0.02)
    - Zona morta reduzida de 2.5% para max 2% da tela
    - Minimo 0.8% para manter robustez contra ruido

13. Consistencia de Landmarks (Parte 4)
    - Landmark travado no inicio da calibracao (foot_index OU ankle)
    - Sem alternancia durante o salto (elimina inconsistencia de referencia)

14. Scanner de Calibracao (Parte 5)
    - Nova fase 'scanning' antes do countdown
    - Fase 1 (0-3s): Coleta de dados de calibracao
    - Fase 2 (3-5s): Analise de estabilidade + calculo de confidenceScore
    - Score = foot_stability*0.5 + pose_confidence*0.3 + ground_stability*0.2
    - Thresholds: >= 0.80 auto-start, 0.65-0.80 aviso, < 0.65 bloqueio
    - Auto-retry ate 2x, depois botao manual "Recalibrar"
    - Overlay visual: linha do solo, barra de progresso, cores (verde/amarelo/vermelho)

## Estado Atual
- Build iOS: FUNCIONAL em device real via TestFlight
- Build Android: Aguardando teste
- Motor de Pose: REAL (MediaPipe Tasks Vision 0.10.21)
- Jump Camera: Funcional com correcoes de timing v2 (scanner + compensacao)
- VBT Camera: Funcional (skeleto nao renderizado, apenas pontos verdes)
- Protocolos: CMJ + SL-CMJ
- RSImod: Formula unica validada
- Deploy Web: requirements.txt limpo (41 pacotes vs 140)

## Backlog
### P0
- [x] Reintegracao segura da visao computacional (MediaPipe)
- [x] iOS XCFramework vendored
- [x] Fix Fabric/New Architecture compatibility
- [x] Fix crash deinit
- [x] Pipeline end-to-end funcional
- [x] Correcao de timing Jump Camera v2 (Partes 1-5)
- [ ] Validacao de precisao em device real (usuario testar com salto conhecido)
- [ ] Validacao EAS Build Android

### P1
- [ ] Renderizacao de skeleto no VBT (atualmente so pontos verdes)
- [ ] Nova UI moderna para telas VBT e Jump Camera (design pronto)
- [ ] Redesign Navegacao "Activity Hub" (selecionar atividade → depois atleta)
- [ ] Menu dedicado VBT
- [ ] Estabilidade: testes extensivos de crash em multiplas sessoes

### P2
- [ ] Importacao dados via PDF (PDF → CSV)
- [ ] Exportacao dados para CSV
- [ ] Detalhe no PDF Export (aguardando especificacao)
- [ ] UI merge de perfis duplicados de atletas
- [ ] i18n de ScientificAnalysisTab e Avaliacoes
- [ ] Refatoracao trackingProtection.ts
- [ ] Remocao de codigo legacy VBT
- [ ] Gate de logs com __DEV__
