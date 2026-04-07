/**
 * JumpGraph — Real-time SVG displacement curve for CMJ recording overlay.
 *
 * Shows:
 *   - Dashed baseline (standing position)
 *   - Smooth curve of hip Y displacement over time
 *   - Color: blue below baseline (countermovement), green above (flight)
 *   - Phase labels with durations (ECC, CON, FLIGHT) when available
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Line, Rect } from 'react-native-svg';

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

const MAX_DISPLAY_POINTS = 150; // ~5s at 30fps

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
    if (points.length < 2) return { pathBelow: '', pathAbove: '', baselineY: height / 2 };

    // Use last N points for rolling window
    const slice = points.length > MAX_DISPLAY_POINTS
      ? points.slice(-MAX_DISPLAY_POINTS)
      : points;

    // Find range for normalization
    const allVals = [...slice, baseline];
    const minY = Math.min(...allVals);
    const maxY = Math.max(...allVals);
    const range = maxY - minY || 0.01;

    const pad = 6; // padding
    const gw = width - pad * 2;
    const gh = height - pad * 2;

    // Map Y value to graph coordinate (INVERT: lower Y value = higher position = lower graph Y)
    const mapY = (y: number) => pad + (1 - (y - minY) / range) * gh;
    const mapX = (i: number) => pad + (i / Math.max(1, slice.length - 1)) * gw;

    const baselineGY = mapY(baseline);

    // Build two polyline strings: below baseline (countermovement) and above (flight)
    const belowPts: string[] = [];
    const abovePts: string[] = [];

    for (let i = 0; i < slice.length; i++) {
      const x = mapX(i).toFixed(1);
      const y = mapY(slice[i]).toFixed(1);
      const pt = `${x},${y}`;

      // In graph coords: below baseline means graphY > baselineGY (countermovement/descent)
      // Above baseline means graphY < baselineGY (flight/ascent)
      if (mapY(slice[i]) >= baselineGY) {
        belowPts.push(pt);
        // Bridge to above if previous was above
        if (abovePts.length > 0) {
          abovePts.push(`${x},${baselineGY.toFixed(1)}`);
        }
      } else {
        abovePts.push(pt);
        if (belowPts.length > 0) {
          belowPts.push(`${x},${baselineGY.toFixed(1)}`);
        }
      }
    }

    // Full path for smooth single line
    const fullPts = slice.map((y, i) => `${mapX(i).toFixed(1)},${mapY(y).toFixed(1)}`).join(' ');

    return {
      fullPath: fullPts,
      baselineY: baselineGY,
      belowPath: belowPts.join(' '),
      abovePath: abovePts.join(' '),
    };
  }, [points, baseline, width, height]);

  if (points.length < 3) return null;

  const hasPhases = eccentricMs > 0 || flightMs > 0;

  return (
    <View style={[styles.container, { width, height: height + (hasPhases ? 20 : 0) }]} data-testid="jump-graph">
      <Svg width={width} height={height}>
        {/* Dark background */}
        <Rect x={0} y={0} width={width} height={height} rx={8} fill="rgba(0,0,0,0.55)" />

        {/* Baseline dashed line */}
        <Line
          x1={4} y1={graphData.baselineY}
          x2={width - 4} y2={graphData.baselineY}
          stroke="rgba(255,255,255,0.35)"
          strokeWidth={1}
          strokeDasharray="4,3"
        />

        {/* Displacement curve — single smooth line */}
        {graphData.fullPath && (
          <Polyline
            points={graphData.fullPath}
            fill="none"
            stroke="#22c55e"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
      </Svg>

      {/* Phase labels below graph */}
      {hasPhases && (
        <View style={styles.phaseRow}>
          {eccentricMs > 0 && (
            <View style={[styles.phaseBadge, { backgroundColor: 'rgba(59,130,246,0.25)' }]}>
              <Text style={[styles.phaseText, { color: '#60a5fa' }]}>ECC {(eccentricMs / 1000).toFixed(2)}s</Text>
            </View>
          )}
          {concentricMs > 0 && (
            <View style={[styles.phaseBadge, { backgroundColor: 'rgba(34,197,94,0.25)' }]}>
              <Text style={[styles.phaseText, { color: '#4ade80' }]}>CON {(concentricMs / 1000).toFixed(2)}s</Text>
            </View>
          )}
          {flightMs > 0 && (
            <View style={[styles.phaseBadge, { backgroundColor: 'rgba(234,179,8,0.25)' }]}>
              <Text style={[styles.phaseText, { color: '#facc15' }]}>FLT {(flightMs / 1000).toFixed(2)}s</Text>
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
  phaseBadge: {
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  phaseText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
