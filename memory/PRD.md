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
│   │   ├── Avatar3D.tsx (Three.js modelo 3D)
│   │   ├── MeasurementInputModal.tsx
│   │   ├── CameraScanner.tsx
│   │   └── ScannerOverlay.tsx
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
- **Selecao de protocolo** (protocol-select.tsx): 5 protocolos cientificos
  - Jackson & Pollock 3 Dobras
  - Jackson & Pollock 7 Dobras
  - Durnin & Womersley (4 sites)
  - Faulkner (4 sites)
  - Guedes 1985 (3 sites)
- **Tela de medicoes** (measurement.tsx): Avatar interativo com pontos por protocolo
  - Avatar3D (Three.js) no mobile, SVG fallback no web
  - Modal de input por site (mm)
  - Validacao: so permite calculo com todos os sites preenchidos
  - Mapeamento mesh 3D → sites de dobras cutaneas
- **Motor de calculos** (protocolEngine.ts): Formulas cientificas reais
  - Densidade corporal (Siri equation)
  - Body fat %, massa gorda, massa magra, agua, osso, IMC
  - Classificacao (Essential/Athletic/Fitness/Average/Obese)
- **Analise de simetria** (symmetryEngine.ts): Lateral e vertical + insights
- **Relatorio animado** (report.tsx):
  - Avatar SVG com heatmap (verde/amarelo/vermelho)
  - Avatar3D com autoRotate + heatmap no mobile
  - Grid de metricas (6 cards)
  - Simetria e insights automaticos em PT/EN
  - Save no backend (POST /api/body-composition)
- **Backend**: Adicionados JP3 e D&W ao enum + funcoes de calculo
- **Navegacao**: Body Scan 3D → scan → "Usar Resultados" → protocol-select → measurement → report
- **Limpeza**: Removida tela legada add-body-composition.tsx

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
- Nenhum item critico pendente

### P1 (Proximo)
- Vincular Body Scan (MediaPipe landmarks) ao modelo 3D do avatar
- Nova UI para VBT e Jump Camera
- Redesign navegacao "Activity Hub"

### P2 (Futuro)
- Import PDF → CSV
- Export CSV
- CMJ perspective bug fix (foot selection + hip validation) - PARKED

### P3 (Backlog)
- Merge de perfis duplicados
- i18n completa (ScientificAnalysisTab, Assessments)
- Refactoring trackingProtection.ts (legacy VBT)

## Credenciais de Teste
- Email: contato@loadmanagerpro.com.br
- Password: #UAE2026

## Integracoes
- MediaPipeTasksVision (Native SDK)
- Three.js / Expo-GL / Expo-Three
- RevenueCat (subscricoes)
