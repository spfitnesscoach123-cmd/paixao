# CHANGELOG


## 2026-05-22 (P1) — Pain Location optional text field (Wellness)
- **Scope**: Add a single optional free-text field "Pain Location / Local da Dor" (≤100 chars) below the existing muscle_soreness slider in the **I'm a Player → Wellness Form** and surface it on the **Team Dashboard Analytical Table** + **Athlete Profile historical wellness cards**. NO changes to existing wellness math, readiness/fatigue scoring, calculations, flows or layout outside these touchpoints.
- **Backend**:
  - `backend/models/wellness_models.py` + `backend/models/shared.py`: added `pain_location: Optional[str] = Field(default=None, max_length=100)` to `WellnessQuestionnaireCreate`, `WellnessQuestionnaire`, `TokenWellnessSubmit`, `PublicWellnessSubmit`.
  - `backend/routes/wellness/routes.py`: persist `pain_location` in `/wellness/token/submit` (Apple Review APPS26 path + normal path) and `/wellness/public/{link_token}/submit`. Backward compatible — legacy records w/o the field still load.
  - `backend/routes/dashboard/routes.py` (`/dashboard/team-table`): `TeamTableRow` now exposes `pain_score` (muscle_soreness from latest wellness) and `pain_location` (athlete-typed string). No metric recalculation; pure read-merge.
- **Frontend**:
  - `frontend/types/index.ts` and `frontend/components/dashboard/types.ts`: added `pain_location` / `pain_score`.
  - `frontend/app/athlete-wellness.tsx` ("I'm a Player"): TextInput multiline (maxLength=100) added BELOW "Dor muscular" slider. Existing slider/score behavior untouched. Submits `pain_location` (trimmed, sliced to 100, or `null` if empty).
  - `frontend/components/dashboard/TeamTable.tsx` + `TeamTableRow.tsx`: new "Dor / Pain" column inserted between Readiness and Fatigue (%). Renders `6/10 • <text>` / `6/10` / `—`. No color logic, no risk highlighting, no sorting.
  - `frontend/app/athlete/[id].tsx`: new line inside each historical wellness card showing `Pain: 6/10 • Right Hamstring` (or `Pain: 6/10`); hidden entirely if no muscle_soreness recorded.
  - `frontend/locales/en.json` + `pt.json`: added `wellness.painLocation`, `wellness.painLocationPlaceholder`, `wellness.pain`.
- **Verification**:
  - `POST /api/wellness/token/submit` with `pain_location="Posterior da Coxa Direita"` → 200, persisted in MongoDB.
  - `GET /api/dashboard/team-table` returned the row with `pain_score: 6` and `pain_location: "Posterior da Coxa Direita"`.
  - `GET /api/wellness/athlete/{id}` returned `muscle_soreness: 6` + `pain_location` on the latest record. Older records still return without the field.
  - 100-char limit enforced by Pydantic (string_too_long 422 on >100). Frontend also slices/maxLength.
  - Submission WITHOUT the field still succeeds (backward compatibility).
  - TypeScript compile shows no new errors related to these files.



## 2026-04-28 (P1) — Empty State CSV Entry Point (Athletes Hub)
- **Scope**: Adicionar botão de entrada CSV na tela "Atletas" quando não há atletas cadastrados. Estado vazio passa a guiar o usuário para importação via CSV (Catapult, Playertek), reutilizando 100% do pipeline existente. Sem alterar lógica de ingestão, parsing, validação, criação de atletas ou Dashboard.
- **File modificado**: `frontend/app/(tabs)/athletes.tsx`
  - Novo render condicional `hubView === 'hub' && isEmptyState` (renderiza ANTES do Hub padrão).
  - Botão CSV é cópia visual exata do botão `csv-import-button` de `app/(tabs)/team.tsx` (mesmo gradient, padding, ícone `cloud-upload`, título "Importar CSV - GPS", subtítulo "GPS, Sprint, Aceleração"). Reusa o mesmo `router.push('/upload-csv')` — sem nova rota, sem nova lógica, sem nova função.
  - **Highlight de primeiro acesso**: `Animated.loop` com `iterations: 2`, escala 1.0 → 1.05 → 1.0 (600ms cada), `Easing.inOut(Easing.ease)`. Para automaticamente após 2 ciclos OU ao primeiro toque (`stopPulse()` — stateful via `pulseStopped`).
  - **Ação secundária preservada**: FAB `(+)` no canto inferior direito + link inline "Cadastrar atleta manualmente" → ambos abrem `/add-athlete` (handler existente).
  - **Transição de estado**: assim que pelo menos 1 atleta é criado (via CSV ou manual), o React Query invalida e a tela renderiza automaticamente o Hub padrão (Atletas / VBT / Avaliações). Nenhuma duplicação de código.
- **data-testid novos**: `empty-state-guide`, `empty-state-title`, `empty-state-csv-import-button`, `empty-state-add-manual-btn`, `empty-state-add-athlete-fab`.
- **Verification**: ESLint OK, Metro bundle compilado em 7.7s, backend logs confirmam `GET /api/athletes` 200. Smoke test login bem-sucedido.

## 2026-04-28 (P2) — Tooltips por Módulo (VBT / Jump / Body Composition) + Remoção do Station Mode no Body Composition
- **Scope**: Adicionar tooltips explicativos nos 3 módulos funcionais (VBT, Jump, Body Composition) e remover o botão "Station Mode" do card de Body Composition no Hub de Avaliações Físicas. Sem alterar lógica, fluxos, cálculos ou captura de dados.
- **Tooltips adicionados** (todos com `data-testid` único, ícone (i) ao lado do título principal, conteúdo PT/EN, abre `Modal` com scroll interno e fecha por OK/X/backdrop):
  1. `tooltip-vbt-flow` + `tooltip-vbt-flow-perm` — `app/athlete/[id]/vbt-camera.tsx` (header da config + render da tela "no permission" para acessibilidade antes do grant da câmera).
  2. `tooltip-jump-flow` — `app/athlete/[id]/jump-camera.tsx` (header da página "Jump Camera" — fluxo de captura do salto).
  3. `tooltip-body-composition-flow` — `app/athlete/[id]/body-scan.tsx` (header "Composicao Corporal").
- **Remoção do Station Mode (Body Composition)**: deletado o `<TouchableOpacity data-testid="hub-station-bodyscan">` no card "Composição Corporal" em `app/(tabs)/athletes.tsx`. Cards VBT e Jump Assessment continuam com Station Mode intactos. Verificado E2E via Playwright (`Body station btn (should be None)` confirmado).
- **Verification**: Playwright validou os 3 tooltips abrindo modais com texto correto e legível em viewport iPhone (390x844). Screenshots salvos em `/tmp/jump_tt_open.png`, `/tmp/vbt_tt_open.png`, `/tmp/tt_bc.png`.

## 2026-04-28 — Tooltips Globais + Ajustes Críticos Apple Review
- **Scope**: Adicionar 6 tooltips informativos em pontos-chave da Periodização e ajustes obrigatórios para a App Review (Apple) — Política de Privacidade com email/endereço reais e botão Voltar do Cadastro respeitando Safe Area do iOS.
- **New component (`frontend/components/InfoTooltip.tsx`)**:
  - Ícone `(i)` clicável com `Modal` transparente (popover leve), backdrop com `Pressable` que fecha ao toque fora, botão "OK" e "X" para fechar.
  - Acessibilidade: `accessibilityRole`, `accessibilityLabel`, `hitSlop` (12px) e área mínima 32x32. Tema light/dark via `useTheme()`.
- **Tooltips adicionados** (todos com `data-testid` para automação):
  1. `tooltip-gps-activity-classification` — `app/(tabs)/periodization.tsx` (header "Classificação de Atividades GPS").
  2. `tooltip-week-info` — `app/periodization/create.tsx` step 1 (Informações da Semana).
  3. `tooltip-classify-days` — `app/periodization/create.tsx` step 2 (Classificação dos Dias).
  4. `tooltip-weekly-prescription` — `app/periodization/create.tsx` step 3 (Prescrição Semanal).
  5. `tooltip-daily-prescription` — `app/periodization/create.tsx` step 4 (Prescrição Diária).
  6. `tooltip-weekly-goals` — `app/periodization/[id].tsx` (header "Metas Semanais"). **Não altera** o tooltip pré-existente do botão "Recalcular Base" (banner condicional `!hasAnyPeakValues`), que permanece intacto.
- **Privacy Policy (`app/privacy-policy.tsx`)**:
  - Substituídos placeholders por dados oficiais da empresa: `contato@loadmanagerpro.com.br` + endereço completo (LoadManager Pro, Ouro Fino – MG, CEP 37570-000, Brasil).
  - Header agora envolto em `SafeAreaView` (edges=`top`) e botão Voltar com 44x44px de área de toque + `hitSlop`.
- **Register (`app/register.tsx`)**:
  - Botão Voltar movido para fora do `ScrollView`, dentro de `SafeAreaView` (edges=`top`) com `marginTop: 16`, `width/height: 44` (Apple HIG mínimo), background sutil `rgba(47,182,255,0.10)` e `hitSlop` 12px. Resolve o problema "muito alto / difícil clicar" reportado.
- **Verification**: Testes E2E via Playwright confirmam que (a) a Política de Privacidade exibe email + endereço corretos, (b) os 6 tooltips abrem o modal correto e fecham via OK/backdrop, (c) o botão Voltar do Cadastro fica visível e na posição correta. Nenhuma lógica funcional foi alterada.


## 2026-04-27 — PDF Export Layer 3 (Detailed Metrics) — FULL REBUILD (P6)
- **Scope**: User reported the previous Layer 3 implementation was visibly broken (charts cropped, modules misaligned, dashboard appearance, table overflow).
  Per user mandate: complete rebuild of Layer 3 only — Layer 1, Layer 2 and the data layer remain untouched.
- **Backend (`backend/routes/dashboard/routes.py`)**:
  - Replaced `_l3_module()` helper with strict 4-slot structure: `pdf-module-title` + `pdf-module-metrics` + `pdf-chart-container` + `pdf-module-footer`.
  - Removed legacy classes `module-large` / `module-small` / `metrics-grid` / `kpi-row` / `readiness-block` entirely.
  - All 5 modules (Load Intelligence, Performance Profile, Team Status, Neuromuscular Status, Risk Intelligence) now follow the same fixed structure.
  - Charts forced into `.pdf-chart-container { height: 160px; overflow: hidden; }` — eliminates all chart cropping/overflow.
  - Risk Intelligence: dedicated `.pdf-risk-table` (top-5 in chart-container) + `+N atletas` footer.
  - New container: `.page-container { width: 1024px; }` rendered OUTSIDE the 820px Layer 1/2 `.container` so Layer 3 has its own wider canvas.
  - `.pdf-grid-2col { 1fr 1fr; gap: 24px; }` — symmetric 2-col grid (replaces asymmetric `2fr 1fr` with row-spans).
  - Empty modules render structure (title + empty metrics placeholder) per spec.
  - `page-break-inside: avoid` on every module — verified via Chrome headless print-to-PDF: full Layer 3 fits on a single page with all 5 modules bordered, charts contained, no overflow.
- **Test (`backend/tests/test_pdf_export.py`)**: Updated `test_metric_cards_structure` to validate the new P6 class names (`pdf-module`, `pdf-module-title`, `pdf-module-metrics`, `pdf-chart-container`).
- **Regression**: 27/33 PDF tests pass (was 26/33). 6 remaining failures are pre-existing — they reference design tokens from 2 versions ago (`Smart Summary`, `report-header`, `lb-cyan`, hardcoded `3,500`).
- **Verification**: End-to-end PDF generation via `google-chrome --print-to-pdf` confirms acceptance criteria met — clean 2-col grid, charts NOT cut, layout stable, professional report appearance, no dashboard semantics.

## 2026-03-13
### Dashboard Visão Geral da Equipe — Complete Rebuild
- **Backend**: Created `GET /api/dashboard/overview` endpoint with full filter support (athlete_id, position, date_range)
- **Backend**: LMPI calculation (ACWR 30%, Wellness 25%, RSImod 20%, VBT Fatigue 15%, Monotony 10%)
- **Backend**: VBT data grouped by exercise (never mixed between exercises)
- **Backend**: SL-CMJ asymmetry calculation for risk intelligence
- **Backend**: Automated insights generation per layer (pt/en)
- **Frontend**: Complete rewrite of `data.tsx` with 5-layer dashboard architecture
- **Frontend**: Global filters (Athlete, Date Range, Position) with instant reactivity
- **Frontend**: 3 automatic modes: Team, Position, Athlete
- **Frontend**: Custom SVG chart components: Gauge, Line, Donut, Quadrant/Scatter, Radar, Heatmap, HorizontalBar
- **Frontend**: Layer switching with fade animation (150ms out, 250ms in)
- **Frontend**: Moved CSV Import button from data.tsx to team.tsx (top of Team Dashboard)
- **Testing**: 20/20 backend tests passed, 8/8 frontend tests passed

## Previous Sessions
- Jump Assessment page refactor (protocol-specific architecture)
- Scientific Analysis tab integration
- Periodization table layout fix
- Jump Camera date picker
- Team Dashboard GPS corrections
- iOS deployment fixes

## 2026-04-20 — Design System: Logo-Aligned Palette + Theme Switcher
- **Palette migration**: Replaced entire violet/indigo theme with logo-derived palette (Navy #081C3A, Green Performance #7CFF3A, Sapphire #2FB6FF, Ice White #F4F7FB, Shield Navy #123A63).
- **Theme tokens**: Rewrote `constants/theme.ts` preserving all legacy keys (`dark.*`, `accent.*`, `gradients.*`, `text.*`, `border.*`, `status.*`, `input.*`) so existing components adopt new palette automatically. Added `BRAND` export.
- **Dark + Light + Auto**: Upgraded `ThemeContext` to support dynamic theme selection with AsyncStorage persistence (`lmp:theme-preference`). `useColorScheme` drives Auto mode.
- **Theme selector UI**: New `components/ThemeSelector.tsx` (segmented control: Claro / Escuro / Automático) rendered in Profile tab, directly below the "Conta" card, per design spec.
- **Hardcoded color sweep**: Migrated 72+ hardcoded violet/indigo hex values across 52 files in `/app` and `/components` to the new palette via bulk `sed` replacement (no logic changes).
- **Cards transparency**: Dark cards now use `rgba(18, 58, 99, 0.72)` for soft glass effect; borders use `rgba(124, 255, 58, 0.20)` (per spec).
- **Logo replacement**: Replaced `assets/logo.png` (used by Login and Role-Select) with the new official LoadManager Pro circular logo. Regenerated `icon.png`, `adaptive-icon.png`, `splash-image.png`, and `favicon.png` from the same source.
- **App chrome**: Updated `app.json` splash/adaptive backgroundColor from `#000000`/`#000F1F` to brand navy `#081C3A`.
- **i18n**: Added `settings.appearance`, `settings.autoMode`, `settings.themeSubtitle`, `settings.systemDefault` to `pt.json` and `en.json`.

## 2026-04-20 (14:15) — Palette Iteration + Light Mode Refactor
- **Primary color swap**: verde `#7CFF3A` → azul safira `#2FB6FF` (topo do escudo). Aplicado em tokens (`darkColors.accent.primary`, gradients, borders) e em ~36 arquivos com hardcoded hex via sed. Verde agora serve apenas como `status.success` / `accent.tertiary`.
- **Light Mode cards**: cards em light theme passaram de translúcidos (`rgba(255,255,255,0.92)`) para branco sólido (`#FFFFFF`) com borda sutil safira (`rgba(47,182,255,0.25)`) — melhor legibilidade do conteúdo.
- **Theme-reactive refactor**: 24 telas adicionais convertidas de `const styles = StyleSheet.create({...colors.dark.*...})` (estático, travado em dark) para padrão `createStyles(colors)` + `useMemo(() => createStyles(colors), [colors])`. Agora respondem ao light/dark/auto em runtime.
  - Inclui: `athlete/[id].tsx`, `add-athlete.tsx`, `register.tsx`, `forgot-password.tsx`, `upload-catapult.tsx`, `compare-athletes.tsx`, `athlete-wellness.tsx`, `generate-wellness-token.tsx`, `generate-wellness-link.tsx`, `athlete-token.tsx` e outras.
- **Shadows**: todas as sombras de card/glow/button agora usam safira como cor base (antes: verde).
- **Script de refactor** `/tmp/theme_refactor.py` criado (idempotente, com guard para evitar duplicidade).

**Telas ainda em dark fixo** (não detectadas pelo patcher por heurística conservadora ou estrutura de componente atípica): algumas telas do athlete sub-flow, componentes compartilhados como `PremiumGate`, `ACWRBadge`, `JumpAnalysisCharts`, `ScientificAnalysisTab` — podem requerer pass adicional manual em próxima iteração se o usuário quiser coverage 100%.


## 2026-04-25 — Periodization Consistency: Past-Week Freeze + Frontend Query Invalidation
- **Backend (`routes/periodization/routes.py` — `GET /periodization/calculated/{week_id}`)**: Added one-time freeze logic. When `week.end_date < today`, the endpoint persists a snapshot of the calculated `athletes[]` (peak_values, weekly_targets, daily_targets) into `periodization_weeks.frozen_targets` on the first read, and from that point onward returns the snapshot verbatim. Subsequent peak updates no longer mutate past weeks. Current/future weeks remain dynamic. Response now includes `frozen: bool` and `frozen_at: str|null`.
- **DB schema delta**: `periodization_weeks.frozen_targets = { frozen_at: ISO8601 UTC, athletes: [...] }` (additive, optional field, only present after the week closes and is read at least once).
- **Frontend query invalidation** (no UI/UX change, only consistency):
  - `app/upload-csv.tsx` (CSV import) — invalidates `gps-sessions-classification`, `periodization-weeks`, `periodization-calculated`, `periodization-peak-values`, `gps`.
  - `app/(tabs)/periodization.tsx` (classify session) — added `periodization-calculated` and `periodization-peak-values` to the existing invalidation set.
  - `app/athlete/[id]/add-gps.tsx` (manual GPS add) — invalidates the periodization keys above.
  - `app/athlete/[id]/upload-gps.tsx` (Catapult CSV) — same.
  - `app/athlete/[id].tsx` (delete activities) — same.
- **Verified**: Past week → `frozen=true` + persisted snapshot stable across reads. Future week → `frozen=false` + dynamic. Peak algorithms and classification flow untouched.


## 2026-04-25 (later) — Smart Summary iOS Crash Guards (P0)
Cirurgia mínima em `app/(tabs)/data.tsx` para impedir crashes nativos iOS (EXC_BAD_ACCESS) no react-native-svg quando Smart Summary é aberto em estados vazios/zero.
- **GaugeChart**: `safeValue = value > 0 ? value : 0.0001`; `safeId = gauge-${safeLabel || 'default'}` (evita `gauge-` vazio); `dashArray = Math.max(progress * circumference, 0.0001)` (evita path degenerado).
- **DonutChart**: `safeSegments = Array.isArray(segments) ? segments : []`; deps da animação estabilizadas em `[0]` quando vazio (evita churn de animação contra array vazio).
- **RadarChart**: `safeValues` sanitizados (NaN→0); `finalValues` recebe perturbação `0.0001` no primeiro slot quando todos zeros, ou fallback `[0.0001,0,0,0,0]` quando `values=[]` (evita polígono colapsado).
- **Sem alteração de UX**: layout, lógica de cálculo de LMPI, render condicional e arquitetura preservados. Mudanças invisíveis quando há dados reais.


## 2026-04-25 (Smart Summary normalization + multi-delete) — P0 + Feature

### PARTE 1 — Smart Summary defensive normalization
- **`app/(tabs)/data.tsx > renderSmartSummary()`**: adicionado `safeSummary` (spread sobre defaults explícitos), `safeAthletes = Array.isArray(athletes) ? athletes : []` e `safeInsights` como guarda contra payloads parciais/ausentes vindos do backend (cenários: 0 atletas, 1 atleta sem GPS, equipe inteira sem GPS).
- Substituído todas as referências a `athletes`/`summary`/`insights` dentro de `renderSmartSummary` pelas versões seguras. `riskDist` agora também checa `typeof === 'object'` antes de ler chaves.
- Adicionado fallback de `key` na tabela de ranking LMPI (`a.id || row-${i}`) para nunca render `undefined` como key.
- **Sem alteração de UI/UX/lógica de cálculo** — mudanças puramente defensivas.

### PARTE 2 — Multi-delete via long press na lista de atletas
- **`components/animations/AnimatedCard.tsx`**: adicionados props `onLongPress` e `delayLongPress` (default 600ms). `Pressable` agora aceita ambos os handlers.
- **`app/(tabs)/athletes.tsx`** — modo seleção múltipla:
  - State: `selectionMode`, `selectedIds`, `bulkDeleting`, helpers `toggleSelect` / `exitSelectionMode`.
  - `bulkDeleteMutation` reutiliza `DELETE /api/athletes/{id}` em paralelo (`Promise.allSettled`) — backend intacto, sem novo endpoint.
  - Long press em qualquer card (500ms) ativa modo seleção e marca o item.
  - Em modo seleção: tap normal alterna seleção, header substituído por barra com contador + botão "Excluir" (vermelho) + "Cancelar".
  - Confirmação via `Alert.alert` com texto explicando que dados/sessões/histórico serão removidos.
  - Após sucesso: invalida `athletes`, `athletes-list`, `dashboard*`, sai do modo seleção.
  - Fluxo individual de exclusão (em `/athlete/[id]`) preservado integralmente.

## 2026-04-25 (final) — Smart Summary: Context-Aware Validity Guard (P0 estrutural)
Substituído o crash nativo iOS por uma guarda de regra de negócio. Smart Summary só monta seus charts (GaugeChart/RadarChart/DonutChart) quando o LMPI é válido no contexto atual. Sem mount → sem race Reanimated×SVG → sem crash.

- **`app/(tabs)/data.tsx > renderSmartSummary()`** (único arquivo modificado):
  - Inserido `hasValidLmpi` logo após a normalização defensiva.
  - **Athlete mode**: `safeAthletes[0]?.lmpi_validity !== 'invalid'`.
  - **Team / Position mode**: `safeAthletes.some(a => a.lmpi_validity !== 'invalid')` — backend já filtra `athletes[]` por posição quando o filtro está ativo, cobrindo os 3 cenários sem ramificação extra.
  - Quando `!hasValidLmpi`: retorna card único com ícone `bar-chart-outline` e mensagem `"Não há dados suficientes" / "Not enough data"` + sub-texto orientando importar GPS.
  - Restante de `renderSmartSummary` intacto. Outras camadas (Load/Status/Neuro/Risk) **não tocadas**.

- **Por que isso resolve estruturalmente**: o crash documentado vem do mount do GaugeChart com `value≈0` (Reanimated worklet completa em 1 frame e colide com commit nativo do react-native-svg). Sem dados válidos → não monta GaugeChart → race nunca acontece.
- **Honra o contrato do backend** (`calc_lmpi` retorna `lmpi_validity='invalid'` quando ACWR é None — frontend agora respeita esse sinal).

## 2026-02-27 — Preço Dinâmico + Limite de Dispositivos

- Removidos TODOS os fallbacks hardcoded `$39.99` / `R$ 39,99` no frontend (subscription.tsx, SubscriptionModals.tsx, SubscriptionGuard.tsx, PremiumGate.tsx). Substituído por `'Loading Price'` enquanto RevenueCat carrega offerings.
- PremiumGate.tsx agora consome `currentPackage` via `useRevenueCat()` e usa `formatPrice()` para preço localizado automático (R$ no Brasil, $ nos EUA etc).
- Backend: `MAX_DEVICES_PER_USER` alterado de 3 → 5 em `backend/models/shared.py` e `backend/routes/auth/routes.py`.
- Bypass da conta demo (`contato@loadmanagerpro.com.br`) preservado — continua com dispositivos ilimitados.

Validado via curl: login conta demo OK, endpoint /api/auth/devices retorna max_devices=5 e centenas de devices registrados (bypass funciona).


## 2026-02-27 (revisão 2) — Preço Dinâmico como Estado Principal + Fallback Controlado

- Criado hook central `/app/frontend/hooks/usePriceDisplay.ts` que gerencia 3 estados:
  - **Preço real** (formatPrice do RevenueCat) = estado PRINCIPAL
  - **'Loading Price'** = TRANSITÓRIO (durante fetch inicial)
  - **'Unavailable'** = fallback CONTROLADO (após timeout de 4s sem resposta)
- Expõe `shouldRender` para evitar renderização prematura: UI mostra `ActivityIndicator` enquanto `!shouldRender`, substituindo o preço apenas quando real ou timeout expirou.
- Aplicado em: `app/subscription.tsx`, `components/SubscriptionModals.tsx` (TrialRequiredModal + SubscriptionExpiredModal), `components/SubscriptionGuard.tsx`, `components/PremiumGate.tsx`.
- Removido `USD` do texto legal do TrialRequiredModal — o preço agora respeita moeda local automaticamente.
- Integração RevenueCat INALTERADA (offerings, listeners, contexto).


## 2026-05-29 — Fase 3: Tabela Analítica Team Dashboard (Speed & Metabolic Load)

Épico "Speed & Metabolic Load" — Fase 3 concluída (aguardando aprovação do checkpoint pelo usuário).

### Backend
- **BUG CRÍTICO corrigido**: o agente anterior adicionou os 8 campos novos ao modelo `models/dashboard_models.py` — porém esse arquivo é **código morto** (não importado). O modelo `TeamTableRow` realmente usado é definido LOCALMENTE em `routes/dashboard/routes.py` (linha ~738). Como o modelo real não tinha os campos, o Pydantic descartava silenciosamente os valores (extra='ignore') → API retornava os 8 campos como ausentes/null.
- **Correção**: adicionados os 8 campos `Optional[float] = None` ao modelo local `TeamTableRow` em `routes/dashboard/routes.py` (aditivo, null-safe): `avg_player_load`, `player_load_per_min`, `max_velocity_percent`, `max_velocity_kmh`, `max_acceleration`, `max_deceleration`, `high_metabolic_load`, `duration`.
- Agregação (já existente nas linhas ~896-968) confirmada: PL e PL/min são médias; HML e Duração são somas; velocidades/acelerações são picos. Valores expostos EXATAMENTE como armazenados (sem conversão de unidade).

### Frontend (sem alteração de código nesta sessão — já estava pronto)
- `components/dashboard/types.ts`, `TeamTable.tsx`, `TeamTableRow.tsx` já continham as 8 colunas + toggle "Vel & Metab" + headers ordenáveis. Bundle Metro estava em cache → exigiu restart do Expo para servir a versão atual.

### Validação (import de CSV de teste controlado, depois removido)
- Backend: atleta de teste retornou os 8 valores populados (APL 555.5, PL/min 7.7, VMax% 92, VMax km/h 33.3, MaxAcc 4.4, MaxDec -3.3, HML 888, Dur 95).
- Frontend: tabela renderizou as 8 colunas; toggle "Speed & Metab" oculta/exibe; ordenação por APL funciona; null-safe ("-") para atletas sem dados; sem quebra de layout.
- Limpeza: atleta de teste + gps_data + athlete_load_metrics removidos (evidência: contagem = 0; 31 atletas reais intactos).

### Risco aberto (não corrigido — fora do escopo/governança)
- `models/dashboard_models.py` é um duplicado morto e divergente de `TeamTableRow`. Recomenda-se remover futuramente para evitar confusão (aguardando autorização).


## 2026-05-29 — Fase 4: Dashboard Overview Layer "Speed & Metabolic Load"

Nova camada do Dashboard Overview (aguardando aprovação do checkpoint). Reusa 100% a arquitetura existente de layers/gauges/line chart/AI insights — sem sistema paralelo, sem nova lib de gráfico, sem alterar layers existentes, sem tocar filtros/modos.

### Backend — `routes/dashboard/routes.py` (endpoint `/dashboard/overview`, aditivo & null-safe)
- `build_daily_gps`: agrega por dia Player Load (média), PL/min (média), HML (soma), Duração (soma), Max Velocity % (pico), Max Velocity km/h (pico) — valores EXATAMENTE como armazenados, sem conversão.
- Novo helper `compute_speed_metabolic(daily_gps)`: agregado do período + timeline diária (PL e PL/min) para o gráfico de linha.
- Por atleta: adiciona `speed_metabolic` (agregado) e `sm_timeline` ao resultado.
- `daily_timeline`: adiciona `player_load` e `player_load_per_min` por dia.
- Resumo da equipe: `team_avg_player_load`, `team_player_load_per_min`, `team_max_velocity_percent`, `team_high_metabolic_load`.
- `aggregated_timeline`: adiciona `player_load` e `player_load_per_min` (médias da equipe/posição por dia) para o gráfico em modo team/position.
- `insights["speed_metabolic"]`: gerado pelo mesmo mecanismo heurístico existente. Cobre exposição de Velocidade Máx (%), Player Load Médio, PL/min, HML, desvio atleta-vs-equipe e desvio atleta-vs-posição.

### Frontend — `app/(tabs)/data.tsx`
- `LAYERS`: nova layer `speed` (ícone speedometer).
- `TOOLTIPS` + `TITLES`: entradas `sm_gauges` e `sm_pl_chart`.
- Nova `renderSpeedMetabolic()`: 3 gauges (Max Velocity %, Average Player Load, High Metabolic Load) + line chart (Avg Player Load vs PL/min, sólida + tracejada com legenda) + card de AI Insight. Reusa GaugeChart, LineChart, CardInfoHeader, styles e insights existentes.
- `renderActiveLayer`: case `speed`.

### Comportamento por modo (validado)
- Team: médias da equipe. Individual: histórico do atleta selecionado. Position: médias do grupo de posição. Valores diferem corretamente entre modos (ex.: Player Load Team=522 vs Individual=510).

### Null-safe
- Campos ausentes no CSV real (Max Velocity %, HML, PL/min) retornam null → gauges exibem "--"; insight omite métricas nulas; gráfico exibe estado vazio quando não há Player Load.

### Validação (import de CSV de teste de 4 dias, depois removido)
- Backend: gauges (94% / 510 / 1520), timeline de 4 dias, insight cobrindo as 6 dimensões. Limpeza: atleta + gps_data + athlete_load_metrics = 0 residual.
- Frontend: screenshots em Team e Individual com gauges, gráfico e insight renderizando corretamente; 5 layers originais intactos.

### Não implementado (fora do escopo da Fase 4, conforme instrução)
- Sprint Exposure; Game vs Training Ratio (classificação de atividade não auditada ainda).

### APIs afetadas: `GET /api/dashboard/overview` (campos aditivos). NÃO afetadas: todas as demais.


## 2026-05-29 — Fase 4B: Game vs Training (Speed & Metabolic Load)

Comparativo Jogo vs Treino dentro da layer "Speed & Metabolic Load". Usa SOMENTE atividades explicitamente classificadas (decisão de produto Opção A do usuário). Aguardando aprovação do checkpoint.

### Auditoria de classificação (read-only)
- Campo `gps_data.activity_type` JÁ existe: valores `"game"` (87 docs reais), `None` (514), `"training"` explícito (0).
- Classificação feita por endpoints existentes (`PUT /gps-data/session/{id}/activity-type`, `/classify-all`).
- Import de CSV NÃO define activity_type → nasce `None`.
- Decisão do usuário (Opção A): Game=`game`, Training=`training`, Other=`null`. **`null` NÃO é tratado como treino.** Sem inferência por nome, sem migração de histórico.

### Backend — `routes/dashboard/routes.py`
- Novo helper `compute_activity_split(athlete_ids)`: agrupa por (data, sessão), resolve, e separa em buckets game/training APENAS para `activity_type` explícito. Médias por sessão para Player Load, HML, Sprint Distance; pico para Max Velocity (%). Ratio = Média Treino ÷ Média Jogo × 100. Null-safe (sem dados / divisão por zero → None). Flags `has_game`/`has_training`.
- Resposta `/dashboard/overview` ganha `activity_split` (escopo athlete/team/position via `target_ids`).

### Frontend — `app/(tabs)/data.tsx`
- `renderSpeedMetabolic` ganha: card "Game vs Training" (barras Jogo×Treino + Ratio para os 4 métricas) e card "Game vs Training Table (Ratio)" (7 linhas: Player Load Game/Training/Ratio, HML Game/Training/Ratio, Max Velocity %).
- Estados null-safe: empty state explicativo ("comparações exigem atividades classificadas"), banners "sem treino/jogo classificado", "--" para valores nulos, "N/A" para ratios.
- Tooltips/titles `sm_game_training`, `sm_ratio_table`.

### Validação (atleta de teste, 2 sessões game + 2 training, depois removido)
- Backend: Game PL=620/HML=520/Sprint=1250/MaxVel%=95; Training PL=440/HML=310/Sprint=730/MaxVel%=86; Ratios 71% / 59.6% / 58.4% / 90.5%.
- Frontend Individual: barras + tabela conferem com backend. Null-safe: atleta real não classificado (MANSOUR, COM dados GPS) exibe empty state e "--"/"N/A" — confirma que não classificado ≠ treino.
- Team mode: agrega sessões classificadas (game=620, training=440, ratio=71%). Limpeza: residual = 0; 87 registros 'game' reais intactos.

### NÃO implementado (fora do escopo): Sprint Exposure (aguarda estratégia de Vmax histórico).
### Futuro proposto: forma mais segura de classificar atividade DENTRO do fluxo do Dashboard (hoje só via Periodização).


## 2026-05-29 — Fase 5: Regressão Final (read-only, sem novas features)

Épico "Speed & Metabolic Load" — regressão completa. Nenhuma feature nova adicionada (Sprint Exposure, seletor de classificação, PDF, gráficos/métricas extras — NÃO implementados, conforme instrução).

### Esclarecimento confirmado ao usuário
- Team Mode calcula Game vs Training ao vivo a partir de TODAS as atividades classificadas da população filtrada (`compute_activity_split(target_ids)`). Dataset de validação deletado. Prova: 28d → 0/0; 90d → 22 jogos reais (PL 688.9), 0 treino → Ratio N/A.

### Resultados da regressão
- Backend (read-only, 19/19 PASS): Overview Team (7d/28d/90d), Individual, Position; insights das 6 layers; team-table com 8 colunas novas + colunas existentes (31 linhas); /dashboard/team 200; activity_split presente; campos de velocidade null-safe.
- Frontend: 6 layers renderizam sem crash (Load Intelligence, Smart Summary, Team Status, Neuromuscular, Risk Intelligence, Speed & Metabolic). Load Intelligence intacto (gauges Acute/Chronic, timeline, ACWR zone, velocity zones).
- CSV import: `/api/csv/analyze` detecta todas as colunas (incl. novas) — compatibilidade preservada.
- Modos Team/Individual/Position: corretos. Filtros date/athlete/position: ok.
- Null-safe: atleta real sem dados → None/"--"/"N/A"/empty state; não classificado ≠ treino.
- Integridade: 0 residual de teste; 31 atletas; 601 gps_data (estado original); 87 'game' reais intactos.

### Conclusão: nenhuma funcionalidade existente quebrada. Épico funcionalmente completo.


## 2026-05-29 — Fase 6A: Dashboard Classification Workflow (Opção B — independente)

Classificação de atividades Jogo/Treino DENTRO do Dashboard, 100% independente da Periodização. Aguardando aprovação do checkpoint.

### Arquitetura (Opção B aprovada)
- Nova coleção independente `dashboard_session_classifications`: `{coach_id, session_id, activity_type: "game"|"training", classified_at}` (índice lógico coach_id+session_id; ausência = não classificado).
- NÃO escreve em gps_data, NÃO toca gps_data.activity_type, NÃO chama update_athlete_peak_values, NÃO afeta Periodização/ACWR/load engine/resolver/session_id/CSV import. Sem migração; começa 100% limpo (sem importar classificação da Periodização).

### Backend — `routes/dashboard/routes.py`
- `GET /api/dashboard/sessions` → lista sessões (agrupadas por session_id, read-only sobre gps_data) + classificação do Dashboard (null preservado + `is_classified`).
- `PUT /api/dashboard/sessions/{session_id}/classify` {game|training|null} → upsert/delete na nova coleção. `null` limpa. Valida posse da sessão (read-only). Zero efeito colateral.
- `compute_activity_split` agora lê a classificação da nova coleção (mapa session_id→tipo), não mais de `gps_data.activity_type`.

### Frontend — `app/(tabs)/data.tsx`
- Botão "Classificar Atividades" no card Jogo vs Treino (layer Speed & Metabolic).
- Modal: lista sessões (data, nº atletas, distância, status Jogo/Treino/Não classif.) com botões Jogo / Treino / Limpar por sessão. Nota de independência exibida. Ao salvar, invalida `dashboard-sessions` + `dashboard-overview` → Jogo vs Treino atualiza ao vivo.

### Validação (sessões reais classificadas e depois removidas)
- Backend: GET sessions (19, todas não classificadas no início); classify game/training → split atualiza (Game 714.8 / Training 246.9 / Ratio 34.5%); clear → game some, Ratio N/A. gps_data.activity_type intocado (distinct=[]). 
- Frontend: modal renderiza; classificar via UI popula o card ao vivo (Game 714.8 / Training 386 / Ratio 54%) e os 3 gauges.
- Independência: resolver diff vazio; nenhuma chamada a peaks/periodization/gps_data nos novos endpoints; gps_data game=87 (Periodização, intocado), training=0.
- Cleanup: coleção 11→0; overview de volta a null-safe.

### NÃO implementado (fora do escopo): Sprint Exposure, PDF, gráficos/métricas extras, classificação por-atleta (só por sessão).
