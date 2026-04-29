# CHANGELOG


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

