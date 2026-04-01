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
O sistema de plugins automaticamente:
- `expo-build-properties`: Configura `use_frameworks! :linkage => :static` + adiciona pod via `extraPods`
- `withMediaPipePose`: Copia `PoseDetectionPlugin.swift` ao projeto Xcode, gera `PoseDetectionPluginRegistrar.m`, copia modelo `.task`, e injeta pod como fallback no Podfile

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
MediaPipe Tasks Vision (pod MediaPipeTasksVision + use_frameworks! :linkage => :static)
       |
33 Landmarks [{x, y, z, visibility}] — normalizados 0-1, ordem BlazePose
       |
Pipeline existente (VBT / Jump) — INTOCAVEL
```

## Configuracao de Pod (como funciona)

O pod `MediaPipeTasksVision` é injetado de **duas formas** para máxima confiabilidade:

1. **`expo-build-properties`** (em `app.json`):
   - Configura `ios.useFrameworks: "static"` → gera `use_frameworks! :linkage => :static` no Podfile
   - Configura `extraPods: [{name: "MediaPipeTasksVision"}]` → `use_expo_modules!` adiciona o pod durante `pod install`
   - Armazena configs em `ios/Podfile.properties.json`

2. **`withMediaPipePose.js`** (fallback via `withDangerousMod`):
   - Verifica se `pod 'MediaPipeTasksVision'` já está no Podfile
   - Se ausente, injeta explicitamente antes de `config = use_native_modules!`
   - Garante que o pod está presente mesmo se `extraPods` falhar

## Arquivos Criados/Modificados

### Novos
| Arquivo | Função |
|---------|--------|
| `plugins/ios/PoseDetectionPlugin.swift` | Frame processor plugin nativo |
| `plugins/withMediaPipePose.js` | Expo config plugin (arquivo management + fallback pod) |
| `services/pose/MediaPipeCamera.tsx` | Componente React Native (drop-in replacement) |
| `scripts/download-pose-model.js` | Download do modelo .task |

### Modificados
| Arquivo | Mudança |
|---------|---------|
| `app/athlete/[id]/vbt-camera.tsx` | `RNMediapipe` → `MediaPipeCamera` |
| `app/athlete/[id]/jump-camera.tsx` | `RNMediapipe` → `MediaPipeCamera` |
| `services/pose/PoseCamera.tsx` | `MediapipePoseView` → `MediaPipeCamera` |
| `components/vbt/CameraView.tsx` | `RNMediapipe` → `MediaPipeCamera` |
| `app.json` | Plugins: `expo-build-properties` + `withMediaPipePose` |
| `package.json` | `@thinksys` removido, `worklets-core` + `expo-build-properties` adicionados |

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

### "no such module 'MediaPipeTasksVision'" no EAS build
1. Verificar `ios/Podfile.properties.json` contém `"ios.useFrameworks": "static"`
2. Verificar `ios/Podfile` contém `pod 'MediaPipeTasksVision'` dentro do target
3. Limpar cache: `eas build --clear-cache --platform ios`
4. Verificar que `expo-build-properties` está instalado: `npx expo install expo-build-properties`

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
