import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import api from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

interface ACWRHistoryPoint {
  date: string;
  acwr: number;
  acute: number;
  chronic: number;
  risk_level: string;
}

interface ACWRHistoryResponse {
  athlete_id: string;
  athlete_name: string;
  metric: string;
  history: ACWRHistoryPoint[];
}

interface ACWRChartProps {
  athleteId: string;
}

const METRICS = [
  { key: 'total_distance', label: 'Total Distance', icon: 'walk-outline' },
  { key: 'hid', label: 'High Intensity', icon: 'flash-outline' },
  { key: 'hsr', label: 'High Speed', icon: 'speedometer-outline' },
  { key: 'sprint', label: 'Sprint', icon: 'rocket-outline' },
  { key: 'acc_dec', label: 'Acc/Dec', icon: 'trending-up-outline' },
];

const screenWidth = Dimensions.get('window').width;

export const ACWREvolutionChart: React.FC<ACWRChartProps> = ({ athleteId }) => {
  const { t } = useLanguage();
  const [selectedMetric, setSelectedMetric] = useState('total_distance');
  const [days, setDays] = useState(14);

  const { data: historyData, isLoading, error } = useQuery({
    queryKey: ['acwr-history', athleteId, selectedMetric, days],
    queryFn: async () => {
      const response = await api.get<ACWRHistoryResponse>(
        `/analysis/acwr-history/${athleteId}?metric=${selectedMetric}&days=${days}`
      );
      return response.data;
    },
    enabled: !!athleteId,
    retry: false,
  });

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'high': return '#ef4444';
      case 'moderate': return '#f59e0b';
      case 'optimal': return '#10b981';
      case 'low': return '#3b82f6';
      default: return colors.text.tertiary;
    }
  };

  const chartData = historyData?.history.map((point, index) => ({
    value: point.acwr,
    label: index % 3 === 0 ? point.date.slice(5) : '', // Show every 3rd label (MM-DD)
    dataPointColor: getRiskColor(point.risk_level),
    dataPointRadius: 4,
  })) || [];

  // Create reference lines for risk zones
  const optimalZoneData = chartData.map(() => ({ value: 1.3 }));
  const dangerZoneData = chartData.map(() => ({ value: 1.5 }));

  const selectedMetricInfo = METRICS.find(m => m.key === selectedMetric);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.accent.primary} />
        <Text style={styles.loadingText}>{t('analysis.loadingChart')}</Text>
      </View>
    );
  }

  if (error || !historyData || historyData.history.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="analytics-outline" size={32} color={colors.text.tertiary} />
        <Text style={styles.emptyText}>{t('analysis.insufficientDataChart')}</Text>
      </View>
    );
  }

  // Calculate average and trend
  const avgAcwr = historyData.history.reduce((sum, p) => sum + p.acwr, 0) / historyData.history.length;
  const lastAcwr = historyData.history[historyData.history.length - 1]?.acwr || 0;
  const firstAcwr = historyData.history[0]?.acwr || 0;
  const trend = lastAcwr - firstAcwr;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="trending-up" size={20} color={colors.accent.primary} />
          <Text style={styles.title}>{t('analysis.acwrEvolution')}</Text>
        </View>
        <View style={styles.periodSelector}>
          {[7, 14, 30].map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.periodButton, days === d && styles.periodButtonActive]}
              onPress={() => setDays(d)}
            >
              <Text style={[styles.periodButtonText, days === d && styles.periodButtonTextActive]}>
                {d}d
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Metric Selector */}
      <View style={styles.metricSelector}>
        {METRICS.map((metric) => (
          <TouchableOpacity
            key={metric.key}
            style={[
              styles.metricButton,
              selectedMetric === metric.key && styles.metricButtonActive,
            ]}
            onPress={() => setSelectedMetric(metric.key)}
          >
            <Ionicons
              name={metric.icon as any}
              size={16}
              color={selectedMetric === metric.key ? '#ffffff' : colors.accent.primary}
            />
            <Text
              style={[
                styles.metricButtonText,
                selectedMetric === metric.key && styles.metricButtonTextActive,
              ]}
              numberOfLines={1}
            >
              {metric.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chart */}
      <View style={styles.chartContainer}>
        <LineChart
          data={chartData}
          data2={optimalZoneData}
          data3={dangerZoneData}
          width={screenWidth - 80}
          height={180}
          spacing={(screenWidth - 100) / Math.max(chartData.length - 1, 1)}
          initialSpacing={10}
          endSpacing={10}
          color={colors.accent.primary}
          color2="rgba(16, 185, 129, 0.3)"
          color3="rgba(239, 68, 68, 0.3)"
          thickness={2}
          thickness2={1}
          thickness3={1}
          hideDataPoints2
          hideDataPoints3
          startFillColor="rgba(139, 92, 246, 0.2)"
          endFillColor="rgba(139, 92, 246, 0.01)"
          startOpacity={0.4}
          endOpacity={0.1}
          noOfSections={4}
          yAxisColor="transparent"
          xAxisColor={colors.border.default}
          xAxisLabelTextStyle={styles.xAxisLabel}
          yAxisTextStyle={styles.yAxisLabel}
          rulesColor={colors.border.default}
          rulesType="dashed"
          maxValue={2.0}
          yAxisLabelSuffix=""
          curved
          areaChart
          isAnimated
          animationDuration={800}
          pointerConfig={{
            pointerStripHeight: 160,
            pointerStripColor: colors.accent.primary,
            pointerStripWidth: 1,
            pointerColor: colors.accent.primary,
            radius: 6,
            pointerLabelWidth: 100,
            pointerLabelHeight: 80,
            activatePointersOnLongPress: true,
            autoAdjustPointerLabelPosition: true,
            pointerLabelComponent: (items: any) => {
              const point = historyData.history[items[0]?.index];
              if (!point) return null;
              return (
                <View style={styles.tooltipContainer}>
                  <Text style={styles.tooltipDate}>{point.date}</Text>
                  <Text style={[styles.tooltipValue, { color: getRiskColor(point.risk_level) }]}>
                    ACWR: {point.acwr.toFixed(2)}
                  </Text>
                  <Text style={styles.tooltipDetails}>
                    A: {point.acute} | C: {point.chronic}
                  </Text>
                </View>
              );
            },
          }}
        />

        {/* Risk Zone Legend */}
        <View style={styles.zoneLegend}>
          <View style={styles.zoneItem}>
            <View style={[styles.zoneDot, { backgroundColor: '#ef4444' }]} />
            <Text style={styles.zoneText}>&gt;1.5 {t('analysis.highRisk')}</Text>
          </View>
          <View style={styles.zoneItem}>
            <View style={[styles.zoneDot, { backgroundColor: '#f59e0b' }]} />
            <Text style={styles.zoneText}>1.3-1.5 {t('analysis.moderate')}</Text>
          </View>
          <View style={styles.zoneItem}>
            <View style={[styles.zoneDot, { backgroundColor: '#10b981' }]} />
            <Text style={styles.zoneText}>0.8-1.3 {t('analysis.optimal')}</Text>
          </View>
          <View style={styles.zoneItem}>
            <View style={[styles.zoneDot, { backgroundColor: '#3b82f6' }]} />
            <Text style={styles.zoneText}>&lt;0.8 {t('analysis.low')}</Text>
          </View>
        </View>
      </View>

      {/* Stats Summary */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>{t('analysis.average')}</Text>
          <Text style={[styles.statValue, { color: getRiskColor(avgAcwr >= 1.5 ? 'high' : avgAcwr >= 1.3 ? 'moderate' : avgAcwr >= 0.8 ? 'optimal' : 'low') }]}>
            {avgAcwr.toFixed(2)}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>{t('analysis.current')}</Text>
          <Text style={[styles.statValue, { color: getRiskColor(historyData.history[historyData.history.length - 1]?.risk_level) }]}>
            {lastAcwr.toFixed(2)}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>{t('analysis.trend')}</Text>
          <View style={styles.trendContainer}>
            <Ionicons
              name={trend > 0 ? 'arrow-up' : trend < 0 ? 'arrow-down' : 'remove'}
              size={16}
              color={Math.abs(trend) < 0.1 ? colors.text.tertiary : trend > 0 ? '#ef4444' : '#10b981'}
            />
            <Text style={[styles.statValue, { color: Math.abs(trend) < 0.1 ? colors.text.tertiary : trend > 0 ? '#ef4444' : '#10b981' }]}>
              {trend > 0 ? '+' : ''}{trend.toFixed(2)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  loadingContainer: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  loadingText: {
    color: colors.text.secondary,
    marginTop: 8,
    fontSize: 13,
  },
  emptyContainer: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  emptyText: {
    color: colors.text.secondary,
    marginTop: 8,
    fontSize: 13,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  periodSelector: {
    flexDirection: 'row',
    gap: 4,
  },
  periodButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  periodButtonActive: {
    backgroundColor: colors.accent.primary,
  },
  periodButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent.primary,
  },
  periodButtonTextActive: {
    color: '#ffffff',
  },
  metricSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  metricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    gap: 4,
  },
  metricButtonActive: {
    backgroundColor: colors.accent.primary,
  },
  metricButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent.primary,
  },
  metricButtonTextActive: {
    color: '#ffffff',
  },
  chartContainer: {
    marginBottom: 12,
  },
  xAxisLabel: {
    color: colors.text.tertiary,
    fontSize: 9,
  },
  yAxisLabel: {
    color: colors.text.tertiary,
    fontSize: 10,
  },
  zoneLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 12,
  },
  zoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  zoneDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  zoneText: {
    fontSize: 10,
    color: colors.text.tertiary,
  },
  tooltipContainer: {
    backgroundColor: colors.dark.secondary,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  tooltipDate: {
    fontSize: 10,
    color: colors.text.secondary,
    marginBottom: 2,
  },
  tooltipValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  tooltipDetails: {
    fontSize: 10,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border.default,
    marginHorizontal: 8,
  },
  statLabel: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
});
