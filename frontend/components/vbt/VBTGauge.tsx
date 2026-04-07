/**
 * VBTGauge — Circular gauge component for VBT V2 overlay
 *
 * Displays:
 *   - Arc progress (currentVelocity / baseline)
 *   - Rep count (center, large)
 *   - Velocity (center, small)
 *   - Drop % with trend arrow
 *   - Calibration indicator
 *
 * Color logic:
 *   drop < 10%  → green
 *   drop 10-20% → yellow
 *   drop > 20%  → red
 *   calibrating  → blue
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

interface VBTGaugeProps {
  progress: number;       // 0-1 (currentVelocity / baseline), clamped
  repCount: number;
  velocity: number;       // m/s
  dropPercent: number;
  trend: 'up' | 'down' | 'stable';
  isCalibrating: boolean;
  calibrationProgress?: number; // 0-100
  size?: number;
}

const getColor = (drop: number, calibrating: boolean): string => {
  if (calibrating) return '#3b82f6';
  if (drop < 10) return '#22c55e';
  if (drop < 20) return '#eab308';
  return '#ef4444';
};

export const VBTGauge: React.FC<VBTGaugeProps> = ({
  progress,
  repCount,
  velocity,
  dropPercent,
  trend,
  isCalibrating,
  calibrationProgress = 0,
  size = 180,
}) => {
  const strokeWidth = 10;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcFraction = 0.75; // 270-degree arc
  const arcLength = circumference * arcFraction;
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const dashOffset = arcLength * (1 - clampedProgress);

  const color = getColor(dropPercent, isCalibrating);
  const trendChar = trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '\u2192';

  return (
    <View style={[styles.container, { width: size, height: size }]} data-testid="vbt-gauge">
      <Svg width={size} height={size}>
        <G rotation="-225" origin={`${size / 2}, ${size / 2}`}>
          {/* Background arc */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Progress arc */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </G>
      </Svg>

      {/* Center content */}
      <View style={styles.center}>
        <Text style={styles.repNumber}>{repCount}</Text>
        <Text style={styles.velocity}>{velocity.toFixed(2)} m/s</Text>
        {isCalibrating ? (
          <Text style={[styles.status, { color }]}>
            CALIBRANDO{calibrationProgress > 0 ? ` ${calibrationProgress}%` : '...'}
          </Text>
        ) : (
          <Text style={[styles.drop, { color }]}>
            {dropPercent > 0 ? `-${dropPercent.toFixed(1)}%` : '0%'} {trendChar}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  repNumber: {
    fontSize: 38,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 42,
  },
  velocity: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  status: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 1,
  },
  drop: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
});
