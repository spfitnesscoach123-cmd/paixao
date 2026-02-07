import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Line, Circle, Polyline, Rect, G, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { QTRGauge } from './QTRGauge';

interface WellnessData {
  date: string;
  fatigue: number;
  stress: number;
  mood: number;
  sleep_quality: number;
  sleep_hours: number;
  muscle_soreness: number;
  hydration?: number;
  wellness_score?: number;
  readiness_score?: number;
}

interface WellnessChartsProps {
  data: WellnessData[];
}

export const WellnessCharts: React.FC<WellnessChartsProps> = ({ data }) => {
  const { t } = useLanguage();
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = Math.min(screenWidth - 64, 600);
  const chartHeight = 150;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  
  // Sort data by date (newest first for display, oldest first for chart)
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-14); // Last 14 days
  }, [data]);

  // Calculate QTR Score based on all parameters
  const qtrScore = useMemo(() => {
    if (sortedData.length === 0) return 0;
    
    // Use the last 7 days for QTR calculation
    const recentData = sortedData.slice(-7);
    
    // Calculate weighted average of recovery indicators
    // Formula: QTR = 100 - (Fatigue*15 + Stress*10 + (10-Mood)*10 + (10-SleepQuality)*15 + (8-SleepHours)*5 + MuscleSoreness*15 + (10-Readiness)*15) / 85 * 100
    
    let totalScore = 0;
    
    recentData.forEach(d => {
      const fatigueImpact = d.fatigue * 1.5; // Higher fatigue = worse (max 15)
      const stressImpact = d.stress * 1.0; // Higher stress = worse (max 10)
      const moodImpact = (10 - d.mood) * 1.0; // Lower mood = worse (max 10)
      const sleepQualityImpact = (10 - d.sleep_quality) * 1.5; // Lower quality = worse (max 15)
      const sleepHoursImpact = Math.max(0, (8 - d.sleep_hours)) * 1.0; // Less than 8h = worse (max ~5)
      const sorenessImpact = d.muscle_soreness * 1.5; // Higher soreness = worse (max 15)
      const readinessImpact = d.readiness_score ? (10 - d.readiness_score) * 1.5 : 0; // Lower readiness = worse (max 15)
      
      const dayScore = 100 - (fatigueImpact + stressImpact + moodImpact + sleepQualityImpact + sleepHoursImpact + sorenessImpact + readinessImpact);
      totalScore += Math.max(0, Math.min(100, dayScore));
    });
    
    return Math.round(totalScore / recentData.length);
  }, [sortedData]);

  // Calculate trend (comparing last 3 days vs previous 3 days)
  const trend = useMemo(() => {
    if (sortedData.length < 6) return { direction: 'stable', percentage: 0 };
    
    const recent = sortedData.slice(-3);
    const previous = sortedData.slice(-6, -3);
    
    const recentAvg = recent.reduce((sum, d) => sum + (d.wellness_score || 7), 0) / recent.length;
    const previousAvg = previous.reduce((sum, d) => sum + (d.wellness_score || 7), 0) / previous.length;
    
    const diff = ((recentAvg - previousAvg) / previousAvg) * 100;
    
    if (diff > 5) return { direction: 'up', percentage: Math.round(diff) };
    if (diff < -5) return { direction: 'down', percentage: Math.round(Math.abs(diff)) };
    return { direction: 'stable', percentage: 0 };
  }, [sortedData]);

  // Prepare chart data
  const chartInnerWidth = chartWidth - padding.left - padding.right;
  const chartInnerHeight = chartHeight - padding.top - padding.bottom;
  
  const xScale = (index: number) => padding.left + (index / (sortedData.length - 1 || 1)) * chartInnerWidth;
  const yScale = (value: number) => padding.top + chartInnerHeight - (value / 10) * chartInnerHeight;

  // Generate line paths for each metric
  const generatePath = (values: number[]) => {
    return values.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ');
  };

  const metrics = [
    { key: 'fatigue', label: t('wellness.fatigue') || 'Fadiga', color: '#ef4444', data: sortedData.map(d => d.fatigue) },
    { key: 'sleep_quality', label: t('wellness.sleepQuality') || 'Sono', color: '#3b82f6', data: sortedData.map(d => d.sleep_quality) },
    { key: 'mood', label: t('wellness.mood') || 'Humor', color: '#10b981', data: sortedData.map(d => d.mood) },
    { key: 'muscle_soreness', label: t('wellness.muscleSoreness') || 'Dor', color: '#f59e0b', data: sortedData.map(d => d.muscle_soreness) },
  ];

  if (data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t('wellness.noDataForCharts') || 'Adicione questionários para ver análises'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* QTR Gauge */}
      <View style={styles.qtrSection}>
        <QTRGauge score={qtrScore} size={220} />
        
        {/* Trend indicator */}
        <View style={styles.trendContainer}>
          <Text style={styles.trendLabel}>{t('wellness.trend') || 'Tendência'}:</Text>
          <View style={[
            styles.trendBadge,
            trend.direction === 'up' && styles.trendUp,
            trend.direction === 'down' && styles.trendDown,
          ]}>
            <Text style={styles.trendIcon}>
              {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'}
            </Text>
            <Text style={styles.trendText}>
              {trend.direction === 'up' ? t('wellness.improving') || 'Melhorando' :
               trend.direction === 'down' ? t('wellness.declining') || 'Piorando' :
               t('wellness.stable') || 'Estável'}
              {trend.percentage > 0 && ` (${trend.percentage}%)`}
            </Text>
          </View>
        </View>
      </View>

      {/* Parameter Correlation Chart */}
      <View style={styles.chartSection}>
        <Text style={styles.chartTitle}>{t('wellness.parameterEvolution') || 'Evolução dos Parâmetros'}</Text>
        <Text style={styles.chartSubtitle}>{t('wellness.last14days') || 'Últimos 14 dias'}</Text>
        
        <Svg width={chartWidth} height={chartHeight}>
          {/* Grid lines */}
          {[0, 2.5, 5, 7.5, 10].map((v, i) => (
            <G key={i}>
              <Line
                x1={padding.left}
                y1={yScale(v)}
                x2={chartWidth - padding.right}
                y2={yScale(v)}
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth={1}
              />
              <SvgText
                x={padding.left - 8}
                y={yScale(v) + 4}
                fill={colors.text.tertiary}
                fontSize={10}
                textAnchor="end"
              >
                {v}
              </SvgText>
            </G>
          ))}
          
          {/* Metric lines */}
          {sortedData.length > 1 && metrics.map((metric, idx) => (
            <Polyline
              key={metric.key}
              points={generatePath(metric.data)}
              fill="none"
              stroke={metric.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.8}
            />
          ))}
          
          {/* Data points */}
          {sortedData.length > 0 && metrics.map((metric) => (
            metric.data.map((value, i) => (
              <Circle
                key={`${metric.key}-${i}`}
                cx={xScale(i)}
                cy={yScale(value)}
                r={3}
                fill={metric.color}
              />
            ))
          ))}
        </Svg>
        
        {/* Legend */}
        <View style={styles.legend}>
          {metrics.map((metric) => (
            <View key={metric.key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: metric.color }]} />
              <Text style={styles.legendText}>{metric.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Summary Stats */}
      <View style={styles.summarySection}>
        <Text style={styles.sectionTitle}>{t('wellness.weekSummary') || 'Resumo da Semana'}</Text>
        <View style={styles.summaryGrid}>
          {sortedData.length > 0 && (
            <>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>{t('wellness.avgSleep') || 'Sono Médio'}</Text>
                <Text style={styles.summaryValue}>
                  {(sortedData.slice(-7).reduce((sum, d) => sum + d.sleep_hours, 0) / Math.min(7, sortedData.length)).toFixed(1)}h
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>{t('wellness.avgFatigue') || 'Fadiga Média'}</Text>
                <Text style={[styles.summaryValue, { color: '#ef4444' }]}>
                  {(sortedData.slice(-7).reduce((sum, d) => sum + d.fatigue, 0) / Math.min(7, sortedData.length)).toFixed(1)}/10
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>{t('wellness.avgMood') || 'Humor Médio'}</Text>
                <Text style={[styles.summaryValue, { color: '#10b981' }]}>
                  {(sortedData.slice(-7).reduce((sum, d) => sum + d.mood, 0) / Math.min(7, sortedData.length)).toFixed(1)}/10
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>{t('wellness.questionnaires') || 'Questionários'}</Text>
                <Text style={styles.summaryValue}>{sortedData.length}</Text>
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    marginBottom: 16,
  },
  emptyText: {
    color: colors.text.tertiary,
    fontSize: 14,
  },
  qtrSection: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  trendLabel: {
    color: colors.text.secondary,
    fontSize: 12,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  trendUp: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  trendDown: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  trendIcon: {
    fontSize: 14,
    color: colors.text.primary,
  },
  trendText: {
    color: colors.text.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  chartSection: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  chartTitle: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  chartSubtitle: {
    color: colors.text.tertiary,
    fontSize: 12,
    marginBottom: 12,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 12,
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
  legendText: {
    color: colors.text.secondary,
    fontSize: 11,
  },
  summarySection: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.dark.secondary,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  summaryLabel: {
    color: colors.text.tertiary,
    fontSize: 11,
    marginBottom: 4,
  },
  summaryValue: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
  },
});
