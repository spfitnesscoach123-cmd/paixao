import React, { useState, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  Modal,
  Dimensions,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Svg, { Line, Circle, Rect, G, Text as SvgText, Polyline, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { WebView } from 'react-native-webview';
import api from '../services/api';
import { colors } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';
import { ACWREvolutionChart } from './ACWREvolutionChart';

const { width: screenWidth } = Dimensions.get('window');

interface ScientificAnalysisTabProps {
  athleteId: string;
}

// Types
interface ScientificInsights {
  athlete_id: string;
  athlete_name: string;
  analysis_date: string;
  gps_summary: any;
  acwr_analysis: any;
  wellness_summary: any;
  jump_analysis: any;
  vbt_analysis: any;
  body_composition: any;
  scientific_insights: string | null;
  overall_risk_level: string;
  injury_risk_factors: string[];
  training_recommendations: string[];
  recovery_recommendations: string[];
}

// ===== CHARTS COMPONENTS =====

// RSI Evolution Chart
const RSIEvolutionChart = ({ data, locale }: { data: any[], locale: string }) => {
  const chartWidth = Math.min(screenWidth - 64, 350);
  const chartHeight = 150;
  const padding = { top: 20, right: 15, bottom: 30, left: 40 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  
  if (!data || data.length === 0) return null;
  
  const rsiValues = data.map(d => d.rsi);
  const minRsi = Math.min(...rsiValues) * 0.9;
  const maxRsi = Math.max(...rsiValues) * 1.1;
  
  const getX = (i: number) => padding.left + (i / (data.length - 1)) * innerWidth;
  const getY = (rsi: number) => padding.top + innerHeight - ((rsi - minRsi) / (maxRsi - minRsi)) * innerHeight;
  
  const points = data.map((d, i) => `${getX(i)},${getY(d.rsi)}`).join(' ');
  
  return (
    <View style={chartStyles.container}>
      <Text style={chartStyles.title}>{locale === 'pt' ? 'Evolução do RSI' : 'RSI Evolution'}</Text>
      <Svg width={chartWidth} height={chartHeight}>
        {/* Grid lines */}
        {[0, 0.5, 1].map((ratio, i) => (
          <G key={i}>
            <Line
              x1={padding.left}
              y1={padding.top + innerHeight * ratio}
              x2={chartWidth - padding.right}
              y2={padding.top + innerHeight * ratio}
              stroke={colors.border.default}
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <SvgText
              x={padding.left - 5}
              y={padding.top + innerHeight * ratio + 4}
              textAnchor="end"
              fill={colors.text.tertiary}
              fontSize="9"
            >
              {(maxRsi - (maxRsi - minRsi) * ratio).toFixed(1)}
            </SvgText>
          </G>
        ))}
        
        {/* Line */}
        <Polyline
          points={points}
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
        />
        
        {/* Points */}
        {data.map((d, i) => (
          <Circle
            key={i}
            cx={getX(i)}
            cy={getY(d.rsi)}
            r={4}
            fill="#10b981"
          />
        ))}
        
        {/* Date labels */}
        {data.filter((_, i) => i === 0 || i === data.length - 1).map((d, i) => (
          <SvgText
            key={i}
            x={i === 0 ? padding.left : chartWidth - padding.right}
            y={chartHeight - 5}
            textAnchor={i === 0 ? "start" : "end"}
            fill={colors.text.tertiary}
            fontSize="8"
          >
            {d.date?.slice(5, 10)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
};

// Load-Velocity Chart
const LoadVelocityChart = ({ data, locale }: { data: any, locale: string }) => {
  const chartWidth = Math.min(screenWidth - 64, 350);
  const chartHeight = 160;
  const padding = { top: 20, right: 15, bottom: 35, left: 45 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  
  if (!data || !data.slope || !data.intercept) return null;
  
  const { slope, intercept, estimated_1rm_kg, optimal_load_kg, mvt } = data;
  const maxLoad = estimated_1rm_kg ? estimated_1rm_kg * 1.1 : 150;
  
  const getY = (load: number) => {
    const velocity = intercept + slope * load;
    const normalizedV = Math.max(0, Math.min(1.5, velocity));
    return padding.top + innerHeight - (normalizedV / 1.5) * innerHeight;
  };
  
  const getX = (load: number) => padding.left + (load / maxLoad) * innerWidth;
  
  const lineStart = { x: getX(0), y: getY(0) };
  const lineEnd = { x: getX(estimated_1rm_kg || maxLoad), y: getY(estimated_1rm_kg || maxLoad) };
  const mvtY = padding.top + innerHeight - (mvt / 1.5) * innerHeight;
  
  return (
    <View style={chartStyles.container}>
      <Text style={chartStyles.title}>{locale === 'pt' ? 'Perfil Carga-Velocidade' : 'Load-Velocity Profile'}</Text>
      <Svg width={chartWidth} height={chartHeight}>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
          <G key={i}>
            <Line
              x1={padding.left}
              y1={padding.top + innerHeight * ratio}
              x2={chartWidth - padding.right}
              y2={padding.top + innerHeight * ratio}
              stroke={colors.border.default}
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <SvgText
              x={padding.left - 5}
              y={padding.top + innerHeight * ratio + 4}
              textAnchor="end"
              fill={colors.text.tertiary}
              fontSize="9"
            >
              {((1 - ratio) * 1.5).toFixed(1)}
            </SvgText>
          </G>
        ))}
        
        {/* MVT Line */}
        <Line
          x1={padding.left}
          y1={mvtY}
          x2={chartWidth - padding.right}
          y2={mvtY}
          stroke="#ef4444"
          strokeWidth="1"
          strokeDasharray="6 3"
        />
        <SvgText x={chartWidth - padding.right - 5} y={mvtY - 5} textAnchor="end" fill="#ef4444" fontSize="8">
          MVT
        </SvgText>
        
        {/* L-V Line */}
        <Line
          x1={lineStart.x}
          y1={lineStart.y}
          x2={lineEnd.x}
          y2={lineEnd.y}
          stroke={colors.accent.primary}
          strokeWidth="2"
        />
        
        {/* 1RM Point */}
        {estimated_1rm_kg && (
          <G>
            <Circle cx={getX(estimated_1rm_kg)} cy={mvtY} r={6} fill="#10b981" />
            <SvgText x={getX(estimated_1rm_kg)} y={mvtY + 15} textAnchor="middle" fill="#10b981" fontSize="9" fontWeight="bold">
              1RM: {estimated_1rm_kg.toFixed(0)}kg
            </SvgText>
          </G>
        )}
        
        {/* Optimal Load */}
        {optimal_load_kg && (
          <G>
            <Circle cx={getX(optimal_load_kg)} cy={getY(optimal_load_kg)} r={6} fill="#f59e0b" />
          </G>
        )}
        
        {/* X-axis label */}
        <SvgText x={chartWidth / 2} y={chartHeight - 5} textAnchor="middle" fill={colors.text.tertiary} fontSize="9">
          {locale === 'pt' ? 'Carga (kg)' : 'Load (kg)'}
        </SvgText>
      </Svg>
      
      {/* Legend */}
      <View style={chartStyles.legend}>
        <View style={chartStyles.legendItem}>
          <View style={[chartStyles.legendDot, { backgroundColor: '#f59e0b' }]} />
          <Text style={chartStyles.legendText}>{locale === 'pt' ? 'Carga Ótima' : 'Optimal Load'}</Text>
        </View>
        <View style={chartStyles.legendItem}>
          <View style={[chartStyles.legendDot, { backgroundColor: '#10b981' }]} />
          <Text style={chartStyles.legendText}>1RM</Text>
        </View>
        <View style={chartStyles.legendItem}>
          <View style={[chartStyles.legendLine, { backgroundColor: '#ef4444' }]} />
          <Text style={chartStyles.legendText}>MVT</Text>
        </View>
      </View>
    </View>
  );
};

// Velocity Loss Chart
const VelocityLossChart = ({ data, locale }: { data: any[], locale: string }) => {
  const chartWidth = Math.min(screenWidth - 64, 350);
  const chartHeight = 140;
  const padding = { top: 20, right: 15, bottom: 25, left: 35 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  
  if (!data || data.length === 0) return null;
  
  const maxLoss = Math.max(30, Math.max(...data.map(d => d.loss_percent)) * 1.2);
  const barWidth = Math.min(30, (innerWidth / data.length) - 8);
  const barGap = (innerWidth - barWidth * data.length) / (data.length + 1);
  
  const getBarColor = (loss: number) => {
    if (loss >= 20) return '#ef4444';
    if (loss >= 10) return '#f59e0b';
    return '#10b981';
  };
  
  return (
    <View style={chartStyles.container}>
      <Text style={chartStyles.title}>{locale === 'pt' ? 'Perda de Velocidade por Série' : 'Velocity Loss by Set'}</Text>
      <Svg width={chartWidth} height={chartHeight}>
        {/* Fatigue zone line */}
        <Line
          x1={padding.left}
          y1={padding.top + innerHeight - (20 / maxLoss) * innerHeight}
          x2={chartWidth - padding.right}
          y2={padding.top + innerHeight - (20 / maxLoss) * innerHeight}
          stroke="#ef4444"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <SvgText
          x={chartWidth - padding.right - 5}
          y={padding.top + innerHeight - (20 / maxLoss) * innerHeight - 5}
          textAnchor="end"
          fill="#ef4444"
          fontSize="8"
        >
          {locale === 'pt' ? 'Zona Fadiga' : 'Fatigue Zone'}
        </SvgText>
        
        {/* Bars */}
        {data.map((d, i) => {
          const x = padding.left + barGap + i * (barWidth + barGap);
          const barHeight = Math.max((d.loss_percent / maxLoss) * innerHeight, 2);
          const y = padding.top + innerHeight - barHeight;
          
          return (
            <G key={i}>
              <Rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={getBarColor(d.loss_percent)}
                rx={4}
              />
              <SvgText x={x + barWidth / 2} y={chartHeight - 5} textAnchor="middle" fill={colors.text.secondary} fontSize="9">
                S{d.set}
              </SvgText>
              <SvgText x={x + barWidth / 2} y={y - 4} textAnchor="middle" fill={getBarColor(d.loss_percent)} fontSize="9" fontWeight="bold">
                {d.loss_percent.toFixed(0)}%
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
};

// Body Composition Donut Chart
const BodyCompositionChart = ({ data, locale }: { data: any, locale: string }) => {
  if (!data || !data.latest) return null;
  
  // Ensure values are valid numbers
  const parseNumber = (val: any): number => {
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  };
  
  const body_fat_percent = parseNumber(data.latest.body_fat_percent);
  const lean_mass_kg = parseNumber(data.latest.lean_mass_kg);
  const fat_mass_kg = parseNumber(data.latest.fat_mass_kg);
  
  const total = lean_mass_kg + fat_mass_kg;
  if (total === 0) return null;
  
  const size = 120;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fatOffset = circumference * (1 - body_fat_percent / 100);
  
  return (
    <View style={chartStyles.donutContainer}>
      <Text style={chartStyles.title}>{locale === 'pt' ? 'Composição Corporal' : 'Body Composition'}</Text>
      <View style={chartStyles.donutRow}>
        <Svg width={size} height={size}>
          {/* Background circle */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#10b981"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Fat segment */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#f59e0b"
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={fatOffset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
          {/* Center text */}
          <SvgText x={size / 2} y={size / 2 - 8} textAnchor="middle" fill={colors.text.primary} fontSize="18" fontWeight="bold">
            {body_fat_percent.toFixed(1)}%
          </SvgText>
          <SvgText x={size / 2} y={size / 2 + 10} textAnchor="middle" fill={colors.text.secondary} fontSize="10">
            {locale === 'pt' ? 'Gordura' : 'Body Fat'}
          </SvgText>
        </Svg>
        
        <View style={chartStyles.donutLegend}>
          <View style={chartStyles.donutLegendItem}>
            <View style={[chartStyles.legendDot, { backgroundColor: '#10b981' }]} />
            <View>
              <Text style={chartStyles.donutLegendValue}>{lean_mass_kg.toFixed(1)} kg</Text>
              <Text style={chartStyles.donutLegendLabel}>{locale === 'pt' ? 'Massa Magra' : 'Lean Mass'}</Text>
            </View>
          </View>
          <View style={chartStyles.donutLegendItem}>
            <View style={[chartStyles.legendDot, { backgroundColor: '#f59e0b' }]} />
            <View>
              <Text style={chartStyles.donutLegendValue}>{fat_mass_kg.toFixed(1)} kg</Text>
              <Text style={chartStyles.donutLegendLabel}>{locale === 'pt' ? 'Massa Gorda' : 'Fat Mass'}</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

// GPS Summary Chart
const GPSSummaryChart = ({ data, locale }: { data: any, locale: string }) => {
  if (!data) return null;
  
  return (
    <View style={chartStyles.summaryGrid}>
      <View style={chartStyles.summaryItem}>
        <Ionicons name="walk" size={24} color="#3b82f6" />
        <Text style={chartStyles.summaryValue}>{(data.avg_distance_m / 1000).toFixed(1)} km</Text>
        <Text style={chartStyles.summaryLabel}>{locale === 'pt' ? 'Dist. Média' : 'Avg Distance'}</Text>
      </View>
      <View style={chartStyles.summaryItem}>
        <Ionicons name="flash" size={24} color="#f59e0b" />
        <Text style={chartStyles.summaryValue}>{data.avg_high_intensity_m.toFixed(0)} m</Text>
        <Text style={chartStyles.summaryLabel}>{locale === 'pt' ? 'Alta Intens.' : 'High Intensity'}</Text>
      </View>
      <View style={chartStyles.summaryItem}>
        <Ionicons name="rocket" size={24} color="#ef4444" />
        <Text style={chartStyles.summaryValue}>{data.avg_sprints.toFixed(1)}</Text>
        <Text style={chartStyles.summaryLabel}>{locale === 'pt' ? 'Sprints/Sessão' : 'Sprints/Session'}</Text>
      </View>
      <View style={chartStyles.summaryItem}>
        <Ionicons name="speedometer" size={24} color="#10b981" />
        <Text style={chartStyles.summaryValue}>{data.max_speed_kmh.toFixed(1)}</Text>
        <Text style={chartStyles.summaryLabel}>{locale === 'pt' ? 'Vel. Máx (km/h)' : 'Max Speed (km/h)'}</Text>
      </View>
    </View>
  );
};

// Wellness Radar (simplified as bars)
const WellnessSummaryChart = ({ data, locale }: { data: any, locale: string }) => {
  if (!data || !data.latest) return null;
  
  const latest = data.latest;
  const metrics = [
    { label: locale === 'pt' ? 'Bem-estar' : 'Wellness', value: latest.wellness_score, max: 10, color: '#10b981' },
    { label: locale === 'pt' ? 'Prontidão' : 'Readiness', value: latest.readiness_score, max: 10, color: '#3b82f6' },
    { label: locale === 'pt' ? 'Sono' : 'Sleep', value: latest.sleep_quality, max: 10, color: '#8b5cf6' },
    { label: locale === 'pt' ? 'Fadiga' : 'Fatigue', value: 10 - latest.fatigue, max: 10, color: '#f59e0b' },
    { label: locale === 'pt' ? 'Humor' : 'Mood', value: latest.mood, max: 10, color: '#ec4899' },
  ];
  
  return (
    <View style={chartStyles.wellnessContainer}>
      <Text style={chartStyles.title}>{locale === 'pt' ? 'Wellness Atual' : 'Current Wellness'}</Text>
      {metrics.map((m, i) => (
        <View key={i} style={chartStyles.wellnessRow}>
          <Text style={chartStyles.wellnessLabel}>{m.label}</Text>
          <View style={chartStyles.wellnessBarBg}>
            <View style={[chartStyles.wellnessBar, { width: `${(m.value / m.max) * 100}%`, backgroundColor: m.color }]} />
          </View>
          <Text style={chartStyles.wellnessValue}>{m.value.toFixed(0)}</Text>
        </View>
      ))}
    </View>
  );
};

// ===== MAIN COMPONENT =====

export const ScientificAnalysisTab: React.FC<ScientificAnalysisTabProps> = ({ athleteId }) => {
  const { locale } = useLanguage();
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const { data: analysis, isLoading, error, refetch } = useQuery({
    queryKey: ['scientific-analysis', athleteId, locale],
    queryFn: async () => {
      const response = await api.get<ScientificInsights>(`/analysis/scientific/${athleteId}?lang=${locale}`);
      return response.data;
    },
    enabled: !!athleteId,
    staleTime: 0, // Always fetch fresh data to ensure dynamic updates
    refetchOnMount: 'always', // Refetch when component mounts
  });

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'low': return '#10b981';
      case 'moderate': return '#f59e0b';
      case 'high': return '#ef4444';
      default: return colors.text.tertiary;
    }
  };

  const getRiskLabel = (level: string) => {
    if (locale === 'pt') {
      switch (level) {
        case 'low': return 'Baixo';
        case 'moderate': return 'Moderado';
        case 'high': return 'Alto';
        default: return 'Desconhecido';
      }
    }
    return level.charAt(0).toUpperCase() + level.slice(1);
  };

  const handleExportPdf = async () => {
    try {
      const baseUrl = api.defaults.baseURL?.replace('/api', '') || '';
      const fullUrl = `${baseUrl}/api/report/scientific/${athleteId}?lang=${locale}`;
      
      if (Platform.OS === 'web') {
        window.open(fullUrl, '_blank');
      } else {
        await Linking.openURL(fullUrl);
      }
    } catch (error) {
      console.error('PDF export error:', error);
    }
  };

  // Load report HTML for preview
  const loadReportPreview = async () => {
    setLoadingReport(true);
    try {
      const response = await api.get(`/report/scientific/${athleteId}?lang=${locale}`, {
        responseType: 'text',
      });
      setReportHtml(response.data);
      setShowPdfPreview(true);
    } catch (error) {
      console.error('Error loading report preview:', error);
    } finally {
      setLoadingReport(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>
          {locale === 'pt' ? 'Gerando análise científica...' : 'Generating scientific analysis...'}
        </Text>
      </View>
    );
  }

  if (error || !analysis) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="flask-outline" size={64} color={colors.text.tertiary} />
        <Text style={styles.emptyText}>
          {locale === 'pt' ? 'Dados insuficientes para análise' : 'Insufficient data for analysis'}
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Ionicons name="refresh" size={20} color="#ffffff" />
          <Text style={styles.retryButtonText}>
            {locale === 'pt' ? 'Tentar novamente' : 'Try again'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            {locale === 'pt' ? 'Análise Científica Completa' : 'Complete Scientific Analysis'}
          </Text>
          <Text style={styles.headerSubtitle}>{analysis.analysis_date}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.pdfButton} 
            onPress={loadReportPreview}
            disabled={loadingReport}
          >
            {loadingReport ? (
              <ActivityIndicator size="small" color="#dc2626" />
            ) : (
              <Ionicons name="document-text" size={20} color="#dc2626" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Overall Risk Card */}
      <View style={[styles.riskCard, { borderColor: getRiskColor(analysis.overall_risk_level) }]}>
        <View style={styles.riskHeader}>
          <Ionicons name="shield-checkmark" size={24} color={getRiskColor(analysis.overall_risk_level)} />
          <Text style={styles.riskTitle}>
            {locale === 'pt' ? 'Risco de Lesão' : 'Injury Risk'}
          </Text>
        </View>
        <View style={[styles.riskBadge, { backgroundColor: getRiskColor(analysis.overall_risk_level) }]}>
          <Text style={styles.riskBadgeText}>{getRiskLabel(analysis.overall_risk_level)}</Text>
        </View>
        {analysis.injury_risk_factors.length > 0 && (
          <View style={styles.riskFactors}>
            <Text style={styles.riskFactorsTitle}>
              {locale === 'pt' ? 'Fatores identificados:' : 'Identified factors:'}
            </Text>
            {analysis.injury_risk_factors.map((factor, i) => (
              <View key={i} style={styles.riskFactorItem}>
                <Ionicons name="warning" size={14} color="#f59e0b" />
                <Text style={styles.riskFactorText}>{factor}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* GPS Section */}
      {analysis.gps_summary && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBox, { backgroundColor: 'rgba(59, 130, 246, 0.2)' }]}>
              <Ionicons name="location" size={22} color="#3b82f6" />
            </View>
            <View>
              <Text style={styles.cardTitle}>
                {locale === 'pt' ? 'Dados GPS' : 'GPS Data'}
              </Text>
              <Text style={styles.cardSubtitle}>
                {locale === 'pt' 
                  ? `${analysis.gps_summary.sessions_count} sessões analisadas`
                  : `${analysis.gps_summary.sessions_count} sessions analyzed`}
              </Text>
            </View>
          </View>
          <GPSSummaryChart data={analysis.gps_summary} locale={locale} />
        </View>
      )}

      {/* ACWR Section */}
      {analysis.acwr_analysis && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBox, { backgroundColor: 'rgba(139, 92, 246, 0.2)' }]}>
              <Ionicons name="trending-up" size={22} color="#8b5cf6" />
            </View>
            <View>
              <Text style={styles.cardTitle}>ACWR</Text>
              <Text style={styles.cardSubtitle}>Acute:Chronic Workload Ratio</Text>
            </View>
          </View>
          <View style={[styles.acwrRisk, { borderColor: getRiskColor(analysis.acwr_analysis.overall_risk) }]}>
            <Text style={styles.acwrRiskLabel}>
              {locale === 'pt' ? 'Risco ACWR:' : 'ACWR Risk:'}
            </Text>
            <View style={[styles.acwrBadge, { backgroundColor: getRiskColor(analysis.acwr_analysis.overall_risk) }]}>
              <Text style={styles.acwrBadgeText}>{getRiskLabel(analysis.acwr_analysis.overall_risk)}</Text>
            </View>
          </View>
          <ACWREvolutionChart athleteId={athleteId} />
        </View>
      )}

      {/* Wellness Section */}
      {analysis.wellness_summary && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBox, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
              <Ionicons name="heart" size={22} color="#10b981" />
            </View>
            <View>
              <Text style={styles.cardTitle}>Wellness</Text>
              <Text style={styles.cardSubtitle}>
                {locale === 'pt' ? 'Estado de recuperação' : 'Recovery state'}
              </Text>
            </View>
          </View>
          <WellnessSummaryChart data={analysis.wellness_summary} locale={locale} />
        </View>
      )}

      {/* Jump Assessment Section */}
      {analysis.jump_analysis && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBox, { backgroundColor: 'rgba(245, 158, 11, 0.2)' }]}>
              <Ionicons name="arrow-up" size={22} color="#f59e0b" />
            </View>
            <View>
              <Text style={styles.cardTitle}>
                {locale === 'pt' ? 'Avaliação de Salto' : 'Jump Assessment'}
              </Text>
              <Text style={styles.cardSubtitle}>
                RSI, CMJ, {locale === 'pt' ? 'Índice de Fadiga' : 'Fatigue Index'}
              </Text>
            </View>
          </View>
          
          {/* Jump metrics */}
          <View style={styles.jumpMetrics}>
            <View style={styles.jumpMetricItem}>
              <Text style={styles.jumpMetricValue}>{analysis.jump_analysis.latest?.rsi?.toFixed(2) || '-'}</Text>
              <Text style={styles.jumpMetricLabel}>RSI</Text>
            </View>
            <View style={styles.jumpMetricItem}>
              <Text style={styles.jumpMetricValue}>{analysis.jump_analysis.latest?.jump_height_cm?.toFixed(1) || '-'}</Text>
              <Text style={styles.jumpMetricLabel}>cm</Text>
            </View>
            <View style={styles.jumpMetricItem}>
              <Text style={styles.jumpMetricValue}>{analysis.jump_analysis.latest?.peak_power_w?.toFixed(0) || '-'}</Text>
              <Text style={styles.jumpMetricLabel}>W</Text>
            </View>
            <View style={styles.jumpMetricItem}>
              <Text style={[
                styles.jumpMetricValue, 
                { color: analysis.jump_analysis.latest?.fatigue_status === 'red' ? '#ef4444' : 
                         analysis.jump_analysis.latest?.fatigue_status === 'yellow' ? '#f59e0b' : '#10b981' }
              ]}>
                {analysis.jump_analysis.historical?.z_score?.toFixed(2) || '-'}
              </Text>
              <Text style={styles.jumpMetricLabel}>Z-Score</Text>
            </View>
          </View>
          
          {/* RSI Evolution */}
          {analysis.jump_analysis.history && analysis.jump_analysis.history.length > 1 && (
            <RSIEvolutionChart data={analysis.jump_analysis.history} locale={locale} />
          )}
          
          {/* Fatigue Alert */}
          {analysis.jump_analysis.fatigue_alert && (
            <View style={styles.fatigueAlert}>
              <Ionicons name="warning" size={18} color="#ef4444" />
              <Text style={styles.fatigueAlertText}>
                {locale === 'pt' 
                  ? `RSI ${analysis.jump_analysis.historical?.rsi_variation_percent?.toFixed(1)}% abaixo do baseline - Fadiga neuromuscular detectada`
                  : `RSI ${analysis.jump_analysis.historical?.rsi_variation_percent?.toFixed(1)}% below baseline - Neuromuscular fatigue detected`}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* VBT Section */}
      {analysis.vbt_analysis && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBox, { backgroundColor: 'rgba(236, 72, 153, 0.2)' }]}>
              <Ionicons name="speedometer" size={22} color="#ec4899" />
            </View>
            <View>
              <Text style={styles.cardTitle}>VBT</Text>
              <Text style={styles.cardSubtitle}>
                {locale === 'pt' ? 'Perfil Carga-Velocidade' : 'Load-Velocity Profile'}
              </Text>
            </View>
          </View>
          
          {/* VBT Summary */}
          <View style={styles.vbtSummary}>
            <View style={styles.vbtSummaryItem}>
              <Text style={styles.vbtSummaryValue}>
                {analysis.vbt_analysis.load_velocity_profile?.estimated_1rm_kg?.toFixed(0) || '-'} kg
              </Text>
              <Text style={styles.vbtSummaryLabel}>1RM Est.</Text>
            </View>
            <View style={styles.vbtSummaryItem}>
              <Text style={styles.vbtSummaryValue}>
                {analysis.vbt_analysis.load_velocity_profile?.optimal_load_kg?.toFixed(0) || '-'} kg
              </Text>
              <Text style={styles.vbtSummaryLabel}>{locale === 'pt' ? 'Carga Ótima' : 'Optimal'}</Text>
            </View>
            <View style={styles.vbtSummaryItem}>
              <Text style={styles.vbtSummaryValue}>
                {analysis.vbt_analysis.latest_session?.avg_velocity?.toFixed(2) || '-'} m/s
              </Text>
              <Text style={styles.vbtSummaryLabel}>{locale === 'pt' ? 'Vel. Média' : 'Avg Vel.'}</Text>
            </View>
          </View>
          
          {/* Load-Velocity Chart */}
          <LoadVelocityChart data={analysis.vbt_analysis.load_velocity_profile} locale={locale} />
          
          {/* Velocity Loss */}
          {analysis.vbt_analysis.velocity_loss_analysis && analysis.vbt_analysis.velocity_loss_analysis.length > 0 && (
            <VelocityLossChart data={analysis.vbt_analysis.velocity_loss_analysis} locale={locale} />
          )}
          
          {/* Peripheral Fatigue Alert */}
          {analysis.vbt_analysis.fatigue_detected && (
            <View style={styles.fatigueAlert}>
              <Ionicons name="alert-circle" size={18} color="#f59e0b" />
              <Text style={styles.fatigueAlertText}>
                {locale === 'pt' 
                  ? 'Perda de velocidade ≥20% detectada - Fadiga periférica'
                  : 'Velocity loss ≥20% detected - Peripheral fatigue'}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Body Composition Section */}
      {analysis.body_composition && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBox, { backgroundColor: 'rgba(99, 102, 241, 0.2)' }]}>
              <Ionicons name="body" size={22} color="#6366f1" />
            </View>
            <View>
              <Text style={styles.cardTitle}>
                {locale === 'pt' ? 'Composição Corporal' : 'Body Composition'}
              </Text>
              <Text style={styles.cardSubtitle}>
                {analysis.body_composition.latest?.protocol || ''}
              </Text>
            </View>
          </View>
          <BodyCompositionChart data={analysis.body_composition} locale={locale} />
        </View>
      )}

      {/* AI Scientific Insights */}
      {analysis.scientific_insights && (
        <View style={styles.insightsCard}>
          <LinearGradient 
            colors={['rgba(139, 92, 246, 0.15)', 'rgba(59, 130, 246, 0.1)']} 
            style={styles.insightsGradient}
          >
            <View style={styles.insightsHeader}>
              <Ionicons name="flask" size={24} color={colors.accent.primary} />
              <Text style={styles.insightsTitle}>
                {locale === 'pt' ? 'Insights Científicos (IA)' : 'Scientific Insights (AI)'}
              </Text>
            </View>
            <Text style={styles.insightsText}>{analysis.scientific_insights}</Text>
          </LinearGradient>
        </View>
      )}

      {/* PDF Preview Modal - Shows full report with charts */}
      <Modal
        visible={showPdfPreview}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPdfPreview(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentFull}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {locale === 'pt' ? 'Preview do Relatório' : 'Report Preview'}
              </Text>
              <TouchableOpacity onPress={() => setShowPdfPreview(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            
            {/* Render HTML report with charts */}
            {reportHtml ? (
              Platform.OS === 'web' ? (
                <iframe
                  srcDoc={reportHtml}
                  style={{
                    flex: 1,
                    width: '100%',
                    border: 'none',
                    borderRadius: 8,
                    backgroundColor: '#0f172a',
                  }}
                />
              ) : (
                <WebView
                  source={{ html: reportHtml }}
                  style={styles.webView}
                  startInLoadingState={true}
                  renderLoading={() => (
                    <View style={styles.webViewLoading}>
                      <ActivityIndicator size="large" color={colors.accent.primary} />
                      <Text style={styles.loadingText}>
                        {locale === 'pt' ? 'Carregando relatório...' : 'Loading report...'}
                      </Text>
                    </View>
                  )}
                />
              )
            ) : (
              <View style={styles.webViewLoading}>
                <ActivityIndicator size="large" color={colors.accent.primary} />
                <Text style={styles.loadingText}>
                  {locale === 'pt' ? 'Carregando relatório...' : 'Loading report...'}
                </Text>
              </View>
            )}
            
            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.modalCancelButton}
                onPress={() => setShowPdfPreview(false)}
              >
                <Text style={styles.modalCancelText}>
                  {locale === 'pt' ? 'Fechar' : 'Close'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.modalPrintButton}
                onPress={() => {
                  setShowPdfPreview(false);
                  handleExportPdf();
                }}
              >
                <Ionicons name="print" size={20} color="#ffffff" />
                <Text style={styles.modalPrintText}>
                  {locale === 'pt' ? 'Abrir para Imprimir' : 'Open to Print'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

// Chart styles
const chartStyles = StyleSheet.create({
  container: {
    marginTop: 12,
    alignItems: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 8,
    alignSelf: 'flex-start',
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
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLine: {
    width: 12,
    height: 2,
  },
  legendText: {
    fontSize: 10,
    color: colors.text.secondary,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryItem: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: 4,
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 2,
  },
  donutContainer: {
    alignItems: 'center',
  },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  donutLegend: {
    gap: 12,
  },
  donutLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  donutLegendValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  donutLegendLabel: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  wellnessContainer: {
    width: '100%',
  },
  wellnessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  wellnessLabel: {
    width: 80,
    fontSize: 12,
    color: colors.text.secondary,
  },
  wellnessBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    marginHorizontal: 8,
  },
  wellnessBar: {
    height: '100%',
    borderRadius: 4,
  },
  wellnessValue: {
    width: 25,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'right',
  },
});

// Main styles
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
    fontSize: 16,
    color: colors.text.secondary,
    marginTop: 16,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
    gap: 8,
  },
  retryButtonText: {
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
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  pdfButton: {
    padding: 8,
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    borderRadius: 8,
    minWidth: 36,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  riskCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
  },
  riskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  riskTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  riskBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  riskBadgeText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  riskFactors: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
  },
  riskFactorsTitle: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 8,
  },
  riskFactorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  riskFactorText: {
    fontSize: 12,
    color: colors.text.secondary,
    flex: 1,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
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
  acwrRisk: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  acwrRiskLabel: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  acwrBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  acwrBadgeText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12,
  },
  jumpMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  jumpMetricItem: {
    alignItems: 'center',
  },
  jumpMetricValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  jumpMetricLabel: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 2,
  },
  fatigueAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  fatigueAlertText: {
    fontSize: 12,
    color: '#ef4444',
    flex: 1,
  },
  vbtSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  vbtSummaryItem: {
    alignItems: 'center',
  },
  vbtSummaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  vbtSummaryLabel: {
    fontSize: 10,
    color: colors.text.secondary,
    marginTop: 2,
  },
  insightsCard: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  insightsGradient: {
    padding: 16,
  },
  insightsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  insightsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  insightsText: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.dark.secondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalContentFull: {
    backgroundColor: colors.dark.secondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '90%',
    display: 'flex',
    flexDirection: 'column',
  },
  webView: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  webViewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.dark.secondary,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  previewScroll: {
    padding: 16,
    maxHeight: 400,
  },
  previewSection: {
    marginBottom: 16,
  },
  previewSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 8,
  },
  previewText: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  previewItem: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginLeft: 8,
    marginTop: 4,
  },
  previewInsights: {
    fontSize: 11,
    color: colors.text.tertiary,
    lineHeight: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: 'center',
  },
  modalCancelText: {
    color: colors.text.secondary,
    fontWeight: '600',
  },
  modalPrintButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  modalPrintText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});

export default ScientificAnalysisTab;
