import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from '../locales/en.json';
import pt from '../locales/pt.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import zh from '../locales/zh.json';
import ar from '../locales/ar.json';

export const LANGUAGE_KEY = '@app_language';

export const languages = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', rtl: true },
];

const i18n = new I18n({
  en,
  pt,
  es,
  fr,
  zh,
  ar,
});

// Set the initial locale
i18n.defaultLocale = 'en';
i18n.enableFallback = true;

// Get device locale and set as default
const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
const supportedLocales = ['en', 'pt', 'es', 'fr', 'zh', 'ar'];
i18n.locale = supportedLocales.includes(deviceLocale) ? deviceLocale : 'en';

// Function to load saved language
export const loadSavedLanguage = async (): Promise<string> => {
  try {
    const savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (savedLanguage && supportedLocales.includes(savedLanguage)) {
      i18n.locale = savedLanguage;
      return savedLanguage;
    }
  } catch (error) {
    console.log('Error loading saved language:', error);
  }
  return i18n.locale;
};

// Function to save language preference
export const saveLanguage = async (languageCode: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, languageCode);
    i18n.locale = languageCode;
  } catch (error) {
    console.log('Error saving language:', error);
  }
};

// Function to check if current language is RTL
export const isRTL = (): boolean => {
  return i18n.locale === 'ar';
};

export default i18n;
