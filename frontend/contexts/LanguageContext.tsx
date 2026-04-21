import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import i18n, { loadSavedLanguage, saveLanguage, languages, isRTL } from '../i18n';

interface LanguageContextType {
  locale: string;
  setLocale: (code: string) => Promise<void>;
  t: (key: string, options?: object) => string;
  languages: typeof languages;
  isRTL: boolean;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState(i18n.locale);
  const [isLoading, setIsLoading] = useState(true);
  // Reentrancy guard: prevents concurrent setLocale executions that cascade
  // re-renders across ~56 consumers and race against native UIView teardown.
  const isChangingRef = useRef(false);

  useEffect(() => {
    initLanguage();
  }, []);

  const initLanguage = async () => {
    const savedLocale = await loadSavedLanguage();
    setLocaleState(savedLocale);
    setIsLoading(false);
  };

  const setLocale = async (code: string) => {
    // Ignore reentrant calls while a previous switch is still resolving
    // (AsyncStorage.setItem + i18n.locale mutation + setState cascade).
    if (isChangingRef.current) return;
    if (code === locale) return;
    isChangingRef.current = true;
    try {
      await saveLanguage(code);
      setLocaleState(code);
    } finally {
      isChangingRef.current = false;
    }
  };

  // useCallback with locale dependency ensures t() triggers re-renders when locale changes
  const t = useCallback((key: string, options?: object): string => {
    return i18n.t(key, options);
  }, [locale]);

  return (
    <LanguageContext.Provider
      value={{
        locale,
        setLocale,
        t,
        languages,
        isRTL: isRTL(),
        isLoading,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
