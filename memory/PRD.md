# LoadManager Pro - PRD (Product Requirements Document)

## Informações Gerais
- **Nome do Produto**: LoadManager Pro
- **Versão**: 2.2
- **Data de Atualização**: 21 Fevereiro 2026

---

## Mudança Importante - Sistema de Assinaturas

### ⚠️ SISTEMA DE ASSINATURAS REMOVIDO (21 Fevereiro 2026)

O sistema de assinaturas foi **completamente removido** para reconstrução do zero.

**Status atual:**
- ✅ Todas as features estão **liberadas** (sem bloqueio)
- ✅ PremiumGate é um **passthrough** (não bloqueia nada)
- ✅ Página de assinatura existe mas está **vazia**
- ✅ App funciona como versão sem monetização
- ❌ RevenueCat SDK **não inicializa** (código desativado)
- ❌ Nenhuma compra in-app disponível

**Arquivos modificados:**
1. `/app/frontend/components/PremiumGate.tsx` - Passthrough (sempre libera)
2. `/app/frontend/contexts/RevenueCatContext.tsx` - Stub (não faz nada)
3. `/app/frontend/services/revenuecat.ts` - Constantes vazias
4. `/app/frontend/app/subscription.tsx` - Página vazia
5. `/app/frontend/.env` - Removida chave RevenueCat
6. `/app/frontend/eas.json` - Removidas variáveis de ambiente

**Para reconstruir o sistema:**
1. Implementar nova integração com RevenueCat
2. Configurar produtos no App Store Connect
3. Vincular produtos aos entitlements no RevenueCat
4. Implementar lógica de verificação de acesso
5. Atualizar PremiumGate para bloquear features
6. Testar fluxo completo em Sandbox

---

## Funcionalidades Implementadas

### 1. Autenticação e Usuários
- Login/Registro de coaches
- Gerenciamento de perfil
- Sessões persistentes

### 2. Gestão de Atletas
- CRUD completo de atletas
- Fotos de perfil
- Categorização por esporte/posição

### 3. Análise de Carga (ACWR)
- Cálculo automático de ACWR
- Visualização de tendências
- Alertas de fadiga

### 4. Análise VBT (Velocity Based Training)
- Captura de vídeo via câmera
- Detecção de pose com MediaPipe
- Cálculo de velocidade e potência

### 5. Periodização
- Criação de semanas de treino
- Planejamento de cargas
- Notificações de periodização

### 6. Importação de Dados GPS
- Upload de arquivos CSV
- Integração com Catapult

### 7. Análise Científica
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
1. Resolver problema de certificados iOS (Provisioning Profile)
2. Reconstruir sistema de assinaturas do zero

### Backlog
1. Corrigir exportação PDF em Análise Científica
2. Implementar seletor de métricas ACWR
3. Completar internacionalização

---

## Credenciais de Teste
- **Coach**: coach_test@test.com / password
