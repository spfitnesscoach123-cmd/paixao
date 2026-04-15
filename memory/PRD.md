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
│   │   ├── measurement.tsx (Medicoes no Avatar 3D)
│   │   ├── report.tsx (Relatorio animado + save backend)
│   │   ├── jump-camera.tsx
│   │   └── vbt-camera.tsx
│   ├── engine/body-composition/
│   │   ├── protocolEngine.ts (5 protocolos cientificos)
│   │   ├── bodyComposition.ts (Calculo de composicao)
│   │   ├── symmetryEngine.ts (Analise de simetria)
│   │   └── bodyMapping.ts (MediaPipe body mapping)
│   ├── components/body-composition/
│   │   ├── Avatar3D.tsx (Three.js + GLB AVATAR DC ULTIMATE)
│   │   ├── MeasurementInputModal.tsx
│   │   ├── CameraScanner.tsx
│   │   └── ScannerOverlay.tsx
│   ├── assets/models/
│   │   └── avatar.glb (AVATAR DC ULTIMATE - 1.3MB, 10 meshes anatomicas)
│   └── types/protocols.ts
├── backend/ (FastAPI)
│   └── server.py (API completa)
```

## O que foi implementado

### Session 1-4 (Anteriores)
- VBT Camera completo
- Jump Camera (CMJ + SL-CMJ)
- Autenticacao JWT
- CRUD atletas
- Wellness tracking
- GPS data
- Analise cientifica

### Session 5 (Body Scan + Protocolos - Prompt 3)
- Body Scan com MediaPipe (camera + 4 estados visuais)
- Scanner overlay com esqueleto
- Navegacao Body Scan 3D na aba Assessments

### Session 6 (Protocolos + Relatorio Animado - Prompt 4) - 09/Abr/2026
- Selecao de protocolo (5 protocolos cientificos)
- Tela de medicoes com Avatar 3D interativo
- Motor de calculos (formulas cientificas reais)
- Analise de simetria
- Relatorio animado com heatmap + metricas + insights
- Backend save (POST /api/body-composition)

### Session 7 (Avatar3D GLB Real - Prompt 5 Fix) - 09/Abr/2026
- Avatar3D.tsx reescrito para GLB real
- Heatmap keys corrigidos para PascalCase

### Session 8 (Auditoria + Fix Avatar3D - Prompt 6) - 15/Abr/2026
- **AUDITORIA DIAGNOSTICA COMPLETA** do pipeline de renderizacao 3D
  - Identificada causa raiz: incompatibilidade three@0.183 vs expo-three@8.0.0 (peer dep ^0.166)
  - Identificado erro silencioso: catch(e){} no require() do Avatar3D
  - Identificado @expo/browser-polyfill como NO-OP
  - Camera, iluminacao, centering, GLB validados como corretos
- **FIX DE DEPENDENCIAS**:
  - Downgrade three: 0.183 → 0.166.1 (alinhado com expo-three peer dep)
  - Downgrade @types/three: 0.183 → 0.166.0
- **SUBSTITUICAO DO GLB**:
  - Antigo: avatar.glb (2.9MB, 12 meshes genericas: HEAD, NECK, TORSO, etc.)
  - Novo: AVATAR DC ULTIMATE.glb (1.3MB, 10 meshes anatomicas diretas)
  - Meshes do novo modelo: BICEPS, TRICEPS, PEITORAL, AXILAR_MEDIA, ABDOMINAL, SUPRA_ILIACA, COXA, PANTURILHA, SUBESCAPULAR + corpo base
- **NOVO MAPEAMENTO 1:1**: Cada mesh mapeia diretamente a um SkinfoldSite
  - Elimina ambiguidade do modelo anterior (onde "Torso" mapeava 4 sites)
  - BODY_PARTS exportado com labels PT/EN
  - GLB_MESH_TO_SITE exportado para uso em outras telas
- **ERROR LOGGING**: console.error no catch do require() em measurement.tsx e report.tsx
- **FIX LAYOUT RESPONSIVO**: metricsGrid no report.tsx (justifyContent + width corrigidos)
- **LOGGING COMPLETO no Avatar3D**: GL context, GLB loading, mesh identification, tap events

## Fluxo Body Scan 3D (Completo)
```
[Aba Assessments] → Body Scan 3D →
  [body-scan.tsx] Config (altura/peso) → Iniciar Scanner → Scan camera → Resultados →
  "Usar Resultados" →
  [protocol-select.tsx] Selecionar protocolo + dados atleta →
  [measurement.tsx] Tocar avatar → inserir dobras (mm) → Calcular →
  [report.tsx] Classificacao + Heatmap + Metricas + Simetria + Insights → Salvar
```

## Backlog Priorizado

### P0 (Critico)
- Fix Durnin & Womersley NaN bug (Math.log10(0) quando soma = 0)

### P1 (Proximo)
- Testar renderizacao 3D em dispositivo nativo (EAS Build)
- Implementar interacao completa por partes anatomicas no Avatar3D
- Renomear "Simetria Lateral" → "Distribuicao Regional" (symmetryEngine + report)
- Adicionar eixo Z ao bodyMapping.ts (correcao de perspectiva)
- Vincular Body Scan (MediaPipe landmarks) ao modelo 3D do avatar
- Refatorar body-scan.tsx (760+ linhas)
- Nova UI para VBT e Jump Camera

### P2 (Futuro)
- Import PDF → CSV
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
