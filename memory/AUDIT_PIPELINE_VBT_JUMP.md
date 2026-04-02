# Auditoria Tecnica Completa — Pipeline de Captura e Processamento de Movimento

**Data**: Fevereiro 2026
**Versao**: 1.0
**Contexto**: MediaPipe e Vision Camera removidos. Sistema operando em modo simulacao.

---

## RESUMO EXECUTIVO

O pipeline atual e **surpreendentemente bem estruturado** para um sistema sem visao computacional real. A arquitetura foi projetada pensando no futuro (MediaPipe) e ja possui:

- Deteccao de salto baseada em keypoints com maquina de estados robusta
- Pipeline VBT de 5 estagios com validacao progressiva
- Sistema de diagnosticos em tempo real de nivel producao
- Calculo de velocidade com modelo de camera pinhole
- Deteccao de repeticoes com histerese e protecao anti-falso-positivo
- Backend com formulas biomecanicas cientificamente referenciadas

**POREM**: Tudo depende de dados simulados (`PoseSimulator`). O pipeline inteiro esta ocioso em producao.

---

## 1. PIPELINE DE CAPTURA (Camera Layer)

### Estado Atual

**Arquivos**: `services/camera/CameraMediapipeManager.ts`, `types.ts`, `useJumpCameraLifecycle.ts`

O sistema de camera possui um **Singleton Manager** (`CameraMediapipeManager`) com uma maquina de estados sequencial de 10 fases:

```
IDLE → REQUESTING_PERMISSION → PERMISSION_GRANTED → INITIALIZING_CAMERA
→ CAMERA_READY → INITIALIZING_MEDIAPIPE → MEDIAPIPE_READY → CAPTURE_ACTIVE
→ RELEASING → ERROR
```

**Pontos Fortes:**
- Ownership model (`jump_camera` vs `vbt_camera`) — previne conflitos de recurso
- Timeout de inicializacao (10s) com transicao automatica para ERROR
- Gerenciamento de AppState (background/foreground) corretamente implementado
- Validacao de transicoes — tabela `VALID_TRANSITIONS` impede saltos de estado ilegais
- Hook `useJumpCameraLifecycle` com cleanup no unmount

**Como o video esta sendo capturado?**
- **No app real (iOS)**: Atualmente usando `expo-camera` (`CameraView` do Expo) como fallback porque `MEDIAPIPE_AVAILABLE = false`
- **No simulador**: Nao ha captura de video. O `PoseSimulator` gera keypoints sinteticos a 30fps via `setInterval`
- **Controle de FPS**: Alvo de 30fps configuravel (`TARGET_FPS: 30` em `JUMP_DETECTION_CONFIG`)
- **Resolucao e Buffering**: Nao ha controle explicito de resolucao. O `RecordingPipeline` suporta qualidade configuravel (`low/medium/high`) mas delega ao Expo

**Consistencia Temporal (Timestamps)**:
- Todos os frames usam `Date.now()` — **NAO sao timestamps de frame da camera**
- Isso e adequado para simulacao, mas **insuficiente para visao computacional real**
- Risco: `Date.now()` no JavaScript tem precisao de ~1ms, mas pode ter jitter no event loop

**Risco de perda de frames:**
- Em simulacao: Nenhum (intervalos fixos)
- Em producao real: **SIM** — `setInterval` nao garante entrega a 33ms. Se o thread principal bloquear, frames serao perdidos silenciosamente

### Veredicto

| Aspecto | Status | Nota |
|---------|--------|------|
| Maquina de estados | SOLIDO | Bem projetada com 10 fases |
| Ownership model | SOLIDO | Previne conflitos |
| Controle de FPS | ADEQUADO | Apenas para simulacao |
| Timestamps | FRAGIL | `Date.now()` insuficiente para CV real |
| Perda de frames | RISCO | Sem deteccao de frame drop |

---

## 2. DETECCAO DE MOVIMENTO (Jump / VBT)

### 2.1 Jump Camera

**Arquivos**: `services/jump/jumpDetector.ts`, `useJumpCamera.ts`, `types.ts`

**Como o movimento e detectado hoje?**
O sistema usa uma abordagem baseada em **keypoints de pose** (Y normalizado 0-1), nao em pixels brutos:

1. **Calibracao de solo**: Coleta 60 frames durante countdown, calcula `groundLevel` (media de Y dos pes) e `standingHipY` (media de Y dos quadris). Usa trimming dos 20% iniciais/finais para estabilidade.

2. **Threshold adaptativo**: `groundThreshold = groundLevel - max(GROUND_THRESHOLD_MARGIN, stdDev * 2.5)`. A margem se adapta ao ruido real dos dados.

3. **Maquina de estados CMJ**:
```
waiting_countermovement → countermovement → in_air → landed
```
- Contramovimento: `hipCenterY > standingHipY + 0.008` (0.8% da tela)
- Takeoff: Ambos os pes acima do threshold por `MIN_TAKEOFF_FRAMES` (2) frames consecutivos
- Landing: Qualquer pe retorna ao threshold

4. **Maquina de estados DJ**:
```
waiting_land → on_ground → in_air → final_land
```
- Detecta pouso inicial (transicao ar→solo), contato, decolagem, pouso final

5. **Sinais usados**: Posicoes Y normalizadas de:
- `leftToeY`, `rightToeY` (ponta dos pes, fallback para tornozelos)
- `leftAnkleY`, `rightAnkleY`
- `leftHipY`, `rightHipY`, `hipCenterY` (media dos quadris)
- Confidence score minimo: 0.4

**E deterministic?**
- **SIM, para os mesmos dados de entrada**. O algoritmo e puramente funcional: mesmos frames → mesma saida
- **NAO, em condicoes reais**: A simulacao adiciona ruido aleatorio (`Math.random() * 0.02`), imitando jitter de CV real

**Fragilidades na deteccao**:
- `MIN_TAKEOFF_FRAMES = 2` e muito baixo. Com ruido real, 2 frames acima do threshold pode ser falso positivo
- O smoothing window de 3 frames e conservador demais para dados ruidosos reais
- Nao ha deteccao de outlier frame-a-frame (um keypoint com salto brusco nao e descartado)

### 2.2 VBT Camera

**Arquivos**: `services/vbt/TrackingSystem.ts`, `VelocityCalculator.ts`, `RepDetector.ts`, `trackingProtection.ts`, `useProtectedBarTracking.ts`

**Pipeline VBT de 5 estagios (Progressive Validation)**:

```
STAGE 1: FRAME_USABLE   → pose != null, keypoints > 0, any score >= 0.3
STAGE 2: FRAME_STABLE   → 5+ frames usaveis consecutivos (INDEPENDENTE de tracking)
STAGE 3: FRAME_TRACKABLE → tracking point valido com confidence >= 0.5
STAGE 4: FRAME_VALID    → movement delta >= 0.02 (2% da tela)
STAGE 5: FRAME_COUNTABLE → velocity >= 0.05 m/s
```

**Tracking System**:
- Ponto de tracking armazenado como **nome do landmark** (ex: `left_hip`), nao coordenadas de tela
- Busca por nome em cada frame — robusto contra reordenacao de keypoints
- Smoothing de posicao via moving average (5 frames, janela de 500ms)
- Deteccao de salto de posicao: alerta se > 20% da tela entre frames

**VelocityCalculator**:
- Formula: `v = deltaPosition / deltaTime`
- Conversao normalizado → metros via modelo pinhole: `metersPerNormalized = (distance / focalLength) * frameHeight`
- Calibracao padrao: camera a 150cm, FOV 60°, frame 1920px
- Smoothing: media movel de 5 frames
- Threshold de ruido: rejeita < 0.02 m/s
- Threshold maximo: rejeita > 3.0 m/s

**RepDetector**:
- Maquina de estados: `idle → eccentric → transition → concentric → lockout`
- Suporta exercicios eccentric-first (Squat, Bench) e concentric-first (Deadlift, Clean)
- Protecao anti-dupla-contagem: lockout de 300ms apos rep
- Duracao maxima de rep: 10s (aborta apos)
- **BUG FIX CRITICO**: Dados da rep sao armazenados ANTES de limpar arrays (evita `meanVelocity = 0`)

---

## 3. REGISTRO DE EVENTOS

### Jump Events

**Interface `JumpEvents`:**
```typescript
{
  countdownStart: number | null;
  countdownEnd: number | null;
  countermovementStart: number | null;  // Hip desceu abaixo de standing + 0.008
  takeoffTime: number | null;           // Pes acima do threshold (2 frames)
  landingTime: number | null;           // Pe retornou ao threshold
  peakHeightTime: number | null;        // Minimo hipCenterY durante voo
  djInitialLandingTime: number | null;  // Pouso inicial do DJ
  djContactEndTime: number | null;      // Decolagem apos contato (DJ)
}
```

**Confiabilidade do registro:**
- Eventos sao registrados com timestamps de `Date.now()` no momento da deteccao
- **Risco de duplicacao**: Nenhum — a maquina de estados garante transicao unica (`break` apos landing)
- **Risco de perda**: Possivel se o frame do evento cair entre intervalos de 33ms. Com smoothing de 3 frames, ha mitigacao parcial
- **Ponto forte**: O algoritmo faz log extenso de cada evento detectado com `[LOG_JUMP_TAKEOFF_DETECTED]`, `[LOG_JUMP_LANDING_DETECTED]`, etc.

### VBT Events

- Registrados via `RepDetector.completeRep()` com timestamp preciso
- Rep data inclui: `meanVelocity`, `peakVelocity`, `eccentricVelocity`, `concentricDuration`, `eccentricDuration`, `velocityDrop`
- **Logging extenso**: cada rep logada com todas as metricas

---

## 4. PROCESSAMENTO OFFLINE

### Jump Analysis

**Pipeline**: `useJumpCamera.stopRecording()` → `analyzeJumpFrames()`

```
frames coletados → smoothFrames(window=3) → analyzeJump(CMJ/DJ)
                                              ├─ detectCountermovement()
                                              ├─ detectTakeoff()
                                              ├─ detectPeakHeight()
                                              ├─ detectLanding()
                                              └─ calculateMetrics()
```

- Processamento e **sincrono** e acontece em `setTimeout(150ms)` apos parar a gravacao
- O delay de 150ms e para garantir que o state do React esta atualizado antes da analise
- Frames sao coletados em `recordingFramesRef` (array de `JumpFrameData`)

**Clareza do pipeline**: SIM — funcoes puras, bem separadas, com logging extenso

### VBT Processing

O VBT processa em **tempo real** (frame-by-frame), nao offline:
```
cada frame → processPose() → TrackingProtection.processFrame()
                              ├─ Stage 1: FRAME_USABLE
                              ├─ Stage 2: FRAME_STABLE
                              ├─ Stage 3: FRAME_TRACKABLE
                              ├─ Stage 4: FRAME_VALID
                              └─ Stage 5: FRAME_COUNTABLE
          → VelocityCalculator.update()
          → RepDetector.update()
```

### Backend Processing

**Arquivos**: `backend/jump_import/calculator.py`, `backend/jump_analysis/`

O backend recebe dados ja processados (nao frames brutos):
- `JumpCalculator`: Calcula metricas derivadas (altura de voo → jump height, RSI, takeoff velocity)
- Formulas cientificamente referenciadas (Bosco et al., 1983)
- Modulo de analise: baselines, comparisons, fatigue, readiness, trends, report

---

## 5. QUALIDADE DAS METRICAS

### Tempo de Voo (Flight Time)

- **Calculo**: `frames[landingIdx].timestamp - frames[takeoffIdx].timestamp`
- **Validacao**: `MIN_FLIGHT_TIME_MS (80ms) <= flightTime <= MAX_FLIGHT_TIME_MS (2000ms)`
- **Precisao relativa**: Com simulacao, e artificialmente perfeito. Com CV real, depende da precisao do timestamp e da deteccao de takeoff/landing
- **Estimativa de erro com dados reais**: ±33ms (1 frame a 30fps) = ±1.3cm de erro na altura do salto (para salto de ~30cm)

### Altura do Salto

- **Formula primaria**: `h = (g * t^2) / 8` (metodo do tempo de voo)
- **Formula secundaria**: Hip displacement com conversao via `HIP_TO_HEIGHT_RATIO (0.53)`
- **Sensibilidade a erro**: Para flight_time = 500ms → height = 30.7cm. Erro de ±33ms → height varia de 26.8cm a 34.8cm (±13%). **Isso e aceitavel para monitoramento relativo, nao para valor absoluto.**

### Velocidade Estimada (VBT)

- **Calculo**: `v = deltaPosition_metros / deltaTime_segundos`
- **Conversao**: Modelo pinhole com calibracao padrao (camera 150cm, FOV 60°)
- **Smoothing**: Media movel de 5 frames
- **Precisao**: Altamente dependente da calibracao da camera. Com calibracao padrao (nao real), os valores sao **relativamente consistentes** mas **absolutamente imprecisos**
- **Estabilidade entre execucoes**: Alta em simulacao, incerta com dados reais

### Potencia

- **Nao implementada no frontend**. O backend tem estrutura para `peak_power_w` no modelo `JumpRecord`, mas nenhum calculo e feito

### RSI (Reactive Strength Index)

- **CMJ RSI mod**: `jumpHeight_m / timeToTakeoff_s` (implementado no frontend)
- **DJ RSI**: `flightTime / contactTime` (implementado no frontend)
- **Backend**: `jumpHeight_cm / contactTime_s` (formula classica)
- **INCONSISTENCIA**: Frontend e backend usam formulas RSI diferentes! Frontend usa RSI modificado para CMJ (height/time-to-takeoff), backend usa RSI classico (height/contact-time)

---

## 6. ARQUITETURA DO SISTEMA

### Modularizacao

```
services/
├── camera/          # Lifecycle management (3 arquivos)
│   ├── CameraMediapipeManager.ts   [559 linhas]
│   ├── types.ts                     [118 linhas]
│   └── useJumpCameraLifecycle.ts   [303 linhas]
│
├── pose/            # Pose detection abstraction (6 arquivos)
│   ├── MediaPipeCamera.tsx  [59 linhas]  ← STUB
│   ├── PoseCamera.tsx       [506 linhas]
│   ├── poseDetector.ts      [372 linhas]
│   ├── types.ts             [208 linhas]
│   ├── usePoseDetection.ts  [241 linhas]
│   └── index.ts             [61 linhas]
│
├── jump/            # Jump detection (4 arquivos)
│   ├── jumpDetector.ts      [753 linhas]
│   ├── useJumpCamera.ts     [510 linhas]
│   ├── types.ts             [251 linhas]
│   └── index.ts             [16 linhas]
│
└── vbt/             # VBT tracking (12 arquivos)
    ├── trackingProtection.ts       [1460 linhas] ← MAIOR ARQUIVO
    ├── useProtectedBarTracking.ts  [770 linhas]
    ├── diagnostics.ts              [722 linhas]
    ├── barTracker.ts               [369 linhas]
    ├── VelocityCalculator.ts       [283 linhas]
    ├── RepDetector.ts              [539 linhas]
    ├── TrackingSystem.ts           [439 linhas]
    ├── useMediaPipePose.ts         [448 linhas]
    ├── RecordingPipeline.ts        [346 linhas]
    ├── recordingController.ts      [51 linhas]
    ├── useBarTracking.ts           [253 linhas]
    └── index.ts                    [112 linhas]
```

**Total**: ~7,600 linhas de codigo de pipeline

### Acoplamento

| Camada | Depende de | Grau |
|--------|-----------|------|
| Camera Manager | Nenhum | Independente |
| Pose Detection | MediaPipeCamera (stub) | Desacoplado via flag |
| Jump Detector | Keypoints interface | Interface limpa |
| VBT Tracking | Pose types, Recording Controller | Moderado |
| Backend | Nenhuma dep frontend | Independente |

**Separacao clara entre camadas?**
- Captura ↔ Deteccao: **SIM** — `PoseCamera` produz `VBTPoseData`, consumido por Jump/VBT
- Deteccao ↔ Processamento: **SIM** — `jumpDetector` recebe frames puros, retorna metricas
- Processamento ↔ Output: **SIM** — hooks de UI (`useJumpCamera`, `useProtectedBarTracking`) sao wrappers finos

**E facil substituir o detector por MediaPipe?**
- **SIM** — A interface `VBTPoseData` (keypoints com name/x/y/score + timestamp) e exatamente o formato MediaPipe
- Basta fazer `MEDIAPIPE_AVAILABLE = true` e ter o `MediaPipeCamera` real produzindo landmarks
- O resto do pipeline nao precisa mudar

---

## 7. LIMITACOES ATUAIS

### 🔴 CRITICAS (vao quebrar evolucao futura)

1. **Timestamps baseados em `Date.now()`**
   - Impacto: Com visao computacional real, o jitter do JS event loop pode causar erros de ±10ms nos timestamps, resultando em calculos de velocidade imprecisos
   - Solucao: Usar timestamps do frame da camera nativa

2. **Ausencia de deteccao de frame drop**
   - Impacto: Se frames forem perdidos (processamento lento, background), o sistema calcula metricas sobre dados incompletos sem saber
   - Solucao: Monitorar delta-time entre frames consecutivos, alertar se > 2x o esperado

3. **`trackingProtection.ts` com 1460 linhas**
   - Impacto: Arquivo excessivamente grande misturando validators, state machines, managers, e noise filters. Dificulta manutencao e testes
   - Solucao: Separar em 5 arquivos (um por stage + state machine)

4. **Inconsistencia de RSI entre frontend e backend**
   - Frontend CMJ: `RSI_mod = jumpHeight_m / timeToTakeoff_s`
   - Backend: `RSI = jumpHeight_cm / contactTime_s`
   - Impacto: Metricas inconsistentes quando dados vem da camera vs CSV
   - Solucao: Unificar formula. Para CMJ, RSI_mod e o padrao (Ebben & Petushek, 2010)

### 🟡 MEDIAS (melhorar antes da V2)

5. **Calibracao de camera hardcoded**
   - `cameraDistanceCm: 150`, `fovDegrees: 60`, `frameHeight: 1920`
   - Impacto: Valores absolutos de velocidade serao errados. Valores relativos (comparacao entre sets) ainda sao uteis
   - Solucao: Implementar calibracao guiada (medir distancia real) ou usar device sensors

6. **Smoothing window fixo (3 frames jump, 5 frames VBT)**
   - Impacto: Com MediaPipe real, o ruido e diferente da simulacao. Window pode ser muito grande ou pequeno
   - Solucao: Smoothing adaptativo baseado na variancia dos dados

7. **`MIN_TAKEOFF_FRAMES = 2` para jump detection**
   - Impacto: Com dados reais ruidosos, 2 frames acima do threshold pode ser falso positivo
   - Solucao: Aumentar para 3 e adicionar checagem de velocidade vertical

8. **Ausencia de filtro de outlier individual**
   - O smoothing usa media movel, mas nao descarta outliers (um keypoint com salto brusco afeta a media)
   - Solucao: Usar filtro mediano ou alpha-beta para dados de posicao

9. **Duplicacao de logica de tracking**
   - `barTracker.ts` (legacy) e `VelocityCalculator.ts` + `RepDetector.ts` (novo) coexistem
   - `useProtectedBarTracking.ts` alimenta ambos
   - Solucao: Remover `barTracker.ts` legacy; `useBarTracking.ts` pode ser removido tambem

10. **Logs excessivos em producao**
    - `diagnostics.ts` (722 linhas) logando a CADA frame com tabela ASCII formatada
    - `[RecordingController] state: false` em cada frame do `trackingProtection.ts`
    - Impacto: Performance degradada em dispositivos moveis
    - Solucao: Gate de log condicional (`__DEV__`) ou nivel de log configuravel

### 🟢 MELHORIAS

11. **Adicionar power calculation** (Sayers et al., 1999): `P = 60.7 * jumpHeight_cm + 45.3 * bodyMass_kg - 2055`

12. **Adicionar asymmetry index** para SL-CMJ: `ASI = (left - right) / max(left, right) * 100`

13. **Exportar dados raw de frames** para analise offline posterior (CSV/JSON)

14. **Adicionar force-velocity profiling** quando VBT tiver dados de carga + velocidade multi-set

---

## 8. PREPARACAO PARA V2 (MediaPipe / Vision)

### O pipeline permite plugar um detector real?

**SIM** — O contrato e claro:

```typescript
// O que MediaPipe precisa produzir:
interface VBTPoseData {
  keypoints: Array<{
    name: string;    // 'left_hip', 'right_hip', etc.
    x: number;       // 0-1 normalizado
    y: number;       // 0-1 normalizado
    score: number;   // 0-1 confianca
  }>;
  timestamp: number;
}
```

O `PoseCamera.tsx` ja tem a logica de branching:
```typescript
if (shouldUseNativeMediapipe) {
  // Usa MediaPipeCamera com onLandmark → convertMediapipeLandmarksToVBT()
} else {
  // Usa expo-camera + PoseSimulator (simulacao)
}
```

**Basta**:
1. Ter `MEDIAPIPE_AVAILABLE = true` no `MediaPipeCamera.tsx`
2. `MediaPipeCamera` produzir landmarks via `onLandmark` callback
3. O restante do pipeline funciona inalterado

### O sistema esta orientado a eventos ou frame-based?

**Hibrido**:
- **Jump Camera**: Event-driven. Eventos discretos (takeoff, landing) sao detectados e registrados
- **VBT Camera**: Frame-based. Cada frame e processado pelo pipeline de 5 estagios
- Ambos usam callbacks React (`onPoseDetected`, `processPose`) — compativel com MediaPipe nativo

### O que PRECISA ser refatorado ANTES de reintroduzir CV?

| Item | Prioridade | Estimativa |
|------|-----------|-----------|
| 1. Substituir `Date.now()` por timestamps de frame | 🔴 ALTA | 2-4h |
| 2. Adicionar deteccao de frame drop | 🔴 ALTA | 1-2h |
| 3. Separar `trackingProtection.ts` (1460 linhas) | 🟡 MEDIA | 3-4h |
| 4. Remover `barTracker.ts` legacy | 🟡 MEDIA | 1h |
| 5. Gate de logs (`__DEV__`) | 🟡 MEDIA | 1h |
| 6. Unificar formula RSI frontend/backend | 🟡 MEDIA | 1-2h |
| 7. Ajustar `MIN_TAKEOFF_FRAMES` para 3 | 🟢 BAIXA | 15min |
| 8. Adicionar filtro mediano de outlier | 🟢 BAIXA | 2h |

---

## 9. RECOMENDACOES DETALHADAS

### 🔴 REC-1: Pipeline de Timestamps Nativo (CRITICO)

**Problema**: `Date.now()` tem jitter de 5-15ms no JS thread do React Native. Para calculo de velocidade, um erro de 10ms em `deltaTime` de 33ms = 30% de erro.

**Solucao**:
```typescript
// ANTES (atual):
const frameData: JumpFrameData = {
  timestamp: Date.now(), // ← JS timestamp, impreciso
  ...
};

// DEPOIS (recomendado):
// O frame processor do MediaPipe fornece timestamp nativo:
onLandmark={(event) => {
  const nativeTimestamp = event.nativeEvent?.timestamp || 
                          event.timestamp || 
                          Date.now(); // fallback
  const frameData: JumpFrameData = {
    timestamp: nativeTimestamp,
    ...
  };
}}
```

**Impacto**: Melhora precisao de velocidade de ±30% para ±3%

---

### 🔴 REC-2: Deteccao de Frame Drop (CRITICO)

**Problema**: Se o pipeline perder frames, as metricas sao calculadas sobre dados incompletos. O sistema nao tem como saber.

**Solucao**:
```typescript
// Adicionar em processFrame():
const expectedInterval = 1000 / TARGET_FPS; // 33ms
const actualInterval = currentTimestamp - lastTimestamp;
const droppedFrames = Math.max(0, Math.round(actualInterval / expectedInterval) - 1);

if (droppedFrames > 0) {
  console.warn(`[FrameDrop] ${droppedFrames} frames perdidos (${actualInterval}ms gap)`);
  frameDropCounter += droppedFrames;
}

// Na analise final:
if (frameDropCounter > totalFrames * 0.1) {
  // Mais de 10% de frames perdidos → alertar usuario
  setWarning('Qualidade de captura reduzida: frames perdidos');
}
```

---

### 🔴 REC-3: Separar trackingProtection.ts (CRITICO)

**Problema**: 1460 linhas em um unico arquivo com 7 classes e multiplas responsabilidades.

**Solucao**:
```
services/vbt/protection/
├── FrameStabilityValidator.ts    (~100 linhas)  # Stage 1 & 2
├── HumanPresenceValidator.ts     (~100 linhas)  # Legacy, para Stage 3
├── TrackingPointManager.ts       (~200 linhas)  # Stage 3
├── NoiseFilter.ts                (~70 linhas)   # Stage 4 & 5
├── ProgressiveStateMachine.ts    (~250 linhas)  # State machine
├── TrackingProtectionSystem.ts   (~200 linhas)  # Orchestrador
├── constants.ts                  (~60 linhas)   # EXERCISE_KEYPOINTS, etc.
└── types.ts                      (~80 linhas)   # Interfaces
```

---

### 🟡 REC-4: Unificar RSI Frontend/Backend

**Frontend (jumpDetector.ts linhas 519-520)**:
```typescript
// RSI modified para CMJ = jumpHeight (m) / timeToTakeoff (s)
const rsiMod = timeToTakeoffMs > 0 ? (jumpHeightCm / 100) / (timeToTakeoffMs / 1000) : 0;
```

**Backend (calculator.py linhas 154-188)**:
```python
# RSI = jump_height_cm / contact_time_s
rsi = jump_height_cm / contact_time_s
```

**Recomendacao**: Usar RSI_mod (height/time-to-takeoff) para CMJ em ambos, e RSI classico (height/contact_time) para DJ em ambos. Documentar a formula usada em cada contexto.

---

### 🟡 REC-5: Remover Codigo Legacy

**Arquivos a remover/consolidar**:
- `services/vbt/barTracker.ts` — substituido por `VelocityCalculator.ts` + `RepDetector.ts`
- `services/vbt/useBarTracking.ts` — substituido por `useProtectedBarTracking.ts`
- `TrackingStateMachine` dentro de `trackingProtection.ts` — substituida por `ProgressiveStateMachine`

**Economia estimada**: ~600 linhas de codigo morto

---

### 🟡 REC-6: Gate de Logs

**Problema**: `diagnostics.ts` loga tabela ASCII formatada a cada frame em producao.

```typescript
// ANTES:
console.log(summary); // Tabela ASCII de 15 linhas a cada frame

// DEPOIS:
if (__DEV__ || this.logInterval > 1) {
  console.log(summary);
}
```

Adicionar tambem em `trackingProtection.ts`:
```typescript
// Remover em producao:
console.log("[RecordingController] state:", recordingController.isActive());
console.log("[VBT_STATE_CHECK]", { ... });
```

---

### 🟢 REC-7: Ajustar MIN_TAKEOFF_FRAMES

```typescript
// ANTES:
MIN_TAKEOFF_FRAMES: 2,

// DEPOIS:
MIN_TAKEOFF_FRAMES: 3,
```

Aumenta robustez contra falsos positivos com dados reais.

---

### 🟢 REC-8: Adicionar Filtro Mediano

```typescript
// Para posicao de keypoints, usar filtro mediano em vez de media:
function medianFilter(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
```

Outliers (keypoint saltando) sao eliminados pelo mediano mas afetam a media.

---

## CONCLUSAO

O pipeline atual e **notavelmente bem projetado** para um sistema sem visao computacional. A arquitetura e modular, as interfaces sao limpas, e a maior parte do trabalho de integracao com MediaPipe ja esta preparada.

**As 3 acoes mais importantes antes da V2 sao**:
1. Substituir `Date.now()` por timestamps nativos de frame
2. Adicionar deteccao de frame drop
3. Refatorar `trackingProtection.ts` (1460 linhas → 8 arquivos)

O restante do pipeline pode ser reaproveitado **integralmente** quando o MediaPipe for reintegrado.

---

*Auditoria realizada por analise estatica completa do codigo-fonte. Nenhuma suposicao sobre uso de MediaPipe.*
