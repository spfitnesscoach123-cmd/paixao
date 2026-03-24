# AUDITORIA COMPLETA — VBT Camera + Jump Camera (Pre-Migracao MediaPipe)
**Data**: 2026-03-24
**Status**: SOMENTE LEITURA — Nenhum codigo alterado

---

## 1. PIPELINE COMPLETO

### 1A. VBT Camera Pipeline

```
[Camera Source]  ->  [Frame Capture]  ->  [Landmark Conversion]  ->  [Tracking System]  ->  [Velocity Calc]  ->  [Rep Detection]  ->  [UI Output]
```

| Etapa | Arquivo | Funcao Principal | Dependencias |
|---|---|---|---|
| **Camera Source (nativo)** | `app/athlete/[id]/vbt-camera.tsx` L48-67 | `require('@thinksys/react-native-mediapipe')` -> `RNMediapipe` component | `@thinksys/react-native-mediapipe` v0.0.19 |
| **Camera Source (web)** | `app/athlete/[id]/vbt-camera.tsx` L20 | `import { CameraView } from 'expo-camera'` | `expo-camera` v17.0.10 |
| **Frame Capture** | `app/athlete/[id]/vbt-camera.tsx` | `onLandmark` callback do `RNMediapipe` | Nativo: MediaPipe retorna 33 landmarks |
| **Landmark Conversion** | `services/pose/types.ts` L143-161 | `LANDMARK_INDEX_TO_VBT_NAME` (33 -> 17 keypoints) | Mapeamento estatico de indices |
| **Tracking Point** | `services/vbt/TrackingSystem.ts` | `trackLandmark(pose)` — extrai posicao do ponto selecionado | `ProcessedKeypoint`, `VBTPoseData` |
| **5-Stage Validation** | `services/vbt/trackingProtection.ts` | `TrackingProtectionSystem` — pipeline FRAME_USABLE -> COUNTABLE | `diagnostics.ts`, `recordingController.ts` |
| **Protected Hook** | `services/vbt/useProtectedBarTracking.ts` | `useProtectedBarTracking()` — orchestrador principal | `trackingProtection`, `VelocityCalculator`, `RepDetector` |
| **Velocity Calculation** | `services/vbt/VelocityCalculator.ts` | `update({x,y,timestamp})` -> `VelocityResult` | Nenhuma externa |
| **Rep Detection** | `services/vbt/RepDetector.ts` | `update(velocity, direction)` -> `RepDetectorResult` | Nenhuma externa |
| **UI Output** | `app/athlete/[id]/vbt-camera.tsx` | Renderizacao de velocidade, reps, fatigue overlay | `VBTDiagnosticOverlay`, `FatigueVisualOverlay` |

**Pipeline alternativo (useMediaPipePose)**:
| Etapa | Arquivo | Funcao |
|---|---|---|
| **Orchestrador** | `services/vbt/useMediaPipePose.ts` | `processPose()` — integra Tracking + Velocity + Reps |
| **Integracao** | Usa `VelocityCalculator`, `RepDetector`, `TrackingSystem` internamente | |

### 1B. Jump Camera Pipeline

```
[Camera Source]  ->  [Frame Capture]  ->  [Landmark Extraction]  ->  [Frame Data]  ->  [Calibration/Recording]  ->  [Jump Analysis]  ->  [Metric Calc]  ->  [UI Output]
```

| Etapa | Arquivo | Funcao Principal | Dependencias |
|---|---|---|---|
| **Camera Source (nativo)** | `app/athlete/[id]/jump-camera.tsx` L68-86 | `require('@thinksys/react-native-mediapipe')` -> `RNMediapipe` | `@thinksys/react-native-mediapipe` v0.0.19 |
| **Camera Source (web)** | `app/athlete/[id]/jump-camera.tsx` L47 | `import { CameraView } from 'expo-camera'` | `expo-camera` v17.0.10 |
| **Frame Capture** | `jump-camera.tsx` | `onLandmark` callback -> `handlePoseDetected` | Nativo: 33 landmarks do MediaPipe |
| **Landmark Extraction** | `services/jump/jumpDetector.ts` L699-717 | `extractJumpLandmarks(keypoints)` — extrai 6 landmarks (toes, ankles, hips) | `types.ts` (JumpPoseLandmarks) |
| **Frame Data Conversion** | `services/jump/jumpDetector.ts` L722-752 | `createJumpFrameData(landmarks, timestamp)` -> `JumpFrameData` | Nenhuma externa |
| **Frame Collection** | `services/jump/useJumpCamera.ts` L308-343 | `processFrame(keypoints)` — coleta frames (calibracao + recording) | `jumpDetector.ts` |
| **Ground Calibration** | `services/jump/jumpDetector.ts` L91-153 | `calibrateGround(frames)` — media Y dos pes durante countdown | Nenhuma externa |
| **Jump Analysis** | `services/jump/jumpDetector.ts` L327-389 | `analyzeJumpFrames()` — despacha para CMJ ou DJ | Funcoes internas |
| **CMJ Analysis** | `services/jump/jumpDetector.ts` L394-569 | `analyzeCMJ()` — countermovement + takeoff + landing | Funcoes de deteccao internas |
| **DJ Analysis** | `services/jump/jumpDetector.ts` L575-678 | `analyzeDJ()` — initial landing + takeoff + final landing | Funcoes de deteccao internas |
| **Metric Calculation** | `services/jump/jumpDetector.ts` L295-314 | `calculateJumpHeightFromFlightTime()` — h = (g*t^2)/8 | Constante gravidade |
| **State Machine** | `services/jump/useJumpCamera.ts` | setup -> countdown -> recording -> processing -> review | `jumpDetector.ts`, `types.ts` |
| **Lifecycle Mgmt** | `services/camera/useJumpCameraLifecycle.ts` | `useJumpCameraLifecycle()` — coordenacao com CameraManager | `CameraMediapipeManager.ts` |
| **UI Output** | `app/athlete/[id]/jump-camera.tsx` | Tela de resultados com metricas | `types.ts` (JUMP_PROTOCOL_INFO) |

---

## 2. INTEGRACAO COM MEDIAPIPE

### 2.1 Onde o MediaPipe e chamado

| Local | Arquivo | Linha | Como |
|---|---|---|---|
| VBT Camera | `vbt-camera.tsx` | L52-64 | `require('@thinksys/react-native-mediapipe')` -> `RNMediapipe`, `switchCamera` |
| Jump Camera | `jump-camera.tsx` | L71-86 | `require('@thinksys/react-native-mediapipe')` -> `RNMediapipe` |
| PoseCamera | `PoseCamera.tsx` | L35-44 | `require('@thinksys/react-native-mediapipe')` -> `MediapipePoseView`, `switchCamera` |
| CameraView (VBT) | `components/vbt/CameraView.tsx` | L42 | `require('@thinksys/react-native-mediapipe')` |

### 2.2 Como e inicializado

Todas as 4 importacoes seguem o MESMO padrao:
```typescript
if (Platform.OS !== 'web') {
  try {
    const mediapipe = require('@thinksys/react-native-mediapipe');
    RNMediapipe = mediapipe.RNMediapipe; // ou MediapipePoseView
    MEDIAPIPE_AVAILABLE = !!RNMediapipe;
  } catch (e) {
    console.warn('MediaPipe not available');
  }
}
```

### 2.3 Como frames sao enviados

- **Nativo**: `<RNMediapipe onLandmark={handlePoseDetected} />` — callback automatico por frame
- **Web**: Simulacao via `PoseSimulator` (30fps interval) — NAO processa frames reais

### 2.4 Como landmarks sao retornados

Formato do evento nativo:
```
event.nativeEvent.landmarks || event.landmarks || event (array direto)
```
Cada landmark: `{ x: number, y: number, z: number, visibility?: number }`

### 2.5 Validacoes

| Validacao | Existe? | Local |
|---|---|---|
| **Fallback para web** | SIM | Todos os 4 arquivos — expo-camera + simulacao |
| **Protecao por plataforma** | SIM | `Platform.OS !== 'web'` em todos |
| **Lazy loading** | SIM | `require()` condicional dentro de try/catch |
| **Tratamento de erro** | SIM | try/catch com `console.warn` |
| **MEDIAPIPE_AVAILABLE flag** | SIM | Boolean check antes de usar componente |

---

## 3. DEPENDENCIAS CRITICAS

| Dependencia | Versao | Classificacao | Uso | Impacto se ausente |
|---|---|---|---|---|
| `@thinksys/react-native-mediapipe` | 0.0.19 | **CRITICA** | Deteccao de pose nativa (iOS/Android) | VBT + Jump nao funcionam em nativo |
| `expo-camera` | 17.0.10 | **CRITICA** | Fallback web + permissoes de camera | App nao consegue acessar camera |
| `react-native-vision-camera` | 4.7.3 | **SECUNDARIA** | Listada em package.json mas NAO importada diretamente | Potencialmente dependencia interna do @thinksys |
| Patch `CameraFeedService.swift` | N/A | **CRITICA** | Fix de crash de FPS na camera frontal iOS | Camera frontal crasha em iOS |
| Patch `CameraView.swift` | N/A | **CRITICA** | Fix de timing de inicializacao MediaPipe | MediaPipe pode nao inicializar em iOS |
| `expo-linear-gradient` | package.json | **OPCIONAL** | UI gradients | Apenas visual |
| `@tanstack/react-query` | package.json | **OPCIONAL** | Cache de API para salvar metricas | Apenas conveniencia |

### Nota sobre `react-native-vision-camera`
- Presente no `package.json` mas NAO importada em nenhum codigo de app/services/components
- Mencionada APENAS em comentarios de `poseDetector.ts` e `barTracker.ts`
- Possivelmente dependencia transitiva do `@thinksys/react-native-mediapipe`

---

## 4. ACOPLAMENTO (RISCO DE QUEBRA)

### 4.1 Codigo compartilhado entre VBT e Jump

| Recurso Compartilhado | Arquivo | Usado por VBT | Usado por Jump |
|---|---|---|---|
| `CameraMediapipeManager` (singleton) | `services/camera/CameraMediapipeManager.ts` | SIM (owner: 'vbt_camera') | SIM (owner: 'jump_camera') |
| `LANDMARK_INDEX_TO_VBT_NAME` | `services/pose/types.ts` | SIM | SIM |
| `ProcessedKeypoint` / `VBTPoseData` | `services/pose/types.ts` | SIM | SIM |
| `RNMediapipe` component | `@thinksys/react-native-mediapipe` | SIM | SIM |
| `expo-camera` (CameraView, permissions) | `expo-camera` | SIM | SIM |
| `Platform.OS` check pattern | Ambos | SIM | SIM |

### 4.2 Codigo NAO compartilhado (isolado)

| Recurso | Exclusivo de |
|---|---|
| `VelocityCalculator`, `RepDetector`, `TrackingSystem` | VBT |
| `trackingProtection`, `useProtectedBarTracking` | VBT |
| `useMediaPipePose` | VBT |
| `barTracker`, `RecordingPipeline` | VBT |
| `jumpDetector`, `useJumpCamera` | Jump |
| `useJumpCameraLifecycle` | Jump |
| `JumpFrameData`, `GroundCalibration` | Jump |

### 4.3 Pontos de risco

| Risco | Severidade | Descricao |
|---|---|---|
| **Mudanca no formato do evento `onLandmark`** | ALTA | Afeta AMBOS VBT e Jump simultaneamente |
| **Mudanca na API do componente `RNMediapipe`** | ALTA | Props `onLandmark`, `cameraType` usados por ambos |
| **Alteracao do `CameraMediapipeManager`** | MEDIA | Ambos usam o singleton — mudanca de estado afeta ambos |
| **Mudanca em `LANDMARK_INDEX_TO_VBT_NAME`** | ALTA | Quebra conversao de landmarks para ambos |
| **Mudanca no patch iOS** | ALTA | Patch protege contra 2 crashes — remocao causa regressao |

---

## 5. PONTOS NATIVOS (iOS)

### 5.1 Arquivos Swift/Obj-C do app

| Arquivo | Tipo | Conteudo |
|---|---|---|
| `ios_backup/AppDelegate.swift` | Swift | Standard Expo AppDelegate — SEM codigo MediaPipe custom |
| `ios_backup/LoadManagerPro-Bridging-Header.h` | Obj-C Header | Vazio (apenas comentario template) |

### 5.2 Arquivos Swift DENTRO do @thinksys (via patch)

| Arquivo Patcheado | Mudanca | Risco |
|---|---|---|
| `ios/Services/CameraFeedService.swift` | **Removeu** `configureFrameRate` — previne crash `NSInvalidArgumentException` na camera frontal | ALTO se revertido |
| `ios/ViewContoller/CameraView.swift` | **Moveu** `initializePoseLandmarkerService` para APOS `case .success` | ALTO se revertido |

### 5.3 Dependencia direta de `MediaPipeTasksVision`

- NAO existe referencia direta no codigo do app
- `MediaPipeTasksVision` e dependencia INTERNA do `@thinksys/react-native-mediapipe`
- Instalado via CocoaPods como dependencia transitiva (autolinked)
- O Podfile NAO tem referencia explicita — tudo via autolinking do Expo

### 5.4 Configuracao especifica de iOS

- `Podfile`: Standard Expo, sem pods customizados
- `Podfile.properties.json`: Sem configuracao especial
- O patch e aplicado via `patch-package` no `postinstall` do `package.json`

---

## 6. ESTADO ATUAL DE FUNCIONAMENTO

### 6.1 Jump Camera

| Aspecto | Estado | Evidencia |
|---|---|---|
| Deteccao de pontos (nativo) | **ATIVA** | `MEDIAPIPE_AVAILABLE` check + fallback implementado |
| Calibracao de chao | **IMPLEMENTADA** | `calibrateGround()` com 60 frames, margem adaptativa |
| Deteccao takeoff/landing | **IMPLEMENTADA** | CMJ, SL-CMJ, DJ — todos com `MIN_TAKEOFF_FRAMES=2` |
| Calculo de metricas | **IMPLEMENTADO** | Flight time, jump height (h=gt^2/8), RSI, eccentric duration |
| Protocolo SL-CMJ dual | **IMPLEMENTADO** | 2 saltos automaticos com troca de perna |
| Metricas em tempo real | **IMPLEMENTADAS** | `liveMetrics` atualizado frame-a-frame |
| Progressao de inicializacao | **3 ESTAGIOS** | Camera Ready -> MediaPipe Ready -> Engine Ready |

### 6.2 VBT Camera

| Aspecto | Estado | Evidencia |
|---|---|---|
| Tracking continuo | **IMPLEMENTADO** | `useProtectedBarTracking` com 5-stage validation |
| Velocidade consistente | **IMPLEMENTADA** | `VelocityCalculator` com smoothing (5 frames), noise rejection |
| Rep detection | **IMPLEMENTADO** | `RepDetector` com fase eccentric->transition->concentric |
| Tracking por landmark | **IMPLEMENTADO** | `TrackingSystem` — armazena INDEX (nao coordenada de tela) |
| Simulacao web | **IMPLEMENTADA** | `PoseSimulator` com padroes de squat realistas |
| Diagnostico | **IMPLEMENTADO** | `VBTDiagnosticOverlay` + `vbtDiagnostics` |
| Protecao anti-loop | **IMPLEMENTADA** | Estabilizacao INDEPENDENTE de tracking point |

---

## 7. PERFORMANCE E ESTABILIDADE

### 7.1 Threads / Worklets

| Aspecto | Detalhe |
|---|---|
| **Frame processing** | Roda na thread JS principal (nao usa worklets) |
| **Intervalo de simulacao** | 33ms (~30 FPS) via `setInterval` |
| **MediaPipe nativo** | Processa na thread nativa, retorna via bridge |

### 7.2 Gargalos possiveis

| Gargalo | Severidade | Local |
|---|---|---|
| `setInterval` para simulacao web | BAIXA | `PoseCamera.tsx` L325, `usePoseDetection.ts` L164 |
| `setState` a cada frame | MEDIA | `useJumpCamera.ts` L331 (frameCount), `useMediaPipePose.ts` L247-250 |
| Suavizacao de frames (smoothFrames) | BAIXA | `jumpDetector.ts` — O(n*window) mas n < 180 frames |
| `VelocityCalculator` smoothing | BAIXA | Array slice de 5 elementos |

### 7.3 Dependencia de FPS

| Feature | FPS Necessario | Impacto se baixo |
|---|---|---|
| Jump Calibration | 30fps ideal | Calibracao imprecisa com < 10 frames/seg |
| Jump Flight Detection | 30fps ideal | Pode perder takeoff/landing com < 15fps |
| VBT Velocity | 30fps ideal | Velocidade imprecisa, reps perdidos |
| VBT Stabilization | Qualquer | Apenas requer 50 frames (configuravel) |

### 7.4 Risco de travamento

| Cenario | Protecao |
|---|---|
| MediaPipe nao inicializa | Timeout de 10s no `CameraMediapipeManager` |
| Camera sem permissao | Check de permissao + UI de fallback |
| Crash de FPS na camera frontal iOS | **Patch aplicado** (`CameraFeedService.swift`) |
| MediaPipe antes de camera pronta | **Patch aplicado** (`CameraView.swift`) |
| Inicializacao simultanea VBT+Jump | `CameraMediapipeManager` singleton com ownership exclusivo |

---

## 8. ISOLAMENTO NECESSARIO (CRITICO)

### CLASSIFICACAO DE ARQUIVOS

#### 🟥 INTOCAVEL (calculo, logica, pipeline) — NAO ALTERAR

```
services/vbt/VelocityCalculator.ts       # Calculo de velocidade
services/vbt/RepDetector.ts              # Deteccao de repeticoes
services/vbt/TrackingSystem.ts           # Sistema de tracking por landmark
services/vbt/trackingProtection.ts       # Pipeline de validacao 5-estagios
services/vbt/useProtectedBarTracking.ts  # Hook protegido de tracking
services/vbt/useMediaPipePose.ts         # Hook de integracao MediaPipe+VBT
services/vbt/barTracker.ts              # Tracker core + simulador
services/vbt/RecordingPipeline.ts       # Pipeline de gravacao
services/vbt/recordingController.ts     # Controlador global de gravacao
services/vbt/diagnostics.ts            # Diagnosticos VBT
services/jump/jumpDetector.ts           # Detector de salto (core)
services/jump/useJumpCamera.ts          # Hook de camera de salto
services/jump/types.ts                  # Tipos de salto
services/pose/types.ts                  # Tipos de pose (LANDMARK_INDEX_TO_VBT_NAME)
services/pose/poseDetector.ts           # Detector de pose singleton
services/pose/usePoseDetection.ts       # Hook de deteccao de pose
```

#### 🟨 CUIDADO ALTO (integracao MediaPipe) — ALTERAR COM EXTREMO CUIDADO

```
services/pose/PoseCamera.tsx            # Componente camera com MediaPipe integrado
services/camera/CameraMediapipeManager.ts  # Singleton lifecycle manager
services/camera/useJumpCameraLifecycle.ts  # Lifecycle hook do Jump
services/camera/types.ts                  # Tipos do gerenciador
app/athlete/[id]/vbt-camera.tsx          # Pagina VBT (import MediaPipe L48-67)
app/athlete/[id]/jump-camera.tsx         # Pagina Jump (import MediaPipe L68-86)
components/vbt/CameraView.tsx            # Componente camera VBT
```

#### 🟩 SEGURO (configuracao nativa iOS) — ESCOPO DA MIGRACAO

```
patches/@thinksys+react-native-mediapipe+0.0.19.patch  # ALVO PRINCIPAL
ios_backup_before_removal/Podfile                        # Referencia
ios_backup_before_removal/Podfile.properties.json        # Referencia
package.json                                             # Dependencias (versao do @thinksys)
```

---

## 9. CHECKLIST DE SEGURANCA PRE-IMPLEMENTACAO

- [x] Pipeline VBT mapeado completamente (8 etapas)
- [x] Pipeline Jump mapeado completamente (8 etapas)
- [x] Dependencias identificadas e classificadas (3 criticas, 1 secundaria, 2 opcionais)
- [x] Pontos nativos localizados (2 arquivos Swift no patch, 0 no app)
- [x] Riscos documentados (5 pontos de risco de acoplamento)
- [x] Escopo isolado (🟥 17 intocaveis, 🟨 7 cuidado, 🟩 4 seguros)
- [x] Formato do evento MediaPipe documentado
- [x] Fallback web confirmado funcional
- [x] CameraManager ownership verificado (sem conflito VBT/Jump)
- [x] Patch iOS detalhado (2 fixes criticos)

---

## 10. CONCLUSAO

```
O sistema esta ESTAVEL e PRONTO para intervencao no MediaPipe.
```

**Justificativa:**

1. **Arquitetura bem isolada**: Os calculos (velocidade, reps, salto) sao INDEPENDENTES do MediaPipe. Eles recebem `keypoints[]` e processam. A mudanca no MediaPipe so afeta a FONTE dos keypoints.

2. **Ponto de entrada claro**: O unico ponto de contato entre MediaPipe e o pipeline e o callback `onLandmark` que entrega landmarks. Qualquer nova implementacao so precisa entregar o MESMO formato: `Array<{x, y, z, visibility}>`.

3. **Patch documentado**: Os 2 fixes no patch sao especificos e bem documentados. A migracao deve preservar ou incorporar ambos.

4. **Fallback funcional**: O fallback web com simulacao garante que o desenvolvimento pode continuar mesmo sem MediaPipe nativo.

5. **Ownership exclusivo**: O `CameraMediapipeManager` garante que VBT e Jump nao competem por recursos.

**Condicao para migracao segura:**
- A nova solucao MediaPipe DEVE entregar landmarks no MESMO formato: `[{x, y, z, visibility}, ...]` (33 pontos BlazePose)
- Os fixes do patch (FPS + initialization timing) devem ser preservados ou resolvidos na nova versao
- Os `require()` condicionais devem ser atualizados nos 4 arquivos 🟨
- O `package.json` deve refletir a nova dependencia

---

*Documento gerado automaticamente. Nenhum codigo foi alterado durante esta auditoria.*
