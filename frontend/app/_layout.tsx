import React from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { RevenueCatProvider } from '../contexts/RevenueCatContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

/**
 * RootLayout - Layout raiz do aplicativo
 * 
 * Providers incluídos (ordem importante):
 * 1. QueryClientProvider - React Query para cache de dados
 * 2. ThemeProvider - Tema do aplicativo
 * 3. LanguageProvider - Internacionalização
 * 4. AuthProvider - Autenticação
 * 5. RevenueCatProvider - Controle de assinaturas e gates premium
 */
export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <RevenueCatProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="role-select" />
                <Stack.Screen name="athlete-token" />
                <Stack.Screen name="athlete-wellness" />
                <Stack.Screen name="generate-wellness-token" />
                <Stack.Screen name="login" />
                <Stack.Screen name="register" />
                <Stack.Screen name="forgot-password" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="athlete/[id]/vbt-camera" />
              </Stack>
            </RevenueCatProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
