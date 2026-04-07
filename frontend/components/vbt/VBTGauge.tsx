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

/**
 * Interpolate linearly between two hex colors.
 * Same algorithm as FatigueVisualOverlay border.
 */
const interpolateHex = (c1: string, c2: string, t: number): string => {
  const f = Math.max(0, Math.min(1, t));
  const r1 = parseInt(c1.slice(1, 3), 16);
  const g1 = parseInt(c1.slice(3, 5), 16);
  const b1 = parseInt(c1.slice(5, 7), 16);
  const r2 = parseInt(c2.slice(1, 3), 16);
  const g2 = parseInt(c2.slice(3, 5), 16);
  const b2 = parseInt(c2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * f);
  const g = Math.round(g1 + (g2 - g1) * f);
  const b = Math.round(b1 + (b2 - b1) * f);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

/**
 * Continuous color interpolation — SAME scale as border overlay.
 *   0%   → #00C853 (green)
 *   15%  → #FF6D00 (orange)
 *   30%+ → #D50000 (red)
 */
const getDropColor = (drop: number, calibrating: boolean): string => {
  if (calibrating) return '#3b82f6';
  if (drop <= 0) return '#00C853';
  if (drop < 15) return interpolateHex('#00C853', '#FF6D00', drop / 15);
  if (drop < 30) return interpolateHex('#FF6D00', '#D50000', (drop - 15) / 15);
  return '#D50000';
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

  const color = getDropColor(dropPercent, isCalibrating);
  const trendChar = trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '';

  return (
    <View style={[styles.container, { width: size, height: size }]} data-testid="vbt-gauge">
      <Svg width={size} height={size}>
        <G rotation="-225" origin={`${size / 2}, ${size / 2}`}>
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

      <View style={styles.center}>
        <Text style={styles.repNumber}>{repCount}</Text>
        <Text style={styles.velocity}>{velocity.toFixed(2)} m/s</Text>
        {isCalibrating ? (
          <Text style={[styles.status, { color }]}>
            CALIBRANDO{calibrationProgress > 0 ? ` ${calibrationProgress}%` : '...'}
          </Text>
        ) : (
          <Text style={[styles.drop, { color }]}>
            {dropPercent > 0 ? `-${dropPercent.toFixed(1)}%` : '0%'}{trendChar ? ` ${trendChar}` : ''}
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
