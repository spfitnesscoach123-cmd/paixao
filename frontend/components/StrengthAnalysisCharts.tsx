import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import Svg, { Rect, G, Text as SvgText, Line } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

interface StrengthMetric {
  name: string;
  value: number;
  unit: string;
  classification: string;
  percentile: number;
  variation_from_peak: number | null;
}

interface StrengthAnalysisData {
  athlete_id: string;
  assessment_date: string;
  metrics: StrengthMetric[];
  fatigue_index: number;
  fatigue_alert: boolean;
  peripheral_fatigue_detected: boolean;
  overall_strength_classification: string;
  ai_insights: string | null;
  recommendations: string[];
  historical_trend: {
    rsi_peak: number;
    rsi_current: number;
    rsi_drop_percent: number;
    peak_power_peak: number;
    peak_power_current: number;
    power_drop_percent: number;
  } | null;
}

interface StrengthAnalysisChartsProps {
  athleteId: string;
}

export const StrengthAnalysisCharts: React.FC<StrengthAnalysisChartsProps> = ({ athleteId }) => {
  const { locale } = useLanguage();
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = Math.min(screenWidth - 64, 500);

  const { data, isLoading, error } = useQuery({
    queryKey: ['strength-analysis', athleteId],
    queryFn: async () => {
      const response = await api.get<StrengthAnalysisData>(
        `/analysis/strength/${athleteId}?lang=${locale}`
      );
      return response.data;
    },
  });

  const labels = useMemo(() => ({
    title: locale === 'pt' ? 'Análise de Força' : 'Strength Analysis',
    date: locale === 'pt' ? 'Data' : 'Date',
    overallStrength: locale === 'pt' ? 'Classificação Geral' : 'Overall Classification',
    fatigueIndex: locale === 'pt' ? 'Índice de Fadiga' : 'Fatigue Index',
    peripheralFatigue: locale === 'pt' ? 'Fadiga Periférica' : 'Peripheral Fatigue',
    detected: locale === 'pt' ? 'Detectada' : 'Detected',
    notDetected: locale === 'pt' ? 'Não Detectada' : 'Not Detected',
    recommendations: locale === 'pt' ? 'Recomendações' : 'Recommendations',
    aiInsights: locale === 'pt' ? 'Insights IA' : 'AI Insights',
    metricsComparison: locale === 'pt' ? 'Comparação de Métricas' : 'Metrics Comparison',
    noData: locale === 'pt' ? 'Nenhuma avaliação de força disponível' : 'No strength assessment available',
    percentile: locale === 'pt' ? 'Percentil' : 'Percentile',
    variationFromPeak: locale === 'pt' ? 'Variação do Pico' : 'Variation from Peak',
    excellent: locale === 'pt' ? 'Excelente' : 'Excellent',
    good: locale === 'pt' ? 'Bom' : 'Good',
    average: locale === 'pt' ? 'Médio' : 'Average',
    below_average: locale === 'pt' ? 'Abaixo da Média' : 'Below Average',
    poor: locale === 'pt' ? 'Fraco' : 'Poor',
  }), [locale]);

  const getClassificationColor = (classification: string) => {
    switch (classification) {
      case 'excellent': return '#22c55e';
      case 'good': return '#10b981';
      case 'average': return '#f59e0b';
      case 'below_average': return '#f97316';
      case 'poor': return '#ef4444';
      default: return colors.text.secondary;
    }
  };

  const getClassificationLabel = (classification: string) => {
    return labels[classification as keyof typeof labels] || classification;
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="barbell-outline" size={48} color={colors.text.tertiary} />
        <Text style={styles.emptyText}>{labels.noData}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with overall classification */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>{labels.title}</Text>
            <Text style={styles.date}>{labels.date}: {data.assessment_date}</Text>
          </View>
          <View style={[styles.classificationBadge, { backgroundColor: getClassificationColor(data.overall_strength_classification) }]}>
            <Text style={styles.classificationText}>
              {getClassificationLabel(data.overall_strength_classification)}
            </Text>
          </View>
        </View>
      </View>

      {/* Fatigue Alert */}
      {data.peripheral_fatigue_detected && (
        <View style={styles.alertCard}>
          <Ionicons name="warning" size={24} color="#ef4444" />
          <View style={styles.alertTextContainer}>
            <Text style={styles.alertTitle}>{labels.peripheralFatigue}: {labels.detected}</Text>
            <Text style={styles.alertDescription}>
              {locale === 'pt' 
                ? 'RSI e Pico de Potência diminuíram significativamente. Risco de lesão aumentado.'
                : 'RSI and Peak Power have significantly decreased. Increased injury risk.'}
            </Text>
          </View>
        </View>
      )}

      {/* Metrics Bar Chart */}
      <View style={styles.chartCard}>
        <Text style={styles.sectionTitle}>{labels.metricsComparison}</Text>
        <Svg width={chartWidth} height={200}>
          {data.metrics.map((metric, index) => {
            const barHeight = 30;
            const barY = index * 40 + 10;
            const barWidth = (metric.percentile / 100) * (chartWidth - 120);
            const color = getClassificationColor(metric.classification);
            
            return (
              <G key={metric.name}>
                {/* Background bar */}
                <Rect
                  x={100}
                  y={barY}
                  width={chartWidth - 120}
                  height={barHeight}
                  fill="rgba(255, 255, 255, 0.1)"
                  rx={4}
                />
                {/* Value bar */}
                <Rect
                  x={100}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  fill={color}
                  rx={4}
                  opacity={0.9}
                />
                {/* Label */}
                <SvgText
                  x={5}
                  y={barY + barHeight / 2 + 4}
                  fill={colors.text.secondary}
                  fontSize={11}
                  fontWeight="500"
                >
                  {metric.name}
                </SvgText>
                {/* Value */}
                <SvgText
                  x={barWidth + 108}
                  y={barY + barHeight / 2 + 4}
                  fill={colors.text.primary}
                  fontSize={11}
                  fontWeight="600"
                >
                  {metric.value}{metric.unit}
                </SvgText>
              </G>
            );
          })}
        </Svg>
        
        {/* Metrics Legend */}
        <View style={styles.metricsGrid}>
          {data.metrics.map((metric) => (
            <View key={metric.name} style={styles.metricCard}>
              <Text style={styles.metricName}>{metric.name}</Text>
              <Text style={[styles.metricValue, { color: getClassificationColor(metric.classification) }]}>
                {metric.value}{metric.unit}
              </Text>
              <Text style={styles.metricPercentile}>
                {labels.percentile}: {metric.percentile}%
              </Text>
              {metric.variation_from_peak !== null && (
                <Text style={[styles.metricVariation, { color: metric.variation_from_peak < 0 ? '#ef4444' : '#22c55e' }]}>
                  {labels.variationFromPeak}: {metric.variation_from_peak > 0 ? '+' : ''}{metric.variation_from_peak}%
                </Text>
              )}
            </View>
          ))}
        </View>
      </View>

      {/* Fatigue Index Gauge */}
      <View style={styles.fatigueCard}>
        <Text style={styles.sectionTitle}>{labels.fatigueIndex}</Text>
        <View style={styles.fatigueGauge}>
          <View style={styles.fatigueTrack}>
            <View 
              style={[
                styles.fatigueFill, 
                { 
                  width: `${data.fatigue_index}%`,
                  backgroundColor: data.fatigue_index > 70 ? '#ef4444' : data.fatigue_index > 50 ? '#f59e0b' : '#10b981'
                }
              ]} 
            />
          </View>
          <Text style={[styles.fatigueValue, { color: data.fatigue_index > 70 ? '#ef4444' : colors.text.primary }]}>
            {data.fatigue_index}%
          </Text>
        </View>
        <View style={styles.fatigueScale}>
          <Text style={styles.fatigueScaleLabel}>0%</Text>
          <Text style={[styles.fatigueScaleLabel, { color: '#f59e0b' }]}>50%</Text>
          <Text style={[styles.fatigueScaleLabel, { color: '#ef4444' }]}>70%</Text>
          <Text style={styles.fatigueScaleLabel}>100%</Text>
        </View>
      </View>

      {/* AI Insights */}
      {data.ai_insights && (
        <View style={styles.insightsCard}>
          <View style={styles.insightsHeader}>
            <Ionicons name="sparkles" size={20} color={colors.accent.primary} />
            <Text style={styles.sectionTitle}>{labels.aiInsights}</Text>
          </View>
          <Text style={styles.insightsText}>{data.ai_insights}</Text>
        </View>
      )}

      {/* Recommendations */}
      <View style={styles.recommendationsCard}>
        <Text style={styles.sectionTitle}>{labels.recommendations}</Text>
        {data.recommendations.map((rec, index) => (
          <View key={index} style={styles.recommendationItem}>
            <Ionicons 
              name={rec.includes('⚠️') ? 'warning' : 'checkmark-circle'} 
              size={18} 
              color={rec.includes('⚠️') ? '#ef4444' : '#10b981'} 
            />
            <Text style={styles.recommendationText}>{rec}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: colors.dark.card,
    borderRadius: 12,
  },
  emptyText: {
    color: colors.text.tertiary,
    fontSize: 14,
    marginTop: 12,
  },
  headerCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  date: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: 4,
  },
  classificationBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  classificationText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  alertCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  alertTextContainer: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ef4444',
    marginBottom: 4,
  },
  alertDescription: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  chartCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.dark.secondary,
    borderRadius: 10,
    padding: 12,
  },
  metricName: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  metricPercentile: {
    fontSize: 10,
    color: colors.text.secondary,
  },
  metricVariation: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  fatigueCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
  },
  fatigueGauge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fatigueTrack: {
    flex: 1,
    height: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  fatigueFill: {
    height: '100%',
    borderRadius: 8,
  },
  fatigueValue: {
    fontSize: 20,
    fontWeight: '700',
    minWidth: 50,
    textAlign: 'right',
  },
  fatigueScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  fatigueScaleLabel: {
    fontSize: 10,
    color: colors.text.tertiary,
  },
  insightsCard: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  insightsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  insightsText: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  recommendationsCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  recommendationText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 20,
  },
});
