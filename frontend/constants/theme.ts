// Theme Configuration - Dark and Light Modes
// Default: Dark Mode

export type ThemeMode = 'dark' | 'light';

// Dark Theme Colors (Current default)
export const darkColors = {
  // Backgrounds - Dark blue to black
  dark: {
    primary: '#0a0e1a',
    secondary: '#0f1629',
    tertiary: '#151c32',
    card: 'rgba(21, 28, 50, 0.9)',
    cardSolid: '#151c32',
  },
  
  // Main accent colors - Violet to Blue
  accent: {
    primary: '#8b5cf6',
    secondary: '#7c3aed',
    tertiary: '#6366f1',
    blue: '#3b82f6',
    light: '#a78bfa',
  },
  
  // Gradients
  gradients: {
    primary: ['#8b5cf6', '#3b82f6'] as [string, string],
    secondary: ['#7c3aed', '#2563eb'] as [string, string],
    accent: ['#a78bfa', '#6366f1'] as [string, string],
    button: ['#8b5cf6', '#6366f1'] as [string, string],
    card: ['rgba(139, 92, 246, 0.15)', 'rgba(59, 130, 246, 0.05)'] as [string, string],
    dark: ['#0f1629', '#0a0e1a'] as [string, string],
    background: ['#0a0e1a', '#0f1629'] as [string, string],
  },
  
  // Highlight colors
  highlight: {
    cyan: '#22d3ee',
    green: '#10b981',
    emerald: '#34d399',
  },
  
  // Text colors
  text: {
    primary: '#f1f5f9',
    secondary: '#94a3b8',
    tertiary: '#64748b',
    disabled: '#475569',
  },
  
  // Status colors
  status: {
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#8b5cf6',
  },
  
  // Border colors
  border: {
    default: 'rgba(139, 92, 246, 0.2)',
    active: '#8b5cf6',
    glow: 'rgba(139, 92, 246, 0.4)',
  },
  
  // Input backgrounds
  input: {
    background: '#0f1629',
    border: 'rgba(139, 92, 246, 0.3)',
    placeholder: '#64748b',
  },
};

// Light Theme Colors
export const lightColors = {
  // Backgrounds - Clean white/gray
  dark: {
    primary: '#ffffff',
    secondary: '#f8fafc',
    tertiary: '#f1f5f9',
    card: 'rgba(255, 255, 255, 0.95)',
    cardSolid: '#ffffff',
  },
  
  // Main accent colors - Same violet/blue
  accent: {
    primary: '#7c3aed',
    secondary: '#6d28d9',
    tertiary: '#4f46e5',
    blue: '#2563eb',
    light: '#a78bfa',
  },
  
  // Gradients
  gradients: {
    primary: ['#7c3aed', '#2563eb'] as [string, string],
    secondary: ['#6d28d9', '#1d4ed8'] as [string, string],
    accent: ['#8b5cf6', '#4f46e5'] as [string, string],
    button: ['#7c3aed', '#4f46e5'] as [string, string],
    card: ['rgba(124, 58, 237, 0.08)', 'rgba(37, 99, 235, 0.03)'] as [string, string],
    dark: ['#f8fafc', '#ffffff'] as [string, string],
    background: ['#ffffff', '#f8fafc'] as [string, string],
  },
  
  // Highlight colors
  highlight: {
    cyan: '#0891b2',
    green: '#059669',
    emerald: '#10b981',
  },
  
  // Text colors
  text: {
    primary: '#1e293b',
    secondary: '#475569',
    tertiary: '#64748b',
    disabled: '#94a3b8',
  },
  
  // Status colors
  status: {
    success: '#059669',
    warning: '#d97706',
    error: '#dc2626',
    info: '#7c3aed',
  },
  
  // Border colors
  border: {
    default: 'rgba(124, 58, 237, 0.15)',
    active: '#7c3aed',
    glow: 'rgba(124, 58, 237, 0.25)',
  },
  
  // Input backgrounds
  input: {
    background: '#f8fafc',
    border: 'rgba(124, 58, 237, 0.2)',
    placeholder: '#94a3b8',
  },
};

// Get colors based on theme mode
export const getColors = (mode: ThemeMode) => {
  return mode === 'dark' ? darkColors : lightColors;
};

// Legacy export for backward compatibility (uses dark theme)
export const colors = darkColors;

// Shadows for both themes
export const getShadows = (mode: ThemeMode) => {
  const isDark = mode === 'dark';
  return {
    card: {
      shadowColor: isDark ? '#8b5cf6' : '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 16,
      elevation: 8,
    },
    cardSubtle: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.4 : 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
    glow: {
      shadowColor: '#8b5cf6',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: isDark ? 0.6 : 0.3,
      shadowRadius: 20,
      elevation: 12,
    },
    button: {
      shadowColor: '#8b5cf6',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.5 : 0.25,
      shadowRadius: 16,
      elevation: 8,
    },
  };
};

// Legacy shadows export
export const shadows = getShadows('dark');
