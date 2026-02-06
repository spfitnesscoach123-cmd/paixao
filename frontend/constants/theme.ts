// Spectral Dark Theme - Violeta/Azul
export const colors = {
  // Backgrounds - Azul escuro para preto
  dark: {
    primary: '#0a0e1a',
    secondary: '#0f1629',
    tertiary: '#151c32',
    card: 'rgba(21, 28, 50, 0.9)',
    cardSolid: '#151c32',
  },
  
  // Cores principais - Violeta para Azul
  accent: {
    primary: '#8b5cf6',    // Violeta principal
    secondary: '#7c3aed',  // Violeta mais escuro
    tertiary: '#6366f1',   // Indigo
    blue: '#3b82f6',       // Azul
    light: '#a78bfa',      // Violeta claro
  },
  
  // Gradientes - Violeta para Azul
  gradients: {
    primary: ['#8b5cf6', '#3b82f6'],      // Violeta -> Azul (principal)
    secondary: ['#7c3aed', '#2563eb'],    // Violeta escuro -> Azul escuro
    accent: ['#a78bfa', '#6366f1'],       // Violeta claro -> Indigo
    button: ['#8b5cf6', '#6366f1'],       // Botões
    card: ['rgba(139, 92, 246, 0.15)', 'rgba(59, 130, 246, 0.05)'], // Cards
    dark: ['#0f1629', '#0a0e1a'],         // Background
  },
  
  // Cores de destaque
  highlight: {
    cyan: '#22d3ee',
    green: '#10b981',
    emerald: '#34d399',
  },
  
  // Text
  text: {
    primary: '#f1f5f9',
    secondary: '#94a3b8',
    tertiary: '#64748b',
    disabled: '#475569',
  },
  
  // Status
  status: {
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#8b5cf6',
  },
  
  // Borders
  border: {
    default: 'rgba(139, 92, 246, 0.2)',
    active: '#8b5cf6',
    glow: 'rgba(139, 92, 246, 0.4)',
  },
};

export const shadows = {
  card: {
    shadowColor: '#8b5cf6',
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
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  button: {
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
};
