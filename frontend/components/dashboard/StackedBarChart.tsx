import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import type { TeamTableRowData } from './types';

const ZONE_COLORS = {
  base: '#1e3a5f',
  z3: '#3b82f6',
  z4: '#f59e0b',
  z5: '#ef4444',
};

const TOP_COLOR = '#10b981';
const BOTTOM_COLOR = '#ef4444';

interface Props {
  rows: TeamTableRowData[];
  isLoading: boolean;
  colors: any;
  locale: string;
}

export const StackedBarChart = React.memo(function StackedBarChart({
  rows,
  isLoading,
  colors,
  locale,
}: Props) {
  const [layerZ3, setLayerZ3] = React.useState(true);
  const [layerZ4, setLayerZ4] = React.useState(true);
  const [layerZ5, setLayerZ5] = React.useState(true);

  const toggleZ3 = React.useCallback(() => setLayerZ3(v => !v), []);
  const toggleZ4 = React.useCallback(() => setLayerZ4(v => !v), []);
  const toggleZ5 = React.useCallback(() => setLayerZ5(v => !v), []);

  // Filter athletes with GPS data and sort by total distance desc
  const chartData = React.useMemo(() => {
    return rows
      .filter(r => r.total_distance > 0)
      .sort((a, b) => b.total_distance - a.total_distance);
  }, [rows]);

  // Calculate max stacked value and team average
  const { maxVal, teamAvg, top3Ids, bottom3Ids } = React.useMemo(() => {
    if (chartData.length === 0) return { maxVal: 1, teamAvg: 0, top3Ids: new Set<string>(), bottom3Ids: new Set<string>() };

    let max = 0;
    let sum = 0;

    for (const r of chartData) {
      let barTotal = r.total_distance;
      if (layerZ3) barTotal += r.z3;
      if (layerZ4) barTotal += r.z4;
      if (layerZ5) barTotal += r.z5;
      if (barTotal > max) max = barTotal;
      sum += r.total_distance;
    }

    const avg = sum / chartData.length;

    const top3 = new Set(chartData.slice(0, 3).map(r => r.athlete_id));
    const bottom3 = new Set(chartData.slice(-3).map(r => r.athlete_id));

    return { maxVal: max || 1, teamAvg: avg, top3Ids: top3, bottom3Ids: bottom3 };
  }, [chartData, layerZ3, layerZ4, layerZ5]);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.dark.cardSolid, borderColor: colors.border.default }]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.accent.primary} />
        </View>
      </View>
    );
  }

  if (chartData.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.dark.cardSolid, borderColor: colors.border.default }]}>
        <Text style={[styles.title, { color: colors.text.primary }]}>
          {locale === 'pt' ? 'Carga por Atleta' : 'Load per Athlete'}
        </Text>
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
            {locale === 'pt' ? 'Sem dados GPS no período' : 'No GPS data in period'}
          </Text>
        </View>
      </View>
    );
  }

  // Chart dimensions
  const BAR_WIDTH = 32;
  const BAR_GAP = 6;
  const LABEL_HEIGHT = 40;
  const CHART_HEIGHT = 180;
  const LEFT_PAD = 4;
  const chartWidth = LEFT_PAD + chartData.length * (BAR_WIDTH + BAR_GAP);
  const svgHeight = CHART_HEIGHT + LABEL_HEIGHT;

  // Team average line Y position
  const avgY = CHART_HEIGHT - (teamAvg / maxVal) * CHART_HEIGHT;

  return (
    <View
      style={[styles.container, { backgroundColor: colors.dark.cardSolid, borderColor: colors.border.default }]}
      data-testid="stacked-bar-chart"
    >
      {/* Header */}
      <Text style={[styles.title, { color: colors.text.primary }]}>
        {locale === 'pt' ? 'Carga por Atleta' : 'Load per Athlete'}
      </Text>

      {/* Zone Toggles */}
      <View style={styles.toggleRow}>
        <ToggleChip
          label="Z3"
          active={layerZ3}
          color={ZONE_COLORS.z3}
          onPress={toggleZ3}
          borderColor={colors.border.default}
        />
        <ToggleChip
          label="Z4"
          active={layerZ4}
          color={ZONE_COLORS.z4}
          onPress={toggleZ4}
          borderColor={colors.border.default}
        />
        <ToggleChip
          label="Z5"
          active={layerZ5}
          color={ZONE_COLORS.z5}
          onPress={toggleZ5}
          borderColor={colors.border.default}
        />

        {/* Legend dots */}
        <View style={styles.legendSpacer} />
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: TOP_COLOR }]} />
          <Text style={[styles.legendLabel, { color: colors.text.tertiary }]}>Top 3</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: BOTTOM_COLOR }]} />
          <Text style={[styles.legendLabel, { color: colors.text.tertiary }]}>Bottom 3</Text>
        </View>
      </View>

      {/* Chart */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
        <Svg width={chartWidth} height={svgHeight}>
          {/* Average line */}
          <Line
            x1={0}
            y1={avgY}
            x2={chartWidth}
            y2={avgY}
            stroke={colors.accent.primary}
            strokeWidth={1}
            strokeDasharray="4,4"
            opacity={0.6}
          />
          <SvgText
            x={chartWidth - 4}
            y={avgY - 4}
            textAnchor="end"
            fill={colors.accent.primary}
            fontSize={9}
            fontWeight="600"
            opacity={0.8}
          >
            {locale === 'pt' ? 'Média' : 'Avg'} {(teamAvg / 1000).toFixed(1)}km
          </SvgText>

          {/* Bars */}
          {chartData.map((row, i) => {
            const x = LEFT_PAD + i * (BAR_WIDTH + BAR_GAP);
            const isTop = top3Ids.has(row.athlete_id);
            const isBottom = bottom3Ids.has(row.athlete_id);

            // Stack segments bottom-up: base -> z3 -> z4 -> z5
            const baseH = (row.total_distance / maxVal) * CHART_HEIGHT;
            const z3H = layerZ3 ? (row.z3 / maxVal) * CHART_HEIGHT : 0;
            const z4H = layerZ4 ? (row.z4 / maxVal) * CHART_HEIGHT : 0;
            const z5H = layerZ5 ? (row.z5 / maxVal) * CHART_HEIGHT : 0;

            let cursor = CHART_HEIGHT;

            const segments: { y: number; h: number; color: string }[] = [];

            // Base distance
            cursor -= baseH;
            segments.push({ y: cursor, h: baseH, color: ZONE_COLORS.base });

            // Z3
            if (z3H > 0) {
              cursor -= z3H;
              segments.push({ y: cursor, h: z3H, color: ZONE_COLORS.z3 });
            }

            // Z4
            if (z4H > 0) {
              cursor -= z4H;
              segments.push({ y: cursor, h: z4H, color: ZONE_COLORS.z4 });
            }

            // Z5
            if (z5H > 0) {
              cursor -= z5H;
              segments.push({ y: cursor, h: z5H, color: ZONE_COLORS.z5 });
            }

            // Highlight border color
            const borderCol = isTop ? TOP_COLOR : isBottom ? BOTTOM_COLOR : 'none';

            // Short name (first name or initials)
            const shortName = row.name.length > 5
              ? row.name.split(' ').map(w => w[0]).join('').slice(0, 3)
              : row.name;

            return (
              <React.Fragment key={row.athlete_id}>
                {/* Highlight border */}
                {borderCol !== 'none' && (
                  <Rect
                    x={x - 1.5}
                    y={segments[0]?.y ? segments[0].y - 1.5 : CHART_HEIGHT - 1.5}
                    width={BAR_WIDTH + 3}
                    height={CHART_HEIGHT - (segments[0]?.y ?? CHART_HEIGHT) + 3}
                    rx={4}
                    fill="none"
                    stroke={borderCol}
                    strokeWidth={1.5}
                    opacity={0.7}
                  />
                )}

                {/* Stacked segments */}
                {segments.map((seg, si) => (
                  <Rect
                    key={si}
                    x={x}
                    y={seg.y}
                    width={BAR_WIDTH}
                    height={Math.max(seg.h, 0.5)}
                    rx={si === segments.length - 1 ? 3 : 0}
                    fill={seg.color}
                    opacity={0.9}
                  />
                ))}

                {/* Value label on top */}
                <SvgText
                  x={x + BAR_WIDTH / 2}
                  y={cursor - 4}
                  textAnchor="middle"
                  fill={colors.text.secondary}
                  fontSize={8}
                  fontWeight="600"
                >
                  {(row.total_distance / 1000).toFixed(1)}
                </SvgText>

                {/* Name label at bottom */}
                <SvgText
                  x={x + BAR_WIDTH / 2}
                  y={CHART_HEIGHT + 14}
                  textAnchor="middle"
                  fill={isTop ? TOP_COLOR : isBottom ? BOTTOM_COLOR : colors.text.tertiary}
                  fontSize={8}
                  fontWeight={isTop || isBottom ? '700' : '500'}
                >
                  {shortName}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      </ScrollView>
    </View>
  );
});

// Toggle chip sub-component
const ToggleChip = React.memo(function ToggleChip({
  label,
  active,
  color,
  onPress,
  borderColor,
}: {
  label: string;
  active: boolean;
  color: string;
  onPress: () => void;
  borderColor: string;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.toggleBtn,
        {
          backgroundColor: active ? `${color}22` : 'transparent',
          borderColor: active ? color : borderColor,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      data-testid={`toggle-${label.toLowerCase()}`}
    >
      <View style={[styles.toggleDot, { backgroundColor: active ? color : 'transparent', borderColor: color }]} />
      <Text style={[styles.toggleLabel, { color: active ? color : '#64748b' }]}>{label}</Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  loadingWrap: {
    height: 180,
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
    marginBottom: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
    flexWrap: 'wrap',
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    gap: 5,
  },
  toggleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  toggleLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  legendSpacer: {
    flex: 1,
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
    fontSize: 9,
    fontWeight: '500',
  },
});
