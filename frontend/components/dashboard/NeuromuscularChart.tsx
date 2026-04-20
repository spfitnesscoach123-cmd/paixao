import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Svg, { Rect, Line, Circle, Polyline, Text as SvgText } from 'react-native-svg';
import type { TeamTableRowData } from './types';

const RSI_COLOR = '#7CFF3A';
const FATIGUE_COLOR = '#ef4444';
const BASELINE_RSI_COLOR = '#7BD4FF';
const BASELINE_FAT_COLOR = '#f87171';

interface Props {
  rows: TeamTableRowData[];
  isLoading: boolean;
  colors: any;
  locale: string;
}

export const NeuromuscularChart = React.memo(function NeuromuscularChart({
  rows,
  isLoading,
  colors,
  locale,
}: Props) {
  const [showRsiBaseline, setShowRsiBaseline] = React.useState(true);
  const [showFatBaseline, setShowFatBaseline] = React.useState(true);

  const toggleRsiBase = React.useCallback(() => setShowRsiBaseline(v => !v), []);
  const toggleFatBase = React.useCallback(() => setShowFatBaseline(v => !v), []);

  // Filter athletes with at least RSI or fatigue data
  const chartData = React.useMemo(() => {
    return rows.filter(r => r.rsimod != null || r.fatigue_index != null);
  }, [rows]);

  // Compute axis ranges
  const { maxRsi, maxFatigue } = React.useMemo(() => {
    if (chartData.length === 0) return { maxRsi: 1, maxFatigue: 100 };
    let mxR = 0;
    let mxF = 100; // fatigue is 0-100 scale
    for (const r of chartData) {
      if (r.rsimod != null && r.rsimod > mxR) mxR = r.rsimod;
      if (r.rsimod_baseline_28d != null && r.rsimod_baseline_28d > mxR) mxR = r.rsimod_baseline_28d;
    }
    return { maxRsi: Math.max(mxR * 1.2, 0.5), maxFatigue: mxF };
  }, [chartData]);

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
          {locale === 'pt' ? 'Neuromuscular' : 'Neuromuscular'}
        </Text>
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
            {locale === 'pt' ? 'Sem dados de RSImod ou fadiga no período' : 'No RSImod or fatigue data in period'}
          </Text>
        </View>
      </View>
    );
  }

  // Chart dimensions
  const BAR_W = 36;
  const GAP = 8;
  const CHART_H = 180;
  const PAD_TOP = 16;
  const PAD_BOTTOM = 36;
  const PAD_LEFT = 4;
  const PLOT_H = CHART_H - PAD_TOP - PAD_BOTTOM;
  const chartWidth = PAD_LEFT + chartData.length * (BAR_W + GAP);
  const svgH = CHART_H;

  // Helpers
  const rsiToY = (v: number) => PAD_TOP + PLOT_H - (v / maxRsi) * PLOT_H;
  const fatToY = (v: number) => PAD_TOP + PLOT_H - (v / maxFatigue) * PLOT_H;

  // Build fatigue line points
  const fatiguePoints = chartData
    .map((r, i) => {
      if (r.fatigue_index == null) return null;
      const x = PAD_LEFT + i * (BAR_W + GAP) + BAR_W / 2;
      const y = fatToY(r.fatigue_index);
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(' ');

  // Build fatigue baseline points
  const fatBasePoints = showFatBaseline
    ? chartData
        .map((r, i) => {
          if (r.fatigue_baseline_28d == null) return null;
          const x = PAD_LEFT + i * (BAR_W + GAP) + BAR_W / 2;
          const y = fatToY(r.fatigue_baseline_28d);
          return `${x},${y}`;
        })
        .filter(Boolean)
        .join(' ')
    : '';

  // Build RSI baseline points
  const rsiBasePoints = showRsiBaseline
    ? chartData
        .map((r, i) => {
          if (r.rsimod_baseline_28d == null) return null;
          const x = PAD_LEFT + i * (BAR_W + GAP) + BAR_W / 2;
          const y = rsiToY(r.rsimod_baseline_28d);
          return `${x},${y}`;
        })
        .filter(Boolean)
        .join(' ')
    : '';

  return (
    <View
      style={[styles.container, { backgroundColor: colors.dark.cardSolid, borderColor: colors.border.default }]}
      data-testid="neuromuscular-chart"
    >
      <Text style={[styles.title, { color: colors.text.primary }]}>
        {locale === 'pt' ? 'Neuromuscular' : 'Neuromuscular'}
      </Text>

      {/* Toggles */}
      <View style={styles.toggleRow}>
        <ToggleChip
          label={locale === 'pt' ? 'RSI baseline 28d' : 'RSI baseline 28d'}
          active={showRsiBaseline}
          color={BASELINE_RSI_COLOR}
          onPress={toggleRsiBase}
          borderColor={colors.border.default}
        />
        <ToggleChip
          label={locale === 'pt' ? 'Fadiga baseline 28d' : 'Fatigue baseline 28d'}
          active={showFatBaseline}
          color={BASELINE_FAT_COLOR}
          onPress={toggleFatBase}
          borderColor={colors.border.default}
        />
      </View>

      {/* Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendRect, { backgroundColor: RSI_COLOR }]} />
          <Text style={[styles.legendLabel, { color: colors.text.tertiary }]}>RSImod</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: FATIGUE_COLOR }]} />
          <Text style={[styles.legendLabel, { color: colors.text.tertiary }]}>
            {locale === 'pt' ? 'Fadiga' : 'Fatigue'}
          </Text>
        </View>
      </View>

      {/* Chart */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
        <Svg width={chartWidth} height={svgH}>
          {/* RSI Bars */}
          {chartData.map((r, i) => {
            if (r.rsimod == null) return null;
            const x = PAD_LEFT + i * (BAR_W + GAP);
            const barH = (r.rsimod / maxRsi) * PLOT_H;
            const y = PAD_TOP + PLOT_H - barH;

            return (
              <React.Fragment key={`bar-${r.athlete_id}`}>
                <Rect
                  x={x}
                  y={y}
                  width={BAR_W}
                  height={Math.max(barH, 1)}
                  rx={3}
                  fill={RSI_COLOR}
                  opacity={0.8}
                />
                {/* RSI value label */}
                <SvgText
                  x={x + BAR_W / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fill={RSI_COLOR}
                  fontSize={9}
                  fontWeight="700"
                >
                  {r.rsimod.toFixed(2)}
                </SvgText>
              </React.Fragment>
            );
          })}

          {/* RSI Baseline line (dashed) */}
          {rsiBasePoints.length > 0 && (
            <Polyline
              points={rsiBasePoints}
              fill="none"
              stroke={BASELINE_RSI_COLOR}
              strokeWidth={1.5}
              strokeDasharray="4,3"
              opacity={0.7}
            />
          )}

          {/* Fatigue line (solid) */}
          {fatiguePoints.length > 0 && (
            <Polyline
              points={fatiguePoints}
              fill="none"
              stroke={FATIGUE_COLOR}
              strokeWidth={2}
              opacity={0.9}
            />
          )}

          {/* Fatigue dots */}
          {chartData.map((r, i) => {
            if (r.fatigue_index == null) return null;
            const cx = PAD_LEFT + i * (BAR_W + GAP) + BAR_W / 2;
            const cy = fatToY(r.fatigue_index);
            return (
              <Circle
                key={`fdot-${r.athlete_id}`}
                cx={cx}
                cy={cy}
                r={4}
                fill={FATIGUE_COLOR}
                opacity={0.9}
              />
            );
          })}

          {/* Fatigue baseline line (dashed) */}
          {fatBasePoints.length > 0 && (
            <Polyline
              points={fatBasePoints}
              fill="none"
              stroke={BASELINE_FAT_COLOR}
              strokeWidth={1.5}
              strokeDasharray="4,3"
              opacity={0.6}
            />
          )}

          {/* Name labels at bottom */}
          {chartData.map((r, i) => {
            const x = PAD_LEFT + i * (BAR_W + GAP) + BAR_W / 2;
            const shortName = r.name.length > 5
              ? r.name.split(' ').map(w => w[0]).join('').slice(0, 3)
              : r.name;
            return (
              <SvgText
                key={`lbl-${r.athlete_id}`}
                x={x}
                y={CHART_H - PAD_BOTTOM + 14}
                textAnchor="middle"
                fill={colors.text.tertiary}
                fontSize={8}
                fontWeight="500"
              >
                {shortName}
              </SvgText>
            );
          })}

          {/* Right-side Y axis labels for fatigue (0-100%) */}
          <SvgText x={chartWidth - 2} y={PAD_TOP + 3} textAnchor="end" fill={FATIGUE_COLOR} fontSize={8} opacity={0.6}>100%</SvgText>
          <SvgText x={chartWidth - 2} y={PAD_TOP + PLOT_H / 2 + 3} textAnchor="end" fill={FATIGUE_COLOR} fontSize={8} opacity={0.6}>50%</SvgText>
          <SvgText x={chartWidth - 2} y={PAD_TOP + PLOT_H + 3} textAnchor="end" fill={FATIGUE_COLOR} fontSize={8} opacity={0.6}>0%</SvgText>
        </Svg>
      </ScrollView>
    </View>
  );
});

// Toggle chip
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
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
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
    fontSize: 10,
    fontWeight: '600',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendRect: {
    width: 12,
    height: 8,
    borderRadius: 2,
  },
  legendLine: {
    width: 14,
    height: 2,
    borderRadius: 1,
  },
  legendLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
});
