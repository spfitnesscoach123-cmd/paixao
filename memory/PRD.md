# LoadManager Pro - PRD (Product Requirements Document)

## Informações Gerais
- **Nome do Produto**: LoadManager Pro
- **Versão**: 3.0
- **Data de Atualização**: 21 Fevereiro 2026

---

## Sistema de Assinaturas - RECONSTRUÍDO (21 Fevereiro 2026)

### Status Atual: ✅ IMPLEMENTADO (Aguardando Teste em Device)

O sistema de assinaturas foi **completamente reescrito do zero** conforme solicitação do usuário.

**Arquitetura implementada:**
1. **RevenueCat Service** (`/app/frontend/services/revenuecat.ts`)
   - Inicialização do SDK com API Key: `appl_eIJnPUEMyRzosbpoDejVevXnbti`
   - Product ID: `pro_mensal`
   - Entitlement: `pro`
   - Trial de 7 dias via Apple (configurado no App Store Connect)
   - Renovação automática a cada 30 dias
   - Funções de compra, restauração e verificação de status

2. **RevenueCat Context** (`/app/frontend/contexts/RevenueCatContext.tsx`)
   - Provider que envolve toda a aplicação
   - Estados: isPro, isTrialing, daysRemaining, expirationDate
   - Flags de UI: shouldShowTrialPrompt, shouldShowRenewalWarning
   - Integração com AuthContext para vincular usuário
   - Listener de mudanças de status
   - Atualização automática ao voltar ao foreground

3. **PremiumGate Component** (`/app/frontend/components/PremiumGate.tsx`)
   - Bloqueia funcionalidades premium para não-assinantes
   - Mostra tela de upgrade com benefícios
   - Usado em: VBT Camera, e outras features premium

4. **Subscription Modals** (`/app/frontend/components/SubscriptionModals.tsx`)
   - `TrialRequiredModal`: Modal obrigatório para iniciar trial (7 dias grátis)
   - `RenewalWarningModal`: Aviso 3 dias antes da renovação
   - `SubscriptionExpiredModal`: Modal para assinatura expirada

5. **Subscription Guard** (`/app/frontend/components/SubscriptionGuard.tsx`)
   - Wrapper que exibe modais automaticamente
   - Controla exibição baseado em estado da assinatura

6. **Subscription Page** (`/app/frontend/app/subscription.tsx`)
   - UI completa com lista de funcionalidades
   - Botão "Iniciar 7 Dias Grátis" funcional
   - Botão "Restaurar Compras" funcional
   - Exibe status atual da assinatura
   - Preço: $39.99/mês

**Fluxo do Usuário:**
1. Ao baixar o app, coach deve ativar trial de 7 dias para usar funcionalidades
2. Durante trial: todas as funcionalidades desbloqueadas
3. Cancelamento durante trial: acesso até o fim dos 7 dias
4. Após trial: cobrança automática de $39.99/mês via Apple
5. 3 dias antes da renovação: pop-up de aviso
6. Assinatura expirada: pop-up solicitando renovação
7. Dados preservados mesmo após expiração

---

## Funcionalidades Implementadas

### 1. Autenticação e Usuários
- Login/Registro de coaches
- Gerenciamento de perfil
- Sessões persistentes
- Campo `role` adicionado (coach/athlete)

### 2. Gestão de Atletas
- CRUD completo de atletas
- Fotos de perfil
- Categorização por esporte/posição

### 3. Análise de Carga (ACWR)
- Cálculo automático de ACWR
- Visualização de tendências
- Alertas de fadiga

### 4. Análise VBT (Velocity Based Training) - PREMIUM
- Captura de vídeo via câmera
- Detecção de pose com MediaPipe
- Cálculo de velocidade e potência
- **Requer assinatura ativa**

### 5. Periodização - PREMIUM
- Criação de semanas de treino
- Planejamento de cargas
- Notificações de periodização

### 6. Importação de Dados GPS
- Upload de arquivos CSV
- Integração com Catapult

### 7. Análise Científica - PREMIUM
- Relatórios detalhados
- Exportação PDF (com bugs conhecidos)

### 8. Internacionalização
- Português (BR)
- Inglês (EN)

---

## Bugs Conhecidos

### P1 - Alta Prioridade
1. **PDF Export em Análise Científica** - Causa freeze/crash no app

### P2 - Média Prioridade
1. **Seletor ACWR no Dashboard** - Não implementado
2. **Internacionalização incompleta** - Alguns textos não traduzidos

---

## Próximas Tarefas

### Imediato
1. ✅ Reconstruir sistema de assinaturas do zero - CONCLUÍDO
2. Testar fluxo completo em device real com sandbox account

### Backlog
1. Corrigir exportação PDF em Análise Científica
2. Implementar seletor de métricas ACWR
3. Completar internacionalização
4. Testar pipeline `gps_import` com `identity_resolver`

---

## Arquivos Criados/Modificados

### Criados:
- `/app/frontend/components/SubscriptionModals.tsx`
- `/app/frontend/components/SubscriptionGuard.tsx`

### Reescritos:
- `/app/frontend/services/revenuecat.ts` - Serviço completo RevenueCat
- `/app/frontend/contexts/RevenueCatContext.tsx` - Context com estados e ações
- `/app/frontend/components/PremiumGate.tsx` - Gate funcional
- `/app/frontend/app/subscription.tsx` - Página de assinatura

### Modificados:
- `/app/frontend/app/_layout.tsx` - Adicionado SubscriptionGuard
- `/app/frontend/types/index.ts` - Adicionado campo `role` ao User
- `/app/backend/server.py` - Adicionado `role` ao UserResponse

---

## Credenciais de Teste
- **Coach**: coach_test@test.com / password
- **Sandbox Account**: support@loadmanagerpro.com.br (para TestFlight)

---

## Configuração RevenueCat
- **API Key iOS**: appl_eIJnPUEMyRzosbpoDejVevXnbti
- **Product ID**: pro_mensal
- **Entitlement ID**: pro
- **Trial**: 7 dias (configurado no App Store Connect)
- **Preço**: $39.99/mês
