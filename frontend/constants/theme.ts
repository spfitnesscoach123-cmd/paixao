// Spectral Dark Theme
export const colors = {
  // Backgrounds
  dark: {
    primary: '#0a0e1a',
    secondary: '#1a1f2e',
    tertiary: '#1e293b',
    card: 'rgba(30, 41, 59, 0.8)',
    cardSolid: '#1e293b',
  },
  
  // Spectral Colors
  spectral: {
    cyan: '#00d4ff',
    blue: '#0ea5e9',
    teal: '#22d3ee',
    green: '#00ff88',
    emerald: '#10b981',
    purple: '#a78bfa',
    pink: '#f472b6',
  },
  
  // Gradients
  gradients: {
    cyan: ['#00d4ff', '#0ea5e9'],
    green: ['#00ff88', '#10b981'],
    purple: ['#a78bfa', '#8b5cf6'],
    blue: ['#3b82f6', '#1e40af'],
    teal: ['#22d3ee', '#06b6d4'],
    pink: ['#f472b6', '#ec4899'],
  },
  
  // Text
  text: {
    primary: '#e2e8f0',
    secondary: '#94a3b8',
    tertiary: '#64748b',
    disabled: '#475569',
  },
  
  // Status
  status: {
    success: '#00ff88',
    warning: '#fbbf24',
    error: '#ef4444',
    info: '#00d4ff',
  },
  
  // Borders
  border: {
    default: 'rgba(148, 163, 184, 0.1)',
    active: '#00d4ff',
    glow: 'rgba(0, 212, 255, 0.3)',
  },
};

export const shadows = {
  card: {
    shadowColor: '#00d4ff',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  cardSubtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  glow: {
    shadowColor: '#00ff88',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
};
