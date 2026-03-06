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

## Backlog

### P1 - Alta Prioridade
- [ ] PDF Generation em "Análise Científica" - app congela/crasha
- [ ] Verificar Account Deletion flow end-to-end
- [ ] Verificar Subscription System refatorado

### P2 - Média Prioridade
- [x] ACWR Metric Selector no Dashboard - **IMPLEMENTADO** (06 Mar 2026)
- [ ] VBT Rep Counting & Regressions
- [ ] Internacionalização de ScientificAnalysisTab.tsx

### P3 - Baixa Prioridade
- [ ] ESLint configuration para TypeScript
- [ ] Identity resolution para imports
- [ ] UI para resolução manual de nomes de atletas
- [ ] Merge de perfis duplicados de atletas

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
