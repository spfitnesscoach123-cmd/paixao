import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { ComprehensiveAnalysis } from '../types';

interface AnalysisTabProps {
  athleteId: string;
}

export const AnalysisTab: React.FC<AnalysisTabProps> = ({ athleteId }) => {
  const queryClient = useQueryClient();

  const { data: analysis, isLoading, error, refetch } = useQuery({
    queryKey: ['analysis', athleteId],
    queryFn: async () => {
      const response = await api.get<ComprehensiveAnalysis>(`/analysis/comprehensive/${athleteId}`);
      return response.data;
    },
    enabled: !!athleteId,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await api.get<ComprehensiveAnalysis>(`/analysis/comprehensive/${athleteId}`);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['analysis', athleteId], data);
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
        return '#6b7280';
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
        return '#6b7280';
    }
  };

  if (isLoading || generateMutation.isPending) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>
          {generateMutation.isPending ? 'Gerando análise com IA...' : 'Carregando análise...'}
        </Text>
      </View>
    );
  }

  if (error || !analysis) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="analytics-outline" size={64} color="#d1d5db" />
        <Text style={styles.emptyText}>Dados insuficientes para análise</Text>
        <Text style={styles.emptySubtext}>
          Adicione dados GPS e wellness para gerar análises completas
        </Text>
        <TouchableOpacity
          style={styles.generateButton}
          onPress={() => generateMutation.mutate()}
        >
          <Ionicons name="refresh" size={20} color="#ffffff" />
          <Text style={styles.generateButtonText}>Tentar Novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Análise Completa</Text>
          <Text style={styles.headerSubtitle}>{analysis.analysis_date}</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => refetch()}
        >
          <Ionicons name="refresh" size={20} color="#2563eb" />
        </TouchableOpacity>
      </View>

      {/* ACWR Card */}
      {analysis.acwr && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="trending-up" size={24} color="#2563eb" />
              <Text style={styles.cardTitle}>ACWR - Relação Carga Agudo:Crônico</Text>
            </View>
          </View>

          <View style={styles.acwrGrid}>
            <View style={styles.acwrItem}>
              <Text style={styles.acwrLabel}>Carga Aguda (7d)</Text>
              <Text style={styles.acwrValue}>{analysis.acwr.acute_load.toFixed(0)}</Text>
            </View>
            <View style={styles.acwrItem}>
              <Text style={styles.acwrLabel}>Carga Crônica (28d)</Text>
              <Text style={styles.acwrValue}>{analysis.acwr.chronic_load.toFixed(0)}</Text>
            </View>
          </View>

          <View style={[styles.ratioCard, { backgroundColor: getRiskColor(analysis.acwr.risk_level) + '15' }]}>
            <Text style={styles.ratioLabel}>Ratio ACWR</Text>
            <Text style={[styles.ratioValue, { color: getRiskColor(analysis.acwr.risk_level) }]}>
              {analysis.acwr.acwr_ratio.toFixed(2)}
            </Text>
            <View style={[styles.riskBadge, { backgroundColor: getRiskColor(analysis.acwr.risk_level) }]}>
              <Text style={styles.riskText}>
                {analysis.acwr.risk_level === 'low' ? 'Baixo Risco' :
                 analysis.acwr.risk_level === 'optimal' ? 'Ótimo' :
                 analysis.acwr.risk_level === 'moderate' ? 'Moderado' : 'Alto Risco'}
              </Text>
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
              <Ionicons name="battery-half" size={24} color="#10b981" />
              <Text style={styles.cardTitle}>Análise de Fadiga</Text>
            </View>
          </View>

          <View style={[styles.fatigueCard, { backgroundColor: getFatigueColor(analysis.fatigue.fatigue_level) + '15' }]}>
            <Text style={styles.fatigueLabel}>Nível de Fadiga</Text>
            <Text style={[styles.fatigueValue, { color: getFatigueColor(analysis.fatigue.fatigue_level) }]}>
              {analysis.fatigue.fatigue_score.toFixed(1)}%
            </Text>
            <View style={[styles.fatigueBadge, { backgroundColor: getFatigueColor(analysis.fatigue.fatigue_level) }]}>
              <Text style={styles.fatigueText}>
                {analysis.fatigue.fatigue_level === 'low' ? 'Baixa' :
                 analysis.fatigue.fatigue_level === 'moderate' ? 'Moderada' :
                 analysis.fatigue.fatigue_level === 'high' ? 'Alta' : 'CRÍTICA'}
              </Text>
            </View>
          </View>

          <View style={styles.factorsBox}>
            <Text style={styles.factorsTitle}>Fatores Contribuintes:</Text>
            {analysis.fatigue.contributing_factors.map((factor, index) => (
              <View key={index} style={styles.factorItem}>
                <Ionicons name="alert-circle" size={16} color="#6b7280" />
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
              <Ionicons name="sparkles" size={24} color="#8b5cf6" />
              <Text style={styles.cardTitle}>Insights da IA</Text>
            </View>
          </View>

          <View style={styles.summaryBox}>
            <Text style={styles.summaryText}>{analysis.ai_insights.summary}</Text>
          </View>

          {analysis.ai_insights.strengths.length > 0 && (
            <View style={styles.insightSection}>
              <Text style={styles.insightTitle}>
                <Ionicons name="checkmark-circle" size={18} color="#10b981" /> Pontos Fortes
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
                <Ionicons name="warning" size={18} color="#f59e0b" /> Pontos de Atenção
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
                <Ionicons name="bulb" size={18} color="#2563eb" /> Recomendações
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
            <Text style={styles.zonesTitle}>Zonas de Treinamento Recomendadas</Text>
            {Object.entries(analysis.ai_insights.training_zones).map(([key, value]) => (
              <View key={key} style={styles.zoneItem}>
                <Text style={styles.zoneName}>
                  {key === 'recovery' ? '🟢 Recuperação' :
                   key === 'aerobic' ? '🟡 Aeróbica' :
                   key === 'anaerobic' ? '🟠 Anaeróbica' : '🔴 Máxima'}
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
            <Text style={styles.regenerateButtonText}>Gerar Nova Análise com IA</Text>
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
    color: '#6b7280',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 8,
    textAlign: 'center',
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
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  refreshButton: {
    padding: 8,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    marginBottom: 16,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  acwrGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  acwrItem: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
  },
  acwrLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  acwrValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  ratioCard: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  ratioLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  ratioValue: {
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  riskBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  riskText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  fatigueCard: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  fatigueLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  fatigueValue: {
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  fatigueBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  fatigueText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  factorsBox: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  factorsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  factorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  factorText: {
    fontSize: 13,
    color: '#6b7280',
    flex: 1,
  },
  recommendationBox: {
    flexDirection: 'row',
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  recommendationText: {
    flex: 1,
    fontSize: 13,
    color: '#92400e',
    lineHeight: 18,
  },
  summaryBox: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  summaryText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  insightSection: {
    marginBottom: 16,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  insightItem: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 8,
  },
  bulletPoint: {
    fontSize: 14,
    color: '#6b7280',
    marginRight: 8,
    fontWeight: 'bold',
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 18,
  },
  zonesSection: {
    marginTop: 8,
  },
  zonesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  zoneItem: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  zoneName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  zoneValue: {
    fontSize: 12,
    color: '#6b7280',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 8,
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  regenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  regenerateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
