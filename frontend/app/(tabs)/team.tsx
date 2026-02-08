import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import api from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { ACWRBadge, ACWRLegend, getACWRClassification } from '../../components/ACWRBadge';

interface TeamDashboardAthlete {
  id: string;
  name: string;
  position: string;
  acwr: number | null;
  risk_level: string;
  fatigue_score: number | null;
  last_gps_date: string | null;
  last_wellness_date: string | null;
  wellness_score: number | null;
  total_sessions_7d: number;
  avg_distance_7d: number;
  injury_risk: boolean;
  peripheral_fatigue: boolean;
  // New fields for strength and body comp
  mean_power?: number;
  peak_power?: number;
  body_fat_percentage?: number;
  lean_mass_kg?: number;
}

interface TeamDashboardStats {
  total_athletes: number;
  athletes_high_risk: number;
  athletes_optimal: number;
  athletes_fatigued: number;
  team_avg_acwr: number;
  team_avg_wellness: number;
  team_avg_fatigue: number;
  sessions_this_week: number;
  total_distance_this_week: number;
  // New team averages
  team_avg_body_fat?: number;
  team_avg_power?: number;
  team_avg_hid?: number;
  team_avg_rsi?: number;
  rsi_trend?: string;
  rsi_percentile?: number;
  avg_distance_per_session?: number;
}

interface PositionSummary {
  count: number;
  avg_acwr: number;
  avg_wellness: number;
  avg_fatigue: number;
  avg_distance: number;
  avg_sprints: number;
  avg_max_speed: number;
  high_risk_count: number;
}

interface TeamDashboardResponse {
  stats: TeamDashboardStats;
  athletes: TeamDashboardAthlete[];
  risk_distribution: { [key: string]: number };
  position_summary: { [key: string]: PositionSummary };
  alerts: string[];
}

export default function TeamDashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, locale } = useLanguage();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = React.useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['team-dashboard'],
    queryFn: async () => {
      const response = await api.get<TeamDashboardResponse>(`/dashboard/team?lang=${locale}`);
      return response.data;
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return '#10b981';
      case 'optimal': return '#22d3ee';
      case 'moderate': return '#f59e0b';
      case 'high': return '#ef4444';
      default: return colors.text.tertiary;
    }
  };

  const getRiskLabel = (risk: string) => {
    const labels: { [key: string]: { pt: string; en: string } } = {
      low: { pt: 'Baixo', en: 'Low' },
      optimal: { pt: 'Ótimo', en: 'Optimal' },
      moderate: { pt: 'Moderado', en: 'Moderate' },
      high: { pt: 'Alto', en: 'High' },
      unknown: { pt: 'N/A', en: 'N/A' },
    };
    return labels[risk]?.[locale === 'pt' ? 'pt' : 'en'] || risk;
  };

  const styles = createStyles(colors);

  // Mini Donut Chart Component
  const RiskDonut = ({ distribution }: { distribution: { [key: string]: number } }) => {
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    if (total === 0) return null;

    const size = 120;
    const strokeWidth = 16;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    let currentAngle = 0;
    const segments = [
      { key: 'high', color: '#ef4444' },
      { key: 'moderate', color: '#f59e0b' },
      { key: 'optimal', color: '#22d3ee' },
      { key: 'low', color: '#10b981' },
    ].filter(s => distribution[s.key] > 0);

    return (
      <View style={styles.donutContainer}>
        <Svg width={size} height={size}>
          <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
            {segments.map((segment, index) => {
              const value = distribution[segment.key] || 0;
              const percent = value / total;
              const dashArray = percent * circumference;
              const dashOffset = -currentAngle * circumference / 360;
              currentAngle += percent * 360;

              return (
                <Circle
                  key={segment.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={segment.color}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={`${dashArray} ${circumference}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                />
              );
            })}
          </G>
          <SvgText
            x={size / 2}
            y={size / 2 - 8}
            textAnchor="middle"
            fill={colors.text.primary}
            fontSize={24}
            fontWeight="bold"
          >
            {total}
          </SvgText>
          <SvgText
            x={size / 2}
            y={size / 2 + 12}
            textAnchor="middle"
            fill={colors.text.secondary}
            fontSize={11}
          >
            {locale === 'pt' ? 'atletas' : 'athletes'}
          </SvgText>
        </Svg>
        <View style={styles.donutLegend}>
          {segments.map(s => (
            <View key={s.key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: s.color }]} />
              <Text style={styles.legendText}>
                {getRiskLabel(s.key)}: {distribution[s.key]}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
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
      <View style={styles.errorContainer}>
        <Ionicons name="warning" size={48} color={colors.status.error} />
        <Text style={styles.errorText}>
          {locale === 'pt' ? 'Erro ao carregar dados' : 'Error loading data'}
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryText}>{locale === 'pt' ? 'Tentar novamente' : 'Try again'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors.gradients.background}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {locale === 'pt' ? 'Dashboard da Equipe' : 'Team Dashboard'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {locale === 'pt' ? 'Visão geral do desempenho' : 'Performance overview'}
          </Text>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Alerts Section */}
          {data.alerts.length > 0 && (
            <View style={styles.alertsSection}>
              <Text style={styles.sectionTitle}>
                <Ionicons name="warning" size={16} color={colors.status.warning} /> {locale === 'pt' ? 'Alertas' : 'Alerts'}
              </Text>
              {data.alerts.map((alert, index) => (
                <View key={index} style={styles.alertItem}>
                  <Text style={styles.alertText}>{alert}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Stats Cards */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <LinearGradient colors={['rgba(34, 211, 238, 0.15)', 'rgba(34, 211, 238, 0.05)']} style={styles.statCardGradient}>
                <Ionicons name="speedometer" size={24} color="#22d3ee" />
                <Text style={styles.statValue}>{data.stats.team_avg_acwr}</Text>
                <Text style={styles.statLabel}>{locale === 'pt' ? 'ACWR Médio' : 'Avg ACWR'}</Text>
              </LinearGradient>
            </View>
            
            <View style={styles.statCard}>
              <LinearGradient colors={['rgba(16, 185, 129, 0.15)', 'rgba(16, 185, 129, 0.05)']} style={styles.statCardGradient}>
                <Ionicons name="fitness" size={24} color="#10b981" />
                <Text style={styles.statValue}>{data.stats.team_avg_wellness}</Text>
                <Text style={styles.statLabel}>{locale === 'pt' ? 'Wellness Médio' : 'Avg Wellness'}</Text>
              </LinearGradient>
            </View>
            
            <View style={styles.statCard}>
              <LinearGradient colors={['rgba(245, 158, 11, 0.15)', 'rgba(245, 158, 11, 0.05)']} style={styles.statCardGradient}>
                <Ionicons name="flame" size={24} color="#f59e0b" />
                <Text style={styles.statValue}>{data.stats.team_avg_fatigue}%</Text>
                <Text style={styles.statLabel}>{locale === 'pt' ? 'Fadiga Média' : 'Avg Fatigue'}</Text>
              </LinearGradient>
            </View>
            
            {/* Strength/Power Card - shows team average power */}
            <View style={styles.statCard}>
              <LinearGradient colors={['rgba(99, 102, 241, 0.15)', 'rgba(99, 102, 241, 0.05)']} style={styles.statCardGradient}>
                <Ionicons name="barbell" size={24} color="#6366f1" />
                <Text style={styles.statValue}>{data.stats.team_avg_power ? `${data.stats.team_avg_power}` : '-'}W</Text>
                <Text style={styles.statLabel}>{locale === 'pt' ? 'Potência Média' : 'Avg Power'}</Text>
              </LinearGradient>
            </View>
            
            {/* Body Composition Card - shows team average body fat */}
            <View style={styles.statCard}>
              <LinearGradient colors={['rgba(236, 72, 153, 0.15)', 'rgba(236, 72, 153, 0.05)']} style={styles.statCardGradient}>
                <Ionicons name="body" size={24} color="#ec4899" />
                <Text style={styles.statValue}>{data.stats.team_avg_body_fat ? `${data.stats.team_avg_body_fat.toFixed(1)}%` : '-'}</Text>
                <Text style={styles.statLabel}>{locale === 'pt' ? '% Gordura' : 'Body Fat %'}</Text>
              </LinearGradient>
            </View>
            
            {/* HSR Card - High Speed Running average */}
            <View style={styles.statCard}>
              <LinearGradient colors={['rgba(139, 92, 246, 0.15)', 'rgba(139, 92, 246, 0.05)']} style={styles.statCardGradient}>
                <Ionicons name="flash" size={24} color="#8b5cf6" />
                <Text style={styles.statValue}>{data.stats.team_avg_hid ? `${(data.stats.team_avg_hid / 1000).toFixed(1)}km` : '-'}</Text>
                <Text style={styles.statLabel}>{locale === 'pt' ? 'Média HSR' : 'Avg HSR'}</Text>
              </LinearGradient>
            </View>
          </View>
          
          {/* ACWR Legend */}
          <View style={styles.acwrLegendCard}>
            <Text style={styles.acwrLegendTitle}>
              {locale === 'pt' ? 'Classificação ACWR' : 'ACWR Classification'}
            </Text>
            <ACWRLegend locale={locale} />
          </View>

          {/* Quick Stats Row */}
          <View style={styles.quickStatsRow}>
            <View style={styles.quickStatCard}>
              <Ionicons name="navigate" size={20} color="#3b82f6" />
              <Text style={styles.quickStatValue}>
                {data.stats.avg_distance_per_session ? `${(data.stats.avg_distance_per_session / 1000).toFixed(1)}km` : '-'}
              </Text>
              <Text style={styles.quickStatLabel}>
                {locale === 'pt' ? 'Dist. Média/Sessão' : 'Avg Dist/Session'}
              </Text>
            </View>
            <View style={styles.quickStatCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="flash" size={20} color={
                  data.stats.team_avg_rsi 
                    ? (data.stats.team_avg_rsi >= 3.0 ? '#10b981' : data.stats.team_avg_rsi >= 2.0 ? '#3b82f6' : data.stats.team_avg_rsi >= 1.0 ? '#f59e0b' : '#ef4444')
                    : '#6b7280'
                } />
                {data.stats.rsi_trend && (
                  <Ionicons 
                    name={data.stats.rsi_trend === 'up' ? 'arrow-up' : data.stats.rsi_trend === 'down' ? 'arrow-down' : 'remove'} 
                    size={14} 
                    color={data.stats.rsi_trend === 'up' ? '#10b981' : data.stats.rsi_trend === 'down' ? '#ef4444' : '#6b7280'} 
                    style={{ marginLeft: 4 }}
                  />
                )}
              </View>
              <Text style={styles.quickStatValue}>
                {data.stats.team_avg_rsi ? data.stats.team_avg_rsi.toFixed(2) : '-'}
              </Text>
              <Text style={styles.quickStatLabel}>RSI</Text>
              {data.stats.rsi_percentile && (
                <Text style={[styles.quickStatPercentile, { 
                  color: data.stats.rsi_percentile >= 75 ? '#10b981' : data.stats.rsi_percentile >= 50 ? '#f59e0b' : '#ef4444'
                }]}>
                  P{data.stats.rsi_percentile.toFixed(0)}
                </Text>
              )}
            </View>
          </View>

          {/* Risk Distribution */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {locale === 'pt' ? 'Distribuição de Risco' : 'Risk Distribution'}
            </Text>
            <RiskDonut distribution={data.risk_distribution} />
          </View>

          {/* Athletes List */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {locale === 'pt' ? 'Status dos Atletas' : 'Athletes Status'}
            </Text>
            
            {data.athletes.map((athlete) => (
              <TouchableOpacity
                key={athlete.id}
                style={[
                  styles.athleteCard,
                  athlete.injury_risk && styles.athleteCardAlert
                ]}
                onPress={() => router.push(`/athlete/${athlete.id}`)}
              >
                <View style={styles.athleteInfo}>
                  <View style={styles.athleteHeader}>
                    <Text style={styles.athleteName}>{athlete.name}</Text>
                    {athlete.peripheral_fatigue && (
                      <View style={styles.fatigueBadge}>
                        <Ionicons name="flash" size={12} color="#f59e0b" />
                      </View>
                    )}
                  </View>
                  <Text style={styles.athletePosition}>{athlete.position}</Text>
                </View>
                
                <View style={styles.athleteStats}>
                  <View style={styles.athleteStat}>
                    <Text style={styles.athleteStatLabel}>ACWR</Text>
                    <ACWRBadge value={athlete.acwr} size="small" showLabel={false} locale={locale} />
                  </View>
                  
                  <View style={styles.athleteStat}>
                    <Text style={styles.athleteStatLabel}>{locale === 'pt' ? 'Fadiga' : 'Fatigue'}</Text>
                    <Text style={[styles.athleteStatValue, { color: (athlete.fatigue_score || 0) > 70 ? '#ef4444' : colors.text.primary }]}>
                      {athlete.fatigue_score ? `${athlete.fatigue_score}%` : '-'}
                    </Text>
                  </View>
                  
                  <View style={[styles.riskBadge, { backgroundColor: getACWRClassification(athlete.acwr, locale).bgColor }]}>
                    <Text style={[styles.riskBadgeText, { color: getACWRClassification(athlete.acwr, locale).color }]}>
                      {getACWRClassification(athlete.acwr, locale).labelShort}
                    </Text>
                  </View>
                </View>
                
                <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Position Summary - Group Averages */}
          {Object.keys(data.position_summary).length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {locale === 'pt' ? 'Médias por Posição' : 'Position Group Averages'}
              </Text>
              <Text style={styles.cardSubtitle}>
                {locale === 'pt' ? 'Métricas médias de cada grupo posicional' : 'Average metrics for each position group'}
              </Text>
              {Object.entries(data.position_summary).map(([position, stats]) => (
                <View key={position} style={styles.positionCard}>
                  <View style={styles.positionHeader}>
                    <View style={styles.positionInfo}>
                      <Text style={styles.positionName}>{position}</Text>
                      <Text style={styles.positionCount}>{stats.count} {locale === 'pt' ? 'atletas' : 'athletes'}</Text>
                    </View>
                    {stats.high_risk_count > 0 && (
                      <View style={styles.positionAlert}>
                        <Text style={styles.positionAlertText}>
                          {stats.high_risk_count} {locale === 'pt' ? 'em risco' : 'at risk'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.positionMetrics}>
                    <View style={styles.positionMetric}>
                      <Text style={styles.positionMetricValue}>{stats.avg_acwr || '-'}</Text>
                      <Text style={styles.positionMetricLabel}>ACWR</Text>
                    </View>
                    <View style={styles.positionMetric}>
                      <Text style={styles.positionMetricValue}>{stats.avg_distance ? `${(stats.avg_distance / 1000).toFixed(1)}km` : '-'}</Text>
                      <Text style={styles.positionMetricLabel}>{locale === 'pt' ? 'Dist. Média' : 'Avg Dist.'}</Text>
                    </View>
                    <View style={styles.positionMetric}>
                      <Text style={styles.positionMetricValue}>{stats.avg_sprints || '-'}</Text>
                      <Text style={styles.positionMetricLabel}>Sprints</Text>
                    </View>
                    <View style={styles.positionMetric}>
                      <Text style={styles.positionMetricValue}>{stats.avg_max_speed ? `${stats.avg_max_speed}` : '-'}</Text>
                      <Text style={styles.positionMetricLabel}>Vmax (km/h)</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Weekly Distance */}
          <View style={styles.distanceCard}>
            <LinearGradient colors={colors.gradients.primary} style={styles.distanceGradient}>
              <Ionicons name="map" size={28} color="#ffffff" />
              <View style={styles.distanceInfo}>
                <Text style={styles.distanceValue}>
                  {(data.stats.total_distance_this_week / 1000).toFixed(1)} km
                </Text>
                <Text style={styles.distanceLabel}>
                  {locale === 'pt' ? 'Distância total esta semana' : 'Total distance this week'}
                </Text>
              </View>
            </LinearGradient>
          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.dark.primary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.dark.primary,
    padding: 20,
  },
  errorText: {
    color: colors.text.secondary,
    fontSize: 16,
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    padding: 12,
    backgroundColor: colors.accent.primary,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  header: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  alertsSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 8,
  },
  alertItem: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: colors.status.error,
  },
  alertText: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 16,
  },
  acwrLegendCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  acwrLegendTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 10,
  },
  quickStatsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  quickStatCard: {
    flex: 1,
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  quickStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: 6,
  },
  quickStatLabel: {
    fontSize: 10,
    color: colors.text.secondary,
    marginTop: 4,
    textAlign: 'center',
  },
  quickStatPercentile: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  statCard: {
    width: '48%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 4,
  },
  statCardGradient: {
    padding: 16,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 4,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.dark.cardSolid,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 16,
  },
  donutContainer: {
    alignItems: 'center',
  },
  donutLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  athleteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.secondary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  athleteCardAlert: {
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  athleteInfo: {
    flex: 1,
  },
  athleteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  athleteName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  fatigueBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    padding: 4,
    borderRadius: 4,
  },
  athletePosition: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  athleteStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginRight: 8,
  },
  athleteStat: {
    alignItems: 'center',
  },
  athleteStatLabel: {
    fontSize: 9,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
  },
  athleteStatValue: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  riskBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  riskBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  positionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  positionInfo: {
    flex: 1,
  },
  positionName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  positionCount: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  positionStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  positionStat: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  positionAlert: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  positionAlertText: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: '600',
  },
  // New position card styles for group averages
  cardSubtitle: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: -12,
    marginBottom: 16,
  },
  positionCard: {
    backgroundColor: colors.dark.secondary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  positionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  positionMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  positionMetric: {
    alignItems: 'center',
    flex: 1,
  },
  positionMetricValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  positionMetricLabel: {
    fontSize: 10,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  distanceCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  distanceGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  distanceInfo: {
    flex: 1,
  },
  distanceValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  distanceLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
});
