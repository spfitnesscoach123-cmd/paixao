# PRD - Load Manager - Athlete Performance Tracking

## Original Problem Statement
Sistema de rastreamento de desempenho de atletas com avaliações físicas, composição corporal, integração com wearables e sistemas VBT.

## Current Architecture
- **Backend**: FastAPI (Python) + MongoDB
- **Frontend**: React Native (Expo) + TypeScript
- **AI Integration**: OpenAI via Emergent LLM Key

## What's Been Implemented

### ✅ Core Features
- User authentication (login/register)
- Athlete CRUD operations
- GPS data tracking with filters
- Wellness questionnaires + QTR gauge
- **NEW: Jump Assessment System** (replaced traditional strength)
- Team dashboard with comprehensive metrics
- i18n support (PT/EN)

### ✅ Jump Assessment System (Dez 9, 2025)
**Substituição completa do módulo de força tradicional:**

**Protocolos:**
- CMJ (Counter Movement Jump)
- SL-CMJ Right/Left (Single Leg)
- DJ (Drop Jump) com altura da caixa

**Métricas Calculadas Automaticamente:**
| Métrica | Fórmula |
|---------|---------|
| RSI | Altura / Tempo de Contato |
| Pico de Potência | Sayers Equation |
| Pico de Velocidade | √(2×g×h) |
| Potência Relativa | Potência / Peso |
| Z-Score | (Atual - Média) / Desvio Padrão |

**Índice de Fadiga (SNC):**
| Variação RSI | Status |
|--------------|--------|
| 0 a -5% | 🟢 Treino Normal |
| -6% a -12% | 🟡 Monitorar |
| < -13% | 🔴 Alto Risco |

**Assimetria (SL-CMJ):**
- Diferença >10% = RED FLAG
- Feedback automático com recomendações

**Componentes:**
- `JumpAnalysisCharts.tsx` - Visualização na página do atleta
- `jump-assessment.tsx` - Página de entrada de dados
- Backend endpoints: `/api/jump/*`
- Seção completa no relatório PDF

### ✅ ACWR Classification System (Feb 7, 2026)
| Range | Classification | Status |
|-------|----------------|--------|
| <0.8 | Losing Performance | Undertrained |
| 0.8-1.3 | Sweet Spot | Optimal |
| 1.3-1.5 | Caution Zone | Warning |
| >1.5 | High Risk | Overtrained |

**Components:**
- `ACWRBadge.tsx` - Visual badge with color coding
- `ACWRLegend.tsx` - Legend explaining ranges
- `getACWRClassification()` - Helper function

### ✅ Export Buttons PDF/CSV (Feb 7, 2026)
**Component:** `ExportButtons.tsx`
- CSV export (All data, GPS, Wellness, Strength)
- PDF report export
- Body Composition PDF report
- Located on athlete detail page (Info tab)

### ✅ Wellness Link Duration Options (Feb 7, 2026)
**Updated Options:**
- 30 minutes
- 2 hours
- 8 hours
- 24 hours (default)

**Backend:** `/api/wellness/generate-link?expires_hours=X`

### ✅ Subscription Plans Updated (Feb 7, 2026)

| Feature | Essencial | Profissional | Elite |
|---------|-----------|--------------|-------|
| **Max Athletes** | **20** | 50 | Ilimitado |
| **Price BRL** | R$ 39,90 | R$ 89,90 | R$ 159,90 |
| VBT Analysis | ❌ | ✅ | ✅ |
| Body Composition | ❌ | ✅ | ✅ |
| 3D Body Model | ❌ | ❌ | ✅ |
| Fatigue Alerts | ❌ | ✅ | ✅ |
| Export PDF/CSV | ❌ | ✅ | ✅ |
| AI Insights | ❌ | ❌ | ✅ |
| Multi-user | ❌ | ❌ | ✅ (2) |

### ✅ VBT Integration
- Integrated into Strength page with tabs
- Load-Velocity Profile chart
- Velocity Loss chart with 30% fatigue threshold
- Device providers with input methods

### ✅ Body Composition
- 4 scientific protocols (Guedes, Pollock 7/9, Faulkner)
- Dynamic form fields
- 3D body model visualization (Elite only)

### ✅ Team Dashboard
- 6 stat cards (ACWR, Wellness, Fatigue, Power, Body Fat, Sessions)
- ACWR Legend with classification
- Risk distribution chart
- Athlete list with ACWR badges
- Position group averages section

### ✅ Bug Fixes (Feb 7, 2026 - Latest Session)

| Issue | Fix | Status |
|-------|-----|--------|
| Dashboard session count incorrect | Changed to count unique sessions by `date + session_name` | ✅ Fixed |
| Position groups showing individuals | Implemented GROUP AVERAGES for each position | ✅ Fixed |
| Training zones using heart rate | Already using velocity-based zones (% Vmax) | ✅ Verified |
| Wellness colors inverted | Implemented `getValueColor()` with inverted logic for fatigue/stress/pain | ✅ Fixed |
| Decimal input for m/s fields | Added `formatDecimalInput()` to convert comma to dot | ✅ Fixed |
| QTRGauge component cut off | Fixed height/viewBox calculations (containerHeight = size * 0.85) | ✅ Fixed |
| injury_risk None type error | Changed to proper boolean validation | ✅ Fixed |

**Position Summary now includes:**
- `count` - Number of athletes
- `avg_acwr` - Group average ACWR
- `avg_wellness` - Group average wellness
- `avg_fatigue` - Group average fatigue
- `avg_distance` - Group average distance (meters)
- `avg_sprints` - Group average sprints
- `avg_max_speed` - Group average max speed (km/h)
- `high_risk_count` - Athletes at high risk

### ✅ Bug Fixes (Feb 8, 2026 - Latest Session)

| Issue | Fix | Status |
|-------|-----|--------|
| VBT decimal input (m/s) not working | Implemented `vbtInputs` state for raw input tracking with `getVbtInputValue()` helper | ✅ Fixed |
| Body Composition Donut chart incorrect | Fixed SVG strokeDasharray/strokeDashoffset calculation, added zero-check | ✅ Fixed |
| PDF/CSV Preview not available | Created `ReportPreviewModal.tsx` component and backend preview endpoints | ✅ Fixed |
| Query invalidation key mismatch | Added `body-composition` key to invalidation in `add-body-composition.tsx` | ✅ Fixed |

**New Components/Endpoints:**
- `ReportPreviewModal.tsx` - Modal for previewing reports before download
- `GET /api/reports/athlete/{id}/preview` - Athlete report preview data
- `GET /api/reports/athlete/{id}/csv-preview` - CSV preview with sample rows
- `GET /api/reports/body-composition/{id}/preview` - Body composition preview

### ✅ Dashboard & VBT Enhancements (Dezembro 2025)

| Feature | Implementation | Status |
|---------|---------------|--------|
| RSI card em branco no dashboard | Backend corrigido para buscar RSI de `metrics.rsi` em vez de `assessment.rsi` | ✅ Fixed |
| HSR em metros | `team.tsx` já mostra em metros (team_avg_hid) | ✅ Verified |
| Card duplicado de distância | Substituído por card de HSR Médio em `data.tsx` | ✅ Fixed |
| Carga ótima (VBT) | Backend calcula optimal_load, optimal_velocity, optimal_power usando fórmula P=carga×velocidade | ✅ Implemented |
| Evolução da carga ótima | Backend retorna `optimal_load_evolution` com histórico por sessão | ✅ Implemented |
| PDF força tradicional | Seção de força tradicional adicionada com tabela separada (Supino, Agachamento, Levantamento Terra, Salto Vertical) | ✅ Implemented |
| OptimalLoadEvolutionChart | Novo componente em `add-strength.tsx` para visualizar evolução | ✅ Implemented |
| **Gráfico comparação força** | Atualizado para mostrar valores da última avaliação vs anterior com % de mudança | ✅ Implemented |
| **PDF seção de força** | PDF agora mostra valores mais recentes (não média) da última avaliação de força | ✅ Fixed |
| **Ordenação por created_at** | Queries ordenam por `[("date", -1), ("created_at", -1)]` para dados do mesmo dia | ✅ Fixed |

**Correções Críticas (Feb 8 2026 - Sessão Atual):**
- PDF mostrava média em vez do valor mais recente → Corrigido para usar `latest_assessment.metrics`
- Múltiplas avaliações no mesmo dia não ordenavam corretamente → Adicionado `created_at` na ordenação
- API de análise de força não mostrava comparação → Adicionado `comparison_with_previous` e `variation_from_previous`

**Testado com atleta: Guilherme Mattos (ID: 6987fac838bbf90dba173d27)**
- 3 avaliações de força no mesmo dia (2026-02-08)
- Valores mais recentes: Mean Power 3000W, RSI 3.0
- PDF e API mostram corretamente os dados mais recentes

## Prioritized Backlog

### ✅ Simplificação da Página de Assinaturas (Fev 9, 2026)

Página de assinaturas completamente redesenhada com apenas 1 plano:

| Região | Preço | Moeda |
|--------|-------|-------|
| Brasil | R$ 199,00/mês | BRL |
| Internacional | $39.99/mês | USD |

**Funcionalidades do Plano Pro:**
- Trial gratuito de 7 dias com acesso completo
- Atletas ilimitados
- Histórico ilimitado
- VBT, Composição Corporal, Modelo 3D
- Insights de IA, ACWR detalhado
- Alertas de fadiga, Comparação de atletas
- Exportação PDF/CSV
- Até 5 usuários simultâneos
- Suporte prioritário

**Novos Endpoints:**
- `POST /subscription/restore` - Restaurar compras anteriores

**Arquivos Modificados:**
- `backend/server.py` - PLAN_LIMITS simplificado, novo endpoint restore
- `frontend/app/subscription.tsx` - UI completamente redesenhada

### ✅ Integração RevenueCat para In-App Purchases (Dez 9, 2025)

Implementada integração completa com RevenueCat para gerenciamento de assinaturas via App Store e Google Play.

**Frontend (React Native/Expo):**
- Instalado `react-native-purchases@9.7.6` SDK
- Criado `services/revenuecat.ts` - Configuração e helpers
- Criado `contexts/RevenueCatContext.tsx` - Context provider para gerenciamento de estado
- Atualizado `app/subscription.tsx` - Integração com RevenueCat SDK

**Backend (FastAPI):**
- Novos endpoints de webhook:
  - `POST /api/webhooks/revenuecat` - Recebe eventos do RevenueCat
  - `GET /api/subscription/revenuecat-status/{app_user_id}` - Verifica status
- Eventos suportados:
  - `INITIAL_PURCHASE` - Compra inicial
  - `RENEWAL` - Renovação automática
  - `CANCELLATION` - Cancelamento
  - `EXPIRATION` - Expiração
  - `BILLING_ISSUE` - Problema de cobrança
  - `UNCANCELLATION` - Reativação
  - `PRODUCT_CHANGE` - Mudança de plano

**Configuração Necessária no RevenueCat Dashboard:**
1. Criar projeto e configurar apps (iOS/Android)
2. Criar produto `com.peakperform.pro.monthly`
3. Criar entitlement `pro` e vincular ao produto
4. Configurar webhook URL: `{BACKEND_URL}/api/webhooks/revenuecat`
5. Adicionar API keys nas variáveis de ambiente:
   - `EXPO_PUBLIC_REVENUECAT_APPLE_KEY` - Chave pública iOS
   - `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY` - Chave pública Android
   - `REVENUECAT_WEBHOOK_SECRET` - Secret para validar webhooks

**Funcionalidades:**
- Compras via App Store e Google Play
- Restaurar compras anteriores
- Detecção automática de status (trial/active/cancelled)
- Fallback gracioso para web (mostra aviso)
- Sincronização de status via webhooks
- Auditoria de eventos (collection `webhook_events`)

### ✅ Novo Módulo de Avaliação de Salto (Dez 9, 2025)

Substituição completa do módulo de "Força Tradicional" por um sistema científico de avaliação de salto.

**Protocolos Implementados:**
1. **CMJ** (Counter Movement Jump) - Salto bilateral padrão
2. **SL-CMJ** (Single Leg CMJ) - Perna direita e esquerda
3. **DJ** (Drop Jump) - Com altura da caixa configurável

**Dados de Entrada:**
- Tempo de Voo (ms)
- Tempo de Contato (ms)
- Altura do Salto (cm) - Opcional, calculada automaticamente
- Altura da Caixa (cm) - Apenas para DJ

**Cálculos Automáticos:**
| Métrica | Fórmula |
|---------|---------|
| Altura do Salto | h = (g × t²) / 8 |
| RSI | Altura (m) / Tempo de Contato (s) |
| RSI Modificado | Tempo de Voo / Tempo de Contato |
| Pico de Potência | 60.7 × altura(cm) + 45.3 × peso(kg) - 2055 (Sayers) |
| Pico de Velocidade | √(2 × g × altura) |
| Potência Relativa | Pico Potência / Peso |
| Z-Score | (Valor atual - Média) / Desvio Padrão |

**Classificação RSI:**
| RSI | Classificação |
|-----|---------------|
| ≥2.8 | Excelente |
| ≥2.4 | Muito Bom |
| ≥2.0 | Bom |
| ≥1.5 | Médio |
| ≥1.0 | Abaixo da Média |
| <1.0 | Fraco |

**Índice de Fadiga (SNC) baseado em variação RSI:**
| Variação | Status | Cor | Ação |
|----------|--------|-----|------|
| 0 a -5% | Verde | #10b981 | Treino normal |
| -6% a -12% | Amarelo | #f59e0b | Monitorar volume/sprints |
| < -13% | Vermelho | #ef4444 | Alto risco - Reduzir carga |

**Assimetria de Membros (SL-CMJ):**
- Diferença >10% = RED FLAG para risco de lesão
- Identifica perna dominante
- Recomenda exercícios corretivos

**Perfil Potência-Velocidade:**
- **Dominante em Velocidade**: Alta velocidade, baixa potência → Treinar Força Máxima
- **Dominante em Potência**: Alta potência, baixa velocidade → Treinar Pliométricos/Velocidade
- **Equilibrado**: Manter programa balanceado
- **Em Desenvolvimento**: Programa completo de S&C

**Insights de IA (GPT-4o via Emergent LLM Key):**
- Análise científica personalizada
- Feedbacks em linguagem técnica
- Recomendações baseadas em literatura esportiva

**Endpoints Criados:**
- `GET /api/jump/protocols` - Lista protocolos disponíveis
- `POST /api/jump/assessment` - Criar avaliação
- `GET /api/jump/assessments/{athlete_id}` - Listar avaliações
- `GET /api/jump/analysis/{athlete_id}` - Análise completa
- `DELETE /api/jump/assessment/{id}` - Deletar avaliação

**Arquivos Criados:**
- `frontend/app/athlete/[id]/jump-assessment.tsx` - Nova página de avaliação
- Backend: Novos endpoints em `server.py`

**Arquivos Modificados:**
- `frontend/app/athlete/[id]/add-strength.tsx` - Redirecionamento para nova página

### ✅ Correção "Adicionar Atleta Manualmente" (Fev 9, 2026)

| Problema | Solução | Status |
|----------|---------|--------|
| `launchImagePickerAsync` não existe no expo-image-picker v17 | Substituído por `launchImageLibraryAsync` | ✅ Fixed |
| `MediaTypeOptions.Images` obsoleto | Substituído por `['images']` | ✅ Fixed |

**Arquivos Corrigidos:**
- `frontend/app/add-athlete.tsx`
- `frontend/app/athlete/[id]/edit.tsx`

**Teste Realizado:** Criação de atleta "Jogador Teste E2E" via formulário - sucesso.

### ✅ Integração Bluetooth VBT (Fev 9, 2026)

Removido GymAware e implementado suporte Bluetooth para dispositivos VBT:

| Dispositivo | Conexão | Métricas | Cor |
|-------------|---------|----------|-----|
| **PUSH Band 2.0** | Bluetooth BLE | Velocidade, Potência | #FF6B35 |
| **Vitruve** | Bluetooth BLE | Velocidade, Potência, ROM | #00D4AA |
| **Beast Sensor** | Bluetooth BLE | Velocidade, Potência | #FFD700 |
| **Manual** | Entrada manual | Todas | - |

**Novos Arquivos Criados:**
- `contexts/BluetoothVBTContext.tsx` - Context provider para conexão Bluetooth
- `components/BluetoothVBTModal.tsx` - Modal para scan e conexão de dispositivos

**Funcionalidades:**
- Scan de dispositivos BLE com identificação automática
- Conexão e monitoramento de dispositivos VBT
- Parsing de dados em tempo real (velocidade, potência, ROM)
- Fallback gracioso para web (mostra mensagem para usar app)
- Indicador de força de sinal (RSSI)

**Biblioteca Instalada:** `react-native-ble-plx@3.5.0`

**NOTA:** A conexão Bluetooth real requer teste em dispositivo físico (iOS/Android) com dispositivos VBT reais. Os padrões de identificação de dispositivos são baseados em nomes comuns (PUSH, Vitruve, Beast).

### ✅ Fallback Web para Wellness Form (Fev 9, 2026)

Corrigido o problema onde usuários web viam "Link inválido ou expirado" em vez da página de fallback.

| Problema | Solução | Status |
|----------|---------|--------|
| SSR executava fetch antes da detecção de plataforma | Implementado `isClient` state com useEffect para detecção client-side only | ✅ Fixed |
| `Platform.OS` retornava valores inconsistentes no SSR | Separado detecção de plataforma em dois estados: `isClient` e `isWebPlatform` | ✅ Fixed |

**Fluxo Corrigido:**
1. Página carrega com loading state
2. `useEffect` executa e detecta `Platform.OS === 'web'`
3. Se web: mostra página de fallback (sem chamadas à API)
4. Se nativo: carrega atletas normalmente

**Arquivo Modificado:** `frontend/app/wellness-form/[token].tsx`

### P1 - Next
- [ ] Full i18n audit
- [ ] Global theme (Light/Dark)
- [ ] Corrigir contagem de sessões em `charts.tsx` (1 CSV = 1 sessão)

### ✅ Suporte Multi-Formato CSV (Fev 9, 2026)

O sistema agora suporta importação automática de CSV de múltiplos provedores GPS:

| Provedor | Identificadores | Status |
|----------|-----------------|--------|
| **Catapult** | Player Name, Drill Title, Player Load | ✅ Suportado |
| **PlayerTek** | PlayerTek, Total Distance, HSR Distance | ✅ Suportado |
| **STATSports** | STATSports, Apex, HML Efforts | ✅ Suportado |
| **GPexe** | GPexe, Equivalent Distance, Metabolic Power | ✅ Suportado |
| **Polar** | Polar, Training Load, Recovery Time | ✅ Suportado |
| **Garmin** | Garmin, Training Effect, VO2 Max | ✅ Suportado |
| **Genérico** | Fallback para formatos desconhecidos | ✅ Suportado |

**Novos Endpoints:**
- `POST /api/wearables/import/csv` - Importação com detecção automática
- `GET /api/wearables/csv/supported-providers` - Lista provedores suportados
- `POST /api/wearables/csv/preview` - Preview antes de importar

**Funcionalidades:**
- Detecção automática de formato baseada nos headers
- Mapeamento inteligente de colunas (múltiplos nomes aceitos)
- Conversão automática de unidades (km→m, km/h→m/s)
- Suporte a múltiplos formatos de data
- Preview dos dados antes da importação
- Relatório detalhado de importação (importados/pulados/erros)

### ✅ Acesso Público ao Formulário Wellness (Fev 9, 2026)

Implementado acesso público ao formulário de wellness para atletas:

| Configuração | Valor |
|--------------|-------|
| **Deep Link Scheme** | `peakperform://` |
| **Universal Link** | `https://peakperform.app/wellness-form/{token}` |
| **Bundle ID (iOS)** | `com.peakperform.app` |
| **Package (Android)** | `com.peakperform.app` |

**Fluxo do Atleta:**
1. Coach gera link de wellness
2. Coach compartilha via WhatsApp/Email
3. Atleta clica no link
4. Se não tem app → Baixa grátis da App Store/Play Store
5. App abre direto no formulário (SEM LOGIN)
6. Atleta preenche e envia
7. Dados aparecem no dashboard do coach

**Arquivos Modificados:**
- `app.json` - Configuração de deep links
- `_layout.tsx` - Rota pública para wellness-form
- `generate-wellness-link.tsx` - URL do domínio atualizada

### P2 - Planned
- [ ] Push Notifications
- [ ] Full OAuth wearable integration

### P3 - Future
- [ ] Gamification/Leaderboards
- [ ] Video analysis integration

## Test Credentials
- **Email**: preview_test@test.com
- **Password**: test123

## Last Updated
December 9, 2025
