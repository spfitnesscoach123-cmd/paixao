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

## Estado Atual
- Build iOS: FUNCIONAL em device real via TestFlight
- Build Android: Aguardando teste
- Motor de Pose: REAL (MediaPipe Tasks Vision 0.10.21)
- Jump Camera: Funcional (valores precisam validacao fina)
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
- [ ] Validacao de precisao dos valores (jump height, flight time, RSImod)
- [ ] Validacao EAS Build Android

### P1
- [ ] Renderizacao de skeleto no VBT (atualmente so pontos verdes)
- [ ] Estabilidade: testes extensivos de crash em multiplas sessoes

### P2
- [ ] UI merge de perfis duplicados de atletas
- [ ] i18n de ScientificAnalysisTab e Avaliacoes
- [ ] Refatoracao trackingProtection.ts
- [ ] Remocao de codigo legacy VBT
- [ ] Gate de logs com __DEV__
