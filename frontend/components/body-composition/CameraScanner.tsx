/**
 * CameraScanner.tsx — Componente de camera para Body Scan
 *
 * Encapsula MediaPipeCamera (back camera, 30fps) e converte
 * landmarks nativos para o formato Landmark[] do bodyMapping engine.
 *
 * Segue o padrao de 3 estagios do jump-camera para inicializacao segura:
 *   STAGE 1: Camera pronta (primeiro frame recebido)
 *   STAGE 2: MediaPipe pronta (primeiro landmark valido)
 *   STAGE 3: Engine pronta (delay de estabilizacao)
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { CameraView } from 'expo-camera';
import { MediaPipeCamera, MEDIAPIPE_AVAILABLE } from '../../services/pose/MediaPipeCamera';
import type { Landmark } from '../../engine/body-composition/bodyMapping';

interface CameraScannerProps {
  isActive: boolean;
  onLandmarks: (landmarks: Landmark[]) => void;
  onReady: () => void;
  style?: any;
  children?: React.ReactNode;
}

export function CameraScanner({ isActive, onLandmarks, onReady, style, children }: CameraScannerProps) {
  const [cameraReady, setCameraReady] = useState(false);
  const [mediapipeReady, setMediapipeReady] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const frameCountRef = useRef(0);
  const isProcessingRef = useRef(false);
  const onLandmarksRef = useRef(onLandmarks);
  const onReadyRef = useRef(onReady);

  useEffect(() => { onLandmarksRef.current = onLandmarks; }, [onLandmarks]);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  // STAGE 3: Engine ready apos camera + mediapipe confirmados
  useEffect(() => {
    if (!cameraReady || !mediapipeReady || engineReady) return;
    const timer = setTimeout(() => {
      setEngineReady(true);
      onReadyRef.current();
    }, 200);
    return () => clearTimeout(timer);
  }, [cameraReady, mediapipeReady, engineReady]);

  // Reset quando desativado
  useEffect(() => {
    if (!isActive) {
      setCameraReady(false);
      setMediapipeReady(false);
      setEngineReady(false);
      frameCountRef.current = 0;
    }
  }, [isActive]);

  /**
   * Callback do MediaPipeCamera.
   * Converte RawLandmark[] para Landmark[] (bodyMapping format).
   */
  const handleLandmarks = useCallback((event: any) => {
    if (isProcessingRef.current) return;
    if (!event) return;

    isProcessingRef.current = true;
    frameCountRef.current++;

    try {
      const data = event?.nativeEvent ?? event;
      let rawLandmarks: any[] = [];

      if (Array.isArray(data)) {
        rawLandmarks = data;
      } else if (data?.landmarks && Array.isArray(data.landmarks)) {
        rawLandmarks = data.landmarks;
      } else if (data?.poseLandmarks && Array.isArray(data.poseLandmarks)) {
        rawLandmarks = data.poseLandmarks;
      }

      // STAGE 1: Camera ready
      if (!cameraReady) {
        setCameraReady(true);
        return;
      }

      // STAGE 2: MediaPipe ready (valida landmarks)
      if (!mediapipeReady) {
        if (rawLandmarks.length >= 33) {
          const hip = rawLandmarks[23];
          const ankle = rawLandmarks[27];
          if (hip && ankle && (hip.visibility ?? hip.score ?? 0) > 0.3) {
            setMediapipeReady(true);
          }
        }
        return;
      }

      // STAGE 3: Engine ready
      if (!engineReady) return;

      // Converter para formato Landmark[]
      const landmarks: Landmark[] = rawLandmarks.map((lm: any) => ({
        x: lm.x ?? 0,
        y: lm.y ?? 0,
        z: lm.z ?? 0,
        visibility: lm.visibility ?? lm.score ?? 0.5,
      }));

      if (landmarks.length >= 33) {
        onLandmarksRef.current(landmarks);
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, [cameraReady, mediapipeReady, engineReady]);

  if (!isActive) return null;

  // Status text
  const getStatusText = () => {
    if (!cameraReady) return 'Inicializando camera...';
    if (!mediapipeReady) return 'Iniciando deteccao de pose...';
    if (!engineReady) return 'Preparando scanner...';
    return 'Scanner pronto';
  };

  return (
    <View style={[styles.container, style]}>
      {Platform.OS !== 'web' && MEDIAPIPE_AVAILABLE ? (
        <MediaPipeCamera
          style={StyleSheet.absoluteFill}
          onLandmark={handleLandmarks}
          cameraType="back"
          fps={30}
          modelComplexity={1}
          minDetectionConfidence={0.6}
          minTrackingConfidence={0.6}
        />
      ) : (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          onCameraReady={() => {
            setCameraReady(true);
            setTimeout(() => {
              setMediapipeReady(true);
              setEngineReady(true);
              onReadyRef.current();
            }, 100);
          }}
        >
          <View style={styles.fallbackOverlay}>
            <Text style={styles.fallbackText}>
              MediaPipe nao disponivel.{'\n'}Use dispositivo fisico com Dev Build.
            </Text>
          </View>
        </CameraView>
      )}

      {/* Status indicator (antes de engine ready) */}
      {!engineReady && (
        <View style={styles.statusOverlay}>
          <ActivityIndicator size="small" color="#f59e0b" />
          <Text style={styles.statusText}>{getStatusText()}</Text>
        </View>
      )}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  fallbackOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  fallbackText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },
  statusOverlay: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    zIndex: 50,
  },
  statusText: {
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: '500',
  },
});
