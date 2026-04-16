# Load Manager Pro - PRD

## Problema Original
Aplicativo de gerenciamento de carga para treinadores esportivos. React Native Expo (frontend) + FastAPI (backend) + MongoDB. Modulos: VBT (Velocity Based Training), Jump Camera (CMJ, SL-CMJ), Body Scan 3D (composicao corporal).

## Usuarios
- Treinadores/Preparadores fisicos
- Atletas (visualizacao de dados)

## Funcionalidades Core
1. **Gerenciamento de Atletas** - CRUD completo
2. **Avaliacao de Forca & VBT** - Velocity Based Training com camera
3. **Jump Camera** - CMJ e SL-CMJ com MediaPipe
4. **Body Scan 3D** - Scanner corporal + Protocolos cientificos (PROMPT 3 + 4)
5. **Wellness** - Monitoramento de bem-estar
6. **GPS Data** - Dados de atividade
7. **Analise Cientifica** - Graficos e metricas avancadas

## Arquitetura
```
/app
├── frontend/ (React Native Expo)
│   ├── app/athlete/[id]/ (Telas por atleta)
│   │   ├── body-scan.tsx (Camera + MediaPipe scanner)
│   │   ├── protocol-select.tsx (Selecao de protocolo)
│   │   ├── measurement.tsx (Medicoes no Avatar 3D interativo)
│   │   ├── report.tsx (Relatorio animado + save backend)
│   │   ├── jump-camera.tsx
│   │   └── vbt-camera.tsx
│   ├── engine/body-composition/
│   │   ├── protocolEngine.ts (5 protocolos cientificos)
│   │   ├── bodyComposition.ts (Calculo de composicao)
│   │   ├── symmetryEngine.ts (Analise de simetria)
│   │   └── bodyMapping.ts (MediaPipe body mapping)
│   ├── components/body-composition/
│   │   ├── Avatar3D.tsx (Three.js + GLB AVATAR DC ULTIMATE + PanResponder + Raycasting)
│   │   ├── MeasurementInputModal.tsx
│   │   ├── CameraScanner.tsx
│   │   └── ScannerOverlay.tsx
│   ├── components/
│   │   └── BodyCompositionCharts.tsx (Usa Avatar3D no nativo, SVG fallback web)
│   ├── assets/models/
│   │   └── avatar.glb (AVATAR DC ULTIMATE - 1.3MB, 10 meshes anatomicas)
│   └── types/protocols.ts
├── backend/ (FastAPI)
│   └── server.py (API completa)
```

## O que foi implementado

### Sessions 1-7 (Anteriores)
- VBT Camera, Jump Camera, Auth JWT, CRUD atletas, Wellness, GPS, Analise cientifica
- Body Scan, Protocolos, Relatorio animado, Avatar3D GLB real

### Session 8 (Auditoria + Fix Avatar3D) - 15/Abr/2026
- Auditoria diagnostica completa do pipeline 3D
- Downgrade three: 0.183 -> 0.166.1
- Substituicao GLB por AVATAR DC ULTIMATE
- Mapeamento 1:1 meshes anatomicas
- Error logging, fix layout responsivo

### Session 9 (Evolucao Completa Avatar3D) - 15/Abr/2026
- **AUDITORIA DIAGNOSTICA** completa com 6 problemas identificados
- **CAMERA ADAPTATIVA**: Auto-fit baseado na bounding box do modelo (sem cortar pernas)
  - Calcula distancia ideal usando FOV + aspect ratio
  - camera.lookAt(center do modelo) - centralizado perfeitamente
- **DRAG ROTATION**: PanResponder para rotacao por gesto
  - Sensibilidade: 0.008 rad/px
  - Inercia: damping 0.95 com velocidade maxima limitada
  - Auto-rotate pausa durante interacao e retoma suavemente
- **RAYCASTING CORRIGIDO v2**: Pipeline TOUCH -> NDC -> RAY -> INTERSECT
  - onLayout captura dimensoes em LAYOUT POINTS (nao GL pixels)
  - locationX/Y -> NDC via (touch/layout)*2-1 (sem PixelRatio)
  - Removido clientWidth/drawingBuffer (web DOM incompativel com RN)
  - intersectObjects com recursive=true
  - Parent chain walk para encontrar mesh anatomica nomeada
  - Debug logs completos: TOUCH, LAYOUT, NDC, INTERSECTS, HIT/MISS
- **FIX LAYOUT REPORT.TSX**: Removido alignItems:'center' que causava largura 0
  - Adicionado minHeight:350 + alignSelf:'stretch'
  - Avatar agora visivel no relatorio
- **UNIFICACAO AVATAR**: BodyCompositionCharts agora usa Avatar3D no nativo
  - fat_distribution mapeado para heatmapValues das meshes anatomicas
  - SVG mantido como fallback web
  - Toggle Frontal/Lateral removido (3D permite rotacao livre)
- **ROTACAO AUTOMATICA**: Habilitada em todas as telas (measurement + report + assessments)

### Session 10 (Fix SL-CMJ State Machine + Avatar3D Integration) - 16/Abr/2026
- **AUDITORIA DIAGNOSTICA SL-CMJ**: Identificou causa raiz — `activeLeg` (useState) assincrono dentro do loop de processamento de frames
- **FIX activeLegRef**: Adicionado `useRef<ActiveLeg>` para acesso sincrono
  - `activeLegRef.current` atualizado IMEDIATAMENTE antes de `setActiveLeg()` em TODOS os pontos
  - `processFrame`: todas deteccoes SL-CMJ (takeoff, landing, grounding) usam `activeLegRef.current`
  - `updateLiveMetrics`: deteccao SL-CMJ usa `activeLegRef.current`
  - `startSecondJump`: ref atualizado antes de state
  - `reset`: ref limpo junto com state
- **ZERO REGRESSAO CMJ**: Nenhuma alteracao em `jumpDetector.ts`, nenhuma alteracao no path CMJ
- **PROTECAO DE SAVE**: Ja existente — bloqueia save com dados incompletos (1 perna so)
- **AUDITORIA AVATAR3D INTEGRACAO**: Pipeline TOUCH→RAYCAST→CALLBACK→MODAL diagnosticado
- **FIX TAP_MAX_DISTANCE**: 12px → 25px (tremor natural do dedo em tela touch causava rejeicao do tap)
- **FIX HEATMAP**: Substituido `mat.emissive` (invisivel) por `mat.color` direto (visivel)
  - Valores > 0: gradiente heatmap (verde/amarelo/vermelho)
  - Valores < 0: indicador purple "toque aqui" (meshes do protocolo sem dados)
  - undefined: skin color (nao faz parte do protocolo)
- **INDICADORES VISUAIS measurement.tsx**: heatmapValues agora passado ao Avatar3D
  - Meshes do protocolo sem dados = purple (indicador visual de interacao)
  - Meshes preenchidas = cor do heatmap (feedback progressivo)
- **DEBUG LOGGING**: console.log criticos → console.warn (aparece no Mac Console/NSLog)

## Fluxo Body Scan 3D (Completo)
```
[Aba Assessments] -> Body Scan 3D ->
  [body-scan.tsx] Config (altura/peso) -> Iniciar Scanner -> Scan camera -> Resultados ->
  "Usar Resultados" ->
  [protocol-select.tsx] Selecionar protocolo + dados atleta ->
  [measurement.tsx] Tocar avatar -> inserir dobras (mm) -> Calcular ->
  [report.tsx] Classificacao + Heatmap + Metricas + Simetria + Insights -> Salvar
```

## Backlog Priorizado

### P0 (Critico)
- ~~Fix SL-CMJ state machine: segundo salto nao detectado~~ DONE (Session 10 - 16/Abr/2026)
- Fix Durnin & Womersley NaN bug (Math.log10(0) quando soma = 0)

### P1 (Proximo)
- Verificar Avatar3D interativo em dispositivo nativo (EAS Build)
- Renomear "Simetria Lateral" -> "Distribuicao Regional" (symmetryEngine + report)
- Adicionar eixo Z ao bodyMapping.ts (correcao de perspectiva)
- Vincular Body Scan (MediaPipe landmarks) ao modelo 3D do avatar
- Refatorar body-scan.tsx (760+ linhas)
- Nova UI para VBT e Jump Camera

### P2 (Futuro)
- Import PDF -> CSV
- Export CSV
- CMJ perspective bug fix (foot selection + hip validation) - PARKED

### P3 (Backlog)
- Merge de perfis duplicados
- i18n completa (ScientificAnalysisTab, Assessments)
- Refactoring trackingProtection.ts (legacy VBT)
- GitHub account linking (spfitnesscoach123-cmd vs paixaosf)

## Credenciais de Teste
- Email: contato@loadmanagerpro.com.br
- Password: #UAE2026

## Integracoes
- MediaPipeTasksVision (Native SDK)
- Three.js@0.166.1 / Expo-GL@16.0.10 / Expo-Three@8.0.0
- GLTFLoader (three/examples/jsm/loaders/GLTFLoader)
- RevenueCat (subscricoes)

## Meshes do AVATAR DC ULTIMATE (avatar.glb)
| Mesh GLB | SkinfoldSite | Label PT | Label EN |
|----------|-------------|----------|----------|
| BICEPS | biceps | Biceps | Biceps |
| TRICEPS | triceps | Triceps | Triceps |
| PEITORAL | chest | Peitoral | Chest |
| AXILAR_MEDIA | midaxillary | Axilar Media | Midaxillary |
| ABDOMINAL | abdominal | Abdominal | Abdominal |
| SUPRA_ILIACA | suprailiac | Supra-iliaca | Suprailiac |
| COXA | thigh | Coxa | Thigh |
| PANTURILHA | calf | Panturrilha | Calf |
| SUBESCAPULAR | subscapular | Subescapular | Subscapular |
