/**
 * mediapipe-pose — Wrapper React para a View nativa
 *
 * Renderiza a câmera nativa com processamento MediaPipe.
 * Na web, retorna null (fallback é gerenciado pelo PoseCamera.tsx pai).
 */

import React from 'react';
import { Platform, requireNativeComponent, UIManager, View, Text, StyleSheet } from 'react-native';
import type { MediaPipePoseViewProps } from './MediaPipePose.types';

const NATIVE_VIEW_NAME = 'MediaPipePoseView';

const isNativeAvailable =
  Platform.OS !== 'web' &&
  UIManager.getViewManagerConfig != null &&
  UIManager.getViewManagerConfig(NATIVE_VIEW_NAME) != null;

const NativeView = isNativeAvailable
  ? requireNativeComponent<MediaPipePoseViewProps>(NATIVE_VIEW_NAME)
  : null;

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
