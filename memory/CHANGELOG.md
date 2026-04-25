# CHANGELOG

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
