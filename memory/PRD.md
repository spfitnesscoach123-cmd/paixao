# LoadManager Pro - PRD (Product Requirements Document)

## Informações Gerais
- **Nome do Produto**: LoadManager Pro
- **Versão**: 3.2
- **Data de Atualização**: 24 Fevereiro 2026

---

## Device Limit Enforcement - NOVO (24 Fevereiro 2026)

### Status: ✅ IMPLEMENTADO E TESTADO

Implementação de limite de dispositivos por conta (máximo 3 dispositivos simultâneos).

**Arquitetura implementada:**

1. **Backend** (`/app/backend/server.py`):
   - Modelos `UserLogin` e `UserRegister` agora aceitam `device_id`, `device_name`, `platform`
   - Campo `registered_devices: []` adicionado ao usuário
   - Lógica de verificação no endpoint `/auth/login`:
     - Device já existe → permite login, atualiza `last_login`
     - Device novo e < 3 dispositivos → adiciona device e permite login
     - Device novo e >= 3 dispositivos → retorna `DEVICE_LIMIT_REACHED` (HTTP 403)
   - Endpoints de gerenciamento:
     - `GET /api/auth/devices` - Lista dispositivos registrados
     - `DELETE /api/auth/devices/{device_id}` - Remove um dispositivo

2. **Frontend** (`/app/frontend/services/deviceId.ts`):
   - Serviço para obter/gerar ID único do dispositivo
   - Usa IDFV no iOS, Android ID no Android, UUID persistente como fallback
   - Funções: `getDeviceId()`, `getDeviceName()`, `getPlatform()`, `getDeviceInfo()`

3. **Frontend** (`/app/frontend/contexts/AuthContext.tsx`):
   - Login agora envia `device_id`, `device_name`, `platform`
   - Tratamento especial para erro `DEVICE_LIMIT_REACHED`

**Comportamento:**
- Cada conta pode ter máximo 3 dispositivos registrados
- Dispositivos já registrados continuam funcionando normalmente
- Tentativa de login de 4º dispositivo é bloqueada com HTTP 403
- Usuário pode remover dispositivos via API para liberar slots

**Constante configurável:** `MAX_DEVICES_PER_USER = 3`

---

## PRO Access Override - (24 Fevereiro 2026)

### Status: ✅ IMPLEMENTADO E TESTADO

Implementação de conta com acesso PRO permanente, sem depender de RevenueCat ou assinatura.

**Credenciais da Conta Override:**
- **Email**: `contato@loadmanagerpro.com.br`
- **Senha**: `#UAE2026`

**Arquitetura implementada:**
1. **Backend** (`/app/backend/server.py`):
   - Campo `pro_access_override: bool` adicionado ao modelo `UserResponse`
   - Endpoints `/auth/login`, `/auth/register` e `/auth/me` retornam o campo
   - Valor `true` indica acesso PRO permanente

2. **Frontend** (`/app/frontend/types/index.ts`):
   - Campo `pro_access_override?: boolean` adicionado à interface `User`

3. **RevenueCat Context** (`/app/frontend/contexts/RevenueCatContext.tsx`):
   - Verificação adicionada em `updateStatus()`: se `user?.pro_access_override === true`, define `isPro = true` imediatamente
   - Ignora verificação RevenueCat para usuários com override

**Comportamento:**
- Login com a conta override → `pro_access_override: true` retornado
- Frontend detecta o campo e concede acesso PRO instantâneo
- Nenhum modal de trial/assinatura é exibido
- Outros usuários continuam usando o fluxo normal do RevenueCat

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
