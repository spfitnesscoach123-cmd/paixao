import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line, Circle, Polyline, Rect, G, Text as SvgText, Path } from 'react-native-svg';
import api from '../../../services/api';
import { colors } from '../../../constants/theme';
import { useLanguage } from '../../../contexts/LanguageContext';

const { width: screenWidth } = Dimensions.get('window');

interface VBTSet {
  reps: number;
  mean_velocity: number;
  peak_velocity: number;
  load_kg: number;
  power_watts: number;
  rom_cm?: number;
}

interface VBTData {
  _id: string;
  athlete_id: string;
  date: string;
  provider: string;
  exercise: string;
  sets: VBTSet[];
  summary: {
    total_sets: number;
    total_reps: number;
    avg_velocity: number;
    max_velocity: number;
    avg_power: number;
    max_power: number;
    max_load: number;
  };
  notes?: string;
}

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
    optimal_load?: number | null;
    optimal_velocity?: number | null;
    optimal_power?: number | null;
  };
  velocity_loss_analysis: Array<{ set: number; velocity: number; loss_percent: number }>;
  trend: string;
  history: Array<{ date: string; avg_velocity: number; max_velocity: number; max_load: number }>;
  recommendations: string[];
}

const EXERCISES = [
  'Back Squat', 'Front Squat', 'Bench Press', 'Deadlift',
  'Power Clean', 'Hang Clean', 'Push Press', 'Hip Thrust',
];

const PROVIDERS = [
  { id: 'manual', name: 'Manual', icon: 'create', color: colors.text.secondary },
];

// Load-Velocity Profile Chart
const LoadVelocityChart = ({ analysis }: { analysis: VBTAnalysis }) => {
  const { locale } = useLanguage();
  const chartWidth = screenWidth - 64;
  const chartHeight = 200;
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
  
  // Calculate line points
  const minLoad = 0;
  const maxLoad = estimated_1rm ? estimated_1rm * 1.1 : 150;
  
  const getY = (load: number) => {
    const velocity = intercept + slope * load;
    const normalizedV = Math.max(0, Math.min(1.5, velocity));
    return padding.top + innerHeight - (normalizedV / 1.5) * innerHeight;
  };
  
  const getX = (load: number) => {
    return padding.left + (load / maxLoad) * innerWidth;
  };
  
  // Line from 0 to estimated 1RM
  const lineStart = { x: getX(minLoad), y: getY(minLoad) };
  const lineEnd = { x: getX(estimated_1rm || maxLoad), y: getY(estimated_1rm || maxLoad) };
  
  // MVT line
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
        x={padding.left - 35}
        y={chartHeight / 2}
        textAnchor="middle"
        fill={colors.text.secondary}
        fontSize="10"
        rotation="-90"
        origin={`${padding.left - 35}, ${chartHeight / 2}`}
      >
        {locale === 'pt' ? 'Velocidade (m/s)' : 'Velocity (m/s)'}
      </SvgText>
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

// Velocity Loss Chart
const VelocityLossChart = ({ data }: { data: Array<{ set: number; velocity: number; loss_percent: number }> }) => {
  const { locale } = useLanguage();
  const chartWidth = screenWidth - 64;
  const chartHeight = 150;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  
  if (!data || data.length === 0) return null;
  
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  
  const maxLoss = Math.max(...data.map(d => d.loss_percent), 30);
  
  const barWidth = (innerWidth / data.length) * 0.6;
  const barGap = (innerWidth / data.length) * 0.4;
  
  const getBarColor = (loss: number) => {
    if (loss < 10) return '#10b981';
    if (loss < 20) return '#f59e0b';
    return '#ef4444';
  };
  
  return (
    <Svg width={chartWidth} height={chartHeight}>
      {/* Grid lines */}
      {[0, 10, 20, 30].map((val, i) => (
        <G key={`grid-${i}`}>
          <Line
            x1={padding.left}
            y1={padding.top + innerHeight - (val / maxLoss) * innerHeight}
            x2={chartWidth - padding.right}
            y2={padding.top + innerHeight - (val / maxLoss) * innerHeight}
            stroke={colors.border.default}
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <SvgText
            x={padding.left - 5}
            y={padding.top + innerHeight - (val / maxLoss) * innerHeight + 4}
            textAnchor="end"
            fill={colors.text.tertiary}
            fontSize="9"
          >
            {val}%
          </SvgText>
        </G>
      ))}
      
      {/* Bars */}
      {data.map((d, i) => {
        const x = padding.left + i * (barWidth + barGap) + barGap / 2;
        const barHeight = (d.loss_percent / maxLoss) * innerHeight;
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
              fontSize="10"
            >
              Set {d.set}
            </SvgText>
            <SvgText
              x={x + barWidth / 2}
              y={y - 5}
              textAnchor="middle"
              fill={colors.text.primary}
              fontSize="9"
              fontWeight="bold"
            >
              {d.loss_percent.toFixed(0)}%
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
};

export default function VBTPage() {
  const { id: athleteId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, locale } = useLanguage();
  
  const [selectedExercise, setSelectedExercise] = useState('Back Squat');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  
  // Form state
  const [provider, setProvider] = useState('gymaware');
  const [sets, setSets] = useState<VBTSet[]>([
    { reps: 5, mean_velocity: 0, peak_velocity: 0, load_kg: 0, power_watts: 0 }
  ]);
  
  // Fetch VBT analysis
  const { data: analysis, isLoading: analysisLoading } = useQuery({
    queryKey: ['vbt-analysis', athleteId, selectedExercise],
    queryFn: async () => {
      const response = await api.get<VBTAnalysis>(
        `/vbt/analysis/${athleteId}?exercise=${encodeURIComponent(selectedExercise)}&lang=${locale}`
      );
      return response.data;
    },
    retry: false,
  });
  
  // Create VBT mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/vbt/data', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vbt-analysis', athleteId] });
      setShowAddModal(false);
      Alert.alert(
        locale === 'pt' ? 'Sucesso' : 'Success',
        locale === 'pt' ? 'Dados VBT salvos!' : 'VBT data saved!'
      );
    },
    onError: (error: any) => {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save');
    },
  });
  
  const handleAddSet = () => {
    setSets([...sets, { reps: 5, mean_velocity: 0, peak_velocity: 0, load_kg: 0, power_watts: 0 }]);
  };
  
  const handleRemoveSet = (index: number) => {
    if (sets.length > 1) {
      setSets(sets.filter((_, i) => i !== index));
    }
  };
  
  const handleSetChange = (index: number, field: keyof VBTSet, value: string) => {
    const newSets = [...sets];
    newSets[index] = { ...newSets[index], [field]: parseFloat(value) || 0 };
    setSets(newSets);
  };
  
  const handleSubmit = () => {
    const validSets = sets.filter(s => s.load_kg > 0 && s.mean_velocity > 0);
    if (validSets.length === 0) {
      Alert.alert(
        locale === 'pt' ? 'Dados inválidos' : 'Invalid data',
        locale === 'pt' ? 'Preencha ao menos um set com carga e velocidade' : 'Fill at least one set with load and velocity'
      );
      return;
    }
    
    createMutation.mutate({
      athlete_id: athleteId,
      date: new Date().toISOString().split('T')[0],
      provider,
      exercise: selectedExercise,
      sets: validSets,
    });
  };
  
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#7c3aed', '#4f46e5']} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>VBT</Text>
          <Text style={styles.headerSubtitle}>Velocity Based Training</Text>
        </View>
        <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.addButton}>
          <Ionicons name="add" size={24} color="#ffffff" />
        </TouchableOpacity>
      </LinearGradient>
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
        
        {analysisLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent.primary} />
          </View>
        ) : analysis ? (
          <>
            {/* Summary Cards */}
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{analysis.latest_session.avg_velocity.toFixed(2)}</Text>
                <Text style={styles.summaryLabel}>m/s {locale === 'pt' ? 'Média' : 'Avg'}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{analysis.latest_session.max_load}</Text>
                <Text style={styles.summaryLabel}>kg Max</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryValue, { color: '#10b981' }]}>
                  {analysis.load_velocity_profile.estimated_1rm?.toFixed(0) || '-'}
                </Text>
                <Text style={styles.summaryLabel}>1RM Est.</Text>
              </View>
              {analysis.load_velocity_profile.optimal_load && (
                <View style={styles.summaryCard}>
                  <Text style={[styles.summaryValue, { color: '#f59e0b' }]}>
                    {analysis.load_velocity_profile.optimal_load}
                  </Text>
                  <Text style={styles.summaryLabel}>
                    kg {locale === 'pt' ? 'Ótimo' : 'Optimal'}
                  </Text>
                </View>
              )}
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{analysis.latest_session.max_power}</Text>
                <Text style={styles.summaryLabel}>W Max</Text>
              </View>
            </View>
            
            {/* Load-Velocity Profile */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>
                {locale === 'pt' ? 'Perfil Carga-Velocidade' : 'Load-Velocity Profile'}
              </Text>
              <LoadVelocityChart analysis={analysis} />
            </View>
            
            {/* Velocity Loss */}
            {analysis.velocity_loss_analysis.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>
                  {locale === 'pt' ? 'Perda de Velocidade por Set' : 'Velocity Loss per Set'}
                </Text>
                <VelocityLossChart data={analysis.velocity_loss_analysis} />
              </View>
            )}
            
            {/* Recommendations */}
            {analysis.recommendations.length > 0 && (
              <View style={styles.recommendationsCard}>
                <Text style={styles.chartTitle}>
                  {locale === 'pt' ? 'Recomendações' : 'Recommendations'}
                </Text>
                {analysis.recommendations.map((rec, i) => (
                  <Text key={i} style={styles.recommendation}>{rec}</Text>
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="analytics-outline" size={64} color={colors.text.tertiary} />
            <Text style={styles.emptyText}>
              {locale === 'pt' 
                ? 'Nenhum dado VBT para este exercício'
                : 'No VBT data for this exercise'
              }
            </Text>
            <TouchableOpacity 
              style={styles.emptyButton}
              onPress={() => setShowAddModal(true)}
            >
              <Text style={styles.emptyButtonText}>
                {locale === 'pt' ? 'Adicionar Dados' : 'Add Data'}
              </Text>
            </TouchableOpacity>
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
              <Text style={styles.modalTitle}>
                {locale === 'pt' ? 'Selecionar Exercício' : 'Select Exercise'}
              </Text>
              <TouchableOpacity onPress={() => setShowExerciseModal(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
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
          </View>
        </View>
      </Modal>
      
      {/* Add VBT Data Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {locale === 'pt' ? 'Adicionar Dados VBT' : 'Add VBT Data'}
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            
            <ScrollView>
              <Text style={styles.modalLabel}>
                {locale === 'pt' ? 'Exercício' : 'Exercise'}: <Text style={styles.modalValue}>{selectedExercise}</Text>
              </Text>
              
              <Text style={styles.modalLabel}>{locale === 'pt' ? 'Dispositivo' : 'Device'}</Text>
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
                  </TouchableOpacity>
                ))}
              </View>
              
              <Text style={styles.modalLabel}>Sets</Text>
              {sets.map((set, i) => (
                <View key={i} style={styles.setRow}>
                  <Text style={styles.setNumber}>#{i + 1}</Text>
                  <TextInput
                    style={styles.setInput}
                    placeholder="Carga"
                    value={set.load_kg ? String(set.load_kg) : ''}
                    onChangeText={(v) => handleSetChange(i, 'load_kg', v)}
                    keyboardType="decimal-pad"
                    placeholderTextColor={colors.text.tertiary}
                  />
                  <TextInput
                    style={styles.setInput}
                    placeholder="Vel."
                    value={set.mean_velocity ? String(set.mean_velocity) : ''}
                    onChangeText={(v) => handleSetChange(i, 'mean_velocity', v)}
                    keyboardType="decimal-pad"
                    placeholderTextColor={colors.text.tertiary}
                  />
                  <TextInput
                    style={styles.setInput}
                    placeholder="Power"
                    value={set.power_watts ? String(set.power_watts) : ''}
                    onChangeText={(v) => handleSetChange(i, 'power_watts', v)}
                    keyboardType="decimal-pad"
                    placeholderTextColor={colors.text.tertiary}
                  />
                  <TouchableOpacity onPress={() => handleRemoveSet(i)}>
                    <Ionicons name="trash" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
              
              <TouchableOpacity style={styles.addSetButton} onPress={handleAddSet}>
                <Ionicons name="add-circle" size={20} color={colors.accent.primary} />
                <Text style={styles.addSetText}>
                  {locale === 'pt' ? 'Adicionar Set' : 'Add Set'}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSubmit}
                disabled={createMutation.isPending}
              >
                <LinearGradient colors={['#7c3aed', '#4f46e5']} style={styles.submitGradient}>
                  {createMutation.isPending ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.submitText}>
                      {locale === 'pt' ? 'Salvar' : 'Save'}
                    </Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.primary,
  },
  header: {
    paddingTop: 48,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
    marginLeft: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  exerciseSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
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
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 4,
  },
  chartCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 16,
  },
  chartPlaceholder: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartPlaceholderText: {
    color: colors.text.tertiary,
  },
  recommendationsCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  recommendation: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 8,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: colors.text.secondary,
    marginTop: 16,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  emptyButtonText: {
    color: '#ffffff',
    fontWeight: '600',
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
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: colors.dark.card,
  },
  modalOptionActive: {
    borderColor: colors.accent.primary,
    borderWidth: 1,
  },
  modalOptionText: {
    fontSize: 16,
    color: colors.text.primary,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 8,
    marginTop: 16,
  },
  modalValue: {
    color: colors.accent.primary,
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
    backgroundColor: colors.dark.card,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  providerButtonActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  providerText: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  providerTextActive: {
    color: '#ffffff',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  setNumber: {
    fontSize: 14,
    color: colors.text.secondary,
    width: 30,
  },
  setInput: {
    flex: 1,
    backgroundColor: colors.dark.card,
    borderRadius: 8,
    padding: 10,
    color: colors.text.primary,
    fontSize: 14,
    textAlign: 'center',
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
  },
  submitButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 16,
  },
  submitGradient: {
    padding: 16,
    alignItems: 'center',
  },
  submitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
