# Load Manager Pro - Product Requirements Document

## Problema Original
Aplicativo de gerenciamento de carga para treinadores esportivos com sistema de assinatura via RevenueCat.

## Requisitos Core

### 1. Sistema de Assinatura (RevenueCat)
- **3 estados**: `UNKNOWN`, `ACTIVE`, `INACTIVE`
- **Entitlement**: `pro`
- **Product ID**: `pro_mensal`
- **Trial**: 7 dias (configurado na App Store Connect)
- **Admin bypass**: `contato@loadmanagerpro.com.br` tem acesso PRO permanente

### 2. Exclusão de Conta
- Usuário pode solicitar exclusão em Perfil → Conta
- Se tem assinatura ativa: status `PENDING`, exclusão agendada para fim do período
- Se não tem assinatura: exclusão imediata
- Background job processa exclusões pendentes a cada hora
- Integração com RevenueCat API para deletar subscriber

### 3. Segurança
- `REVENUECAT_SECRET_KEY` em `backend/.env`
- Validação na inicialização do backend

## Implementado (Fev-Mar 2026)

### Fix: Gráficos DJ (Drop Jump) para Entrada Manual (06 Mar 2026)
- **Problema**: Gráficos de Fatigue Index, Fatigue Classification e RSI Evolution não apareciam para assessments DJ com entrada manual
- **Causa raiz**: Backend retorna `fatigue_analysis: null` para atletas com apenas dados DJ (sem CMJ). Frontend não tinha fallback.
- **Solução**: Adicionada função `calculateDjFatigue()` que calcula status de fadiga localmente a partir do histórico de RSI do DJ
- **Arquivos modificados**:
  - `frontend/app/athlete/[id]/jump-assessment.tsx` - Adicionada função `calculateDjFatigue()` (linhas 208-254) e modificado `FatigueStatusCard` para usar fallback
  - `frontend/components/JumpAnalysisCharts.tsx` - Já tinha `getDjFatigueStatus()` (linhas 201-240) e fallback de fatigue (linhas 287-305)
- **Comportamento agora**:
  - CMJ: Usa `fatigue_analysis` do backend (sem mudanças)
  - DJ: Calcula `fatigue_analysis` localmente quando backend retorna null
  - Cálculo usa mesma lógica: baseline RSI (5 primeiros entries), variação percentual, thresholds (-5%, -12%, -13%)
- **Testado**: ✅ Testing agent verificou 4/4 features para atleta Maria Santos (DJ-only)
  - Fatigue Index Card: ✅ Exibindo "Monitor Fatigue" (12.2%)
  - RSI Evolution Chart: ✅ Gráfico de linha com histórico
  - Power-Velocity Profile: ✅ Funcionando
  - Recommendations: ✅ Funcionando

### Fix: Jump Camera Crash - Phase Separation (06 Mar 2026)
- **Problema**: App crashava no iPhone ao clicar "Start Capture" na Jump Camera
- **Causa raiz**: O fluxo antigo tentava montar câmera, carregar MediaPipe e iniciar countdown tudo de uma vez
- **Solução**: Implementada separação de fases seguindo o padrão do VBT Camera:
  - **FASE 1 - Camera Preview**: Apenas abrir câmera e aguardar primeiro frame
  - **FASE 2 - Recording**: Iniciar countdown e captura SOMENTE após câmera pronta
- **Arquivos modificados**:
  - `frontend/app/athlete/[id]/jump-camera.tsx`:
    - Novo estado `uiPhase`: 'protocol' → 'cameraPreview' → 'recording' → 'results'
    - Novo estado `firstFrameReceived`: indica quando MediaPipe está realmente pronto
    - `handleStartCamera()`: agora vai para 'cameraPreview' apenas
    - `handleStartRecording()`: nova função que só funciona após `firstFrameReceived=true`
    - Botão "Start Recording" desabilitado até câmera estar pronta
    - Overlays de status: "Aguardando câmera..." / "Câmera pronta!"
- **Fluxo seguro implementado**:
  1. Usuário clica "Start Capture" → abre câmera
  2. Sistema aguarda câmera + MediaPipe inicializar
  3. Mostra "Câmera pronta!" + habilita botão "Start Recording"
  4. Usuário clica "Start Recording" → inicia countdown → captura
- **Testado**: ⏳ Pendente validação do usuário no TestFlight

### Jump Assessment via Camera (06 Mar 2026)
- **Tarefa**: Adicionar captura automática de métricas de salto via visão computacional
- **Funcionalidade**: Usa MediaPipe para detectar eventos de salto (decolagem, aterrissagem) automaticamente
- **Protocolos suportados**: CMJ, SL-CMJ (E/D), Drop Jump
- **Métricas extraídas**: Flight Time (ms), Contact Time (ms - apenas DJ), Jump Height (cm)
- **Fluxo de uso**:
  1. Seleção de protocolo e configuração
  2. Contagem regressiva (5s) com calibração de solo
  3. Detecção automática de perna ativa (SL-CMJ)
  4. Gravação do salto
  5. Análise de frames e extração de métricas
  6. Envio para pipeline existente (RSI, Potência, Z-Score calculados automaticamente)
- **Arquivos criados**:
  - `frontend/services/jump/types.ts` - Tipos e constantes
  - `frontend/services/jump/jumpDetector.ts` - Algoritmos de detecção
  - `frontend/services/jump/useJumpCamera.ts` - Hook React
  - `frontend/services/jump/index.ts` - Exports
  - `frontend/app/athlete/[id]/jump-camera.tsx` - Página principal
- **Arquivo modificado**:
  - `frontend/app/athlete/[id]/jump-assessment.tsx` - Adicionado botão "Jump Camera"
- **Restrições respeitadas**: ✅ 
  - Nenhum cálculo existente foi alterado (RSI, Fadiga, Z-Score, Assimetria)
  - Nenhum gráfico foi modificado
  - VBT Camera permanece inalterado
  - Entrada manual continua funcionando
- **Feature Premium**: Requer trial ou assinatura ativa
- **Testado**: ✅ Lint passed, Metro bundled successfully

### Team Dashboard Refactor (10 Mar 2026)
- **Tarefa**: Implementar ajustes específicos no Team Dashboard conforme requisitos do usuário
- **Implementações realizadas**:
  1. **Reordenação das seções**: "Status dos Atletas" agora aparece antes de "Alertas"
  2. **Correção do valor da métrica no card**: O valor exibido agora reflete corretamente a métrica selecionada no seletor global (Total Distance, HSR Z4, HID Z3, etc.)
  3. **Exibição de Monotonia e Strain**: Novos campos calculados no backend e exibidos nos cards dos atletas
  4. **Nova opção "Hoje" no seletor de datas**: Permite filtrar dados apenas do dia atual
  5. **Seletor de posições dinâmico**: Agora busca posições reais dos perfis dos atletas (CB, LB, RW, etc.) em vez de usar valores pré-definidos
  6. **Sincronização total dos filtros**: Todos os cards e dados respondem aos filtros de Métrica, Data, Atleta e Posição
  7. **Otimização de performance**: useMemo implementado para evitar recálculos desnecessários
- **Arquivos modificados**:
  - `backend/server.py`:
    - Adicionados campos `monotony`, `strain`, `metric_value` ao modelo `TeamDashboardAthlete`
    - Adicionado parâmetro `date_range` ao endpoint `/dashboard/team`
    - Implementado cálculo de Monotonia (mean/std_dev) e Strain (load * monotonia)
  - `frontend/app/(tabs)/team.tsx`:
    - Reordenada renderização das seções (Athletes Status → Alerts)
    - Substituída lista estática de posições por `dynamicPositions` memoizado
    - Query refetch quando `selectedDateRange` muda
    - Card do atleta usa `metric_value` do backend
- **Testado**: ✅ API testada via curl - campos retornando corretamente
- **Pendente**: Validação pelo usuário no app

### ACWR Metric Selector no Team Dashboard (06 Mar 2026)
- **Tarefa**: Permitir seleção de métrica GPS para cálculo de ACWR no Team Dashboard
- **Métricas suportadas**: Total Distance, HID Z3, HSR Z4, Sprint Z5, Sprint, ACC + DEC
- **Backend**: Parâmetro `acwr_metric` no endpoint `/dashboard/team`
- **Frontend**: Botão seletor + Modal na seção "Status dos Atletas"
- **Arquivos modificados**:
  - `backend/server.py` (linhas 7302-7520) - Lógica de cálculo ACWR parametrizada
  - `frontend/app/(tabs)/team.tsx` - Modal de seleção de métrica
- **Comportamento**: 
  - A métrica selecionada substitui `total_distance` no cálculo
  - Mesma lógica de rolling window (7 dias acute, 28 dias chronic)
  - Classificações de risco inalteradas (< 0.8 Low, 0.8-1.3 Optimal, 1.3-1.5 Moderate, > 1.5 High)
- **Testado**: ✅ Todas as 6 métricas funcionando via curl

### Bypass Limite de Dispositivos - Conta Demo (04 Mar 2026)
- **Tarefa**: Remover limite de dispositivos exclusivamente para conta demo
- **Email**: `contato@loadmanagerpro.com.br`
- **Arquivo modificado**: `backend/server.py` (linhas 598-607)
- **Implementação**: Condição `if user.get("email") == "contato@loadmanagerpro.com.br"` antes da validação de limite
- **Resultado**: Conta demo pode logar em dispositivos ilimitados; outras contas permanecem limitadas a 3
- **Testado**: ✅ 5 dispositivos para demo, 4º bloqueado para conta normal

### Bypass Limite de Dispositivos - Conta Demo (Mar 2026)
- **Tarefa**: Remover limite de dispositivos exclusivamente para conta demo
- **Email**: `contato@loadmanagerpro.com.br`
- **Arquivo modificado**: `backend/server.py` (linhas 598-607)
- **Implementação**: Condição `if user.get("email") == "contato@loadmanagerpro.com.br"` antes da validação de limite
- **Resultado**: Conta demo pode logar em dispositivos ilimitados; outras contas permanecem limitadas a 3

### Fix Team Dashboard - Médias de Wellness e Power (04 Mar 2026)
- **Problema**: Cards "Wellness Average" e "Power Average" mostravam 0 mesmo com dados preenchidos
- **Causa raiz Wellness**: Campo `wellness_score` não estava sendo calculado quando ausente
- **Causa raiz Power**: Código buscava apenas em `db.assessments`, mas dados estão em `db.jump_assessments`
- **Solução Wellness**: Adicionado cálculo automático de `wellness_score` baseado em campos individuais (fatigue, stress, mood, sleep_quality, muscle_soreness, hydration)
- **Solução Power**: Adicionada busca em `db.jump_assessments` como fonte alternativa para `peak_power_w`
- **Arquivo modificado**: `backend/server.py` (linhas 7517-7620)
- **Resultado**: Wellness Average agora calcula corretamente (5.3); Power Average retornará valor quando dados de potência existirem
- **Testado**: ✅ API testada com curl, Wellness Average funcionando

### Verificação de Seed Automático (04 Mar 2026)
- **Investigação**: Verificado se existia seed automático criando perfis demo (João Silva, Maria Santos, Pedro Costa)
- **Resultado**: **NÃO EXISTE** seed automático no código
- **Conclusão**: Perfis existentes foram criados manualmente ou em teste anterior, não são recriados a cada build
- **Arquivos verificados**: `backend/server.py` (startup event), busca em todo `/app/backend/`

### Fix Crítico: Crash macOS (Mar 2026)
- **Problema**: App crashava no macOS (Mac Catalyst) ao scrollar lista de atletas no Wellness form
- **Causa raiz**: `@react-native-picker/picker` incompatível com trackpad momentum scroll no Mac Catalyst (UIPickerView nativo)
- **Solução**: Substituição completa do `<Picker>` por Modal + FlatList
- **Arquivo modificado**: `frontend/app/athlete-wellness.tsx`
- **Resultado**: Seleção de atleta agora usa interface unificada (iPhone/iPad/Mac) sem componentes nativos problemáticos

### Sandbox Detection
- Avisos de expiração/renovação ocultos em ambiente Sandbox/TestFlight
- Usa `proEntitlement?.isSandbox === true || customerInfo?.isSandbox === true`
- Arquivos afetados:
  - `RevenueCatContext.tsx` (linha 545)
  - `SubscriptionGuard.tsx` (linha 53)
  - `subscription.tsx` (linha 162)
  - `account.tsx` (linha 32)

### Versão Destino
- `version`: 1.0.60
- `buildNumber`: 2 (iOS)
- `versionCode`: 53 (Android)

### Token App Review
- Token: `APPS26`
- Permanente, sem expiração, sem limite de uso
- Vinculado à conta: `contato@loadmanagerpro.com.br`

### Rolling Load Engine (EWMA-based ACWR) (09 Mar 2026)
- **Tarefa**: Implementar sistema de cálculo incremental de métricas de carga de treino
- **Problema resolvido**: ACWR calculado em tempo real era impreciso (sempre 4.0 quando treino concentrado em 7 dias)
- **Solução**: Engine que usa EWMA (Exponential Weighted Moving Average) para cálculos mais precisos
- **Métricas calculadas**:
  - EWMA Acute Load (7 dias equivalente, λ=0.25)
  - EWMA Chronic Load (28 dias equivalente, λ=0.069)
  - ACWR usando EWMA (mais responsivo que média simples)
  - Monotony (variação de carga semanal)
  - Strain (carga acumulada semanal × monotony)
  - Spike Detection (classificação de risco)
- **Métricas suportadas**: distance, HSR, sprint_distance, acc_dec_load
- **Arquivos criados**:
  - `backend/load_engine/load_metrics.py` - Tipos e constantes
  - `backend/load_engine/ewma_calculator.py` - Calculadora EWMA
  - `backend/load_engine/acwr_calculator.py` - Calculadora ACWR com zonas de risco
  - `backend/load_engine/spike_detector.py` - Detector de picos e monotony/strain
  - `backend/load_engine/rolling_load_engine.py` - Engine principal
  - `backend/load_engine/__init__.py` - Exports
  - `backend/tests/test_load_engine.py` - 27 testes unitários
- **Endpoints criados**:
  - `GET /api/load-metrics/{athlete_id}` - Métricas de um atleta
  - `POST /api/load-metrics/{athlete_id}/recalculate` - Recalcular métricas
  - `GET /api/load-metrics/team/latest` - Métricas da equipe toda
- **Integração**: Engine é chamado automaticamente quando GPS data é criado/importado
- **Database**: Nova coleção `athlete_load_metrics` com índices otimizados
- **Testado**: ✅ 27/27 testes unitários passando

## Backlog

### P0 - Crítico
- [ ] Testar Jump Camera no TestFlight (aguardando build)
- [ ] Verificar Login no TestFlight após build com Bundle ID correto

### P1 - Alta Prioridade
- [x] Team Dashboard Refactor - **IMPLEMENTADO** (10 Mar 2026)
- [ ] PDF Generation em "Análise Científica" - app congela/crasha
- [ ] Backend `/api/jump/assessment` - validação de peso do atleta
- [ ] Verificar Account Deletion flow end-to-end
- [ ] Verificar Subscription System refatorado

### P2 - Média Prioridade
- [x] ACWR Metric Selector no Dashboard - **IMPLEMENTADO** (06 Mar 2026)
- [x] Rolling Load Engine (EWMA-based ACWR) - **IMPLEMENTADO** (09 Mar 2026)
- [ ] VBT Rep Counting & Regressions
- [ ] Internacionalização de ScientificAnalysisTab.tsx

### P3 - Baixa Prioridade
- [ ] ESLint configuration para TypeScript
- [ ] Identity resolution para imports
- [ ] UI para resolução manual de nomes de atletas
- [ ] Merge de perfis duplicados de atletas
- [ ] Remover backup `ios_backup_before_removal/` após confirmar estabilidade

## Credenciais de Teste
- **Admin**: `contato@loadmanagerpro.com.br` / `#UAE2026`

## Arquitetura

```
/app
├── backend/
│   ├── .env (REVENUECAT_SECRET_KEY, MONGO_URL)
│   └── server.py (endpoints, background scheduler)
└── frontend/
    ├── app.json (version 1.0.52)
    ├── contexts/
    │   ├── AuthContext.tsx
    │   └── RevenueCatContext.tsx (3-state system)
    ├── components/
    │   ├── SubscriptionGuard.tsx
    │   └── SubscriptionModals.tsx
    ├── services/
    │   └── revenuecat.ts
    └── app/
        ├── subscription.tsx
        └── account.tsx
```
