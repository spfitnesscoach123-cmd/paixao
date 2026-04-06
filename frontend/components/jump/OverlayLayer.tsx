/**
 * OverlayLayer — Visual overlay for Jump Camera
 * 
 * ISOLATED COMPONENT: Only CONSUMES data, NEVER alters logic or timing.
 * Renders skeleton, foot dots, scan line, ground line, and confidence bar
 * over the camera preview during scanner/calibration phases.
 */
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { View, Text, Animated, Easing, StyleSheet, LayoutChangeEvent } from 'react-native';

// Skeleton connections (simplified: no hands, no face)
const SKELETON_CONNECTIONS: [string, string][] = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['right_hip', 'right_knee'],
  ['left_knee', 'left_ankle'],
  ['right_knee', 'right_ankle'],
];

// Foot landmark names for dot indicators
const FOOT_LANDMARKS = ['left_foot_index', 'right_foot_index'];

// Joint landmarks for small dots
const JOINT_LANDMARKS = [
  'left_shoulder', 'right_shoulder',
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
];

interface Keypoint {
  name: string;
  x: number;
  y: number;
  score: number;
}

interface OverlayProps {
  keypoints: Keypoint[];
  phase: string;           // jumpCamera.phase
  scannerPhase: string;    // scannerState.phase
  groundLevel: number;     // 0-1 normalized
  confidenceScore: number; // 0-1
  orientationValid: boolean;
  showSkeleton: boolean;
}

export const OverlayLayer = React.memo(({
  keypoints,
  phase,
  scannerPhase,
  groundLevel,
  confidenceScore,
  orientationValid,
  showSkeleton,
}: OverlayProps) => {
  // Container dimensions (measured via onLayout)
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setDims({ w: width, h: height });
  }, []);

  // Scan line animation (top -> bottom loop)
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  // Ground line pulse
  const groundPulseAnim = useRef(new Animated.Value(0.6)).current;

  // Scan line loop during scanning
  useEffect(() => {
    if (scannerPhase === 'collecting' || scannerPhase === 'analyzing') {
      const loop = Animated.loop(
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: false,
        })
      );
      loop.start();
      return () => loop.stop();
    } else {
      scanLineAnim.setValue(0);
    }
  }, [scannerPhase]);

  // Ground line pulse
  useEffect(() => {
    if (groundLevel > 0 && (scannerPhase === 'collecting' || scannerPhase === 'analyzing' || scannerPhase === 'ready')) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(groundPulseAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
          Animated.timing(groundPulseAnim, { toValue: 0.5, duration: 800, useNativeDriver: false }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [groundLevel, scannerPhase]);

  // Build keypoint lookup
  const keypointMap = useMemo(() => {
    const map: Record<string, Keypoint> = {};
    for (const kp of keypoints) {
      map[kp.name] = kp;
    }
    return map;
  }, [keypoints]);

  // Only render during active phases
  const isActive = phase === 'scanning' || phase === 'countdown';
  if (!isActive || keypoints.length === 0) return <View style={styles.container} onLayout={onLayout} />;

  const W = dims.w;
  const H = dims.h;
  const hasDims = W > 0 && H > 0;

  // Confidence color
  const confColor = confidenceScore >= 0.80 ? '#22c55e'
    : confidenceScore >= 0.65 ? '#eab308'
    : '#ef4444';

  const skelColor = orientationValid ? 'rgba(34, 197, 94, 0.45)' : 'rgba(239, 68, 68, 0.45)';
  const dotColor = orientationValid ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)';

  const scanLineTop = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [H * 0.05, H * 0.95],
  });

  return (
    <View style={styles.container} onLayout={onLayout} pointerEvents="none">
      {hasDims && (
        <>
          {/* Animated scan line */}
          {(scannerPhase === 'collecting' || scannerPhase === 'analyzing') && (
            <Animated.View
              style={[
                styles.scanLine,
                {
                  top: scanLineTop,
                  backgroundColor: confColor,
                  shadowColor: confColor,
                },
              ]}
            />
          )}

          {/* Ground line with pulse */}
          {groundLevel > 0 && (
            <Animated.View
              style={[
                styles.groundLine,
                {
                  top: groundLevel * H,
                  opacity: groundPulseAnim,
                  backgroundColor: confColor,
                  shadowColor: confColor,
                },
              ]}
            />
          )}

          {/* Skeleton lines */}
          {showSkeleton && SKELETON_CONNECTIONS.map(([nameA, nameB], idx) => {
            const a = keypointMap[nameA];
            const b = keypointMap[nameB];
            if (!a || !b || a.score < 0.3 || b.score < 0.3) return null;

            const px1 = a.x * W, py1 = a.y * H;
            const px2 = b.x * W, py2 = b.y * H;
            const dx = px2 - px1;
            const dy = py2 - py1;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            const midX = (px1 + px2) / 2;
            const midY = (py1 + py2) / 2;

            return (
              <View
                key={idx}
                style={{
                  position: 'absolute',
                  left: midX - length / 2,
                  top: midY - 1,
                  width: length,
                  height: 2,
                  backgroundColor: skelColor,
                  transform: [{ rotate: `${angle}deg` }],
                }}
              />
            );
          })}

          {/* Foot dots (larger, prominent) */}
          {FOOT_LANDMARKS.map((name) => {
            const kp = keypointMap[name];
            if (!kp || kp.score < 0.3) return null;
            const c = kp.score >= 0.7 ? '#22c55e' : kp.score >= 0.5 ? '#eab308' : '#ef4444';
            return (
              <View
                key={name}
                style={[
                  styles.footDot,
                  {
                    left: kp.x * W - 6,
                    top: kp.y * H - 6,
                    backgroundColor: c,
                    shadowColor: c,
                  },
                ]}
              />
            );
          })}

          {/* Joint dots (smaller, subtle) */}
          {showSkeleton && JOINT_LANDMARKS.map((name) => {
            const kp = keypointMap[name];
            if (!kp || kp.score < 0.3) return null;
            return (
              <View
                key={name}
                style={[
                  styles.jointDot,
                  {
                    left: kp.x * W - 4,
                    top: kp.y * H - 4,
                    backgroundColor: dotColor,
                  },
                ]}
              />
            );
          })}

          {/* Orientation warning banner */}
          {!orientationValid && (
            <View style={styles.orientationWarning}>
              <Text style={styles.orientationWarningText}>
                Fique de frente para a camera
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 5,
  },
  groundLine: {
    position: 'absolute',
    left: '5%',
    right: '5%',
    height: 3,
    borderRadius: 1.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 4,
  },
  footDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },
  jointDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  orientationWarning: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  orientationWarningText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
