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
- [ ] ACWR Metric Selector no Dashboard
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
