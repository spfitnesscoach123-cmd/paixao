/**
 * JumpGraph — Real-time SVG displacement curve for CMJ recording overlay.
 *
 * Shows:
 *   - Dashed baseline (standing position)
 *   - Smooth bezier curve of hip Y displacement
 *   - Light area fill below the curve
 *   - Phase labels with durations (ECC, CON, FLT)
 *
 * TRANSPARENT background — no dark container.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';

interface JumpGraphProps {
  /** Array of hip Y positions (normalized 0-1, Y increases downward) */
  points: number[];
  /** Standing hip Y position (baseline) */
  baseline: number;
  /** Phase durations in ms (optional, shown as labels) */
  eccentricMs?: number;
  concentricMs?: number;
  flightMs?: number;
  /** Dimensions */
  width?: number;
  height?: number;
}

const MAX_POINTS = 120;
const SMOOTH_WINDOW = 5;

/** 5-point moving average */
function smooth(arr: number[]): number[] {
  if (arr.length < SMOOTH_WINDOW) return arr;
  const out: number[] = [];
  const half = Math.floor(SMOOTH_WINDOW / 2);
  for (let i = 0; i < arr.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(arr.length, i + half + 1);
    let sum = 0;
    for (let j = lo; j < hi; j++) sum += arr[j];
    out.push(sum / (hi - lo));
  }
  return out;
}

export const JumpGraph: React.FC<JumpGraphProps> = ({
  points,
  baseline,
  eccentricMs = 0,
  concentricMs = 0,
  flightMs = 0,
  width = 260,
  height = 90,
}) => {
  const graphData = useMemo(() => {
    if (points.length < 2) return null;

    // Limit buffer + smooth
    const raw = points.length > MAX_POINTS ? points.slice(-MAX_POINTS) : points;
    const slice = smooth(raw);

    // Range for normalization
    const allVals = [...slice, baseline];
    const minV = Math.min(...allVals);
    const maxV = Math.max(...allVals);
    const range = maxV - minV || 0.01;

    const pad = 6;
    const gw = width - pad * 2;
    const gh = height - pad * 2;

    // Invert Y: lower value (higher on screen) → lower graph Y
    const toY = (v: number) => {
      const y = pad + (1 - (v - minV) / range) * gh;
      return isFinite(y) ? y : pad + gh / 2;
    };
    const toX = (i: number) => pad + (i / Math.max(1, slice.length - 1)) * gw;

    const baseGY = toY(baseline);

    // Map all points
    const pts = slice.map((v, i) => ({ x: toX(i), y: toY(v) }));
    if (pts.length < 2) return null;

    // Quadratic bezier smooth curve
    let curve = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2;
      const yc = (pts[i].y + pts[i + 1].y) / 2;
      curve += ` Q ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}, ${xc.toFixed(1)} ${yc.toFixed(1)}`;
    }
    // Final segment
    const last = pts[pts.length - 1];
    curve += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;

    // Area path: close to baseline
    const first = pts[0];
    const area = curve +
      ` L ${last.x.toFixed(1)} ${baseGY.toFixed(1)}` +
      ` L ${first.x.toFixed(1)} ${baseGY.toFixed(1)} Z`;

    return { curve, area, baseGY };
  }, [points, baseline, width, height]);

  if (!graphData || points.length < 3) return null;

  const hasPhases = eccentricMs > 0 || flightMs > 0;

  return (
    <View style={[styles.container, { width, height: height + (hasPhases ? 22 : 0) }]} data-testid="jump-graph">
      <Svg width={width} height={height}>
        {/* Baseline dashed line */}
        <Line
          x1={4} y1={graphData.baseGY}
          x2={width - 4} y2={graphData.baseGY}
          stroke="rgba(255,255,255,0.35)"
          strokeWidth={1}
          strokeDasharray="4,3"
        />

        {/* Area fill (light) */}
        <Path d={graphData.area} fill="rgba(34,197,94,0.15)" />

        {/* Smooth curve */}
        <Path
          d={graphData.curve}
          fill="none"
          stroke="#22c55e"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>

      {/* Phase labels */}
      {hasPhases && (
        <View style={styles.phaseRow}>
          {eccentricMs > 0 && (
            <View style={[styles.badge, { backgroundColor: 'rgba(59,130,246,0.25)' }]}>
              <Text style={[styles.badgeText, { color: '#60a5fa' }]}>ECC {(eccentricMs / 1000).toFixed(2)}s</Text>
            </View>
          )}
          {concentricMs > 0 && (
            <View style={[styles.badge, { backgroundColor: 'rgba(34,197,94,0.25)' }]}>
              <Text style={[styles.badgeText, { color: '#4ade80' }]}>CON {(concentricMs / 1000).toFixed(2)}s</Text>
            </View>
          )}
          {flightMs > 0 && (
            <View style={[styles.badge, { backgroundColor: 'rgba(234,179,8,0.25)' }]}>
              <Text style={[styles.badgeText, { color: '#facc15' }]}>FLT {(flightMs / 1000).toFixed(2)}s</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  phaseRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    justifyContent: 'center',
  },
  badge: {
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
