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
