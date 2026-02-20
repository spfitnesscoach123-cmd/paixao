# LoadManager Pro - PRD (Product Requirements Document)

## Informações Gerais
- **Nome do Produto**: LoadManager Pro
- **Versão**: 2.1
- **Data de Atualização**: Fevereiro 2026

---

## Funcionalidades Implementadas

### Sistema de Assinaturas Premium - CORRIGIDO ✅ (Fevereiro 2026)

**Status: IMPLEMENTADO E CORRIGIDO**

#### CORREÇÃO CRÍTICA: Entitlement ID

**Problema encontrado:** O código estava usando `"premium"` como identificador do entitlement, mas no RevenueCat o entitlement configurado é `"pro"`.

**Correção aplicada:**
```javascript
// ANTES (incorreto):
PREMIUM_ENTITLEMENT_ID: 'premium'
entitlements.all["premium"]

// DEPOIS (correto):
PRO_ENTITLEMENT_ID: 'pro'
entitlements.all["pro"]
```

#### FONTE ÚNICA DA VERDADE: `expirationDate`

A verificação de acesso premium agora usa **EXCLUSIVAMENTE** a `expirationDate` do entitlement "pro".

**Regra implementada:**
```javascript
isPro = expirationDate > now
```

**O que NÃO é mais usado:**
- ❌ `entitlements.active`
- ❌ `isActive`
- ❌ `isTrial`
- ❌ `isSubscribed`
- ❌ `isCancelled`
- ❌ Cache local/AsyncStorage como fonte de verdade

#### Arquivos Modificados:
1. **`/app/frontend/services/revenuecat.ts`**
   - `PREMIUM_ENTITLEMENT_ID: 'premium'` (era 'pro')
   - `getPremiumEntitlement()` - Busca de `entitlements.all` (não `.active`)
   - `checkPremiumAccessFromInfo()` - Verifica apenas `expirationDate > now`
   - `getSubscriptionExpirationDate()` - Obtém data de expiração

2. **`/app/frontend/contexts/RevenueCatContext.tsx`**
   - Novo state `isPremium` como fonte única de verdade
   - `checkPremiumAccess()` - Função global que sempre busca do RevenueCat
   - Verificação ao abrir o app (`useEffect` inicial)
   - Verificação imediata após compra/trial (`purchasePackage`)
   - Verificação imediata após restore (`restorePurchases`)
   - Listener atualiza `isPremium` automaticamente

3. **`/app/frontend/components/PremiumGate.tsx`**
   - Usa apenas `isPremium` do contexto
   - `usePremiumAccess()` hook simplificado

#### Comportamento Obrigatório:
| Situação | Acesso |
|----------|--------|
| Trial ativo | ✅ Liberado |
| Trial cancelado mas dentro do período | ✅ Liberado |
| Assinatura ativa | ✅ Liberado |
| Assinatura cancelada mas dentro do período | ✅ Liberado |
| expirationDate < now | ❌ Bloqueado |

#### Quando é verificado:
1. ✅ Ao abrir o app (useEffect inicial)
2. ✅ Imediatamente após iniciar trial
3. ✅ Imediatamente após compra
4. ✅ Imediatamente após restore
5. ✅ Via listener de customerInfo updates

---

### Sistema de Gates Premium ✅ (Dezembro 2025)

**Status: IMPLEMENTADO**

#### Features Protegidas por Premium Gate:
| Feature | Arquivo | Status |
|---------|---------|--------|
| VBT Camera | `/app/frontend/app/athlete/[id]/vbt-camera.tsx` | ✅ Protegido |
| VBT Data | `/app/frontend/app/athlete/[id]/vbt.tsx` | ✅ Protegido |
| Jump Assessment | `/app/frontend/app/athlete/[id]/jump-assessment.tsx` | ✅ Protegido |
| Add GPS | `/app/frontend/app/athlete/[id]/add-gps.tsx` | ✅ Protegido |
| Upload GPS | `/app/frontend/app/athlete/[id]/upload-gps.tsx` | ✅ Protegido |
| Periodization Create | `/app/frontend/app/periodization/create.tsx` | ✅ Protegido |
| Periodization Detail | `/app/frontend/app/periodization/[id].tsx` | ✅ Protegido |

---

### FatigueVisualOverlay - VBT ✅ (Dezembro 2025)

**Status: IMPLEMENTADO**

**Arquivo**: `/app/frontend/components/vbt/FatigueVisualOverlay.tsx`

**Funcionalidades**:
1. **Transição Gradual de Cor** - Interpolação linear entre:
   - 0% → Verde `#00C853`
   - 15% → Laranja `#FF6D00`
   - 30%+ → Vermelho `#D50000`

2. **Animação Fade Suave** - 300ms ease-out

3. **Indicador de Tendência** - `↓ ↑ →` baseado em mudança de valor

4. **Indicador Percentual** - Exibe `-X%` em tempo real

5. **Modo Elite** - Pulso sutil quando `velocityDropPercent > 25%`

---

### ACWR (Acute:Chronic Workload Ratio) ✅

**Status: IMPLEMENTADO (Backend)**

- Cálculo correto com rolling window
- Suporte a múltiplas métricas (Total Distance, HID Z3, HSR Z4, etc.)

**Pendente**: Frontend UI para seletor de métricas no dashboard

---

### Periodização ✅

**Status: IMPLEMENTADO**

- Criação de semanas com prescrições diárias
- Tabela unificada dinâmica
- Exportação PDF funcional
- Cálculo de multiplicadores semanais

---

### GPS Data ✅

**Status: IMPLEMENTADO**

- Upload CSV Catapult
- Entrada manual de dados
- Integração com periodização
- Atualização de peak values do atleta

---

## Backlog (Próximas Tarefas)

### P0 - Crítico
- [ ] Corrigir PDF em "Análise Científica" (bug recorrente)

### P1 - Alta Prioridade
- [ ] Seletor de métricas ACWR no Dashboard (frontend)
- [ ] Internacionalização completa das páginas

### P2 - Média Prioridade
- [ ] Testar pipeline `gps_import` com `identity_resolver`
- [ ] Integrar identity resolution em `force_import` e `wellness_import`
- [ ] UI para resolução manual de nomes ambíguos
- [ ] Feature para merge de perfis duplicados

### P3 - Baixa Prioridade
- [ ] Resolver EAS Project Slug Conflict (`real-time-vbt` vs. `loadmanager-pro-vbt`)

---

## Arquitetura

### Frontend (React Native / Expo)
```
/app/frontend/
├── app/                          # Expo Router pages
│   ├── _layout.tsx              # Root layout com providers
│   ├── (tabs)/                  # Tab navigation
│   ├── athlete/[id]/            # Athlete pages
│   │   ├── vbt-camera.tsx       # VBT via câmera (Premium)
│   │   ├── vbt.tsx              # VBT data (Premium)
│   │   ├── jump-assessment.tsx  # Avaliação saltos (Premium)
│   │   ├── add-gps.tsx          # GPS manual (Premium)
│   │   └── upload-gps.tsx       # Upload CSV (Premium)
│   ├── periodization/           # Periodização (Premium)
│   └── subscription.tsx         # Página de assinatura
├── components/
│   ├── PremiumGate.tsx          # Gate de acesso premium
│   └── vbt/
│       └── FatigueVisualOverlay.tsx # Overlay de fadiga
├── contexts/
│   ├── RevenueCatContext.tsx    # Contexto de assinatura
│   └── ...
└── services/
    └── revenuecat.ts            # Helpers RevenueCat
```

### Backend (FastAPI)
```
/app/backend/
├── server.py                    # Main server
│   ├── /api/subscription/*      # Endpoints de assinatura
│   ├── /api/webhooks/revenuecat # Webhook RevenueCat
│   ├── /api/vbt/*               # VBT endpoints
│   ├── /api/gps-data/*          # GPS endpoints
│   └── /api/periodization/*     # Periodização endpoints
└── models.py                    # Data models
```

---

## Credenciais de Teste

- **Coach**: `coach_test@test.com` / `password`

---

## Integrações

- **RevenueCat**: Gerenciamento de assinaturas iOS/Android
- **expo-print**: Geração de PDFs
- **expo-sharing**: Compartilhamento de arquivos
- **expo-camera**: Câmera VBT
- **react-native-vision-camera**: Processamento de vídeo
- **@thinksys/react-native-mediapipe**: Pose detection

---

*Última atualização: Dezembro 2025*
