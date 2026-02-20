# LoadManager Pro - PRD (Product Requirements Document)

## Informações Gerais
- **Nome do Produto**: LoadManager Pro
- **Versão**: 2.0
- **Data de Atualização**: Dezembro 2025

---

## Funcionalidades Implementadas

### Sistema de Assinaturas e Gates Premium ✅ (Dezembro 2025)

**Status: IMPLEMENTADO**

#### Componentes Criados:
1. **`/app/frontend/components/PremiumGate.tsx`** - Componente de gate para features premium
   - Verifica `isPro` (assinatura ativa)
   - Verifica `isTrialing` (trial ativo de 7 dias)
   - Verifica `expirationDate` (acesso até expiração mesmo após cancelamento)
   - Exibe tela de upgrade elegante quando bloqueado
   - Hook `usePremiumAccess()` para verificação programática
   - Função `checkPremiumAccess()` para verificação standalone

2. **`RevenueCatProvider` integrado em `_layout.tsx`**
   - Contexto global de assinatura
   - Listener para atualizações em tempo real

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

#### Regras de Acesso:
- **Trial 7 dias**: Acesso completo a todas as features
- **Assinatura ativa**: Acesso completo
- **Cancelado mas não expirado**: Acesso até `expirationDate`
- **Expirado/Nunca assinou**: Bloqueado com tela de upgrade

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
