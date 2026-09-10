# LoadManager Pro - Changelog

## [Build 24] - 2025-12-XX

### Tutorial Interativo - Coach Marker

#### Novos Recursos
- **Tutorial na Primeira Utilização**: Modal overlay que aparece apenas na primeira vez que o coach abre a VBT Camera
- **6 Passos Guiados**:
  1. **Welcome**: Mensagem de boas-vindas com círculo pulsante animado indicando onde tocar
  2. **Select Point**: Instrução para selecionar ponto na tela
  3. **Point Selected**: Feedback visual de confirmação com animação
  4. **Tracking Status**: Explicação da barra de estabilização e botão "Trocar ponto"
  5. **Complete**: Mensagem de encerramento
- **Botão "Pular Tutorial"**: Disponível no canto superior direito para encerrar imediatamente
- **Botão "Começar Sessão"**: Para concluir o tutorial e iniciar a sessão VBT

#### Feedback Visual de Seleção
- **Sucesso**: Caixa verde com mensagem "Ponto selecionado!" na posição do toque
- **Erro**: Caixa vermelha com mensagem informando proximidade necessária a articulação
- **Animação Fade**: Feedback desaparece automaticamente após 2 segundos

#### Mudanças Técnicas
- Uso de `AsyncStorage` para persistir estado do tutorial (key: `@vbt_camera_tutorial_completed`)
- Estados: `showTutorial`, `tutorialStep`, `selectionFeedback`
- Animações: `pulseAnim` (círculo pulsante), `fadeAnim` (overlay), `feedbackFadeAnim` (feedback)
- Integração com `handleScreenTapForMarker` para avançar tutorial automaticamente

#### Arquivos Modificados
- `app/athlete/[id]/vbt-camera.tsx` - Tutorial interativo completo
- `app.json` - Build 24

---

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
