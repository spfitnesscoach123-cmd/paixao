import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';
import type { TeamTableRowData } from './types';

const STATUS_COLORS: Record<string, string> = {
  READY: '#10b981',
  ATTENTION: '#f59e0b',
  NOT_READY: '#ef4444',
  UNKNOWN: '#64748b',
};

const CHART_W = 320;
const CHART_H = 200;
const PAD = { top: 12, right: 12, bottom: 28, left: 38 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;
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

  // Filter athletes with GPS data
  const points = React.useMemo(
    () => rows.filter(r => r.total_distance > 0 || r.sprint_count > 0),
    [rows],
  );

  // Compute axis ranges and averages
  const { maxDist, maxSprint, avgDist, avgSprint } = React.useMemo(() => {
    if (points.length === 0) return { maxDist: 1, maxSprint: 1, avgDist: 0, avgSprint: 0 };
    let mxD = 0, mxS = 0, sumD = 0, sumS = 0;
    for (const p of points) {
      if (p.total_distance > mxD) mxD = p.total_distance;
      if (p.sprint_count > mxS) mxS = p.sprint_count;
      sumD += p.total_distance;
      sumS += p.sprint_count;
    }
    // Add 10% padding to max values
    return {
      maxDist: mxD * 1.1 || 1,
      maxSprint: mxS * 1.1 || 1,
      avgDist: sumD / points.length,
      avgSprint: sumS / points.length,
    };
  }, [points]);

  // Convert data → pixel position
  const toX = React.useCallback(
    (dist: number) => PAD.left + (dist / maxDist) * PLOT_W,
    [maxDist],
  );
  const toY = React.useCallback(
    (sprint: number) => PAD.top + PLOT_H - (sprint / maxSprint) * PLOT_H,
    [maxSprint],
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
          {locale === 'pt' ? 'Distância vs Sprints' : 'Distance vs Sprints'}
        </Text>
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
            {locale === 'pt' ? 'Sem dados GPS no período' : 'No GPS data in period'}
          </Text>
        </View>
      </View>
    );
  }

  // Average line positions
  const avgLineX = toX(avgDist);
  const avgLineY = toY(avgSprint);

  // Axis tick values (3 ticks each)
  const xTicks = [0, maxDist / 2, maxDist];
  const yTicks = [0, maxSprint / 2, maxSprint];

  return (
    <View
      style={[styles.container, { backgroundColor: colors.dark.cardSolid, borderColor: colors.border.default }]}
      data-testid="scatter-plot"
    >
      <Text style={[styles.title, { color: colors.text.primary }]}>
        {locale === 'pt' ? 'Distância vs Sprints' : 'Distance vs Sprints'}
      </Text>

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

      <Svg width={CHART_W} height={CHART_H}>
        {/* Plot area background */}
        <Rect
          x={PAD.left}
          y={PAD.top}
          width={PLOT_W}
          height={PLOT_H}
          fill="rgba(255,255,255,0.02)"
          rx={4}
        />

        {/* Quadrant fill (subtle) */}
        {/* Top-right: high dist + high sprint */}
        <Rect
          x={avgLineX}
          y={PAD.top}
          width={PAD.left + PLOT_W - avgLineX}
          height={avgLineY - PAD.top}
          fill="rgba(16,185,129,0.04)"
        />
        {/* Bottom-left: low dist + low sprint */}
        <Rect
          x={PAD.left}
          y={avgLineY}
          width={avgLineX - PAD.left}
          height={PAD.top + PLOT_H - avgLineY}
          fill="rgba(239,68,68,0.04)"
        />

        {/* Average lines */}
        <Line
          x1={avgLineX} y1={PAD.top}
          x2={avgLineX} y2={PAD.top + PLOT_H}
          stroke={colors.accent.primary}
          strokeWidth={1}
          strokeDasharray="4,3"
          opacity={0.5}
        />
        <Line
          x1={PAD.left} y1={avgLineY}
          x2={PAD.left + PLOT_W} y2={avgLineY}
          stroke={colors.accent.primary}
          strokeWidth={1}
          strokeDasharray="4,3"
          opacity={0.5}
        />

        {/* Axis labels */}
        {xTicks.map((v, i) => (
          <SvgText
            key={`x${i}`}
            x={toX(v)}
            y={PAD.top + PLOT_H + 16}
            textAnchor="middle"
            fill={colors.text.tertiary}
            fontSize={8}
          >
            {(v / 1000).toFixed(0)}km
          </SvgText>
        ))}
        {yTicks.map((v, i) => (
          <SvgText
            key={`y${i}`}
            x={PAD.left - 4}
            y={toY(v) + 3}
            textAnchor="end"
            fill={colors.text.tertiary}
            fontSize={8}
          >
            {Math.round(v)}
          </SvgText>
        ))}

        {/* Axis titles */}
        <SvgText
          x={PAD.left + PLOT_W / 2}
          y={CHART_H - 2}
          textAnchor="middle"
          fill={colors.text.tertiary}
          fontSize={9}
          fontWeight="600"
        >
          {locale === 'pt' ? 'Distância Total' : 'Total Distance'}
        </SvgText>
        <SvgText
          x={10}
          y={PAD.top + PLOT_H / 2}
          textAnchor="middle"
          fill={colors.text.tertiary}
          fontSize={9}
          fontWeight="600"
          rotation="-90"
          originX={10}
          originY={PAD.top + PLOT_H / 2}
        >
          Sprints
        </SvgText>

        {/* Data points */}
        {points.map(p => {
          const cx = toX(p.total_distance);
          const cy = toY(p.sprint_count);
          const dotColor = STATUS_COLORS[p.fatigue_status] || STATUS_COLORS.UNKNOWN;
          const isSelected = selectedId === p.athlete_id;

          return (
            <React.Fragment key={p.athlete_id}>
              {isSelected && (
                <Circle
                  cx={cx}
                  cy={cy}
                  r={DOT_R + 4}
                  fill="none"
                  stroke={dotColor}
                  strokeWidth={1.5}
                  opacity={0.5}
                />
              )}
              <Circle
                cx={cx}
                cy={cy}
                r={isSelected ? DOT_R + 1 : DOT_R}
                fill={dotColor}
                opacity={isSelected ? 1 : 0.8}
                onPress={() => handleDotPress(p.athlete_id)}
              />
            </React.Fragment>
          );
        })}
      </Svg>

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
              {(selectedRow.total_distance / 1000).toFixed(1)} km
            </Text>
            <Text style={[styles.tooltipSep, { color: colors.text.tertiary }]}>|</Text>
            <Text style={[styles.tooltipValue, { color: colors.text.secondary }]}>
              {selectedRow.sprint_count} sprints
            </Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
    alignItems: 'center',
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
  title: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
    alignSelf: 'flex-start',
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
    minWidth: 140,
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
