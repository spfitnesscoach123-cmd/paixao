import React, { useState, useEffect } from 'react';
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
import Svg, { Line, Circle, Rect, G, Text as SvgText, Polyline } from 'react-native-svg';
import api from '../../../services/api';
import { colors } from '../../../constants/theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import { format } from 'date-fns';

const { width: screenWidth } = Dimensions.get('window');

// VBT Set Interface
interface VBTSet {
  reps: number;
  mean_velocity: number;
  peak_velocity: number;
  load_kg: number;
  power_watts: number;
  rom_cm?: number;
}

// VBT Analysis Interface
interface VBTAnalysis {
  athlete_name: string;
  exercise: string;
  latest_session: {
    date: string;
    sets: number;
    avg_velocity: number;
    max_velocity: number;
    max_power: number;
    max_load: number;
  };
  load_velocity_profile: {
    slope: number | null;
    intercept: number | null;
    estimated_1rm: number | null;
    mvt_velocity: number;
    data_points: number;
    optimal_load: number | null;
    optimal_velocity: number | null;
    optimal_power: number | null;
  };
  optimal_load_evolution: Array<{
    date: string;
    optimal_load: number;
    optimal_velocity: number;
    optimal_power: number;
  }>;
  velocity_loss_analysis: Array<{ set: number; velocity: number; loss_percent: number }>;
  trend: string;
  history: Array<{ date: string; avg_velocity: number; max_velocity: number; max_load: number }>;
  recommendations: string[];
}

const EXERCISES = [
  'Back Squat', 'Front Squat', 'Bench Press', 'Deadlift',
  'Power Clean', 'Hang Clean', 'Push Press', 'Hip Thrust',
  'Leg Press', 'Shoulder Press', 'Pull Up', 'Row',
];

const PROVIDERS = [
  { id: 'push_band', name: 'PUSH Band 2.0', inputMethod: 'Bluetooth', icon: 'fitness', color: '#FF6B35' },
  { id: 'vitruve', name: 'Vitruve', inputMethod: 'Bluetooth', icon: 'speedometer', color: '#00D4AA' },
  { id: 'beast', name: 'Beast Sensor', inputMethod: 'Bluetooth', icon: 'flash', color: '#FFD700' },
  { id: 'manual', name: 'Manual', inputMethod: 'Manual', icon: 'create', color: colors.text.secondary },
];

// Helper to format decimal input
const formatDecimalInput = (value: string): string => {
  // Replace comma with dot for decimal
  return value.replace(',', '.');
};

// Load-Velocity Profile Chart Component - Responsive
const LoadVelocityChart = ({ analysis }: { analysis: VBTAnalysis }) => {
  const { locale } = useLanguage();
  // Make chart responsive
  const chartWidth = Math.min(screenWidth - 48, 400);
  const chartHeight = Math.min(chartWidth * 0.5, 180);
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  
  const { slope, intercept, estimated_1rm, mvt_velocity } = analysis.load_velocity_profile;
  
  if (!slope || !intercept) {
    return (
      <View style={styles.chartPlaceholder}>
        <Text style={styles.chartPlaceholderText}>
          {locale === 'pt' ? 'Dados insuficientes para o perfil' : 'Insufficient data for profile'}
        </Text>
      </View>
    );
  }
  
  const maxLoad = estimated_1rm ? estimated_1rm * 1.1 : 150;
  
  const getY = (load: number) => {
    const velocity = intercept + slope * load;
    const normalizedV = Math.max(0, Math.min(1.5, velocity));
    return padding.top + innerHeight - (normalizedV / 1.5) * innerHeight;
  };
  
  const getX = (load: number) => {
    return padding.left + (load / maxLoad) * innerWidth;
  };
  
  const lineStart = { x: getX(0), y: getY(0) };
  const lineEnd = { x: getX(estimated_1rm || maxLoad), y: getY(estimated_1rm || maxLoad) };
  const mvtY = padding.top + innerHeight - (mvt_velocity / 1.5) * innerHeight;
  
  return (
    <Svg width={chartWidth} height={chartHeight}>
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
        <G key={`grid-${i}`}>
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
            x={padding.left - 8}
            y={padding.top + innerHeight * ratio + 4}
            textAnchor="end"
            fill={colors.text.tertiary}
            fontSize="10"
          >
            {((1 - ratio) * 1.5).toFixed(1)}
          </SvgText>
        </G>
      ))}
      
      {/* X axis labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
        <SvgText
          key={`x-${i}`}
          x={padding.left + innerWidth * ratio}
          y={chartHeight - 10}
          textAnchor="middle"
          fill={colors.text.tertiary}
          fontSize="10"
        >
          {Math.round(maxLoad * ratio)}
        </SvgText>
      ))}
      
      {/* Axis labels */}
      <SvgText
        x={chartWidth / 2}
        y={chartHeight - 2}
        textAnchor="middle"
        fill={colors.text.secondary}
        fontSize="10"
      >
        {locale === 'pt' ? 'Carga (kg)' : 'Load (kg)'}
      </SvgText>
      
      {/* MVT Line */}
      <Line
        x1={padding.left}
        y1={mvtY}
        x2={chartWidth - padding.right}
        y2={mvtY}
        stroke="#ef4444"
        strokeWidth="2"
        strokeDasharray="6 3"
      />
      <SvgText
        x={chartWidth - padding.right - 5}
        y={mvtY - 5}
        textAnchor="end"
        fill="#ef4444"
        fontSize="9"
      >
        MVT
      </SvgText>
      
      {/* Load-Velocity Line */}
      <Line
        x1={lineStart.x}
        y1={lineStart.y}
        x2={lineEnd.x}
        y2={lineEnd.y}
        stroke={colors.accent.primary}
        strokeWidth="3"
      />
      
      {/* Optimal Load Point (Maximum Power) */}
      {analysis.load_velocity_profile.optimal_load && (
        <G>
          <Circle
            cx={getX(analysis.load_velocity_profile.optimal_load)}
            cy={getY(analysis.load_velocity_profile.optimal_load)}
            r="10"
            fill="#f59e0b"
            stroke="#ffffff"
            strokeWidth="2"
          />
          <SvgText
            x={getX(analysis.load_velocity_profile.optimal_load)}
            y={getY(analysis.load_velocity_profile.optimal_load) - 18}
            textAnchor="middle"
            fill="#f59e0b"
            fontSize="10"
            fontWeight="bold"
          >
            {locale === 'pt' ? 'Ótimo' : 'Optimal'}
          </SvgText>
          <SvgText
            x={getX(analysis.load_velocity_profile.optimal_load)}
            y={getY(analysis.load_velocity_profile.optimal_load) - 7}
            textAnchor="middle"
            fill="#f59e0b"
            fontSize="9"
          >
            {analysis.load_velocity_profile.optimal_load}kg
          </SvgText>
        </G>
      )}
      
      {/* Estimated 1RM Point */}
      {estimated_1rm && (
        <G>
          <Circle
            cx={getX(estimated_1rm)}
            cy={getY(estimated_1rm)}
            r="8"
            fill="#10b981"
            stroke="#ffffff"
            strokeWidth="2"
          />
          <SvgText
            x={getX(estimated_1rm)}
            y={getY(estimated_1rm) - 15}
            textAnchor="middle"
            fill="#10b981"
            fontSize="11"
            fontWeight="bold"
          >
            1RM: {estimated_1rm.toFixed(0)}kg
          </SvgText>
        </G>
      )}
    </Svg>
  );
};

// Optimal Load Evolution Chart Component
const OptimalLoadEvolutionChart = ({ data, locale }: { data: Array<{ date: string; optimal_load: number; optimal_power: number }>, locale: string }) => {
  const chartWidth = Math.min(screenWidth - 48, 400);
  const chartHeight = Math.min(chartWidth * 0.4, 150);
  const padding = { top: 20, right: 20, bottom: 30, left: 45 };
  
  if (!data || data.length < 2) {
    return (
      <View style={styles.chartPlaceholder}>
        <Text style={styles.chartPlaceholderText}>
          {locale === 'pt' ? 'Dados insuficientes para evolução' : 'Insufficient data for evolution'}
        </Text>
      </View>
    );
  }
  
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  
  const loads = data.map(d => d.optimal_load);
  const maxLoad = Math.max(...loads) * 1.1;
  const minLoad = Math.min(...loads) * 0.9;
  
  const getX = (index: number) => padding.left + (index / (data.length - 1)) * innerWidth;
  const getY = (load: number) => {
    const normalized = (load - minLoad) / (maxLoad - minLoad);
    return padding.top + innerHeight - normalized * innerHeight;
  };
  
  const linePath = data.map((d, i) => `${getX(i)},${getY(d.optimal_load)}`).join(' ');
  
  // Calculate trend
  const firstLoad = data[data.length - 1].optimal_load;
  const lastLoad = data[0].optimal_load;
  const trendPercent = ((lastLoad - firstLoad) / firstLoad * 100).toFixed(1);
  const isPositive = lastLoad > firstLoad;
  
  return (
    <View>
      {/* Trend Summary */}
      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        paddingHorizontal: 4
      }}>
        <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
          {locale === 'pt' ? 'Evolução da Carga Ótima' : 'Optimal Load Evolution'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons 
            name={isPositive ? 'arrow-up' : 'arrow-down'} 
            size={16} 
            color={isPositive ? '#10b981' : '#ef4444'} 
          />
          <Text style={{ 
            color: isPositive ? '#10b981' : '#ef4444', 
            fontSize: 14, 
            fontWeight: 'bold',
            marginLeft: 4
          }}>
            {isPositive ? '+' : ''}{trendPercent}%
          </Text>
        </View>
      </View>
      
      <Svg width={chartWidth} height={chartHeight}>
        {/* Grid lines */}
        {[0, 0.5, 1].map((ratio, i) => (
          <G key={`grid-${i}`}>
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
              {Math.round(minLoad + (maxLoad - minLoad) * (1 - ratio))}
            </SvgText>
          </G>
        ))}
        
        {/* Line */}
        <Polyline
          points={linePath}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Data points */}
        {data.map((d, i) => (
          <Circle
            key={i}
            cx={getX(i)}
            cy={getY(d.optimal_load)}
            r={i === 0 ? 6 : 4}
            fill={i === 0 ? '#f59e0b' : 'rgba(245, 158, 11, 0.6)'}
            stroke="#ffffff"
            strokeWidth={i === 0 ? 2 : 1}
          />
        ))}
        
        {/* Date labels */}
        {data.length <= 5 ? data.map((d, i) => (
          <SvgText
            key={`date-${i}`}
            x={getX(i)}
            y={chartHeight - 8}
            textAnchor="middle"
            fill={colors.text.tertiary}
            fontSize="8"
          >
            {d.date.substring(5)}
          </SvgText>
        )) : [0, Math.floor(data.length / 2), data.length - 1].map((idx) => (
          <SvgText
            key={`date-${idx}`}
            x={getX(idx)}
            y={chartHeight - 8}
            textAnchor="middle"
            fill={colors.text.tertiary}
            fontSize="8"
          >
            {data[idx].date.substring(5)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
};

// Velocity Loss Chart Component - Responsive with Fatigue Alert
const VelocityLossChart = ({ data, locale }: { data: Array<{ set: number; velocity: number; loss_percent: number }>, locale: string }) => {
  // Make chart responsive
  const chartWidth = Math.min(screenWidth - 48, 400);
  const chartHeight = Math.min(chartWidth * 0.4, 150);
  const padding = { top: 15, right: 15, bottom: 30, left: 40 };
  
  if (!data || data.length === 0) return null;
  
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  
  const maxLoss = Math.max(...data.map(d => d.loss_percent), 35);
  const hasHighFatigue = data.some(d => d.loss_percent >= 30);
  
  const barWidth = Math.min((innerWidth / data.length) * 0.6, 40);
  const barGap = (innerWidth - barWidth * data.length) / (data.length + 1);
  
  const getBarColor = (loss: number) => {
    if (loss < 10) return '#10b981';
    if (loss < 20) return '#f59e0b';
    if (loss < 30) return '#f97316';
    return '#ef4444';
  };
  
  return (
    <View>
      {/* Fatigue Alert Banner */}
      {hasHighFatigue && (
        <View style={{
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: 'rgba(239, 68, 68, 0.3)',
        }}>
          <Ionicons name="warning" size={20} color="#ef4444" style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 13 }}>
              {locale === 'pt' ? '⚠️ Acúmulo de Fadiga Detectado!' : '⚠️ Fatigue Accumulation Detected!'}
            </Text>
            <Text style={{ color: '#f87171', fontSize: 11, marginTop: 2 }}>
              {locale === 'pt' 
                ? 'Perda de velocidade >30% indica fadiga excessiva. Reduza volume ou carga.'
                : 'Velocity loss >30% indicates excessive fatigue. Reduce volume or load.'}
            </Text>
          </View>
        </View>
      )}
      
      <Svg width={chartWidth} height={chartHeight}>
        {/* Grid lines with 30% threshold */}
        {[0, 10, 20, 30].map((val, i) => (
          <G key={`grid-${i}`}>
            <Line
              x1={padding.left}
              y1={padding.top + innerHeight - (val / maxLoss) * innerHeight}
              x2={chartWidth - padding.right}
              y2={padding.top + innerHeight - (val / maxLoss) * innerHeight}
              stroke={val === 30 ? '#ef4444' : colors.border.default}
              strokeWidth={val === 30 ? '2' : '1'}
              strokeDasharray={val === 30 ? '6 3' : '4 4'}
            />
            <SvgText
              x={padding.left - 5}
              y={padding.top + innerHeight - (val / maxLoss) * innerHeight + 4}
              textAnchor="end"
              fill={val === 30 ? '#ef4444' : colors.text.tertiary}
              fontSize="9"
              fontWeight={val === 30 ? 'bold' : 'normal'}
            >
              {val}%
            </SvgText>
          </G>
        ))}
        
        {/* Danger zone label */}
        <SvgText
          x={chartWidth - padding.right - 5}
          y={padding.top + innerHeight - (30 / maxLoss) * innerHeight - 5}
          textAnchor="end"
          fill="#ef4444"
          fontSize="8"
        >
          {locale === 'pt' ? 'Zona de Fadiga' : 'Fatigue Zone'}
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
              <SvgText
                x={x + barWidth / 2}
                y={chartHeight - 8}
                textAnchor="middle"
                fill={colors.text.secondary}
                fontSize="9"
              >
                S{d.set}
              </SvgText>
              <SvgText
                x={x + barWidth / 2}
                y={y - 4}
                textAnchor="middle"
                fill={d.loss_percent >= 30 ? '#ef4444' : colors.text.primary}
                fontSize="9"
                fontWeight="bold"
              >
                {d.loss_percent.toFixed(0)}%
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
};

export default function AddStrengthAssessment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, locale } = useLanguage();
  const [loading, setLoading] = useState(false);
  
  // Tab state - Avaliação de Salto ou VBT
  const [activeSection, setActiveSection] = useState<'jump' | 'vbt'>('jump');
  
  // VBT form state
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedExercise, setSelectedExercise] = useState('Back Squat');
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [provider, setProvider] = useState('manual');
  const [vbtSets, setVbtSets] = useState<VBTSet[]>([
    { reps: 5, mean_velocity: 0, peak_velocity: 0, load_kg: 0, power_watts: 0 }
  ]);
  
  // Fetch VBT analysis for selected exercise
  const { data: vbtAnalysis, isLoading: vbtLoading } = useQuery({
    queryKey: ['vbt-analysis', id, selectedExercise],
    queryFn: async () => {
      const response = await api.get<VBTAnalysis>(
        `/vbt/analysis/${id}?exercise=${encodeURIComponent(selectedExercise)}&lang=${locale}`
      );
      return response.data;
    },
    retry: false,
    enabled: activeSection === 'vbt',
  });

  // Redirect to Jump Assessment when Jump tab is active
  useEffect(() => {
    if (activeSection === 'jump') {
      router.replace(`/athlete/${id}/jump-assessment`);
    }
  }, [activeSection, id, router]);
        assessment_type: 'strength',
        metrics: metrics,
        notes: notes || null,
      });

      queryClient.invalidateQueries({ queryKey: ['assessments', id] });
      queryClient.invalidateQueries({ queryKey: ['strength-analysis', id] });

      Alert.alert(
        locale === 'pt' ? 'Sucesso' : 'Success',
        locale === 'pt' ? 'Avaliação de força registrada!' : 'Strength assessment recorded!',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        error.response?.data?.detail || (locale === 'pt' ? 'Erro ao salvar' : 'Error saving')
      );
    } finally {
      setLoading(false);
    }
  };

  // VBT submission
  const vbtMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/vbt/data', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vbt-analysis', id] });
      Alert.alert(
        locale === 'pt' ? 'Sucesso' : 'Success',
        locale === 'pt' ? 'Dados VBT salvos!' : 'VBT data saved!',
        [{ text: 'OK' }]
      );
      // Reset form
      setVbtSets([{ reps: 5, mean_velocity: 0, peak_velocity: 0, load_kg: 0, power_watts: 0 }]);
      setVbtInputs({}); // Clear raw inputs
    },
    onError: (error: any) => {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save');
    },
  });

  const handleAddSet = () => {
    setVbtSets([...vbtSets, { reps: 5, mean_velocity: 0, peak_velocity: 0, load_kg: 0, power_watts: 0 }]);
  };

  const handleRemoveSet = (index: number) => {
    if (vbtSets.length > 1) {
      setVbtSets(vbtSets.filter((_, i) => i !== index));
      // Clean up removed set's inputs
      setVbtInputs(prev => {
        const newInputs = { ...prev };
        Object.keys(newInputs).forEach(key => {
          if (key.startsWith(`${index}-`)) {
            delete newInputs[key];
          }
        });
        return newInputs;
      });
    }
  };

  // State to track raw input values for VBT sets (allows typing decimals)
  const [vbtInputs, setVbtInputs] = useState<{ [key: string]: string }>({});

  const handleSetChange = (index: number, field: keyof VBTSet, value: string) => {
    // Store raw input to allow partial decimal entry (e.g., "1." or "1,")
    const inputKey = `${index}-${field}`;
    setVbtInputs(prev => ({ ...prev, [inputKey]: value }));
    
    // Only update numeric state when we have a valid number
    const numericValue = parseFloat(value.replace(',', '.'));
    if (!isNaN(numericValue)) {
      const newSets = [...vbtSets];
      newSets[index] = { ...newSets[index], [field]: numericValue };
      setVbtSets(newSets);
    }
  };

  // Get display value for VBT input (raw input or formatted number)
  const getVbtInputValue = (index: number, field: keyof VBTSet, numericValue: number) => {
    const inputKey = `${index}-${field}`;
    if (vbtInputs[inputKey] !== undefined) {
      return vbtInputs[inputKey];
    }
    return numericValue ? String(numericValue) : '';
  };

  const handleSubmitVBT = () => {
    const validSets = vbtSets.filter(s => s.load_kg > 0 && s.mean_velocity > 0);
    if (validSets.length === 0) {
      Alert.alert(
        locale === 'pt' ? 'Dados inválidos' : 'Invalid data',
        locale === 'pt' ? 'Preencha ao menos um set com carga e velocidade' : 'Fill at least one set with load and velocity'
      );
      return;
    }
    
    vbtMutation.mutate({
      athlete_id: id,
      date: date,
      provider,
      exercise: selectedExercise,
      sets: validSets,
    });
  };

  const labels = {
    title: locale === 'pt' ? 'Avaliação de Força' : 'Strength Assessment',
    traditional: locale === 'pt' ? 'Força Tradicional' : 'Traditional Strength',
    vbt: 'VBT',
    date: locale === 'pt' ? 'Data' : 'Date',
    meanPower: locale === 'pt' ? 'Potência Média (W)' : 'Mean Power (W)',
    peakPower: locale === 'pt' ? 'Pico de Potência (W)' : 'Peak Power (W)',
    meanSpeed: locale === 'pt' ? 'Velocidade Média (m/s)' : 'Mean Speed (m/s)',
    peakSpeed: locale === 'pt' ? 'Pico de Velocidade (m/s)' : 'Peak Speed (m/s)',
    rsi: locale === 'pt' ? 'RSI (Índice de Força Reativa)' : 'RSI (Reactive Strength Index)',
    fatigueIndex: locale === 'pt' ? 'Índice de Fadiga (%)' : 'Fatigue Index (%)',
    fatigueHint: locale === 'pt' ? '> 70% = alto nível de fadiga' : '> 70% = high fatigue level',
    notes: locale === 'pt' ? 'Observações' : 'Notes',
    save: locale === 'pt' ? 'Salvar Avaliação' : 'Save Assessment',
    normativeHint: locale === 'pt' 
      ? 'Valores de referência para jogadores de futebol:'
      : 'Reference values for football players:',
    exercise: locale === 'pt' ? 'Exercício' : 'Exercise',
    device: locale === 'pt' ? 'Dispositivo' : 'Device',
    addSet: locale === 'pt' ? 'Adicionar Set' : 'Add Set',
    saveVbt: locale === 'pt' ? 'Salvar Dados VBT' : 'Save VBT Data',
    loadVelocity: locale === 'pt' ? 'Perfil Carga-Velocidade' : 'Load-Velocity Profile',
    velocityLoss: locale === 'pt' ? 'Perda de Velocidade por Set' : 'Velocity Loss per Set',
    recommendations: locale === 'pt' ? 'Recomendações' : 'Recommendations',
    noVbtData: locale === 'pt' ? 'Nenhum dado VBT para este exercício' : 'No VBT data for this exercise',
    selectExercise: locale === 'pt' ? 'Selecionar Exercício' : 'Select Exercise',
  };

  return (
    <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>{labels.title}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Section Tabs */}
        <View style={styles.sectionTabs}>
          <TouchableOpacity
            style={[styles.sectionTab, activeSection === 'traditional' && styles.sectionTabActive]}
            onPress={() => setActiveSection('traditional')}
          >
            <Ionicons 
              name="barbell" 
              size={20} 
              color={activeSection === 'traditional' ? '#ffffff' : colors.text.secondary} 
            />
            <Text style={[styles.sectionTabText, activeSection === 'traditional' && styles.sectionTabTextActive]}>
              {labels.traditional}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sectionTab, activeSection === 'vbt' && styles.sectionTabActive]}
            onPress={() => setActiveSection('vbt')}
          >
            <Ionicons 
              name="speedometer" 
              size={20} 
              color={activeSection === 'vbt' ? '#ffffff' : colors.text.secondary} 
            />
            <Text style={[styles.sectionTabText, activeSection === 'vbt' && styles.sectionTabTextActive]}>
              {labels.vbt}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Date Input (shared) */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{labels.date}</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.text.tertiary}
          />
        </View>

        {/* ============= TRADITIONAL STRENGTH SECTION ============= */}
        {activeSection === 'traditional' && (
          <View style={styles.form}>
            {/* Power Metrics */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                <Ionicons name="flash" size={16} color={colors.accent.primary} /> Power
              </Text>
              
              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>{labels.meanPower}</Text>
                  <TextInput
                    style={styles.input}
                    value={meanPower}
                    onChangeText={setMeanPower}
                    placeholder="2000"
                    placeholderTextColor={colors.text.tertiary}
                    keyboardType="numeric"
                  />
                </View>
                
                <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
                  <Text style={styles.label}>{labels.peakPower}</Text>
                  <TextInput
                    style={styles.input}
                    value={peakPower}
                    onChangeText={setPeakPower}
                    placeholder="3500"
                    placeholderTextColor={colors.text.tertiary}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>

            {/* Speed Metrics */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                <Ionicons name="speedometer" size={16} color={colors.accent.secondary} /> Speed
              </Text>
              
              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>{labels.meanSpeed}</Text>
                  <TextInput
                    style={styles.input}
                    value={meanSpeed}
                    onChangeText={(text) => setMeanSpeed(formatDecimalInput(text))}
                    placeholder="1.3"
                    placeholderTextColor={colors.text.tertiary}
                    keyboardType="decimal-pad"
                  />
                </View>
                
                <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
                  <Text style={styles.label}>{labels.peakSpeed}</Text>
                  <TextInput
                    style={styles.input}
                    value={peakSpeed}
                    onChangeText={(text) => setPeakSpeed(formatDecimalInput(text))}
                    placeholder="2.6"
                    placeholderTextColor={colors.text.tertiary}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            </View>

            {/* RSI & Fatigue */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                <Ionicons name="fitness" size={16} color={colors.status.warning} /> RSI & Fatigue
              </Text>
              
              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>{labels.rsi}</Text>
                  <TextInput
                    style={styles.input}
                    value={rsi}
                    onChangeText={(text) => setRsi(formatDecimalInput(text))}
                    placeholder="2.0"
                    placeholderTextColor={colors.text.tertiary}
                    keyboardType="decimal-pad"
                  />
                </View>
                
                <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
                  <Text style={styles.label}>{labels.fatigueIndex}</Text>
                  <TextInput
                    style={[styles.input, fatigueIndex && parseFloat(fatigueIndex) > 70 && styles.inputWarning]}
                    value={fatigueIndex}
                    onChangeText={setFatigueIndex}
                    placeholder="40"
                    placeholderTextColor={colors.text.tertiary}
                    keyboardType="numeric"
                  />
                  <Text style={styles.hint}>{labels.fatigueHint}</Text>
                </View>
              </View>
            </View>

            {/* Notes */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{labels.notes}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={notes}
                onChangeText={setNotes}
                placeholder={locale === 'pt' ? 'Observações opcionais...' : 'Optional notes...'}
                placeholderTextColor={colors.text.tertiary}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Reference Values */}
            <View style={styles.referenceCard}>
              <Text style={styles.referenceTitle}>{labels.normativeHint}</Text>
              <View style={styles.referenceGrid}>
                <View style={styles.referenceItem}>
                  <Text style={styles.refLabel}>Mean Power</Text>
                  <Text style={styles.refValue}>1900-2500W</Text>
                </View>
                <View style={styles.referenceItem}>
                  <Text style={styles.refLabel}>Peak Power</Text>
                  <Text style={styles.refValue}>3000-4000W</Text>
                </View>
                <View style={styles.referenceItem}>
                  <Text style={styles.refLabel}>RSI</Text>
                  <Text style={styles.refValue}>1.5-2.5</Text>
                </View>
                <View style={styles.referenceItem}>
                  <Text style={styles.refLabel}>Fatigue</Text>
                  <Text style={styles.refValue}>&lt;70%</Text>
                </View>
              </View>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmitTraditional}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="save" size={20} color="#fff" />
                  <Text style={styles.submitButtonText}>{labels.save}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ============= VBT SECTION ============= */}
        {activeSection === 'vbt' && (
          <View style={styles.form}>
            {/* Exercise Selector */}
            <TouchableOpacity 
              style={styles.exerciseSelector}
              onPress={() => setShowExerciseModal(true)}
            >
              <View style={styles.exerciseSelectorContent}>
                <Ionicons name="barbell" size={24} color={colors.accent.primary} />
                <Text style={styles.exerciseSelectorText}>{selectedExercise}</Text>
              </View>
              <Ionicons name="chevron-down" size={24} color={colors.text.secondary} />
            </TouchableOpacity>

            {/* VBT Analysis Display */}
            {vbtLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accent.primary} />
              </View>
            ) : vbtAnalysis ? (
              <>
                {/* Summary Cards */}
                <View style={styles.summaryGrid}>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryValue}>{vbtAnalysis.latest_session.avg_velocity.toFixed(2)}</Text>
                    <Text style={styles.summaryLabel}>m/s {locale === 'pt' ? 'Média' : 'Avg'}</Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryValue}>{vbtAnalysis.latest_session.max_load}</Text>
                    <Text style={styles.summaryLabel}>kg Max</Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={[styles.summaryValue, { color: '#10b981' }]}>
                      {vbtAnalysis.load_velocity_profile.estimated_1rm?.toFixed(0) || '-'}
                    </Text>
                    <Text style={styles.summaryLabel}>1RM Est.</Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryValue}>{vbtAnalysis.latest_session.max_power}</Text>
                    <Text style={styles.summaryLabel}>W Max</Text>
                  </View>
                </View>
                
                {/* Optimal Load Card */}
                {vbtAnalysis.load_velocity_profile.optimal_load && (
                  <View style={[styles.chartCard, { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.3)' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                      <Ionicons name="flash" size={20} color="#f59e0b" />
                      <Text style={[styles.chartTitle, { marginBottom: 0, marginLeft: 8, color: '#f59e0b' }]}>
                        {locale === 'pt' ? 'Carga Ótima (Potência Máxima)' : 'Optimal Load (Max Power)'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#f59e0b' }}>
                          {vbtAnalysis.load_velocity_profile.optimal_load}kg
                        </Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
                          {locale === 'pt' ? 'Carga' : 'Load'}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 28, fontWeight: 'bold', color: colors.text.primary }}>
                          {vbtAnalysis.load_velocity_profile.optimal_velocity}
                        </Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>m/s</Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#10b981' }}>
                          {vbtAnalysis.load_velocity_profile.optimal_power}W
                        </Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
                          {locale === 'pt' ? 'Potência' : 'Power'}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
                
                {/* Load-Velocity Profile Chart */}
                <View style={styles.chartCard}>
                  <Text style={styles.chartTitle}>{labels.loadVelocity}</Text>
                  <LoadVelocityChart analysis={vbtAnalysis} />
                  
                  {/* Legend */}
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#f59e0b' }} />
                      <Text style={{ color: colors.text.secondary, fontSize: 10 }}>
                        {locale === 'pt' ? 'Carga Ótima' : 'Optimal Load'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#10b981' }} />
                      <Text style={{ color: colors.text.secondary, fontSize: 10 }}>1RM</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 12, height: 3, backgroundColor: '#ef4444' }} />
                      <Text style={{ color: colors.text.secondary, fontSize: 10 }}>MVT</Text>
                    </View>
                  </View>
                </View>
                
                {/* Optimal Load Evolution Chart */}
                {vbtAnalysis.optimal_load_evolution && vbtAnalysis.optimal_load_evolution.length >= 2 && (
                  <View style={styles.chartCard}>
                    <OptimalLoadEvolutionChart 
                      data={vbtAnalysis.optimal_load_evolution} 
                      locale={locale} 
                    />
                  </View>
                )}
                
                {/* Velocity Loss Chart */}
                {vbtAnalysis.velocity_loss_analysis.length > 0 && (
                  <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>{labels.velocityLoss}</Text>
                    <VelocityLossChart data={vbtAnalysis.velocity_loss_analysis} locale={locale} />
                  </View>
                )}
                
                {/* Recommendations */}
                {vbtAnalysis.recommendations.length > 0 && (
                  <View style={styles.recommendationsCard}>
                    <Text style={styles.chartTitle}>{labels.recommendations}</Text>
                    {vbtAnalysis.recommendations.map((rec, i) => (
                      <Text key={i} style={styles.recommendation}>{rec}</Text>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="analytics-outline" size={48} color={colors.text.tertiary} />
                <Text style={styles.emptyText}>{labels.noVbtData}</Text>
              </View>
            )}

            {/* VBT Data Entry Form */}
            <View style={styles.vbtFormSection}>
              <Text style={styles.sectionTitle}>
                <Ionicons name="add-circle" size={16} color={colors.accent.primary} />
                {' '}{locale === 'pt' ? 'Adicionar Dados VBT' : 'Add VBT Data'}
              </Text>
              
              {/* Device Selection with Input Method Info */}
              <Text style={styles.label}>{labels.device}</Text>
              <View style={styles.providerGrid}>
                {PROVIDERS.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.providerButton, provider === p.id && styles.providerButtonActive]}
                    onPress={() => setProvider(p.id)}
                  >
                    <Text style={[styles.providerText, provider === p.id && styles.providerTextActive]}>
                      {p.name}
                    </Text>
                    <Text style={[styles.providerMethodText, provider === p.id && styles.providerMethodTextActive]}>
                      {p.inputMethod}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              {/* Input Method Info */}
              {provider !== 'manual' && (
                <View style={styles.inputMethodInfo}>
                  <Ionicons name="information-circle" size={16} color={colors.accent.primary} />
                  <Text style={styles.inputMethodInfoText}>
                    {locale === 'pt' 
                      ? `${PROVIDERS.find(p => p.id === provider)?.name}: Sincronize via ${PROVIDERS.find(p => p.id === provider)?.inputMethod}. Para entrada manual, selecione "Manual".`
                      : `${PROVIDERS.find(p => p.id === provider)?.name}: Sync via ${PROVIDERS.find(p => p.id === provider)?.inputMethod}. For manual entry, select "Manual".`
                    }
                  </Text>
                </View>
              )}
              
              {/* Sets Input - Manual Entry */}
              <Text style={[styles.label, { marginTop: 16 }]}>
                Sets {provider === 'manual' && (locale === 'pt' ? '(entrada manual)' : '(manual entry)')}
              </Text>
              <View style={styles.setHeader}>
                <Text style={styles.setHeaderText}>#</Text>
                <Text style={styles.setHeaderText}>{locale === 'pt' ? 'Carga' : 'Load'}</Text>
                <Text style={styles.setHeaderText}>{locale === 'pt' ? 'Vel.' : 'Vel.'}</Text>
                <Text style={styles.setHeaderText}>Power</Text>
                <Text style={styles.setHeaderText}></Text>
              </View>
              {vbtSets.map((set, i) => (
                <View key={i} style={styles.setRow}>
                  <Text style={styles.setNumber}>#{i + 1}</Text>
                  <TextInput
                    style={styles.setInput}
                    placeholder="kg"
                    value={getVbtInputValue(i, 'load_kg', set.load_kg)}
                    onChangeText={(v) => handleSetChange(i, 'load_kg', formatDecimalInput(v))}
                    keyboardType="decimal-pad"
                    placeholderTextColor={colors.text.tertiary}
                  />
                  <TextInput
                    style={styles.setInput}
                    placeholder="m/s"
                    value={getVbtInputValue(i, 'mean_velocity', set.mean_velocity)}
                    onChangeText={(v) => handleSetChange(i, 'mean_velocity', formatDecimalInput(v))}
                    keyboardType="decimal-pad"
                    placeholderTextColor={colors.text.tertiary}
                  />
                  <TextInput
                    style={styles.setInput}
                    placeholder="W"
                    value={getVbtInputValue(i, 'power_watts', set.power_watts)}
                    onChangeText={(v) => handleSetChange(i, 'power_watts', formatDecimalInput(v))}
                    keyboardType="decimal-pad"
                    placeholderTextColor={colors.text.tertiary}
                  />
                  <TouchableOpacity onPress={() => handleRemoveSet(i)} style={styles.removeSetBtn}>
                    <Ionicons name="trash" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
              
              <TouchableOpacity style={styles.addSetButton} onPress={handleAddSet}>
                <Ionicons name="add-circle" size={20} color={colors.accent.primary} />
                <Text style={styles.addSetText}>{labels.addSet}</Text>
              </TouchableOpacity>
              
              {/* VBT Submit Button */}
              <TouchableOpacity
                style={[styles.vbtSubmitButton, vbtMutation.isPending && styles.submitButtonDisabled]}
                onPress={handleSubmitVBT}
                disabled={vbtMutation.isPending}
              >
                <LinearGradient colors={['#7c3aed', '#4f46e5']} style={styles.vbtSubmitGradient}>
                  {vbtMutation.isPending ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="save" size={20} color="#ffffff" />
                      <Text style={styles.vbtSubmitText}>{labels.saveVbt}</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
      
      {/* Exercise Selection Modal */}
      <Modal
        visible={showExerciseModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowExerciseModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{labels.selectExercise}</Text>
              <TouchableOpacity onPress={() => setShowExerciseModal(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {EXERCISES.map((ex) => (
                <TouchableOpacity
                  key={ex}
                  style={[styles.modalOption, selectedExercise === ex && styles.modalOptionActive]}
                  onPress={() => {
                    setSelectedExercise(ex);
                    setShowExerciseModal(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{ex}</Text>
                  {selectedExercise === ex && (
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
  sectionTabs: {
    flexDirection: 'row',
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  sectionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  sectionTabActive: {
    backgroundColor: colors.accent.primary,
  },
  sectionTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  sectionTabTextActive: {
    color: '#ffffff',
  },
  form: {
    gap: 16,
  },
  section: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
  },
  inputGroup: {
    marginBottom: 8,
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
  inputWarning: {
    borderColor: colors.status.error,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 10,
    color: colors.status.warning,
    marginTop: 4,
  },
  referenceCard: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  referenceTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent.primary,
    marginBottom: 12,
  },
  referenceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  referenceItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.dark.card,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  refLabel: {
    fontSize: 10,
    color: colors.text.tertiary,
    marginBottom: 2,
  },
  refValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  submitButton: {
    backgroundColor: colors.accent.primary,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // VBT specific styles
  exerciseSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  exerciseSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  exerciseSelectorText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
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
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 4,
  },
  chartCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 12,
  },
  chartPlaceholder: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartPlaceholderText: {
    color: colors.text.tertiary,
    fontSize: 13,
  },
  recommendationsCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  recommendation: {
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: 8,
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 12,
  },
  vbtFormSection: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  providerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  providerButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.dark.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: 'center',
    minWidth: '30%',
  },
  providerButtonActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  providerText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  providerTextActive: {
    color: '#ffffff',
  },
  providerMethodText: {
    fontSize: 9,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  providerMethodTextActive: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  inputMethodInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    gap: 8,
  },
  inputMethodInfoText: {
    flex: 1,
    fontSize: 11,
    color: colors.text.secondary,
    lineHeight: 16,
  },
  setHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  setHeaderText: {
    flex: 1,
    fontSize: 10,
    color: colors.text.tertiary,
    textAlign: 'center',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  setNumber: {
    fontSize: 12,
    color: colors.text.secondary,
    width: 24,
    textAlign: 'center',
  },
  setInput: {
    flex: 1,
    backgroundColor: colors.dark.secondary,
    borderRadius: 8,
    padding: 10,
    color: colors.text.primary,
    fontSize: 13,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  removeSetBtn: {
    padding: 6,
  },
  addSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    marginTop: 8,
  },
  addSetText: {
    color: colors.accent.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  vbtSubmitButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 12,
  },
  vbtSubmitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  vbtSubmitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Modal styles
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
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: colors.dark.card,
  },
  modalOptionActive: {
    borderColor: colors.accent.primary,
    borderWidth: 1,
  },
  modalOptionText: {
    fontSize: 15,
    color: colors.text.primary,
  },
});
