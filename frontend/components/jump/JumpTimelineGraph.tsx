/**
 * JumpTimelineGraph — Results-screen visual timeline of a completed jump.
 *
 * Different from the existing JumpGraph (which is the LIVE recording overlay).
 * This one is post-hoc: plots hipCenterY of every recorded frame against time,
 * marks takeoff, peak, landing, and shows any timestamp gaps as red ticks.
 *
 * VISUAL SEMANTICS (clarified):
 *   - Green curve       = Hip height (quadril) over time (smoothed with bezier Q curves)
 *   - Dashed horizontal = Hip BASELINE (standing hip position) — NOT the ground
 *   - Green dots        = Foot contact events (Takeoff / Landing) plotted on the hip curve
 *                         at the event timestamp (they visualize WHEN the foot event
 *                         occurred, using hip position as reference)
 *   - Blue dot          = Peak (highest hip position)
 *   - Dashed verticals  = Temporal markers of the three events (takeoff/peak/landing)
 *
 * Data is consumed READ-ONLY from the pipeline output:
 *   - frames[]: recorded JumpFrameData (hipCenterY, timestamp)
 *   - events: takeoffTime, peakHeightTime, landingTime
 *   - baseline: groundCalibration.standingHipY (dashed reference line)
 *
 * No recalculation of metrics. No new math. Pure visualization.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import Svg, { Path, Line, Circle, G } from 'react-native-svg';
import type { JumpFrameData, JumpEvents } from '../../services/jump/types';

interface JumpTimelineGraphProps {
  frames: JumpFrameData[];
  events: JumpEvents | null;
  baseline: number;        // standingHipY from groundCalibration
  width?: number;
  targetFps?: number;      // used only to flag timestamp gaps
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

const H_PADDING = 12;
const V_PADDING = 10;
const HEIGHT = 150;

export const JumpTimelineGraph: React.FC<JumpTimelineGraphProps> = ({
  frames,
  events,
  baseline,
  width,
  targetFps = 30,
}) => {
  const screenWidth = Dimensions.get('window').width;
  const W = width ?? Math.min(screenWidth - 32, 560);
  const H = HEIGHT;

  const anim = useRef(new Animated.Value(0)).current;

  const data = useMemo(() => {
    if (!frames || frames.length < 3) return null;

    const t0 = frames[0].timestamp;
    const tN = frames[frames.length - 1].timestamp;
    const totalMs = Math.max(1, tN - t0);

    // Y range
    const yVals = frames.map(f => f.hipCenterY);
    const yMin = Math.min(...yVals, baseline);
    const yMax = Math.max(...yVals, baseline);
    const yRange = Math.max(0.02, yMax - yMin);

    const gw = W - H_PADDING * 2;
    const gh = H - V_PADDING * 2;

    const toX = (t: number) => H_PADDING + ((t - t0) / totalMs) * gw;
    // Invert Y: lower hipCenterY (hip higher in world) = lower screen Y (top of graph)
    const toY = (v: number) => V_PADDING + ((v - yMin) / yRange) * gh;

    // Smoothed bezier curve (no data distortion — pure Q midpoints between samples)
    const pts = frames.map(f => ({ x: toX(f.timestamp), y: toY(f.hipCenterY) }));
    let curve = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2;
      const yc = (pts[i].y + pts[i + 1].y) / 2;
      curve += ` Q ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}, ${xc.toFixed(1)} ${yc.toFixed(1)}`;
    }
    const last = pts[pts.length - 1];
    curve += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;

    const baseY = toY(baseline);
    const area = curve +
      ` L ${last.x.toFixed(1)} ${baseY.toFixed(1)}` +
      ` L ${pts[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`;

    // Event markers (picked by nearest-timestamp, no recalculation)
    const findIdxByTs = (ts: number | null): number | null => {
      if (ts === null) return null;
      let best = -1;
      let bestDiff = Infinity;
      for (let i = 0; i < frames.length; i++) {
        const d = Math.abs(frames[i].timestamp - ts);
        if (d < bestDiff) { bestDiff = d; best = i; }
      }
      return best >= 0 ? best : null;
    };

    const takeoffIdx = findIdxByTs(events?.takeoffTime ?? null);
    const peakIdx = findIdxByTs(events?.peakHeightTime ?? null);
    const landingIdx = findIdxByTs(events?.landingTime ?? null);

    const mk = (i: number | null) =>
      i !== null ? { x: pts[i].x, y: pts[i].y } : null;

    // Timestamp gaps = frame deltas > 1.8 * expected frame period
    const expectedMs = 1000 / Math.max(1, targetFps);
    const gapThreshold = expectedMs * 1.8;
    const gaps: { x: number; y: number }[] = [];
    for (let i = 1; i < frames.length; i++) {
      const dt = frames[i].timestamp - frames[i - 1].timestamp;
      if (dt > gapThreshold) {
        const cx = (pts[i - 1].x + pts[i].x) / 2;
        gaps.push({ x: cx, y: baseY });
      }
    }

    // Path length (approx) for draw-in animation
    let pathLen = 0;
    for (let i = 1; i < pts.length; i++) {
      pathLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }

    return {
      curve,
      area,
      baseY,
      takeoff: mk(takeoffIdx),
      peak: mk(peakIdx),
      landing: mk(landingIdx),
      gaps,
      pathLen,
    };
  }, [frames, events, baseline, W, targetFps]);

  useEffect(() => {
    if (!data) return;
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [data, anim]);

  if (!data) return null;

  const dashOffset = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [data.pathLen, 0],
  });

  // Vertical event guide line (temporal marker) — spans full graph height
  const VerticalGuide: React.FC<{ x: number; color: string }> = ({ x, color }) => (
    <Line
      x1={x}
      y1={V_PADDING}
      x2={x}
      y2={H - V_PADDING}
      stroke={color}
      strokeWidth={1}
      strokeDasharray="3,3"
      opacity={0.55}
    />
  );

  return (
    <View style={[styles.container, { width: W }]} data-testid="jump-timeline-graph">
      <Svg width={W} height={H}>
        {/* Hip baseline dashed line (semantic: hip standing position, NOT the ground) */}
        <Line
          x1={H_PADDING} y1={data.baseY}
          x2={W - H_PADDING} y2={data.baseY}
          stroke="rgba(255,255,255,0.4)"
          strokeWidth={1}
          strokeDasharray="4,3"
        />

        {/* Vertical event guides (temporal markers) — drawn BEHIND the curve */}
        {data.takeoff && <VerticalGuide x={data.takeoff.x} color="#22c55e" />}
        {data.peak && <VerticalGuide x={data.peak.x} color="#3b82f6" />}
        {data.landing && <VerticalGuide x={data.landing.x} color="#22c55e" />}

        {/* Area fill (soft green gradient hint via low alpha) */}
        <Path d={data.area} fill="rgba(34,197,94,0.12)" />

        {/* Main hip curve with draw-in animation (left → right) */}
        <AnimatedPath
          d={data.curve}
          fill="none"
          stroke="#22c55e"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={`${data.pathLen},${data.pathLen}`}
          strokeDashoffset={dashOffset}
        />

        {/* Gap markers (red "x" on baseline) */}
        {data.gaps.map((g, i) => (
          <G key={`gap-${i}`}>
            <Line x1={g.x - 3} y1={g.y - 3} x2={g.x + 3} y2={g.y + 3} stroke="#ef4444" strokeWidth={1.4} />
            <Line x1={g.x - 3} y1={g.y + 3} x2={g.x + 3} y2={g.y - 3} stroke="#ef4444" strokeWidth={1.4} />
          </G>
        ))}

        {/* Event markers (plotted on the hip curve at event timestamp) */}
        {data.takeoff && (
          <Circle cx={data.takeoff.x} cy={data.takeoff.y} r={4.5} fill="#22c55e" stroke="#0a0a0a" strokeWidth={1.5} />
        )}
        {data.peak && (
          <Circle cx={data.peak.x} cy={data.peak.y} r={5.5} fill="#3b82f6" stroke="#0a0a0a" strokeWidth={1.5} />
        )}
        {data.landing && (
          <Circle cx={data.landing.x} cy={data.landing.y} r={4.5} fill="#22c55e" stroke="#0a0a0a" strokeWidth={1.5} />
        )}
      </Svg>

      {/* Legend — clarifies what each visual element represents */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.lineSwatch, { backgroundColor: '#22c55e' }]} />
          <Text style={styles.legendText}>Hip Height</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.dashedSwatch}>
            <View style={styles.dashSeg} />
            <View style={styles.dashSeg} />
            <View style={styles.dashSeg} />
          </View>
          <Text style={styles.legendText}>Hip Baseline</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#22c55e' }]} />
          <Text style={styles.legendText}>Foot Contact</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#3b82f6' }]} />
          <Text style={styles.legendText}>Peak</Text>
        </View>
        {data.gaps.length > 0 && (
          <View style={styles.legendItem}>
            <Text style={[styles.legendText, { color: '#ef4444' }]}>✕ {data.gaps.length} gap{data.gaps.length > 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  legend: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  lineSwatch: {
    width: 14,
    height: 2,
    borderRadius: 1,
  },
  dashedSwatch: {
    width: 14,
    height: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dashSeg: {
    width: 3,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  legendText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '600',
  },
});
