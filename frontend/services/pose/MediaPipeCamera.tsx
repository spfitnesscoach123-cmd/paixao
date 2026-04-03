/**
 * MediaPipeCamera — Componente de camera com MediaPipe Pose Detection.
 *
 * Usa o modulo Expo local `mediapipe-pose` em iOS/Android (native).
 * Na web ou quando o modulo nao esta linkado, entra em modo simulacao.
 *
 * ARQUITETURA:
 * - Native (iOS/Android): AVCaptureSession/CameraX + MediaPipe Tasks Vision
 *   processamento 100% nativo, JS recebe apenas landmarks serializados
 * - Web: Modo simulacao com PoseSimulator (fallback)
 *
 * INTEGRACAO COM PIPELINE:
 * - Landmarks nativos -> getFrameTimestamp(nativeTimestamp) -> frameTime.ts
 * - Conecta com poseDetector.ts via onLandmark callback
 * - PoseCamera.tsx consome este componente
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import type { RawLandmark } from './types';
import { getFrameTimestamp } from '../frameTime';

// Importacao condicional do modulo nativo
let NativePoseView: React.ComponentType<any> | null = null;
let nativeAvailable = false;

if (Platform.OS !== 'web') {
  try {
    const mod = require('mediapipe-pose');
    NativePoseView = mod.MediaPipePoseView;
    nativeAvailable = mod.NATIVE_POSE_AVAILABLE;
  } catch {
    // Modulo nao linkado — fallback para simulacao
  }
}

/** Flag global: MediaPipe nativo esta disponivel? */
export const MEDIAPIPE_AVAILABLE: boolean = nativeAvailable;

export interface MediaPipeCameraProps {
  style?: any;
  onLandmark?: (landmarks: RawLandmark[], timestamp: number) => void;
  cameraType?: 'front' | 'back';
  isActive?: boolean;
  fps?: number;
  modelComplexity?: 0 | 1 | 2;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
  children?: React.ReactNode;
}

export function MediaPipeCamera(props: MediaPipeCameraProps) {
  const {
    style,
    onLandmark,
    cameraType = 'back',
    isActive = true,
    modelComplexity = 0,
    minDetectionConfidence = 0.6,
    minTrackingConfidence = 0.6,
    children,
  } = props;

  const onLandmarkRef = useRef(onLandmark);
  useEffect(() => { onLandmarkRef.current = onLandmark; }, [onLandmark]);

  // Handler para eventos nativos de pose detectada
  const handlePoseDetected = useCallback((event: any) => {
    const data = event?.nativeEvent ?? event;
    if (!data?.landmarks || !Array.isArray(data.landmarks)) return;

    // Usar timestamp nativo do frame (monotônico, vindo do CMSampleBuffer/ImageProxy)
    const timestamp = getFrameTimestamp(
      typeof data.timestamp === 'number' ? data.timestamp : undefined
    );

    const landmarks: RawLandmark[] = data.landmarks.map((lm: any) => ({
      x: lm.x ?? 0,
      y: lm.y ?? 0,
      z: lm.z ?? 0,
      visibility: lm.visibility ?? 0,
    }));

    onLandmarkRef.current?.(landmarks, timestamp);
  }, []);

  // RENDER: Modulo nativo disponivel (iOS/Android apos EAS build)
  if (NativePoseView && nativeAvailable) {
    return (
      <View style={[styles.container, style]}>
        <NativePoseView
          style={styles.camera}
          cameraFacing={cameraType}
          isActive={isActive}
          modelComplexity={modelComplexity}
          minDetectionConfidence={minDetectionConfidence}
          minTrackingConfidence={minTrackingConfidence}
          onPoseDetected={handlePoseDetected}
          onError={(e: any) => {
            const msg = e?.nativeEvent?.message ?? e?.message ?? 'Erro desconhecido';
            console.warn('[MediaPipeCamera] Erro nativo:', msg);
          }}
          onCameraReady={() => {
            console.log('[MediaPipeCamera] Camera nativa pronta');
          }}
        />
        {children}
      </View>
    );
  }

  // RENDER: Fallback (web ou modulo nao linkado)
  return (
    <View style={[styles.container, style]}>
      {children}
      <View style={styles.placeholder}>
        <Text style={styles.text}>Camera nativa indisponivel</Text>
        <Text style={styles.subtext}>
          {Platform.OS === 'web'
            ? 'Modo simulacao ativo (web)'
            : 'Execute EAS build para ativar MediaPipe nativo'
          }
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
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
