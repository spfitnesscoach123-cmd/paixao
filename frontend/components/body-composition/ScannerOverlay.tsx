/**
 * ScannerOverlay.tsx — Overlay visual do Body Scanner
 *
 * Renderiza:
 * - Silhueta guia semi-transparente
 * - Scan line animada (Reanimated)
 * - Feedback de posicionamento (OK / ajuste)
 * - Barra de progresso durante captura
 * - Skeleton do atleta com landmarks detectados
 *
 * Pure visual, nao altera logica.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { PoseValidation } from '../../engine/body-composition/bodyMapping';
import type { Landmark } from '../../engine/body-composition/bodyMapping';
import type { BodyScanPhase } from '../../hooks/useBodyScan';

interface ScannerOverlayProps {
  phase: BodyScanPhase;
  poseValidation: PoseValidation;
  progress: number;
  framesCollected: number;
  landmarks: Landmark[];
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Conexoes para skeleton simplificado
const SKELETON_CONNECTIONS: [number, number][] = [
  [11, 12], // ombros
  [11, 13], [13, 15], // braco esq
  [12, 14], [14, 16], // braco dir
  [11, 23], [12, 24], // torso
  [23, 24], // quadril
  [23, 25], [25, 27], // perna esq
  [24, 26], [26, 28], // perna dir
];

export function ScannerOverlay({
  phase,
  poseValidation,
  progress,
  framesCollected,
  landmarks,
}: ScannerOverlayProps) {
  // ============ ANIMACAO: SCAN LINE ============
  const scanLineY = useSharedValue(0);

  useEffect(() => {
    if (phase === 'positioning' || phase === 'capturing') {
      scanLineY.value = withRepeat(
        withTiming(1, { duration: 2000, easing: Easing.linear }),
        -1, // infinito
        true // reverso
      );
    }
  }, [phase, scanLineY]);

  const scanLineStyle = useAnimatedStyle(() => ({
    top: `${scanLineY.value * 100}%`,
  }));

  // ============ RENDER ============
  const showScanLine = phase === 'positioning' || phase === 'capturing';
  const showSilhouette = phase === 'positioning';
  const showProgress = phase === 'capturing';
  const showFeedback = phase === 'positioning';
  const showSkeleton = (phase === 'positioning' || phase === 'capturing') && landmarks.length >= 33;

  // Cor do feedback
  const feedbackColor = poseValidation.isFullBodyVisible && poseValidation.isGoodDistance && poseValidation.isCentered
    ? '#22c55e'
    : '#f59e0b';

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Silhueta guia */}
      {showSilhouette && (
        <View style={styles.silhouetteContainer}>
          <View style={styles.silhouette}>
            {/* Cabeca */}
            <View style={styles.silHead} />
            {/* Torso */}
            <View style={styles.silTorso} />
            {/* Bracos */}
            <View style={styles.silLeftArm} />
            <View style={styles.silRightArm} />
            {/* Pernas */}
            <View style={styles.silLeftLeg} />
            <View style={styles.silRightLeg} />
          </View>
        </View>
      )}

      {/* Skeleton do atleta */}
      {showSkeleton && (
        <View style={StyleSheet.absoluteFill}>
          {/* Pontos */}
          {[0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].map((idx) => {
            const lm = landmarks[idx];
            if (!lm || lm.visibility < 0.4) return null;
            return (
              <View
                key={`dot-${idx}`}
                style={[
                  styles.skeletonDot,
                  {
                    left: lm.x * SCREEN_W - 4,
                    top: lm.y * SCREEN_H - 4,
                    backgroundColor: lm.visibility >= 0.7 ? '#22c55e' : '#eab308',
                  },
                ]}
              />
            );
          })}
        </View>
      )}

      {/* Scan line animada */}
      {showScanLine && (
        <Animated.View style={[styles.scanLine, scanLineStyle]}>
          <View style={[styles.scanLineInner, { backgroundColor: feedbackColor }]} />
        </Animated.View>
      )}

      {/* Barra de progresso */}
      {showProgress && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {progress}% ({framesCollected} frames)
          </Text>
        </View>
      )}

      {/* Feedback de posicionamento */}
      {showFeedback && (
        <View style={styles.feedbackContainer}>
          {/* Checks individuais */}
          <View style={styles.feedbackRow}>
            <Ionicons
              name={poseValidation.isFullBodyVisible ? 'checkmark-circle' : 'close-circle'}
              size={18}
              color={poseValidation.isFullBodyVisible ? '#22c55e' : '#ef4444'}
            />
            <Text style={styles.feedbackText}>Corpo inteiro visivel</Text>
          </View>
          <View style={styles.feedbackRow}>
            <Ionicons
              name={poseValidation.isGoodDistance ? 'checkmark-circle' : 'close-circle'}
              size={18}
              color={poseValidation.isGoodDistance ? '#22c55e' : '#ef4444'}
            />
            <Text style={styles.feedbackText}>Distancia adequada</Text>
          </View>
          <View style={styles.feedbackRow}>
            <Ionicons
              name={poseValidation.isCentered ? 'checkmark-circle' : 'close-circle'}
              size={18}
              color={poseValidation.isCentered ? '#22c55e' : '#ef4444'}
            />
            <Text style={styles.feedbackText}>Centralizado</Text>
          </View>

          {/* Mensagem principal */}
          {poseValidation.message && (
            <View style={styles.messageContainer}>
              <Text style={styles.messageText}>{poseValidation.message}</Text>
            </View>
          )}

          {/* Indicador de confianca */}
          <Text style={[styles.confidenceText, { color: feedbackColor }]}>
            Confianca: {Math.round(poseValidation.confidence * 100)}%
          </Text>
        </View>
      )}

      {/* Indicador de captura ativa */}
      {phase === 'capturing' && (
        <View style={styles.capturingBadge}>
          <View style={styles.capturingDot} />
          <Text style={styles.capturingText}>Capturando... Fique parado</Text>
        </View>
      )}

      {/* Processing spinner */}
      {phase === 'processing' && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <Text style={styles.processingText}>Processando proporcoes...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  // Silhueta
  silhouetteContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.2,
  },
  silhouette: {
    width: 120,
    height: 300,
    alignItems: 'center',
  },
  silHead: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  silTorso: {
    width: 60,
    height: 100,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 8,
    marginTop: 4,
  },
  silLeftArm: {
    position: 'absolute',
    left: 0,
    top: 48,
    width: 20,
    height: 90,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 4,
  },
  silRightArm: {
    position: 'absolute',
    right: 0,
    top: 48,
    width: 20,
    height: 90,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 4,
  },
  silLeftLeg: {
    position: 'absolute',
    left: 25,
    bottom: 0,
    width: 25,
    height: 120,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 4,
  },
  silRightLeg: {
    position: 'absolute',
    right: 25,
    bottom: 0,
    width: 25,
    height: 120,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 4,
  },
  // Scan line
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    zIndex: 10,
  },
  scanLineInner: {
    flex: 1,
    borderRadius: 2,
    opacity: 0.7,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  // Skeleton dots
  skeletonDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    zIndex: 5,
  },
  // Progress
  progressContainer: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 20,
  },
  progressBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#22c55e',
    borderRadius: 3,
  },
  progressText: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 4,
    opacity: 0.8,
  },
  // Feedback
  feedbackContainer: {
    position: 'absolute',
    bottom: 140,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 12,
    padding: 12,
    zIndex: 20,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  feedbackText: {
    color: '#e0e0e0',
    fontSize: 13,
  },
  messageContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  messageText: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  confidenceText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    fontWeight: '600',
  },
  // Capturing badge
  capturingBadge: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    zIndex: 20,
  },
  capturingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  capturingText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Processing
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 30,
  },
  processingCard: {
    backgroundColor: 'rgba(15, 22, 41, 0.95)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  processingText: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '600',
  },
});
