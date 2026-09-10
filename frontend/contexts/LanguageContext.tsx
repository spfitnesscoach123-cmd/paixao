import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
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

  useEffect(() => {
    initLanguage();
  }, []);

  const initLanguage = async () => {
    const savedLocale = await loadSavedLanguage();
    setLocaleState(savedLocale);
    setIsLoading(false);
  };

  const setLocale = async (code: string) => {
    await saveLanguage(code);
    setLocaleState(code);
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
