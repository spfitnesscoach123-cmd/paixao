// LoadManager Pro - Design System
// Palette derived from the official logo (Azul Marinho + Verde Performance + Azul Safira)
// Theme tokens are kept with legacy keys for backwards compatibility with existing components.
// Supported modes: 'dark' | 'light'

export type ThemeMode = 'dark' | 'light';

// ---------------------------------------------------------------------------
// BRAND CONSTANTS (extracted from the logo)
// ---------------------------------------------------------------------------
export const BRAND = {
  navyDeep:       '#081C3A', // App background (dominant)
  navyShield:     '#123A63', // Cards / surfaces / headings text (light mode)
  greenPerf:      '#7CFF3A', // Primary green (logo bars / arrow)
  greenTech:      '#53E65D', // Secondary green (gradient step / hover)
  blueSapphire:   '#2FB6FF', // Accent blue (top of shield / AI / links)
  white:          '#F4F7FB', // Primary text on dark
  // Derived/support tokens
  greenDeep:      '#4FCC1F', // Pressed state for primary green
  blueSapphireLt: '#7BD4FF', // Lighter sapphire variant
  navyElevated:   '#1B4C80', // Elevated surface tint (hover/active card)
} as const;

// ---------------------------------------------------------------------------
// DARK THEME (default / logo-aligned)
// ---------------------------------------------------------------------------
export const darkColors = {
  // Backgrounds
  dark: {
    primary:   BRAND.navyDeep,                    // main screen bg
    secondary: '#0C2548',                          // one shade above primary
    tertiary:  '#0F2F59',                          // nested area
    card:      'rgba(18, 58, 99, 0.72)',          // cards with soft transparency
    cardSolid: BRAND.navyShield,                   // solid card variant
  },

  // Accent (primary CTA = brand green)
  accent: {
    primary:   BRAND.greenPerf,                    // CTA / active / toggles ON
    secondary: BRAND.greenTech,                    // hover / complementary
    tertiary:  BRAND.blueSapphire,                 // AI / secondary emphasis
    blue:      BRAND.blueSapphire,                 // links / focus / info
    light:     BRAND.blueSapphireLt,               // soft accent
  },

  // Gradients
  gradients: {
    primary:    [BRAND.greenPerf,   BRAND.greenTech]    as [string, string],
    secondary:  [BRAND.greenTech,   BRAND.blueSapphire] as [string, string],
    accent:     [BRAND.blueSapphire, BRAND.blueSapphireLt] as [string, string],
    button:     [BRAND.greenPerf,   BRAND.greenTech]    as [string, string],
    card:       ['rgba(124, 255, 58, 0.10)', 'rgba(47, 182, 255, 0.04)'] as [string, string],
    dark:       [BRAND.navyDeep,    '#0C2548']          as [string, string],
    background: [BRAND.navyDeep,    '#0C2548']          as [string, string],
  },

  // Highlight / data-viz accents
  highlight: {
    cyan:    BRAND.blueSapphire,
    green:   BRAND.greenPerf,
    emerald: BRAND.greenTech,
  },

  // Text
  text: {
    primary:   BRAND.white,
    secondary: 'rgba(244, 247, 251, 0.70)',
    tertiary:  'rgba(244, 247, 251, 0.50)',
    disabled:  'rgba(244, 247, 251, 0.30)',
  },

  // Status
  status: {
    success: BRAND.greenPerf,
    warning: '#F5B941',
    error:   '#FF4D6D',
    info:    BRAND.blueSapphire,
  },

  // Borders
  border: {
    default: 'rgba(124, 255, 58, 0.20)',           // per spec
    active:  BRAND.greenPerf,
    glow:    'rgba(124, 255, 58, 0.45)',
  },

  // Inputs
  input: {
    background: 'rgba(18, 58, 99, 0.55)',
    border:     'rgba(124, 255, 58, 0.30)',
    placeholder: 'rgba(244, 247, 251, 0.45)',
  },
};

// ---------------------------------------------------------------------------
// LIGHT THEME (logo-aligned)
// ---------------------------------------------------------------------------
export const lightColors = {
  // Backgrounds
  dark: {
    primary:   BRAND.white,                        // clean ice-white bg
    secondary: '#EAF0F7',
    tertiary:  '#DDE6F0',
    card:      'rgba(255, 255, 255, 0.92)',        // translucent white cards
    cardSolid: '#FFFFFF',
  },

  accent: {
    primary:   BRAND.greenPerf,
    secondary: BRAND.greenTech,
    tertiary:  BRAND.blueSapphire,
    blue:      BRAND.blueSapphire,
    light:     BRAND.blueSapphireLt,
  },

  gradients: {
    primary:    [BRAND.greenPerf,   BRAND.greenTech]    as [string, string],
    secondary:  [BRAND.greenTech,   BRAND.blueSapphire] as [string, string],
    accent:     [BRAND.blueSapphire, BRAND.blueSapphireLt] as [string, string],
    button:     [BRAND.greenPerf,   BRAND.greenTech]    as [string, string],
    card:       ['rgba(124, 255, 58, 0.08)', 'rgba(47, 182, 255, 0.04)'] as [string, string],
    dark:       ['#EAF0F7',         BRAND.white]        as [string, string],
    background: [BRAND.white,       '#EAF0F7']          as [string, string],
  },

  highlight: {
    cyan:    BRAND.blueSapphire,
    green:   BRAND.greenPerf,
    emerald: BRAND.greenTech,
  },

  text: {
    primary:   BRAND.navyShield,
    secondary: 'rgba(18, 58, 99, 0.72)',
    tertiary:  'rgba(18, 58, 99, 0.55)',
    disabled:  'rgba(18, 58, 99, 0.35)',
  },

  status: {
    success: '#22A72C',
    warning: '#D48A0C',
    error:   '#D13B55',
    info:    BRAND.blueSapphire,
  },

  border: {
    default: BRAND.greenPerf,                      // per spec: card borders green
    active:  BRAND.greenPerf,
    glow:    'rgba(124, 255, 58, 0.35)',
  },

  input: {
    background: '#FFFFFF',
    border:     'rgba(18, 58, 99, 0.20)',
    placeholder: 'rgba(18, 58, 99, 0.45)',
  },
};

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
export const getColors = (mode: ThemeMode) => (mode === 'dark' ? darkColors : lightColors);

// Legacy export (keeps older imports working; defaults to dark)
export const colors = darkColors;

export const getShadows = (mode: ThemeMode) => {
  const isDark = mode === 'dark';
  return {
    card: {
      shadowColor: isDark ? BRAND.greenPerf : '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.22 : 0.10,
      shadowRadius: 16,
      elevation: 8,
    },
    cardSubtle: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.35 : 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
    glow: {
      shadowColor: BRAND.greenPerf,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: isDark ? 0.55 : 0.30,
      shadowRadius: 20,
      elevation: 12,
    },
    button: {
      shadowColor: BRAND.greenPerf,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.45 : 0.25,
      shadowRadius: 16,
      elevation: 8,
    },
  };
};

export const shadows = getShadows('dark');
