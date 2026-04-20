import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ThemeMode,
  getColors,
  getShadows,
  darkColors,
} from '../constants/theme';

export type ThemePreference = 'light' | 'dark' | 'auto';

interface ThemeContextType {
  theme: ThemeMode;                       // resolved active theme (light|dark)
  preference: ThemePreference;            // user's stored preference (light|dark|auto)
  setPreference: (pref: ThemePreference) => Promise<void>;
  colors: typeof darkColors;              // resolved token set
  shadows: ReturnType<typeof getShadows>;
  isDark: boolean;
}

const STORAGE_KEY = 'lmp:theme-preference';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  const [hydrated, setHydrated] = useState(false);

  // Load stored preference once
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark' || saved === 'auto') {
          setPreferenceState(saved);
        }
      } catch {
        // noop - fallback to default
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const setPreference = useCallback(async (pref: ThemePreference) => {
    setPreferenceState(pref);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, pref);
    } catch {
      // noop - still applied in-memory
    }
  }, []);

  // Resolve active theme
  const resolved: ThemeMode =
    preference === 'auto'
      ? (systemScheme === 'light' ? 'light' : 'dark')
      : preference;

  const value: ThemeContextType = {
    theme: resolved,
    preference,
    setPreference,
    colors: getColors(resolved),
    shadows: getShadows(resolved),
    isDark: resolved === 'dark',
  };

  // Until hydrated we render children with defaults; changing later just re-renders.
  // We don't block the tree to avoid a white flash at startup.
  void hydrated;

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
