import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';

export default function TabsLayout() {
  const { t } = useLanguage();
  const { colors } = useTheme();
  
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent.primary,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarStyle: {
          backgroundColor: colors.dark.secondary,
          borderTopWidth: 1,
          borderTopColor: colors.border.default,
          height: 65,
          paddingBottom: 10,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.5,
        },
        headerStyle: {
          backgroundColor: colors.dark.secondary,
        },
        headerTintColor: colors.text.primary,
        headerTitleStyle: {
          fontWeight: 'bold',
          fontSize: 18,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="athletes"
        options={{
          title: t('tabs.athletes'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size + 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: t('tabs.team') || 'Equipe',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="analytics" size={size + 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="data"
        options={{
          title: t('tabs.dashboard'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart" size={size + 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size + 2} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
