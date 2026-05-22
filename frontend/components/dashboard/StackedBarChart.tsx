import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import Svg, { Rect, Line, Text as SvgText, G, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { TeamTableRowData } from './types';

// Colors harmonized with app palette (sapphire primary + green perf + amber/red warnings)
const ZONE_COLORS = {
  base: '#1B4C80',  // navy elevated — base Total Distance
  z3: '#2FB6FF',    // sapphire
  z4: '#7BD4FF',    // sapphire light (HSR)
  z5: '#F5B941',    // warm accent (sprint intensity)
};

const TOP_COLOR = '#7CFF3A';     // green performance (logo)
const BOTTOM_COLOR = '#FF4D6D';  // error red

// Minimum visual height to keep Z5 perceptible when TD dominates the scale
const MIN_SEGMENT_PX = 4;

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
  const [tooltipVisible, setTooltipVisible] = React.useState(false);
  const [selectedRow, setSelectedRow] = React.useState<TeamTableRowData | null>(null);
  const { width: winWidth } = useWindowDimensions();

  const toggleZ3 = React.useCallback(() => setLayerZ3(v => !v), []);
  const toggleZ4 = React.useCallback(() => setLayerZ4(v => !v), []);
  const toggleZ5 = React.useCallback(() => setLayerZ5(v => !v), []);

  // Filter athletes with GPS data and sort by total distance desc
  const chartData = React.useMemo(() => {
    return rows
      .filter(r => r.total_distance > 0)
      .sort((a, b) => b.total_distance - a.total_distance);
  }, [rows]);

  // Entry animation — fade + staggered grow-from-floor (one Animated.Value shared for fade,
  // per-bar progress values for vertical reveal). Respects reduced-motion by reducing duration on web.
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const progressAnim = React.useRef(new Animated.Value(0)).current;
  const dataKey = chartData.map(r => r.athlete_id).join('|');

  React.useEffect(() => {
    fadeAnim.setValue(0);
    progressAnim.setValue(0);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false, // SVG dims need JS-driven interpolation
      }),
    ]).start();
  }, [dataKey, fadeAnim, progressAnim]);

  // Calculate max stacked value and team average (DATA UNCHANGED)
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

  // Responsive chart dimensions
  const BAR_WIDTH = winWidth >= 900 ? 44 : winWidth >= 600 ? 38 : 32;
  const BAR_GAP = winWidth >= 900 ? 10 : 6;
  const LABEL_HEIGHT = 40;
  const CHART_HEIGHT = winWidth >= 900 ? 260 : 200;
  const LEFT_PAD = 4;
  const chartWidth = LEFT_PAD + chartData.length * (BAR_WIDTH + BAR_GAP);
  const svgHeight = CHART_HEIGHT + LABEL_HEIGHT;

  // Team average line Y position
  const avgY = CHART_HEIGHT - (teamAvg / maxVal) * CHART_HEIGHT;

  const isWeb = Platform.OS === 'web';

  return (
    <View
      style={[styles.container, { backgroundColor: colors.dark.cardSolid, borderColor: colors.border.default }]}
      data-testid="stacked-bar-chart"
    >
      {/* Header with info icon */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text.primary }]}>
          {locale === 'pt' ? 'Carga por Atleta' : 'Load per Athlete'}
        </Text>
        <TouchableOpacity
          onPress={() => setTooltipVisible(true)}
          data-testid="stacked-chart-info"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="information-circle-outline" size={18} color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>

      {/* Zone Toggles */}
      <View style={styles.toggleRow}>
        <ToggleChip label="Z3" active={layerZ3} color={ZONE_COLORS.z3} onPress={toggleZ3} borderColor={colors.border.default} />
        <ToggleChip label="Z4 (HSR)" active={layerZ4} color={ZONE_COLORS.z4} onPress={toggleZ4} borderColor={colors.border.default} />
        <ToggleChip label="Z5 (Sprint)" active={layerZ5} color={ZONE_COLORS.z5} onPress={toggleZ5} borderColor={colors.border.default} />

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

      {/* Chart — wrapped in Animated.View for entry fade + reveal mask */}
      <Animated.View style={{ opacity: fadeAnim, position: 'relative' }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
        <View style={{ position: 'relative', width: chartWidth, height: svgHeight }}>
        <Svg width={chartWidth} height={svgHeight}>
          {/* Average highlighted band */}
          <Rect
            x={0}
            y={avgY - 1}
            width={chartWidth}
            height={2}
            fill={colors.accent.primary}
            opacity={0.18}
          />
          <Line
            x1={0}
            y1={avgY}
            x2={chartWidth}
            y2={avgY}
            stroke={colors.accent.primary}
            strokeWidth={2}
            strokeDasharray="6,3"
            opacity={1}
          />
          {/* Average label badge */}
          <Rect
            x={chartWidth - 70}
            y={avgY - 16}
            width={66}
            height={14}
            rx={3}
            fill={colors.accent.primary}
            opacity={0.92}
          />
          <SvgText
            x={chartWidth - 37}
            y={avgY - 5}
            textAnchor="middle"
            fill="#081C3A"
            fontSize={9}
            fontWeight="700"
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
            let z3H = layerZ3 ? (row.z3 / maxVal) * CHART_HEIGHT : 0;
            let z4H = layerZ4 ? (row.z4 / maxVal) * CHART_HEIGHT : 0;
            let z5H = layerZ5 ? (row.z5 / maxVal) * CHART_HEIGHT : 0;

            // Visual normalization: enforce min height for Z4/Z5 when data > 0
            // so high-intensity segments stay perceptible even when TD dominates the scale.
            // DATA is NOT altered — only the painted segment has a visual floor.
            if (layerZ4 && row.z4 > 0 && z4H < MIN_SEGMENT_PX) z4H = MIN_SEGMENT_PX;
            if (layerZ5 && row.z5 > 0 && z5H < MIN_SEGMENT_PX) z5H = MIN_SEGMENT_PX;
            if (layerZ3 && row.z3 > 0 && z3H < MIN_SEGMENT_PX / 2) z3H = MIN_SEGMENT_PX / 2;

            let cursor = CHART_HEIGHT;
            const segments: { y: number; h: number; color: string }[] = [];

            cursor -= baseH;
            segments.push({ y: cursor, h: baseH, color: ZONE_COLORS.base });

            if (z3H > 0) { cursor -= z3H; segments.push({ y: cursor, h: z3H, color: ZONE_COLORS.z3 }); }
            if (z4H > 0) { cursor -= z4H; segments.push({ y: cursor, h: z4H, color: ZONE_COLORS.z4 }); }
            if (z5H > 0) { cursor -= z5H; segments.push({ y: cursor, h: z5H, color: ZONE_COLORS.z5 }); }

            const borderCol = isTop ? TOP_COLOR : isBottom ? BOTTOM_COLOR : 'none';

            const shortName = row.name.length > 5
              ? row.name.split(' ').map(w => w[0]).join('').slice(0, 3)
              : row.name;

            const openDetail = () => setSelectedRow(row);
            const barEventProps: any = isWeb
              ? { onClick: openDetail, onPress: openDetail }
              : { onPress: openDetail };

            return (
              <G key={row.athlete_id} {...barEventProps}>
                {/* Invisible full-column hit area — ensures reliable tap/click across platforms */}
                <Rect
                  x={x - 2}
                  y={0}
                  width={BAR_WIDTH + 4}
                  height={CHART_HEIGHT}
                  fill="transparent"
                />
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
                    opacity={0.85}
                  />
                )}

                {segments.map((seg, si) => (
                  <Rect
                    key={si}
                    x={x}
                    y={seg.y}
                    width={BAR_WIDTH}
                    height={Math.max(seg.h, 0.5)}
                    rx={si === segments.length - 1 ? 3 : 0}
                    fill={seg.color}
                    opacity={0.92}
                  />
                ))}

                <SvgText
                  x={x + BAR_WIDTH / 2}
                  y={cursor - 4}
                  textAnchor="middle"
                  fill={colors.text.secondary}
                  fontSize={9}
                  fontWeight="600"
                >
                  {(row.total_distance / 1000).toFixed(1)}
                </SvgText>

                <SvgText
                  x={x + BAR_WIDTH / 2}
                  y={CHART_HEIGHT + 14}
                  textAnchor="middle"
                  fill={isTop ? TOP_COLOR : isBottom ? BOTTOM_COLOR : colors.text.tertiary}
                  fontSize={9}
                  fontWeight={isTop || isBottom ? '700' : '500'}
                >
                  {shortName}
                </SvgText>
              </G>
            );
          })}
        </Svg>

        {/* Reveal mask — shrinks from top to bottom over progressAnim, exposing bars */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: progressAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [CHART_HEIGHT, 0],
            }),
            backgroundColor: colors.dark.cardSolid,
          }}
        />
        </View>
      </ScrollView>
      </Animated.View>

      {/* Info Tooltip Modal */}
      <InfoTooltip
        visible={tooltipVisible}
        onClose={() => setTooltipVisible(false)}
        colors={colors}
        title={locale === 'pt' ? 'Carga por Atleta' : 'Load per Athlete'}
        body={
          locale === 'pt'
            ? 'Distância total (barra base, metros) somada a Z3, Z4 (HSR) e Z5 (Sprint) de cada atleta. Os 3 melhores e piores são destacados. A linha tracejada indica a média do grupo no período. Toque em uma barra para ver o detalhamento individual.'
            : 'Total distance (base bar, meters) stacked with Z3, Z4 (HSR) and Z5 (Sprint) per athlete. Top 3 and bottom 3 are highlighted. The dashed line shows the team average for the period. Tap a bar to see individual breakdown.'
        }
      />

      {/* Bar detail modal — shown when user taps/clicks a bar.
          READ-ONLY display of already-loaded row fields — no recalculation. */}
      <Modal
        visible={!!selectedRow}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedRow(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setSelectedRow(null)}
        >
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.dark.cardSolid, borderColor: colors.accent.primary, maxWidth: 320 },
            ]}
            data-testid="bar-detail-modal"
          >
            {selectedRow && (
              <>
                <View style={styles.modalHeader}>
                  <View style={[styles.legendDot, { width: 10, height: 10, backgroundColor: ZONE_COLORS.z3 }]} />
                  <Text style={[styles.modalTitle, { color: colors.text.primary }]} numberOfLines={1}>
                    {selectedRow.name}
                  </Text>
                </View>
                <View style={{ gap: 6, marginBottom: 14 }}>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>TD</Text>
                    <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                      {(selectedRow.total_distance / 1000).toFixed(1)} km
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>HSR (Z4)</Text>
                    <Text style={[styles.detailValue, { color: ZONE_COLORS.z4 }]}>
                      {Math.round(selectedRow.z4)} m
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>Sprint (Z5)</Text>
                    <Text style={[styles.detailValue, { color: ZONE_COLORS.z5 }]}>
                      {Math.round(selectedRow.z5)} m
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedRow(null)}
                  style={[styles.modalBtn, { backgroundColor: colors.accent.primary }]}
                  data-testid="bar-detail-close"
                >
                  <Text style={styles.modalBtnText}>OK</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
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

// Info tooltip modal (shared style)
export const InfoTooltip = React.memo(function InfoTooltip({
  visible,
  onClose,
  colors,
  title,
  body,
}: {
  visible: boolean;
  onClose: () => void;
  colors: any;
  title: string;
  body: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={[styles.modalCard, { backgroundColor: colors.dark.cardSolid, borderColor: colors.accent.primary }]}>
          <View style={styles.modalHeader}>
            <Ionicons name="information-circle" size={20} color={colors.accent.primary} />
            <Text style={[styles.modalTitle, { color: colors.text.primary }]}>{title}</Text>
          </View>
          <Text style={[styles.modalBody, { color: colors.text.secondary }]}>{body}</Text>
          <TouchableOpacity onPress={onClose} style={[styles.modalBtn, { backgroundColor: colors.accent.primary }]}>
            <Text style={styles.modalBtnText}>OK</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
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
    marginBottom: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    maxWidth: 420,
    width: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalBody: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  modalBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalBtnText: {
    color: '#081C3A',
    fontWeight: '700',
    fontSize: 13,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.12)',
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '700',
  },
});
