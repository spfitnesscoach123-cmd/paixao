import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from '../locales/en.json';
import pt from '../locales/pt.json';

export const LANGUAGE_KEY = '@app_language';

export const languages = [
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷' },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
];

const i18n = new I18n({
  en,
  pt,
});

// Set the initial locale
i18n.defaultLocale = 'pt';
i18n.enableFallback = true;

// Get device locale and set as default
const deviceLocale = Localization.getLocales()[0]?.languageCode || 'pt';
const supportedLocales = ['en', 'pt'];
i18n.locale = supportedLocales.includes(deviceLocale) ? deviceLocale : 'pt';

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

// Function to check if current language is RTL (kept for compatibility, always returns false)
export const isRTL = (): boolean => {
  return false;
};

export default i18n;
