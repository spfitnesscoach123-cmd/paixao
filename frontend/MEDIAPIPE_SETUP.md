# MediaPipe Pose Detection — Setup para Build iOS

## Pre-requisitos

### 1. Baixar o modelo MediaPipe
```bash
cd frontend
node scripts/download-pose-model.js
```
Isso baixa `pose_landmarker_full.task` (~31MB) para `assets/models/`.

### 2. Gerar projeto iOS (se necessário)
```bash
npx expo prebuild --platform ios --clean
```
O config plugin `withMediaPipePose` automaticamente:
- Adiciona o pod `MediaPipeTasksVision` ao Podfile
- Copia `PoseDetectionPlugin.swift` ao projeto Xcode
- Gera `PoseDetectionPluginRegistrar.m` com o module name correto
- Copia o modelo `.task` ao bundle resources

### 3. Instalar pods
```bash
cd ios && pod install && cd ..
```

### 4. Build via EAS
```bash
eas build --platform ios --profile production
```

## Arquitetura

```
Camera (Vision Camera v4.7.3)
       |
Frame Processor (JSI / react-native-worklets-core v1.6.3)
       |
Plugin Nativo: detectPose (PoseDetectionPlugin.swift)
       |
MediaPipe Tasks Vision (GoogleMediaPipeTasksVision pod)
       |
33 Landmarks [{x, y, z, visibility}] — normalizados 0-1, ordem BlazePose
       |
Pipeline existente (VBT / Jump) — INTOCAVEL
```

## Arquivos Criados/Modificados

### Novos
| Arquivo | Função |
|---------|--------|
| `plugins/ios/PoseDetectionPlugin.swift` | Frame processor plugin nativo |
| `plugins/withMediaPipePose.js` | Expo config plugin |
| `services/pose/MediaPipeCamera.tsx` | Componente React Native (drop-in replacement) |
| `scripts/download-pose-model.js` | Download do modelo .task |

### Modificados
| Arquivo | Mudança |
|---------|---------|
| `app/athlete/[id]/vbt-camera.tsx` | `RNMediapipe` → `MediaPipeCamera` |
| `app/athlete/[id]/jump-camera.tsx` | `RNMediapipe` → `MediaPipeCamera` |
| `services/pose/PoseCamera.tsx` | `MediapipePoseView` → `MediaPipeCamera` |
| `components/vbt/CameraView.tsx` | `RNMediapipe` → `MediaPipeCamera` |
| `app.json` | Plugin `withMediaPipePose` adicionado |
| `package.json` | `@thinksys` removido, `worklets-core` adicionado |

### Removidos
| Arquivo | Razão |
|---------|-------|
| `patches/@thinksys+react-native-mediapipe+0.0.19.patch` | Dependência removida |
| `@thinksys/react-native-mediapipe` (dep) | Substituída por integração direta |

## Contrato de Saída (Landmarks)

O plugin nativo retorna **exatamente**:
```json
[
  { "x": 0.523, "y": 0.812, "z": -0.043, "visibility": 0.95 },
  ...
]
```
- 33 landmarks
- Valores normalizados 0-1
- Ordem BlazePose (MediaPipe)
- Zero processamento adicional

## Troubleshooting

### Pod install falha
```bash
cd ios
pod repo update
pod install --repo-update
```

### Plugin não encontrado no runtime
Verificar que `PoseDetectionPlugin.swift` e `PoseDetectionPluginRegistrar.m` estão em **Compile Sources** no Xcode.

### Modelo não encontrado
Verificar que `pose_landmarker_full.task` está em **Copy Bundle Resources** no Xcode.

### Frame processor não funciona
- Confirmar que `react-native-worklets-core` está instalado
- Se usar JSC (`jsEngine: "jsc"`), considerar mudar para Hermes se houver problemas com worklets
