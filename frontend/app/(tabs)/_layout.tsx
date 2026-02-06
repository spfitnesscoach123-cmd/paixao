import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.spectral.cyan,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarStyle: {
          backgroundColor: colors.dark.secondary,
          borderTopWidth: 1,
          borderTopColor: 'rgba(0, 212, 255, 0.2)',
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
      }}
    >
      <Tabs.Screen
        name="athletes"
        options={{
          title: 'Atletas',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size + 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="data"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart" size={size + 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size + 2} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
