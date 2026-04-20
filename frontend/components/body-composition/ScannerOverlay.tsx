/**
 * ScannerOverlay.tsx — Overlay visual premium do Body Scanner
 *
 * 4 Estados visuais:
 *   1. BUSCANDO CORPO — Silhueta guia + pulso + "Posicione-se"
 *   2. AJUSTANDO POSICAO — Skeleton parcial + checks + mensagens de ajuste
 *   3. ESCANEANDO — Scan lines multiplas + skeleton completo + progress
 *   4. PROCESSANDO — Fade overlay + spinner
 *
 * Efeitos:
 *   - 3 scan lines paralelas com glow (Reanimated)
 *   - Skeleton com conexoes (linhas entre landmarks)
 *   - Corner brackets enquadrando o corpo
 *   - Dots aparecem com fade-in por visibility
 *   - Barra de progresso com gradiente
 *   - Badge de estado com icone animado
 */

import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  interpolate,
  interpolateColor,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { PoseValidation, Landmark } from '../../engine/body-composition/bodyMapping';
import type { BodyScanPhase } from '../../hooks/useBodyScan';

interface ScannerOverlayProps {
  phase: BodyScanPhase;
  poseValidation: PoseValidation;
  progress: number;
  framesCollected: number;
  landmarks: Landmark[];
  stateLabel: string;
}

const { width: SW, height: SH } = Dimensions.get('window');

// Skeleton bone connections [from, to]
const BONES: [number, number][] = [
  [11, 12],         // ombros
  [11, 13], [13, 15], // braco esq
  [12, 14], [14, 16], // braco dir
  [11, 23], [12, 24], // torso laterais
  [23, 24],           // quadril
  [23, 25], [25, 27], // perna esq
  [24, 26], [26, 28], // perna dir
];

// Landmark indices usados
const VISIBLE_LM = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

// ============================================================
// COMPONENT
// ============================================================

export function ScannerOverlay({
  phase,
  poseValidation,
  progress,
  framesCollected,
  landmarks,
  stateLabel,
}: ScannerOverlayProps) {

  // ============ ANIMACOES (Reanimated shared values) ============
  const scanLine1Y = useSharedValue(0);
  const scanLine2Y = useSharedValue(0);
  const scanLine3Y = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const cornerPulse = useSharedValue(0);
  const dotPulse = useSharedValue(0);

  const isScanning = phase === 'positioning' || phase === 'capturing';
  const isCapturing = phase === 'capturing';

  // Scan lines: 3 linhas com offsets diferentes
  useEffect(() => {
    if (isScanning) {
      scanLine1Y.value = withRepeat(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        -1, true
      );
      scanLine2Y.value = withDelay(400,
        withRepeat(
          withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
          -1, true
        )
      );
      scanLine3Y.value = withDelay(800,
        withRepeat(
          withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
          -1, true
        )
      );
    } else {
      scanLine1Y.value = 0;
      scanLine2Y.value = 0;
      scanLine3Y.value = 0;
    }
  }, [isScanning]);

  // Pulso para silhueta (searching state)
  useEffect(() => {
    if (phase === 'positioning') {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.95, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, false
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
    }
  }, [phase]);

  // Corner brackets pulsam
  useEffect(() => {
    if (isScanning) {
      cornerPulse.value = withRepeat(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        -1, true
      );
    }
  }, [isScanning]);

  // Dot pulse para landmarks
  useEffect(() => {
    if (isScanning) {
      dotPulse.value = withRepeat(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1, true
      );
    }
  }, [isScanning]);

  // Animated styles
  const scanLine1Style = useAnimatedStyle(() => ({
    top: `${scanLine1Y.value * 85 + 5}%`,
    opacity: interpolate(scanLine1Y.value, [0, 0.5, 1], [0.3, 0.9, 0.3]),
  }));
  const scanLine2Style = useAnimatedStyle(() => ({
    top: `${scanLine2Y.value * 85 + 5}%`,
    opacity: interpolate(scanLine2Y.value, [0, 0.5, 1], [0.2, 0.6, 0.2]),
  }));
  const scanLine3Style = useAnimatedStyle(() => ({
    top: `${scanLine3Y.value * 85 + 5}%`,
    opacity: interpolate(scanLine3Y.value, [0, 0.5, 1], [0.15, 0.4, 0.15]),
  }));

  const silhouettePulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const cornerPulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cornerPulse.value, [0, 1], [0.4, 0.9]),
  }));

  // Estado visual
  const allOk = poseValidation.isFullBodyVisible && poseValidation.isGoodDistance && poseValidation.isCentered;
  const hasBody = landmarks.length >= 33;
  const showSkeleton = isScanning && hasBody;

  // Cor principal baseada no estado
  const stateColor = isCapturing ? '#22c55e'
    : allOk ? '#2FB6FF'
    : hasBody ? '#f59e0b'
    : '#7CFF3A';

  // Icone do estado
  const stateIcon = phase === 'processing' ? 'hourglass'
    : isCapturing ? 'radio-button-on'
    : allOk ? 'scan'
    : hasBody ? 'move'
    : 'search';

  return (
    <View style={styles.container} pointerEvents="none">

      {/* ============ CORNER BRACKETS ============ */}
      {isScanning && (
        <Animated.View style={[StyleSheet.absoluteFill, cornerPulseStyle]}>
          {/* Top-Left */}
          <View style={[styles.corner, styles.cornerTL, { borderColor: stateColor }]} />
          {/* Top-Right */}
          <View style={[styles.corner, styles.cornerTR, { borderColor: stateColor }]} />
          {/* Bottom-Left */}
          <View style={[styles.corner, styles.cornerBL, { borderColor: stateColor }]} />
          {/* Bottom-Right */}
          <View style={[styles.corner, styles.cornerBR, { borderColor: stateColor }]} />
        </Animated.View>
      )}

      {/* ============ SILHUETA GUIA (somente positioning sem body) ============ */}
      {phase === 'positioning' && !hasBody && (
        <Animated.View style={[styles.silhouetteWrap, silhouettePulseStyle]}>
          <View style={styles.silHead} />
          <View style={styles.silNeck} />
          <View style={styles.silTorso}>
            <View style={styles.silArmL} />
            <View style={styles.silArmR} />
          </View>
          <View style={styles.silLegs}>
            <View style={styles.silLegL} />
            <View style={styles.silLegR} />
          </View>
        </Animated.View>
      )}

      {/* ============ SKELETON (ossos + dots) ============ */}
      {showSkeleton && (
        <View style={StyleSheet.absoluteFill}>
          {/* Bones (linhas entre landmarks) */}
          {BONES.map(([a, b], i) => {
            const lmA = landmarks[a];
            const lmB = landmarks[b];
            if (!lmA || !lmB) return null;
            if (lmA.visibility < 0.4 || lmB.visibility < 0.4) return null;

            const x1 = lmA.x * SW;
            const y1 = lmA.y * SH;
            const x2 = lmB.x * SW;
            const y2 = lmB.y * SH;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            const avgVis = (lmA.visibility + lmB.visibility) / 2;

            return (
              <View
                key={`bone-${i}`}
                style={[
                  styles.bone,
                  {
                    left: x1,
                    top: y1,
                    width: length,
                    transform: [{ rotate: `${angle}deg` }],
                    backgroundColor: isCapturing ? '#22c55e' : '#2FB6FF',
                    opacity: avgVis * (isCapturing ? 0.9 : 0.6),
                  },
                ]}
              />
            );
          })}

          {/* Dots (landmarks) */}
          {VISIBLE_LM.map((idx) => {
            const lm = landmarks[idx];
            if (!lm || lm.visibility < 0.3) return null;
            const size = isCapturing ? 10 : 8;
            const dotColor = lm.visibility >= 0.7 ? '#22c55e'
              : lm.visibility >= 0.5 ? '#eab308'
              : '#ef4444';

            return (
              <View
                key={`dot-${idx}`}
                style={[
                  styles.dot,
                  {
                    left: lm.x * SW - size / 2,
                    top: lm.y * SH - size / 2,
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: dotColor,
                    opacity: lm.visibility,
                    shadowColor: dotColor,
                    shadowOpacity: 0.8,
                    shadowRadius: 4,
                  },
                ]}
              />
            );
          })}
        </View>
      )}

      {/* ============ SCAN LINES (3 linhas paralelas com glow) ============ */}
      {isScanning && (
        <>
          <Animated.View style={[styles.scanLine, scanLine1Style]}>
            <View style={[styles.scanLineGlow, { backgroundColor: stateColor, shadowColor: stateColor }]} />
          </Animated.View>
          <Animated.View style={[styles.scanLine, styles.scanLineSecondary, scanLine2Style]}>
            <View style={[styles.scanLineGlow, styles.scanLineGlowThin, { backgroundColor: stateColor, shadowColor: stateColor }]} />
          </Animated.View>
          <Animated.View style={[styles.scanLine, styles.scanLineTertiary, scanLine3Style]}>
            <View style={[styles.scanLineGlow, styles.scanLineGlowFaint, { backgroundColor: stateColor, shadowColor: stateColor }]} />
          </Animated.View>
        </>
      )}

      {/* ============ STATE BADGE (topo) ============ */}
      {isScanning && (
        <View style={styles.stateBadge}>
          <View style={[styles.stateDot, { backgroundColor: stateColor }]} />
          <Ionicons name={stateIcon as any} size={16} color={stateColor} />
          <Text style={[styles.stateText, { color: stateColor }]}>{stateLabel}</Text>
        </View>
      )}

      {/* ============ PROGRESS BAR (captura) ============ */}
      {isCapturing && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress}%`, backgroundColor: '#22c55e' }]} />
            <View style={[styles.progressGlow, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {progress}%  |  {framesCollected} frames
          </Text>
        </View>
      )}

      {/* ============ FEEDBACK CARD (posicionamento) ============ */}
      {phase === 'positioning' && hasBody && (
        <View style={styles.feedbackCard}>
          <FeedbackCheck ok={poseValidation.isFullBodyVisible} label="Corpo inteiro visivel" />
          <FeedbackCheck ok={poseValidation.isGoodDistance} label="Distancia adequada" />
          <FeedbackCheck ok={poseValidation.isCentered} label="Centralizado" />

          {poseValidation.message && (
            <View style={styles.feedbackMsgWrap}>
              <Ionicons name="arrow-forward" size={14} color="#f59e0b" />
              <Text style={styles.feedbackMsg}>{poseValidation.message}</Text>
            </View>
          )}

          <View style={styles.confidenceBar}>
            <View style={[styles.confidenceFill, { width: `${Math.round(poseValidation.confidence * 100)}%`, backgroundColor: allOk ? '#22c55e' : '#f59e0b' }]} />
          </View>
          <Text style={[styles.confidenceText, { color: allOk ? '#22c55e' : '#f59e0b' }]}>
            Confianca: {Math.round(poseValidation.confidence * 100)}%
          </Text>
        </View>
      )}

      {/* ============ CAPTURA BADGE ============ */}
      {isCapturing && (
        <View style={styles.captureBadge}>
          <View style={styles.captureRecDot} />
          <Text style={styles.captureText}>Capturando... Fique parado</Text>
        </View>
      )}

      {/* ============ PROCESSING OVERLAY ============ */}
      {phase === 'processing' && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <Ionicons name="pulse" size={32} color="#7CFF3A" />
            <Text style={styles.processingTitle}>Processando</Text>
            <Text style={styles.processingSubtitle}>Calculando proporcoes corporais...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ============================================================
// FEEDBACK CHECK COMPONENT
// ============================================================

function FeedbackCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.feedbackRow}>
      <Ionicons
        name={ok ? 'checkmark-circle' : 'close-circle'}
        size={16}
        color={ok ? '#22c55e' : '#ef4444'}
      />
      <Text style={[styles.feedbackLabel, { color: ok ? '#d1fae5' : '#fecaca' }]}>{label}</Text>
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================

const CORNER_SIZE = 40;
const CORNER_OFFSET = 24;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },

  // Corner brackets
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: '#2FB6FF',
  },
  cornerTL: {
    top: CORNER_OFFSET,
    left: CORNER_OFFSET,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: CORNER_OFFSET,
    right: CORNER_OFFSET,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: CORNER_OFFSET + 60,
    left: CORNER_OFFSET,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: CORNER_OFFSET + 60,
    right: CORNER_OFFSET,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },

  // Silhueta guia
  silhouetteWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.15,
  },
  silHead: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  silNeck: {
    width: 2,
    height: 10,
    backgroundColor: '#ffffff',
  },
  silTorso: {
    width: 70,
    height: 90,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 6,
    alignItems: 'center',
  },
  silArmL: {
    position: 'absolute',
    left: -22,
    top: 0,
    width: 18,
    height: 80,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 4,
  },
  silArmR: {
    position: 'absolute',
    right: -22,
    top: 0,
    width: 18,
    height: 80,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 4,
  },
  silLegs: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  silLegL: {
    width: 22,
    height: 110,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 4,
  },
  silLegR: {
    width: 22,
    height: 110,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 4,
  },

  // Scan lines
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    zIndex: 10,
  },
  scanLineSecondary: {
    height: 2,
    zIndex: 9,
  },
  scanLineTertiary: {
    height: 1,
    zIndex: 8,
  },
  scanLineGlow: {
    flex: 1,
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 8,
  },
  scanLineGlowThin: {
    shadowRadius: 6,
    shadowOpacity: 0.6,
  },
  scanLineGlowFaint: {
    shadowRadius: 3,
    shadowOpacity: 0.3,
  },

  // Skeleton
  bone: {
    position: 'absolute',
    height: 2,
    borderRadius: 1,
    transformOrigin: 'left center',
    zIndex: 5,
  },
  dot: {
    position: 'absolute',
    zIndex: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },

  // State badge
  stateBadge: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 6,
    zIndex: 50,
  },
  stateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stateText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Progress
  progressContainer: {
    position: 'absolute',
    bottom: 110,
    left: 24,
    right: 24,
    alignItems: 'center',
    zIndex: 20,
  },
  progressBarBg: {
    width: '100%',
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    borderRadius: 3,
  },
  progressGlow: {
    position: 'absolute',
    top: -2,
    left: 0,
    height: 9,
    backgroundColor: 'rgba(34,197,94,0.3)',
    borderRadius: 5,
  },
  progressText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  // Feedback card
  feedbackCard: {
    position: 'absolute',
    bottom: 130,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    zIndex: 20,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  feedbackLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  feedbackMsgWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  feedbackMsg: {
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: '600',
  },
  confidenceBar: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    borderRadius: 2,
  },
  confidenceText: {
    fontSize: 11,
    textAlign: 'right',
    marginTop: 3,
    fontWeight: '600',
  },

  // Capture badge
  captureBadge: {
    position: 'absolute',
    bottom: 130,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    zIndex: 20,
  },
  captureRecDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  captureText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },

  // Processing overlay
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 30,
  },
  processingCard: {
    backgroundColor: 'rgba(15, 22, 41, 0.95)',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(124, 255, 58, 0.3)',
    gap: 8,
  },
  processingTitle: {
    color: '#f1f5f9',
    fontSize: 18,
    fontWeight: '700',
  },
  processingSubtitle: {
    color: '#94a3b8',
    fontSize: 13,
  },
});
