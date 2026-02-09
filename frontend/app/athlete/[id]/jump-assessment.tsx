import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line, Circle, Rect, G, Text as SvgText, Path, Polyline } from 'react-native-svg';
import api from '../../../services/api';
import { colors } from '../../../constants/theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import { format } from 'date-fns';

const { width: screenWidth } = Dimensions.get('window');

// Jump Protocol Types
type JumpProtocol = 'cmj' | 'sl_cmj_right' | 'sl_cmj_left' | 'dj';

interface JumpProtocolInfo {
  id: string;
  name: string;
  full_name: string;
  description: string;
  required_fields: string[];
  optional_fields: string[];
  icon: string;
}

interface JumpAnalysis {
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
    dj?: {
      latest: {
        date: string;
        box_height_cm: number;
        jump_height_cm: number;
        contact_time_ms: number;
        rsi: number;
        rsi_modified: number;
      };
      history: Array<{ date: string; rsi: number; box_height_cm: number }>;
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
  ai_feedback?: string;
  recommendations: string[];
}

// RSI Gauge Component
const RSIGauge = ({ rsi, classification, locale }: { rsi: number; classification: string; locale: string }) => {
  const chartWidth = Math.min(screenWidth - 64, 300);
  const chartHeight = 120;
  
  const getClassificationColor = (cls: string) => {
    switch (cls) {
      case 'excellent': return '#22c55e';
      case 'very_good': return '#10b981';
      case 'good': return '#84cc16';
      case 'average': return '#f59e0b';
      case 'below_average': return '#f97316';
      case 'poor': return '#ef4444';
      default: return colors.text.secondary;
    }
  };
  
  const getClassificationLabel = (cls: string) => {
    const labels: Record<string, { pt: string; en: string }> = {
      excellent: { pt: 'Excelente', en: 'Excellent' },
      very_good: { pt: 'Muito Bom', en: 'Very Good' },
      good: { pt: 'Bom', en: 'Good' },
      average: { pt: 'Médio', en: 'Average' },
      below_average: { pt: 'Abaixo da Média', en: 'Below Average' },
      poor: { pt: 'Fraco', en: 'Poor' },
    };
    return labels[cls]?.[locale === 'pt' ? 'pt' : 'en'] || cls;
  };
  
  // RSI scale: 0 to 3.5
  const maxRSI = 3.5;
  const normalizedRSI = Math.min(rsi / maxRSI, 1);
  const color = getClassificationColor(classification);
  
  return (
    <View style={styles.gaugeContainer}>
      <Text style={styles.gaugeTitle}>RSI</Text>
      <Svg width={chartWidth} height={chartHeight}>
        {/* Background arc */}
        <Path
          d={`M 30 90 A 110 110 0 0 1 ${chartWidth - 30} 90`}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="20"
          fill="none"
          strokeLinecap="round"
        />
        {/* Value arc */}
        <Path
          d={`M 30 90 A 110 110 0 0 1 ${30 + (chartWidth - 60) * normalizedRSI} ${90 - Math.sin(Math.PI * normalizedRSI) * 60}`}
          stroke={color}
          strokeWidth="20"
          fill="none"
          strokeLinecap="round"
        />
        {/* Reference markers */}
        {[1.0, 1.5, 2.0, 2.5, 2.8].map((ref, i) => {
          const pos = ref / maxRSI;
          const x = 30 + (chartWidth - 60) * pos;
          const y = 90 - Math.sin(Math.PI * pos) * 60;
          return (
            <G key={i}>
              <Circle cx={x} cy={y} r="3" fill="rgba(255,255,255,0.3)" />
              <SvgText x={x} y={y - 10} textAnchor="middle" fill={colors.text.tertiary} fontSize="8">
                {ref}
              </SvgText>
            </G>
          );
        })}
        {/* Center value */}
        <SvgText x={chartWidth / 2} y={75} textAnchor="middle" fill={color} fontSize="32" fontWeight="bold">
          {rsi.toFixed(2)}
        </SvgText>
        <SvgText x={chartWidth / 2} y={100} textAnchor="middle" fill={color} fontSize="12" fontWeight="600">
          {getClassificationLabel(classification)}
        </SvgText>
      </Svg>
    </View>
  );
};

// Fatigue Status Card
const FatigueStatusCard = ({ fatigue, locale }: { fatigue: JumpAnalysis['fatigue_analysis']; locale: string }) => {
  if (!fatigue) return null;
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'green': return 'checkmark-circle';
      case 'yellow': return 'alert-circle';
      case 'red': return 'warning';
      default: return 'help-circle';
    }
  };
  
  return (
    <View style={[styles.fatigueCard, { borderColor: fatigue.color }]}>
      <View style={styles.fatigueHeader}>
        <Ionicons name={getStatusIcon(fatigue.status) as any} size={28} color={fatigue.color} />
        <View style={styles.fatigueHeaderText}>
          <Text style={styles.fatigueTitle}>
            {locale === 'pt' ? 'Índice de Fadiga (SNC)' : 'Fatigue Index (CNS)'}
          </Text>
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
      
      <View style={styles.fatigueMetrics}>
        <View style={styles.fatigueMetric}>
          <Text style={styles.fatigueMetricLabel}>
            {locale === 'pt' ? 'RSI Baseline' : 'Baseline RSI'}
          </Text>
          <Text style={styles.fatigueMetricValue}>{fatigue.baseline_rsi.toFixed(2)}</Text>
        </View>
        <View style={styles.fatigueMetricDivider} />
        <View style={styles.fatigueMetric}>
          <Text style={styles.fatigueMetricLabel}>
            {locale === 'pt' ? 'RSI Atual' : 'Current RSI'}
          </Text>
          <Text style={[styles.fatigueMetricValue, { color: fatigue.color }]}>
            {fatigue.current_rsi.toFixed(2)}
          </Text>
        </View>
      </View>
      
      <Text style={styles.fatigueInterpretation}>{fatigue.interpretation}</Text>
      
      {/* Reference Scale */}
      <View style={styles.fatigueScale}>
        <View style={[styles.fatigueScaleItem, { backgroundColor: '#10b98120' }]}>
          <Text style={[styles.fatigueScaleLabel, { color: '#10b981' }]}>0 a -5%</Text>
          <Text style={styles.fatigueScaleText}>Normal</Text>
        </View>
        <View style={[styles.fatigueScaleItem, { backgroundColor: '#f59e0b20' }]}>
          <Text style={[styles.fatigueScaleLabel, { color: '#f59e0b' }]}>-6 a -12%</Text>
          <Text style={styles.fatigueScaleText}>{locale === 'pt' ? 'Monitorar' : 'Monitor'}</Text>
        </View>
        <View style={[styles.fatigueScaleItem, { backgroundColor: '#ef444420' }]}>
          <Text style={[styles.fatigueScaleLabel, { color: '#ef4444' }]}>&lt;-13%</Text>
          <Text style={styles.fatigueScaleText}>{locale === 'pt' ? 'Alto Risco' : 'High Risk'}</Text>
        </View>
      </View>
    </View>
  );
};

// Asymmetry Card
const AsymmetryCard = ({ asymmetry, locale }: { asymmetry: JumpAnalysis['asymmetry']; locale: string }) => {
  if (!asymmetry) return null;
  
  const getDominantLegLabel = (leg: string) => {
    if (leg === 'right') return locale === 'pt' ? 'Direita' : 'Right';
    if (leg === 'left') return locale === 'pt' ? 'Esquerda' : 'Left';
    return locale === 'pt' ? 'Igual' : 'Equal';
  };
  
  return (
    <View style={[styles.asymmetryCard, asymmetry.red_flag && styles.asymmetryCardRedFlag]}>
      <View style={styles.asymmetryHeader}>
        <Ionicons 
          name={asymmetry.red_flag ? 'flag' : 'swap-horizontal'} 
          size={24} 
          color={asymmetry.red_flag ? '#ef4444' : colors.accent.primary} 
        />
        <Text style={styles.asymmetryTitle}>
          {locale === 'pt' ? 'Assimetria de Membros' : 'Limb Asymmetry'}
        </Text>
        {asymmetry.red_flag && (
          <View style={styles.redFlagBadge}>
            <Text style={styles.redFlagText}>RED FLAG</Text>
          </View>
        )}
      </View>
      
      <View style={styles.asymmetryBars}>
        {/* RSI Asymmetry */}
        <View style={styles.asymmetryBarContainer}>
          <Text style={styles.asymmetryBarLabel}>RSI</Text>
          <View style={styles.asymmetryBarWrapper}>
            <View style={[styles.asymmetryBar, { width: '50%', backgroundColor: '#3b82f6' }]} />
            <View style={[styles.asymmetryBar, { width: '50%', backgroundColor: '#8b5cf6' }]} />
            <View style={[styles.asymmetryIndicator, { left: `${50 - asymmetry.rsi.asymmetry_percent / 2}%` }]} />
          </View>
          <View style={styles.asymmetryLabels}>
            <Text style={styles.asymmetryLegLabel}>{locale === 'pt' ? 'Esq' : 'Left'}</Text>
            <Text style={[
              styles.asymmetryPercent, 
              { color: asymmetry.rsi.red_flag ? '#ef4444' : colors.text.primary }
            ]}>
              {asymmetry.rsi.asymmetry_percent.toFixed(1)}%
            </Text>
            <Text style={styles.asymmetryLegLabel}>{locale === 'pt' ? 'Dir' : 'Right'}</Text>
          </View>
        </View>
        
        {/* Jump Height Asymmetry */}
        <View style={styles.asymmetryBarContainer}>
          <Text style={styles.asymmetryBarLabel}>{locale === 'pt' ? 'Altura' : 'Height'}</Text>
          <View style={styles.asymmetryBarWrapper}>
            <View style={[styles.asymmetryBar, { width: '50%', backgroundColor: '#3b82f6' }]} />
            <View style={[styles.asymmetryBar, { width: '50%', backgroundColor: '#8b5cf6' }]} />
            <View style={[styles.asymmetryIndicator, { left: `${50 - asymmetry.jump_height.asymmetry_percent / 2}%` }]} />
          </View>
          <View style={styles.asymmetryLabels}>
            <Text style={styles.asymmetryLegLabel}>{locale === 'pt' ? 'Esq' : 'Left'}</Text>
            <Text style={[
              styles.asymmetryPercent, 
              { color: asymmetry.jump_height.red_flag ? '#ef4444' : colors.text.primary }
            ]}>
              {asymmetry.jump_height.asymmetry_percent.toFixed(1)}%
            </Text>
            <Text style={styles.asymmetryLegLabel}>{locale === 'pt' ? 'Dir' : 'Right'}</Text>
          </View>
        </View>
      </View>
      
      <Text style={styles.asymmetryInterpretation}>{asymmetry.interpretation}</Text>
      
      <View style={styles.asymmetryThreshold}>
        <Ionicons name="information-circle" size={14} color={colors.text.tertiary} />
        <Text style={styles.asymmetryThresholdText}>
          {locale === 'pt' 
            ? 'Diferença >10% é considerada RED FLAG para risco de lesão'
            : 'Difference >10% is considered RED FLAG for injury risk'}
        </Text>
      </View>
    </View>
  );
};

// Power-Velocity Profile Card
const PowerVelocityCard = ({ data, locale }: { data: JumpAnalysis['power_velocity_insights']; locale: string }) => {
  if (!data) return null;
  
  return (
    <View style={styles.pvCard}>
      <View style={styles.pvHeader}>
        <Ionicons name="flash" size={24} color="#f59e0b" />
        <Text style={styles.pvTitle}>
          {locale === 'pt' ? 'Perfil Potência-Velocidade' : 'Power-Velocity Profile'}
        </Text>
      </View>
      
      <View style={styles.pvMetrics}>
        <View style={styles.pvMetric}>
          <Text style={styles.pvMetricValue}>{data.peak_power_w.toFixed(0)}</Text>
          <Text style={styles.pvMetricLabel}>
            {locale === 'pt' ? 'Pico Potência (W)' : 'Peak Power (W)'}
          </Text>
        </View>
        <View style={styles.pvMetric}>
          <Text style={styles.pvMetricValue}>{data.peak_velocity_ms.toFixed(2)}</Text>
          <Text style={styles.pvMetricLabel}>
            {locale === 'pt' ? 'Pico Velocidade (m/s)' : 'Peak Velocity (m/s)'}
          </Text>
        </View>
        <View style={styles.pvMetric}>
          <Text style={styles.pvMetricValue}>{data.relative_power_wkg.toFixed(1)}</Text>
          <Text style={styles.pvMetricLabel}>
            {locale === 'pt' ? 'Potência Relativa (W/kg)' : 'Relative Power (W/kg)'}
          </Text>
        </View>
      </View>
      
      <View style={[styles.pvProfile, { backgroundColor: data.profile.color + '20', borderColor: data.profile.color }]}>
        <Text style={[styles.pvProfileLabel, { color: data.profile.color }]}>{data.profile.label}</Text>
        <Text style={styles.pvProfileRec}>{data.profile.recommendation}</Text>
      </View>
    </View>
  );
};

// Z-Score Card
const ZScoreCard = ({ data, locale }: { data: JumpAnalysis['z_score']; locale: string }) => {
  if (!data) return null;
  
  const getZScoreColor = (z: number) => {
    if (z >= 1.5) return '#22c55e';
    if (z >= 0.5) return '#10b981';
    if (z >= -0.5) return '#f59e0b';
    if (z >= -1.5) return '#f97316';
    return '#ef4444';
  };
  
  const color = getZScoreColor(data.jump_height);
  
  return (
    <View style={styles.zScoreCard}>
      <View style={styles.zScoreHeader}>
        <Ionicons name="stats-chart" size={20} color={colors.accent.primary} />
        <Text style={styles.zScoreTitle}>Z-Score ({locale === 'pt' ? 'vs Média Histórica' : 'vs Historical Average'})</Text>
      </View>
      
      <View style={styles.zScoreContent}>
        <Text style={[styles.zScoreValue, { color }]}>
          {data.jump_height > 0 ? '+' : ''}{data.jump_height.toFixed(2)}
        </Text>
        <Text style={styles.zScoreInterpretation}>{data.interpretation}</Text>
      </View>
      
      <View style={styles.zScoreScale}>
        <View style={[styles.zScaleItem, { backgroundColor: '#ef4444' }]} />
        <View style={[styles.zScaleItem, { backgroundColor: '#f97316' }]} />
        <View style={[styles.zScaleItem, { backgroundColor: '#f59e0b' }]} />
        <View style={[styles.zScaleItem, { backgroundColor: '#10b981' }]} />
        <View style={[styles.zScaleItem, { backgroundColor: '#22c55e' }]} />
      </View>
      <View style={styles.zScoreLabels}>
        <Text style={styles.zScoreLabel}>-2</Text>
        <Text style={styles.zScoreLabel}>-1</Text>
        <Text style={styles.zScoreLabel}>0</Text>
        <Text style={styles.zScoreLabel}>+1</Text>
        <Text style={styles.zScoreLabel}>+2</Text>
      </View>
    </View>
  );
};

// RSI History Chart
const RSIHistoryChart = ({ history, locale }: { history: Array<{ date: string; rsi: number }>; locale: string }) => {
  if (!history || history.length < 2) return null;
  
  const chartWidth = Math.min(screenWidth - 64, 400);
  const chartHeight = 150;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  
  const rsiValues = history.map(h => h.rsi);
  const maxRSI = Math.max(...rsiValues) * 1.1;
  const minRSI = Math.min(...rsiValues) * 0.9;
  
  const getX = (index: number) => padding.left + (index / (history.length - 1)) * innerWidth;
  const getY = (rsi: number) => padding.top + innerHeight - ((rsi - minRSI) / (maxRSI - minRSI)) * innerHeight;
  
  const linePath = history.map((h, i) => `${getX(i)},${getY(h.rsi)}`).join(' ');
  
  return (
    <View style={styles.historyChart}>
      <Text style={styles.historyChartTitle}>
        {locale === 'pt' ? 'Evolução do RSI' : 'RSI Evolution'}
      </Text>
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
              {(minRSI + (maxRSI - minRSI) * (1 - ratio)).toFixed(1)}
            </SvgText>
          </G>
        ))}
        
        {/* Line */}
        <Polyline
          points={linePath}
          fill="none"
          stroke={colors.accent.primary}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Data points */}
        {history.map((h, i) => (
          <Circle
            key={i}
            cx={getX(i)}
            cy={getY(h.rsi)}
            r={i === 0 ? 6 : 4}
            fill={i === 0 ? colors.accent.primary : 'rgba(99, 102, 241, 0.6)'}
            stroke="#ffffff"
            strokeWidth={i === 0 ? 2 : 1}
          />
        ))}
        
        {/* Date labels */}
        {[0, Math.floor(history.length / 2), history.length - 1].map((idx) => (
          <SvgText
            key={idx}
            x={getX(idx)}
            y={chartHeight - 8}
            textAnchor="middle"
            fill={colors.text.tertiary}
            fontSize="8"
          >
            {history[idx].date.substring(5)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
};

export default function JumpAssessment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { locale } = useLanguage();
  
  // State
  const [showProtocolModal, setShowProtocolModal] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState<JumpProtocol>('cmj');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [flightTime, setFlightTime] = useState('');
  const [contactTime, setContactTime] = useState('');
  const [jumpHeight, setJumpHeight] = useState('');
  const [boxHeight, setBoxHeight] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Fetch protocols
  const { data: protocols } = useQuery<Record<string, JumpProtocolInfo>>({
    queryKey: ['jump-protocols', locale],
    queryFn: async () => {
      const res = await api.get(`/jump/protocols?lang=${locale}`);
      return res.data;
    },
  });
  
  // Fetch analysis
  const { data: analysis, isLoading: analysisLoading, refetch: refetchAnalysis } = useQuery<JumpAnalysis>({
    queryKey: ['jump-analysis', id, locale],
    queryFn: async () => {
      const res = await api.get(`/jump/analysis/${id}?lang=${locale}`);
      return res.data;
    },
    retry: false,
  });
  
  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/jump/assessment', data);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['jump-analysis', id] });
      queryClient.invalidateQueries({ queryKey: ['jump-assessments', id] });
      
      Alert.alert(
        locale === 'pt' ? 'Avaliação Salva!' : 'Assessment Saved!',
        locale === 'pt' 
          ? `RSI: ${data.calculations.rsi}\nPico Potência: ${data.calculations.peak_power_w}W\nPico Velocidade: ${data.calculations.peak_velocity_ms} m/s`
          : `RSI: ${data.calculations.rsi}\nPeak Power: ${data.calculations.peak_power_w}W\nPeak Velocity: ${data.calculations.peak_velocity_ms} m/s`,
        [{ text: 'OK' }]
      );
      
      // Reset form
      setFlightTime('');
      setContactTime('');
      setJumpHeight('');
      setBoxHeight('');
      setNotes('');
    },
    onError: (error: any) => {
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        error.response?.data?.detail || (locale === 'pt' ? 'Erro ao salvar avaliação' : 'Error saving assessment')
      );
    },
  });
  
  const handleSubmit = () => {
    if (!flightTime || !contactTime) {
      Alert.alert(
        locale === 'pt' ? 'Dados Incompletos' : 'Incomplete Data',
        locale === 'pt' 
          ? 'Preencha o Tempo de Voo e Tempo de Contato'
          : 'Fill in Flight Time and Contact Time'
      );
      return;
    }
    
    if (selectedProtocol === 'dj' && !boxHeight) {
      Alert.alert(
        locale === 'pt' ? 'Altura da Caixa' : 'Box Height',
        locale === 'pt' 
          ? 'Para Drop Jump, informe a altura da caixa'
          : 'For Drop Jump, enter the box height'
      );
      return;
    }
    
    submitMutation.mutate({
      athlete_id: id,
      date,
      protocol: selectedProtocol,
      flight_time_ms: parseFloat(flightTime.replace(',', '.')),
      contact_time_ms: parseFloat(contactTime.replace(',', '.')),
      jump_height_cm: jumpHeight ? parseFloat(jumpHeight.replace(',', '.')) : null,
      box_height_cm: boxHeight ? parseFloat(boxHeight.replace(',', '.')) : null,
      notes: notes || null,
    });
  };
  
  const t = {
    title: locale === 'pt' ? 'Avaliação de Salto' : 'Jump Assessment',
    selectProtocol: locale === 'pt' ? 'Selecionar Protocolo' : 'Select Protocol',
    date: locale === 'pt' ? 'Data' : 'Date',
    flightTime: locale === 'pt' ? 'Tempo de Voo (ms)' : 'Flight Time (ms)',
    contactTime: locale === 'pt' ? 'Tempo de Contato (ms)' : 'Contact Time (ms)',
    jumpHeight: locale === 'pt' ? 'Altura do Salto (cm)' : 'Jump Height (cm)',
    jumpHeightOptional: locale === 'pt' ? 'Opcional - calculado automaticamente' : 'Optional - auto-calculated',
    boxHeight: locale === 'pt' ? 'Altura da Caixa (cm)' : 'Box Height (cm)',
    notes: locale === 'pt' ? 'Observações' : 'Notes',
    save: locale === 'pt' ? 'Salvar Avaliação' : 'Save Assessment',
    noData: locale === 'pt' ? 'Nenhuma avaliação de salto registrada' : 'No jump assessment recorded',
    addFirst: locale === 'pt' ? 'Adicione a primeira avaliação acima' : 'Add the first assessment above',
    analysis: locale === 'pt' ? 'Análise Completa' : 'Complete Analysis',
    recommendations: locale === 'pt' ? 'Recomendações' : 'Recommendations',
    aiInsights: locale === 'pt' ? 'Insights de IA' : 'AI Insights',
  };
  
  const currentProtocol = protocols?.[selectedProtocol];
  
  return (
    <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} data-testid="back-button">
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>{t.title}</Text>
          <View style={{ width: 40 }} />
        </View>
        
        {/* Protocol Selector */}
        <TouchableOpacity 
          style={styles.protocolSelector}
          onPress={() => setShowProtocolModal(true)}
          data-testid="protocol-selector"
        >
          <View style={styles.protocolSelectorContent}>
            <View style={styles.protocolIcon}>
              <Ionicons name={(currentProtocol?.icon || 'trending-up') as any} size={24} color="#ffffff" />
            </View>
            <View>
              <Text style={styles.protocolName}>{currentProtocol?.name || 'CMJ'}</Text>
              <Text style={styles.protocolFullName}>{currentProtocol?.full_name}</Text>
            </View>
          </View>
          <Ionicons name="chevron-down" size={24} color={colors.text.secondary} />
        </TouchableOpacity>
        
        {/* Input Form */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>
            {locale === 'pt' ? 'Dados do Salto' : 'Jump Data'}
          </Text>
          
          {/* Date */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t.date}</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.text.tertiary}
            />
          </View>
          
          {/* Flight Time & Contact Time */}
          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>{t.flightTime}</Text>
              <TextInput
                style={styles.input}
                value={flightTime}
                onChangeText={setFlightTime}
                placeholder="450"
                placeholderTextColor={colors.text.tertiary}
                keyboardType="decimal-pad"
                data-testid="flight-time-input"
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
              <Text style={styles.label}>{t.contactTime}</Text>
              <TextInput
                style={styles.input}
                value={contactTime}
                onChangeText={setContactTime}
                placeholder="250"
                placeholderTextColor={colors.text.tertiary}
                keyboardType="decimal-pad"
                data-testid="contact-time-input"
              />
            </View>
          </View>
          
          {/* Jump Height (optional) */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t.jumpHeight}</Text>
            <TextInput
              style={styles.input}
              value={jumpHeight}
              onChangeText={setJumpHeight}
              placeholder={t.jumpHeightOptional}
              placeholderTextColor={colors.text.tertiary}
              keyboardType="decimal-pad"
            />
          </View>
          
          {/* Box Height (for DJ only) */}
          {selectedProtocol === 'dj' && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t.boxHeight}</Text>
              <TextInput
                style={styles.input}
                value={boxHeight}
                onChangeText={setBoxHeight}
                placeholder="40"
                placeholderTextColor={colors.text.tertiary}
                keyboardType="decimal-pad"
                data-testid="box-height-input"
              />
            </View>
          )}
          
          {/* Notes */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t.notes}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder={locale === 'pt' ? 'Observações opcionais...' : 'Optional notes...'}
              placeholderTextColor={colors.text.tertiary}
              multiline
              numberOfLines={2}
            />
          </View>
          
          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, submitMutation.isPending && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitMutation.isPending}
            data-testid="submit-button"
          >
            <LinearGradient colors={['#8b5cf6', '#6d28d9']} style={styles.submitButtonGradient}>
              {submitMutation.isPending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="save" size={20} color="#ffffff" />
                  <Text style={styles.submitButtonText}>{t.save}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
        
        {/* Analysis Section */}
        {analysisLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent.primary} />
          </View>
        ) : analysis?.protocols?.cmj ? (
          <View style={styles.analysisSection}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="analytics" size={18} color={colors.accent.primary} /> {t.analysis}
            </Text>
            
            {/* RSI Gauge */}
            {analysis.protocols.cmj?.latest && (
              <RSIGauge 
                rsi={analysis.protocols.cmj.latest.rsi} 
                classification={analysis.protocols.cmj.latest.rsi_classification}
                locale={locale}
              />
            )}
            
            {/* Summary Cards */}
            {analysis.protocols.cmj?.latest && (
              <View style={styles.summaryGrid}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{analysis.protocols.cmj.latest.jump_height_cm.toFixed(1)}</Text>
                  <Text style={styles.summaryLabel}>{locale === 'pt' ? 'Altura (cm)' : 'Height (cm)'}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{analysis.protocols.cmj.latest.peak_power_w.toFixed(0)}</Text>
                  <Text style={styles.summaryLabel}>{locale === 'pt' ? 'Potência (W)' : 'Power (W)'}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{analysis.protocols.cmj.latest.peak_velocity_ms.toFixed(2)}</Text>
                  <Text style={styles.summaryLabel}>{locale === 'pt' ? 'Velocidade (m/s)' : 'Velocity (m/s)'}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{analysis.protocols.cmj.latest.relative_power_wkg.toFixed(1)}</Text>
                  <Text style={styles.summaryLabel}>W/kg</Text>
                </View>
              </View>
            )}
            
            {/* Fatigue Status */}
            <FatigueStatusCard fatigue={analysis.fatigue_analysis} locale={locale} />
            
            {/* Asymmetry */}
            <AsymmetryCard asymmetry={analysis.asymmetry} locale={locale} />
            
            {/* Power-Velocity Profile */}
            <PowerVelocityCard data={analysis.power_velocity_insights} locale={locale} />
            
            {/* Z-Score */}
            <ZScoreCard data={analysis.z_score} locale={locale} />
            
            {/* RSI History Chart */}
            {analysis.protocols.cmj?.history && (
              <RSIHistoryChart history={analysis.protocols.cmj.history} locale={locale} />
            )}
            
            {/* AI Insights */}
            {analysis.ai_feedback && (
              <View style={styles.aiInsightsCard}>
                <View style={styles.aiInsightsHeader}>
                  <Ionicons name="sparkles" size={20} color={colors.accent.primary} />
                  <Text style={styles.aiInsightsTitle}>{t.aiInsights}</Text>
                </View>
                <Text style={styles.aiInsightsText}>{analysis.ai_feedback}</Text>
              </View>
            )}
            
            {/* Recommendations */}
            {analysis.recommendations && analysis.recommendations.length > 0 && (
              <View style={styles.recommendationsCard}>
                <Text style={styles.recommendationsTitle}>{t.recommendations}</Text>
                {analysis.recommendations.map((rec, i) => (
                  <View key={i} style={styles.recommendationItem}>
                    <Text style={styles.recommendationText}>{rec}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="fitness-outline" size={48} color={colors.text.tertiary} />
            <Text style={styles.emptyText}>{t.noData}</Text>
            <Text style={styles.emptySubtext}>{t.addFirst}</Text>
          </View>
        )}
        
        <View style={{ height: 40 }} />
      </ScrollView>
      
      {/* Protocol Selection Modal */}
      <Modal
        visible={showProtocolModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowProtocolModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.selectProtocol}</Text>
              <TouchableOpacity onPress={() => setShowProtocolModal(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {protocols && Object.values(protocols).map((protocol) => (
                <TouchableOpacity
                  key={protocol.id}
                  style={[styles.modalOption, selectedProtocol === protocol.id && styles.modalOptionActive]}
                  onPress={() => {
                    setSelectedProtocol(protocol.id as JumpProtocol);
                    setShowProtocolModal(false);
                  }}
                  data-testid={`protocol-${protocol.id}`}
                >
                  <View style={styles.modalOptionIcon}>
                    <Ionicons name={protocol.icon as any} size={24} color={selectedProtocol === protocol.id ? '#ffffff' : colors.text.secondary} />
                  </View>
                  <View style={styles.modalOptionText}>
                    <Text style={styles.modalOptionName}>{protocol.name}</Text>
                    <Text style={styles.modalOptionDesc}>{protocol.description}</Text>
                  </View>
                  {selectedProtocol === protocol.id && (
                    <Ionicons name="checkmark-circle" size={24} color={colors.accent.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingTop: 8,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },
  protocolSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: colors.accent.primary,
  },
  protocolSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  protocolIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  protocolName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  protocolFullName: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  formCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.secondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.dark.secondary,
    borderRadius: 10,
    padding: 14,
    color: colors.text.primary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
  submitButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  analysisSection: {
    gap: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 8,
  },
  gaugeContainer: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  gaugeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 8,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 4,
  },
  fatigueCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
  },
  fatigueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  fatigueHeaderText: {
    flex: 1,
  },
  fatigueTitle: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  fatigueStatus: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  variationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  variationText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  fatigueMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  fatigueMetric: {
    flex: 1,
    alignItems: 'center',
  },
  fatigueMetricLabel: {
    fontSize: 10,
    color: colors.text.tertiary,
  },
  fatigueMetricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  fatigueMetricDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.border.default,
  },
  fatigueInterpretation: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  fatigueScale: {
    flexDirection: 'row',
    gap: 8,
  },
  fatigueScaleItem: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  fatigueScaleLabel: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  fatigueScaleText: {
    fontSize: 9,
    color: colors.text.secondary,
  },
  asymmetryCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
  },
  asymmetryCardRedFlag: {
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  asymmetryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  asymmetryTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  redFlagBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  redFlagText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  asymmetryBars: {
    gap: 12,
    marginBottom: 12,
  },
  asymmetryBarContainer: {},
  asymmetryBarLabel: {
    fontSize: 10,
    color: colors.text.tertiary,
    marginBottom: 4,
  },
  asymmetryBarWrapper: {
    height: 20,
    flexDirection: 'row',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  asymmetryBar: {
    height: '100%',
  },
  asymmetryIndicator: {
    position: 'absolute',
    top: 0,
    width: 3,
    height: '100%',
    backgroundColor: '#ffffff',
  },
  asymmetryLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  asymmetryLegLabel: {
    fontSize: 9,
    color: colors.text.tertiary,
  },
  asymmetryPercent: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  asymmetryInterpretation: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  asymmetryThreshold: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  asymmetryThresholdText: {
    fontSize: 10,
    color: colors.text.tertiary,
  },
  pvCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
  },
  pvHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  pvTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  pvMetrics: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  pvMetric: {
    flex: 1,
    alignItems: 'center',
  },
  pvMetricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  pvMetricLabel: {
    fontSize: 10,
    color: colors.text.tertiary,
    textAlign: 'center',
  },
  pvProfile: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  pvProfileLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  pvProfileRec: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  zScoreCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
  },
  zScoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  zScoreTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  zScoreContent: {
    alignItems: 'center',
    marginBottom: 12,
  },
  zScoreValue: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  zScoreInterpretation: {
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  zScoreScale: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  zScaleItem: {
    flex: 1,
  },
  zScoreLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  zScoreLabel: {
    fontSize: 9,
    color: colors.text.tertiary,
  },
  historyChart: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
  },
  historyChartTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  aiInsightsCard: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  aiInsightsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  aiInsightsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent.primary,
  },
  aiInsightsText: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  recommendationsCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
  },
  recommendationsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  recommendationItem: {
    marginBottom: 8,
  },
  recommendationText: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: colors.dark.card,
    borderRadius: 16,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.dark.secondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: colors.dark.card,
    gap: 12,
  },
  modalOptionActive: {
    borderColor: colors.accent.primary,
    borderWidth: 2,
  },
  modalOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.dark.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOptionText: {
    flex: 1,
  },
  modalOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  modalOptionDesc: {
    fontSize: 12,
    color: colors.text.secondary,
  },
});
