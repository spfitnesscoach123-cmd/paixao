# MediaPipe Pose Detection — Setup para Build iOS

## Pre-requisitos

### 1. Baixar o modelo MediaPipe
```bash
cd frontend
node scripts/download-pose-model.js
```
Isso baixa `pose_landmarker_full.task` (~31MB) para `assets/models/`.

### 2. Gerar projeto iOS (se necessario)
```bash
npx expo prebuild --platform ios --clean
```
O sistema de plugins automaticamente:
- `expo-build-properties`: Configura `useFrameworks: "static"` no `Podfile.properties.json`
- `withMediaPipePose`: Modifica diretamente o Podfile com injecao robusta e deterministica

### 3. Instalar pods
```bash
cd ios && pod install && cd ..
```

### 4. Build via EAS
```bash
eas build --platform ios --profile production --clear-cache
```

## Arquitetura

```
Camera (Vision Camera v4.7.3)
       |
Frame Processor (JSI / react-native-worklets-core v1.6.3)
       |
Plugin Nativo: detectPose (PoseDetectionPlugin.swift)
       |
MediaPipe Tasks Vision (pod MediaPipeTasksVision 0.10.14 + use_frameworks! :linkage => :static)
       |
33 Landmarks [{x, y, z, visibility}] — normalizados 0-1, ordem BlazePose
       |
Pipeline existente (VBT / Jump) — INTOCAVEL
```

## Configuracao de Pod (como funciona)

O pod `MediaPipeTasksVision` e injetado via `withMediaPipePose.js` (withDangerousMod):

### O que o plugin faz no Podfile (nesta ordem):
1. **source CDN**: Adiciona `source 'https://cdn.cocoapods.org/'` no topo do Podfile
2. **use_frameworks!**: Injeta `use_frameworks! :linkage => :static` antes do bloco target
3. **Pod injection**: Injeta `pod 'MediaPipeTasksVision', '0.10.14'` dentro do target, apos `config = use_native_modules!`
4. **BUILD_LIBRARY_FOR_DISTRIBUTION**: Adiciona setting no `post_install` para garantir distribuicao de modulos

### Comportamento:
- Todas as operacoes sao **idempotentes** (rodar multiplas vezes nao duplica)
- Logging extensivo para debug no EAS (dump parcial do Podfile final)
- **NAO depende de `extraPods`** do `expo-build-properties` (injecao direta)

### FALLBACK (se :static continuar falhando):
No arquivo `plugins/withMediaPipePose.js`, trocar:
```js
// ANTES (static):
const USE_FRAMEWORKS_LINE = "use_frameworks! :linkage => :static";

// DEPOIS (dynamic):
const USE_FRAMEWORKS_LINE = "use_frameworks! :linkage => :dynamic";
```

## Arquivos Criados/Modificados

### Novos
| Arquivo | Funcao |
|---------|--------|
| `plugins/ios/PoseDetectionPlugin.swift` | Frame processor plugin nativo |
| `plugins/withMediaPipePose.js` | Expo config plugin (Podfile + Xcode project) |
| `services/pose/MediaPipeCamera.tsx` | Componente React Native (drop-in replacement) |
| `scripts/download-pose-model.js` | Download do modelo .task |

### Modificados
| Arquivo | Mudanca |
|---------|---------|
| `app/athlete/[id]/vbt-camera.tsx` | `RNMediapipe` -> `MediaPipeCamera` |
| `app/athlete/[id]/jump-camera.tsx` | `RNMediapipe` -> `MediaPipeCamera` |
| `services/pose/PoseCamera.tsx` | `MediapipePoseView` -> `MediaPipeCamera` |
| `components/vbt/CameraView.tsx` | `RNMediapipe` -> `MediaPipeCamera` |
| `app.json` | Plugins: `expo-build-properties` (useFrameworks only) + `withMediaPipePose` |
| `package.json` | `@thinksys` removido, `worklets-core` + `expo-build-properties` adicionados |

## Contrato de Saida (Landmarks)

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
1. Verificar nos logs do EAS se os logs `[withMediaPipePose]` mostram `SIM` para todas as verificacoes
2. Se o Podfile dump mostra o pod dentro do target, o problema pode ser de cache
3. Limpar cache: `eas build --clear-cache --platform ios`
4. Se persistir com `:static`, tentar FALLBACK `:dynamic` (ver secao acima)

### Pod install falha
```bash
cd ios
pod repo update
pod install --repo-update
```

### Plugin nao encontrado no runtime
Verificar que `PoseDetectionPlugin.swift` e `PoseDetectionPluginRegistrar.m` estao em **Compile Sources** no Xcode.

### Modelo nao encontrado
Verificar que `pose_landmarker_full.task` esta em **Copy Bundle Resources** no Xcode.

### Frame processor nao funciona
- Confirmar que `react-native-worklets-core` esta instalado
- Se usar JSC (`jsEngine: "jsc"`), considerar mudar para Hermes
