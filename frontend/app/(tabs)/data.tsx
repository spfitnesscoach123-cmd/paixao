import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Dimensions, Animated, Modal, Pressable, Platform, ActivityIndicator, Alert,
  useWindowDimensions
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, G, Text as SvgText, Rect, Line, Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api from '../../services/api';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { AnimatedMetric, SkeletonDashboard, FadeInView, ChartEntryView, AnimatedCard, useChartAnimation, useAnimatedValue } from '../../components/animations';
import { InfoTooltip } from '../../components/dashboard/StackedBarChart';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 64;
const DASHBOARD_MAX_WIDTH = 1100;

// Responsive chart width: caps at DASHBOARD_MAX_WIDTH on wide screens
const useChartWidth = () => {
  const { width } = useWindowDimensions();
  return Math.min(width, DASHBOARD_MAX_WIDTH) - 64;
};

// ============ LAYER DEFINITIONS ============
const LAYERS = [
  { key: 'load', icon: 'barbell-outline', labelPt: 'Load Intelligence', labelEn: 'Load Intelligence' },
  { key: 'summary', icon: 'pulse-outline', labelPt: 'Smart Summary', labelEn: 'Smart Summary' },
  { key: 'status', icon: 'heart-outline', labelPt: 'Team Status', labelEn: 'Team Status' },
  { key: 'neuro', icon: 'flash-outline', labelPt: 'Neuromuscular', labelEn: 'Neuromuscular' },
  { key: 'risk', icon: 'shield-outline', labelPt: 'Risk Intelligence', labelEn: 'Risk Intelligence' },
  { key: 'speed', icon: 'speedometer-outline', labelPt: 'Velocidade & Metab.', labelEn: 'Speed & Metabolic' },
];

const DATE_RANGES = [
  { key: 'today', labelPt: 'Hoje', labelEn: 'Today' },
  { key: 'yesterday', labelPt: 'Ontem', labelEn: 'Yesterday' },
  { key: '7d', labelPt: '7 dias', labelEn: '7 days' },
  { key: '14d', labelPt: '14 dias', labelEn: '14 days' },
  { key: '28d', labelPt: '28 dias', labelEn: '28 days' },
  { key: '90d', labelPt: '90 dias', labelEn: '90 days' },
];

// Color palette
const COLORS = {
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
  blue: '#2FB6FF',
  purple: '#2FB6FF',
  cyan: '#22d3ee',
  orange: '#f97316',
  greenAlpha: 'rgba(16,185,129,0.25)',
  yellowAlpha: 'rgba(245,158,11,0.25)',
  redAlpha: 'rgba(239,68,68,0.25)',
  blueAlpha: 'rgba(47, 182, 255,0.25)',
  purpleAlpha: 'rgba(47, 182, 255,0.25)',
};

// LMPI Classification — mirrors backend thresholds exactly (>=70 optimal, >=40 moderate, <40 high)
const getLmpiClassification = (lmpi: number | null | undefined, validity: string | undefined, locale: string) => {
  if (validity === 'invalid' || lmpi == null) {
    return { label: locale === 'pt' ? 'Sem dados' : 'No data', color: colors.text.tertiary, bgColor: 'rgba(100,116,139,0.2)' };
  }
  const suffix = validity === 'partial' ? '*' : '';
  if (lmpi >= 70) {
    return { label: (locale === 'pt' ? 'Alto' : 'High') + suffix, color: COLORS.green, bgColor: COLORS.greenAlpha };
  } else if (lmpi >= 40) {
    return { label: (locale === 'pt' ? 'Moderado' : 'Moderate') + suffix, color: COLORS.yellow, bgColor: COLORS.yellowAlpha };
  }
  return { label: (locale === 'pt' ? 'Baixo' : 'Low') + suffix, color: COLORS.red, bgColor: COLORS.redAlpha };
};

// ============ SVG CHART COMPONENTS ============

// Gauge Component
const GaugeChart = ({ value, max = 100, label, color, size = 120 }: { value: number; max?: number; label: string; color: string; size?: number }) => {
  const { colors } = useTheme();
  // Sanitize value: clamp to a tiny positive number to avoid zero-length SVG paths
  // that crash react-native-svg on iOS (EXC_BAD_ACCESS) in empty-state scenarios.
  const safeValue =
    typeof value === 'number' && isFinite(value) && value > 0 ? value : 0.0001;
  const animVal = useAnimatedValue(safeValue, { duration: 900 });
  const radius = (size - 16) / 2;
  const circumference = Math.PI * radius;
  const progress = Math.min(animVal / max, 1);
  // Guarantee a non-zero dasharray (degenerate paths crash native SVG layer)
  const dashArray = Math.max(progress * circumference, 0.0001);
  // Sanitize label for use as SVG id — strip spaces and special chars to keep url(#id) valid.
  // Fallback to 'default' so the id is never just `gauge-` (empty suffix is invalid).
  const safeLabel = (label || '').replace(/[^a-zA-Z0-9]/g, '');
  const safeId = `gauge-${safeLabel || 'default'}`;
  
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size / 2 + 20}>
        <Defs>
          <SvgLinearGradient id={safeId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity="0.6" />
            <Stop offset="1" stopColor={color} stopOpacity="1" />
          </SvgLinearGradient>
        </Defs>
        <G rotation="180" origin={`${size/2}, ${size/2}`}>
          <Circle cx={size/2} cy={size/2} r={radius} stroke={colors.border.default} strokeWidth={10} fill="none" strokeLinecap="round" strokeDasharray={`${circumference} ${circumference*2}`} />
          <Circle cx={size/2} cy={size/2} r={radius} stroke={`url(#${safeId})`} strokeWidth={10} fill="none" strokeLinecap="round" strokeDasharray={`${dashArray} ${circumference*2}`} />
        </G>
        <SvgText x={size/2} y={size/2 - 4} textAnchor="middle" fill={colors.text.primary} fontSize={22} fontWeight="bold">{typeof value === 'number' ? animVal.toFixed(animVal < 10 ? 1 : 0) : '--'}</SvgText>
        <SvgText x={size/2} y={size/2 + 14} textAnchor="middle" fill={colors.text.secondary} fontSize={10}>{label}</SvgText>
      </Svg>
    </View>
  );
};


// ============ CARD INFO HEADER (tooltip pattern reused from TeamTable) ============
// Pure UX layer — adds an (i) icon to every chart card that opens an explanatory modal.
// Does NOT change any data, query, formula, or calculation. Tooltip content is derived
// from the TOOLTIPS registry below, keyed by a stable id.
const TOOLTIPS: Record<string, { pt: string; en: string }> = {
  acwr_load: {
    pt: 'Mostra a Carga Aguda (7d) vs Carga Crônica (28d). Alto em ambas indica volume consistente. Aguda muito acima da Crônica aumenta o risco de lesão. O equilíbrio entre elas é a base do ACWR — use para detectar picos de carga não acompanhados por adaptação crônica.',
    en: 'Shows Acute Load (7d) vs Chronic Load (28d). High values in both indicate consistent volume. Acute well above Chronic increases injury risk. The balance between them is the basis of ACWR — use to detect load spikes not matched by chronic adaptation.',
  },
  total_distance: {
    pt: 'Distância total percorrida ao longo do tempo (timeline). Quedas abruptas podem indicar descanso/lesão; subidas aceleradas podem sinalizar progressão agressiva. Útil para avaliar consistência de volume semanal.',
    en: 'Total distance covered over time (timeline). Abrupt drops may indicate rest/injury; rapid rises may signal aggressive progression. Useful to assess weekly volume consistency.',
  },
  acwr_timeline: {
    pt: 'Evolução do ACWR (razão Aguda/Crônica). Zona ótima: 0.8 – 1.3. Acima de 1.5 indica pico de carga e alto risco. Abaixo de 0.8 indica subcarga. Útil para acompanhar adaptação ao longo do microciclo.',
    en: 'ACWR ratio evolution (Acute/Chronic). Optimal zone: 0.8 – 1.3. Above 1.5 indicates load spike and high risk. Below 0.8 indicates undertraining. Useful to track adaptation across the microcycle.',
  },
  acwr_vs_load: {
    pt: 'ACWR atual do atleta e posicionamento em zona de carga. Toque em um ponto para ver o nome e o valor exato.',
    en: 'Current athlete ACWR and positioning across the load zones. Tap a point to see the athlete name and exact value.',
  },
  velocity_zones: {
    pt: 'Distribuição da distância em zonas de velocidade (Z1–Z5). Mais metros em Z4/Z5 indicam alta demanda neuromuscular. Equilibrar zonas baixas (recuperação/aeróbico) com picos de alta intensidade.',
    en: 'Distance distribution across velocity zones (Z1–Z5). More meters in Z4/Z5 indicate high neuromuscular demand. Balance low zones (recovery/aerobic) with high-intensity peaks.',
  },
  weekly_heatmap: {
    pt: 'Heatmap mostra intensidade diária ao longo das semanas. Útil para detectar padrões: dias de pico consistentes, blocos de repouso, sobrecarga em semanas específicas.',
    en: 'Heatmap showing daily intensity across weeks. Useful to detect patterns: consistent peak days, rest blocks, overload in specific weeks.',
  },
  load_ranking: {
    pt: 'Ranking dos atletas por carga total. Identifica quem está acumulando mais volume. Útil para comparar demanda individual vs média da equipe e calibrar prescrição.',
    en: 'Athletes ranking by total load. Identifies who is accumulating the most volume. Useful to compare individual demand vs team average and calibrate prescription.',
  },
  lmpi: {
    pt: 'LoadManager Performance Indicator — score composto (0–100) que agrega carga, prontidão, neuromuscular, risco e composição corporal. ≥80 ótimo, 60–79 bom, 40–59 atenção, <40 crítico. É o indicador holístico do atleta.',
    en: 'LoadManager Performance Indicator — composite score (0–100) aggregating load, readiness, neuromuscular, risk and body composition. ≥80 optimal, 60–79 good, 40–59 caution, <40 critical. Holistic athlete indicator.',
  },
  performance_profile: {
    pt: 'Radar multidimensional comparando força, potência, endurance, velocidade e recuperação. Útil para identificar gaps — perfis desequilibrados sugerem foco direcionado na próxima periodização.',
    en: 'Multidimensional radar comparing strength, power, endurance, speed and recovery. Useful to identify gaps — imbalanced profiles suggest targeted focus in the next periodization block.',
  },
  acwr_wellness: {
    pt: 'Cruzamento entre ACWR (risco de carga) e Wellness (prontidão subjetiva). Alto ACWR + baixo Wellness = zona crítica. Baixo ACWR + alto Wellness = sub-solicitação. O equilíbrio é o alvo.',
    en: 'Cross between ACWR (load risk) and Wellness (subjective readiness). High ACWR + low Wellness = critical zone. Low ACWR + high Wellness = under-utilization. Balance is the target.',
  },
  availability: {
    pt: '% de atletas disponíveis para treino/jogo. Meta: ≥90%. Quedas indicam surto de lesões ou fadiga crônica — útil para contexto operacional imediato.',
    en: '% of athletes available for training/game. Target: ≥90%. Drops indicate injury outbreak or chronic fatigue — useful for immediate operational context.',
  },
  lmpi_rankings: {
    pt: 'Tabela dos atletas com menor LMPI no período selecionado. O LMPI (0–100) é um score composto que agrega carga, prontidão (wellness), neuromuscular, risco e composição corporal. Limiares: ≥70 condição alta, 40–69 moderada, <40 baixa. Use esta tabela para priorizar acompanhamento individual.',
    en: 'Table of athletes with the lowest LMPI in the selected period. LMPI (0–100) is a composite score aggregating load, readiness (wellness), neuromuscular, risk and body composition. Thresholds: ≥70 high condition, 40–69 moderate, <40 low. Use this table to prioritize individual follow-up.',
  },
  team_readiness: {
    pt: 'Prontidão média da equipe com base em wellness diário. ≥4/5 é ideal. Quedas sustentadas indicam necessidade de deload coletivo.',
    en: 'Team average readiness based on daily wellness. ≥4/5 is ideal. Sustained drops indicate need for collective deload.',
  },
  wellness_summary: {
    pt: 'Resumo das dimensões: sono, dor, stress, fadiga, humor. Valores baixos em dor/fadiga = bom. Valores altos em sono/humor = bom. Identifica dimensão crítica da semana.',
    en: 'Dimensions summary: sleep, pain, stress, fatigue, mood. Low values on pain/fatigue = good. High values on sleep/mood = good. Identifies the critical dimension of the week.',
  },
  wellness_evolution: {
    pt: 'Evolução temporal do wellness médio. Tendência descendente = alerta de sobrecarga psico-física acumulada. Tendência estável ou crescente = adaptação saudável.',
    en: 'Wellness average evolution over time. Downward trend = accumulated psycho-physical overload alert. Stable or rising trend = healthy adaptation.',
  },
  cumulative_load: {
    pt: 'Carga acumulada período a período. Útil para ver se o volume total está dentro do planejado e se há semanas outliers acima da média.',
    en: 'Period-by-period cumulative load. Useful to see if total volume is on plan and whether there are outlier weeks above average.',
  },
  low_readiness: {
    pt: 'Lista de atletas com wellness abaixo do limiar. Priorize conversas individuais, possível redução de carga ou sessão regenerativa.',
    en: 'Athletes with wellness below threshold. Prioritize 1-on-1 conversations, possible load reduction or regenerative session.',
  },
  neuro_status: {
    pt: 'Neuro Score agregado (0–100) combinando RSImod, Velocity Loss e CMJ. ≥75 ótimo, 50–74 adequado, <50 alerta. Alto = potência preservada. Baixo = fadiga neuromuscular crítica.',
    en: 'Aggregated Neuro Score (0–100) combining RSImod, Velocity Loss and CMJ. ≥75 optimal, 50–74 adequate, <50 alert. High = preserved power. Low = critical neuromuscular fatigue.',
  },
  rsimod_long: {
    pt: 'RSImod longitudinal — Índice de Força Reativa modificado ao longo do tempo. ↑ = potência reativa crescente. ↓ abrupta = fadiga ou lesão. Baseline individual é mais relevante do que comparação cross-atleta.',
    en: 'Longitudinal RSImod — modified Reactive Strength Index over time. ↑ = rising reactive power. Abrupt ↓ = fatigue or injury. Individual baseline is more relevant than cross-athlete comparison.',
  },
  rsimod_by_athlete: {
    pt: 'Comparativo entre atletas (último RSImod vs baseline). Pontos abaixo da linha neutra = fadiga; acima = potenciação. A linha sombreada representa a zona normal de variação individual.',
    en: 'Cross-athlete comparison (latest RSImod vs baseline). Dots below the neutral line = fatigue; above = potentiation. Shaded band represents normal individual variation.',
  },
  cmj_profile: {
    pt: 'Perfil CMJ (altura, TTT, contato) por atleta. Queda em altura + aumento em TTT = fadiga. Manter o perfil equilibrado é chave para performance reativa.',
    en: 'CMJ profile (height, TTT, contact time) per athlete. Drop in height + TTT increase = fatigue. Keeping the profile balanced is key for reactive performance.',
  },
  velocity_deviation: {
    pt: 'Velocity Deviation Chart — divergente em torno de 0%. Esquerda (negativo) = potenciação (último set mais rápido que o primeiro). Direita (positivo) = fadiga (perda de velocidade entre sets). Fórmula: (1 − V_último/V_primeiro)×100.',
    en: 'Velocity Deviation Chart — divergent around 0%. Left (negative) = potentiation (last set faster than first). Right (positive) = fatigue (velocity loss between sets). Formula: (1 − V_last/V_first)×100.',
  },
  vbt_by_exercise: {
    pt: 'VBT detalhado por exercício (agachamento, supino, etc.). Compara velocity loss entre exercícios — sinaliza qual padrão motor está mais fadigado.',
    en: 'VBT broken down by exercise (squat, bench, etc.). Compares velocity loss across exercises — flags which motor pattern is most fatigued.',
  },
  risk_score: {
    pt: 'Score de Risco composto (0–100) com base em ACWR, wellness e histórico. ≥70 alto risco (intervenção), 40–69 moderado, <40 baixo. Use para triagem rápida antes de sessões intensas.',
    en: 'Composite Risk Score (0–100) based on ACWR, wellness and history. ≥70 high risk (intervention), 40–69 moderate, <40 low. Use for quick triage before intense sessions.',
  },
  rsi_vs_acwr: {
    pt: 'Cruzamento entre RSImod (potência reativa) e ACWR (carga relativa). Quadrante de risco: RSImod ↓ + ACWR ↑. Ideal: RSImod ↑ + ACWR ~1.0.',
    en: 'Cross between RSImod (reactive power) and ACWR (relative load). Risk quadrant: RSImod ↓ + ACWR ↑. Ideal: RSImod ↑ + ACWR ~1.0.',
  },
  asymmetry_alert: {
    pt: 'Alerta de assimetria em Single-Leg CMJ. Assimetria >15% entre membros = alto risco de lesão e indicativo de déficit neuromuscular unilateral. Priorizar correção.',
    en: 'Asymmetry alert on Single-Leg CMJ. Asymmetry >15% between limbs = high injury risk and sign of unilateral neuromuscular deficit. Prioritize correction.',
  },
  risk_panel: {
    pt: 'Painel consolidado de atletas em zona de risco (ACWR, wellness, assimetria, idade). Use para priorizar conversas e decisões de seleção antes de jogos.',
    en: 'Consolidated panel of athletes in the risk zone (ACWR, wellness, asymmetry, age). Use to prioritize conversations and selection decisions before games.',
  },
  sm_gauges: {
    pt: 'Velocidade & Carga Metabólica. Velocidade Máxima (%) = pico atingido vs máximo do atleta (exposição de sprint). Player Load Médio = carga mecânica média do período. Carga Metabólica Alta (HML) = acúmulo de esforço de alta demanda metabólica. Valores são exibidos exatamente como importados do CSV — sem conversão de unidade. "--" indica ausência de dados no período.',
    en: 'Speed & Metabolic Load. Max Velocity (%) = peak reached vs athlete maximum (sprint exposure). Average Player Load = mean mechanical load over the period. High Metabolic Load (HML) = accumulated high metabolic demand. Values are shown exactly as imported from CSV — no unit conversion. "--" indicates no data in the period.',
  },
  sm_pl_chart: {
    pt: 'Evolução diária do Player Load Médio (linha sólida) vs Player Load por Minuto (linha tracejada). Player Load reflete volume mecânico; PL/min reflete intensidade. Subidas no PL/min sem subida proporcional no Player Load indicam sessões curtas e intensas.',
    en: 'Daily evolution of Average Player Load (solid line) vs Player Load Per Minute (dashed line). Player Load reflects mechanical volume; PL/min reflects intensity. Rises in PL/min without proportional Player Load rise indicate short, intense sessions.',
  },
  sm_game_training: {
    pt: 'Comparação Jogo vs Treino usando APENAS atividades explicitamente classificadas (activity_type = "game"/"training"). Atividades não classificadas NÃO são tratadas como treino — ficam de fora. Métricas: Player Load Médio, Carga Metabólica Alta, Vel. Máx (%), Distância de Sprint. Ratio = Média Treino ÷ Média Jogo × 100 (N/A quando faltam dados).',
    en: 'Game vs Training comparison using ONLY explicitly classified activities (activity_type = "game"/"training"). Unclassified activities are NOT treated as training — they are excluded. Metrics: Avg Player Load, High Metabolic Load, Max Velocity (%), Sprint Distance. Ratio = Training Avg ÷ Game Avg × 100 (N/A when data is missing).',
  },
  sm_ratio_table: {
    pt: 'Tabela analítica Jogo vs Treino. Valores médios por sessão classificada. Ratio = Média Treino ÷ Média Jogo × 100. "--" indica ausência de dados; "N/A" indica que o Ratio não pode ser calculado (sem jogo, sem treino, ou divisão por zero).',
    en: 'Game vs Training analytical table. Average values per classified session. Ratio = Training Avg ÷ Game Avg × 100. "--" means no data; "N/A" means the ratio cannot be computed (no game, no training, or division by zero).',
  },
  rsimod_playerload: {
    pt: 'Resposta Neuromuscular (RSImod) vs Carga Externa (Player Load). Cada ponto é um atleta; as linhas marcam as médias da equipe.\n\n• Player Load alto + RSImod alto: Boa tolerância à carga. Atleta lidando bem com as demandas de treino.\n• Player Load alto + RSImod baixo: Possível fadiga neuromuscular. Monitorar recuperação e prontidão.\n• Player Load baixo + RSImod alto: Atleta fresco/recuperado. Potencial capacidade para maior exposição.\n• Player Load baixo + RSImod baixo: Sinal de prontidão reduzida. Investigar status de recuperação e contexto.',
    en: 'Neuromuscular Response (RSImod) vs External Load (Player Load). Each point is an athlete; the lines mark the team averages.\n\n• High Player Load + High RSImod: Good load tolerance. Athlete coping well with training demands.\n• High Player Load + Low RSImod: Possible neuromuscular fatigue. Monitor recovery and readiness.\n• Low Player Load + High RSImod: Fresh / recovered athlete. Potential capacity for greater exposure.\n• Low Player Load + Low RSImod: Reduced readiness signal. Investigate recovery status and context.',
  },
};

const CardInfoHeader = ({ id, subtitle }: { id: keyof typeof TOOLTIPS | string; subtitle?: string }) => {
  const { colors } = useTheme();
  const { locale } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [visible, setVisible] = useState(false);
  // Allow caller to pass an already-translated title directly via the id registry OR a custom title via subtitle prop
  const entry = (TOOLTIPS as any)[id] as { pt: string; en: string } | undefined;
  const body = entry ? (locale === 'pt' ? entry.pt : entry.en) : '';
  // Title map keyed by id — declared alongside TOOLTIPS for consistency
  const TITLES: Record<string, { pt: string; en: string }> = {
    acwr_load: { pt: 'Carga Aguda vs Crônica', en: 'Acute vs Chronic Load' },
    total_distance: { pt: 'Distancia Total (Timeline)', en: 'Total Distance (Timeline)' },
    acwr_timeline: { pt: 'ACWR Timeline', en: 'ACWR Timeline' },
    acwr_vs_load: { pt: 'Zona de Carga ACWR', en: 'ACWR Load Zone' },
    velocity_zones: { pt: 'Zonas de Velocidade', en: 'Velocity Zones' },
    weekly_heatmap: { pt: 'Heatmap Semanal', en: 'Weekly Heatmap' },
    load_ranking: { pt: 'Ranking de Carga', en: 'Load Ranking' },
    lmpi: { pt: 'Score LMPI', en: 'LMPI Score' },
    performance_profile: { pt: 'Perfil de Performance', en: 'Performance Profile' },
    acwr_wellness: { pt: 'ACWR vs Wellness', en: 'ACWR vs Wellness' },
    availability: { pt: 'Disponibilidade', en: 'Availability' },
    lmpi_rankings: { pt: 'Atletas com Melhor Condição (LMPI)', en: 'Athletes by Condition (LMPI)' },
    team_readiness: { pt: 'Prontidão da Equipe', en: 'Team Readiness' },
    wellness_summary: { pt: 'Wellness', en: 'Wellness' },
    wellness_evolution: { pt: 'Evolução Wellness', en: 'Wellness Evolution' },
    cumulative_load: { pt: 'Carga Acumulada', en: 'Cumulative Load' },
    low_readiness: { pt: 'Baixa Prontidão', en: 'Low Readiness' },
    neuro_status: { pt: 'Status Neuromuscular', en: 'Neuromuscular Status' },
    rsimod_long: { pt: 'RSImod Longitudinal', en: 'RSImod Longitudinal' },
    rsimod_by_athlete: { pt: 'RSImod por Atleta', en: 'RSImod by Athlete' },
    cmj_profile: { pt: 'Perfil CMJ', en: 'CMJ Profile' },
    velocity_deviation: { pt: 'Velocity Deviation Chart (%)', en: 'Velocity Deviation Chart (%)' },
    vbt_by_exercise: { pt: 'VBT por Exercício', en: 'VBT by Exercise' },
    risk_score: { pt: 'Score de Risco', en: 'Risk Score' },
    rsi_vs_acwr: { pt: 'RSImod vs ACWR', en: 'RSImod vs ACWR' },
    asymmetry_alert: { pt: 'Alerta de Assimetria (SL-CMJ)', en: 'Asymmetry Alert (SL-CMJ)' },
    risk_panel: { pt: 'Painel de Risco', en: 'Risk Panel' },
    sm_gauges: { pt: 'Velocidade & Carga Metabólica', en: 'Speed & Metabolic Load' },
    sm_pl_chart: { pt: 'Player Load Médio vs PL/min', en: 'Avg Player Load vs PL/min' },
    sm_game_training: { pt: 'Jogo vs Treino', en: 'Game vs Training' },
    sm_ratio_table: { pt: 'Tabela Jogo vs Treino (Ratio)', en: 'Game vs Training Table (Ratio)' },
    rsimod_playerload: { pt: 'RSImod vs Player Load', en: 'RSImod vs Player Load' },
  };
  const t = TITLES[id as string];
  const title = t ? (locale === 'pt' ? t.pt : t.en) : '';
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
        </View>
        <TouchableOpacity
          onPress={() => setVisible(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          data-testid={`card-info-${id}`}
        >
          <Ionicons name="information-circle-outline" size={18} color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>
      <InfoTooltip visible={visible} onClose={() => setVisible(false)} colors={colors} title={title} body={body} />
    </>
  );
};


// Mini Bar Chart
const MiniBarChart = ({ data, color, height = 80, barWidth = 6 }: { data: number[]; color: string; height?: number; barWidth?: number }) => {
  const CHART_WIDTH = useChartWidth();
  const animProgress = useChartAnimation({ duration: 700, delay: 100, deps: data });
  const max = Math.max(...data, 1);
  const w = Math.min(data.length * (barWidth + 3), CHART_WIDTH - 20);
  return (
    <Svg width={w} height={height}>
      {data.map((v, i) => {
        const targetH = (v / max) * (height - 10);
        const h = targetH * animProgress;
        return (
          <Rect key={i} x={i * (barWidth + 3)} y={height - h - 2} width={barWidth} height={Math.max(h, 0)} rx={2} fill={color} opacity={0.8} />
        );
      })}
    </Svg>
  );
};

// Line Chart Component (multi-line support)
const LineChart = ({ lines, labels, height = 160, showArea = false }: { lines: { data: number[]; color: string; dashed?: boolean }[]; labels?: string[]; height?: number; showArea?: boolean }) => {
  const { colors } = useTheme();
  const CHART_WIDTH = useChartWidth();
  const animProgress = useChartAnimation({ duration: 1000, delay: 200, deps: lines.map(l => l.data) });
  const w = CHART_WIDTH;
  const padding = { top: 10, bottom: 24, left: 4, right: 4 };
  const chartW = w - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  
  const allVals = lines.flatMap(l => l.data);
  const minVal = Math.min(...allVals, 0);
  const maxVal = Math.max(...allVals, 1);
  const range = maxVal - minVal || 1;
  
  return (
    <Svg width={w} height={height}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
        const y = padding.top + chartH * (1 - pct);
        return <Line key={i} x1={padding.left} y1={y} x2={w - padding.right} y2={y} stroke={colors.border.default} strokeWidth={1} />;
      })}
      
      {lines.map((line, li) => {
        const pointsXY = line.data.map((v, i) => {
          const x = padding.left + (i / Math.max(line.data.length - 1, 1)) * chartW;
          const y = padding.top + chartH * (1 - (v - minVal) / range);
          return { x, y };
        });
        const points = pointsXY.map(p => `${p.x},${p.y}`);
        const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ');
        
        // Calculate path length for progressive drawing animation
        let pathLen = 0;
        for (let j = 1; j < pointsXY.length; j++) {
          const dx = pointsXY[j].x - pointsXY[j-1].x;
          const dy = pointsXY[j].y - pointsXY[j-1].y;
          pathLen += Math.sqrt(dx * dx + dy * dy);
        }
        pathLen = Math.max(pathLen, 1);
        
        // Area fill
        let areaPath = '';
        if (showArea && li === 0) {
          const firstX = padding.left;
          const lastX = padding.left + chartW;
          const bottomY = padding.top + chartH;
          areaPath = `${pathD} L${lastX},${bottomY} L${firstX},${bottomY} Z`;
        }
        
        return (
          <G key={li}>
            {showArea && li === 0 && <Path d={areaPath} fill={line.color} opacity={0.15 * animProgress} />}
            <Path d={pathD} stroke={line.color} strokeWidth={2} fill="none"
              strokeDasharray={line.dashed ? '6,4' : `${pathLen}`}
              strokeDashoffset={line.dashed ? undefined : pathLen * (1 - animProgress)}
              opacity={0.9} />
          </G>
        );
      })}
      
      {/* X-axis labels */}
      {labels && labels.map((lbl, i) => {
        if (labels.length > 10 && i % Math.ceil(labels.length / 6) !== 0 && i !== labels.length - 1) return null;
        const x = padding.left + (i / Math.max(labels.length - 1, 1)) * chartW;
        return <SvgText key={i} x={x} y={height - 4} textAnchor="middle" fill={colors.text.tertiary} fontSize={8}>{lbl}</SvgText>;
      })}
    </Svg>
  );
};

// Donut Chart
const DonutChart = ({ segments, size = 100, strokeWidth = 14, centerText, centerSubtext }: { segments: { value: number; color: string; label: string }[]; size?: number; strokeWidth?: number; centerText?: string; centerSubtext?: string }) => {
  const { colors } = useTheme();
  // Stabilize segments and animation deps. Empty arrays as deps make the animation
  // hook keep firing on every shallow comparison and can cause native SVG churn on iOS.
  const safeSegments = Array.isArray(segments) ? segments : [];
  const hasData = safeSegments.length > 0;
  const animProgress = useChartAnimation({
    duration: 800,
    delay: 300,
    deps: hasData ? safeSegments.map(s => s.value) : [0],
  });
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = safeSegments.reduce((s, seg) => s + seg.value, 0);
  let offset = 0;
  
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${size/2}, ${size/2}`}>
          {total > 0 && safeSegments.map((seg, i) => {
            const pct = seg.value / total;
            const dash = pct * circumference * animProgress;
            const currentOffset = -offset * circumference / 360 * animProgress;
            offset += pct * 360;
            return <Circle key={i} cx={size/2} cy={size/2} r={radius} stroke={seg.color} strokeWidth={strokeWidth} fill="none" strokeDasharray={`${dash} ${circumference}`} strokeDashoffset={currentOffset} strokeLinecap="round" />;
          })}
        </G>
        {centerText && <SvgText x={size/2} y={size/2 - 4} textAnchor="middle" fill={colors.text.primary} fontSize={18} fontWeight="bold">{centerText}</SvgText>}
        {centerSubtext && <SvgText x={size/2} y={size/2 + 12} textAnchor="middle" fill={colors.text.secondary} fontSize={9}>{centerSubtext}</SvgText>}
      </Svg>
    </View>
  );
};

// Scatter/Quadrant Chart — clickable points reveal tooltip with athlete name + values
const QuadrantChart = ({ points, xLabel, yLabel, xMid, yMid, height = 200, autoScale = false }: { points: { x: number; y: number; name: string; color: string }[]; xLabel: string; yLabel: string; xMid?: number; yMid?: number; height?: number; autoScale?: boolean }) => {
  const { colors } = useTheme();
  const CHART_WIDTH = useChartWidth();
  const [selectedIdx, setSelectedIdx] = React.useState<number | null>(null);
  const w = CHART_WIDTH;
  const pad = { top: 10, bottom: 28, left: 30, right: 10 };
  const cW = w - pad.left - pad.right;
  const cH = height - pad.top - pad.bottom;
  
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  // autoScale: domain derived from data with a 15% margin (for arbitrary metric
  // scales such as RSImod 0-1 vs Player Load). Default (false) keeps the fixed
  // ACWR(0-2) vs Wellness(0-10) reference frame used by Risk Intelligence.
  const dataXMin = Math.min(...xs), dataXMax = Math.max(...xs);
  const dataYMin = Math.min(...ys), dataYMax = Math.max(...ys);
  const xPad = (dataXMax - dataXMin) * 0.15 || Math.abs(dataXMax * 0.15) || 1;
  const yPad = (dataYMax - dataYMin) * 0.15 || Math.abs(dataYMax * 0.15) || 1;
  const xMin = autoScale ? dataXMin - xPad : Math.min(...xs, 0);
  const xMax = autoScale ? dataXMax + xPad : Math.max(...xs, 2);
  const yMin = autoScale ? Math.max(0, dataYMin - yPad) : Math.min(...ys, 0);
  const yMax = autoScale ? dataYMax + yPad : Math.max(...ys, 10);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  
  const midX = xMid !== undefined ? pad.left + ((xMid - xMin) / xRange) * cW : undefined;
  const midY = yMid !== undefined ? pad.top + cH * (1 - (yMid - yMin) / yRange) : undefined;

  const selected = selectedIdx !== null ? points[selectedIdx] : null;
  
  return (
    <View style={{ width: w, height, position: 'relative' }}>
      <Svg width={w} height={height}>
        {/* Quadrant lines */}
        {midX !== undefined && <Line x1={midX} y1={pad.top} x2={midX} y2={pad.top + cH} stroke={colors.border.default} strokeWidth={1} strokeDasharray="4,4" />}
        {midY !== undefined && <Line x1={pad.left} y1={midY} x2={pad.left + cW} y2={midY} stroke={colors.border.default} strokeWidth={1} strokeDasharray="4,4" />}
        
        {/* Zone backgrounds */}
        {midX !== undefined && midY !== undefined && (
          <G>
            <Rect x={pad.left} y={pad.top} width={midX - pad.left} height={midY - pad.top} fill="rgba(16,185,129,0.06)" />
            <Rect x={midX} y={pad.top} width={pad.left + cW - midX} height={midY - pad.top} fill="rgba(245,158,11,0.06)" />
            <Rect x={pad.left} y={midY} width={midX - pad.left} height={pad.top + cH - midY} fill="rgba(47, 182, 255,0.06)" />
            <Rect x={midX} y={midY} width={pad.left + cW - midX} height={pad.top + cH - midY} fill="rgba(239,68,68,0.06)" />
          </G>
        )}
        
        {/* Points (clickable — cross-platform: web uses onClick, native uses onPress) */}
        {points.map((p, i) => {
          const cx = pad.left + ((p.x - xMin) / xRange) * cW;
          const cy = pad.top + cH * (1 - (p.y - yMin) / yRange);
          const isSelected = selectedIdx === i;
          const handlePress = () => setSelectedIdx(prev => (prev === i ? null : i));
          const isWeb = Platform.OS === 'web';
          const eventProps = isWeb
            ? { onClick: handlePress, onPress: handlePress }
            : { onPress: handlePress };
          return (
            <G key={i} {...(eventProps as any)}>
              {/* Invisible hit area — 18px radius — reliable click on web */}
              <Circle cx={cx} cy={cy} r={18} fill="transparent" />
              {isSelected && (
                <Circle cx={cx} cy={cy} r={12} fill="none" stroke={p.color} strokeWidth={1.5} opacity={0.6} />
              )}
              <Circle
                cx={cx}
                cy={cy}
                r={isSelected ? 8 : 6}
                fill={p.color}
                opacity={isSelected ? 1 : 0.85}
              />
              <Circle cx={cx} cy={cy} r={3} fill="#fff" opacity={0.7} />
            </G>
          );
        })}
        
        {/* Axis labels */}
        <SvgText x={w / 2} y={height - 4} textAnchor="middle" fill={colors.text.tertiary} fontSize={9}>{xLabel}</SvgText>
        <SvgText x={8} y={height / 2} textAnchor="middle" fill={colors.text.tertiary} fontSize={9} rotation="-90" origin={`8, ${height/2}`}>{yLabel}</SvgText>
      </Svg>

      {/* Tooltip overlay — same pattern as Team Dashboard HSR chart */}
      {selected && (
        <TouchableOpacity
          style={{
            position: 'absolute',
            bottom: 32,
            right: 10,
            backgroundColor: colors.dark.secondary,
            borderColor: selected.color,
            borderWidth: 1,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 7,
            minWidth: 170,
          }}
          activeOpacity={0.9}
          onPress={() => setSelectedIdx(null)}
          data-testid="quadrant-tooltip"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: selected.color }} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.primary, flex: 1 }} numberOfLines={1}>
              {selected.name}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 11, color: colors.text.secondary }}>
              {xLabel}: {selected.x.toFixed(2)}
            </Text>
            <Text style={{ fontSize: 11, color: colors.text.tertiary }}>|</Text>
            <Text style={{ fontSize: 11, color: colors.text.secondary }}>
              {yLabel}: {selected.y >= 1000 ? (selected.y / 1000).toFixed(2) + 'k' : selected.y.toFixed(1)}
            </Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ===================================================================
// ACWR Deviation Chart — horizontal axis with colored zones + athlete dots
// ===================================================================
// Zones (clinical ACWR convention):
//   <0.8  → red (undertraining)
//   0.8–1.3 → green (sweet spot)
//   1.3–1.5 → orange (caution)
//   >1.5  → red (danger)
// Each athlete is plotted as a dot positioned by ACWR value.
// Reference line at ACWR=1.0 (physiological equilibrium).
// Cross-platform click handling (web: onClick, native: onPress) for MacBook support.
// PURELY VISUAL — consumes same `scatterPoints` data, no recalculation.
const AcwrDeviationChart = ({
  points,
  height = 150,
}: {
  points: { x: number; name: string; color: string }[]; // x = ACWR
  height?: number;
}) => {
  const { colors } = useTheme();
  const CHART_WIDTH = useChartWidth();
  const { locale } = useLanguage();
  const [selectedIdx, setSelectedIdx] = React.useState<number | null>(null);
  const isWeb = Platform.OS === 'web';

  const w = CHART_WIDTH;
  const pad = { top: 28, bottom: 40, left: 18, right: 18 };
  const cW = w - pad.left - pad.right;
  const cH = height - pad.top - pad.bottom;

  // Fixed ACWR display range
  const xMin = 0.5;
  const xMax = 2.0;
  const xRange = xMax - xMin;
  const toX = (v: number) => pad.left + ((Math.max(xMin, Math.min(xMax, v)) - xMin) / xRange) * cW;

  // Axis tick marks
  const ticks = [0.8, 1.0, 1.3, 1.5];

  // Zone boundaries (in ACWR units)
  const zones = [
    { from: xMin, to: 0.8, color: 'rgba(239,68,68,0.22)' },   // red
    { from: 0.8, to: 1.3, color: 'rgba(16,185,129,0.28)' },   // green
    { from: 1.3, to: 1.5, color: 'rgba(245,158,11,0.28)' },   // orange
    { from: 1.5, to: xMax, color: 'rgba(239,68,68,0.22)' },   // red
  ];

  const barY = pad.top + 6;
  const barH = 14;
  const axisY = pad.top + cH - 6;

  const selected = selectedIdx !== null ? points[selectedIdx] : null;

  const handlePointPress = (i: number) => {
    setSelectedIdx(prev => (prev === i ? null : i));
  };

  // Cross-platform click handler factory — web uses onClick on a wrapping <g> inside SVG
  // which `react-native-svg-web` forwards as a DOM event
  const pointEventProps = (i: number) =>
    isWeb
      ? { onClick: () => handlePointPress(i), onPress: () => handlePointPress(i) }
      : { onPress: () => handlePointPress(i) };

  return (
    <View style={{ width: w, height, position: 'relative' }} data-testid="acwr-deviation-chart">
      <Svg width={w} height={height}>
        <Defs>
          <SvgLinearGradient id="acwrZoneGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#ef4444" stopOpacity="0.55" />
            <Stop offset="0.2" stopColor="#10b981" stopOpacity="0.55" />
            <Stop offset="0.53" stopColor="#10b981" stopOpacity="0.55" />
            <Stop offset="0.67" stopColor="#f59e0b" stopOpacity="0.55" />
            <Stop offset="0.8" stopColor="#ef4444" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#ef4444" stopOpacity="0.55" />
          </SvgLinearGradient>
        </Defs>

        {/* Continuous gradient bar (green centre → red extremes) */}
        <Rect x={pad.left} y={barY} width={cW} height={barH} rx={barH / 2} fill="url(#acwrZoneGrad)" />

        {/* Explicit zone separator ticks */}
        {[0.8, 1.3, 1.5].map((v) => (
          <Line
            key={`sep-${v}`}
            x1={toX(v)} y1={barY - 3}
            x2={toX(v)} y2={barY + barH + 3}
            stroke={colors.border.default}
            strokeWidth={1}
            opacity={0.6}
          />
        ))}

        {/* Reference line at ACWR = 1.0 (equilibrium) */}
        <Line
          x1={toX(1.0)} y1={pad.top - 4}
          x2={toX(1.0)} y2={axisY + 6}
          stroke={colors.text.secondary}
          strokeWidth={1}
          strokeDasharray="3,3"
          opacity={0.7}
        />
        <SvgText x={toX(1.0)} y={pad.top - 8} textAnchor="middle" fill={colors.text.secondary} fontSize={9}>
          1.0
        </SvgText>

        {/* Athlete dots plotted on the bar */}
        {points.map((p, i) => {
          const cx = toX(p.x);
          const cy = barY + barH / 2;
          const isSelected = selectedIdx === i;
          return (
            <G key={`pt-${i}`} {...(pointEventProps(i) as any)}>
              {/* Invisible large hit area (18px radius) — easier click/tap */}
              <Circle cx={cx} cy={cy} r={18} fill="transparent" />
              {isSelected && (
                <Circle cx={cx} cy={cy} r={12} fill="none" stroke={p.color} strokeWidth={1.5} opacity={0.7} />
              )}
              <Circle
                cx={cx}
                cy={cy}
                r={isSelected ? 7 : 5.5}
                fill={p.color}
                stroke="#ffffff"
                strokeWidth={1.5}
                opacity={isSelected ? 1 : 0.95}
              />
            </G>
          );
        })}

        {/* Axis ticks + labels */}
        {ticks.map((v) => (
          <G key={`tick-${v}`}>
            <Line x1={toX(v)} y1={axisY - 3} x2={toX(v)} y2={axisY + 3} stroke={colors.text.tertiary} strokeWidth={1} />
            <SvgText x={toX(v)} y={axisY + 14} textAnchor="middle" fill={colors.text.tertiary} fontSize={10}>
              {v.toFixed(1)}
            </SvgText>
          </G>
        ))}

        {/* Axis label */}
        <SvgText x={w / 2} y={height - 4} textAnchor="middle" fill={colors.text.tertiary} fontSize={9}>
          ACWR
        </SvgText>
      </Svg>

      {/* Tooltip overlay — same pattern as QuadrantChart, but single-axis */}
      {selected && (
        <TouchableOpacity
          style={{
            position: 'absolute',
            top: 0,
            right: 8,
            backgroundColor: colors.dark.secondary,
            borderColor: selected.color,
            borderWidth: 1,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 6,
            minWidth: 150,
          }}
          activeOpacity={0.9}
          onPress={() => setSelectedIdx(null)}
          data-testid="acwr-deviation-tooltip"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: selected.color }} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.primary, flex: 1 }} numberOfLines={1}>
              {selected.name}
            </Text>
          </View>
          <Text style={{ fontSize: 11, color: colors.text.secondary }}>
            ACWR: {selected.x.toFixed(2)}
          </Text>
        </TouchableOpacity>
      )}

      {/* Zone legend below axis */}
      <View style={{ position: 'absolute', bottom: 2, left: pad.left, right: pad.right, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 }} pointerEvents="none">
        <Text style={{ fontSize: 9, color: '#ef4444', fontWeight: '600' }}>
          {locale === 'pt' ? '< 0.8' : '< 0.8'}
        </Text>
        <Text style={{ fontSize: 9, color: '#10b981', fontWeight: '600' }}>
          {locale === 'pt' ? '0.8 – 1.3' : '0.8 – 1.3'}
        </Text>
        <Text style={{ fontSize: 9, color: '#f59e0b', fontWeight: '600' }}>
          {locale === 'pt' ? '1.3 – 1.5' : '1.3 – 1.5'}
        </Text>
        <Text style={{ fontSize: 9, color: '#ef4444', fontWeight: '600' }}>
          {locale === 'pt' ? '> 1.5' : '> 1.5'}
        </Text>
      </View>
    </View>
  );
};



// Heatmap (weekly)
const WeeklyHeatmap = ({ data, height = 100 }: { data: { week: number; days: { dow: number; value: number; date: string }[] }[]; height?: number }) => {
  const { colors } = useTheme();
  const CHART_WIDTH = useChartWidth();
  const w = CHART_WIDTH;
  const cellSize = Math.min((w - 40) / 7, 36);
  const rowH = cellSize + 4;
  const maxVal = Math.max(...data.flatMap(wk => wk.days.map(d => d.value)), 1);
  const dayLabels = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
  
  return (
    <Svg width={w} height={data.length * rowH + 24}>
      {/* Day headers */}
      {dayLabels.map((lbl, i) => (
        <SvgText key={i} x={16 + i * (cellSize + 4) + cellSize / 2} y={12} textAnchor="middle" fill={colors.text.tertiary} fontSize={9}>{lbl}</SvgText>
      ))}
      
      {data.map((wk, wi) => (
        <G key={wi}>
          {wk.days.map((d, di) => {
            const intensity = d.value / maxVal;
            const color = intensity > 0.7 ? COLORS.green : intensity > 0.4 ? COLORS.blue : intensity > 0.1 ? 'rgba(47, 182, 255,0.3)' : 'rgba(255,255,255,0.04)';
            return (
              <Rect key={di} x={16 + di * (cellSize + 4)} y={20 + wi * rowH} width={cellSize} height={cellSize - 4} rx={4} fill={color} opacity={0.8} />
            );
          })}
          <SvgText x={w - 4} y={20 + wi * rowH + cellSize / 2} textAnchor="end" fill={colors.text.tertiary} fontSize={8}>S{wk.week + 1}</SvgText>
        </G>
      ))}
    </Svg>
  );
};

// Radar Chart
const RadarChart = ({ values, labels, size = 160 }: { values: number[]; labels: string[]; size?: number }) => {
  const { colors } = useTheme();
  // Sanitize values: a polygon with all-zero coordinates collapses to a single
  // point and produces a degenerate SVG path that crashes react-native-svg on iOS.
  const safeValues = (values || []).map(v => (typeof v === 'number' && isFinite(v) ? v : 0));
  const hasAnyValue = safeValues.length > 0 && safeValues.some(v => v > 0);
  const finalValues = hasAnyValue
    ? safeValues
    : (safeValues.length > 0
        ? safeValues.map((_, i) => (i === 0 ? 0.0001 : 0))
        : [0.0001, 0, 0, 0, 0]);
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - 40) / 2;
  const n = finalValues.length;
  
  const getPoint = (index: number, val: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    return { x: cx + r * val * Math.cos(angle), y: cy + r * val * Math.sin(angle) };
  };
  
  // Background rings
  const rings = [0.25, 0.5, 0.75, 1.0];
  
  return (
    <Svg width={size} height={size}>
      {/* Grid rings */}
      {rings.map((rv, i) => {
        const pts = Array.from({ length: n }, (_, j) => getPoint(j, rv));
        const d = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z';
        return <Path key={i} d={d} stroke={colors.border.default} strokeWidth={1} fill="none" />;
      })}
      
      {/* Axes */}
      {Array.from({ length: n }, (_, i) => {
        const p = getPoint(i, 1);
        return <Line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={colors.border.default} strokeWidth={1} />;
      })}
      
      {/* Data polygon */}
      {(() => {
        const pts = finalValues.map((v, i) => getPoint(i, Math.min(v, 1)));
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z';
        return (
          <G>
            <Path d={d} fill={COLORS.purple} opacity={0.2} />
            <Path d={d} stroke={COLORS.purple} strokeWidth={2} fill="none" opacity={0.8} />
            {pts.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={3} fill={COLORS.purple} />)}
          </G>
        );
      })()}
      
      {/* Labels */}
      {labels.map((lbl, i) => {
        const p = getPoint(i, 1.2);
        return <SvgText key={i} x={p.x} y={p.y + 3} textAnchor="middle" fill={colors.text.secondary} fontSize={8}>{lbl}</SvgText>;
      })}
    </Svg>
  );
};

// Horizontal Bar
const HorizontalBar = ({ value, max, label, color }: { value: number; max: number; label: string; color: string }) => {
  const { colors } = useTheme();
  const pct = useAnimatedValue(Math.min(value / max, 1) * 100, { duration: 700, delay: 400 });
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
        <Text style={{ color: colors.text.secondary, fontSize: 11 }}>{label}</Text>
        <Text style={{ color: colors.text.primary, fontSize: 11, fontWeight: '600' }}>{typeof value === 'number' ? value.toFixed(1) : '--'}</Text>
      </View>
      <View style={{ height: 6, backgroundColor: colors.border.default, borderRadius: 3 }}>
        <View style={{ height: 6, width: `${pct}%`, backgroundColor: color, borderRadius: 3 }} />
      </View>
    </View>
  );
};

// ============ VELOCITY DEVIATION CHART ============
// Divergent axis (−30% … +30%) with zero center. Left = Potentiation, Right = Fatigue.
// One thin gradient track per athlete + discrete vertical tick marker at the athlete value.
// Formula unchanged (backend): (1 − V_last / V_first) × 100
const VelocityDeviationChart = ({ data, locale }: { data: Array<{ name: string; value: number }>; locale: string }) => {
  const { colors } = useTheme();
  const chartWidth = useChartWidth();
  const AXIS_MIN = -30;
  const AXIS_MAX = 30;
  const AXIS_RANGE = AXIS_MAX - AXIS_MIN;
  const ROW_H = 42;
  const NAME_W = 46;
  const PAD_R = 12;
  const trackLeft = NAME_W;
  const trackRight = chartWidth - PAD_R;
  const trackWidth = trackRight - trackLeft;
  const valueToX = (v: number) => {
    const c = Math.max(AXIS_MIN, Math.min(AXIS_MAX, v));
    return trackLeft + ((c - AXIS_MIN) / AXIS_RANGE) * trackWidth;
  };
  const zeroX = valueToX(0);
  const ticks = [-30, -20, -10, 0, 10, 20, 30];
  const colorForValue = (v: number) => {
    if (v <= -20) return '#10b981';
    if (v <= -10) return '#84cc16';
    if (v < 10) return colors.text.tertiary;
    if (v < 20) return '#f97316';
    return '#ef4444';
  };
  return (
    <View style={{ marginTop: 4 }} data-testid="velocity-deviation-chart">
      {/* Zone legend header */}
      <Svg width={chartWidth} height={32}>
        <SvgText x={trackLeft + trackWidth * 0.0833} y={10} fontSize={8} fill="#10b981" textAnchor="middle" fontWeight="700">
          {locale === 'pt' ? 'Alta' : 'High'}
        </SvgText>
        <SvgText x={trackLeft + trackWidth * 0.0833} y={22} fontSize={8} fill="#10b981" textAnchor="middle" fontWeight="700">
          {locale === 'pt' ? 'Potenciação' : 'Potentiation'}
        </SvgText>
        <SvgText x={trackLeft + trackWidth * 0.25} y={16} fontSize={8} fill={colors.text.secondary} textAnchor="middle">
          {locale === 'pt' ? 'Moderada' : 'Moderate'}
        </SvgText>
        <SvgText x={zeroX} y={16} fontSize={8} fill={colors.text.secondary} textAnchor="middle">
          {locale === 'pt' ? 'Neutro' : 'Neutral'}
        </SvgText>
        <SvgText x={trackLeft + trackWidth * 0.75} y={16} fontSize={8} fill={colors.text.secondary} textAnchor="middle">
          {locale === 'pt' ? 'Moderada' : 'Moderate'}
        </SvgText>
        <SvgText x={trackLeft + trackWidth * 0.9167} y={10} fontSize={8} fill="#ef4444" textAnchor="middle" fontWeight="700">
          {locale === 'pt' ? 'Alta' : 'High'}
        </SvgText>
        <SvgText x={trackLeft + trackWidth * 0.9167} y={22} fontSize={8} fill="#ef4444" textAnchor="middle" fontWeight="700">
          {locale === 'pt' ? 'Fadiga' : 'Fatigue'}
        </SvgText>
      </Svg>
      {/* Athlete rows */}
      {data.map((d, i) => {
        const isOutlierLeft = d.value < AXIS_MIN;
        const isOutlierRight = d.value > AXIS_MAX;
        const markerX = valueToX(d.value);
        const markerColor = colorForValue(d.value);
        const prefix = isOutlierLeft ? '≤' : isOutlierRight ? '≥' : '';
        const clampedForLabel = isOutlierLeft ? AXIS_MIN : isOutlierRight ? AXIS_MAX : d.value;
        const label = `${prefix}${d.value.toFixed(1)}%`;
        // Label anchor & clamp to avoid overflow
        let labelAnchor: 'start' | 'middle' | 'end' = 'middle';
        let labelX = markerX;
        if (markerX < trackLeft + 22) { labelAnchor = 'start'; labelX = markerX - 4; }
        else if (markerX > trackRight - 22) { labelAnchor = 'end'; labelX = markerX + 4; }
        return (
          <Svg key={d.name + '-' + i} width={chartWidth} height={ROW_H}>
            <Defs>
              <SvgLinearGradient id={`vdev-grad-${i}`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#10b981" stopOpacity="0.9" />
                <Stop offset="0.33" stopColor="#84cc16" stopOpacity="0.75" />
                <Stop offset="0.5" stopColor={colors.text.tertiary} stopOpacity="0.45" />
                <Stop offset="0.67" stopColor="#f97316" stopOpacity="0.75" />
                <Stop offset="1" stopColor="#ef4444" stopOpacity="0.9" />
              </SvgLinearGradient>
            </Defs>
            {/* Athlete name */}
            <SvgText x={2} y={ROW_H / 2 + 4} fontSize={11} fill={colors.text.primary} fontWeight="600">
              {d.name.length > 7 ? d.name.slice(0, 7) : d.name}
            </SvgText>
            {/* Gradient track (thin line) */}
            <Rect x={trackLeft} y={ROW_H / 2 - 1.25} width={trackWidth} height={2.5} fill={`url(#vdev-grad-${i})`} rx={1.25} />
            {/* Minor tick marks on the track */}
            {ticks.map((t) => (
              <Line key={`tk-${t}`} x1={valueToX(t)} y1={ROW_H / 2 - 3} x2={valueToX(t)} y2={ROW_H / 2 + 3} stroke={colors.text.tertiary} strokeOpacity={0.35} strokeWidth={0.5} />
            ))}
            {/* Zero dashed vertical reference */}
            <Line x1={zeroX} y1={6} x2={zeroX} y2={ROW_H - 6} stroke={colors.text.tertiary} strokeOpacity={0.55} strokeWidth={0.8} strokeDasharray="2,2" />
            {/* Athlete marker (vertical notch) */}
            <Line x1={markerX} y1={ROW_H / 2 - 8} x2={markerX} y2={ROW_H / 2 + 8} stroke={markerColor} strokeWidth={2.5} strokeLinecap="round" />
            {/* Small top cap on the marker for visibility */}
            <Line x1={markerX - 3} y1={ROW_H / 2 - 8} x2={markerX + 3} y2={ROW_H / 2 - 8} stroke={markerColor} strokeWidth={2.5} strokeLinecap="round" />
            {/* Value label below marker */}
            <SvgText x={labelX} y={ROW_H - 2} fontSize={10} fill={markerColor} fontWeight="700" textAnchor={labelAnchor}>
              {label}
            </SvgText>
          </Svg>
        );
      })}
      {/* Axis footer */}
      <Svg width={chartWidth} height={16}>
        {ticks.map((t) => (
          <SvgText key={`ax-${t}`} x={valueToX(t)} y={12} fontSize={9} fill={colors.text.secondary} textAnchor="middle">
            {t > 0 ? `+${t}%` : `${t}%`}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
};

// ============ MAIN COMPONENT ============
export default function DataScreen() {
  const { colors } = useTheme();
  const { t, locale } = useLanguage();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [selectedAthlete, setSelectedAthlete] = useState<string>('all');
  const [selectedDateRange, setSelectedDateRange] = useState('28d');
  const [selectedPosition, setSelectedPosition] = useState<string>('all');
  const [activeLayer, setActiveLayer] = useState('load');
  
  // Modals
  const [athleteModalVisible, setAthleteModalVisible] = useState(false);
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [positionModalVisible, setPositionModalVisible] = useState(false);
  
  // Fade animation
  const fadeAnim = useRef(new Animated.Value(1)).current;
  
  // PDF Export state
  const [pdfModalVisible, setPdfModalVisible] = useState(false);
  const [pdfLayers, setPdfLayers] = useState<Record<string, boolean>>({
    load: true, summary: true, status: true, neuro: true, risk: true, speed: true,
  });
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  const togglePdfLayer = (key: string) => {
    setPdfLayers(prev => ({ ...prev, [key]: !prev[key] }));
  };
  
  const switchLayer = useCallback((key: string) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setActiveLayer(key);
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    });
  }, [fadeAnim]);
  
  // Data query
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard-overview', selectedAthlete, selectedDateRange, selectedPosition],
    queryFn: async () => {
      const params = new URLSearchParams({ lang: locale, date_range: selectedDateRange });
      if (selectedAthlete !== 'all') params.set('athlete_id', selectedAthlete);
      if (selectedPosition !== 'all') params.set('position', selectedPosition);
      const res = await api.get(`/dashboard/overview?${params.toString()}`);
      return res.data;
    },
  });

  // Refetch data when tab gains focus (critical for React Native tabs that stay mounted)
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );
  
  // Athletes list for filter (separate query)
  const { data: athletesList } = useQuery({
    queryKey: ['athletes-list'],
    queryFn: async () => { const res = await api.get('/athletes'); return res.data; },
  });

  // Phase 6A: Dashboard activity classification (INDEPENDENT from Periodization)
  const [classifyModalVisible, setClassifyModalVisible] = useState(false);
  const [classifyingId, setClassifyingId] = useState<string | null>(null);
  const { data: dashSessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['dashboard-sessions'],
    queryFn: async () => { const res = await api.get('/dashboard/sessions'); return res.data?.sessions || []; },
    enabled: classifyModalVisible,
  });
  const classifySession = useCallback(async (sessionId: string, activityType: 'game' | 'training' | null) => {
    try {
      setClassifyingId(sessionId);
      await api.put(`/dashboard/sessions/${sessionId}/classify`, { activity_type: activityType });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-sessions'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
    } catch (e) {
      Alert.alert(locale === 'pt' ? 'Erro' : 'Error', locale === 'pt' ? 'Não foi possível classificar a sessão.' : 'Could not classify the session.');
    } finally {
      setClassifyingId(null);
    }
  }, [queryClient, locale]);
  
  const mode = data?.mode || 'team';
  const summary = data?.summary || {};
  const athletes = data?.athletes || [];
  const insights = data?.insights || {};
  const positions = data?.positions || [];
  const aggTimeline = data?.aggregated_timeline || [];
  const activitySplit = data?.activity_split || null;
  
  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
    setRefreshing(false);
  };

  // PDF Export handler
  const handleExportPdf = useCallback(async () => {
    if (!data || isGeneratingPdf) return;
    
    const selectedKeys = Object.entries(pdfLayers).filter(([_, v]) => v).map(([k]) => k);
    if (selectedKeys.length === 0) {
      Alert.alert('Error', 'Select at least one section');
      return;
    }
    
    setIsGeneratingPdf(true);
    setPdfModalVisible(false);
    
    try {
      const params = new URLSearchParams({ lang: locale, date_range: selectedDateRange });
      if (selectedAthlete !== 'all') params.set('athlete_id', selectedAthlete);
      if (selectedPosition !== 'all') params.set('position', selectedPosition);
      params.set('layers', selectedKeys.join(','));
      
      const response = await api.get(`/report/dashboard-overview?${params.toString()}`, { responseType: 'text' });
      const html = response.data;
      
      if (!html) throw new Error('Empty response');
      
      if (Platform.OS === 'web') {
        // Web: use hidden iframe for print dialog (no new tab)
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        iframe.style.top = '-9999px';
        document.body.appendChild(iframe);
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(html);
          iframeDoc.close();
          setTimeout(() => {
            iframe.contentWindow?.print();
            setTimeout(() => document.body.removeChild(iframe), 1000);
          }, 600);
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        if (uri) {
          await Sharing.shareAsync(uri, {
            UTI: '.pdf',
            mimeType: 'application/pdf',
            dialogTitle: 'Dashboard Report',
          });
        }
      }
    } catch (error: any) {
      console.error('[PDF] Error:', error);
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        locale === 'pt' ? 'Erro ao gerar PDF' : 'Failed to generate PDF'
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [data, pdfLayers, selectedAthlete, selectedDateRange, selectedPosition, locale, isGeneratingPdf]);
  
  const getModeBadge = () => {
    if (mode === 'athlete') return { label: locale === 'pt' ? 'Individual' : 'Individual', color: COLORS.purple };
    if (mode === 'position') return { label: locale === 'pt' ? 'Posição' : 'Position', color: COLORS.cyan };
    return { label: locale === 'pt' ? 'Equipe' : 'Team', color: COLORS.blue };
  };
  
  const modeBadge = getModeBadge();
  
  // Time since last update
  const lastUpdate = data?.last_update ? (() => {
    const d = new Date(data.last_update);
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  })() : '--:--';
  
  const styles = useMemo(() => createStyles(colors), [colors]);
  
  // ============ LAYER RENDERERS ============
  
  const renderLoadIntelligence = () => {
    // Timeline data
    const timelineData = mode === 'athlete' && athletes[0]?.daily_timeline
      ? athletes[0].daily_timeline : aggTimeline;
    
    const distances = timelineData.map((d: any) => d.total_distance || 0);
    const dateLabels = timelineData.map((d: any) => d.date?.slice(5) || '');
    
    // Acute vs Chronic
    const acuteLoad = mode === 'athlete' ? athletes[0]?.acute_load : summary.team_acute_load;
    const chronicLoad = mode === 'athlete' ? athletes[0]?.chronic_load : summary.team_chronic_load;
    const acwr = mode === 'athlete' ? athletes[0]?.acwr : summary.team_acwr;
    const monotony = mode === 'athlete' ? athletes[0]?.monotony : summary.team_monotony;
    const strain = mode === 'athlete' ? athletes[0]?.strain : summary.team_strain;
    
    // ACWR timeline
    const acwrTimeline = mode === 'athlete' && athletes[0]?.acwr_timeline
      ? athletes[0].acwr_timeline : [];
    
    // Velocity zones
    const vz = mode === 'athlete' && athletes[0]?.velocity_zones
      ? athletes[0].velocity_zones
      : athletes.length > 0
        ? {
          low_intensity: Math.round(athletes.reduce((s: number, a: any) => s + (a.velocity_zones?.low_intensity || 0), 0) / athletes.length),
          hid_z3: Math.round(athletes.reduce((s: number, a: any) => s + (a.velocity_zones?.hid_z3 || 0), 0) / athletes.length),
          hsr_z4: Math.round(athletes.reduce((s: number, a: any) => s + (a.velocity_zones?.hsr_z4 || 0), 0) / athletes.length),
          sprint_z5: Math.round(athletes.reduce((s: number, a: any) => s + (a.velocity_zones?.sprint_z5 || 0), 0) / athletes.length),
        }
        : { low_intensity: 0, hid_z3: 0, hsr_z4: 0, sprint_z5: 0 };
    
    // Heatmap
    const heatmap = mode === 'athlete' && athletes[0]?.weekly_heatmap
      ? athletes[0].weekly_heatmap : [];
    
    // Scatter ACWR vs Load for team mode
    const scatterPoints = mode !== 'athlete'
      ? athletes.filter((a: any) => a.acwr != null).map((a: any) => ({
          x: a.acwr || 0,
          y: a.acute_load || 0,
          name: a.name,
          color: a.risk_level === 'high' ? COLORS.red : a.risk_level === 'moderate' ? COLORS.yellow : a.risk_level === 'optimal' ? COLORS.cyan : COLORS.green
        }))
      : [];
    
    const vzTotal = vz.low_intensity + vz.hid_z3 + vz.hsr_z4 + vz.sprint_z5;
    
    return (
      <View>
        {/* Acute vs Chronic Gauges */}
        <FadeInView delay={0}>
        <View style={styles.card} data-testid="acute-chronic-card">
          <CardInfoHeader id="acwr_load" />
          <ChartEntryView delay={100} duration={700}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <View style={{ flex: 1, alignItems: 'center' }}><GaugeChart value={acuteLoad || 0} max={Math.max(acuteLoad || 1, chronicLoad || 1) * 1.2} label="Acute 7d" color={COLORS.cyan} size={100} /></View>
            <View style={{ flex: 1, alignItems: 'center' }}><GaugeChart value={chronicLoad || 0} max={Math.max(acuteLoad || 1, chronicLoad || 1) * 1.2} label="Chronic 28d" color={COLORS.blue} size={100} /></View>
            <View style={{ flex: 1, alignItems: 'center' }}><GaugeChart value={acwr || 0} max={2} label="ACWR" color={acwr && acwr > 1.5 ? COLORS.red : acwr && acwr < 0.8 ? COLORS.yellow : COLORS.green} size={100} /></View>
          </View>
          </ChartEntryView>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 }}>
            <View style={styles.metricPill}><Text style={styles.metricPillLabel}>Monotony 7d</Text><AnimatedMetric value={monotony || 0} style={styles.metricPillValue} decimals={1} /></View>
            <View style={styles.metricPill}><Text style={styles.metricPillLabel}>Strain 7d</Text><AnimatedMetric value={strain || 0} style={styles.metricPillValue} /></View>
          </View>
        </View>
        </FadeInView>
        
        {/* Load Timeline */}
        <FadeInView delay={120}>
        <View style={styles.card}>
          <CardInfoHeader id="total_distance" />
          <ChartEntryView delay={200} duration={600}>
          <View style={{ marginTop: 8 }}>
            <LineChart lines={[{ data: distances, color: COLORS.cyan }]} labels={dateLabels} showArea height={140} />
          </View>
          </ChartEntryView>
        </View>
        </FadeInView>
        
        {/* ACWR Timeline (athlete mode) */}
        {mode === 'athlete' && acwrTimeline.length > 0 && (
          <FadeInView delay={200}>
          <View style={styles.card}>
            <CardInfoHeader id="acwr_timeline" />
            <ChartEntryView delay={100} duration={600}>
            <View style={{ marginTop: 8 }}>
              <LineChart 
                lines={[
                  { data: acwrTimeline.map((d: any) => d.acwr), color: COLORS.green },
                  { data: acwrTimeline.map(() => 1.3), color: COLORS.yellow, dashed: true },
                  { data: acwrTimeline.map(() => 0.8), color: COLORS.yellow, dashed: true },
                ]} 
                labels={acwrTimeline.map((d: any) => d.date?.slice(5))}
                height={140}
              />
            </View>
            </ChartEntryView>
          </View>
          </FadeInView>
        )}
        
        {/* Deviation Chart — Team/Position mode (ACWR zone positioning) */}
        {mode !== 'athlete' && scatterPoints.length > 0 && (
          <FadeInView delay={250}>
          <View style={styles.card}>
            <CardInfoHeader id="acwr_vs_load" />
            <ChartEntryView delay={100} duration={500}>
            <AcwrDeviationChart points={scatterPoints} height={150} />
            </ChartEntryView>
          </View>
          </FadeInView>
        )}
        
        {/* Velocity Zones */}
        <FadeInView delay={300}>
        <View style={styles.card}>
          <CardInfoHeader id="velocity_zones" />
          <ChartEntryView delay={100} duration={500}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 }}>
            <DonutChart 
              segments={[
                { value: vz.low_intensity, color: COLORS.blue, label: 'Low' },
                { value: vz.hid_z3, color: COLORS.cyan, label: 'HID' },
                { value: vz.hsr_z4, color: COLORS.yellow, label: 'HSR' },
                { value: vz.sprint_z5, color: COLORS.red, label: 'Sprint' },
              ]}
              size={90}
              centerText={vzTotal > 1000 ? `${(vzTotal/1000).toFixed(0)}k` : `${vzTotal}`}
              centerSubtext="m"
            />
            <View style={{ flex: 1 }}>
              <HorizontalBar value={vz.low_intensity} max={vzTotal || 1} label="Low Intensity" color={COLORS.blue} />
              <HorizontalBar value={vz.hid_z3} max={vzTotal || 1} label="HID Z3" color={COLORS.cyan} />
              <HorizontalBar value={vz.hsr_z4} max={vzTotal || 1} label="HSR Z4" color={COLORS.yellow} />
              <HorizontalBar value={vz.sprint_z5} max={vzTotal || 1} label="Sprint Z5" color={COLORS.red} />
            </View>
          </View>
          </ChartEntryView>
        </View>
        </FadeInView>
        
        {/* Weekly Heatmap */}
        {heatmap.length > 0 && (
          <FadeInView delay={400}>
          <View style={styles.card}>
            <CardInfoHeader id="weekly_heatmap" />
            <ChartEntryView delay={100} duration={600}>
            <View style={{ marginTop: 8 }}>
              <WeeklyHeatmap data={heatmap} />
            </View>
            </ChartEntryView>
          </View>
          </FadeInView>
        )}
        
        {/* Load Ranking Table */}
        {mode !== 'athlete' && (
          <View style={styles.card}>
            <CardInfoHeader id="load_ranking" />
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 2 }]}>{locale === 'pt' ? 'Atleta' : 'Athlete'}</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>ACWR</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>{locale === 'pt' ? 'Carga 7d' : 'Load 7d'}</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>Strain</Text>
              </View>
              {athletes.slice(0, 10).sort((a: any, b: any) => (b.acute_load || 0) - (a.acute_load || 0)).map((a: any, i: number) => (
                <View key={a.id} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                  <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{a.name}</Text>
                  <Text style={[styles.tableCell, { flex: 1, color: a.risk_level === 'high' ? COLORS.red : a.risk_level === 'moderate' ? COLORS.yellow : COLORS.green }]}>{a.acwr?.toFixed(2) || '--'}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{a.acute_load ? `${(a.acute_load/1000).toFixed(1)}k` : '--'}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{a.strain ? Math.round(a.strain).toLocaleString() : '--'}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        
        {/* Insight */}
        <View style={styles.insightCard}>
          <Ionicons name="bulb-outline" size={16} color={COLORS.yellow} />
          <Text style={styles.insightText}>{insights.load_intelligence || ''}</Text>
        </View>
      </View>
    );
  };
  
  const renderSmartSummary = () => {
    // Defensive normalization: ensures Smart Summary never crashes when backend
    // returns partial/empty payloads (no GPS, 0 athletes, single athlete without data).
    const safeSummary = {
      team_acwr: null,
      team_wellness: null,
      team_monotony: null,
      team_lmpi: null,
      team_rsimod: null,
      team_acute_load: 0,
      team_chronic_load: 0,
      team_readiness: null,
      available: 0,
      total_athletes: 0,
      risk_distribution: {} as any,
      ...(summary || {}),
    };
    const safeAthletes = Array.isArray(athletes) ? athletes : [];
    const safeInsights = (insights && typeof insights === 'object') ? insights : {};

    // ===== CONTEXT-AWARE VALIDITY GUARD =====
    // Smart Summary depends on LMPI, which requires GPS data (ACWR is mandatory).
    // Without at least one valid LMPI in the current context, the layer must NOT
    // render — its charts collapse to zero values and trigger native iOS crashes.
    const hasValidLmpi = mode === 'athlete'
      ? (safeAthletes[0]?.lmpi_validity && safeAthletes[0].lmpi_validity !== 'invalid')
      : safeAthletes.some((a: any) => a && a.lmpi_validity && a.lmpi_validity !== 'invalid');

    if (!hasValidLmpi) {
      return (
        <View style={styles.card} data-testid="smart-summary-empty-state">
          <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 }}>
            <Ionicons name="bar-chart-outline" size={36} color={colors.text.tertiary} />
            <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600', marginTop: 12, textAlign: 'center' }}>
              {locale === 'pt' ? 'Não há dados suficientes' : 'Not enough data'}
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 6, textAlign: 'center', lineHeight: 16 }}>
              {locale === 'pt'
                ? 'Importe atividades GPS para visualizar o LMPI e o Smart Summary.'
                : 'Import GPS activities to see LMPI and the Smart Summary.'}
            </Text>
          </View>
        </View>
      );
    }

    const lmpi = mode === 'athlete' ? safeAthletes[0]?.lmpi : safeSummary.team_lmpi;
    const lmpiValidity = mode === 'athlete' ? (safeAthletes[0]?.lmpi_validity || 'invalid') : (lmpi != null ? 'valid' : 'invalid');
    const acwr = mode === 'athlete' ? safeAthletes[0]?.acwr : safeSummary.team_acwr;
    const wellness = mode === 'athlete' ? safeAthletes[0]?.wellness_score : safeSummary.team_wellness;
    const rsimod = mode === 'athlete' ? safeAthletes[0]?.rsimod : safeSummary.team_rsimod;
    const monotony = mode === 'athlete' ? safeAthletes[0]?.monotony : safeSummary.team_monotony;
    const lmpiClass = getLmpiClassification(lmpi, lmpiValidity, locale);
    
    // Radar data: normalized 0-1
    const radarValues = [
      acwr ? (acwr <= 1.3 ? acwr / 1.3 : Math.max(0, 2 - acwr) / 0.7) : 0,
      wellness ? wellness / 10 : 0,
      rsimod ? Math.min(rsimod / 0.5, 1) : 0,
      monotony ? Math.max(0, 1 - (monotony - 1) / 2) : 0.5,
      lmpi ? lmpi / 100 : 0,
    ];
    
    // Quadrant: RSImod vs Player Load (Neuromuscular response vs External load)
    // Replaces the redundant ACWR vs Wellness (kept in Risk Intelligence).
    const rsiPlRaw = mode !== 'athlete'
      ? safeAthletes.filter((a: any) => a && a.rsimod != null && a.speed_metabolic?.avg_player_load != null)
          .map((a: any) => ({ x: a.speed_metabolic.avg_player_load, y: a.rsimod, name: a.name }))
      : [];
    const plMid = rsiPlRaw.length ? rsiPlRaw.reduce((s: number, p: any) => s + p.x, 0) / rsiPlRaw.length : undefined;
    const rsiMid = rsiPlRaw.length ? rsiPlRaw.reduce((s: number, p: any) => s + p.y, 0) / rsiPlRaw.length : undefined;
    const rsiPlPoints = rsiPlRaw.map((p: any) => {
      const highPL = plMid != null && p.x >= plMid;
      const highRSI = rsiMid != null && p.y >= rsiMid;
      // Q1 high/high = good (green); Q2 highPL/lowRSI = fatigue (red);
      // Q3 lowPL/highRSI = fresh (cyan); Q4 low/low = reduced readiness (yellow)
      let color = COLORS.green;
      if (highPL && !highRSI) color = COLORS.red;
      else if (!highPL && highRSI) color = COLORS.cyan;
      else if (!highPL && !highRSI) color = COLORS.yellow;
      return { x: p.x, y: p.y, name: p.name, color };
    });
    
    // Availability donut — risk_distribution may be missing or non-object in empty states.
    // Labels reframed to AVAILABILITY semantics (this is the Availability card): the
    // worst tier (high risk) reads as "Low" availability, not "High". Risk Intelligence
    // keeps its own risk-tier labels untouched. Colors/values/thresholds unchanged.
    const riskDist = (safeSummary.risk_distribution && typeof safeSummary.risk_distribution === 'object')
      ? safeSummary.risk_distribution
      : {};
    const availDonutSegs = [
      { value: riskDist.optimal || 0, color: COLORS.cyan, label: locale === 'pt' ? 'Ótima' : 'Optimal' },
      { value: riskDist.low || 0, color: COLORS.green, label: locale === 'pt' ? 'Alta' : 'High' },
      { value: riskDist.moderate || 0, color: COLORS.yellow, label: locale === 'pt' ? 'Moderada' : 'Moderate' },
      { value: riskDist.high || 0, color: COLORS.red, label: locale === 'pt' ? 'Baixa' : 'Low' },
      { value: riskDist.unknown || 0, color: '#475569', label: 'N/A' },
    ].filter(s => s.value > 0);
    
    return (
      <View>
        {/* LMPI Gauge */}
        <View style={styles.card} data-testid="lmpi-gauge-card">
          <CardInfoHeader id="lmpi" subtitle="LoadManager Performance Indicator" />
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <GaugeChart value={lmpiValidity !== 'invalid' && lmpi != null ? lmpi : 0} max={100} label={lmpiValidity === 'invalid' ? '--' : 'LMPI'} color={lmpiClass.color} size={150} />
            {/* Classification Badge */}
            <View data-testid="lmpi-classification-badge" style={{ marginTop: 6, paddingHorizontal: 14, paddingVertical: 4, borderRadius: 12, backgroundColor: lmpiClass.bgColor, borderWidth: 1, borderColor: lmpiClass.color + '40' }}>
              <Text style={{ color: lmpiClass.color, fontSize: 13, fontWeight: '700', letterSpacing: 0.3 }}>{lmpiClass.label}</Text>
            </View>
            {lmpiValidity === 'partial' && (
              <Text data-testid="lmpi-partial-indicator" style={{ color: colors.text.secondary, fontSize: 10, marginTop: 4 }}>
                {locale === 'pt' ? '* Dados parciais (apenas carga)' : '* Partial data (load only)'}
              </Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 8, flexWrap: 'wrap', gap: 4 }}>
            <View style={styles.metricPill}><Text style={styles.metricPillLabel}>ACWR</Text><Text style={styles.metricPillValue}>{acwr?.toFixed(2) || '--'}</Text></View>
            <View style={styles.metricPill}><Text style={styles.metricPillLabel}>Wellness</Text><Text style={styles.metricPillValue}>{wellness?.toFixed(1) || '--'}</Text></View>
            <View style={styles.metricPill}><Text style={styles.metricPillLabel}>RSImod</Text><Text style={styles.metricPillValue}>{rsimod?.toFixed(2) || '--'}</Text></View>
          </View>
        </View>
        
        {/* Radar */}
        <View style={styles.card}>
          <CardInfoHeader id="performance_profile" />
          <View style={{ alignItems: 'center', marginTop: 4 }}>
            <RadarChart values={radarValues} labels={['Load', 'Wellness', 'Neuro', 'Recovery', 'LMPI']} size={180} />
          </View>
        </View>
        
        {/* Quadrant RSImod vs Player Load (Neuromuscular response vs External load) */}
        {mode !== 'athlete' && rsiPlPoints.length > 0 && (
          <View style={styles.card} data-testid="rsimod-playerload-card">
            <CardInfoHeader id="rsimod_playerload" />
            <QuadrantChart points={rsiPlPoints} xLabel="Player Load" yLabel="RSImod" xMid={plMid} yMid={rsiMid} height={200} autoScale />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.green, marginRight: 4 }} /><Text style={{ color: colors.text.secondary, fontSize: 9 }}>{locale === 'pt' ? 'Boa tolerância' : 'Good tolerance'}</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.red, marginRight: 4 }} /><Text style={{ color: colors.text.secondary, fontSize: 9 }}>{locale === 'pt' ? 'Possível fadiga' : 'Possible fatigue'}</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.cyan, marginRight: 4 }} /><Text style={{ color: colors.text.secondary, fontSize: 9 }}>{locale === 'pt' ? 'Fresco/recuperado' : 'Fresh/recovered'}</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.yellow, marginRight: 4 }} /><Text style={{ color: colors.text.secondary, fontSize: 9 }}>{locale === 'pt' ? 'Prontidão reduzida' : 'Reduced readiness'}</Text></View>
            </View>
          </View>
        )}
        
        {/* Availability Donut */}
        {mode !== 'athlete' && (
          <View style={styles.card}>
            <CardInfoHeader id="availability" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 }}>
              <DonutChart segments={availDonutSegs} size={100} centerText={`${safeSummary.available || 0}`} centerSubtext={locale === 'pt' ? 'disponíveis' : 'available'} />
              <View style={{ flex: 1 }}>
                {availDonutSegs.map((s, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color, marginRight: 6 }} />
                    <Text style={{ color: colors.text.secondary, fontSize: 11, flex: 1 }}>{s.label}</Text>
                    <Text style={{ color: colors.text.primary, fontSize: 11, fontWeight: '600' }}>{s.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}
        
        {/* Athlete LMPI Condition Table */}
        {mode !== 'athlete' && (
          <View style={styles.card} data-testid="lmpi-rankings-table">
            <CardInfoHeader id="lmpi_rankings" />
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 2 }]}>{locale === 'pt' ? 'Atleta' : 'Athlete'}</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>Score LMPI</Text>
                <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>{locale === 'pt' ? 'Condição' : 'Condition'}</Text>
              </View>
              {[...safeAthletes]
                .filter((a: any) => a && a.lmpi_validity !== 'invalid')
                .sort((a: any, b: any) => (a.lmpi || 0) - (b.lmpi || 0))
                .slice(0, 5)
                .map((a: any, i: number) => {
                  const cls = getLmpiClassification(a.lmpi, a.lmpi_validity, locale);
                  return (
                    <View key={a.id || `row-${i}`} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]} data-testid={`lmpi-ranking-row-${i}`}>
                      <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{a.name}</Text>
                      <Text style={[styles.tableCell, { flex: 1, color: cls.color, fontWeight: '600' }]}>{a.lmpi?.toFixed(0) || '--'}</Text>
                      <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: cls.bgColor }}>
                          <Text style={{ color: cls.color, fontSize: 11, fontWeight: '600' }}>{cls.label}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
            </View>
          </View>
        )}
        
        {/* Insight */}
        <View style={styles.insightCard}>
          <Ionicons name="bulb-outline" size={16} color={COLORS.yellow} />
          <Text style={styles.insightText}>{(safeInsights as any).smart_summary || ''}</Text>
        </View>
      </View>
    );
  };
  
  const renderTeamStatus = () => {
    const readiness = mode === 'athlete' ? athletes[0]?.readiness_score : summary.team_readiness;
    const wellness = mode === 'athlete' ? athletes[0]?.wellness_score : summary.team_wellness;
    const details = mode === 'athlete' ? athletes[0]?.wellness_details : null;
    const wellTimeline = mode === 'athlete' ? athletes[0]?.wellness_timeline : [];
    
    // Aggregate wellness bars (team mode) — only from athletes WITH wellness data
    const athletesWithWellness = athletes.filter((a: any) => a.wellness_details && Object.keys(a.wellness_details).length > 0);
    const teamWellnessDetails = mode !== 'athlete' && athletesWithWellness.length > 0 ? {
      sleep: athletesWithWellness.reduce((s: number, a: any) => s + (a.wellness_details?.sleep ?? 0), 0) / athletesWithWellness.length,
      fatigue: athletesWithWellness.reduce((s: number, a: any) => s + (a.wellness_details?.fatigue ?? 0), 0) / athletesWithWellness.length,
      stress: athletesWithWellness.reduce((s: number, a: any) => s + (a.wellness_details?.stress ?? 0), 0) / athletesWithWellness.length,
      soreness: athletesWithWellness.reduce((s: number, a: any) => s + (a.wellness_details?.soreness ?? 0), 0) / athletesWithWellness.length,
      mood: athletesWithWellness.reduce((s: number, a: any) => s + (a.wellness_details?.mood ?? 0), 0) / athletesWithWellness.length,
    } : details;
    
    const wDet = teamWellnessDetails || {};
    const hasWellnessData = teamWellnessDetails != null;
    
    // Cumulative load
    const timelineData = mode === 'athlete' && athletes[0]?.daily_timeline
      ? athletes[0].daily_timeline : aggTimeline;
    const cumulativeData: number[] = [];
    let cumSum = 0;
    timelineData.forEach((d: any) => { cumSum += d.total_distance || 0; cumulativeData.push(cumSum); });
    const dateLabels = timelineData.map((d: any) => d.date?.slice(5) || '');
    
    // Availability donut
    const riskDist = summary.risk_distribution || {};
    const availSegs = [
      { value: (riskDist.optimal || 0) + (riskDist.low || 0), color: COLORS.green, label: locale === 'pt' ? 'Disponível' : 'Available' },
      { value: riskDist.moderate || 0, color: COLORS.yellow, label: locale === 'pt' ? 'Atenção' : 'Attention' },
      { value: (riskDist.high || 0) + (riskDist.unknown || 0), color: COLORS.red, label: locale === 'pt' ? 'Indisponível' : 'Unavailable' },
    ].filter(s => s.value > 0);
    
    return (
      <View>
        {/* Readiness Gauge */}
        <View style={styles.card}>
          <CardInfoHeader id="team_readiness" />
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <GaugeChart value={readiness || 0} max={100} label={locale === 'pt' ? 'Prontidão' : 'Readiness'} color={readiness && readiness > 60 ? COLORS.green : readiness && readiness > 40 ? COLORS.yellow : COLORS.red} size={140} />
          </View>
          {wellness != null && (
            <View style={{ alignItems: 'center', marginTop: 6 }}>
              <Text style={{ color: colors.text.secondary, fontSize: 11 }}>{locale === 'pt' ? 'Wellness Médio' : 'Avg Wellness'}: {wellness?.toFixed(1) || '--'}/10</Text>
            </View>
          )}
        </View>
        
        {/* Wellness Bars */}
        <View style={styles.card}>
          <CardInfoHeader id="wellness_summary" />
          <View style={{ marginTop: 8 }}>
            <HorizontalBar value={hasWellnessData ? (wDet.sleep ?? 0) : 0} max={10} label={locale === 'pt' ? 'Sono' : 'Sleep'} color={COLORS.blue} />
            <HorizontalBar value={hasWellnessData && wDet.fatigue != null ? (10 - wDet.fatigue) : 0} max={10} label={locale === 'pt' ? 'Energia (inv. Fadiga)' : 'Energy (inv. Fatigue)'} color={COLORS.cyan} />
            <HorizontalBar value={hasWellnessData && wDet.stress != null ? (10 - wDet.stress) : 0} max={10} label={locale === 'pt' ? 'Calma (inv. Stress)' : 'Calm (inv. Stress)'} color={COLORS.green} />
            <HorizontalBar value={hasWellnessData && wDet.soreness != null ? (10 - wDet.soreness) : 0} max={10} label={locale === 'pt' ? 'Conforto (inv. Dor)' : 'Comfort (inv. Soreness)'} color={COLORS.purple} />
            <HorizontalBar value={hasWellnessData ? (wDet.mood ?? 0) : 0} max={10} label={locale === 'pt' ? 'Humor' : 'Mood'} color={COLORS.orange} />
          </View>
        </View>
        
        {/* Wellness timeline (athlete mode) */}
        {mode === 'athlete' && wellTimeline && wellTimeline.length > 0 && (
          <View style={styles.card}>
            <CardInfoHeader id="wellness_evolution" />
            <LineChart lines={[{ data: wellTimeline.map((w: any) => w.score), color: COLORS.green }]} labels={wellTimeline.map((w: any) => w.date?.slice(5))} showArea height={140} />
          </View>
        )}
        
        {/* Cumulative Load */}
        <View style={styles.card}>
          <CardInfoHeader id="cumulative_load" />
          <LineChart lines={[{ data: cumulativeData, color: COLORS.cyan }]} labels={dateLabels} showArea height={140} />
        </View>
        
        {/* Availability donut */}
        {mode !== 'athlete' && (
          <View style={styles.card}>
            <CardInfoHeader id="availability" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 }}>
              <DonutChart segments={availSegs} size={90} centerText={`${summary.available || 0}/${summary.total_athletes || 0}`} centerSubtext="" />
              <View style={{ flex: 1 }}>
                {availSegs.map((s, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color, marginRight: 6 }} />
                    <Text style={{ color: colors.text.secondary, fontSize: 11, flex: 1 }}>{s.label}</Text>
                    <Text style={{ color: colors.text.primary, fontSize: 11, fontWeight: '600' }}>{s.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}
        
        {/* Low readiness table */}
        {mode !== 'athlete' && (
          <View style={styles.card}>
            <CardInfoHeader id="low_readiness" />
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 2 }]}>{locale === 'pt' ? 'Atleta' : 'Athlete'}</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>Wellness</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>ACWR</Text>
              </View>
              {athletes.filter((a: any) => a.wellness_score && a.wellness_score < 6).sort((a: any, b: any) => (a.wellness_score || 10) - (b.wellness_score || 10)).slice(0, 5).map((a: any, i: number) => (
                <View key={a.id} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                  <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{a.name}</Text>
                  <Text style={[styles.tableCell, { flex: 1, color: a.wellness_score < 4 ? COLORS.red : COLORS.yellow }]}>{a.wellness_score?.toFixed(1) || '--'}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{a.acwr?.toFixed(2) || '--'}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        
        <View style={styles.insightCard}>
          <Ionicons name="bulb-outline" size={16} color={COLORS.yellow} />
          <Text style={styles.insightText}>{insights.team_status || ''}</Text>
        </View>
      </View>
    );
  };
  
  const renderNeuromuscular = () => {
    const rsimod = mode === 'athlete' ? athletes[0]?.rsimod : summary.team_rsimod;
    const jumpMetrics = mode === 'athlete' ? athletes[0]?.jump_metrics : null;
    const rsiTimeline = mode === 'athlete' ? athletes[0]?.rsimod_timeline : [];
    const vbtMetrics = mode === 'athlete' ? athletes[0]?.vbt_metrics : null;
    
    // For team: get all athletes with RSImod
    const athletesWithRsi = athletes.filter((a: any) => a.rsimod != null);
    
    // Radar: CMJ metrics (athlete mode)
    const radarVals = jumpMetrics ? [
      jumpMetrics.jump_height_cm ? Math.min(jumpMetrics.jump_height_cm / 45, 1) : 0,
      jumpMetrics.rsimod ? Math.min(jumpMetrics.rsimod / 0.5, 1) : 0,
      jumpMetrics.flight_time_ms ? Math.min(jumpMetrics.flight_time_ms / 600, 1) : 0,
      jumpMetrics.contraction_time_ms ? Math.min(1 - (jumpMetrics.contraction_time_ms || 0) / 1000, 1) : 0.5,
    ] : [0, 0, 0, 0];
    
    // VBT Fatigue bars (team)
    const vbtFatigueData = athletes.filter((a: any) => a.vbt_fatigue_pct != null).map((a: any) => ({
      name: a.name.split(' ')[0],
      value: a.vbt_fatigue_pct
    }));
    
    // Neuromuscular gauge
    const neuroScore = rsimod ? Math.min(rsimod / 0.5 * 100, 100) : 0;
    
    return (
      <View>
        {/* Neuromuscular Gauge */}
        <View style={styles.card}>
          <CardInfoHeader id="neuro_status" />
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <GaugeChart value={neuroScore} max={100} label="Neuro Score" color={neuroScore > 70 ? COLORS.green : neuroScore > 40 ? COLORS.yellow : COLORS.red} size={140} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 }}>
            <View style={styles.metricPill}><Text style={styles.metricPillLabel}>RSImod</Text><Text style={styles.metricPillValue}>{rsimod?.toFixed(2) || '--'}</Text></View>
            {jumpMetrics?.fatigue_index != null && (
              <View style={styles.metricPill}><Text style={styles.metricPillLabel}>{locale === 'pt' ? 'Índ. Fadiga' : 'Fatigue Idx'}</Text><Text style={[styles.metricPillValue, { color: jumpMetrics.fatigue_index < -10 ? COLORS.red : jumpMetrics.fatigue_index < -5 ? COLORS.yellow : COLORS.green }]}>{jumpMetrics.fatigue_index.toFixed(1)}%</Text></View>
            )}
          </View>
        </View>
        
        {/* RSImod Timeline (athlete) or Bar comparison (team) */}
        {mode === 'athlete' && rsiTimeline && rsiTimeline.length > 0 ? (
          <View style={styles.card}>
            <CardInfoHeader id="rsimod_long" />
            <LineChart 
              lines={[
                { data: rsiTimeline.map((d: any) => d.rsimod), color: COLORS.purple },
                ...(jumpMetrics?.baseline_rsi ? [{ data: rsiTimeline.map(() => jumpMetrics.baseline_rsi), color: COLORS.yellow, dashed: true }] : [])
              ]}
              labels={rsiTimeline.map((d: any) => d.date?.slice(5))}
              showArea height={140}
            />
          </View>
        ) : mode !== 'athlete' && athletesWithRsi.length > 0 ? (
          <View style={styles.card}>
            <CardInfoHeader id="rsimod_by_athlete" />
            <View style={{ marginTop: 8 }}>
              {athletesWithRsi.sort((a: any, b: any) => (b.rsimod || 0) - (a.rsimod || 0)).slice(0, 8).map((a: any, i: number) => (
                <HorizontalBar key={a.id} value={a.rsimod || 0} max={0.6} label={a.name.split(' ').slice(0, 2).join(' ')} color={a.rsimod > 0.4 ? COLORS.green : a.rsimod > 0.25 ? COLORS.yellow : COLORS.red} />
              ))}
            </View>
          </View>
        ) : null}
        
        {/* CMJ Radar (athlete mode) */}
        {mode === 'athlete' && jumpMetrics && (
          <View style={styles.card}>
            <CardInfoHeader id="cmj_profile" />
            <View style={{ alignItems: 'center' }}>
              <RadarChart values={radarVals} labels={['Height', 'RSImod', 'Flight T', 'Reactivity']} size={180} />
            </View>
          </View>
        )}
        
        {/* VBT Fatigue */}
        {vbtFatigueData.length > 0 && mode !== 'athlete' ? (
          <View style={styles.card}>
            <CardInfoHeader id="velocity_deviation" />
            <VelocityDeviationChart
              data={vbtFatigueData.sort((a, b) => b.value - a.value).slice(0, 30)}
              locale={locale}
            />
          </View>
        ) : mode === 'athlete' && vbtMetrics?.exercises ? (
          <View style={styles.card}>
            <CardInfoHeader id="vbt_by_exercise" />
            <View style={{ marginTop: 8 }}>
              {Object.entries(vbtMetrics.exercises).map(([ex, data]: [string, any], i: number) => (
                <View key={ex} style={{ marginBottom: 12, borderBottomWidth: i < Object.keys(vbtMetrics.exercises).length - 1 ? 1 : 0, borderBottomColor: colors.border.default, paddingBottom: 8 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>{ex}</Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Text style={{ color: colors.text.secondary, fontSize: 11 }}>MV: {data.mean_velocity?.toFixed(2) || '--'} m/s</Text>
                    <Text style={{ color: colors.text.secondary, fontSize: 11 }}>PV: {data.peak_velocity?.toFixed(2) || '--'} m/s</Text>
                    {data.fatigue_pct != null && <Text style={{ color: data.fatigue_pct > 15 ? COLORS.red : COLORS.green, fontSize: 11 }}>Loss: {data.fatigue_pct.toFixed(1)}%</Text>}
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        
        <View style={styles.insightCard}>
          <Ionicons name="bulb-outline" size={16} color={COLORS.yellow} />
          <Text style={styles.insightText}>{insights.neuromuscular || ''}</Text>
        </View>
      </View>
    );
  };
  
  const renderRiskIntelligence = () => {
    // ACWR vs Wellness quadrant
    const quadrantPoints = mode !== 'athlete'
      ? athletes.filter((a: any) => a.acwr != null && a.wellness_score != null).map((a: any) => ({
          x: a.acwr, y: a.wellness_score, name: a.name,
          color: a.risk_level === 'high' ? COLORS.red : a.risk_level === 'moderate' ? COLORS.yellow : COLORS.green
        }))
      : [];
    
    // RSImod vs ACWR scatter
    const rsiAcwrPoints = mode !== 'athlete'
      ? athletes.filter((a: any) => a.acwr != null && a.rsimod != null).map((a: any) => ({
          x: a.acwr, y: a.rsimod, name: a.name,
          color: a.risk_level === 'high' ? COLORS.red : a.risk_level === 'moderate' ? COLORS.yellow : COLORS.green
        }))
      : [];
    
    // Risk score gauge
    const riskScore = mode === 'athlete' ? athletes[0]?.risk_score : 
      athletes.length > 0 ? Math.round(athletes.reduce((s: number, a: any) => s + (a.risk_score || 0), 0) / athletes.length) : 0;
    
    // Asymmetry data (for risk)
    const asymmetryAthletes = athletes.filter((a: any) => a.asymmetry?.risk_flag);
    
    return (
      <View>
        {/* Risk Score Gauge */}
        <View style={styles.card}>
          <CardInfoHeader id="risk_score" />
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <GaugeChart value={riskScore || 0} max={100} label={locale === 'pt' ? 'Risco' : 'Risk'} color={riskScore && riskScore > 60 ? COLORS.red : riskScore && riskScore > 30 ? COLORS.yellow : COLORS.green} size={140} />
          </View>
        </View>
        
        {/* ACWR vs Wellness Quadrant */}
        {mode !== 'athlete' && quadrantPoints.length > 0 && (
          <View style={styles.card}>
            <CardInfoHeader id="acwr_wellness" />
            <QuadrantChart points={quadrantPoints} xLabel="ACWR" yLabel="Wellness" xMid={1.3} yMid={5} height={200} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.green, marginRight: 4 }} /><Text style={{ color: colors.text.secondary, fontSize: 9 }}>{locale === 'pt' ? 'Ótimo' : 'Optimal'}</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.yellow, marginRight: 4 }} /><Text style={{ color: colors.text.secondary, fontSize: 9 }}>{locale === 'pt' ? 'Atenção' : 'Attention'}</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.red, marginRight: 4 }} /><Text style={{ color: colors.text.secondary, fontSize: 9 }}>{locale === 'pt' ? 'Alto Risco' : 'High Risk'}</Text></View>
            </View>
          </View>
        )}
        
        {/* RSImod vs ACWR Scatter */}
        {mode !== 'athlete' && rsiAcwrPoints.length > 0 && (
          <View style={styles.card}>
            <CardInfoHeader id="rsi_vs_acwr" />
            <QuadrantChart points={rsiAcwrPoints} xLabel="ACWR" yLabel="RSImod" xMid={1.3} height={180} />
          </View>
        )}
        
        {/* SL-CMJ Asymmetry Risk — hidden from UI */}
        {false && asymmetryAthletes.length > 0 && (
          <View style={styles.card}>
            <CardInfoHeader id="asymmetry_alert" />
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 2 }]}>{locale === 'pt' ? 'Atleta' : 'Athlete'}</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>Asym %</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>Dom</Text>
              </View>
              {asymmetryAthletes.map((a: any, i: number) => (
                <View key={a.id} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                  <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{a.name}</Text>
                  <Text style={[styles.tableCell, { flex: 1, color: COLORS.red }]}>{a.asymmetry.height_pct?.toFixed(1)}%</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{a.asymmetry.dominant === 'right' ? 'D' : 'E'}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        
        {/* Full Risk Table */}
        {mode !== 'athlete' && (
          <View style={styles.card}>
            <CardInfoHeader id="risk_panel" />
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 2 }]}>{locale === 'pt' ? 'Atleta' : 'Athlete'}</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>ACWR</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>RSImod</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>Well</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>{locale === 'pt' ? 'Risco' : 'Risk'}</Text>
              </View>
              {athletes.sort((a: any, b: any) => (b.risk_score || 0) - (a.risk_score || 0)).slice(0, 10).map((a: any, i: number) => (
                <View key={a.id} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                  <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{a.name}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{a.acwr?.toFixed(2) || '--'}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{a.rsimod?.toFixed(2) || '--'}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{a.wellness_score?.toFixed(1) || '--'}</Text>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: a.risk_level === 'high' ? COLORS.red : a.risk_level === 'moderate' ? COLORS.yellow : a.risk_level === 'optimal' ? COLORS.cyan : COLORS.green }} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
        
        <View style={styles.insightCard}>
          <Ionicons name="bulb-outline" size={16} color={COLORS.yellow} />
          <Text style={styles.insightText}>{insights.risk_intelligence || ''}</Text>
        </View>
      </View>
    );
  };
  
  const renderSpeedMetabolic = () => {
    // Period aggregates: athlete = individual values; team/position = group averages
    const sm = mode === 'athlete'
      ? (athletes[0]?.speed_metabolic || {})
      : {
          max_velocity_percent: summary.team_max_velocity_percent,
          avg_player_load: summary.team_avg_player_load,
          player_load_per_min: summary.team_player_load_per_min,
          high_metabolic_load: summary.team_high_metabolic_load,
        };
    const maxVel = sm.max_velocity_percent;
    const avgPL = sm.avg_player_load;
    const hml = sm.high_metabolic_load;
    const plPerMin = sm.player_load_per_min;

    // Line chart timeline: Average Player Load vs Player Load Per Minute
    const smTimeline = mode === 'athlete' && athletes[0]?.sm_timeline
      ? athletes[0].sm_timeline
      : aggTimeline;
    const plData = smTimeline.map((d: any) => d.player_load || 0);
    const plpmData = smTimeline.map((d: any) => d.player_load_per_min || 0);
    const dateLabels = smTimeline.map((d: any) => d.date?.slice(5) || '');
    const hasTimeline = plData.some((v: number) => v > 0) || plpmData.some((v: number) => v > 0);

    return (
      <View>
        {/* Top gauges: Max Velocity (%), Average Player Load, High Metabolic Load */}
        <FadeInView delay={0}>
        <View style={styles.card} data-testid="speed-metabolic-gauges-card">
          <CardInfoHeader id="sm_gauges" />
          <ChartEntryView delay={100} duration={700}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 8, flexWrap: 'wrap' }}>
            <GaugeChart value={(maxVel ?? undefined) as any} max={100} label={locale === 'pt' ? 'Vel. Máx %' : 'Max Vel %'} color={COLORS.cyan} size={110} />
            <GaugeChart value={(avgPL ?? undefined) as any} max={Math.max(avgPL || 1, 1) * 1.3} label={locale === 'pt' ? 'Player Load' : 'Player Load'} color={COLORS.blue} size={110} />
            <GaugeChart value={(hml ?? undefined) as any} max={Math.max(hml || 1, 1) * 1.3} label={locale === 'pt' ? 'Carga Metab.' : 'High Metab.'} color={COLORS.orange} size={110} />
          </View>
          </ChartEntryView>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 }}>
            <View style={styles.metricPill} data-testid="sm-pill-plpm"><Text style={styles.metricPillLabel}>PL/min</Text><Text style={styles.metricPillValue}>{plPerMin != null ? plPerMin.toFixed(1) : '--'}</Text></View>
            <View style={styles.metricPill} data-testid="sm-pill-maxvel"><Text style={styles.metricPillLabel}>{locale === 'pt' ? 'Vel. Máx %' : 'Max Vel %'}</Text><Text style={styles.metricPillValue}>{maxVel != null ? `${maxVel.toFixed(0)}%` : '--'}</Text></View>
          </View>
        </View>
        </FadeInView>

        {/* Line chart: Average Player Load vs Player Load Per Minute */}
        <FadeInView delay={120}>
        <View style={styles.card} data-testid="speed-metabolic-chart-card">
          <CardInfoHeader id="sm_pl_chart" />
          <ChartEntryView delay={200} duration={600}>
          <View style={{ marginTop: 8 }}>
            {hasTimeline ? (
              <LineChart
                lines={[
                  { data: plData, color: COLORS.blue },
                  { data: plpmData, color: COLORS.cyan, dashed: true },
                ]}
                labels={dateLabels}
                showArea height={150}
              />
            ) : (
              <Text style={{ color: colors.text.tertiary, fontSize: 12, textAlign: 'center', paddingVertical: 24 }} data-testid="sm-chart-empty">
                {locale === 'pt' ? 'Sem dados de Player Load no período.' : 'No Player Load data in the period.'}
              </Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 12, height: 3, backgroundColor: COLORS.blue, borderRadius: 2 }} /><Text style={{ color: colors.text.secondary, fontSize: 10 }}>{locale === 'pt' ? 'Player Load Médio' : 'Avg Player Load'}</Text></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 12, height: 3, backgroundColor: COLORS.cyan, borderRadius: 2 }} /><Text style={{ color: colors.text.secondary, fontSize: 10 }}>Player Load / min</Text></View>
          </View>
          </ChartEntryView>
        </View>
        </FadeInView>

        {/* Game vs Training comparison (Phase 4B) — explicit classification only */}
        <FadeInView delay={200}>
        <View style={styles.card} data-testid="game-training-card">
          <CardInfoHeader id="sm_game_training" />
          <TouchableOpacity
            onPress={() => setClassifyModalVisible(true)}
            data-testid="open-classify-modal"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(124,196,255,0.10)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginTop: 4, marginBottom: 4 }}
          >
            <Ionicons name="pricetags-outline" size={14} color={colors.accent.primary} />
            <Text style={{ color: colors.accent.primary, fontSize: 12, fontWeight: '600' }}>{locale === 'pt' ? 'Classificar Atividades' : 'Classify Activities'}</Text>
          </TouchableOpacity>
          {(() => {
            const split = activitySplit;
            const fmt = (v: any, suf = '') => (v == null ? '--' : `${v}${suf}`);
            const ratioFmt = (v: any) => (v == null ? 'N/A' : `${v}%`);
            if (!split || (!split.has_game && !split.has_training)) {
              return (
                <View style={{ paddingVertical: 20, alignItems: 'center' }} data-testid="gt-empty">
                  <Ionicons name="information-circle-outline" size={22} color={colors.text.tertiary} />
                  <Text style={{ color: colors.text.secondary, fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 18 }}>
                    {locale === 'pt'
                      ? 'As comparações Jogo vs Treino exigem atividades classificadas. Nenhuma atividade classificada (Jogo/Treino) no período selecionado.'
                      : 'Game vs Training comparisons require classified activities. No classified activity (Game/Training) in the selected period.'}
                  </Text>
                </View>
              );
            }
            const metrics = [
              { key: 'player_load', label: locale === 'pt' ? 'Player Load Médio' : 'Avg Player Load', suf: '' },
              { key: 'high_metabolic_load', label: locale === 'pt' ? 'Carga Metabólica Alta' : 'High Metabolic Load', suf: '' },
              { key: 'max_velocity_percent', label: locale === 'pt' ? 'Vel. Máx (%)' : 'Max Velocity (%)', suf: '%' },
              { key: 'sprint_distance', label: locale === 'pt' ? 'Dist. Sprint' : 'Sprint Distance', suf: '' },
            ];
            return (
              <View style={{ marginTop: 8 }}>
                {!split.has_training && (
                  <View style={{ backgroundColor: 'rgba(47,182,255,0.08)', borderRadius: 8, padding: 8, marginBottom: 10 }} data-testid="gt-no-training">
                    <Text style={{ color: colors.text.secondary, fontSize: 11 }}>
                      {locale === 'pt' ? 'Sem dados de treino classificados — Ratio = N/A.' : 'No classified training data — Ratio = N/A.'}
                    </Text>
                  </View>
                )}
                {!split.has_game && (
                  <View style={{ backgroundColor: 'rgba(249,115,22,0.08)', borderRadius: 8, padding: 8, marginBottom: 10 }} data-testid="gt-no-game">
                    <Text style={{ color: colors.text.secondary, fontSize: 11 }}>
                      {locale === 'pt' ? 'Sem dados de jogo classificados — Ratio = N/A.' : 'No classified game data — Ratio = N/A.'}
                    </Text>
                  </View>
                )}
                {metrics.map((m) => {
                  const g = split.game[m.key]; const t = split.training[m.key];
                  const mx = Math.max(g || 0, t || 0, 1);
                  return (
                    <View key={m.key} style={{ marginBottom: 12 }} data-testid={`gt-metric-${m.key}`}>
                      <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>{m.label}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                        <Text style={{ width: 64, color: COLORS.orange, fontSize: 10 }}>{locale === 'pt' ? 'Jogo' : 'Game'}</Text>
                        <View style={{ flex: 1, height: 10, backgroundColor: colors.dark.tertiary, borderRadius: 5, overflow: 'hidden' }}><View style={{ width: `${g ? (g / mx * 100) : 0}%`, height: '100%', backgroundColor: COLORS.orange }} /></View>
                        <Text style={{ width: 70, textAlign: 'right', color: colors.text.primary, fontSize: 11 }}>{fmt(g, m.suf)}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ width: 64, color: COLORS.blue, fontSize: 10 }}>{locale === 'pt' ? 'Treino' : 'Training'}</Text>
                        <View style={{ flex: 1, height: 10, backgroundColor: colors.dark.tertiary, borderRadius: 5, overflow: 'hidden' }}><View style={{ width: `${t ? (t / mx * 100) : 0}%`, height: '100%', backgroundColor: COLORS.blue }} /></View>
                        <Text style={{ width: 70, textAlign: 'right', color: colors.text.primary, fontSize: 11 }}>{fmt(t, m.suf)}</Text>
                      </View>
                      <Text style={{ color: colors.text.tertiary, fontSize: 10, textAlign: 'right', marginTop: 2 }}>Ratio (T/J×100): {ratioFmt(split.ratio[m.key])}</Text>
                    </View>
                  );
                })}
              </View>
            );
          })()}
        </View>
        </FadeInView>

        {/* Final analytical table (Phase 4B) */}
        <FadeInView delay={260}>
        <View style={styles.card} data-testid="game-training-table-card">
          <CardInfoHeader id="sm_ratio_table" />
          {(() => {
            const split = activitySplit;
            if (!split) return null;
            const fmt = (v: any, suf = '') => (v == null ? '--' : `${v}${suf}`);
            const ratioFmt = (v: any) => (v == null ? 'N/A' : `${v}%`);
            const rows: [string, string][] = [
              [locale === 'pt' ? 'Player Load (Jogo)' : 'Player Load (Game)', fmt(split.game.player_load)],
              [locale === 'pt' ? 'Player Load (Treino)' : 'Player Load (Training)', fmt(split.training.player_load)],
              ['Player Load Ratio', ratioFmt(split.ratio.player_load)],
              [locale === 'pt' ? 'Carga Metab. Alta (Jogo)' : 'High Metabolic Load (Game)', fmt(split.game.high_metabolic_load)],
              [locale === 'pt' ? 'Carga Metab. Alta (Treino)' : 'High Metabolic Load (Training)', fmt(split.training.high_metabolic_load)],
              [locale === 'pt' ? 'Carga Metab. Alta Ratio' : 'High Metabolic Load Ratio', ratioFmt(split.ratio.high_metabolic_load)],
              [locale === 'pt' ? 'Vel. Máx % (Jogo)' : 'Max Velocity % (Game)', fmt(split.game.max_velocity_percent, '%')],
              [locale === 'pt' ? 'Vel. Máx % (Treino)' : 'Max Velocity % (Training)', fmt(split.training.max_velocity_percent, '%')],
              [locale === 'pt' ? 'Vel. Máx % Ratio' : 'Max Velocity % Ratio', ratioFmt(split.ratio.max_velocity_percent)],
            ];
            return (
              <View style={{ marginTop: 8 }} data-testid="gt-table">
                {rows.map(([label, val], i) => (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: colors.border.default }}>
                    <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{label}</Text>
                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>{val}</Text>
                  </View>
                ))}
              </View>
            );
          })()}
        </View>
        </FadeInView>

        {/* AI Insight (reuses existing insights architecture) */}
        <View style={styles.insightCard} data-testid="speed-metabolic-insight">
          <Ionicons name="bulb-outline" size={16} color={COLORS.yellow} />
          <Text style={styles.insightText}>{insights.speed_metabolic || ''}</Text>
        </View>
      </View>
    );
  };

  const renderActiveLayer = () => {
    switch (activeLayer) {
      case 'load': return renderLoadIntelligence();
      case 'summary': return renderSmartSummary();
      case 'status': return renderTeamStatus();
      case 'neuro': return renderNeuromuscular();
      case 'risk': return renderRiskIntelligence();
      case 'speed': return renderSpeedMetabolic();
      default: return renderLoadIntelligence();
    }
  };
  
  // ============ RENDER ============
  if (isLoading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={[colors.dark.secondary, colors.dark.primary]} style={styles.gradient}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>{locale === 'pt' ? 'Visao Geral' : 'Overview'}</Text>
            </View>
          </View>
          <SkeletonDashboard />
        </LinearGradient>
      </View>
    );
  }
  
  return (
    <View style={styles.container} data-testid="dashboard-overview">
      <LinearGradient colors={[colors.dark.secondary, colors.dark.primary]} style={styles.gradient}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.headerTitle}>{locale === 'pt' ? 'Visão Geral' : 'Overview'}</Text>
              <TouchableOpacity
                style={styles.pdfExportBtn}
                onPress={() => setPdfModalVisible(true)}
                disabled={isGeneratingPdf || !data}
                activeOpacity={0.7}
                data-testid="pdf-export-btn"
              >
                {isGeneratingPdf ? (
                  <ActivityIndicator size="small" color="#dc2626" />
                ) : (
                  <>
                    <Ionicons name="document-text-outline" size={16} color="#dc2626" />
                    <Text style={{ color: '#dc2626', fontSize: 10, fontWeight: '600' }}>PDF</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <View style={[styles.modeBadge, { backgroundColor: modeBadge.color + '20', borderColor: modeBadge.color + '40' }]}>
                <Text style={[styles.modeBadgeText, { color: modeBadge.color }]}>{modeBadge.label}</Text>
              </View>
              <Text style={styles.updateText}>Updated: {lastUpdate}</Text>
            </View>
          </View>
        </View>
        
        {/* Global Filters */}
        <View style={styles.filtersContainer}>
          {/* Athlete filter */}
          <TouchableOpacity style={styles.filterBtn} onPress={() => setAthleteModalVisible(true)} data-testid="filter-athlete">
            <Ionicons name="person-outline" size={13} color={colors.accent.primary} />
            <Text style={styles.filterBtnText} numberOfLines={1}>
              {selectedAthlete === 'all' 
                ? (locale === 'pt' ? 'Todos' : 'All') 
                : athletesList?.find((a: any) => (a.id || a._id) === selectedAthlete)?.name?.split(' ')[0] || '...'}
            </Text>
            <Ionicons name="chevron-down" size={11} color={colors.text.tertiary} />
          </TouchableOpacity>
          
          {/* Date filter */}
          <TouchableOpacity style={styles.filterBtn} onPress={() => setDateModalVisible(true)} data-testid="filter-date">
            <Ionicons name="calendar-outline" size={13} color={colors.accent.primary} />
            <Text style={styles.filterBtnText} numberOfLines={1}>{DATE_RANGES.find(r => r.key === selectedDateRange)?.[locale === 'pt' ? 'labelPt' : 'labelEn']}</Text>
            <Ionicons name="chevron-down" size={11} color={colors.text.tertiary} />
          </TouchableOpacity>
          
          {/* Position filter */}
          <TouchableOpacity style={styles.filterBtn} onPress={() => setPositionModalVisible(true)} data-testid="filter-position">
            <Ionicons name="football-outline" size={13} color={colors.accent.primary} />
            <Text style={styles.filterBtnText} numberOfLines={1}>{selectedPosition === 'all' ? (locale === 'pt' ? 'Todas' : 'All') : selectedPosition}</Text>
            <Ionicons name="chevron-down" size={11} color={colors.text.tertiary} />
          </TouchableOpacity>
        </View>
        
        {/* Layer Menu */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.layerMenu} contentContainerStyle={{ paddingHorizontal: 16 }}>
          {LAYERS.map(l => (
            <TouchableOpacity 
              key={l.key} 
              style={[styles.layerTab, activeLayer === l.key && styles.layerTabActive]}
              onPress={() => switchLayer(l.key)}
              data-testid={`layer-tab-${l.key}`}
            >
              <Ionicons name={l.icon as any} size={16} color={activeLayer === l.key ? '#fff' : colors.text.tertiary} />
              <Text style={[styles.layerTabText, activeLayer === l.key && styles.layerTabTextActive]}>
                {locale === 'pt' ? l.labelPt : l.labelEn}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        
        {/* Content */}
        <ScrollView 
          style={styles.contentScroll}
          contentContainerStyle={styles.contentContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent.primary} />}
        >
          <Animated.View style={{ opacity: fadeAnim }}>
            {renderActiveLayer()}
          </Animated.View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </LinearGradient>
      
      {/* ============ MODALS ============ */}
      
      {/* PDF Export Modal */}
      <Modal visible={pdfModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setPdfModalVisible(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>EXPORT DASHBOARD REPORT</Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 12, marginBottom: 16 }}>
              Select which dashboard sections you want to include in the exported PDF.
            </Text>
            
            {[
              { key: 'load', label: 'Load Intelligence', icon: 'analytics' },
              { key: 'summary', label: 'Smart Summary', icon: 'bulb' },
              { key: 'status', label: 'Team Status', icon: 'people' },
              { key: 'neuro', label: 'Neuromuscular', icon: 'body' },
              { key: 'risk', label: 'Risk Intelligence', icon: 'shield-checkmark' },
              { key: 'speed', label: 'Speed & Metabolic Load', icon: 'speedometer' },
            ].map(item => (
              <TouchableOpacity 
                key={item.key} 
                style={styles.pdfLayerRow}
                onPress={() => togglePdfLayer(item.key)}
                data-testid={`pdf-layer-${item.key}`}
              >
                <View style={[styles.pdfCheckbox, pdfLayers[item.key] && styles.pdfCheckboxChecked]}>
                  {pdfLayers[item.key] && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Ionicons name={item.icon as any} size={18} color={pdfLayers[item.key] ? colors.accent.primary : colors.text.tertiary} />
                <Text style={[styles.pdfLayerLabel, pdfLayers[item.key] && { color: colors.text.primary }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            
            <View style={styles.pdfModalActions}>
              <TouchableOpacity style={styles.pdfCancelBtn} onPress={() => setPdfModalVisible(false)}>
                <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.pdfExportActionBtn} 
                onPress={handleExportPdf}
                data-testid="pdf-export-confirm"
              >
                <Ionicons name="document-text" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Export PDF</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Classify Activities Modal (Phase 6A) — INDEPENDENT from Periodization */}
      <Modal visible={classifyModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setClassifyModalVisible(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>{locale === 'pt' ? 'CLASSIFICAR ATIVIDADES' : 'CLASSIFY ACTIVITIES'}</Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 12, marginBottom: 12, lineHeight: 17 }}>
              {locale === 'pt'
                ? 'Classifique sessões como Jogo ou Treino. Afeta apenas as análises do Dashboard — não altera a Periodização nem os Peak Values.'
                : 'Classify sessions as Game or Training. Affects Dashboard analytics only — does not change Periodization or Peak Values.'}
            </Text>
            {sessionsLoading ? (
              <ActivityIndicator color={colors.accent.primary} style={{ paddingVertical: 30 }} />
            ) : (
              <ScrollView style={{ maxHeight: 420 }} data-testid="classify-session-list">
                {(dashSessions || []).length === 0 && (
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, textAlign: 'center', paddingVertical: 20 }}>
                    {locale === 'pt' ? 'Nenhuma sessão encontrada.' : 'No sessions found.'}
                  </Text>
                )}
                {(dashSessions || []).map((s: any) => {
                  const busy = classifyingId === s.session_id;
                  return (
                    <View key={s.session_id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border.default }} data-testid={`classify-row-${s.session_id}`}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <View>
                          <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>{s.date}</Text>
                          <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>{s.athlete_count} {locale === 'pt' ? 'atletas' : 'athletes'} · {s.avg_distance}m</Text>
                        </View>
                        <View style={{ backgroundColor: s.activity_type === 'game' ? 'rgba(249,115,22,0.15)' : s.activity_type === 'training' ? 'rgba(47,182,255,0.15)' : colors.dark.tertiary, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 }} data-testid={`classify-status-${s.session_id}`}>
                          <Text style={{ fontSize: 10, color: s.activity_type === 'game' ? COLORS.orange : s.activity_type === 'training' ? COLORS.blue : colors.text.tertiary, fontWeight: '600' }}>
                            {s.activity_type === 'game' ? (locale === 'pt' ? 'JOGO' : 'GAME') : s.activity_type === 'training' ? (locale === 'pt' ? 'TREINO' : 'TRAINING') : (locale === 'pt' ? 'NÃO CLASSIF.' : 'UNCLASSIFIED')}
                          </Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity disabled={busy} onPress={() => classifySession(s.session_id, 'game')} data-testid={`classify-game-${s.session_id}`} style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 7, borderWidth: 1, borderColor: COLORS.orange, backgroundColor: s.activity_type === 'game' ? COLORS.orange : 'transparent' }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: s.activity_type === 'game' ? '#fff' : COLORS.orange }}>{locale === 'pt' ? 'Jogo' : 'Game'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity disabled={busy} onPress={() => classifySession(s.session_id, 'training')} data-testid={`classify-training-${s.session_id}`} style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 7, borderWidth: 1, borderColor: COLORS.blue, backgroundColor: s.activity_type === 'training' ? COLORS.blue : 'transparent' }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: s.activity_type === 'training' ? '#fff' : COLORS.blue }}>{locale === 'pt' ? 'Treino' : 'Training'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity disabled={busy || !s.is_classified} onPress={() => classifySession(s.session_id, null)} data-testid={`classify-clear-${s.session_id}`} style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: colors.border.default, opacity: s.is_classified ? 1 : 0.4 }}>
                          {busy ? <ActivityIndicator size="small" color={colors.text.secondary} /> : <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text.secondary }}>{locale === 'pt' ? 'Limpar' : 'Clear'}</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
            <TouchableOpacity style={[styles.pdfCancelBtn, { marginTop: 14, alignSelf: 'flex-end' }]} onPress={() => setClassifyModalVisible(false)} data-testid="classify-close">
              <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: '600' }}>{locale === 'pt' ? 'Fechar' : 'Close'}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Athlete Modal */}
      <Modal visible={athleteModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setAthleteModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{locale === 'pt' ? 'Selecionar Atleta' : 'Select Athlete'}</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              <TouchableOpacity style={styles.modalOption} onPress={() => { setSelectedAthlete('all'); setSelectedPosition('all'); setAthleteModalVisible(false); }}>
                <Text style={[styles.modalOptionText, selectedAthlete === 'all' && styles.modalOptionActive]}>{locale === 'pt' ? 'Todos os atletas' : 'All athletes'}</Text>
                {selectedAthlete === 'all' && <Ionicons name="checkmark" size={18} color={colors.accent.primary} />}
              </TouchableOpacity>
              {(athletesList || []).map((a: any) => (
                <TouchableOpacity key={a.id || a._id} style={styles.modalOption} onPress={() => { setSelectedAthlete(a.id || a._id); setSelectedPosition('all'); setAthleteModalVisible(false); }}>
                  <View>
                    <Text style={[styles.modalOptionText, selectedAthlete === (a.id || a._id) && styles.modalOptionActive]}>{a.name}</Text>
                    {a.position && <Text style={styles.modalOptionSubtext}>{a.position}</Text>}
                  </View>
                  {selectedAthlete === (a.id || a._id) && <Ionicons name="checkmark" size={18} color={colors.accent.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
      
      {/* Date Range Modal */}
      <Modal visible={dateModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setDateModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{locale === 'pt' ? 'Período' : 'Date Range'}</Text>
            {DATE_RANGES.map(r => (
              <TouchableOpacity key={r.key} style={styles.modalOption} onPress={() => { setSelectedDateRange(r.key); setDateModalVisible(false); }}>
                <Text style={[styles.modalOptionText, selectedDateRange === r.key && styles.modalOptionActive]}>{locale === 'pt' ? r.labelPt : r.labelEn}</Text>
                {selectedDateRange === r.key && <Ionicons name="checkmark" size={18} color={colors.accent.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
      
      {/* Position Modal */}
      <Modal visible={positionModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setPositionModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{locale === 'pt' ? 'Posição' : 'Position'}</Text>
            <TouchableOpacity style={styles.modalOption} onPress={() => { setSelectedPosition('all'); setSelectedAthlete('all'); setPositionModalVisible(false); }}>
              <Text style={[styles.modalOptionText, selectedPosition === 'all' && styles.modalOptionActive]}>{locale === 'pt' ? 'Todas' : 'All'}</Text>
              {selectedPosition === 'all' && <Ionicons name="checkmark" size={18} color={colors.accent.primary} />}
            </TouchableOpacity>
            {positions.map((pos: string) => (
              <TouchableOpacity key={pos} style={styles.modalOption} onPress={() => { setSelectedPosition(pos); setSelectedAthlete('all'); setPositionModalVisible(false); }}>
                <Text style={[styles.modalOptionText, selectedPosition === pos && styles.modalOptionActive]}>{pos}</Text>
                {selectedPosition === pos && <Ionicons name="checkmark" size={18} color={colors.accent.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ============ STYLES ============
const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.primary },
  gradient: { flex: 1 },
  header: { paddingTop: 52, paddingHorizontal: 20, paddingBottom: 8, flexDirection: 'row', alignItems: 'flex-end' },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: colors.text.primary, letterSpacing: -0.5 },
  modeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  modeBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  updateText: { color: colors.text.tertiary, fontSize: 10 },
  
  // Filters
  filtersContainer: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginTop: 8 },
  filterBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(47, 182, 255,0.08)', borderWidth: 1, borderColor: 'rgba(47, 182, 255,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  filterBtnText: { flex: 1, color: colors.text.primary, fontSize: 11, fontWeight: '500' },
  
  // Layer menu
  layerMenu: { marginTop: 12, maxHeight: 44 },
  layerTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, backgroundColor: colors.dark.tertiary, borderWidth: 1, borderColor: colors.border.default },
  layerTabActive: { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
  layerTabText: { fontSize: 11, color: colors.text.tertiary, fontWeight: '500' },
  layerTabTextActive: { color: '#fff', fontWeight: '700' },
  
  // Content
  contentScroll: { flex: 1 },
  contentContainer: { padding: 16, maxWidth: DASHBOARD_MAX_WIDTH, width: '100%', alignSelf: 'center' },
  
  // Cards
  card: { backgroundColor: colors.dark.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border.default },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text.primary, marginBottom: 2 },
  cardSubtitle: { fontSize: 10, color: colors.text.tertiary, marginBottom: 4 },
  
  // Metric pills
  metricPill: { alignItems: 'center', backgroundColor: colors.dark.tertiary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  metricPillLabel: { fontSize: 9, color: colors.text.tertiary, marginBottom: 2 },
  metricPillValue: { fontSize: 16, fontWeight: 'bold', color: colors.text.primary },
  
  // Tables
  table: { marginTop: 8 },
  tableHeader: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border.default },
  tableHeaderText: { fontSize: 10, color: colors.text.tertiary, fontWeight: '600' },
  tableRow: { flexDirection: 'row', paddingVertical: 8, alignItems: 'center' },
  tableRowAlt: { backgroundColor: colors.dark.secondary },
  tableCell: { fontSize: 11, color: colors.text.primary },
  
  // Insight card
  insightCard: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: 'rgba(245,158,11,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.15)', marginBottom: 12, alignItems: 'flex-start' },
  insightText: { flex: 1, fontSize: 11, color: colors.text.secondary, lineHeight: 16 },
  
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 32 },
  modalContent: { backgroundColor: colors.dark.tertiary, borderRadius: 16, padding: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: colors.text.primary, marginBottom: 16 },
  modalOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.default },
  modalOptionText: { fontSize: 14, color: colors.text.primary },
  modalOptionActive: { color: colors.accent.primary, fontWeight: '700' },
  modalOptionSubtext: { fontSize: 11, color: colors.text.tertiary, marginTop: 2 },
  // PDF Export styles
  pdfExportBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
  },
  pdfLayerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  pdfCheckbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    borderColor: colors.border.default,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  pdfCheckboxChecked: {
    backgroundColor: colors.accent.primary, borderColor: colors.accent.primary,
  },
  pdfLayerLabel: { fontSize: 14, color: colors.text.tertiary, fontWeight: '500' as const, flex: 1 },
  pdfModalActions: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const, gap: 10, marginTop: 20 },
  pdfCancelBtn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8, backgroundColor: colors.border.default },
  pdfExportActionBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8, backgroundColor: colors.accent.primary },
});
