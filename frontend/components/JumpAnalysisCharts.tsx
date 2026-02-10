import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator, TouchableOpacity } from 'react-native';
import Svg, { Rect, G, Text as SvgText, Line, Circle, Path, Polyline } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import api from '../services/api';
import { colors } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';

const { width: screenWidth } = Dimensions.get('window');
const isSmallScreen = screenWidth < 375;
const chartWidth = screenWidth - (isSmallScreen ? 48 : 64);

interface JumpAnalysisData {
  athlete_id: string;
  athlete_name: string;
  body_mass_kg: number;
  analysis_date: string;
  protocols: {
    cmj?: {
      latest: {
        date: string;
        jump_height_cm: number;
        flight_time_ms: number;
        contact_time_ms: number;
        rsi: number;
        rsi_classification: string;
        peak_power_w: number;
        peak_velocity_ms: number;
        relative_power_wkg: number;
      };
      baseline_rsi: number;
      rsi_variation_percent: number;
      fatigue_status: {
        status: string;
        status_pt: string;
        status_en: string;
        color: string;
      };
      z_score_height: number;
      history: Array<{
        date: string;
        rsi: number;
        jump_height_cm: number;
        peak_power_w: number;
      }>;
    };
    sl_cmj?: {
      right: { date: string; jump_height_cm: number; rsi: number; peak_power_w: number };
      left: { date: string; jump_height_cm: number; rsi: number; peak_power_w: number };
    };
  };
  asymmetry?: {
    rsi: { asymmetry_percent: number; dominant_leg: string; red_flag: boolean };
    jump_height: { asymmetry_percent: number; dominant_leg: string; red_flag: boolean };
    red_flag: boolean;
    interpretation: string;
  };
  fatigue_analysis?: {
    status: string;
    status_label: string;
    color: string;
    rsi_variation_percent: number;
    baseline_rsi: number;
    current_rsi: number;
    interpretation: string;
  };
  power_velocity_insights?: {
    peak_power_w: number;
    peak_velocity_ms: number;
    relative_power_wkg: number;
    power_vs_average_percent: number;
    velocity_vs_average_percent: number;
    profile: {
      type: string;
      label: string;
      recommendation: string;
      color: string;
    };
  };
  z_score?: {
    jump_height: number;
    interpretation: string;
  };
  recommendations: string[];
}

interface JumpAnalysisChartsProps {
  athleteId: string;
}

export const JumpAnalysisCharts: React.FC<JumpAnalysisChartsProps> = ({ athleteId }) => {
  const { locale } = useLanguage();
  const router = useRouter();
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = Math.min(screenWidth - 64, 500);

  const { data, isLoading, error } = useQuery({
    queryKey: ['jump-analysis', athleteId, locale],
    queryFn: async () => {
      const response = await api.get<JumpAnalysisData>(
        `/jump/analysis/${athleteId}?lang=${locale}`
      );
      return response.data;
    },
    retry: false,
  });

  const labels = useMemo(() => ({
    title: locale === 'pt' ? 'Avaliação de Salto' : 'Jump Assessment',
    rsi: 'RSI',
    fatigueIndex: locale === 'pt' ? 'Índice de Fadiga (SNC)' : 'Fatigue Index (CNS)',
    asymmetry: locale === 'pt' ? 'Assimetria' : 'Asymmetry',
    powerVelocity: locale === 'pt' ? 'Potência-Velocidade' : 'Power-Velocity',
    zScore: 'Z-Score',
    recommendations: locale === 'pt' ? 'Recomendações' : 'Recommendations',
    noData: locale === 'pt' ? 'Nenhuma avaliação de salto disponível' : 'No jump assessment available',
    addAssessment: locale === 'pt' ? 'Adicionar Avaliação' : 'Add Assessment',
    viewDetails: locale === 'pt' ? 'Ver Detalhes' : 'View Details',
    excellent: locale === 'pt' ? 'Excelente' : 'Excellent',
    very_good: locale === 'pt' ? 'Muito Bom' : 'Very Good',
    good: locale === 'pt' ? 'Bom' : 'Good',
    average: locale === 'pt' ? 'Médio' : 'Average',
    below_average: locale === 'pt' ? 'Abaixo da Média' : 'Below Average',
    poor: locale === 'pt' ? 'Fraco' : 'Poor',
  }), [locale]);

  const getClassificationColor = (classification: string) => {
    switch (classification) {
      case 'excellent': return '#22c55e';
      case 'very_good': return '#10b981';
      case 'good': return '#84cc16';
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

  if (error || !data || !data.protocols?.cmj) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="fitness-outline" size={48} color={colors.text.tertiary} />
        <Text style={styles.emptyText}>{labels.noData}</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => router.push(`/athlete/${athleteId}/jump-assessment`)}
        >
          <Ionicons name="add-circle" size={20} color="#ffffff" />
          <Text style={styles.addButtonText}>{labels.addAssessment}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cmj = data.protocols.cmj;
  const fatigue = data.fatigue_analysis;
  const asymmetry = data.asymmetry;
  const pvProfile = data.power_velocity_insights;
  const zScore = data.z_score;

  // RSI Gauge values
  const maxRSI = 3.5;
  const normalizedRSI = Math.min(cmj.latest.rsi / maxRSI, 1);
  const rsiColor = getClassificationColor(cmj.latest.rsi_classification);

  return (
    <View style={styles.container}>
      {/* Header with RSI Gauge */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>{labels.title}</Text>
            <Text style={styles.date}>{cmj.latest.date}</Text>
          </View>
          <TouchableOpacity 
            style={styles.detailsButton}
            onPress={() => router.push(`/athlete/${athleteId}/jump-assessment`)}
          >
            <Text style={styles.detailsButtonText}>{labels.viewDetails}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.accent.primary} />
          </TouchableOpacity>
        </View>

        {/* RSI Display */}
        <View style={styles.rsiContainer}>
          <View style={styles.rsiGauge}>
            <Svg width={chartWidth} height={100}>
              {/* Background arc */}
              <Path
                d={`M 30 80 A 100 100 0 0 1 ${chartWidth - 30} 80`}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="16"
                fill="none"
                strokeLinecap="round"
              />
              {/* Value arc */}
              <Path
                d={`M 30 80 A 100 100 0 0 1 ${30 + (chartWidth - 60) * normalizedRSI} ${80 - Math.sin(Math.PI * normalizedRSI) * 50}`}
                stroke={rsiColor}
                strokeWidth="16"
                fill="none"
                strokeLinecap="round"
              />
              {/* Center value */}
              <SvgText x={chartWidth / 2} y={65} textAnchor="middle" fill={rsiColor} fontSize="28" fontWeight="bold">
                {cmj.latest.rsi.toFixed(2)}
              </SvgText>
              <SvgText x={chartWidth / 2} y={85} textAnchor="middle" fill={rsiColor} fontSize="11" fontWeight="600">
                {getClassificationLabel(cmj.latest.rsi_classification)}
              </SvgText>
            </Svg>
          </View>

          {/* Quick Stats */}
          <View style={styles.quickStats}>
            <View style={styles.quickStat}>
              <Text style={styles.quickStatValue}>{cmj.latest.jump_height_cm.toFixed(1)}</Text>
              <Text style={styles.quickStatLabel}>{locale === 'pt' ? 'Altura (cm)' : 'Height (cm)'}</Text>
            </View>
            <View style={styles.quickStat}>
              <Text style={styles.quickStatValue}>{cmj.latest.peak_power_w.toFixed(0)}</Text>
              <Text style={styles.quickStatLabel}>{locale === 'pt' ? 'Potência (W)' : 'Power (W)'}</Text>
            </View>
            <View style={styles.quickStat}>
              <Text style={styles.quickStatValue}>{cmj.latest.relative_power_wkg.toFixed(1)}</Text>
              <Text style={styles.quickStatLabel}>W/kg</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Fatigue Index Card */}
      {fatigue && (
        <View style={[styles.fatigueCard, { borderColor: fatigue.color }]}>
          <View style={styles.fatigueHeader}>
            <Ionicons 
              name={fatigue.status === 'green' ? 'checkmark-circle' : fatigue.status === 'yellow' ? 'alert-circle' : 'warning'} 
              size={24} 
              color={fatigue.color} 
            />
            <View style={styles.fatigueHeaderText}>
              <Text style={styles.fatigueTitle}>{labels.fatigueIndex}</Text>
              <Text style={[styles.fatigueStatus, { color: fatigue.color }]}>
                {fatigue.status_label}
              </Text>
            </View>
            <View style={[styles.variationBadge, { backgroundColor: fatigue.color + '20' }]}>
              <Text style={[styles.variationText, { color: fatigue.color }]}>
                {fatigue.rsi_variation_percent > 0 ? '+' : ''}{fatigue.rsi_variation_percent.toFixed(1)}%
              </Text>
            </View>
          </View>
          
          <View style={styles.fatigueScale}>
            <View style={[styles.fatigueScaleItem, { backgroundColor: '#10b98120' }]}>
              <Text style={[styles.fatigueScaleLabel, { color: '#10b981' }]}>0 a -5%</Text>
              <Text style={styles.fatigueScaleText}>{locale === 'pt' ? 'Normal' : 'Normal'}</Text>
            </View>
            <View style={[styles.fatigueScaleItem, { backgroundColor: '#f59e0b20' }]}>
              <Text style={[styles.fatigueScaleLabel, { color: '#f59e0b' }]}>-6 a -12%</Text>
              <Text style={styles.fatigueScaleText}>{locale === 'pt' ? 'Monitorar' : 'Monitor'}</Text>
            </View>
            <View style={[styles.fatigueScaleItem, { backgroundColor: '#ef444420' }]}>
              <Text style={[styles.fatigueScaleLabel, { color: '#ef4444' }]}>&lt;-13%</Text>
              <Text style={styles.fatigueScaleText}>{locale === 'pt' ? 'Risco' : 'Risk'}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Asymmetry Card with Visual Bars */}
      {asymmetry && data.protocols.sl_cmj && (
        <View style={[styles.asymmetryCard, asymmetry.red_flag && styles.asymmetryCardRedFlag]}>
          <View style={styles.asymmetryHeader}>
            <Ionicons 
              name={asymmetry.red_flag ? 'flag' : 'swap-horizontal'} 
              size={20} 
              color={asymmetry.red_flag ? '#ef4444' : colors.accent.primary} 
            />
            <Text style={styles.asymmetryTitle}>{labels.asymmetry}</Text>
            {asymmetry.red_flag && (
              <View style={styles.redFlagBadge}>
                <Text style={styles.redFlagText}>RED FLAG</Text>
              </View>
            )}
          </View>
          
          {/* Visual Bar Chart for Asymmetry */}
          <View style={styles.asymmetryBarsContainer}>
            {/* RSI Comparison */}
            <View style={styles.asymmetryBarSection}>
              <Text style={styles.asymmetryBarLabel}>RSI</Text>
              <View style={styles.asymmetryBarsRow}>
                <View style={styles.asymmetryLegRow}>
                  <Text style={styles.legLabel}>{locale === 'pt' ? 'Dir' : 'R'}</Text>
                  <View style={styles.barBackground}>
                    <View style={[
                      styles.barFill,
                      { 
                        width: `${Math.min((data.protocols.sl_cmj.right.rsi / Math.max(data.protocols.sl_cmj.right.rsi, data.protocols.sl_cmj.left.rsi)) * 100, 100)}%`,
                        backgroundColor: asymmetry.rsi.dominant_leg === 'right' ? '#22c55e' : '#60a5fa'
                      }
                    ]} />
                  </View>
                  <Text style={styles.barValue}>{data.protocols.sl_cmj.right.rsi.toFixed(2)}</Text>
                </View>
                <View style={styles.asymmetryLegRow}>
                  <Text style={styles.legLabel}>{locale === 'pt' ? 'Esq' : 'L'}</Text>
                  <View style={styles.barBackground}>
                    <View style={[
                      styles.barFill,
                      { 
                        width: `${Math.min((data.protocols.sl_cmj.left.rsi / Math.max(data.protocols.sl_cmj.right.rsi, data.protocols.sl_cmj.left.rsi)) * 100, 100)}%`,
                        backgroundColor: asymmetry.rsi.dominant_leg === 'left' ? '#22c55e' : '#60a5fa'
                      }
                    ]} />
                  </View>
                  <Text style={styles.barValue}>{data.protocols.sl_cmj.left.rsi.toFixed(2)}</Text>
                </View>
              </View>
              <Text style={[styles.asymmetryDiff, asymmetry.rsi.red_flag && { color: '#ef4444' }]}>
                Δ {asymmetry.rsi.asymmetry_percent.toFixed(1)}%
              </Text>
            </View>

            {/* Jump Height Comparison */}
            <View style={styles.asymmetryBarSection}>
              <Text style={styles.asymmetryBarLabel}>{locale === 'pt' ? 'Altura (cm)' : 'Height (cm)'}</Text>
              <View style={styles.asymmetryBarsRow}>
                <View style={styles.asymmetryLegRow}>
                  <Text style={styles.legLabel}>{locale === 'pt' ? 'Dir' : 'R'}</Text>
                  <View style={styles.barBackground}>
                    <View style={[
                      styles.barFill,
                      { 
                        width: `${Math.min((data.protocols.sl_cmj.right.jump_height_cm / Math.max(data.protocols.sl_cmj.right.jump_height_cm, data.protocols.sl_cmj.left.jump_height_cm)) * 100, 100)}%`,
                        backgroundColor: asymmetry.jump_height.dominant_leg === 'right' ? '#f59e0b' : '#a78bfa'
                      }
                    ]} />
                  </View>
                  <Text style={styles.barValue}>{data.protocols.sl_cmj.right.jump_height_cm.toFixed(1)}</Text>
                </View>
                <View style={styles.asymmetryLegRow}>
                  <Text style={styles.legLabel}>{locale === 'pt' ? 'Esq' : 'L'}</Text>
                  <View style={styles.barBackground}>
                    <View style={[
                      styles.barFill,
                      { 
                        width: `${Math.min((data.protocols.sl_cmj.left.jump_height_cm / Math.max(data.protocols.sl_cmj.right.jump_height_cm, data.protocols.sl_cmj.left.jump_height_cm)) * 100, 100)}%`,
                        backgroundColor: asymmetry.jump_height.dominant_leg === 'left' ? '#f59e0b' : '#a78bfa'
                      }
                    ]} />
                  </View>
                  <Text style={styles.barValue}>{data.protocols.sl_cmj.left.jump_height_cm.toFixed(1)}</Text>
                </View>
              </View>
              <Text style={[styles.asymmetryDiff, asymmetry.jump_height.red_flag && { color: '#ef4444' }]}>
                Δ {asymmetry.jump_height.asymmetry_percent.toFixed(1)}%
              </Text>
            </View>
          </View>

          {/* Red flag threshold indicator */}
          <View style={styles.asymmetryThreshold}>
            <View style={styles.thresholdLine} />
            <Text style={styles.thresholdText}>{locale === 'pt' ? 'Limite: >10% = Risco' : 'Threshold: >10% = Risk'}</Text>
          </View>
          
          <Text style={styles.asymmetryInterpretation}>{asymmetry.interpretation}</Text>
        </View>
      )}

      {/* Power-Velocity Profile Card */}
      {pvProfile && (
        <View style={styles.pvCard}>
          <View style={styles.pvHeader}>
            <Ionicons name="flash" size={20} color="#f59e0b" />
            <Text style={styles.pvTitle}>{labels.powerVelocity}</Text>
          </View>
          
          <View style={[styles.pvProfile, { backgroundColor: pvProfile.profile.color + '20', borderColor: pvProfile.profile.color }]}>
            <Text style={[styles.pvProfileLabel, { color: pvProfile.profile.color }]}>{pvProfile.profile.label}</Text>
            <Text style={styles.pvProfileRec}>{pvProfile.profile.recommendation}</Text>
          </View>
        </View>
      )}

      {/* Z-Score Card */}
      {zScore && (
        <View style={styles.zScoreCard}>
          <View style={styles.zScoreHeader}>
            <Ionicons name="stats-chart" size={18} color={colors.accent.primary} />
            <Text style={styles.zScoreTitle}>{labels.zScore}</Text>
          </View>
          
          <View style={styles.zScoreContent}>
            <Text style={[styles.zScoreValue, { 
              color: zScore.jump_height >= 1 ? '#22c55e' : zScore.jump_height >= -1 ? '#f59e0b' : '#ef4444' 
            }]}>
              {zScore.jump_height > 0 ? '+' : ''}{zScore.jump_height.toFixed(2)}
            </Text>
            <Text style={styles.zScoreInterpretation}>{zScore.interpretation}</Text>
          </View>
        </View>
      )}

      {/* Recommendations */}
      {data.recommendations && data.recommendations.length > 0 && (
        <View style={styles.recommendationsCard}>
          <Text style={styles.recommendationsTitle}>{labels.recommendations}</Text>
          {data.recommendations.slice(0, 3).map((rec, index) => (
            <View key={index} style={styles.recommendationItem}>
              <Ionicons 
                name={rec.includes('⚠️') || rec.includes('🚩') || rec.includes('🔴') ? 'warning' : 'checkmark-circle'} 
                size={16} 
                color={rec.includes('⚠️') || rec.includes('🚩') || rec.includes('🔴') ? '#ef4444' : '#10b981'} 
              />
              <Text style={styles.recommendationText}>{rec}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: isSmallScreen ? 10 : 12,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: isSmallScreen ? 24 : 32,
    alignItems: 'center',
    backgroundColor: colors.dark.card,
    borderRadius: 12,
  },
  emptyText: {
    color: colors.text.tertiary,
    fontSize: isSmallScreen ? 13 : 14,
    marginTop: 12,
    marginBottom: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent.primary,
    paddingHorizontal: isSmallScreen ? 14 : 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
  },
  addButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: isSmallScreen ? 13 : 14,
  },
  headerCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: isSmallScreen ? 12 : 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  title: {
    fontSize: isSmallScreen ? 15 : 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  date: {
    fontSize: isSmallScreen ? 10 : 11,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailsButtonText: {
    fontSize: 12,
    color: colors.accent.primary,
    fontWeight: '600',
  },
  rsiContainer: {
    alignItems: 'center',
  },
  rsiGauge: {
    alignItems: 'center',
  },
  quickStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 8,
  },
  quickStat: {
    alignItems: 'center',
  },
  quickStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  quickStatLabel: {
    fontSize: 10,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  fatigueCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
  },
  fatigueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  fatigueHeaderText: {
    flex: 1,
  },
  fatigueTitle: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  fatigueStatus: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  variationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
  },
  variationText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  fatigueScale: {
    flexDirection: 'row',
    gap: 6,
  },
  fatigueScaleItem: {
    flex: 1,
    padding: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  fatigueScaleLabel: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  fatigueScaleText: {
    fontSize: 8,
    color: colors.text.secondary,
  },
  asymmetryCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 14,
  },
  asymmetryCardRedFlag: {
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  asymmetryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  asymmetryTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
  },
  redFlagBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  redFlagText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  asymmetryValues: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  asymmetryValue: {
    alignItems: 'center',
  },
  asymmetryLabel: {
    fontSize: 10,
    color: colors.text.tertiary,
  },
  asymmetryPercent: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  asymmetryInterpretation: {
    fontSize: 11,
    color: colors.text.secondary,
    lineHeight: 16,
  },
  pvCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 14,
  },
  pvHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  pvTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
  },
  pvProfile: {
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
  },
  pvProfileLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  pvProfileRec: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  zScoreCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 14,
  },
  zScoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  zScoreTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
  },
  zScoreContent: {
    alignItems: 'center',
  },
  zScoreValue: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  zScoreInterpretation: {
    fontSize: 11,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: 4,
  },
  recommendationsCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 14,
  },
  recommendationsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 10,
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  recommendationText: {
    flex: 1,
    fontSize: 11,
    color: colors.text.secondary,
    lineHeight: 16,
  },
});
