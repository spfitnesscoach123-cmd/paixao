# MediaPipe Pose — Expo Local Module

## Arquitetura

Modulo Expo local autossuficiente que gerencia camera + MediaPipe Pose Landmarker inteiramente no nativo (Swift/Kotlin). Zero dependencias externas de JS. JS recebe apenas landmarks serializados.

```
App (JS Thread)
  ├── MediaPipeCamera.tsx (React wrapper)
  │   └── importa mediapipe-pose (este modulo)
  │       └── MediaPipePoseView (Native View)
  │           ├── iOS: AVCaptureSession + MediaPipe Tasks Vision
  │           └── Android: CameraX + MediaPipe Tasks Vision
  ├── frameTime.ts (timestamp monotônico do frame nativo)
  ├── frameDrop.ts (detecção de frames perdidos)
  └── jumpDetector.ts / VBT pipeline (logica de negocio)
```

## Estrutura do Modulo

```
modules/mediapipe-pose/
├── expo-module.config.json     # Config de autolinking Expo
├── package.json                # Dependencia local
├── tsconfig.json
├── src/
│   ├── index.ts                # Entry point + NATIVE_POSE_AVAILABLE flag
│   ├── MediaPipePose.types.ts  # Tipos TypeScript compartilhados
│   └── MediaPipePoseView.tsx   # React wrapper para view nativa
├── ios/
│   ├── MediaPipePose.podspec   # Dependencia: MediaPipeTasksVision via CocoaPods
│   ├── MediaPipePoseModule.swift      # Definicao do modulo Expo
│   ├── MediaPipePoseView.swift        # AVCaptureSession + View nativa
│   ├── PoseLandmarkerService.swift    # Wrapper do MediaPipe (LIVE_STREAM)
│   └── pose_landmarker_lite.task      # Modelo MediaPipe (5.6MB)
└── android/
    ├── build.gradle            # Dependencias: CameraX + MediaPipe Tasks Vision
    ├── src/main/
    │   ├── AndroidManifest.xml
    │   ├── assets/
    │   │   └── pose_landmarker_lite.task   # Modelo MediaPipe (5.6MB)
    │   └── java/expo/modules/mediapipepose/
    │       ├── MediaPipePoseModule.kt          # Definicao do modulo Expo
    │       ├── MediaPipePoseView.kt            # CameraX + View nativa
    │       └── PoseLandmarkerService.kt        # Wrapper do MediaPipe (LIVE_STREAM)
```

## Props da View Nativa

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| `cameraFacing` | `'front' \| 'back'` | `'back'` | Camera ativa |
| `isActive` | `boolean` | `false` | Ativa/desativa processamento |
| `modelComplexity` | `0 \| 1 \| 2` | `0` | 0=Lite, 1=Full, 2=Heavy |
| `minDetectionConfidence` | `number` | `0.6` | Confianca minima deteccao |
| `minTrackingConfidence` | `number` | `0.6` | Confianca minima tracking |

## Eventos

| Evento | Payload | Descricao |
|--------|---------|-----------|
| `onPoseDetected` | `{ landmarks: PoseLandmark[], timestamp: number, frameWidth: number, frameHeight: number }` | 33 landmarks por frame |
| `onError` | `{ message: string }` | Erro no modulo nativo |
| `onCameraReady` | `{}` | Camera inicializada |

## Build para Producao (EAS)

```bash
# 1. Limpar prebuild anterior
npx expo prebuild --clean

# 2. Build iOS
eas build --platform ios --profile production

# 3. Build Android
eas build --platform android --profile production
```

O CNG (Continuous Native Generation) automaticamente:
- Resolve o MediaPipeTasksVision via CocoaPods (iOS)
- Resolve o mediapipe-tasks-vision via Maven (Android)
- Linka o modulo via expo-module.config.json
- Inclui o modelo .task nos assets nativos

## Regras CNG-Safe

- NENHUMA alteracao manual no Podfile
- NENHUM uso de use_frameworks! customizado
- NENHUMA dependencia incompativel com Expo prebuild
- Modulo 100% autocontido na pasta modules/

## Fallback Web

Na web, `NATIVE_POSE_AVAILABLE` retorna `false`. O `PoseCamera.tsx` automaticamente entra em modo simulacao (PoseSimulator) sem impacto na funcionalidade.
