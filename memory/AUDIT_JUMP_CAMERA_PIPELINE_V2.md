# AUDITORIA TECNICA — JUMP CAMERA PIPELINE
**Data**: 2026-02-XX | **Tipo**: Analise somente-leitura | **Versao do Codigo**: Atual

---

## PARTE 1 — CONFIDENCE SCORE

### 1.1 Como o confidenceScore e calculado

**Arquivo**: `services/jump/jumpDetector.ts` — funcao `calibrateGround()` (linhas 162-182)

O calculo usa 3 componentes, todos normalizados entre 0 e 1:

| Componente | Formula | Peso | Normalizado? |
|---|---|---|---|
| `footStability` | `clamp(1.0 - (stdDev / 0.02), 0, 1)` | 0.5 (50%) | SIM |
| `poseConfidence` | `clamp(avgConfidence, 0, 1)` | 0.3 (30%) | SIM |
| `groundStability` | `clamp(1.0 - (hipStdDev / 0.015), 0, 1)` | 0.2 (20%) | SIM |

**Formula final**:
```
confidenceScore = clamp(
  (footStability * 0.5) + (poseConfidence * 0.3) + (groundStability * 0.2),
  0, 1
)
```

**DIAGNOSTICO**: Calculo CORRETO. Todos os componentes sao normalizados 0-1 via `clamp()`. O resultado final tambem e clamped 0-1. Os pesos somam 1.0 (100%).

### 1.2 Valor exibido vs valor interno

- **Valor interno**: `calibration.confidenceScore` (float 0-1) — armazenado em `scannerState.confidenceScore`
- **Valor exibido**: `Math.round(jumpCamera.scannerState.confidenceScore * 100)` + `%` (jump-camera.tsx, linha 1123)
- **Correspondencia**: SIM, exibido = interno * 100, arredondado. Nenhuma discrepancia.

### 1.3 Validacao dos Thresholds

**Definidos em** `types.ts` (linhas 189-193):
```
CONFIDENCE_AUTO_START: 0.80   // >= 0.80 auto-start
CONFIDENCE_WARNING: 0.65      // >= 0.65 aviso
CONFIDENCE_BLOCK: 0.65        // < 0.65 bloqueio
MAX_RECALIBRATION_RETRIES: 2
```

**Implementado em** `useJumpCamera.ts` — funcao `evaluateCalibration()` (linhas 266-329):

| Condicao | Acao | Correto? |
|---|---|---|
| `score >= 0.80` | Auto-start countdown | SIM |
| `score >= 0.65 && < 0.80` | Aviso + inicia countdown | SIM |
| `score < 0.65` | Retry automatico (ate 2x) ou bloqueia | SIM |

**O sistema respeita esses thresholds?** SIM. A logica e sequencial: primeiro testa `>= CONFIDENCE_AUTO_START`, depois `>= CONFIDENCE_WARNING`, e o else cobre `< 0.65`.

### 1.4 Bypass apos tentativas?

**NAO existe bypass automatico.** Apos 2 retries falhadas + score < 0.65:
- Estado muda para `'blocked'`
- Botao manual "Recalibrar" aparece
- O usuario NAO pode iniciar a gravacao com score < 0.65

**Porem**: O botao "Recalibrar" (`retryCalibration()`, linha 365) reseta `scannerRetryCountRef.current = 0`, concedendo mais 2 auto-retries. Isso permite retries INFINITAS, mas nunca permite iniciar com confianca baixa.

### 1.5 O fluxo permite iniciar com score baixo?

| Score | Inicia? | Com aviso? |
|---|---|---|
| >= 0.80 | SIM | NAO |
| 0.65 - 0.79 | SIM | SIM ("Calibracao instavel. Resultados podem variar.") |
| < 0.65 | NAO | Bloqueado |

**ACHADO CRITICO**: Com score entre 0.65 e 0.79, o sistema INICIA a gravacao com aviso. Isso significa que saltos com calibracao marginal sao permitidos e podem produzir resultados imprecisos. Nao existe exigencia de que o score esteja acima de 0.80 para gravar.

### 1.6 Constante nao utilizada

**ACHADO**: `CONFIDENCE_BLOCK: 0.65` esta definida mas NUNCA e referenciada no codigo. A logica de bloqueio esta implicitamente no `else` de `evaluateCalibration()`. A constante e redundante.

---

## PARTE 2 — RETRY / RECALIBRACAO

### 2.1 Quantas tentativas realmente ocorrem

**Definido**: `MAX_RECALIBRATION_RETRIES = 2` (types.ts, linha 193)

**Implementado em** `evaluateCalibration()` (linhas 293-329):

```
Fluxo por tentativa:
1. Score < 0.65 + retries < 2 → auto-retry (scannerRetryCountRef++)
2. Score < 0.65 + retries >= 2 → 'blocked' state
```

**Sequencia real de um cenario de falha total**:
1. Scanner coleta 3s + analisa 2s → score < 0.65 → auto-retry #1
2. Scanner coleta 3s + analisa 2s → score < 0.65 → auto-retry #2
3. Scanner coleta 3s + analisa 2s → score < 0.65 → BLOQUEADO
4. Usuario clica "Recalibrar" → retries resetadas para 0
5. Repete ciclo ate usuario desistir ou melhorar posicao

### 2.2 O que acontece apos falha nas 2 tentativas

**Linha 315-328**: Estado muda para `'blocked'`:
- UI mostra icone vermelho de alerta
- Texto: "Calibracao falhou"
- Dica: "Ajuste a posicao e tente novamente"
- Botao: "Recalibrar" (retryCalibration)

### 2.3 Existe fallback automatico?

**NAO.** Nenhum fallback que force inicio com baixa confianca. O sistema permanece em `'blocked'` ate acao do usuario.

### 2.4 O sistema forca inicio mesmo com baixa confianca?

**NAO** para score < 0.65. **SIM** para score 0.65-0.79 (com aviso apenas).

### 2.5 Existe condicao de bloqueio real?

**SIM.** O estado `'blocked'` e real e impede qualquer progressao ate nova tentativa manual. A unica saida e:
1. Clicar "Recalibrar"
2. Voltar para selecao de protocolo (botao back)

---

## PARTE 3 — ORIENTACAO DO ATLETA

### 3.1 Existe validacao de orientacao (frontal vs lateral)?

**NAO. Zero validacao de orientacao no codigo.**

**Evidencias**:

1. **`extractJumpLandmarks()`** (jumpDetector.ts, linhas 619-660): Extrai apenas 6 landmarks (leftToe, rightToe, leftAnkle, rightAnkle, leftHip, rightHip). **Nao extrai ombros** (left_shoulder, right_shoulder).

2. **`createJumpFrameData()`** (jumpDetector.ts, linhas 665-695): Armazena APENAS coordenadas Y. **Nenhuma coordenada X e armazenada**.

3. **`JumpFrameData` type** (types.ts, linhas 73-83): Nao possui campos X:
   ```typescript
   leftToeY: number;
   rightToeY: number;
   leftAnkleY: number;
   rightAnkleY: number;
   leftHipY: number;
   rightHipY: number;
   hipCenterY: number;
   ```

4. **`calibrateGround()`**: Usa apenas Y para calcular ground level e estabilidade.

### 3.2 Alguma metrica baseada em ombro/hip width?

**NAO.** Nenhuma metrica de largura (distancia X entre left/right) e calculada em nenhum ponto do pipeline.

### 3.3 Alguma checagem de profundidade (Z)?

**NAO.** O campo Z existe nos landmarks nativos do MediaPipe (MediaPipeCamera.tsx, linha 80: `z: lm.z ?? 0`) mas e **completamente descartado** no pipeline:
- `extractJumpLandmarks()` ignora Z
- `JumpPoseLandmarks` tem x/y/score mas NAO z
- `JumpFrameData` so armazena Y

### 3.4 O sistema detecta atleta de lado?

**NAO.** O sistema NAO diferencia entre:
- Atleta de perfil (lateral) — correto para salto
- Atleta de frente (frontal) — inadequado para salto
- Atleta de costas

### 3.5 Existe protecao contra coleta invalida?

**UNICA PROTECAO EXISTENTE**: A dica textual na UI (jump-camera.tsx, linha 173):
```
"Posicione a camera de lado (perfil)"
```
Isso e apenas um texto informativo, sem validacao tecnica.

**A protecao indireta mais proxima**: `MIN_LANDMARK_CONFIDENCE: 0.4` filtra landmarks com score baixo. MediaPipe tende a ter scores menores quando o atleta esta em angulo desfavoravel, mas isso NAO e uma validacao de orientacao.

---

## PARTE 4 — SCANNER / CALIBRACAO VISUAL

### 4.1 O que e realmente renderizado na tela

**Arquivo**: jump-camera.tsx, linhas 1041-1134

**Elementos visuais renderizados durante scanner**:

| Elemento | Tipo | Descricao | Dinamico? |
|---|---|---|---|
| Linha do Solo | `View` posicionada via `top: groundLevel * 100%` | Linha horizontal colorida | SIM — posicao e cor mudam |
| Barra de Progresso | `View` com `width: progress%` | Barra preenchivel | SIM — progresso 0-100% |
| Texto de Status | `Text` | "Escaneando..." / "Analisando..." / "Calibracao falhou" | SIM — muda com fase |
| Score de Confianca | `Text` | "Confianca: 85%" | SIM — valor atualiza |
| Mensagem de Aviso | `Text` (condicional) | "Recalibrando... (1/2)" / "Calibracao instavel" | SIM |
| Botao Recalibrar | `TouchableOpacity` (so em 'blocked') | Botao manual | CONDICIONAL |
| ActivityIndicator | Spinner | Indicador de loading | SIM |

**Elementos que NAO sao renderizados**:

| Elemento | Status |
|---|---|
| Skeleton (linhas entre articulacoes) | NAO EXISTE |
| Pontos de landmark (dots no corpo) | NAO EXISTE |
| Indicadores de posicao dos pes | NAO EXISTE |
| Area de deteccao / bounding box | NAO EXISTE |
| Feedback visual de posicionamento do corpo | NAO EXISTE |

### 4.2 O scanner e apenas logico ou tambem visual?

**AMBOS, mas o visual e LIMITADO.**

- **Logico**: COMPLETO — coleta de frames, calculo de estabilidade, confidenceScore, decisao de inicio/bloqueio
- **Visual**: PARCIAL — mostra progresso e status textual, mas NAO mostra onde os landmarks estao sendo detectados no corpo do atleta

### 4.3 Existe correspondencia entre processamento e UI?

**PARCIAL.**

- A barra de progresso reflete o tempo decorrido (0-3s collecting, 3-5s analyzing) — correspondencia TEMPORAL ok.
- O score de confianca reflete o valor real calculado — correspondencia NUMERICA ok.
- A cor da linha do solo reflete a qualidade da calibracao — correspondencia QUALITATIVA ok.
- **FALTA**: Feedback visual de "o que o sistema esta vendo" (landmarks, skeleton, posicao dos pes detectada). O usuario nao sabe se seus pes estao sendo rastreados corretamente.

---

## PARTE 5 — FLUXO DE EXECUCAO

### 5.1 Mapeamento exato de estados

```
FASE 0: Selecao de Protocolo (uiPhase='protocol')
    Usuario seleciona CMJ ou SL-CMJ
    Usuario configura altura do atleta e data
    Usuario toca "Iniciar Captura"
    
FASE 1: Camera Preview (uiPhase='cameraPreview')
    handleStartCamera() monta componente MediaPipeCamera
    
    STAGE 1 (cameraReady):
      Primeiro frame recebido do MediaPipe -> cameraReady=true
      NENHUM processamento de landmark
      
    STAGE 2 (mediapipeReady):
      Primeiro landmark valido (hip + ankle com score > 0.3) -> mediapipeReady=true
      
    STAGE 3 (jumpEngineReady):
      300ms delay apos mediapipeReady -> jumpEngineReady=true
      BOTAO PLAY HABILITADO
      
    Usuario toca PLAY ->

FASE 2: Gravacao (uiPhase='recording')
    handleStartRecording() -> jumpCamera.startCountdown()
    
    jumpCamera.phase transicoes internas:
    
    2a. 'scanning' — Scanner de calibracao
        Subfase 'collecting' (0-3s): Coleta de frames
        Subfase 'analyzing' (3-5s): Analise de estabilidade
        evaluateCalibration():
          score >= 0.80 -> beginCountdown()
          score >= 0.65 -> beginCountdown() com aviso
          score < 0.65 -> retry ou block
    
    2b. 'countdown' — Contagem regressiva (5s)
        Frames CONTINUAM sendo coletados para calibracao extra
        Cada segundo: countdown - 1
        Quando countdown = 0 -> recording
    
    2c. 'recording' — Gravacao ativa
        Frames processados e armazenados
        Live metrics atualizadas (eccentric, flight)
        Auto-stop apos MAX_RECORDING_DURATION_MS (6000ms)
        Ou usuario toca STOP manualmente
    
    2d. 'processing' — Analise dos frames
        analyzeJumpFrames() chamada com 150ms delay
        Detecta countermovement, takeoff, landing
        Calcula metricas
    
    2e. 'review' -> Transiciona para results

    [SL-CMJ adicional]:
    2f. 'between_jumps' — Entre saltos
        5s auto-countdown antes do segundo salto
        startSecondJump() -> volta para scanning

FASE 3: Resultados (uiPhase='results')
    Exibe metricas ou mensagem de erro
    Opcoes: Salvar ou Repetir
```

### 5.2 Existe separacao clara entre estados?

**SIM.** Ha dois niveis de estado bem separados:

1. **`uiPhase`** (controla renderizacao da UI): `'protocol'` | `'cameraPreview'` | `'recording'` | `'results'`
2. **`jumpCamera.phase`** (controla processamento do motor): `'setup'` | `'scanning'` | `'countdown'` | `'recording'` | `'processing'` | `'between_jumps'` | `'review'`

Alem disso, o pipeline de 3 estagios (cameraReady / mediapipeReady / jumpEngineReady) adiciona uma terceira camada de controle.

### 5.3 O usuario tem controle ou e automatico?

| Etapa | Controle |
|---|---|
| Selecao de protocolo | MANUAL |
| Montar camera | MANUAL (toque em "Iniciar Captura") |
| Iniciar gravacao | MANUAL (toque em PLAY) |
| Scanner / calibracao | AUTOMATICO (apos PLAY) |
| Countdown | AUTOMATICO |
| Gravar | AUTOMATICO (inicia apos countdown) |
| Parar gravacao | HIBRIDO (auto-stop 6s OU manual STOP) |
| Analise | AUTOMATICO |
| Salvar resultado | MANUAL |
| Repetir teste | MANUAL |

---

## PARTE 6 — ERRO COM ATLETA DE LADO (OU ORIENTACAO ERRADA)

### 6.1 Por que o salto falha no final

Quando o atleta esta em orientacao inadequada (frontal ao inves de lateral), os seguintes problemas ocorrem:

**Cenario 1: Pés nao detectados corretamente**
- MediaPipe com atleta frontal: `foot_index` e `ankle` landmarks podem oscilar entre frames
- Variancia alta nos valores Y → `stdDev` alto na calibracao → `adaptiveMargin` maior
- Se `adaptiveMargin` = 0.02 (maximo do clamp), o threshold fica muito baixo, dificultando deteccao de takeoff

**Cenario 2: Takeoff nao detectado**
- Para CMJ, a condicao e: `frame.leftToeY < threshold && frame.rightToeY < threshold` (AMBOS os pes)
- Com atleta frontal, os pes podem estar separados horizontalmente mas o MediaPipe pode nao rastrear os Y individuais de forma estavel
- Se nunca ha 2 frames consecutivos com AMBOS os pes acima do threshold (`MIN_TAKEOFF_FRAMES = 2`), o takeoff NUNCA e detectado
- **Resultado**: `takeoffFrameIdx = null`

**Cenario 3: Landing nao detectado**
- Se takeoff FOI detectado mas a fase de voo e instavel
- Se nunca ha 2 frames consecutivos com ALGUM pe no chao (`MIN_LANDING_FRAMES = 2`), landing nao e confirmado
- **Resultado**: `landingFrameIdx = null`

**Cenario 4: Flight time fora do range**
- Se takeoff e landing sao detectados mas com timing incorreto
- `flightTimeMs < 80` (MIN_FLIGHT_TIME_MS) → rejeitado
- `flightTimeMs > 2000` (MAX_FLIGHT_TIME_MS) → rejeitado

### 6.2 Onde ocorre o erro

**Arquivo**: `jumpDetector.ts` — funcao `analyzeCMJ()`, linhas 516-598

```
// Linha 516-517: Verificacao de deteccao completa
if (takeoffFrameIdx !== null && landingFrameIdx !== null) {
  // ... calculo de metricas
  if (flightTimeMs >= MIN_FLIGHT_TIME_MS && flightTimeMs <= MAX_FLIGHT_TIME_MS) {
    // SUCESSO - metricas validas
  } else {
    console.log('[JUMP_DETECTOR] Flight time out of range: ' + flightTimeMs + 'ms');
    // FALHA por flight time invalido
  }
} else {
  // FALHA - takeoff e/ou landing nao detectados
  // Mensagem: "Could not detect complete jump..."
}
```

### 6.3 Qual condicao especifica dispara o erro?

A mensagem final de erro e SEMPRE:
```
"Could not detect complete jump. Ensure the athlete is fully visible and performs a clear jump."
```

Disparada quando:
1. `takeoffFrameIdx === null` — Nunca houve 2+ frames consecutivos com ambos pes acima do threshold
2. `landingFrameIdx === null` — Takeoff detectado mas landing nunca confirmado (2+ frames consecutivos)
3. Flight time fora do range 80-2000ms — Detectado mas invalido

### 6.4 E erro de dados insuficientes ou inconsistencia?

**Depende do cenario**:
- **Dados insuficientes**: Se `rawFrames.length < 15` (linha 373) → erro precoce antes da analise
- **Inconsistencia de deteccao**: Se orientacao errada causa Y instavel → takeoff/landing nao confirmados → erro na linha 597
- **Condicao mais provavel com orientacao errada**: Erro de INCONSISTENCIA — landmarks sao detectados mas os valores Y nao ultrapassam o threshold de forma consistente para confirmar eventos

---

## PARTE 7 — LOGS

### 7.1 Logs disponiveis por categoria

**confidenceScore** — PRESENTE:
```
[JUMP_DETECTOR] confidenceScore=X.XXX
[JUMP_DETECTOR] footStability=X.XXX
[JUMP_DETECTOR] poseConfidence=X.XXX
[JUMP_DETECTOR] groundStability=X.XXX
[JUMP_CAMERA_HOOK] Confidence score: X.XXX
[JUMP_CAMERA_HOOK] Confidence OK/marginal/TOO LOW
```

**ground calibration** — PRESENTE:
```
[JUMP_DETECTOR] groundLevel=X.XXXX
[JUMP_DETECTOR] standingHipY=X.XXXX
[JUMP_DETECTOR] stdDev=X.XXXX
[JUMP_DETECTOR] adaptiveMargin=X.XXXX (clamped)
[JUMP_DETECTOR] threshold=X.XXXX
[JUMP_DETECTOR] lockedLandmark=foot_index|ankle
[JUMP_DETECTOR] frames used=XX
```

**takeoff / landing** — PRESENTE:
```
[LOG_JUMP_TAKEOFF_DETECTED] Takeoff at frame XX
[LOG_JUMP_LANDING_DETECTED] Landing at frame XX (confirmed after 2 frames)
[JUMP_DETECTOR] Raw takeoff=XX compensated=XX
[JUMP_DETECTOR] Raw landing=XX compensated=XX
[JUMP_DETECTOR] Flight time: XXXms
```

**erros de processamento** — PRESENTE:
```
[JUMP_DETECTOR] ERROR: Not calibrated
[JUMP_DETECTOR] ERROR: Only XX frames (need 15+)
[JUMP_DETECTOR] Flight time out of range: XXXms
[JUMP_DETECTOR] Jump phases not detected (takeoff=YES/NO, landing=YES/NO)
[JUMP_DETECTOR] Foot Y range: leftToe=[X,X] rightToe=[X,X]
[JUMP_DETECTOR] Ground threshold: X.XXXX
```

**Pipeline e progressao** — PRESENTE:
```
[JUMP_CAMERA] STAGE 1/2/3
[JUMP_CAMERA_HOOK] startCountdown()
[JUMP_CAMERA_HOOK] Auto-retry #X
[JUMP_CAMERA_HOOK] Max retries reached, blocking
[JUMP_CAMERA_HOOK] Countdown complete
[LOG_JUMP_RESULTS_SCREEN_OPENED]
```

### 7.2 Os logs sao suficientes para debug?

**SIM, na maioria dos cenarios.** Os logs cobrem:
- Valores exatos de calibracao (para entender threshold)
- Frames de takeoff/landing (com compensacao)
- Valores de Y dos primeiros e ultimos frames
- Range dos Y dos pes vs threshold quando falha

### 7.3 Falta alguma informacao critica?

**SIM, faltam os seguintes logs**:

| Log ausente | Importancia | Impacto |
|---|---|---|
| Valores Y por frame DURANTE gravacao | ALTA | Impossivel rastrear frame-a-frame onde a deteccao falhou |
| Coordenadas X dos landmarks | MEDIA | Impossivel diagnosticar problemas de orientacao |
| Contagem de consecutiveTakeoffFrames/LandingFrames | MEDIA | Nao se sabe quantos frames "quase" confirmaram takeoff |
| Score de confianca de cada landmark por frame | MEDIA | Nao se sabe se landmarks estavam com baixa confianca durante gravacao |
| Timestamp nativo vs performance.now() | BAIXA | Para diagnostico de latencia entre captura e processamento |
| Frame drop events durante gravacao | BAIXA | FrameIntegrityMonitor detecta drops mas so loga em __DEV__ |

---

## ACHADOS ADICIONAIS (OBSERVADOS DURANTE AUDITORIA)

### A1. Desconexao de Timestamps entre MediaPipeCamera e Pipeline

**Arquivo**: MediaPipeCamera.tsx (linha 73) vs useJumpCamera.ts (linha 484)

- `MediaPipeCamera` chama `getFrameTimestamp(data.timestamp)` com o timestamp NATIVO do frame
- Isso atualiza `lastTimestamp` em frameTime.ts
- Porem, `processFrame()` em useJumpCamera.ts chama `getFrameTimestamp()` SEM argumento nativo
- Isso usa `performance.now()` ao inves do timestamp nativo do frame da camera
- **Resultado**: Os timestamps usados para calculo de flight time sao de `performance.now()`, nao do hardware da camera
- **Impacto**: Latencia variavel do event loop JS entre captura do frame e processamento afeta a precisao dos timestamps

### A2. Segundo argumento de onLandmark ignorado

**Arquivo**: jump-camera.tsx (linha 304)

- `MediaPipeCamera` chama `onLandmark(landmarks, timestamp)` com 2 argumentos
- `handleMediapipeLandmark(event: any)` recebe apenas 1 argumento
- O `timestamp` retornado pelo MediaPipeCamera e DESCARTADO
- Todo o pipeline usa timestamps gerados internamente via `performance.now()`

### A3. Scanner continua coletando durante countdown

**Arquivo**: useJumpCamera.ts (linhas 528-533)

Quando `phase === 'countdown'`, frames sao adicionados a `calibrationFramesRef.current`. Isso significa que a calibracao final usada para deteccao de takeoff/landing inclui frames alem dos coletados durante o scanner (0-5s). Isso e BENIGNO mas vale notar que o `evaluateCalibration()` so roda uma vez (no fim do scanner), entao os frames extras do countdown NAO sao refletidos no confidenceScore exibido.

### A4. Contagem de frames durante countdown nao recalibra

Os frames coletados durante o countdown (linhas 528-533) sao armazenados em `calibrationFramesRef` mas `calibrateGround()` NAO e chamada novamente apos o countdown. A calibracao usada para a gravacao e a mesma calculada ao final do scanner (5s). Os frames extras do countdown sao irrelevantes para a deteccao.

CORRECAO: Na verdade, `stopRecording()` chama `analyzeJumpFrames()` passando `groundCalibration` que e o estado setado por `evaluateCalibration()`. Os frames de `calibrationFramesRef` adicionados durante countdown NAO sao usados na analise. A analise usa `recordingFramesRef` que so coleta frames durante `phase === 'recording'`.

### A5. Auto-stop vs Manual Stop

**Arquivo**: useJumpCamera.ts (linhas 545-549)

`MAX_RECORDING_DURATION_MS = 6000` (6 segundos). Se o atleta nao salta dentro de 6 segundos, a gravacao para automaticamente. Se o salto ocorre mas a deteccao demora, frames apos 6s nao sao capturados. O botao STOP tambem esta disponivel durante a gravacao.

---

## RESUMO CONSOLIDADO

| Secao | Status | Achados Criticos |
|---|---|---|
| Confidence Score | CORRETO | Score calculado e exibido corretamente. Thresholds respeitados. Score 0.65-0.79 permite inicio com aviso. |
| Retry / Recalibracao | CORRETO | 2 retries auto + botao manual. Sem bypass. Bloqueio real para < 0.65. |
| Orientacao do Atleta | AUSENTE | ZERO validacao de orientacao. Nao usa X, nao usa Z, nao detecta frontal vs lateral. |
| Scanner Visual | PARCIAL | Feedback textual + barra + linha do solo. Sem skeleton, sem pontos, sem feedback de posicao corporal. |
| Fluxo de Execucao | CORRETO | 3 estagios de inicializacao + estados de UI + estados do motor bem separados. |
| Erro com Orientacao | DIAGNOSTICADO | Falha por inconsistencia de landmarks Y quando orientacao e inadequada. Erro generico sem diagnostico especifico. |
| Logs | BOM | Cobertura boa para maioria dos cenarios. Faltam logs por frame durante gravacao e coordenadas X. |

| Achados Adicionais | Impacto |
|---|---|
| Timestamp nativo descartado | MEDIO — usa performance.now() ao inves do timestamp do hardware |
| Segundo argumento de onLandmark ignorado | MEDIO — timestamp da camera perdido |
| Frames do countdown nao refletidos na calibracao | BAIXO — benigno |
| CONFIDENCE_BLOCK constante nunca usada | BAIXO — redundante |

---

**FIM DA AUDITORIA. Nenhum codigo foi alterado.**
