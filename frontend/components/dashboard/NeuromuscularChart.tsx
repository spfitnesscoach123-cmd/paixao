import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import Svg, { Rect, Line, Circle, Polyline, Polygon, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { TeamTableRowData } from './types';
import { InfoTooltip } from './StackedBarChart';

// Palette harmonized with StackedBarChart (sapphire + warm accents)
const RSI_COLOR = '#2FB6FF';           // same sapphire as Z3 in bar chart (consistency)
const FATIGUE_COLOR = '#F5B941';       // warm amber — not conflicting red
const BASELINE_RSI_COLOR = '#7BD4FF';  // sapphire light

interface Props {
  rows: TeamTableRowData[];
  isLoading: boolean;
  colors: any;
  locale: string;
}

/**
 * CMJ-based Neuromuscular Fatigue Index (%)
 * Formula: ((baseline - current) / baseline) × 100
 * Positive → fatigue; Negative → potentiation; 0 → baseline equilibrium.
 * READ-ONLY derivation from existing fields served by the API.
 * Same formula used on the athlete profile (Jump Assessment / Strength & VBT).
 */
function computeCmjFatigue(rsimod: number | null, baseline: number | null): number | null {
  if (rsimod == null || baseline == null || baseline <= 0) return null;
  return ((baseline - rsimod) / baseline) * 100;
}

export const NeuromuscularChart = React.memo(function NeuromuscularChart({
  rows,
  isLoading,
  colors,
  locale,
}: Props) {
  const [showRsiBaseline, setShowRsiBaseline] = React.useState(true);
  const [tooltipVisible, setTooltipVisible] = React.useState(false);
  const { width: winWidth } = useWindowDimensions();

  const toggleRsiBase = React.useCallback(() => setShowRsiBaseline(v => !v), []);

  // CMJ-based fatigue computed per athlete (READ-ONLY derivation)
  const chartData = React.useMemo(() => {
    return rows
      .map(r => ({ ...r, cmj_fatigue: computeCmjFatigue(r.rsimod, r.rsimod_baseline_28d) }))
      .filter(r => r.rsimod != null || r.cmj_fatigue != null);
  }, [rows]);

  const { maxRsi } = React.useMemo(() => {
    if (chartData.length === 0) return { maxRsi: 1 };
    let mxR = 0;
    for (const r of chartData) {
      if (r.rsimod != null && r.rsimod > mxR) mxR = r.rsimod;
      if (r.rsimod_baseline_28d != null && r.rsimod_baseline_28d > mxR) mxR = r.rsimod_baseline_28d;
    }
    return { maxRsi: Math.max(mxR * 1.2, 0.5) };
  }, [chartData]);

  // Fatigue axis: symmetric around 0, clamped to ±50% for plotting
  const FAT_RANGE = 50; // −50% (potentiation) to +50% (fatigue)

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
            {locale === 'pt' ? 'Sem dados de RSImod no período' : 'No RSImod data in period'}
          </Text>
        </View>
      </View>
    );
  }

  // Responsive chart sizing
  const BAR_W = winWidth >= 900 ? 48 : winWidth >= 600 ? 42 : 36;
  const GAP = winWidth >= 900 ? 10 : 8;
  const CHART_H = winWidth >= 900 ? 260 : 200;
  const PAD_TOP = 16;
  const PAD_BOTTOM = 36;
  const PAD_LEFT = 4;
  const PLOT_H = CHART_H - PAD_TOP - PAD_BOTTOM;
  const chartWidth = PAD_LEFT + chartData.length * (BAR_W + GAP);

  const rsiToY = (v: number) => PAD_TOP + PLOT_H - (v / maxRsi) * PLOT_H;
  // Symmetric fatigue axis: −FAT_RANGE at bottom, +FAT_RANGE at top
  const fatToY = (v: number) => {
    const clamped = Math.max(-FAT_RANGE, Math.min(FAT_RANGE, v));
    // Map [-FAT_RANGE, FAT_RANGE] → [PAD_TOP + PLOT_H, PAD_TOP]  (positive fatigue → top of chart)
    const norm = (clamped + FAT_RANGE) / (FAT_RANGE * 2);
    return PAD_TOP + PLOT_H - norm * PLOT_H;
  };

  const zeroY = fatToY(0);

  // Build CMJ-fatigue polyline
  const fatiguePoints = chartData
    .map((r, i) => {
      if (r.cmj_fatigue == null) return null;
      const x = PAD_LEFT + i * (BAR_W + GAP) + BAR_W / 2;
      const y = fatToY(r.cmj_fatigue);
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(' ');

  // RSI baseline band polygon (unchanged)
  const rsiBaselinePath = (() => {
    if (!showRsiBaseline) return null;
    const pts: string[] = [];
    const floorY = PAD_TOP + PLOT_H;
    chartData.forEach((r, i) => {
      if (r.rsimod_baseline_28d == null) return;
      const x = PAD_LEFT + i * (BAR_W + GAP) + BAR_W / 2;
      const y = rsiToY(r.rsimod_baseline_28d);
      pts.push(`${x},${y}`);
    });
    if (pts.length < 2) return null;
    const first = pts[0].split(',')[0];
    const last = pts[pts.length - 1].split(',')[0];
    return `${first},${floorY} ${pts.join(' ')} ${last},${floorY}`;
  })();

  return (
    <View
      style={[styles.container, { backgroundColor: colors.dark.cardSolid, borderColor: colors.border.default }]}
      data-testid="neuromuscular-chart"
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text.primary }]}>
          {locale === 'pt' ? 'Neuromuscular' : 'Neuromuscular'}
        </Text>
        <TouchableOpacity
          onPress={() => setTooltipVisible(true)}
          data-testid="neuromuscular-info"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="information-circle-outline" size={18} color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>

      {/* Toggles */}
      <View style={styles.toggleRow}>
        <ToggleChip
          label={locale === 'pt' ? 'RSImod baseline 28d' : 'RSImod baseline 28d'}
          active={showRsiBaseline}
          color={BASELINE_RSI_COLOR}
          onPress={toggleRsiBase}
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
            {locale === 'pt' ? 'Fadiga Neuromuscular (CMJ)' : 'Neuromuscular Fatigue (CMJ)'}
          </Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
        <Svg width={chartWidth} height={CHART_H}>
          {/* RSImod baseline AREA (below-baseline shading) */}
          {rsiBaselinePath && (
            <Polygon
              points={rsiBaselinePath}
              fill={BASELINE_RSI_COLOR}
              opacity={0.12}
            />
          )}

          {/* RSImod baseline guide line (subtle) */}
          {showRsiBaseline && chartData.some(r => r.rsimod_baseline_28d != null) && (
            <Polyline
              points={chartData
                .map((r, i) => {
                  if (r.rsimod_baseline_28d == null) return null;
                  const x = PAD_LEFT + i * (BAR_W + GAP) + BAR_W / 2;
                  const y = rsiToY(r.rsimod_baseline_28d);
                  return `${x},${y}`;
                })
                .filter(Boolean)
                .join(' ')}
              fill="none"
              stroke={BASELINE_RSI_COLOR}
              strokeWidth={1}
              opacity={0.55}
            />
          )}

          {/* RSImod Bars */}
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
                  opacity={0.9}
                />
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

          {/* Zero-fatigue reference line (neutral baseline) */}
          <Line
            x1={PAD_LEFT}
            y1={zeroY}
            x2={chartWidth}
            y2={zeroY}
            stroke={FATIGUE_COLOR}
            strokeWidth={1}
            strokeDasharray="3,3"
            opacity={0.45}
          />

          {/* Fatigue line (solid) */}
          {fatiguePoints.length > 0 && (
            <Polyline
              points={fatiguePoints}
              fill="none"
              stroke={FATIGUE_COLOR}
              strokeWidth={2.2}
              opacity={0.95}
            />
          )}

          {/* Fatigue dots */}
          {chartData.map((r, i) => {
            if (r.cmj_fatigue == null) return null;
            const cx = PAD_LEFT + i * (BAR_W + GAP) + BAR_W / 2;
            const cy = fatToY(r.cmj_fatigue);
            return (
              <Circle
                key={`fdot-${r.athlete_id}`}
                cx={cx}
                cy={cy}
                r={4}
                fill={FATIGUE_COLOR}
                opacity={0.95}
                stroke="#081C3A"
                strokeWidth={1}
              />
            );
          })}

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
                fontSize={9}
                fontWeight="500"
              >
                {shortName}
              </SvgText>
            );
          })}

          {/* Right-side Y axis labels for CMJ fatigue (symmetric ±FAT_RANGE) */}
          <SvgText x={chartWidth - 2} y={PAD_TOP + 3} textAnchor="end" fill={FATIGUE_COLOR} fontSize={8} opacity={0.7}>+{FAT_RANGE}%</SvgText>
          <SvgText x={chartWidth - 2} y={zeroY + 3} textAnchor="end" fill={FATIGUE_COLOR} fontSize={8} opacity={0.7}>0%</SvgText>
          <SvgText x={chartWidth - 2} y={PAD_TOP + PLOT_H + 3} textAnchor="end" fill={FATIGUE_COLOR} fontSize={8} opacity={0.7}>−{FAT_RANGE}%</SvgText>
        </Svg>
      </ScrollView>

      <InfoTooltip
        visible={tooltipVisible}
        onClose={() => setTooltipVisible(false)}
        colors={colors}
        title={locale === 'pt' ? 'Neuromuscular' : 'Neuromuscular'}
        body={
          locale === 'pt'
            ? 'Barras azul safira mostram o RSImod (Reactive Strength Index modificado) de cada atleta. A linha âmbar representa o Índice de Fadiga Neuromuscular (%), calculado a partir da variação do RSImod no CMJ em relação ao baseline individual (últimos 28d) do atleta — valores positivos indicam fadiga, negativos indicam potenciação. Independe de dados de wellness. A área sombreada azul marca o patamar histórico de RSImod. Use o toggle acima para mostrar/ocultar a baseline.'
            : 'Sapphire bars show each athlete RSImod (modified Reactive Strength Index). The amber line represents the Neuromuscular Fatigue Index (%), computed from the athlete\'s CMJ RSImod variation vs their individual 28-day baseline — positive values indicate fatigue, negative values indicate potentiation. Independent from wellness data. The shaded blue area marks the historical RSImod baseline. Use the toggle above to show/hide the baseline.'
        }
      />
    </View>
  );
});

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
          backgroundColor: active ? `${color}26` : 'transparent',
          borderColor: active ? color : borderColor,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      data-testid={`toggle-${label.toLowerCase().replace(/\s+/g, '-')}`}
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
    width: '100%',
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
