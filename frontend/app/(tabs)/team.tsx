import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, G, Text as SvgText, Rect, Line } from 'react-native-svg';
import api from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { ACWRBadge, ACWRLegend, getACWRClassification } from '../../components/ACWRBadge';

// ACWR Metric options
const ACWR_METRICS = [
  { key: 'total_distance', labelPt: 'Total Distance', labelEn: 'Total Distance' },
  { key: 'high_intensity_distance', labelPt: 'HID Z3', labelEn: 'HID Z3' },
  { key: 'high_speed_running', labelPt: 'HSR Z4', labelEn: 'HSR Z4' },
  { key: 'sprint_distance', labelPt: 'Sprint Z5', labelEn: 'Sprint Z5' },
  { key: 'number_of_sprints', labelPt: 'Sprint', labelEn: 'Sprint' },
  { key: 'acc_dec', labelPt: 'ACC + DEC', labelEn: 'ACC + DEC' },
];

// Date range options
const DATE_RANGES = [
  { key: 'today', labelPt: 'Hoje', labelEn: 'Today' },
  { key: '7d', labelPt: '7 dias', labelEn: '7 days' },
  { key: '14d', labelPt: '14 dias', labelEn: '14 days' },
  { key: '28d', labelPt: '28 dias', labelEn: '28 days' },
  { key: '90d', labelPt: '90 dias', labelEn: '90 days' },
];

// Position options - now dynamically generated from athlete data
// Default options only used as fallback
const DEFAULT_POSITIONS = [
  { key: 'all', labelPt: 'Todas', labelEn: 'All' },
];

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
  // Extended fields for dashboard
  monotony?: number;
  strain?: number;
  metric_value?: number;
  metric_avg?: number;
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
  
  // Filter states
  const [selectedMetric, setSelectedMetric] = React.useState('total_distance');
  const [selectedDateRange, setSelectedDateRange] = React.useState('7d');
  const [selectedPosition, setSelectedPosition] = React.useState('all');
  const [athleteSearchText, setAthleteSearchText] = React.useState('');
  
  // Modal visibility states
  const [metricModalVisible, setMetricModalVisible] = React.useState(false);
  const [dateModalVisible, setDateModalVisible] = React.useState(false);
  const [positionModalVisible, setPositionModalVisible] = React.useState(false);
  
  // Section visibility states (collapsed by default)
  const [showAlerts, setShowAlerts] = React.useState(false);
  const [showAthleteStatus, setShowAthleteStatus] = React.useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['team-dashboard', selectedMetric, selectedDateRange],
    queryFn: async () => {
      const response = await api.get<TeamDashboardResponse>(`/dashboard/team?lang=${locale}&acwr_metric=${selectedMetric}&date_range=${selectedDateRange}`);
      return response.data;
    },
  });

  // Get current metric label
  const getCurrentMetricLabel = () => {
    const metric = ACWR_METRICS.find(m => m.key === selectedMetric);
    return metric ? (locale === 'pt' ? metric.labelPt : metric.labelEn) : 'Total Distance';
  };

  // Get current date range label
  const getCurrentDateRangeLabel = () => {
    const range = DATE_RANGES.find(r => r.key === selectedDateRange);
    return range ? (locale === 'pt' ? range.labelPt : range.labelEn) : '7 days';
  };

  // Get current position label
  const getCurrentPositionLabel = () => {
    if (selectedPosition === 'all') {
      return locale === 'pt' ? 'Todas' : 'All';
    }
    return selectedPosition;
  };

  // Generate dynamic position options from athlete data
  const dynamicPositions = React.useMemo(() => {
    if (!data?.athletes) return DEFAULT_POSITIONS;
    
    // Extract unique positions from athletes
    const uniquePositions = new Set<string>();
    data.athletes.forEach(athlete => {
      if (athlete.position && athlete.position !== 'Não especificado' && athlete.position !== 'Not specified') {
        uniquePositions.add(athlete.position);
      }
    });
    
    // Create position options array
    const positionOptions = [
      { key: 'all', labelPt: 'Todas', labelEn: 'All' },
      ...Array.from(uniquePositions).sort().map(pos => ({
        key: pos,
        labelPt: pos,
        labelEn: pos,
      }))
    ];
    
    return positionOptions;
  }, [data?.athletes]);

  const handleMetricSelect = (metricKey: string) => {
    setSelectedMetric(metricKey);
    setMetricModalVisible(false);
  };

  const handleDateRangeSelect = (rangeKey: string) => {
    setSelectedDateRange(rangeKey);
    setDateModalVisible(false);
  };

  const handlePositionSelect = (posKey: string) => {
    setSelectedPosition(posKey);
    setPositionModalVisible(false);
  };

  // Filter athletes based on selected filters (client-side filtering for performance)
  const getFilteredAthletes = React.useMemo(() => {
    if (!data?.athletes) return [];
    
    let filtered = data.athletes;
    
    // Filter by position (exact match, not partial)
    if (selectedPosition !== 'all') {
      filtered = filtered.filter(a => a.position === selectedPosition);
    }
    
    // Filter by search text
    if (athleteSearchText.trim()) {
      const searchLower = athleteSearchText.toLowerCase();
      filtered = filtered.filter(a => 
        a.name.toLowerCase().includes(searchLower)
      );
    }
    
    return filtered;
  }, [data?.athletes, selectedPosition, athleteSearchText]);

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

  // Check if user has no athletes (empty state)
  const hasNoData = data.stats.total_athletes === 0;
  
  if (hasNoData) {
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
          
          <View style={styles.emptyStateContainer}>
            <Ionicons name="people-outline" size={80} color={colors.text.tertiary} />
            <Text style={styles.emptyStateTitle}>
              {locale === 'pt' ? 'Nenhum atleta cadastrado' : 'No athletes registered'}
            </Text>
            <Text style={styles.emptyStateSubtitle}>
              {locale === 'pt' 
                ? 'Adicione atletas para visualizar estatísticas da equipe' 
                : 'Add athletes to view team statistics'}
            </Text>
            <TouchableOpacity 
              style={styles.emptyStateButton}
              onPress={() => router.push('/add-athlete')}
            >
              <LinearGradient
                colors={[colors.accent.primary, colors.accent.secondary]}
                style={styles.emptyStateButtonGradient}
              >
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={styles.emptyStateButtonText}>
                  {locale === 'pt' ? 'Adicionar Atleta' : 'Add Athlete'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>
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
          {/* FILTERS ROW */}
          <View style={styles.filtersRow}>
            {/* Metric Selector */}
            <TouchableOpacity 
              style={styles.filterButton}
              onPress={() => setMetricModalVisible(true)}
            >
              <Ionicons name="analytics-outline" size={14} color={colors.accent.primary} />
              <Text style={styles.filterButtonText} numberOfLines={1}>{getCurrentMetricLabel()}</Text>
              <Ionicons name="chevron-down" size={12} color={colors.text.tertiary} />
            </TouchableOpacity>
            
            {/* Date Range Selector */}
            <TouchableOpacity 
              style={styles.filterButton}
              onPress={() => setDateModalVisible(true)}
            >
              <Ionicons name="calendar-outline" size={14} color={colors.accent.primary} />
              <Text style={styles.filterButtonText} numberOfLines={1}>{getCurrentDateRangeLabel()}</Text>
              <Ionicons name="chevron-down" size={12} color={colors.text.tertiary} />
            </TouchableOpacity>
            
            {/* Position Selector */}
            <TouchableOpacity 
              style={styles.filterButton}
              onPress={() => setPositionModalVisible(true)}
            >
              <Ionicons name="people-outline" size={14} color={colors.accent.primary} />
              <Text style={styles.filterButtonText} numberOfLines={1}>{getCurrentPositionLabel()}</Text>
              <Ionicons name="chevron-down" size={12} color={colors.text.tertiary} />
            </TouchableOpacity>
          </View>
          
          {/* Athlete Search */}
          <View style={styles.searchContainer}>
            <Ionicons name="search-outline" size={16} color={colors.text.tertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder={locale === 'pt' ? 'Buscar atleta...' : 'Search athlete...'}
              placeholderTextColor={colors.text.tertiary}
              value={athleteSearchText}
              onChangeText={setAthleteSearchText}
            />
            {athleteSearchText.length > 0 && (
              <TouchableOpacity onPress={() => setAthleteSearchText('')}>
                <Ionicons name="close-circle" size={16} color={colors.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Athletes Status - Collapsible (MOVED TO TOP) */}
          <TouchableOpacity 
            style={styles.collapsibleHeader}
            onPress={() => setShowAthleteStatus(!showAthleteStatus)}
          >
            <View style={styles.collapsibleHeaderLeft}>
              <Ionicons name="people" size={16} color={colors.accent.primary} />
              <Text style={styles.collapsibleTitle}>
                {locale === 'pt' ? 'Status dos Atletas' : 'Athletes Status'} ({getFilteredAthletes.length})
              </Text>
            </View>
            <Ionicons 
              name={showAthleteStatus ? 'chevron-up' : 'chevron-down'} 
              size={20} 
              color={colors.text.tertiary} 
            />
          </TouchableOpacity>
          
          {showAthleteStatus && (
            <View style={styles.athletesSection}>
              {getFilteredAthletes.map((athlete) => {
                // Get ACWR classification for dynamic card background
                const acwrClass = getACWRClassification(athlete.acwr, locale);
                
                return (
                <View
                  key={athlete.id}
                  style={[
                    styles.athleteCardExpanded,
                    { 
                      backgroundColor: acwrClass.bgColor,
                      borderColor: acwrClass.color + '40', // 25% opacity for border
                    }
                  ]}
                >
                  <View style={styles.athleteCardHeader}>
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
                    <TouchableOpacity 
                      style={styles.athleteProfileButton}
                      onPress={() => router.push(`/athlete/${athlete.id}`)}
                    >
                      <Text style={styles.athleteProfileButtonText}>
                        {locale === 'pt' ? 'Perfil' : 'Profile'}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.accent.primary} />
                    </TouchableOpacity>
                  </View>
                  
                  {/* Athlete metrics grid */}
                  <View style={styles.athleteMetricsGrid}>
                    <View style={styles.athleteMetricItem}>
                      <Text style={styles.athleteMetricLabel}>ACWR</Text>
                      <ACWRBadge value={athlete.acwr} size="small" showLabel={false} locale={locale} />
                    </View>
                    
                    <View style={styles.athleteMetricItem}>
                      <Text style={styles.athleteMetricLabel}>{locale === 'pt' ? 'Fadiga' : 'Fatigue'}</Text>
                      <Text style={[styles.athleteMetricValue, { color: (athlete.fatigue_score || 0) > 70 ? '#ef4444' : colors.text.primary }]}>
                        {athlete.fatigue_score ? `${athlete.fatigue_score}%` : '-'}
                      </Text>
                    </View>
                    
                    <View style={styles.athleteMetricItem}>
                      <Text style={styles.athleteMetricLabel}>{locale === 'pt' ? 'Risco Lesão' : 'Injury Risk'}</Text>
                      <View style={[styles.riskBadge, { backgroundColor: acwrClass.bgColor }]}>
                        <Text style={[styles.riskBadgeText, { color: acwrClass.color }]}>
                          {acwrClass.labelShort}
                        </Text>
                      </View>
                    </View>
                    
                    <View style={styles.athleteMetricItem}>
                      <Text style={styles.athleteMetricLabel}>{locale === 'pt' ? 'Monotonia' : 'Monotony'}</Text>
                      <Text style={styles.athleteMetricValue}>
                        {athlete.monotony?.toFixed(1) || '-'}
                      </Text>
                    </View>
                    
                    <View style={styles.athleteMetricItem}>
                      <Text style={styles.athleteMetricLabel}>Strain</Text>
                      <Text style={styles.athleteMetricValue}>
                        {athlete.strain?.toFixed(0) || '-'}
                      </Text>
                    </View>
                    
                    <View style={styles.athleteMetricItem}>
                      <Text style={styles.athleteMetricLabel}>{getCurrentMetricLabel()}</Text>
                      <Text style={styles.athleteMetricValue}>
                        {athlete.metric_value != null ? athlete.metric_value.toFixed(0) : '-'}
                      </Text>
                    </View>
                  </View>
                </View>
              );})}
              
              {getFilteredAthletes.length === 0 && (
                <View style={styles.noResultsContainer}>
                  <Ionicons name="search-outline" size={32} color={colors.text.tertiary} />
                  <Text style={styles.noResultsText}>
                    {locale === 'pt' ? 'Nenhum atleta encontrado' : 'No athletes found'}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Alerts Section - Collapsible (MOVED AFTER Athletes Status) */}
          {data.alerts.length > 0 && (
            <TouchableOpacity 
              style={styles.collapsibleHeader}
              onPress={() => setShowAlerts(!showAlerts)}
            >
              <View style={styles.collapsibleHeaderLeft}>
                <Ionicons name="warning" size={16} color={colors.status.warning} />
                <Text style={styles.collapsibleTitle}>
                  {locale === 'pt' ? 'Alertas' : 'Alerts'} ({data.alerts.length})
                </Text>
              </View>
              <Ionicons 
                name={showAlerts ? 'chevron-up' : 'chevron-down'} 
                size={20} 
                color={colors.text.tertiary} 
              />
            </TouchableOpacity>
          )}
          {showAlerts && data.alerts.length > 0 && (
            <View style={styles.alertsSection}>
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
                <Text style={styles.statValue}>{data.stats.team_avg_hid ? `${Math.round(data.stats.team_avg_hid)}m` : '-'}</Text>
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

      {/* Metric Selection Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={metricModalVisible}
        onRequestClose={() => setMetricModalVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setMetricModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {locale === 'pt' ? 'Selecionar Métrica ACWR' : 'Select ACWR Metric'}
              </Text>
              <TouchableOpacity onPress={() => setMetricModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalSubtitle}>
              {locale === 'pt' 
                ? 'Escolha a métrica de carga para calcular o status dos atletas'
                : 'Choose the load metric to calculate athlete status'}
            </Text>
            
            {ACWR_METRICS.map((metric) => (
              <TouchableOpacity
                key={metric.key}
                style={[
                  styles.metricOption,
                  selectedMetric === metric.key && styles.metricOptionSelected
                ]}
                onPress={() => handleMetricSelect(metric.key)}
              >
                <View style={styles.metricOptionContent}>
                  <View style={[
                    styles.metricRadio,
                    selectedMetric === metric.key && styles.metricRadioSelected
                  ]}>
                    {selectedMetric === metric.key && (
                      <View style={styles.metricRadioInner} />
                    )}
                  </View>
                  <Text style={[
                    styles.metricOptionText,
                    selectedMetric === metric.key && styles.metricOptionTextSelected
                  ]}>
                    {locale === 'pt' ? metric.labelPt : metric.labelEn}
                  </Text>
                </View>
                {selectedMetric === metric.key && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.accent.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Date Range Selection Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={dateModalVisible}
        onRequestClose={() => setDateModalVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setDateModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {locale === 'pt' ? 'Selecionar Período' : 'Select Date Range'}
              </Text>
              <TouchableOpacity onPress={() => setDateModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            
            {DATE_RANGES.map((range) => (
              <TouchableOpacity
                key={range.key}
                style={[
                  styles.metricOption,
                  selectedDateRange === range.key && styles.metricOptionSelected
                ]}
                onPress={() => handleDateRangeSelect(range.key)}
              >
                <View style={styles.metricOptionContent}>
                  <View style={[
                    styles.metricRadio,
                    selectedDateRange === range.key && styles.metricRadioSelected
                  ]}>
                    {selectedDateRange === range.key && (
                      <View style={styles.metricRadioInner} />
                    )}
                  </View>
                  <Text style={[
                    styles.metricOptionText,
                    selectedDateRange === range.key && styles.metricOptionTextSelected
                  ]}>
                    {locale === 'pt' ? range.labelPt : range.labelEn}
                  </Text>
                </View>
                {selectedDateRange === range.key && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.accent.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Position Selection Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={positionModalVisible}
        onRequestClose={() => setPositionModalVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setPositionModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {locale === 'pt' ? 'Filtrar por Posição' : 'Filter by Position'}
              </Text>
              <TouchableOpacity onPress={() => setPositionModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            
            {dynamicPositions.map((pos) => (
              <TouchableOpacity
                key={pos.key}
                style={[
                  styles.metricOption,
                  selectedPosition === pos.key && styles.metricOptionSelected
                ]}
                onPress={() => handlePositionSelect(pos.key)}
              >
                <View style={styles.metricOptionContent}>
                  <View style={[
                    styles.metricRadio,
                    selectedPosition === pos.key && styles.metricRadioSelected
                  ]}>
                    {selectedPosition === pos.key && (
                      <View style={styles.metricRadioInner} />
                    )}
                  </View>
                  <Text style={[
                    styles.metricOptionText,
                    selectedPosition === pos.key && styles.metricOptionTextSelected
                  ]}>
                    {locale === 'pt' ? pos.labelPt : pos.labelEn}
                  </Text>
                </View>
                {selectedPosition === pos.key && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.accent.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
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
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: 16,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  emptyStateButton: {
    marginTop: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  emptyStateButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyStateButtonText: {
    color: '#fff',
    fontSize: 16,
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
  // Card header with metric selector
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  metricSelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.secondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  metricSelectorText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.dark.cardSolid,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.text.tertiary,
    marginBottom: 20,
  },
  metricOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: colors.dark.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  metricOptionSelected: {
    borderColor: colors.accent.primary,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
  },
  metricOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metricRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.text.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricRadioSelected: {
    borderColor: colors.accent.primary,
  },
  metricRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent.primary,
  },
  metricOptionText: {
    fontSize: 15,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  metricOptionTextSelected: {
    color: colors.text.primary,
    fontWeight: '600',
  },
  // New filter styles
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.card,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border.default,
    flex: 1,
    minWidth: 90,
  },
  filterButtonText: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: '500',
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
    paddingVertical: 0,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  collapsibleHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collapsibleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  athletesSection: {
    marginBottom: 16,
  },
  athleteCardExpanded: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  athleteCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  athleteProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  athleteProfileButtonText: {
    fontSize: 12,
    color: colors.accent.primary,
    fontWeight: '600',
  },
  athleteMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  athleteMetricItem: {
    width: '30%',
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: colors.dark.secondary,
    borderRadius: 8,
  },
  athleteMetricLabel: {
    fontSize: 9,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  athleteMetricValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  noResultsContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noResultsText: {
    fontSize: 14,
    color: colors.text.tertiary,
    marginTop: 8,
  },
});
