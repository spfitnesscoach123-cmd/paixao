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
5. Reintegracao MediaPipe — Expo Local Module autossuficiente
   - Modulo nativo: `modules/mediapipe-pose/`
   - iOS: AVCaptureSession + MediaPipe Tasks Vision (Swift, LIVE_STREAM)
   - Android: CameraX + MediaPipe Tasks Vision (Kotlin, VIDEO)
   - TypeScript: Types, View wrapper, NATIVE_POSE_AVAILABLE flag
   - MediaPipeCamera.tsx atualizado para usar modulo nativo com fallback web
   - Modelo: pose_landmarker_lite.task (5.6MB) incluso nos assets nativos
   - Zero dependencias externas novas (sem VisionCamera, sem worklets-core)
   - CNG-safe: nenhuma alteracao em Podfile, sem use_frameworks!, autocontido
   - Validado: Web export OK, 48/48 Jest tests passando, zero regressoes

6. iOS XCFramework Vendored (NOVO - 03/Abril/2026)
   - Resolucao do bloqueio P0: `MediaPipeTasksVision` linkado via XCFramework vendored
   - ZERO CocoaPods dependency para MediaPipe (bypassa use_frameworks! :linkage => :static)
   - XCFrameworks de SwiftTasksVision v0.10.21 (arm64 device + arm64/x86_64 simulator)
   - `import MediaPipeTasksVision` direto (sem #if canImport)
   - PoseLandmarkerService: liveStream mode com PoseLandmarkerLiveStreamDelegate
   - Podspec: vendored_frameworks + static_framework + linker flags (-ObjC, -lc++)
   - Pendente: validacao EAS Build iOS

## Estado Atual
- Build Web: 100% funcional, sem erros
- Build Nativo iOS: XCFrameworks vendored, aguardando EAS build
- Build Nativo Android: tasks-vision via Gradle, aguardando EAS build
- Motor de Pose: REAL no nativo (nao mock), fallback na web
- Protocolos: CMJ + SL-CMJ apenas (DJ removido)
- RSImod: Formula unica validada

## Arquitetura do Modulo MediaPipe

```
modules/mediapipe-pose/
├── ios/
│   ├── Frameworks/
│   │   ├── MediaPipeTasksVision.xcframework (7.5MB)
│   │   └── MediaPipeCommonGraphLibraries.xcframework (117MB)
│   ├── MediaPipePose.podspec (vendored, sem CocoaPods dependency)
│   ├── MediaPipePoseModule.swift (Expo Module Definition)
│   ├── MediaPipePoseView.swift (AVCaptureSession + ExpoView)
│   ├── PoseLandmarkerService.swift (import direto, liveStream mode)
│   └── pose_landmarker_lite.task (modelo ML)
├── android/
│   ├── build.gradle (tasks-vision:0.10.21 via Maven)
│   └── src/main/java/expo/modules/mediapipepose/
├── src/ (TypeScript bindings)
└── expo-module.config.json (autolinking CNG)
```

Pipeline nativo iOS:
```
Camera (AVCaptureSession) → CMSampleBuffer → PoseLandmarkerService.detectAsync()
  → PoseLandmarkerLiveStreamDelegate callback → 33 landmarks serializados
  → DispatchQueue.main → EventDispatcher → JS Thread
  → frameTime.ts → frameDrop.ts → jumpDetector.ts / VBT pipeline
```

## Proximo Passo Critico
- Executar `eas build --platform ios` para validar build nativo
- Confirmar import real de MediaPipeTasksVision sem erro de linker
- Testar em device real: landmarks > 0 em runtime
- Se build OK: testar Android tambem

## Backlog
### P0
- [x] Reintegracao segura da visao computacional (MediaPipe) — MODULO CRIADO
- [x] iOS XCFramework vendored — IMPLEMENTADO
- [ ] Validacao EAS Build iOS — PROXIMO
- [ ] Validacao EAS Build Android

### P2
- [ ] UI merge de perfis duplicados de atletas
- [ ] i18n de ScientificAnalysisTab e Avaliacoes
- [ ] Refatoracao trackingProtection.ts
- [ ] Remocao de codigo legacy VBT
- [ ] Gate de logs com __DEV__
