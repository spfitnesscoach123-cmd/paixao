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

### Sessao 03/Abril/2026
5. Reintegracao MediaPipe — Expo Local Module autossuficiente (Opcao B)
   - Modulo nativo: `modules/mediapipe-pose/`
   - iOS: AVCaptureSession + MediaPipe Tasks Vision (Swift, LIVE_STREAM)
   - Android: CameraX + MediaPipe Tasks Vision (Kotlin, LIVE_STREAM)
   - TypeScript: Types, View wrapper, NATIVE_POSE_AVAILABLE flag
   - MediaPipeCamera.tsx atualizado para usar modulo nativo com fallback web
   - Modelo: pose_landmarker_lite.task (5.6MB) incluso nos assets nativos
   - Zero dependencias externas novas (sem VisionCamera, sem worklets-core)
   - CNG-safe: nenhuma alteracao em Podfile, sem use_frameworks!, autocontido
   - Validado: Web export OK, 48/48 Jest tests passando, zero regressoes

## Estado Atual
- Build Web: 100% funcional, sem erros
- Build Nativo: Modulo criado, aguarda primeiro EAS build para validacao
- Motor de Pose: Modulo nativo pronto (MEDIAPIPE_AVAILABLE=true apos EAS build)
- Fallback Web: Simulacao mantida (MEDIAPIPE_AVAILABLE=false na web)
- Protocolos: CMJ + SL-CMJ apenas (DJ removido)
- RSImod: Formula unica validada

## Arquitetura do Modulo MediaPipe

```
modules/mediapipe-pose/
├── ios/    (Swift: AVCaptureSession + PoseLandmarker)
├── android/ (Kotlin: CameraX + PoseLandmarker)
├── src/   (TypeScript: tipos + view wrapper)
└── expo-module.config.json (autolinking CNG)
```

Pipeline nativo:
```
Camera Nativa → Frame (native thread) → MediaPipe PoseLandmarker (LIVE_STREAM)
  → 33 landmarks + timestamp → EventDispatcher → JS Thread
  → frameTime.ts → frameDrop.ts → jumpDetector.ts / VBT pipeline
```

## Proximo Passo Critico
- Executar `npx expo prebuild --clean` + `eas build` para validar build nativo
- Testar em device real (iOS + Android)
- Se build falhar por conflito MediaPipeTasksVision/CocoaPods:
  alternativa = vendored XCFramework no podspec

## Backlog
### P0
- [x] Reintegracao segura da visao computacional (MediaPipe) — MODULO CRIADO
- [ ] Validacao EAS Build (iOS + Android) — PROXIMO

### P2
- [ ] UI merge de perfis duplicados de atletas
- [ ] i18n de ScientificAnalysisTab e Avaliacoes
- [ ] Refatoracao trackingProtection.ts
- [ ] Remocao de codigo legacy VBT
- [ ] Gate de logs com __DEV__
