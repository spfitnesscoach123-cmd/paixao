# Integração MediaPipe Pose - Guia de Implementação Nativa

## Visão Geral

Este documento descreve como integrar detecção de pose real usando MediaPipe no app LoadManager Pro VBT.

## Arquitetura Atual

O sistema VBT foi projetado com as seguintes camadas:

```
┌─────────────────────────────────────────────────────────────┐
│                    VBT Camera UI                             │
│                 (vbt-camera.tsx)                             │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              useProtectedBarTracking Hook                    │
│    - Layer 1: Human Presence Validation                      │
│    - Layer 2: State Machine Control                          │
│    - Layer 3: Coach-Defined Tracking Point                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Pose Detection Service                          │
│         (services/pose/poseDetector.ts)                     │
│                                                              │
│   ┌─────────────────┐    ┌─────────────────┐               │
│   │  PoseSimulator  │ OR │  Native Pose    │               │
│   │  (Development)  │    │  Detection      │               │
│   └─────────────────┘    └─────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

## Status Atual

- ✅ Sistema de proteção 3 camadas implementado
- ✅ Serviço de pose detection com interface padronizada
- ✅ Simulador de pose para desenvolvimento
- ⏳ Integração nativa MediaPipe (requer build nativo)

## Próximos Passos para Integração Nativa

### Opção 1: @thinksys/react-native-mediapipe (Recomendado)

Esta biblioteca oferece integração completa com MediaPipe Pose.

#### 1. Instalar Dependências

```bash
cd frontend

# Instalar a biblioteca MediaPipe
npm install @thinksys/react-native-mediapipe

# Instalar Vision Camera (dependência)
npx expo install react-native-vision-camera

# Gerar código nativo
npx expo prebuild --clean
```

#### 2. Atualizar app.json

```json
{
  "expo": {
    "plugins": [
      // ... plugins existentes
      [
        "react-native-vision-camera",
        {
          "cameraPermissionText": "Precisamos acessar a câmera para capturar dados do VBT.",
          "enableMicrophonePermission": false
        }
      ]
    ]
  }
}
```

#### 3. Criar Frame Processor Nativo

Criar arquivo `services/pose/nativeMediapipe.ts`:

```typescript
import { useFrameProcessor } from 'react-native-vision-camera';
import Mediapipe from '@thinksys/react-native-mediapipe';
import { VBTPoseData, convertLandmarksToKeypoints } from './types';

export function usePoseFrameProcessor(onPoseDetected: (pose: VBTPoseData | null) => void) {
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    
    try {
      const result = Mediapipe.detectPose(frame);
      
      if (result && result.landmarks && result.landmarks.length > 0) {
        // Converter para formato VBT na thread principal
        runOnJS(onPoseDetected)(convertLandmarksToKeypoints(result.landmarks, Date.now()));
      } else {
        runOnJS(onPoseDetected)(null);
      }
    } catch (error) {
      console.error('Pose detection error:', error);
      runOnJS(onPoseDetected)(null);
    }
  }, [onPoseDetected]);
  
  return frameProcessor;
}
```

#### 4. Atualizar PoseCamera para Usar Detecção Real

```typescript
// Em PoseCamera.tsx, quando em plataforma nativa:
import { Camera } from 'react-native-vision-camera';
import { usePoseFrameProcessor } from './nativeMediapipe';

// Substituir CameraView por Camera do Vision Camera
// e usar o frame processor para detecção em tempo real
```

### Opção 2: @gymbrosinc/react-native-mediapipe-pose

Alternativa mais simples com view integrada.

```bash
npm install @gymbrosinc/react-native-mediapipe-pose react-native-vision-camera
npx expo prebuild --clean
```

### Opção 3: cdiddy77/react-native-mediapipe

Framework processor completo para customização avançada.

```bash
npm install react-native-mediapipe react-native-vision-camera
npx expo prebuild --clean
```

## Mapeamento de Landmarks MediaPipe → VBT

O MediaPipe Pose retorna 33 landmarks. O sistema VBT usa um subset de 17 keypoints:

| Índice MediaPipe | Nome VBT           |
|------------------|-------------------|
| 0                | nose              |
| 2                | left_eye          |
| 5                | right_eye         |
| 7                | left_ear          |
| 8                | right_ear         |
| 11               | left_shoulder     |
| 12               | right_shoulder    |
| 13               | left_elbow        |
| 14               | right_elbow       |
| 15               | left_wrist        |
| 16               | right_wrist       |
| 23               | left_hip          |
| 24               | right_hip         |
| 25               | left_knee         |
| 26               | right_knee        |
| 27               | left_ankle        |
| 28               | right_ankle       |

## Interface de Dados

```typescript
// Formato de entrada do MediaPipe
interface RawLandmark {
  x: number;        // 0-1 normalizado
  y: number;        // 0-1 normalizado
  z: number;        // profundidade
  visibility?: number;  // confiança 0-1
}

// Formato esperado pelo sistema VBT
interface VBTPoseData {
  keypoints: Array<{
    name: string;
    x: number;
    y: number;
    score: number;
  }>;
  timestamp: number;
}
```

## Requisitos de Build

### iOS
- iOS 13+
- Xcode 14+
- CocoaPods

### Android
- SDK 26+
- NDK instalado

## Comandos de Build

```bash
# iOS
npx expo run:ios --device

# Android
npx expo run:android --device
```

## Performance

- Target: 30 FPS em tempo real
- Modelo recomendado: `modelComplexity: 1` (Full)
- Confiança mínima: 0.6

## Troubleshooting

### Erro: "Frame processor not available"
Solução: Verificar se `react-native-worklets-core` está instalado.

### Erro: "Poses not detected"
Solução: Verificar iluminação e distância da câmera.

### Erro de build iOS
```bash
cd ios && pod install --repo-update
```

### Erro de build Android
Verificar se NDK está instalado no Android Studio.

## Testes

Para testar a integração:

1. Verificar detecção com cena vazia → deve retornar `null`
2. Verificar detecção com pessoa → deve retornar landmarks
3. Verificar score de confiança >= 0.6 para landmarks críticos
4. Verificar FPS >= 25 para tracking fluido

## Contato

Para dúvidas sobre a integração, consulte:
- [MediaPipe Documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
- [react-native-vision-camera](https://react-native-vision-camera.com/)
