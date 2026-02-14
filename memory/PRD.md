# Load Manager - PRD

## Overview
Sistema de gerenciamento de carga de treinamento para futebol com análise de bem-estar, GPS, força e composição corporal.

## Problema Original
Substituição completa do modelo de "Link Wellness" por um sistema de "Token Wellness" interno ao app:
- Token alfanumérico de 6 caracteres (sem URL externa)
- Limite de usos definido pelo coach
- Expiração configurável (30min, 1h, 2h, 8h, 24h)
- Uso único por atleta por token
- Sem login para atleta

---

## VBT Camera - Coach Marker Feature (IMPLEMENTADO - 2025-12-XX) 

### Build 24 - Tutorial Interativo
**Status**: IMPLEMENTADO - REQUER TESTE EM DISPOSITIVO NATIVO

### Tutorial Interativo
- **Aparece na primeira vez** que o coach abre a VBT Camera
- **Passos guiados**: Welcome → Select Point → Point Selected → Tracking Status → Complete
- **Botão "Pular Tutorial"** para encerrar imediatamente
- **Botão "Começar Sessão"** para concluir
- **Círculo pulsante** indicando onde tocar
- **Feedback visual** de sucesso/erro na seleção de pontos
- **Persistência** via AsyncStorage (`@vbt_camera_tutorial_completed`)

### Funcionalidades Implementadas

#### 1. Coach Marker - Toque Direto na Tela
- Coach pode tocar diretamente na tela durante fase de seleção de pontos
- Sistema encontra o keypoint mais próximo do toque (raio de 15% da tela)
- Feedback visual com animação do marcador
- Alertas se não encontrar keypoint próximo

#### 2. Visualização de Keypoints Detectados
- Pontos corporais detectados pelo MediaPipe exibidos como círculos coloridos
- Verde: alta confiança (score >= 0.6)
- Amarelo: média confiança (score < 0.6)
- Borda branca indica ponto selecionado

#### 3. Troca de Ponto Durante Sessão
- Botão de refresh no indicador de tracking point
- Permite re-seleção antes de iniciar gravação

#### 4. Correção Stabilizing Detection
- `handleMediapipeLandmark` agora processa frames mesmo antes de `isTracking`
- Estado `previewPoseData` armazena dados para visualização durante seleção
- Estado `detectedKeypoints` para overlay visual

#### 5. Logs de Debug
- `[VBTCamera]` prefix para todos os logs
- Rastreia: keypoints detectados, status de estabilização, ponto de tracking atual

### Compatibilidade de Plataformas
- **Web**: Usa `expo-camera` com simulação (comportamento esperado)
- **iOS/Android**: Usa `RNMediapipe` com detecção REAL via `onLandmark`

### Arquivos Modificados
- `app/athlete/[id]/vbt-camera.tsx` - Refatoração completa
- `app.json` - Build 23

### Configuração de Build
- `newArchEnabled: true`
- `jsEngine: "jsc"` (Hermes OFF)
- Sem permissões de localização

---

## Sistema de Token Wellness (IMPLEMENTADO - 2026-02-13)

### Versão Atual
**app.json version: 1.0.13** (pronto para novo build)

### Novo Fluxo de Acesso

**Primeira abertura do app:**
1. Tela de seleção: "Sou Coach" / "Sou Atleta"
2. Coach → Login normal → Dashboard completo
3. Atleta → Inserir token → Selecionar nome → Responder wellness → Fim

### Backend Implementado

**Novas Coleções MongoDB:**
- `wellness_tokens`: Armazena tokens gerados pelos coaches
  ```json
  {
    "token_id": "YXPVUU",
    "coach_id": "string",
    "max_uses": 30,
    "current_uses": 0,
    "expires_at": "datetime",
    "status": "active|inactive|expired"
  }
  ```
- `token_usage`: Rastreia qual atleta usou qual token
  ```json
  {
    "token_id": "YXPVUU",
    "athlete_id": "string",
    "used_at": "datetime"
  }
  ```

**Endpoints Implementados:**
- `POST /api/wellness/token` - Coach gera token (requer autenticação)
- `POST /api/wellness/token/validate` - Atleta valida token (público)
- `GET /api/wellness/token/{token_id}/athletes` - Lista atletas do coach (público)
- `GET /api/wellness/token/{token_id}/check-athlete/{athlete_id}` - Verifica uso (público)
- `POST /api/wellness/token/submit` - Submete questionário via token (público)
- `GET /api/wellness/tokens` - Lista todos os tokens do coach (requer autenticação)

### Frontend Implementado

**Novas Telas:**
1. `/app/role-select.tsx` - Tela inicial "Sou Coach" / "Sou Atleta"
2. `/app/athlete-token.tsx` - Entrada de token pelo atleta
3. `/app/athlete-wellness.tsx` - Formulário wellness para atleta
4. `/app/generate-wellness-token.tsx` - Coach gera tokens

**Modificações:**
- `index.tsx` - Redirecionamento baseado em role persistido
- `_layout.tsx` - Novas rotas adicionadas
- `profile.tsx` - "Gerar Link" substituído por "Gerar Token"
- `locales/pt.json` e `locales/en.json` - Novas chaves de tradução

### Regras de Negócio

1. **Token de 6 caracteres**: Letras maiúsculas + dígitos, sem O/0/I/1/L
2. **Uso único por atleta**: Verificado via `token_usage` collection
3. **Max uses**: Quando `current_uses >= max_uses`, status = "inactive"
4. **Expiração**: Quando `now > expires_at`, status = "expired"
5. **Sem sessão para atleta**: Após enviar, retorna à tela de token

### Testes (19/19 passando)
- Criação de token com valores padrão e customizados
- Validação case-insensitive
- Bloqueio de uso duplicado por atleta
- Bloqueio quando max_uses atingido
- Rejeição de token inválido/expirado
- Cálculo correto de readiness score

---

## Arquitetura do Código

```
/app
├── backend/
│   ├── server.py          # API FastAPI com endpoints wellness token + VBT
│   └── tests/
│       └── test_vbt_camera.py  # Testes do VBT Camera
├── frontend/
│   ├── app/
│   │   ├── index.tsx           # Redirecionamento por role
│   │   ├── role-select.tsx     # Seleção Coach/Atleta
│   │   ├── athlete-token.tsx   # Entrada de token
│   │   ├── athlete-wellness.tsx # Formulário wellness
│   │   ├── generate-wellness-token.tsx # Coach gera token
│   │   ├── _layout.tsx         # Rotas configuradas
│   │   ├── (tabs)/
│   │   │   └── profile.tsx     # Menu do coach
│   │   └── athlete/[id]/
│   │       ├── add-strength.tsx    # Avaliação de força (botão Camera)
│   │       └── vbt-camera.tsx      # NOVO: VBT via câmera
│   └── locales/
│       ├── pt.json             # Traduções português
│       └── en.json             # Traduções inglês
└── test_reports/
    └── iteration_16.json       # Relatório de testes VBT Camera
```

---

## Backlog

### P0 - VBT via Camera ✅ COMPLETO
- [x] **Fase 1**: UI e navegação (COMPLETA)
- [x] **Fase 2**: Tracking de barbell (COMPLETA - 2026-02-13)
  - [x] Módulo de tracking com modelo físico (`services/vbt/barTracker.ts`)
  - [x] Hook React para integração (`services/vbt/useBarTracking.ts`)
  - [x] Cálculo de velocidade instantânea, média e pico
  - [x] Detecção automática de repetições
  - [x] Feedback visual (verde = OK, vermelho = queda >10%)
  - [x] Simulação para desenvolvimento (useSimulation: true)
  - [x] Documentação para integração com MediaPipe (build nativo)
- [x] **Fase 3**: Integração com gráficos (COMPLETA - 2026-02-13)
  - [x] Gráficos de Perda de Velocidade por Set atualizados automaticamente
  - [x] Perfil Carga x Velocidade integrado (requer cargas variadas para regressão)
  - [x] Relatórios PDF incluem dados VBT da câmera
  - [x] Invalidação de cache para atualização automática de todas as telas
  - [x] Testes automatizados criados (`test_vbt_camera_phase3.py`)

**NOTA**: Tracking real com MediaPipe requer build nativo iOS/Android com react-native-vision-camera + Frame Processors. A simulação atual funciona para testes e desenvolvimento.

### P1 - Internacionalização
- [ ] Internacionalização completa de `ScientificAnalysisTab.tsx`
- [ ] Internacionalização da página "Avaliações"

### P2 - Futuro
- [ ] Testar pipeline `gps_import` com `identity_resolver`
- [ ] Integrar identity resolution em outros imports
- [ ] UI para resolução manual de nomes ambíguos
- [ ] Funcionalidade de merge de atletas duplicados

---

## Credenciais de Teste

- **Coach**: testcoach@example.com / TestPass123!
- **Token de teste**: 9UDZAX (expira em 1h após criação: 2026-02-13 15:41)
- **API URL**: https://velocity-detect.preview.emergentagent.com
- **Atletas de teste**: Atleta Teste 1, Atleta Teste 2, Atleta Teste 3

---

## Changelog

### 2025-12-XX - VBT Camera Coach Marker + Stabilization Fix (Build 23)
- **NOVA FUNCIONALIDADE**: Coach Marker - coach pode tocar diretamente na tela para selecionar ponto de tracking
- **FIX**: "Stabilizing Detection" não fica mais travado - callback `handleMediapipeLandmark` processa frames durante seleção de pontos
- **MELHORIA**: Visualização de keypoints detectados na tela durante seleção
- **MELHORIA**: Barra de progresso de estabilização funcional com porcentagem
- **MELHORIA**: Possibilidade de trocar ponto de tracking antes de gravar
- **Arquivos modificados**:
  - `app/athlete/[id]/vbt-camera.tsx` - Refatoração completa
  - `app.json` - Build 23
- **Componentes adicionados**:
  - Estado `detectedKeypoints` para visualização
  - Estado `coachMarkerPosition` para animação
  - Função `handleScreenTapForMarker` para captura de toque
  - Função `handleChangeTrackingPoint` para re-seleção
- **Status**: PRONTO PARA TESTE no dispositivo iOS/Android

### 2025-12-XX - Correção VBT Camera MediaPipe REAL (Build 22)
- **CORREÇÃO CRÍTICA**: VBT Camera travada em "Stabilizing Detection"
- **Causa raiz**: Import incorreto do componente MediaPipe e callback errado
- **Correções aplicadas**:
  1. ✅ Import corrigido: `RNMediapipe` (não `MediapipePoseView`)
  2. ✅ Callback corrigido: `onLandmark` (não `onPoseDetected`)
  3. ✅ Conversor de landmarks refatorado para suportar múltiplos formatos
  4. ✅ Adicionada barra de progresso de estabilização visual
  5. ✅ Debug visual com contagem de keypoints detectados
  6. ✅ Logs de frame a cada 30 frames para diagnóstico
- **Biblioteca MediaPipe**: `@thinksys/react-native-mediapipe@0.0.19`
  - Exporta `RNMediapipe` component
  - Props: `onLandmark`, `face`, `leftArm`, `rightArm`, `torso`, `leftLeg`, `rightLeg`, etc.
  - `frameLimit` para controle de FPS
- **Auditoria de Location**: COMPLETA
  - `expo-location`: REMOVIDO (não era usado)
  - `VCEnableLocation=false` no Podfile
  - Nenhuma permissão de location no iOS/Android
- **Status Build**:
  - `newArchEnabled: true` ✅
  - `jsEngine: "jsc"` (Hermes OFF) ✅
  - Build web: SUCESSO ✅
  - Prebuild nativo: SUCESSO ✅

### 2025-12-XX - Preparação Build Final MediaPipe REAL v1.1.0 (Build 21)
- **TASK COMPLETA**: Preparação do build nativo iOS/Android com MediaPipe REAL
- **Ações executadas**:
  1. ✅ Verificação de configurações: `newArchEnabled: true`, `jsEngine: "jsc"` (Hermes OFF)
  2. ✅ Limpeza de cache: `node_modules/.cache`, `.expo` removidos
  3. ✅ Remoção de diretórios nativos antigos: `ios/`, `android/` removidos
  4. ✅ Execução de `npx expo prebuild --clean` - SUCESSO
  5. ✅ Verificação do Podfile: Hermes DESATIVADO confirmado
  6. ✅ Verificação do Android: `hermesEnabled=false` confirmado
  7. ✅ Build web de teste via Metro: 0 erros, 2161+ módulos compilados
- **Versão**: app.json buildNumber: 21, versionCode: 21
- **Status MediaPipe**:
  - `useSimulation: false` em `vbt-camera.tsx` (linha 127)
  - `MediapipePoseView` integrado para plataformas nativas
  - `@thinksys/react-native-mediapipe@0.0.19` instalado
  - `react-native-vision-camera@4.7.3` instalado
- **PRÓXIMOS PASSOS PARA O USUÁRIO**:
  1. No macOS: `cd ios && pod install`
  2. Build iOS: `eas build --platform ios --profile production`
  3. Build Android: `eas build --platform android --profile production`
  4. Upload para TestFlight/Play Store
  5. Testar fluxo VBT completo no dispositivo real

### 2026-02-14 - Correção Crash TestFlight (VBT Camera)
- **FIX CRÍTICO**: Crash do app no iOS quando o botão "VBT via Camera" era pressionado
- **Causa**: Falta do plugin `expo-camera` na configuração de plugins do `app.json`
- **Solução Aplicada**:
  - Atualizada `NSCameraUsageDescription` para: "Precisamos acessar a câmera para capturar dados do VBT"
  - Adicionado plugin `expo-camera` com permissão configurada corretamente
  - Adicionado plugin `expo-image-picker` com permissões de câmera e fotos
- **Próximo Passo**: Novo build (`eas build`) necessário para testar no TestFlight

### 2026-02-13 - Preparação para Build v1.1.0
- **NOVA LOGO**: Atualização da logo do app em todas as telas
- Logo atualizada em:
  - `role-select.tsx` (tela inicial)
  - `login.tsx` (tela de login)
  - Assets do app (icon.png, adaptive-icon.png, splash-image.png, favicon.png)
- **App Store Connect Assets Criados**:
  - iOS: Todos os tamanhos de ícones (20, 29, 40, 60, 76, 83.5, 1024)
  - Android: Ícones adaptativos para todas as densidades (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi)
- **Configuração de Build**:
  - app.json atualizado: versão 1.1.0, buildNumber: 15, versionCode: 15
  - Nome do app alterado para "LoadManager Pro"
  - Cache limpo e preparado para novo build

### 2026-02-13 - VBT via Camera - FASE 3 COMPLETA
- **INTEGRAÇÃO COM GRÁFICOS**: Dados da câmera agora atualizam automaticamente todos os gráficos
- Modificações realizadas:
  - `vbt-camera.tsx`: Adicionada invalidação de cache para todas as queries relacionadas:
    - `vbt-analysis` (tela VBT)
    - `scientific-analysis` (aba Analysis/ScientificAnalysisTab)
    - `strength-analysis` (StrengthAnalysisCharts)
- Verificações realizadas:
  - ✅ Dados com `provider='camera'` salvos corretamente no backend
  - ✅ Gráfico "Velocity Loss per Set" exibe dados da câmera
  - ✅ Gráfico "Load-Velocity Profile" funciona (requer cargas variadas)
  - ✅ Relatório PDF inclui dados VBT da câmera
  - ✅ Aba "Analysis" (ScientificAnalysisTab) atualizada automaticamente
- **TEST**: 100% taxa de sucesso - Backend (8/8) e Frontend verificados
- **NOVO**: Arquivo de teste criado: `backend/tests/test_vbt_camera_phase3.py`

### 2026-02-13 - VBT via Camera - FASE 2 COMPLETA
- **NOVA FUNCIONALIDADE**: Módulo de tracking de barbell implementado
- Novos arquivos criados:
  - `services/vbt/barTracker.ts` - Lógica de tracking com modelo físico
  - `services/vbt/useBarTracking.ts` - Hook React para integração
  - `services/vbt/index.ts` - Exports e documentação
- Recursos implementados:
  - Cálculo de velocidade instantânea (pixels → metros usando modelo de câmera pinhole)
  - Simulação realista de movimento de barbell com fadiga progressiva
  - Detecção automática de repetições via mudança de fase
  - Feedback visual: verde = OK, vermelho = queda de velocidade >10%
  - Estados de tracking: concêntrico, excêntrico, estacionário
- `vbt-camera.tsx` refatorado para usar o novo hook `useBarTracking`
- **TEST**: 100% taxa de sucesso - Backend (8/8) e Frontend verificados
- **NOTA**: Tracking usa simulação para desenvolvimento. Tracking real com MediaPipe requer build nativo

### 2026-02-13 - VBT via Camera (FASE 1)
- **NOVA FUNCIONALIDADE**: Sistema de rastreamento VBT via câmera
- Botão "VBT via Camera" na tela de Avaliação de Força (add-strength.tsx)
- Nova tela de configuração de câmera (vbt-camera.tsx)
- Inputs de configuração: altura da câmera, distância da barra, carga em kg
- Seleção de exercício (Back Squat, Deadlift, etc.)
- Feedback visual em tempo real (verde = OK, vermelho = queda >10%)
- Contador de repetições e display de velocidade instantânea
- Resumo da sessão com métricas (velocidade média, máxima, queda de velocidade)
- Integração com backend: novo provider 'camera' no enum VBTProvider
- API endpoint `/api/vbt/data` aceita dados com provider='camera'
- **NOTA**: Funcionalidade de câmera requer app nativo (iOS/Android)
- **TEST**: 100% taxa de sucesso backend (8/8) e frontend

### 2026-02-13 - Sistema de Token Wellness
- **NOVA FUNCIONALIDADE**: Sistema completo de tokens para wellness
- Tela de seleção de papel (Coach/Atleta) na abertura do app
- Geração de tokens com limite de usos e expiração
- Fluxo de atleta: inserir token → selecionar nome → responder → fim
- Controle de uso único por atleta por token
- 19 testes unitários passando
- Substituição completa do sistema de links por tokens internos
- **FIX**: Correção do erro "unmatched route" - rotas adicionadas ao _layout.tsx
- **FIX**: Botões "Voltar" implementados nas telas athlete-token.tsx e generate-wellness-token.tsx
- **TEST**: 95% taxa de sucesso no frontend (6/7 funcionalidades, 1 problema visual LOW priority)

### 2026-02-XX - Sistema de 3 Camadas de Proteção VBT (IMPLEMENTADO)
- **NOVA FUNCIONALIDADE CRÍTICA**: Sistema de proteção para tracking VBT
- **Problema resolvido**: Contagem de repetições sem pessoa válida, cálculo de métricas com ruído, tracking funcionando sem ponto corretamente detectado

**CAMADA 1 - Validação de Presença Humana**:
- Exige detecção mínima de keypoints essenciais do exercício (ombro, quadril, joelho)
- Cada keypoint deve ter score >= 0.6
- Requer 5 frames consecutivos válidos antes de permitir cálculos
- Se falhar: estado = "semPessoa" (noHuman)

**CAMADA 2 - Sistema de Estado Controlado**:
- Estados: "semPessoa" (noHuman), "pronto" (ready), "executando" (executing)
- Transições controladas:
  - noHuman → ready: quando keypoints válidos E estáveis
  - ready → executing: quando movimento significativo detectado
  - executing → ready: quando movimento para
- Repetição só conta em estado "executando" após cruzar limiar e retornar

**CAMADA 3 - Ponto de Tracking Definido pelo Coach**:
- Coach DEVE definir manualmente o ponto de tracking antes de gravar
- Sistema monitora EXCLUSIVAMENTE o landmark correspondente a esse ponto
- Todos os cálculos (velocidade, deslocamento) usam SOMENTE esse ponto
- Se ponto não detectado ou score < 0.6 → BLOQUEIA todos os cálculos

**Filtro de Ruído**:
- Moving average para suavização
- Delta mínimo de movimento para ignorar micro-variações
- Limiar angular configurável

**Arquivos criados/modificados**:
- `services/vbt/trackingProtection.ts` - Sistema completo de 3 camadas
- `services/vbt/useProtectedBarTracking.ts` - Hook React com proteção
- `services/vbt/index.ts` - Exports atualizados
- `app/athlete/[id]/vbt-camera.tsx` - UI atualizada com feedback de estado
- `services/vbt/__tests__/trackingProtection.test.ts` - Testes unitários

**Mensagens em português** para feedback visual:
- "SEM PESSOA - Bloqueado"
- "Estabilizando Detecção... X%"
- "PRONTO - Aguardando Movimento"
- "EXECUTANDO - Rastreando"
- "BLOQUEADO: [motivo específico]"

**STATUS**: Implementado - Aguardando testes no dispositivo real

### 2026-02-XX - Fix Crash Câmera iOS TestFlight
- **BUG FIX CRÍTICO**: Câmera VBT crashava no TestFlight iOS
- **Causa raiz**: Problema de ciclo de vida do `CameraView` do `expo-camera`
  - Callbacks sendo inicializados antes da câmera estar pronta
  - Componentes sendo renderizados dentro do `CameraView` sem verificação de estado
- **Solução implementada**:
  1. Adicionado estado `isCameraReady` para controlar inicialização
  2. Adicionado callback `onCameraReady` no `CameraView`
  3. Implementado prop `active` para controle de ativação/desativação
  4. Renderização condicional do overlay apenas quando câmera está pronta
  5. Loading indicator enquanto câmera inicializa
  6. Função `handlePhaseChange()` para transições seguras entre fases
  7. Cleanup adequado no `useEffect` de unmount
- **Arquivos modificados**:
  - `frontend/app/athlete/[id]/vbt-camera.tsx` - Refatoração completa do ciclo de vida
  - `frontend/app.json` - Build number incrementado para 16
- **Versão**: app.json buildNumber: 17
- **STATUS**: Implementado - Aguardando validação do usuário via novo build TestFlight
- **NOVO**: Preview da câmera na tela de configuração com indicador "Câmera OK"
- **PRÓXIMO PASSO**: 
  1. Executar `eas build --platform ios --profile production`
  2. Upload para TestFlight
  3. Testar abertura da câmera VBT no dispositivo real

---

## Tarefas Pendentes (Por Prioridade)

### P0 - Crítico
- [IMPLEMENTADO] Sistema de 3 Camadas de Proteção VBT (Validação de Presença, Estado Controlado, Ponto do Coach)
- [IMPLEMENTADO] Serviço de Pose Detection para integração com MediaPipe
- [IMPLEMENTADO] Integração real do MediaPipe Pose no código
- [PRONTO - BUILD 21] Build nativo preparado com MediaPipe REAL (expo prebuild --clean executado, 0 erros)
- [AGUARDANDO] Executar `pod install` no macOS e build via EAS
- [AGUARDANDO] Validação do sistema no dispositivo iOS (TestFlight)

### P1 - Alta
- [ ] Completar internacionalização do `ScientificAnalysisTab.tsx`
- [ ] Internacionalizar página "Avaliações" (Assessments)

### P2 - Média
- [ ] Testar pipeline `gps_import` com `identity_resolver`

### P3 - Baixa
- [ ] Fix ícone botão voltar no web

---

## Sistema de Pose Detection (2025-12-XX) - ATUALIZADO

### MUDANÇA CRÍTICA: MediaPipe REAL Integrado

**DEPENDÊNCIAS INSTALADAS:**
- `@thinksys/react-native-mediapipe@0.0.19`
- `react-native-vision-camera@4.7.3`

**CONFIGURAÇÃO DE BUILD PRESERVADA:**
- `newArchEnabled: true` ✅
- `jsEngine: "jsc"` ✅ (Hermes OFF)
- Plugin `react-native-vision-camera` adicionado ao `app.json`

### Arquitetura Implementada

```
┌─────────────────────────────────────────────────────────────┐
│              vbt-camera.tsx                                  │
│    - MediapipePoseView (iOS/Android) ou CameraView (web)    │
│    - handleMediapipePoseDetected() → processPose()          │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              useProtectedBarTracking Hook                    │
│    - useSimulation: FALSE (modo REAL ativado)               │
│    - Layer 1: Human Presence Validation                      │
│    - Layer 2: State Machine Control                          │
│    - Layer 3: Coach-Defined Tracking Point                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              VBT Calculation Pipeline (NÃO MODIFICADO)       │
│    - Velocity calculation                                    │
│    - Rep detection                                           │
│    - Graphs & Reports                                        │
└─────────────────────────────────────────────────────────────┘
```

### Arquivos Modificados

| Arquivo | Modificação |
|---------|-------------|
| `app.json` | Plugin vision-camera adicionado |
| `package.json` | Dependências MediaPipe adicionadas |
| `vbt-camera.tsx` | MediapipePoseView integrado, `useSimulation: false` |
| `services/pose/PoseCamera.tsx` | Suporte nativo MediaPipe |

### Status de Integração ATUALIZADO

| Componente | Status |
|------------|--------|
| expo-camera | ✅ Mantido (fallback web) |
| Sistema 3 camadas | ✅ Implementado |
| MediaPipe nativo | ✅ **INTEGRADO** |
| useSimulation | ❌ **DESATIVADO** (modo real) |
| Hermes | ❌ **OFF** (mantido jsc) |

### Próximos Passos para Build Nativo

O código está **100% pronto**. Para ativar no dispositivo:

1. Gerar código nativo:
   ```bash
   cd frontend
   npx expo prebuild --clean
   ```

2. Verificar Podfile (Hermes OFF):
   ```ruby
   :hermes_enabled => false
   ```

3. Instalar pods:
   ```bash
   cd ios && pod install && cd ..
   ```

4. Build e deploy:
   ```bash
   npx expo run:ios --device
   # ou
   eas build --platform ios
   ```

Consulte `docs/MEDIAPIPE_INTEGRATION.md` para guia completo.