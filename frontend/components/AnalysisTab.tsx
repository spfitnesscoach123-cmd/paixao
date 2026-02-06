import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { ComprehensiveAnalysis } from '../types';
import { colors } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';
import { ACWREvolutionChart } from './ACWREvolutionChart';

interface ACWRDetailedMetric {
  name: string;
  acute_load: number;
  chronic_load: number;
  acwr_ratio: number;
  risk_level: string;
  unit: string;
}

interface ACWRDetailedAnalysis {
  athlete_id: string;
  athlete_name: string;
  analysis_date: string;
  metrics: ACWRDetailedMetric[];
  overall_risk: string;
  recommendation: string;
}

interface AnalysisTabProps {
  athleteId: string;
}

export const AnalysisTab: React.FC<AnalysisTabProps> = ({ athleteId }) => {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const { data: analysis, isLoading, error, refetch } = useQuery({
    queryKey: ['analysis', athleteId],
    queryFn: async () => {
      const response = await api.get<ComprehensiveAnalysis>(`/analysis/comprehensive/${athleteId}`);
      return response.data;
    },
    enabled: !!athleteId,
  });

  const { data: acwrDetailed, isLoading: acwrLoading } = useQuery({
    queryKey: ['acwr-detailed', athleteId],
    queryFn: async () => {
      const response = await api.get<ACWRDetailedAnalysis>(`/analysis/acwr-detailed/${athleteId}`);
      return response.data;
    },
    enabled: !!athleteId,
    retry: false,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await api.get<ComprehensiveAnalysis>(`/analysis/comprehensive/${athleteId}`);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['analysis', athleteId], data);
      queryClient.invalidateQueries({ queryKey: ['acwr-detailed', athleteId] });
    },
  });

  const getRiskColor = (riskLevel?: string) => {
    switch (riskLevel) {
      case 'low':
        return '#3b82f6';
      case 'optimal':
        return '#10b981';
      case 'moderate':
        return '#f59e0b';
      case 'high':
        return '#ef4444';
      default:
        return colors.text.tertiary;
    }
  };

  const getRiskLabel = (riskLevel?: string) => {
    switch (riskLevel) {
      case 'low':
        return t('analysis.lowRisk');
      case 'optimal':
        return t('analysis.optimal');
      case 'moderate':
        return t('analysis.moderate');
      case 'high':
        return t('analysis.highRisk');
      default:
        return '-';
    }
  };

  const getFatigueColor = (fatigueLevel?: string) => {
    switch (fatigueLevel) {
      case 'low':
        return '#10b981';
      case 'moderate':
        return '#f59e0b';
      case 'high':
        return '#ef4444';
      case 'critical':
        return '#991b1b';
      default:
        return colors.text.tertiary;
    }
  };

  const getMetricIcon = (metricName: string) => {
    if (metricName.includes('Total')) return 'walk-outline';
    if (metricName.includes('HSR')) return 'speedometer-outline';
    if (metricName.includes('HID')) return 'flash-outline';
    if (metricName.includes('Sprint')) return 'rocket-outline';
    if (metricName.includes('Acc')) return 'trending-up-outline';
    return 'stats-chart-outline';
  };

  if (isLoading || generateMutation.isPending) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>
          {generateMutation.isPending ? t('analysis.generatingAI') : t('common.loading')}
        </Text>
      </View>
    );
  }

  if (error || !analysis) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="analytics-outline" size={64} color={colors.text.tertiary} />
        <Text style={styles.emptyText}>{t('analysis.insufficientData')}</Text>
        <Text style={styles.emptySubtext}>{t('analysis.addDataPrompt')}</Text>
        <TouchableOpacity
          style={styles.generateButton}
          onPress={() => generateMutation.mutate()}
        >
          <Ionicons name="refresh" size={20} color="#ffffff" />
          <Text style={styles.generateButtonText}>{t('common.tryAgain')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t('analysis.completeAnalysis')}</Text>
          <Text style={styles.headerSubtitle}>{analysis.analysis_date}</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => refetch()}
        >
          <Ionicons name="refresh" size={20} color={colors.accent.primary} />
        </TouchableOpacity>
      </View>

      {/* ACWR Detailed Card - NEW */}
      {acwrDetailed && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(139, 92, 246, 0.2)' }]}>
                <Ionicons name="bar-chart" size={22} color={colors.accent.primary} />
              </View>
              <View>
                <Text style={styles.cardTitle}>{t('analysis.acwrDetailed')}</Text>
                <Text style={styles.cardSubtitle}>{t('analysis.acwrDescription')}</Text>
              </View>
            </View>
          </View>

          {/* Overall Risk Badge */}
          <View style={[styles.overallRiskCard, { borderColor: getRiskColor(acwrDetailed.overall_risk) }]}>
            <View style={styles.overallRiskContent}>
              <Text style={styles.overallRiskLabel}>{t('analysis.overallRisk')}</Text>
              <View style={[styles.overallRiskBadge, { backgroundColor: getRiskColor(acwrDetailed.overall_risk) }]}>
                <Text style={styles.overallRiskText}>{getRiskLabel(acwrDetailed.overall_risk)}</Text>
              </View>
            </View>
          </View>

          {/* Metrics Grid */}
          <View style={styles.metricsGrid}>
            {acwrDetailed.metrics.map((metric, index) => (
              <View key={index} style={styles.metricCard}>
                <View style={styles.metricHeader}>
                  <View style={[styles.metricIconBox, { backgroundColor: getRiskColor(metric.risk_level) + '20' }]}>
                    <Ionicons 
                      name={getMetricIcon(metric.name) as any} 
                      size={18} 
                      color={getRiskColor(metric.risk_level)} 
                    />
                  </View>
                  <Text style={styles.metricName} numberOfLines={1}>{metric.name}</Text>
                </View>
                
                <View style={styles.metricBody}>
                  <View style={styles.metricRatioContainer}>
                    <Text style={[styles.metricRatio, { color: getRiskColor(metric.risk_level) }]}>
                      {metric.acwr_ratio.toFixed(2)}
                    </Text>
                    <View style={[styles.metricRiskBadge, { backgroundColor: getRiskColor(metric.risk_level) }]}>
                      <Text style={styles.metricRiskText}>{getRiskLabel(metric.risk_level)}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.metricLoads}>
                    <View style={styles.metricLoadItem}>
                      <Text style={styles.metricLoadLabel}>{t('analysis.acute7d')}</Text>
                      <Text style={styles.metricLoadValue}>
                        {metric.acute_load.toFixed(0)}{metric.unit === 'count' ? '' : metric.unit}
                      </Text>
                    </View>
                    <View style={styles.metricLoadDivider} />
                    <View style={styles.metricLoadItem}>
                      <Text style={styles.metricLoadLabel}>{t('analysis.chronic28d')}</Text>
                      <Text style={styles.metricLoadValue}>
                        {metric.chronic_load.toFixed(0)}{metric.unit === 'count' ? '' : metric.unit}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Recommendation */}
          <View style={styles.recommendationBox}>
            <Ionicons name="bulb" size={20} color="#f59e0b" />
            <Text style={styles.recommendationText}>{acwrDetailed.recommendation}</Text>
          </View>
        </View>
      )}

      {/* Loading state for ACWR detailed */}
      {acwrLoading && (
        <View style={styles.card}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color={colors.accent.primary} />
            <Text style={styles.loadingCardText}>{t('analysis.loadingACWR')}</Text>
          </View>
        </View>
      )}

      {/* Simple ACWR Card (fallback) */}
      {analysis.acwr && !acwrDetailed && !acwrLoading && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(59, 130, 246, 0.2)' }]}>
                <Ionicons name="trending-up" size={22} color="#3b82f6" />
              </View>
              <Text style={styles.cardTitle}>{t('analysis.acwrSimple')}</Text>
            </View>
          </View>

          <View style={styles.acwrGrid}>
            <View style={styles.acwrItem}>
              <Text style={styles.acwrLabel}>{t('analysis.acuteLoad')}</Text>
              <Text style={styles.acwrValue}>{analysis.acwr.acute_load.toFixed(0)}</Text>
            </View>
            <View style={styles.acwrItem}>
              <Text style={styles.acwrLabel}>{t('analysis.chronicLoad')}</Text>
              <Text style={styles.acwrValue}>{analysis.acwr.chronic_load.toFixed(0)}</Text>
            </View>
          </View>

          <View style={[styles.ratioCard, { backgroundColor: getRiskColor(analysis.acwr.risk_level) + '15' }]}>
            <Text style={styles.ratioLabel}>{t('analysis.acwrRatio')}</Text>
            <Text style={[styles.ratioValue, { color: getRiskColor(analysis.acwr.risk_level) }]}>
              {analysis.acwr.acwr_ratio.toFixed(2)}
            </Text>
            <View style={[styles.riskBadge, { backgroundColor: getRiskColor(analysis.acwr.risk_level) }]}>
              <Text style={styles.riskText}>{getRiskLabel(analysis.acwr.risk_level)}</Text>
            </View>
          </View>

          <View style={styles.recommendationBox}>
            <Ionicons name="bulb" size={20} color="#f59e0b" />
            <Text style={styles.recommendationText}>{analysis.acwr.recommendation}</Text>
          </View>
        </View>
      )}

      {/* Fatigue Card */}
      {analysis.fatigue && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                <Ionicons name="battery-half" size={22} color="#10b981" />
              </View>
              <Text style={styles.cardTitle}>{t('analysis.fatigueAnalysis')}</Text>
            </View>
          </View>

          <View style={[styles.fatigueCard, { backgroundColor: getFatigueColor(analysis.fatigue.fatigue_level) + '15' }]}>
            <Text style={styles.fatigueLabel}>{t('analysis.fatigueLevel')}</Text>
            <Text style={[styles.fatigueValue, { color: getFatigueColor(analysis.fatigue.fatigue_level) }]}>
              {analysis.fatigue.fatigue_score.toFixed(1)}%
            </Text>
            <View style={[styles.fatigueBadge, { backgroundColor: getFatigueColor(analysis.fatigue.fatigue_level) }]}>
              <Text style={styles.fatigueText}>
                {analysis.fatigue.fatigue_level === 'low' ? t('analysis.fatigueLow') :
                 analysis.fatigue.fatigue_level === 'moderate' ? t('analysis.fatigueModerate') :
                 analysis.fatigue.fatigue_level === 'high' ? t('analysis.fatigueHigh') : t('analysis.fatigueCritical')}
              </Text>
            </View>
          </View>

          <View style={styles.factorsBox}>
            <Text style={styles.factorsTitle}>{t('analysis.contributingFactors')}</Text>
            {analysis.fatigue.contributing_factors.map((factor, index) => (
              <View key={index} style={styles.factorItem}>
                <Ionicons name="alert-circle" size={16} color={colors.text.secondary} />
                <Text style={styles.factorText}>{factor}</Text>
              </View>
            ))}
          </View>

          <View style={styles.recommendationBox}>
            <Ionicons name="bulb" size={20} color="#f59e0b" />
            <Text style={styles.recommendationText}>{analysis.fatigue.recommendation}</Text>
          </View>
        </View>
      )}

      {/* AI Insights Card */}
      {analysis.ai_insights && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(139, 92, 246, 0.2)' }]}>
                <Ionicons name="sparkles" size={22} color={colors.accent.primary} />
              </View>
              <Text style={styles.cardTitle}>{t('analysis.aiInsights')}</Text>
            </View>
          </View>

          <View style={styles.summaryBox}>
            <Text style={styles.summaryText}>{analysis.ai_insights.summary}</Text>
          </View>

          {analysis.ai_insights.strengths.length > 0 && (
            <View style={styles.insightSection}>
              <Text style={styles.insightTitle}>
                <Ionicons name="checkmark-circle" size={18} color="#10b981" /> {t('analysis.strengths')}
              </Text>
              {analysis.ai_insights.strengths.map((strength, index) => (
                <View key={index} style={styles.insightItem}>
                  <Text style={styles.bulletPoint}>•</Text>
                  <Text style={styles.insightText}>{strength}</Text>
                </View>
              ))}
            </View>
          )}

          {analysis.ai_insights.concerns.length > 0 && (
            <View style={styles.insightSection}>
              <Text style={styles.insightTitle}>
                <Ionicons name="warning" size={18} color="#f59e0b" /> {t('analysis.concerns')}
              </Text>
              {analysis.ai_insights.concerns.map((concern, index) => (
                <View key={index} style={styles.insightItem}>
                  <Text style={styles.bulletPoint}>•</Text>
                  <Text style={styles.insightText}>{concern}</Text>
                </View>
              ))}
            </View>
          )}

          {analysis.ai_insights.recommendations.length > 0 && (
            <View style={styles.insightSection}>
              <Text style={styles.insightTitle}>
                <Ionicons name="bulb" size={18} color="#3b82f6" /> {t('analysis.recommendations')}
              </Text>
              {analysis.ai_insights.recommendations.map((rec, index) => (
                <View key={index} style={styles.insightItem}>
                  <Text style={styles.bulletPoint}>•</Text>
                  <Text style={styles.insightText}>{rec}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Training Zones */}
          <View style={styles.zonesSection}>
            <Text style={styles.zonesTitle}>{t('analysis.trainingZones')}</Text>
            {Object.entries(analysis.ai_insights.training_zones).map(([key, value]) => (
              <View key={key} style={styles.zoneItem}>
                <Text style={styles.zoneName}>
                  {key === 'recovery' ? '🟢 ' + t('analysis.recovery') :
                   key === 'aerobic' ? '🟡 ' + t('analysis.aerobic') :
                   key === 'anaerobic' ? '🟠 ' + t('analysis.anaerobic') : '🔴 ' + t('analysis.maximal')}
                </Text>
                <Text style={styles.zoneValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <TouchableOpacity
        style={styles.regenerateButton}
        onPress={() => generateMutation.mutate()}
        disabled={generateMutation.isPending}
      >
        {generateMutation.isPending ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <>
            <Ionicons name="refresh-circle" size={24} color="#ffffff" />
            <Text style={styles.regenerateButtonText}>{t('analysis.generateNew')}</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.secondary,
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.text.tertiary,
    marginTop: 8,
    textAlign: 'center',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
    gap: 8,
  },
  generateButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },
  refreshButton: {
    padding: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 8,
  },
  card: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  cardHeader: {
    marginBottom: 16,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  // ACWR Detailed Styles
  overallRiskCard: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  overallRiskContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overallRiskLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  overallRiskBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  overallRiskText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  metricsGrid: {
    gap: 12,
  },
  metricCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  metricIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 1,
  },
  metricBody: {
    gap: 12,
  },
  metricRatioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricRatio: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  metricRiskBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  metricRiskText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  metricLoads: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
    padding: 10,
  },
  metricLoadItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricLoadDivider: {
    width: 1,
    backgroundColor: colors.border.default,
    marginHorizontal: 10,
  },
  metricLoadLabel: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginBottom: 4,
  },
  metricLoadValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loadingCardText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  // Simple ACWR Styles
  acwrGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  acwrItem: {
    flex: 1,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  acwrLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  acwrValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  ratioCard: {
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  ratioLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 8,
  },
  ratioValue: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  riskBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  riskText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  recommendationBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    gap: 10,
  },
  recommendationText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  // Fatigue Styles
  fatigueCard: {
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  fatigueLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 8,
  },
  fatigueValue: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  fatigueBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  fatigueText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  factorsBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  factorsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 10,
  },
  factorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  factorText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
  },
  // AI Insights Styles
  summaryBox: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryText: {
    fontSize: 14,
    color: colors.text.primary,
    lineHeight: 22,
  },
  insightSection: {
    marginBottom: 16,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 10,
  },
  insightItem: {
    flexDirection: 'row',
    marginTop: 6,
    paddingLeft: 4,
  },
  bulletPoint: {
    fontSize: 14,
    color: colors.accent.primary,
    marginRight: 8,
    fontWeight: 'bold',
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  zonesSection: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  zonesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 12,
  },
  zoneItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  zoneName: {
    fontSize: 13,
    color: colors.text.primary,
  },
  zoneValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent.primary,
  },
  regenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.primary,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
    gap: 10,
  },
  regenerateButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});
