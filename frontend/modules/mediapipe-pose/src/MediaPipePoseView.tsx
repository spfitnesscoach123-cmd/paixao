/**
 * mediapipe-pose — Wrapper React para a View nativa
 *
 * Renderiza a câmera nativa com processamento MediaPipe.
 * Na web, retorna null (fallback é gerenciado pelo PoseCamera.tsx pai).
 *
 * Compativel com Fabric (New Architecture) via requireNativeViewManager.
 */

import React from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
import type { MediaPipePoseViewProps } from './MediaPipePose.types';

// Nome do modulo Expo (definido em MediaPipePoseModule.swift: Name("MediaPipePose"))
const MODULE_NAME = 'MediaPipePose';

// Carrega a view nativa via expo-modules-core (compativel com Fabric + Paper)
let NativeView: React.ComponentType<any> | null = null;

if (Platform.OS !== 'web') {
  try {
    const { requireNativeViewManager } = require('expo-modules-core');
    NativeView = requireNativeViewManager(MODULE_NAME);
  } catch {
    // Modulo nao linkado nesta plataforma
  }
}

/**
 * Componente React que encapsula a view nativa de câmera + MediaPipe.
 * Retorna placeholder na web ou quando o módulo nativo não está disponível.
 */
export function MediaPipePoseView(props: MediaPipePoseViewProps) {
  if (NativeView) {
    return <NativeView {...props} />;
  }

  // Fallback para web ou quando o módulo nativo não está linkado
  return (
    <View style={[styles.fallback, props.style]}>
      <Text style={styles.text}>MediaPipe nativo indisponível nesta plataforma</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#888',
    fontSize: 14,
  },
});
