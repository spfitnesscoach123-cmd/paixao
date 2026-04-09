# Arquitetura — Sistema de Composição Corporal com Avatar 3D

## 1. VISÃO GERAL

O sistema substitui completamente o módulo atual (`add-body-composition.tsx` + SVG estático)
por um pipeline de 8 camadas que transforma captura de câmera em avatar 3D interativo.

```
Camera → MediaPipe → Body Mapping → Avatar 3D → Interação → Protocolos → Simetria → Relatório
```

---

## 2. STATE MACHINE

```
IDLE
  │  (coach toca "Nova Avaliação")
  ▼
CAPTURE_PREP
  │  Dados: athleteId, athleteHeight, athleteWeight, gender
  │  Ação: Inicializa câmera + MediaPipe, exibe silhueta-guia
  │  Transição: pose detectada com confidence > 0.7 → CAPTURING
  ▼
CAPTURING
  │  Dados: JumpFrameData[] (reusa struct existente do jump module)
  │  Ação: Coleta 60 frames (~2s) de pose estável, barra de progresso
  │  Validação: confidence média > 0.7, desvio padrão de landmarks < threshold
  │  Transição: frames suficientes + estáveis → PROCESSING_BODY
  │  Fallback: instabilidade detectada → volta para CAPTURE_PREP com warning
  ▼
PROCESSING_BODY
  │  Dados: BodyParams (proporções normalizadas)
  │  Ação: Body Mapping Engine processa landmarks → calcula proporções
  │  Transição: proporções válidas → AVATAR_READY
  ▼
AVATAR_READY
  │  Dados: Avatar3DState (modelo GLTF + deformações aplicadas)
  │  Ação: Exibe avatar 3D rotacionável. Coach pode rotacionar/zoom.
  │  Transição: coach toca "Selecionar Protocolo" → PROTOCOL_SELECTION
  │  Alternativa: coach toca "Recapturar" → CAPTURE_PREP
  ▼
PROTOCOL_SELECTION
  │  Dados: ProtocolConfig (protocolo selecionado + sites obrigatórios)
  │  Ação: Lista de protocolos (Jackson-Pollock 3/7, Durnin-Womersley, etc.)
  │  Ação: Ao selecionar, pontos anatômicos obrigatórios acendem no avatar
  │  Transição: protocolo selecionado → MEASUREMENT_INPUT
  ▼
MEASUREMENT_INPUT
  │  Dados: Measurements (mapa de site → valor em mm)
  │  Ação: Coach toca no ponto 3D → abre input numérico para aquele site
  │  Ação: Pontos preenchidos ficam verdes, pendentes ficam vermelhos
  │  Validação: valor entre 2-80mm por dobra
  │  Transição: todos os sites preenchidos → CALCULATING
  ▼
CALCULATING
  │  Dados: Results (% gordura, massa magra, massa gorda, densidade)
  │  Ação: Protocol Engine aplica fórmulas específicas do protocolo
  │  Ação: Symmetry Engine calcula assimetrias laterais/verticais
  │  Transição: cálculos completos → REPORT_READY
  ▼
REPORT_READY
  │  Dados: FullReport (Results + Symmetry + BodyParams + histórico)
  │  Ação: Avatar 3D com heatmap de gordura, métricas, comparação histórica
  │  Ações do coach: Salvar, Exportar PDF, Refazer medições
  │  Transição: "Salvar" → salva no backend → IDLE
  │  Transição: "Refazer medições" → MEASUREMENT_INPUT
```

---

## 3. ESTRUTURA DE PASTAS

```
frontend/
├── app/athlete/[id]/
│   └── body-composition-3d.tsx          ← Screen principal (state machine + navegação)
│
├── components/body-composition/
│   ├── CaptureOverlay.tsx               ← UI de captura (silhueta-guia, progresso)
│   ├── AvatarViewer.tsx                 ← Container Three.js (GLView + Scene)
│   ├── ProtocolSelector.tsx             ← Lista de protocolos
│   ├── MeasurementPanel.tsx             ← Input numérico para dobra selecionada
│   ├── MeasurementMarkers.tsx           ← Pontos 3D no avatar (esferas clicáveis)
│   ├── ReportView.tsx                   ← Relatório final com métricas + heatmap
│   └── BodyHeatmap.tsx                  ← Shader/material de heatmap no avatar
│
├── engine/body-composition/
│   ├── bodyMappingEngine.ts             ← Landmarks → BodyParams (proporções)
│   ├── avatarEngine.ts                  ← Carrega GLTF, aplica deformações
│   ├── interactionEngine.ts             ← Raycasting, detecção de toque em mesh
│   ├── protocolEngine.ts                ← Fórmulas científicas por protocolo
│   ├── symmetryEngine.ts               ← Análise de assimetria
│   └── reportEngine.ts                 ← Agrega dados para relatório final
│
├── hooks/
│   └── useBodyComposition.ts            ← Hook principal (state machine + orchestração)
│
├── services/body-composition/
│   └── types.ts                         ← Todos os tipos TypeScript
│
└── assets/models/
    └── avatar_base.glb                  ← Modelo GLTF base (humanoid genérico)
```

### Responsabilidades

| Pasta | Responsabilidade |
|-------|-----------------|
| `app/` | Screen-level routing, parâmetros de navegação |
| `components/` | UI pura, renderização, interação visual |
| `engine/` | Lógica de negócio pura, sem dependência de React |
| `hooks/` | State management, orquestração de engines |
| `services/` | Tipos, API calls, persistência |
| `assets/` | Modelo 3D base (.glb) |

---

## 4. PIPELINE DE CAPTURA (Camera + Vision Layer)

### Infraestrutura existente reutilizada
- `MediaPipeCamera.tsx` — já no app, detecta 33 landmarks de pose
- `convertMediapipeLandmarks()` — já converte para `ProcessedKeypoint[]`

### Fluxo de dados
```
VisionCamera frame
  → MediaPipe Pose Detection (JSI, nativo)
  → 33 landmarks { x, y, z, visibility }  (coordenadas normalizadas 0-1)
  → convertMediapipeLandmarks()
  → ProcessedKeypoint[] { name, x, y, z, confidence }
  → Body Mapping Engine
```

### Landmarks utilizados (subset dos 33 MediaPipe)

| Index | Nome | Uso |
|-------|------|-----|
| 11 | left_shoulder | Largura ombro |
| 12 | right_shoulder | Largura ombro |
| 23 | left_hip | Largura quadril |
| 24 | right_hip | Largura quadril |
| 13 | left_elbow | Comprimento braço |
| 14 | right_elbow | Comprimento braço |
| 15 | left_wrist | Comprimento braço |
| 16 | right_wrist | Comprimento braço |
| 25 | left_knee | Comprimento perna |
| 26 | right_knee | Comprimento perna |
| 27 | left_ankle | Comprimento perna |
| 28 | right_ankle | Comprimento perna |
| 0  | nose | Referência de cabeça |

### Estabilidade de captura
- Coleta 60 frames (~2s a 30fps)
- Descarta frames com `confidence < 0.7`
- Calcula stdDev de cada landmark nos frames estáveis
- Se stdDev > 0.015 em qualquer landmark crítico → warning "Fique parado"
- Média dos frames estáveis → landmarks finais para Body Mapping

---

## 5. BODY MAPPING ENGINE

### Input
```typescript
ProcessedKeypoint[] (33 landmarks médios com x,y,z normalizados)
athleteHeight: number (cm)
```

### Cálculos de proporção

```
Largura de ombro:
  shoulderWidth = distance(left_shoulder, right_shoulder)

Largura de quadril:
  hipWidth = distance(left_hip, right_hip)

Comprimento braço esquerdo:
  leftArmLength = distance(left_shoulder, left_elbow) + distance(left_elbow, left_wrist)

Comprimento braço direito:
  rightArmLength = distance(right_shoulder, right_elbow) + distance(right_elbow, right_wrist)

Comprimento perna esquerda:
  leftLegLength = distance(left_hip, left_knee) + distance(left_knee, left_ankle)

Comprimento perna direita:
  rightLegLength = distance(right_hip, right_knee) + distance(right_knee, right_ankle)

Comprimento torso:
  torsoLength = distance(midpoint(shoulders), midpoint(hips))

Altura relativa (para normalização):
  bodyHeight = distance(nose, midpoint(ankles))
```

### Normalização
Todas as distâncias são divididas por `bodyHeight` para obter proporções relativas (0-1).
Essas proporções são então multiplicadas por `athleteHeight` para obter valores absolutos em cm.

```
scaleFactor = athleteHeight / bodyHeight
shoulderWidthCm = shoulderWidth * scaleFactor
```

### Output: `BodyParams`
```typescript
{
  shoulderWidth: number,    // cm
  hipWidth: number,         // cm
  torsoLength: number,      // cm
  leftArmLength: number,    // cm
  rightArmLength: number,   // cm
  leftLegLength: number,    // cm
  rightLegLength: number,   // cm
  shoulderToHipRatio: number, // proporção
  bodyHeight: number,       // normalizado
}
```

---

## 6. AVATAR ENGINE (Three.js)

### Dependências necessárias
```
expo-gl          — contexto OpenGL para React Native
expo-three       — bridge Three.js ↔ Expo GL
three            — engine 3D
```

### Modelo GLTF base
Modelo humanoid genérico com meshes nomeados:
```
avatar_base.glb
  ├── Head
  ├── Torso
  ├── LeftUpperArm
  ├── LeftForearm
  ├── RightUpperArm
  ├── RightForearm
  ├── LeftUpperLeg
  ├── LeftLowerLeg
  ├── RightUpperLeg
  ├── RightLowerLeg
  └── Hips
```

### Deformação por escala
Cada mesh recebe escala baseada nas proporções do `BodyParams`:

```
Torso.scale.x = bodyParams.shoulderWidth / baseModelShoulderWidth
Torso.scale.y = bodyParams.torsoLength / baseModelTorsoLength
Hips.scale.x = bodyParams.hipWidth / baseModelHipWidth
LeftUpperArm.scale.y = bodyParams.leftArmLength / baseModelArmLength
...etc
```

O modelo base tem proporções "neutras" (50th percentile humano).
A deformação é aplicada como ratio: `atleta / base`.

### Renderização
```
GLView (expo-gl)
  → THREE.WebGLRenderer
  → THREE.Scene
    ├── THREE.AmbientLight
    ├── THREE.DirectionalLight
    ├── Avatar (GLTF carregado + deformações)
    └── MeasurementMarkers (esferas nos pontos anatômicos)
  → THREE.PerspectiveCamera
  → OrbitControls (rotação/zoom por gesto)
```

---

## 7. INTERACTION LAYER

### Raycasting
```
Touch event (x, y) na GLView
  → Converte para normalized device coordinates (-1 a 1)
  → THREE.Raycaster.setFromCamera(ndc, camera)
  → raycaster.intersectObjects(measurementMarkers)
  → Se intersecta: identifica o marker → abre MeasurementPanel para aquele site
```

### Mapeamento mesh → região anatômica
```typescript
const MARKER_SITE_MAP: Record<string, AnatomicalSite> = {
  'marker_triceps_right':    { site: 'triceps', side: 'right', position: [x,y,z] },
  'marker_triceps_left':     { site: 'triceps', side: 'left', position: [x,y,z] },
  'marker_subscapular_right':{ site: 'subscapular', side: 'right', position: [x,y,z] },
  'marker_suprailiac_right': { site: 'suprailiac', side: 'right', position: [x,y,z] },
  'marker_abdominal':        { site: 'abdominal', side: 'center', position: [x,y,z] },
  'marker_chest_right':      { site: 'chest', side: 'right', position: [x,y,z] },
  'marker_midaxillary_right':{ site: 'midaxillary', side: 'right', position: [x,y,z] },
  'marker_thigh_right':      { site: 'thigh', side: 'right', position: [x,y,z] },
  'marker_thigh_left':       { site: 'thigh', side: 'left', position: [x,y,z] },
  'marker_calf_right':       { site: 'calf', side: 'right', position: [x,y,z] },
  'marker_calf_left':        { site: 'calf', side: 'left', position: [x,y,z] },
  'marker_biceps_right':     { site: 'biceps', side: 'right', position: [x,y,z] },
};
```

As posições dos markers são calculadas relativamente à geometria do mesh pai.
Exemplo: `marker_triceps_right` é posicionado no ponto médio do `RightUpperArm` mesh,
levemente deslocado para a face posterior.

### Feedback visual
- Marker idle: esfera branca semi-transparente (r=0.02)
- Marker hover/toque: esfera amarela, escala 1.3x
- Marker preenchido: esfera verde
- Marker pendente (protocolo exige): esfera vermelha pulsante

---

## 8. PROTOCOL ENGINE

### Estrutura de protocolo
```typescript
interface ProtocolDefinition {
  id: string;
  name: string;
  author: string;
  year: number;
  requiredSites: SkinFoldSite[];         // sites obrigatórios
  genderSpecificSites?: {
    male: SkinFoldSite[];
    female: SkinFoldSite[];
  };
  formula: (sumOfFolds: number, age: number, gender: Gender) => number; // → densidade
  densityToFatFormula: 'siri' | 'brozek';
}
```

### Protocolos suportados (já existentes no backend)

| Protocolo | Sites | Fórmula |
|-----------|-------|---------|
| Jackson-Pollock 3 (M) | chest, abdominal, thigh | Dc = 1.10938 - 0.0008267(S) + 0.0000016(S²) - 0.0002574(age) |
| Jackson-Pollock 3 (F) | triceps, suprailiac, thigh | Dc = 1.0994921 - 0.0009929(S) + 0.0000023(S²) - 0.0001392(age) |
| Jackson-Pollock 7 | chest, midaxillary, triceps, subscapular, abdominal, suprailiac, thigh | Dc = 1.112 - 0.00043499(S) + 0.00000055(S²) - 0.00028826(age) |
| Durnin-Womersley | biceps, triceps, subscapular, suprailiac | Dc = tabela por idade/gênero |
| Guedes | triceps, suprailiac, abdominal | Dc = 1.17136 - 0.06706 × log10(S) |
| Petroski | triceps, suprailiac, abdominal, calf | Dc por gênero/idade |
| Faulkner | triceps, subscapular, suprailiac, abdominal | %G = 5.783 + 0.153(S) |

### Conversão Densidade → % Gordura
```
Siri:   %Fat = (4.95 / Dc - 4.50) × 100
Brozek: %Fat = (4.57 / Dc - 4.142) × 100
```

### Métricas derivadas
```
fatMassKg = weight × (%fat / 100)
leanMassKg = weight - fatMassKg
fatMassIndex = fatMassKg / (height/100)²
leanMassIndex = leanMassKg / (height/100)²
```

---

## 9. SYMMETRY ENGINE

### Cálculo lateral (direita vs esquerda)
Requer que o protocolo tenha sites bilaterais (ex: triceps_left + triceps_right).

```
lateralAsymmetry[site] = |right - left| / max(right, left) × 100
```

Classificação:
- < 5%: Simétrico
- 5-10%: Assimetria leve
- 10-15%: Assimetria moderada
- > 15%: Assimetria significativa

### Cálculo vertical (superior vs inferior)
```
upperBodySum = sum(triceps, biceps, subscapular, chest, midaxillary)
lowerBodySum = sum(thigh, calf, suprailiac, abdominal)
verticalRatio = upperBodySum / lowerBodySum
```

- Ratio ~1.0: Distribuição equilibrada
- Ratio > 1.3: Concentração superior
- Ratio < 0.7: Concentração inferior

### Output: heatmap no avatar
Cada região do mesh recebe cor baseada no valor relativo da dobra:
- Azul: baixa gordura subcutânea (< P25 normativo)
- Verde: normal (P25-P75)
- Amarelo: elevada (P75-P90)
- Vermelho: alta (> P90)

---

## 10. MODELO DE DADOS (TypeScript)

```typescript
// === TIPOS BASE ===

type Gender = 'male' | 'female';

type SkinFoldSite =
  | 'triceps' | 'biceps' | 'subscapular' | 'suprailiac'
  | 'abdominal' | 'chest' | 'midaxillary' | 'thigh' | 'calf';

type Side = 'left' | 'right' | 'center';

// === BODY PARAMS (output do Body Mapping Engine) ===

interface BodyParams {
  shoulderWidth: number;
  hipWidth: number;
  torsoLength: number;
  leftArmLength: number;
  rightArmLength: number;
  leftLegLength: number;
  rightLegLength: number;
  shoulderToHipRatio: number;
  bodyHeight: number;
  landmarks: ProcessedKeypoint[];  // raw para debug
}

// === MEASUREMENTS (input do coach) ===

interface SkinFoldMeasurement {
  site: SkinFoldSite;
  side: Side;
  value: number;           // mm
  timestamp: number;       // quando foi inserido
}

interface Measurements {
  protocolId: string;
  entries: SkinFoldMeasurement[];
  sumOfFolds: number;      // soma automática
  isComplete: boolean;     // todos os sites preenchidos
}

// === RESULTS (output do Protocol Engine) ===

interface Results {
  protocolId: string;
  protocolName: string;
  density: number;
  bodyFatPercentage: number;
  fatMassKg: number;
  leanMassKg: number;
  fatMassIndex: number;
  leanMassIndex: number;
  bmi: number;
  classification: string;  // "Atlético", "Normal", "Acima", etc.
}

// === SYMMETRY (output do Symmetry Engine) ===

interface SymmetryAnalysis {
  lateral: {
    site: SkinFoldSite;
    leftValue: number;
    rightValue: number;
    asymmetryPercent: number;
    classification: 'symmetric' | 'mild' | 'moderate' | 'significant';
  }[];
  vertical: {
    upperBodySum: number;
    lowerBodySum: number;
    ratio: number;
    distribution: 'balanced' | 'upper_dominant' | 'lower_dominant';
  };
}

// === ASSESSMENT COMPLETO (salvo no backend) ===

interface BodyCompositionAssessment {
  id?: string;
  athleteId: string;
  coachId: string;
  date: string;                    // ISO 8601
  gender: Gender;
  age: number;
  weight: number;                  // kg
  height: number;                  // cm
  bodyParams: BodyParams;
  measurements: Measurements;
  results: Results;
  symmetry: SymmetryAnalysis;
}
```

---

## 11. PERFORMANCE

| Preocupação | Solução |
|-------------|---------|
| MediaPipe na UI thread | JSI bridge (já implementado via módulo nativo `mediapipe-pose`) |
| Three.js re-renders | `useMemo` para geometrias, `useRef` para scene. Não re-renderizar scene a cada state change |
| GLTF loading | Pré-carregar modelo durante `CAPTURE_PREP`. Cache via `expo-asset` |
| Raycasting perf | Raycast apenas nos markers (esferas), não nos meshes complexos do avatar |
| State updates durante 3D | Usar refs para estado interno do 3D. Só chamar `setState` para UI externa |
| Memória | Dispose de geometrias/materiais ao sair da tela. `useEffect cleanup` |
| Bundle size | Modelo `.glb` comprimido (Draco). Alvo: < 500KB |

---

## 12. API BACKEND (extensão da existente)

O backend já tem:
- `POST /api/body-composition` — criar avaliação
- `GET /api/body-composition/athlete/{id}` — listar avaliações
- `GET /api/body-composition/protocols` — protocolos disponíveis

Extensões necessárias:
- Adicionar campos `bodyParams` e `symmetry` ao modelo `BodyComposition`
- Os cálculos podem ser feitos no frontend (offline-first) ou duplicados no backend para validação

---

## 13. DEPENDÊNCIAS A INSTALAR

```
expo-gl           — contexto OpenGL
expo-three        — bridge Three.js
three             — engine 3D
@types/three      — tipos TypeScript
```

MediaPipe e VisionCamera já estão no projeto.

---

## 14. RISCOS E MITIGAÇÕES

| Risco | Mitigação |
|-------|-----------|
| expo-gl instável em alguns devices | Fallback: avatar 2D com SVG (como atual) se GL falhar |
| Modelo GLTF muito pesado | Usar modelo low-poly (< 5000 vértices), compressão Draco |
| Raycasting impreciso em tela pequena | Markers com hitbox ampliada (raio visual 0.02, hitbox 0.04) |
| Captura ruim em ambientes escuros | Validação de confidence + feedback visual ao coach |
| Three.js leaks de memória | Cleanup rigoroso no useEffect return |

---

## 15. RESUMO

A arquitetura substitui o SVG estático por um pipeline completo de 8 camadas.
Reutiliza infraestrutura existente (MediaPipe, API, protocolos) e adiciona Three.js para
a experiência 3D interativa. O state machine garante fluxo linear e previsível.
Cada engine é isolada, testável e sem dependência de React.
