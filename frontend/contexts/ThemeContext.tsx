import React, { createContext, useContext, ReactNode } from 'react';
import { ThemeMode, getShadows, darkColors } from '../constants/theme';

interface ThemeContextType {
  theme: ThemeMode;
  colors: typeof darkColors;
  shadows: ReturnType<typeof getShadows>;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Always use dark theme
  const value: ThemeContextType = {
    theme: 'dark',
    colors: darkColors,
    shadows: getShadows('dark'),
    isDark: true,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Hook for getting themed styles
export const useThemedStyles = <T extends Record<string, any>>(
  styleFactory: (colors: typeof darkColors, isDark: boolean) => T
): T => {
  const { colors, isDark } = useTheme();
  return styleFactory(colors, isDark);
};
