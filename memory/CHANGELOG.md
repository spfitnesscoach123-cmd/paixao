# LoadManager Pro - Changelog

## [Build 23] - 2025-12-XX

### Correção VBT Camera + Coach Marker Feature

#### Novos Recursos
- **Coach Marker na Tela**: O coach agora pode tocar diretamente na tela durante a fase de seleção de pontos para selecionar o keypoint mais próximo do toque
- **Visualização de Keypoints Detectados**: Durante a fase de seleção, os keypoints detectados pelo MediaPipe são exibidos visualmente na tela como pontos coloridos (verde = alta confiança, amarelo = média confiança)
- **Troca de Ponto Durante Sessão**: Possibilidade de trocar o ponto de tracking a qualquer momento antes de iniciar a gravação
- **Debug Visual**: Contador de keypoints detectados exibido na tela para diagnóstico

#### Correções
- **Stabilizing Detection Fix**: Corrigido o bug onde a câmera ficava travada em "Stabilizing Detection"
  - O callback `handleMediapipeLandmark` agora processa frames mesmo antes do tracking iniciar
  - Dados de pose são armazenados em `previewPoseData` para visualização durante seleção de pontos
- **Estado de Proteção**: Melhorado feedback visual dos 3 estados do sistema (noHuman, ready, executing)
- **Barra de Progresso**: Barra de estabilização funciona corretamente com porcentagem visual

#### Mudanças Técnicas
- Adicionado estado `detectedKeypoints` para armazenar posição de keypoints detectados
- Adicionado estado `coachMarkerPosition` para animação do marcador do coach
- Implementada função `handleScreenTapForMarker` para capturar toques e encontrar keypoint mais próximo
- Implementada função `handleChangeTrackingPoint` para permitir re-seleção
- Logs de debug `[VBTCamera]` adicionados para rastreamento de estado e keypoints

#### Arquivos Modificados
- `app/athlete/[id]/vbt-camera.tsx` - Refatoração completa da fase de seleção de pontos
- `app.json` - Build number incrementado para 23

---

## [Build 22] - 2025-12-XX

### Correção VBT Camera MediaPipe REAL
- Import corrigido: `RNMediapipe` (não `MediapipePoseView`)
- Callback corrigido: `onLandmark` (não `onPoseDetected`)
- Conversor de landmarks refatorado para suportar múltiplos formatos
- Auditoria de Location completa - `expo-location` removido

---

## [Build 21] - 2025-12-XX

### Preparação Build Final MediaPipe REAL
- Verificação de configurações: `newArchEnabled: true`, `jsEngine: "jsc"` (Hermes OFF)
- Execução de `npx expo prebuild --clean` - SUCESSO
- `useSimulation: false` ativado para plataformas nativas

---

## Builds Anteriores

Ver PRD.md para histórico completo de builds 1-20.
