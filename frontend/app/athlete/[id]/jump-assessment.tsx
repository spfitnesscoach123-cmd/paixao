import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line, Circle, Rect, G, Text as SvgText, Path, Polyline, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/core';
import api from '../../../services/api';
import { colors } from '../../../constants/theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import PremiumGate from '../../../components/PremiumGate';
import { format } from 'date-fns';

const { width: screenWidth } = Dimensions.get('window');

type JumpProtocol = 'cmj' | 'sl_cmj_right' | 'sl_cmj_left' | 'dj';

interface ProtocolOption {
  id: JumpProtocol;
  label: string;
  labelPt: string;
  icon: string;
}

const PROTOCOLS: ProtocolOption[] = [
  { id: 'cmj', label: 'CMJ', labelPt: 'CMJ', icon: 'trending-up' },
  { id: 'sl_cmj_left', label: 'SL-CMJ L', labelPt: 'SL-CMJ E', icon: 'footsteps' },
  { id: 'sl_cmj_right', label: 'SL-CMJ R', labelPt: 'SL-CMJ D', icon: 'footsteps' },
  { id: 'dj', label: 'DJ', labelPt: 'DJ', icon: 'arrow-down' },
];

// ---- Animated Number Component ----
const AnimatedNumber = ({ value, decimals = 1, suffix = '', style }: { value: number; decimals?: number; suffix?: string; style?: any }) => {
  const [display, setDisplay] = useState('0');
  const animRef = useRef<any>(null);

  useEffect(() => {
    if (value === 0 || isNaN(value)) { setDisplay(value.toFixed(decimals)); return; }
    let start = 0;
    const duration = 800;
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay((value * eased).toFixed(decimals));
      if (progress < 1) animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [value, decimals]);

  return <Text style={style}>{display}{suffix}</Text>;
};

// ---- RSI Gauge Component (Modernized) ----
const RSIGauge = ({ rsi, classification, protocol, locale }: { rsi: number; classification: string; protocol: string; locale: string }) => {
  const chartW = Math.min(screenWidth - 48, 320);
  const chartH = 160;
  const cx = chartW / 2;
  const cy = 110;
  const radius = 90;
  const startAngle = Math.PI;
  const endAngle = 0;

  const isDj = protocol === 'dj';
  const metricLabel = isDj ? 'RSI' : 'RSImod';
  const maxVal = isDj ? 3.5 : 1.5;

  const getColor = (cls: string) => {
    const map: Record<string, string> = {
      excellent: '#22c55e', very_good: '#10b981', good: '#84cc16',
      average: '#f59e0b', below_average: '#f97316', poor: '#ef4444',
    };
    return map[cls] || '#8b5cf6';
  };

  const getLabel = (cls: string) => {
    const labels: Record<string, { pt: string; en: string }> = {
      excellent: { pt: 'Excelente', en: 'Excellent' },
      very_good: { pt: 'Muito Bom', en: 'Very Good' },
      good: { pt: 'Bom', en: 'Good' },
      average: { pt: 'Medio', en: 'Average' },
      below_average: { pt: 'Abaixo da Media', en: 'Below Average' },
      poor: { pt: 'Fraco', en: 'Poor' },
    };
    return labels[cls]?.[locale === 'pt' ? 'pt' : 'en'] || cls;
  };

  const normalized = Math.min(Math.max(rsi / maxVal, 0), 1);
  const color = getColor(classification);

  // Arc path helpers
  const arcPoint = (angle: number, r: number) => ({
    x: cx + r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  });

  const bgStart = arcPoint(startAngle, radius);
  const bgEnd = arcPoint(endAngle, radius);
  const bgPath = `M ${bgStart.x} ${bgStart.y} A ${radius} ${radius} 0 0 1 ${bgEnd.x} ${bgEnd.y}`;

  const valAngle = startAngle - normalized * Math.PI;
  const valEnd = arcPoint(valAngle, radius);
  const largeArc = normalized > 0.5 ? 1 : 0;
  const valPath = `M ${bgStart.x} ${bgStart.y} A ${radius} ${radius} 0 ${largeArc} 1 ${valEnd.x} ${valEnd.y}`;

  // Tick marks
  const ticks = isDj ? [0.5, 1.0, 1.5, 2.0, 2.5, 3.0] : [0.2, 0.4, 0.6, 0.8, 1.0, 1.2];

  return (
    <View style={s.gaugeCard} data-testid="rsi-gauge">
      <Text style={s.gaugeLabel}>{metricLabel}</Text>
      <Svg width={chartW} height={chartH}>
        <Defs>
          <SvgLinearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#ef4444" />
            <Stop offset="0.35" stopColor="#f59e0b" />
            <Stop offset="0.65" stopColor="#84cc16" />
            <Stop offset="1" stopColor="#22c55e" />
          </SvgLinearGradient>
        </Defs>
        {/* Background arc */}
        <Path d={bgPath} stroke="rgba(255,255,255,0.08)" strokeWidth="22" fill="none" strokeLinecap="round" />
        {/* Color arc */}
        <Path d={bgPath} stroke="url(#gaugeGrad)" strokeWidth="22" fill="none" strokeLinecap="round" opacity={0.25} />
        {/* Value arc with glow */}
        {normalized > 0.01 && (
          <>
            <Path d={valPath} stroke={color} strokeWidth="24" fill="none" strokeLinecap="round" opacity={0.3} />
            <Path d={valPath} stroke={color} strokeWidth="18" fill="none" strokeLinecap="round" />
          </>
        )}
        {/* Tick marks */}
        {ticks.map((tick, i) => {
          const tNorm = tick / maxVal;
          const tAngle = startAngle - tNorm * Math.PI;
          const inner = arcPoint(tAngle, radius - 16);
          const outer = arcPoint(tAngle, radius + 16);
          return (
            <G key={i}>
              <Line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              <SvgText x={arcPoint(tAngle, radius + 26).x} y={arcPoint(tAngle, radius + 26).y} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9">{tick}</SvgText>
            </G>
          );
        })}
        {/* Needle */}
        {(() => {
          const needleAngle = startAngle - normalized * Math.PI;
          const tip = arcPoint(needleAngle, radius - 30);
          return <Line x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke={color} strokeWidth="3" strokeLinecap="round" />;
        })()}
        <Circle cx={cx} cy={cy} r="6" fill={color} />
        <Circle cx={cx} cy={cy} r="3" fill="#0a0e1a" />
        {/* Value text */}
        <SvgText x={cx} y={cy - 25} textAnchor="middle" fill={color} fontSize="36" fontWeight="bold">{rsi.toFixed(2)}</SvgText>
        <SvgText x={cx} y={cy - 8} textAnchor="middle" fill={color} fontSize="13" fontWeight="600">{getLabel(classification)}</SvgText>
      </Svg>
    </View>
  );
};

// ---- Fatigue Index Card ----
const FatigueIndexCard = ({ data, locale }: { data: any; locale: string }) => {
  if (!data) return null;

  const getIcon = (cls: string) => {
    if (cls === 'above_baseline') return 'arrow-up-circle';
    if (cls === 'normal') return 'checkmark-circle';
    if (cls === 'mild') return 'alert-circle';
    return 'warning';
  };

  const scaleItems = [
    { label: '< 0%', text: locale === 'pt' ? 'Acima' : 'Above', color: '#22c55e' },
    { label: '0-5%', text: 'Normal', color: '#86efac' },
    { label: '5-10%', text: locale === 'pt' ? 'Leve' : 'Mild', color: '#fbbf24' },
    { label: '10-15%', text: locale === 'pt' ? 'Moderada' : 'Moderate', color: '#f97316' },
    { label: '15-20%', text: locale === 'pt' ? 'Alta' : 'High', color: '#f87171' },
    { label: '> 20%', text: locale === 'pt' ? 'Severa' : 'Severe', color: '#ef4444' },
  ];

  return (
    <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: data.color }]} data-testid="fatigue-index-card">
      <View style={s.cardHeader}>
        <Ionicons name={getIcon(data.classification) as any} size={24} color={data.color} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={s.cardHeaderLabel}>Fatigue Index ({data.metric_label})</Text>
          <Text style={[s.cardHeaderValue, { color: data.color }]}>{data.label}</Text>
        </View>
        <View style={[s.badge, { backgroundColor: data.color + '20' }]}>
          <Text style={[s.badgeText, { color: data.color }]}>{Math.abs(data.value).toFixed(1)}%</Text>
        </View>
      </View>

      <View style={s.fatigueMetricsRow}>
        <View style={s.fatigueMetricBox}>
          <Text style={s.fatigueMetricLabel}>Baseline</Text>
          <Text style={s.fatigueMetricVal}>{data.baseline.toFixed(2)}</Text>
        </View>
        <View style={[s.fatigueMetricDivider]} />
        <View style={s.fatigueMetricBox}>
          <Text style={s.fatigueMetricLabel}>{locale === 'pt' ? 'Atual' : 'Current'}</Text>
          <Text style={[s.fatigueMetricVal, { color: data.color }]}>{data.current.toFixed(2)}</Text>
        </View>
      </View>

      <View style={s.fatigueScaleRow}>
        {scaleItems.map((item, i) => (
          <View key={i} style={[s.fatigueScaleItem, { backgroundColor: item.color + '15' }]}>
            <Text style={[s.fatigueScaleVal, { color: item.color }]}>{item.label}</Text>
            <Text style={s.fatigueScaleText}>{item.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

// ---- Power-Velocity Quadrant ----
const PowerVelocityCard = ({ data, locale }: { data: any; locale: string }) => {
  if (!data) return null;
  const cW = screenWidth - 64;
  const cH = 150;
  const pad = { l: 40, r: 20, t: 10, b: 20 };
  const iW = cW - pad.l - pad.r;
  const iH = cH - pad.t - pad.b;

  const nV = Math.min(Math.max((data.velocity_vs_average_percent + 50) / 100, 0.05), 0.95);
  const nP = Math.min(Math.max((data.power_vs_average_percent + 50) / 100, 0.05), 0.95);
  const px = pad.l + nV * iW;
  const py = pad.t + iH - nP * iH;

  return (
    <View style={s.card} data-testid="power-velocity-card">
      <View style={s.cardHeader}>
        <Ionicons name="flash" size={20} color="#f59e0b" />
        <Text style={[s.cardHeaderLabel, { marginLeft: 8 }]}>
          {locale === 'pt' ? 'Perfil Potencia-Velocidade' : 'Power-Velocity Profile'}
        </Text>
      </View>
      <View style={{ alignItems: 'center' }}>
        <Svg width={cW} height={cH}>
          <Rect x={pad.l} y={pad.t} width={iW / 2} height={iH / 2} fill="rgba(239,68,68,0.12)" />
          <Rect x={pad.l + iW / 2} y={pad.t} width={iW / 2} height={iH / 2} fill="rgba(34,197,94,0.12)" />
          <Rect x={pad.l} y={pad.t + iH / 2} width={iW / 2} height={iH / 2} fill="rgba(156,163,175,0.12)" />
          <Rect x={pad.l + iW / 2} y={pad.t + iH / 2} width={iW / 2} height={iH / 2} fill="rgba(251,191,36,0.12)" />
          <Line x1={pad.l + iW / 2} y1={pad.t} x2={pad.l + iW / 2} y2={pad.t + iH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="4,4" />
          <Line x1={pad.l} y1={pad.t + iH / 2} x2={pad.l + iW} y2={pad.t + iH / 2} stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="4,4" />
          <SvgText x={pad.l + iW / 4} y={pad.t + 20} fill="rgba(239,68,68,0.7)" fontSize="8" textAnchor="middle">{locale === 'pt' ? 'Forca' : 'Strength'}</SvgText>
          <SvgText x={pad.l + 3 * iW / 4} y={pad.t + 20} fill="rgba(34,197,94,0.7)" fontSize="8" textAnchor="middle">{locale === 'pt' ? 'Equilibrado' : 'Balanced'}</SvgText>
          <SvgText x={pad.l + iW / 4} y={pad.t + iH - 8} fill="rgba(156,163,175,0.7)" fontSize="8" textAnchor="middle">{locale === 'pt' ? 'Desenvolver' : 'Develop'}</SvgText>
          <SvgText x={pad.l + 3 * iW / 4} y={pad.t + iH - 8} fill="rgba(251,191,36,0.7)" fontSize="8" textAnchor="middle">{locale === 'pt' ? 'Velocidade' : 'Speed'}</SvgText>
          {/* Glow */}
          <Circle cx={px} cy={py} r="16" fill={data.profile.color} opacity={0.2} />
          <Circle cx={px} cy={py} r="10" fill={data.profile.color} opacity={0.8} />
          <Circle cx={px} cy={py} r="4" fill="#fff" opacity={0.9} />
        </Svg>
      </View>
      <View style={s.pvMetricsRow}>
        <View style={s.pvMetricItem}>
          <AnimatedNumber value={data.peak_power_w} decimals={0} suffix=" W" style={s.pvMetricVal} />
          <Text style={s.pvMetricLabel}>{locale === 'pt' ? 'Potencia' : 'Power'}</Text>
        </View>
        <View style={s.pvMetricItem}>
          <AnimatedNumber value={data.peak_velocity_ms} decimals={2} suffix=" m/s" style={s.pvMetricVal} />
          <Text style={s.pvMetricLabel}>{locale === 'pt' ? 'Velocidade' : 'Velocity'}</Text>
        </View>
        <View style={s.pvMetricItem}>
          <AnimatedNumber value={data.relative_power_wkg} decimals={1} suffix="" style={s.pvMetricVal} />
          <Text style={s.pvMetricLabel}>W/kg</Text>
        </View>
      </View>
      <View style={[s.profileTag, { backgroundColor: data.profile.color + '20', borderColor: data.profile.color }]}>
        <Text style={[s.profileTagLabel, { color: data.profile.color }]}>{data.profile.label}</Text>
        <Text style={s.profileTagRec}>{data.profile.recommendation}</Text>
      </View>
    </View>
  );
};

// ---- RSI Evolution Chart (with glow + depth) ----
const RSIEvolutionChart = ({ history, protocol, locale }: { history: any[]; protocol: string; locale: string }) => {
  if (!history || history.length < 2) return null;

  const reversed = [...history].reverse();
  const chartW = Math.min(screenWidth - 48, 400);
  const chartH = 170;
  const pad = { t: 20, r: 20, b: 35, l: 45 };
  const iW = chartW - pad.l - pad.r;
  const iH = chartH - pad.t - pad.b;

  const rsiVals = reversed.map(h => h.rsi);
  const maxR = Math.max(...rsiVals) * 1.15;
  const minR = Math.min(...rsiVals) * 0.85;
  const range = maxR - minR || 1;

  const getX = (i: number) => pad.l + (i / (reversed.length - 1)) * iW;
  const getY = (v: number) => pad.t + iH - ((v - minR) / range) * iH;

  const points = reversed.map((h, i) => `${getX(i)},${getY(h.rsi)}`).join(' ');
  
  // Area fill path
  const areaPath = `M ${getX(0)},${getY(reversed[0].rsi)} ` +
    reversed.map((h, i) => `L ${getX(i)},${getY(h.rsi)}`).join(' ') +
    ` L ${getX(reversed.length - 1)},${pad.t + iH} L ${getX(0)},${pad.t + iH} Z`;

  const isDj = protocol === 'dj';
  const metricLabel = isDj ? 'RSI' : 'RSImod';

  return (
    <View style={s.card} data-testid="rsi-evolution-chart">
      <Text style={s.cardTitle}>{locale === 'pt' ? `Evolucao ${metricLabel}` : `${metricLabel} Evolution`}</Text>
      <Svg width={chartW} height={chartH}>
        <Defs>
          <SvgLinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.accent.primary} stopOpacity="0.3" />
            <Stop offset="1" stopColor={colors.accent.primary} stopOpacity="0.02" />
          </SvgLinearGradient>
          <SvgLinearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#a78bfa" />
            <Stop offset="1" stopColor="#6366f1" />
          </SvgLinearGradient>
        </Defs>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((r, i) => (
          <G key={i}>
            <Line x1={pad.l} y1={pad.t + iH * r} x2={pad.l + iW} y2={pad.t + iH * r} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <SvgText x={pad.l - 6} y={pad.t + iH * r + 4} textAnchor="end" fill="rgba(255,255,255,0.35)" fontSize="9">
              {(minR + range * (1 - r)).toFixed(2)}
            </SvgText>
          </G>
        ))}
        {/* Area fill */}
        <Path d={areaPath} fill="url(#areaFill)" />
        {/* Glow line */}
        <Polyline points={points} fill="none" stroke={colors.accent.primary} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity={0.3} />
        {/* Main line */}
        <Polyline points={points} fill="none" stroke="url(#lineGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {/* Points */}
        {reversed.map((h, i) => {
          const isLast = i === reversed.length - 1;
          return (
            <G key={i}>
              {isLast && <Circle cx={getX(i)} cy={getY(h.rsi)} r="8" fill={colors.accent.primary} opacity={0.25} />}
              <Circle cx={getX(i)} cy={getY(h.rsi)} r={isLast ? 5 : 3} fill={isLast ? colors.accent.primary : 'rgba(139,92,246,0.6)'} stroke={isLast ? '#fff' : 'transparent'} strokeWidth={isLast ? 2 : 0} />
            </G>
          );
        })}
        {/* Date labels */}
        {(() => {
          const indices = reversed.length <= 4
            ? reversed.map((_, i) => i)
            : [0, Math.floor(reversed.length / 2), reversed.length - 1];
          return indices.map(idx => (
            <SvgText key={idx} x={getX(idx)} y={chartH - 8} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8">
              {reversed[idx]?.date?.substring(5) || ''}
            </SvgText>
          ));
        })()}
      </Svg>
    </View>
  );
};

// ---- Z-Score Card ----
const ZScoreCard = ({ data, locale }: { data: any; locale: string }) => {
  if (!data) return null;
  const zColor = data.jump_height >= 1.5 ? '#22c55e' : data.jump_height >= 0.5 ? '#10b981' : data.jump_height >= -0.5 ? '#f59e0b' : data.jump_height >= -1.5 ? '#f97316' : '#ef4444';
  return (
    <View style={s.card} data-testid="z-score-card">
      <View style={s.cardHeader}>
        <Ionicons name="stats-chart" size={18} color={colors.accent.primary} />
        <Text style={[s.cardHeaderLabel, { marginLeft: 8 }]}>Z-Score ({locale === 'pt' ? 'vs Media Historica' : 'vs Historical Avg'})</Text>
      </View>
      <View style={{ alignItems: 'center', marginVertical: 8 }}>
        <Text style={[{ fontSize: 36, fontWeight: 'bold' as const }, { color: zColor }]}>{data.jump_height > 0 ? '+' : ''}{data.jump_height.toFixed(2)}</Text>
        <Text style={{ fontSize: 12, color: colors.text.secondary, textAlign: 'center', marginTop: 4 }}>{data.interpretation}</Text>
      </View>
      <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
        {['#ef4444', '#f97316', '#f59e0b', '#10b981', '#22c55e'].map((c, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: c }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        {['-2', '-1', '0', '+1', '+2'].map(l => (
          <Text key={l} style={{ fontSize: 9, color: colors.text.tertiary }}>{l}</Text>
        ))}
      </View>
    </View>
  );
};

// ==== MAIN COMPONENT ====
export default function JumpAssessment() {
  const { locale } = useLanguage();
  const featureName = locale === 'pt' ? 'Avaliacao de Saltos' : 'Jump Assessment';
  return (
    <PremiumGate featureName={featureName}>
      <JumpAssessmentContent />
    </PremiumGate>
  );
}

function JumpAssessmentContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { locale } = useLanguage();
  const insets = useSafeAreaInsets();

  // State
  const [selectedProtocol, setSelectedProtocol] = useState<JumpProtocol>('cmj');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Manual entry fields
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [flightTime, setFlightTime] = useState('');
  const [contactTime, setContactTime] = useState('');
  const [jumpHeight, setJumpHeight] = useState('');
  const [boxHeight, setBoxHeight] = useState('');
  const [timeToTakeoff, setTimeToTakeoff] = useState('');
  const [notes, setNotes] = useState('');

  // Fetch protocol-specific analysis
  const { data: analysis, isLoading, refetch } = useQuery({
    queryKey: ['jump-protocol-analysis', id, selectedProtocol, selectedDate],
    queryFn: async () => {
      const params = new URLSearchParams({ protocol: selectedProtocol, lang: locale });
      if (selectedDate) params.append('date', selectedDate);
      const res = await api.get(`/jump/protocol-analysis/${id}?${params.toString()}`);
      return res.data;
    },
    staleTime: 0,
    refetchOnMount: 'always' as const,
  });

  // Refetch on screen focus
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  // When protocol changes, reset date selection
  useEffect(() => { setSelectedDate(null); }, [selectedProtocol]);

  // Submit manual assessment
  const submitMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/jump/assessment', payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['jump-protocol-analysis'] });
      queryClient.invalidateQueries({ queryKey: ['jump-analysis'] });
      queryClient.invalidateQueries({ queryKey: ['jump-assessments'] });
      refetch();
      Alert.alert(
        locale === 'pt' ? 'Avaliacao Salva!' : 'Assessment Saved!',
        `RSI: ${data.calculations.rsi}\n${locale === 'pt' ? 'Potencia' : 'Power'}: ${data.calculations.peak_power_w}W`,
        [{ text: 'OK' }]
      );
      setFlightTime(''); setContactTime(''); setJumpHeight(''); setBoxHeight(''); setTimeToTakeoff(''); setNotes('');
      setShowManualEntry(false);
    },
    onError: (error: any) => {
      Alert.alert(locale === 'pt' ? 'Erro' : 'Error', error.response?.data?.detail || 'Error');
    },
  });

  const handleSubmit = () => {
    if (!flightTime || (!contactTime && selectedProtocol === 'dj')) {
      Alert.alert(locale === 'pt' ? 'Dados Incompletos' : 'Incomplete Data', locale === 'pt' ? 'Preencha os campos obrigatorios' : 'Fill required fields');
      return;
    }
    if (selectedProtocol === 'dj' && !boxHeight) {
      Alert.alert(locale === 'pt' ? 'Altura da Caixa' : 'Box Height', locale === 'pt' ? 'Informe a altura da caixa' : 'Enter box height');
      return;
    }
    submitMutation.mutate({
      athlete_id: id,
      date,
      protocol: selectedProtocol,
      flight_time_ms: parseFloat(flightTime.replace(',', '.')),
      contact_time_ms: contactTime ? parseFloat(contactTime.replace(',', '.')) : 0,
      jump_height_cm: jumpHeight ? parseFloat(jumpHeight.replace(',', '.')) : null,
      box_height_cm: boxHeight ? parseFloat(boxHeight.replace(',', '.')) : null,
      time_to_takeoff_ms: timeToTakeoff ? parseFloat(timeToTakeoff.replace(',', '.')) : null,
      notes: notes || null,
    });
  };

  const metrics = analysis?.metrics;
  const hasData = analysis?.has_data;

  return (
    <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={s.container}>
      <ScrollView contentContainerStyle={[s.scrollContent, { paddingTop: insets.top + 8 }]} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} data-testid="back-button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={s.title}>{locale === 'pt' ? 'Avaliacao de Salto' : 'Jump Assessment'}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Protocol Selector Tabs */}
        <View style={s.protocolTabs} data-testid="protocol-tabs">
          {PROTOCOLS.map(p => {
            const active = selectedProtocol === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[s.protocolTab, active && s.protocolTabActive]}
                onPress={() => setSelectedProtocol(p.id)}
                data-testid={`protocol-tab-${p.id}`}
              >
                <Ionicons name={p.icon as any} size={16} color={active ? '#fff' : colors.text.tertiary} />
                <Text style={[s.protocolTabText, active && s.protocolTabTextActive]}>
                  {locale === 'pt' ? p.labelPt : p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Date Selector */}
        {analysis?.available_dates && analysis.available_dates.length > 0 && (
          <View style={s.dateSection} data-testid="date-selector">
            <Text style={s.dateSectionLabel}>{locale === 'pt' ? 'Data da Avaliacao' : 'Assessment Date'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dateScroll}>
              {analysis.available_dates.map((d: string) => {
                const isActive = d === (analysis.selected_date || analysis.available_dates[0]);
                const displayDate = (() => {
                  try {
                    const [y, m, day] = d.split('-');
                    return `${day}/${m}`;
                  } catch { return d; }
                })();
                return (
                  <TouchableOpacity
                    key={d}
                    style={[s.dateChip, isActive && s.dateChipActive]}
                    onPress={() => setSelectedDate(d)}
                    data-testid={`date-chip-${d}`}
                  >
                    <Text style={[s.dateChipText, isActive && s.dateChipTextActive]}>{displayDate}</Text>
                    {isActive && <View style={s.dateChipDot} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Jump Camera Button */}
        <TouchableOpacity
          style={s.cameraButton}
          onPress={() => router.push(`/athlete/${id}/jump-camera`)}
          data-testid="jump-camera-btn"
        >
          <LinearGradient colors={['#10b981', '#059669']} style={s.cameraButtonGrad}>
            <Ionicons name="camera" size={22} color="#fff" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.cameraTitle}>Jump Camera</Text>
              <Text style={s.cameraSub}>{locale === 'pt' ? 'Captura automatica via visao computacional' : 'Automatic capture via computer vision'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        {/* Manual Entry Toggle */}
        <TouchableOpacity
          style={s.manualToggle}
          onPress={() => setShowManualEntry(!showManualEntry)}
          data-testid="manual-entry-toggle"
        >
          <Ionicons name={showManualEntry ? 'chevron-up' : 'create-outline'} size={18} color={colors.text.secondary} />
          <Text style={s.manualToggleText}>{locale === 'pt' ? 'Avaliacao Manual' : 'Manual Assessment'}</Text>
        </TouchableOpacity>

        {/* Manual Entry Form (hidden by default) */}
        {showManualEntry && (
          <View style={s.formCard}>
            <View style={s.row}>
              <View style={[s.inputGroup, { flex: 1 }]}>
                <Text style={s.inputLabel}>{locale === 'pt' ? 'Tempo de Voo (ms)' : 'Flight Time (ms)'}</Text>
                <TextInput style={s.input} value={flightTime} onChangeText={setFlightTime} placeholder="372" placeholderTextColor={colors.text.tertiary} keyboardType="decimal-pad" data-testid="flight-time-input" />
              </View>
              <View style={[s.inputGroup, { flex: 1, marginLeft: 10 }]}>
                <Text style={s.inputLabel}>{selectedProtocol === 'dj' ? (locale === 'pt' ? 'Tempo Contato (ms)' : 'Contact Time (ms)') : (locale === 'pt' ? 'Time-to-Takeoff (ms)' : 'Time-to-Takeoff (ms)')}</Text>
                <TextInput
                  style={s.input}
                  value={selectedProtocol === 'dj' ? contactTime : timeToTakeoff}
                  onChangeText={selectedProtocol === 'dj' ? setContactTime : setTimeToTakeoff}
                  placeholder={selectedProtocol === 'dj' ? '250' : '600'}
                  placeholderTextColor={colors.text.tertiary}
                  keyboardType="decimal-pad"
                  data-testid="contact-time-input"
                />
              </View>
            </View>
            <View style={s.row}>
              <View style={[s.inputGroup, { flex: 1 }]}>
                <Text style={s.inputLabel}>{locale === 'pt' ? 'Altura (cm) - Opcional' : 'Height (cm) - Optional'}</Text>
                <TextInput style={s.input} value={jumpHeight} onChangeText={setJumpHeight} placeholder="auto" placeholderTextColor={colors.text.tertiary} keyboardType="decimal-pad" />
              </View>
              {selectedProtocol === 'dj' && (
                <View style={[s.inputGroup, { flex: 1, marginLeft: 10 }]}>
                  <Text style={s.inputLabel}>{locale === 'pt' ? 'Caixa (cm)' : 'Box (cm)'}</Text>
                  <TextInput style={s.input} value={boxHeight} onChangeText={setBoxHeight} placeholder="40" placeholderTextColor={colors.text.tertiary} keyboardType="decimal-pad" data-testid="box-height-input" />
                </View>
              )}
            </View>
            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>{locale === 'pt' ? 'Data' : 'Date'}</Text>
              <TextInput style={s.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.text.tertiary} />
            </View>
            <TouchableOpacity
              style={[s.submitBtn, submitMutation.isPending && { opacity: 0.5 }]}
              onPress={handleSubmit}
              disabled={submitMutation.isPending}
              data-testid="submit-button"
            >
              <LinearGradient colors={['#8b5cf6', '#6d28d9']} style={s.submitBtnGrad}>
                {submitMutation.isPending ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="save" size={18} color="#fff" />
                    <Text style={s.submitBtnText}>{locale === 'pt' ? 'Salvar' : 'Save'}</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Loading */}
        {isLoading && (
          <View style={s.loadingBox}>
            <ActivityIndicator size="large" color={colors.accent.primary} />
          </View>
        )}

        {/* Analysis Section */}
        {!isLoading && hasData && metrics && (
          <View style={s.analysisSection}>
            {/* RSI Gauge */}
            <RSIGauge
              rsi={metrics.rsi || 0}
              classification={metrics.rsi_classification || 'poor'}
              protocol={selectedProtocol}
              locale={locale}
            />

            {/* Performance Metrics Grid */}
            <View style={s.metricsGrid} data-testid="performance-metrics">
              <View style={s.metricCard}>
                <AnimatedNumber value={metrics.jump_height_cm || 0} decimals={1} style={s.metricVal} />
                <Text style={s.metricLabel}>{locale === 'pt' ? 'Altura (cm)' : 'Height (cm)'}</Text>
              </View>
              <View style={s.metricCard}>
                <AnimatedNumber value={metrics.peak_power_w || 0} decimals={0} style={s.metricVal} />
                <Text style={s.metricLabel}>{locale === 'pt' ? 'Potencia (W)' : 'Power (W)'}</Text>
              </View>
              <View style={s.metricCard}>
                <AnimatedNumber value={metrics.peak_velocity_ms || 0} decimals={2} style={s.metricVal} />
                <Text style={s.metricLabel}>{locale === 'pt' ? 'Velocidade (m/s)' : 'Velocity (m/s)'}</Text>
              </View>
              <View style={s.metricCard}>
                <AnimatedNumber value={metrics.relative_power_wkg || 0} decimals={1} style={s.metricVal} />
                <Text style={s.metricLabel}>W/kg</Text>
              </View>
              {selectedProtocol === 'dj' && metrics.box_height_cm && (
                <View style={s.metricCard}>
                  <AnimatedNumber value={metrics.box_height_cm} decimals={0} style={s.metricVal} />
                  <Text style={s.metricLabel}>{locale === 'pt' ? 'Caixa (cm)' : 'Box (cm)'}</Text>
                </View>
              )}
            </View>

            {/* Fatigue Index */}
            <FatigueIndexCard data={analysis.fatigue_index} locale={locale} />

            {/* Power-Velocity */}
            <PowerVelocityCard data={analysis.power_velocity_insights} locale={locale} />

            {/* Z-Score */}
            <ZScoreCard data={analysis.z_score} locale={locale} />

            {/* RSI Evolution */}
            <RSIEvolutionChart history={analysis.history} protocol={selectedProtocol} locale={locale} />

            {/* Recommendations */}
            {analysis.recommendations && analysis.recommendations.length > 0 && (
              <View style={s.card} data-testid="recommendations-card">
                <Text style={s.cardTitle}>{locale === 'pt' ? 'Recomendacoes' : 'Recommendations'}</Text>
                {analysis.recommendations.map((rec: string, i: number) => (
                  <Text key={i} style={s.recText}>{rec}</Text>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Empty State */}
        {!isLoading && !hasData && (
          <View style={s.emptyState}>
            <Ionicons name="fitness-outline" size={48} color={colors.text.tertiary} />
            <Text style={s.emptyTitle}>{locale === 'pt' ? 'Nenhuma avaliacao neste protocolo' : 'No assessments for this protocol'}</Text>
            <Text style={s.emptySub}>{locale === 'pt' ? 'Use a Jump Camera ou adicione manualmente' : 'Use Jump Camera or add manually'}</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </LinearGradient>
  );
}

// ==== STYLES ====
const s = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: colors.text.primary },

  // Protocol Tabs
  protocolTabs: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  protocolTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 10, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  protocolTabActive: { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
  protocolTabText: { fontSize: 12, fontWeight: '600', color: colors.text.tertiary },
  protocolTabTextActive: { color: '#fff' },

  // Date Selector
  dateSection: { marginBottom: 14 },
  dateSectionLabel: { fontSize: 11, fontWeight: '500', color: colors.text.tertiary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  dateScroll: { flexDirection: 'row' },
  dateChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  dateChipActive: { backgroundColor: colors.accent.primary + '20', borderColor: colors.accent.primary },
  dateChipText: { fontSize: 13, fontWeight: '600', color: colors.text.tertiary },
  dateChipTextActive: { color: colors.accent.primary },
  dateChipDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent.primary, marginTop: 3 },

  // Camera Button
  cameraButton: { borderRadius: 14, overflow: 'hidden', marginBottom: 10 },
  cameraButtonGrad: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  cameraTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cameraSub: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 1 },

  // Manual Toggle
  manualToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  manualToggleText: { fontSize: 13, color: colors.text.secondary, fontWeight: '500' },

  // Form
  formCard: { backgroundColor: colors.dark.card, borderRadius: 14, padding: 14, marginBottom: 14 },
  row: { flexDirection: 'row' },
  inputGroup: { marginBottom: 10 },
  inputLabel: { fontSize: 11, fontWeight: '500', color: colors.text.secondary, marginBottom: 4 },
  input: {
    backgroundColor: colors.dark.secondary, borderRadius: 8, padding: 12,
    color: colors.text.primary, fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  submitBtn: { borderRadius: 10, overflow: 'hidden', marginTop: 4 },
  submitBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Loading
  loadingBox: { padding: 40, alignItems: 'center' },

  // Analysis Section
  analysisSection: { gap: 14 },

  // Cards
  card: { backgroundColor: colors.dark.card, borderRadius: 14, padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardHeaderLabel: { fontSize: 12, color: colors.text.secondary, fontWeight: '500' },
  cardHeaderValue: { fontSize: 16, fontWeight: 'bold' },
  cardTitle: { fontSize: 14, fontWeight: '600', color: colors.text.primary, marginBottom: 10 },

  // Badge
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16 },
  badgeText: { fontSize: 14, fontWeight: 'bold' },

  // Gauge
  gaugeCard: { backgroundColor: colors.dark.card, borderRadius: 14, padding: 14, alignItems: 'center' },
  gaugeLabel: { fontSize: 12, fontWeight: '600', color: colors.text.secondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },

  // Fatigue metrics
  fatigueMetricsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  fatigueMetricBox: { flex: 1, alignItems: 'center' },
  fatigueMetricLabel: { fontSize: 10, color: colors.text.tertiary },
  fatigueMetricVal: { fontSize: 20, fontWeight: 'bold', color: colors.text.primary },
  fatigueMetricDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.1)' },
  fatigueScaleRow: { flexDirection: 'row', gap: 4 },
  fatigueScaleItem: { flex: 1, padding: 4, borderRadius: 6, alignItems: 'center' },
  fatigueScaleVal: { fontSize: 8, fontWeight: 'bold' },
  fatigueScaleText: { fontSize: 7, color: colors.text.secondary },

  // Performance Metrics Grid
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricCard: { flex: 1, minWidth: '45%', backgroundColor: colors.dark.card, borderRadius: 12, padding: 14, alignItems: 'center' },
  metricVal: { fontSize: 22, fontWeight: 'bold', color: colors.text.primary },
  metricLabel: { fontSize: 10, color: colors.text.secondary, marginTop: 4 },

  // PV
  pvMetricsRow: { flexDirection: 'row', marginBottom: 12 },
  pvMetricItem: { flex: 1, alignItems: 'center' },
  pvMetricVal: { fontSize: 18, fontWeight: 'bold', color: colors.text.primary },
  pvMetricLabel: { fontSize: 10, color: colors.text.tertiary },
  profileTag: { borderRadius: 10, padding: 10, borderWidth: 1 },
  profileTagLabel: { fontSize: 13, fontWeight: 'bold', marginBottom: 2 },
  profileTagRec: { fontSize: 11, color: colors.text.secondary },

  // Recommendations
  recText: { fontSize: 13, color: colors.text.secondary, lineHeight: 20, marginBottom: 8 },

  // Empty State
  emptyState: { alignItems: 'center', paddingVertical: 40, backgroundColor: colors.dark.card, borderRadius: 14 },
  emptyTitle: { fontSize: 14, color: colors.text.secondary, marginTop: 12 },
  emptySub: { fontSize: 12, color: colors.text.tertiary, marginTop: 4 },
});
