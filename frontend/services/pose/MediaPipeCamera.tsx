/**
 * MediaPipeCamera — STUB (MediaPipe removido para baseline build limpo)
 *
 * Este arquivo exporta as mesmas interfaces que a versao completa,
 * mas com MEDIAPIPE_AVAILABLE = false. Todos os componentes que importam
 * daqui entram automaticamente no modo fallback/simulacao.
 *
 * A integracao real com MediaPipe sera reintroduzida apos o projeto
 * estar estavel e compilando no EAS.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const MEDIAPIPE_AVAILABLE = false;

export interface MediaPipeCameraProps {
  style?: any;
  onLandmark?: (landmarks: any) => void;
  cameraType?: 'front' | 'back';
  isActive?: boolean;
  fps?: number;
  children?: React.ReactNode;
}

export function MediaPipeCamera(props: MediaPipeCameraProps) {
  return (
    <View style={[styles.container, props.style]}>
      {props.children}
      <View style={styles.placeholder}>
        <Text style={styles.text}>Camera nativa desabilitada</Text>
        <Text style={styles.subtext}>MediaPipe sera reintegrado em breve</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#e0e0e0',
    fontSize: 16,
    fontWeight: '600',
  },
  subtext: {
    color: '#888',
    fontSize: 13,
    marginTop: 8,
  },
});
