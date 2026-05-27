import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { TeamTableRowData } from './types';
import { InfoTooltip } from './StackedBarChart';

const STATUS_COLORS: Record<string, string> = {
  READY: '#7CFF3A',
  ATTENTION: '#F5B941',
  NOT_READY: '#FF4D6D',
  UNKNOWN: '#64748b',
};

const PAD = { top: 16, right: 12, bottom: 32, left: 44 };
const DOT_R = 6;

interface Props {
  rows: TeamTableRowData[];
  isLoading: boolean;
  colors: any;
  locale: string;
}

export const ScatterPlot = React.memo(function ScatterPlot({
  rows,
  isLoading,
  colors,
  locale,
}: Props) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [tooltipVisible, setTooltipVisible] = React.useState(false);
  const [containerWidth, setContainerWidth] = React.useState<number | null>(null);
  const { width: winWidth } = useWindowDimensions();
  const pulseAnim = React.useRef(new Animated.Value(0)).current;

  // Subtle pulsing animation for dots
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1800, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1800, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const [pulseValue, setPulseValue] = React.useState(0);
  React.useEffect(() => {
    const id = pulseAnim.addListener(({ value }) => setPulseValue(value));
    return () => pulseAnim.removeListener(id);
  }, [pulseAnim]);

  // Responsive chart sizing — use measured container width (true full-width), not window
  // Fallback respects the page's content max-width (scrollContent.maxWidth=1100
  // minus 32px page padding minus 28px card padding ≈ 1040). This avoids the
  // initial-paint overflow when `onLayout` hasn't yet reported the measured
  // width on wide viewports (RN-Web quirk).
  const effectiveW = containerWidth ?? Math.min(winWidth - 48, 1040);
  const CHART_W = Math.max(320, effectiveW - 24); // 24px = horizontal card padding (12px each side)
  const CHART_H = effectiveW >= 900 ? 380 : effectiveW >= 600 ? 300 : 220;
  const PLOT_W = CHART_W - PAD.left - PAD.right;
  const PLOT_H = CHART_H - PAD.top - PAD.bottom;

  // Filter athletes with GPS data — Distance vs HSR (Z4: 19.8–25.2 km/h)
  const points = React.useMemo(
    () => rows.filter(r => r.total_distance > 0 || r.z4 > 0),
    [rows],
  );

  // Compute axis ranges and averages using Z4 (HSR) distance
  const { maxDist, maxHsr, avgDist, avgHsr } = React.useMemo(() => {
    if (points.length === 0) return { maxDist: 1, maxHsr: 1, avgDist: 0, avgHsr: 0 };
    let mxD = 0, mxS = 0, sumD = 0, sumS = 0;
    for (const p of points) {
      if (p.total_distance > mxD) mxD = p.total_distance;
      if (p.z4 > mxS) mxS = p.z4;
      sumD += p.total_distance;
      sumS += p.z4;
    }
    return {
      maxDist: mxD * 1.1 || 1,
      maxHsr: mxS * 1.1 || 1,
      avgDist: sumD / points.length,
      avgHsr: sumS / points.length,
    };
  }, [points]);

  const toX = React.useCallback(
    (dist: number) => PAD.left + (dist / maxDist) * PLOT_W,
    [maxDist, PLOT_W],
  );
  const toY = React.useCallback(
    (hsr: number) => PAD.top + PLOT_H - (hsr / maxHsr) * PLOT_H,
    [maxHsr, PLOT_H],
  );

  const handleDotPress = React.useCallback((id: string) => {
    setSelectedId(prev => (prev === id ? null : id));
  }, []);

  const selectedRow = React.useMemo(
    () => (selectedId ? points.find(p => p.athlete_id === selectedId) : null),
    [selectedId, points],
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.dark.cardSolid, borderColor: colors.border.default }]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.accent.primary} />
        </View>
      </View>
    );
  }

  if (points.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.dark.cardSolid, borderColor: colors.border.default }]}>
        <Text style={[styles.title, { color: colors.text.primary }]}>
          {locale === 'pt' ? 'Distância vs HSR' : 'Distance vs HSR'}
        </Text>
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
            {locale === 'pt' ? 'Sem dados GPS no período' : 'No GPS data in period'}
          </Text>
        </View>
      </View>
    );
  }

  const avgLineX = toX(avgDist);
  const avgLineY = toY(avgHsr);
  const xTicks = [0, maxDist / 2, maxDist];
  const yTicks = [0, maxHsr / 2, maxHsr];

  return (
    <View
      style={[styles.container, { backgroundColor: colors.dark.cardSolid, borderColor: colors.border.default }]}
      data-testid="scatter-plot"
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w && Math.abs(w - (containerWidth ?? 0)) > 1) setContainerWidth(w);
      }}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text.primary }]}>
          {locale === 'pt' ? 'Distância vs HSR' : 'Distance vs HSR'}
        </Text>
        <TouchableOpacity
          onPress={() => setTooltipVisible(true)}
          data-testid="scatter-info"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="information-circle-outline" size={18} color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>

      {/* Legend */}
      <View style={styles.legendRow}>
        {[
          { key: 'READY', label: locale === 'pt' ? 'Pronto' : 'Ready' },
          { key: 'ATTENTION', label: locale === 'pt' ? 'Atenção' : 'Attention' },
          { key: 'NOT_READY', label: locale === 'pt' ? 'Alerta' : 'Alert' },
        ].map(item => (
          <View key={item.key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: STATUS_COLORS[item.key] }]} />
            <Text style={[styles.legendLabel, { color: colors.text.tertiary }]}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={{ width: '100%', alignItems: 'center' }}>
        <Svg width={CHART_W} height={CHART_H}>
        <Rect
          x={PAD.left}
          y={PAD.top}
          width={PLOT_W}
          height={PLOT_H}
          fill={colors.border.default}
          opacity={0.35}
          rx={4}
        />

        {/* Quadrant fills (subtle) */}
        <Rect
          x={avgLineX}
          y={PAD.top}
          width={PAD.left + PLOT_W - avgLineX}
          height={avgLineY - PAD.top}
          fill="rgba(124,255,58,0.05)"
        />
        <Rect
          x={PAD.left}
          y={avgLineY}
          width={avgLineX - PAD.left}
          height={PAD.top + PLOT_H - avgLineY}
          fill="rgba(255,77,109,0.05)"
        />

        {/* Average lines (improved contrast) */}
        <Line
          x1={avgLineX} y1={PAD.top}
          x2={avgLineX} y2={PAD.top + PLOT_H}
          stroke={colors.accent.primary}
          strokeWidth={1.5}
          strokeDasharray="4,3"
          opacity={0.75}
        />
        <Line
          x1={PAD.left} y1={avgLineY}
          x2={PAD.left + PLOT_W} y2={avgLineY}
          stroke={colors.accent.primary}
          strokeWidth={1.5}
          strokeDasharray="4,3"
          opacity={0.75}
        />

        {/* Axis labels */}
        {xTicks.map((v, i) => (
          <SvgText
            key={`x${i}`}
            x={toX(v)}
            y={PAD.top + PLOT_H + 16}
            textAnchor="middle"
            fill={colors.text.tertiary}
            fontSize={9}
          >
            {(v / 1000).toFixed(1)}km
          </SvgText>
        ))}
        {yTicks.map((v, i) => (
          <SvgText
            key={`y${i}`}
            x={PAD.left - 6}
            y={toY(v) + 3}
            textAnchor="end"
            fill={colors.text.tertiary}
            fontSize={9}
          >
            {(v / 1000).toFixed(2)}km
          </SvgText>
        ))}

        {/* Axis titles */}
        <SvgText
          x={PAD.left + PLOT_W / 2}
          y={CHART_H - 4}
          textAnchor="middle"
          fill={colors.text.secondary}
          fontSize={10}
          fontWeight="600"
        >
          {locale === 'pt' ? 'Distância Total (km)' : 'Total Distance (km)'}
        </SvgText>
        <SvgText
          x={12}
          y={PAD.top + PLOT_H / 2}
          textAnchor="middle"
          fill={colors.text.secondary}
          fontSize={10}
          fontWeight="600"
          rotation="-90"
          originX={12}
          originY={PAD.top + PLOT_H / 2}
        >
          {locale === 'pt' ? 'HSR (Z4, km)' : 'HSR (Z4, km)'}
        </SvgText>

        {/* Data points with pulsing effect */}
        {points.map(p => {
          const cx = toX(p.total_distance);
          const cy = toY(p.z4);
          const dotColor = STATUS_COLORS[p.fatigue_status] || STATUS_COLORS.UNKNOWN;
          const isSelected = selectedId === p.athlete_id;
          const pulseR = DOT_R + 3 + pulseValue * 4;
          const pulseOp = 0.3 * (1 - pulseValue);

          return (
            <React.Fragment key={p.athlete_id}>
              {/* Pulsing outer ring */}
              <Circle
                cx={cx}
                cy={cy}
                r={pulseR}
                fill={dotColor}
                opacity={pulseOp}
              />
              {isSelected && (
                <Circle
                  cx={cx}
                  cy={cy}
                  r={DOT_R + 4}
                  fill="none"
                  stroke={dotColor}
                  strokeWidth={1.5}
                  opacity={0.6}
                />
              )}
              <Circle
                cx={cx}
                cy={cy}
                r={isSelected ? DOT_R + 1 : DOT_R}
                fill={dotColor}
                opacity={isSelected ? 1 : 0.9}
                onPress={() => handleDotPress(p.athlete_id)}
              />
            </React.Fragment>
          );
        })}
      </Svg>
      </View>

      {/* Tooltip */}
      {selectedRow && (
        <TouchableOpacity
          style={[styles.tooltip, { backgroundColor: colors.dark.secondary, borderColor: colors.border.default }]}
          onPress={() => setSelectedId(null)}
          activeOpacity={0.9}
          data-testid="scatter-tooltip"
        >
          <View style={styles.tooltipHeader}>
            <View style={[styles.tooltipDot, { backgroundColor: STATUS_COLORS[selectedRow.fatigue_status] || STATUS_COLORS.UNKNOWN }]} />
            <Text style={[styles.tooltipName, { color: colors.text.primary }]} numberOfLines={1}>
              {selectedRow.name}
            </Text>
          </View>
          <View style={styles.tooltipMetrics}>
            <Text style={[styles.tooltipValue, { color: colors.text.secondary }]}>
              {(selectedRow.total_distance / 1000).toFixed(2)} km
            </Text>
            <Text style={[styles.tooltipSep, { color: colors.text.tertiary }]}>|</Text>
            <Text style={[styles.tooltipValue, { color: colors.text.secondary }]}>
              HSR {(selectedRow.z4 / 1000).toFixed(2)} km
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Info Modal */}
      <InfoTooltip
        visible={tooltipVisible}
        onClose={() => setTooltipVisible(false)}
        colors={colors}
        title={locale === 'pt' ? 'Distância vs HSR' : 'Distance vs HSR'}
        body={
          locale === 'pt'
            ? 'Dispersão comparando Distância Total (eixo X, km) contra HSR — High Speed Running em Z4 (19.8 a 25.2 km/h, eixo Y, km). Cada ponto é um atleta, colorido por prontidão (Pronto / Atenção / Alerta). As linhas tracejadas indicam a média do grupo em cada eixo, formando quadrantes interpretativos.'
            : 'Scatter plot comparing Total Distance (X axis, km) against HSR — High Speed Running in Z4 (19.8 to 25.2 km/h, Y axis, km). Each dot is an athlete, colored by readiness (Ready / Attention / Alert). Dashed lines show team averages on each axis, forming interpretive quadrants.'
        }
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
    width: '100%',
    overflow: 'hidden',
  },
  loadingWrap: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyWrap: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  tooltip: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 180,
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  tooltipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tooltipName: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  tooltipMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tooltipValue: {
    fontSize: 11,
  },
  tooltipSep: {
    fontSize: 11,
  },
});
