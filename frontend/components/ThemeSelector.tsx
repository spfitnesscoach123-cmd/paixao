import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ThemePreference } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * ThemeSelector - segmented control for app appearance.
 * Values: 'light' | 'dark' | 'auto'
 * Persists preference via ThemeContext -> AsyncStorage.
 */
export const ThemeSelector: React.FC = () => {
  const { colors, preference, setPreference } = useTheme();
  const { t } = useLanguage();

  const options: { key: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'light', label: t('settings.lightMode') || 'Claro',      icon: 'sunny-outline' },
    { key: 'dark',  label: t('settings.darkMode')  || 'Escuro',     icon: 'moon-outline' },
    { key: 'auto',  label: t('settings.autoMode')  || 'Automático', icon: 'phone-portrait-outline' },
  ];

  return (
    <View
      style={[
        styles.wrapper,
        { backgroundColor: colors.dark.card, borderColor: colors.border.default },
      ]}
      testID="theme-selector"
    >
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: 'rgba(47, 182, 255, 0.18)' }]}>
          <Ionicons name="color-palette-outline" size={22} color={colors.accent.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text.primary }]}>
            {t('settings.appearance') || 'Aparência'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.text.tertiary }]}>
            {t('settings.themeSubtitle') || 'Personalize a aparência do app'}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.segment,
          { backgroundColor: 'rgba(0,0,0,0.15)', borderColor: colors.border.default },
        ]}
      >
        {options.map((opt) => {
          const selected = preference === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => setPreference(opt.key)}
              style={({ pressed }) => [
                styles.segmentItem,
                selected && { backgroundColor: colors.accent.primary },
                pressed && { opacity: 0.85 },
              ]}
              testID={`theme-option-${opt.key}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Ionicons
                name={opt.icon}
                size={16}
                color={selected ? '#081C3A' : colors.text.secondary}
              />
              <Text
                style={[
                  styles.segmentText,
                  { color: selected ? '#081C3A' : colors.text.secondary },
                  selected && { fontWeight: '700' },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '600' },
  subtitle: { fontSize: 12, marginTop: 2 },
  segment: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  segmentText: { fontSize: 13 },
});

export default ThemeSelector;
