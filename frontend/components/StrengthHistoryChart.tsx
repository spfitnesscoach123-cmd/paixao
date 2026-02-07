import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import Svg, { Line, Circle, Polyline, G, Text as SvgText, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { colors } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';

interface Assessment {
  id?: string;
  _id?: string;
  date: string;
  assessment_type: string;
  metrics: {
    mean_power?: number;
    peak_power?: number;
    mean_speed?: number;
    peak_speed?: number;
    rsi?: number;
    fatigue_index?: number;
  };
}

interface StrengthHistoryChartProps {
  athleteId: string;
}

export const StrengthHistoryChart: React.FC<StrengthHistoryChartProps> = ({ athleteId }) => {
  const { locale } = useLanguage();
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = Math.min(screenWidth - 48, 600);
  const chartHeight = 200;
  const padding = { top: 30, right: 20, bottom: 40, left: 50 };

  const { data: assessments, isLoading } = useQuery({
    queryKey: ['assessments', athleteId],
    queryFn: async () => {
      const response = await api.get<Assessment[]>(`/assessments/athlete/${athleteId}`);
      return response.data;
    },
  });

  const labels = useMemo(() => ({
    title: locale === 'pt' ? 'Evolução da Força' : 'Strength Evolution',
    subtitle: locale === 'pt' ? 'Histórico de avaliações' : 'Assessment history',
    power: locale === 'pt' ? 'Potência (W)' : 'Power (W)',
    rsi: 'RSI',
    fatigue: locale === 'pt' ? 'Fadiga (%)' : 'Fatigue (%)',
    noData: locale === 'pt' ? 'Sem histórico de avaliações' : 'No assessment history',
    peak: locale === 'pt' ? 'Pico' : 'Peak',
    current: locale === 'pt' ? 'Atual' : 'Current',
    variation: locale === 'pt' ? 'Variação' : 'Variation',
  }), [locale]);

  // Filter only strength assessments and sort by date
  const strengthData = useMemo(() => {
    if (!assessments) return [];
    return assessments
      .filter(a => a.assessment_type === 'strength')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [assessments]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (strengthData.length === 0) return null;
    
    const powers = strengthData.map(d => d.metrics.mean_power || 0).filter(p => p > 0);
    const rsis = strengthData.map(d => d.metrics.rsi || 0).filter(r => r > 0);
    const fatigues = strengthData.map(d => d.metrics.fatigue_index || 0);
    
    const peakPower = Math.max(...powers);
    const currentPower = powers[powers.length - 1] || 0;
    const powerVariation = peakPower > 0 ? ((currentPower - peakPower) / peakPower * 100) : 0;
    
    const peakRsi = Math.max(...rsis);
    const currentRsi = rsis[rsis.length - 1] || 0;
    const rsiVariation = peakRsi > 0 ? ((currentRsi - peakRsi) / peakRsi * 100) : 0;
    
    const currentFatigue = fatigues[fatigues.length - 1] || 0;
    
    return {
      peakPower,
      currentPower,
      powerVariation,
      peakRsi,
      currentRsi,
      rsiVariation,
      currentFatigue,
    };
  }, [strengthData]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  if (strengthData.length < 2) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="analytics-outline" size={40} color={colors.text.tertiary} />
        <Text style={styles.emptyText}>{labels.noData}</Text>
        <Text style={styles.emptySubtext}>
          {locale === 'pt' ? 'Adicione mais avaliações para ver a evolução' : 'Add more assessments to see evolution'}
        </Text>
      </View>
    );
  }

  // Chart calculations
  const chartInnerWidth = chartWidth - padding.left - padding.right;
  const chartInnerHeight = chartHeight - padding.top - padding.bottom;
  
  const xScale = (index: number) => padding.left + (index / (strengthData.length - 1)) * chartInnerWidth;
  
  // Power scale
  const powers = strengthData.map(d => d.metrics.mean_power || 0);
  const maxPower = Math.max(...powers) * 1.1;
  const minPower = Math.min(...powers) * 0.9;
  const powerYScale = (value: number) => {
    const normalized = (value - minPower) / (maxPower - minPower);
    return padding.top + chartInnerHeight - normalized * chartInnerHeight;
  };

  // RSI scale (separate line)
  const rsis = strengthData.map(d => d.metrics.rsi || 0);
  const maxRsi = Math.max(...rsis) * 1.2;
  const rsiYScale = (value: number) => {
    const normalized = value / maxRsi;
    return padding.top + chartInnerHeight - normalized * chartInnerHeight;
  };

  // Fatigue scale
  const fatigues = strengthData.map(d => d.metrics.fatigue_index || 0);
  const fatigueYScale = (value: number) => {
    return padding.top + chartInnerHeight - (value / 100) * chartInnerHeight;
  };

  // Generate line paths
  const powerPath = powers.map((v, i) => `${xScale(i)},${powerYScale(v)}`).join(' ');
  const rsiPath = rsis.map((v, i) => `${xScale(i)},${rsiYScale(v)}`).join(' ');
  const fatiguePath = fatigues.map((v, i) => `${xScale(i)},${fatigueYScale(v)}`).join(' ');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{labels.title}</Text>
          <Text style={styles.subtitle}>{labels.subtitle}</Text>
        </View>
        <View style={styles.assessmentCount}>
          <Text style={styles.countNumber}>{strengthData.length}</Text>
          <Text style={styles.countLabel}>{locale === 'pt' ? 'avaliações' : 'assessments'}</Text>
        </View>
      </View>

      {/* Stats Cards */}
      {stats && (
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{labels.power}</Text>
            <Text style={styles.statValue}>{stats.currentPower}W</Text>
            <Text style={[styles.statVariation, { color: stats.powerVariation >= 0 ? '#10b981' : '#ef4444' }]}>
              {stats.powerVariation >= 0 ? '↑' : '↓'} {Math.abs(stats.powerVariation).toFixed(1)}%
            </Text>
            <Text style={styles.statPeak}>{labels.peak}: {stats.peakPower}W</Text>
          </View>
          
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{labels.rsi}</Text>
            <Text style={styles.statValue}>{stats.currentRsi.toFixed(2)}</Text>
            <Text style={[styles.statVariation, { color: stats.rsiVariation >= 0 ? '#10b981' : '#ef4444' }]}>
              {stats.rsiVariation >= 0 ? '↑' : '↓'} {Math.abs(stats.rsiVariation).toFixed(1)}%
            </Text>
            <Text style={styles.statPeak}>{labels.peak}: {stats.peakRsi.toFixed(2)}</Text>
          </View>
          
          <View style={[styles.statCard, stats.currentFatigue > 70 && styles.statCardAlert]}>
            <Text style={styles.statLabel}>{labels.fatigue}</Text>
            <Text style={[styles.statValue, { color: stats.currentFatigue > 70 ? '#ef4444' : colors.text.primary }]}>
              {stats.currentFatigue}%
            </Text>
            {stats.currentFatigue > 70 && (
              <Text style={styles.alertText}>
                <Ionicons name="warning" size={12} color="#ef4444" /> {locale === 'pt' ? 'Alto' : 'High'}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Chart */}
      <View style={styles.chartContainer}>
        <Svg width={chartWidth} height={chartHeight}>
          <Defs>
            <LinearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
              <Stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
            <G key={i}>
              <Line
                x1={padding.left}
                y1={padding.top + ratio * chartInnerHeight}
                x2={chartWidth - padding.right}
                y2={padding.top + ratio * chartInnerHeight}
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth={1}
              />
            </G>
          ))}

          {/* Power line */}
          <Polyline
            points={powerPath}
            fill="none"
            stroke="#6366f1"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* RSI line */}
          <Polyline
            points={rsiPath}
            fill="none"
            stroke="#10b981"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5,3"
          />

          {/* Fatigue line */}
          <Polyline
            points={fatiguePath}
            fill="none"
            stroke="#ef4444"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.7}
          />

          {/* Data points */}
          {powers.map((value, i) => (
            <Circle
              key={`power-${i}`}
              cx={xScale(i)}
              cy={powerYScale(value)}
              r={4}
              fill="#6366f1"
            />
          ))}

          {/* Date labels */}
          {strengthData.map((d, i) => {
            // Show only first, middle, and last dates
            if (i !== 0 && i !== strengthData.length - 1 && i !== Math.floor(strengthData.length / 2)) {
              return null;
            }
            const dateStr = d.date.substring(5); // MM-DD
            return (
              <SvgText
                key={`date-${i}`}
                x={xScale(i)}
                y={chartHeight - 10}
                fill={colors.text.tertiary}
                fontSize={10}
                textAnchor="middle"
              >
                {dateStr}
              </SvgText>
            );
          })}
        </Svg>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: '#6366f1' }]} />
            <Text style={styles.legendText}>{labels.power}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: '#10b981', borderStyle: 'dashed' }]} />
            <Text style={styles.legendText}>{labels.rsi}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: '#ef4444' }]} />
            <Text style={styles.legendText}>{labels.fatigue}</Text>
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
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    marginBottom: 16,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    marginBottom: 16,
  },
  emptyText: {
    color: colors.text.secondary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtext: {
    color: colors.text.tertiary,
    fontSize: 12,
    marginTop: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  assessmentCount: {
    alignItems: 'center',
    backgroundColor: colors.dark.secondary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  countNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.accent.primary,
  },
  countLabel: {
    fontSize: 10,
    color: colors.text.tertiary,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.dark.secondary,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statCardAlert: {
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  statLabel: {
    fontSize: 10,
    color: colors.text.tertiary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },
  statVariation: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  statPeak: {
    fontSize: 9,
    color: colors.text.tertiary,
    marginTop: 4,
  },
  alertText: {
    fontSize: 10,
    color: '#ef4444',
    fontWeight: '600',
    marginTop: 4,
  },
  chartContainer: {
    alignItems: 'center',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendLine: {
    width: 16,
    height: 3,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 10,
    color: colors.text.secondary,
  },
});
