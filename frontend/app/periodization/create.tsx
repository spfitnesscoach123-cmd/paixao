import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Dimensions,
  ActivityIndicator,
  Platform,
  SafeAreaView,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { colors } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import PremiumGate from '../../components/PremiumGate';
import api from '../../services/api';
import { format, addDays, parseISO, eachDayOfInterval } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';

const { width: screenWidth } = Dimensions.get('window');

// Day classifications
const DAY_CLASSIFICATIONS = [
  { id: 'MD', label: 'MD', color: '#ef4444', description: 'Match Day' },
  { id: 'MD-1', label: 'MD-1', color: '#f97316', description: 'Dia antes do jogo' },
  { id: 'MD-2', label: 'MD-2', color: '#eab308', description: '2 dias antes' },
  { id: 'MD-3', label: 'MD-3', color: '#22c55e', description: '3 dias antes' },
  { id: 'MD-4', label: 'MD-4', color: '#14b8a6', description: '4 dias antes' },
  { id: 'MD-5', label: 'MD-5', color: '#3b82f6', description: '5 dias antes' },
  { id: 'D.O', label: 'D.O', color: '#6b7280', description: 'Day Off' },
];

// Multiplier options
const MULTIPLIER_OPTIONS = [
  1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0,
  2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.0
];

// Metrics
const METRICS = [
  { id: 'total_distance', label: 'Dist. Total', unit: 'm', shortLabel: 'DT' },
  { id: 'hid_z3', label: 'HID Z3', unit: 'm', shortLabel: 'Z3' },
  { id: 'hsr_z4', label: 'HSR Z4', unit: 'm', shortLabel: 'Z4' },
  { id: 'sprint_z5', label: 'Sprint Z5', unit: 'm', shortLabel: 'Z5' },
  { id: 'sprints_count', label: 'Sprints', unit: '', shortLabel: 'SPR' },
  { id: 'acc_dec_total', label: 'ACC+DEC', unit: '', shortLabel: 'A/D' },
];

interface DailyPrescription {
  day_classification: string;
  date: string;
  total_distance_percent: number;
  hid_z3_percent: number;
  hsr_z4_percent: number;
  sprint_z5_percent: number;
  sprints_count_percent: number;
  acc_dec_total_percent: number;
}

interface WeeklyPrescription {
  total_distance_multiplier: number;
  hid_z3_multiplier: number;
  hsr_z4_multiplier: number;
  sprint_z5_multiplier: number;
  sprints_count_multiplier: number;
  acc_dec_total_multiplier: number;
}

/**
 * CreatePeriodizationScreen - Criação de periodização semanal
 * 
 * FEATURE PREMIUM - Requer trial ou assinatura ativa
 */
export default function CreatePeriodizationScreen() {
  const { locale } = useLanguage();
  
  const featureName = locale === 'pt' ? 'Periodização' : 'Periodization';
  
  return (
    <PremiumGate featureName={featureName}>
      <CreatePeriodizationContent />
    </PremiumGate>
  );
}

function CreatePeriodizationContent() {
  const { locale } = useLanguage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const dateLocale = locale === 'pt' ? ptBR : enUS;

  // Form state
  const [weekName, setWeekName] = useState('');
  const [startDateStr, setStartDateStr] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDateStr, setEndDateStr] = useState(format(addDays(new Date(), 6), 'yyyy-MM-dd'));
  const [currentStep, setCurrentStep] = useState(1); // 1: dates, 2: days, 3: weekly, 4: daily
  const [days, setDays] = useState<DailyPrescription[]>([]);
  const [weeklyPrescription, setWeeklyPrescription] = useState<WeeklyPrescription>({
    total_distance_multiplier: 1.3,
    hid_z3_multiplier: 1.3,
    hsr_z4_multiplier: 1.3,
    sprint_z5_multiplier: 1.3,
    sprints_count_multiplier: 1.3,
    acc_dec_total_multiplier: 1.3,
  });
  const [selectedMetricForMultiplier, setSelectedMetricForMultiplier] = useState<string | null>(null);

  // Parse dates
  const startDate = parseISO(startDateStr);
  const endDate = parseISO(endDateStr);

  // Generate days when dates change
  const generateDays = () => {
    const daysInRange = eachDayOfInterval({ start: startDate, end: endDate });
    const newDays: DailyPrescription[] = daysInRange.map(date => ({
      day_classification: 'MD-3',
      date: format(date, 'yyyy-MM-dd'),
      total_distance_percent: 60,
      hid_z3_percent: 60,
      hsr_z4_percent: 60,
      sprint_z5_percent: 60,
      sprints_count_percent: 60,
      acc_dec_total_percent: 60,
    }));
    setDays(newDays);
  };

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: weekName,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        days,
        weekly_prescription: weeklyPrescription,
        athlete_overrides: [],
      };
      return api.post('/periodization/weeks', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['periodization-weeks'] });
      Alert.alert(
        locale === 'pt' ? 'Sucesso' : 'Success',
        locale === 'pt' ? 'Semana criada com sucesso!' : 'Week created successfully!',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    },
    onError: (error: any) => {
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        error.response?.data?.detail || 'Failed to create week'
      );
    },
  });

  // Update day classification
  const updateDayClassification = (index: number, classification: string) => {
    const newDays = [...days];
    newDays[index].day_classification = classification;
    
    // Auto-set percentages based on classification
    const defaultPercents: Record<string, number> = {
      'MD': 100,
      'MD-1': 40,
      'MD-2': 70,
      'MD-3': 60,
      'MD-4': 50,
      'MD-5': 30,
      'D.O': 0,
    };
    
    const percent = defaultPercents[classification] || 50;
    newDays[index].total_distance_percent = percent;
    newDays[index].hid_z3_percent = percent;
    newDays[index].hsr_z4_percent = percent;
    newDays[index].sprint_z5_percent = percent;
    newDays[index].sprints_count_percent = percent;
    newDays[index].acc_dec_total_percent = percent;
    
    setDays(newDays);
  };

  // Update day percentage
  const updateDayPercent = (dayIndex: number, metric: string, value: number) => {
    const newDays = [...days];
    (newDays[dayIndex] as any)[`${metric}_percent`] = value;
    setDays(newDays);
  };

  // Render step 1 - Dates
  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>
        {locale === 'pt' ? 'Informações da Semana' : 'Week Information'}
      </Text>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>
          {locale === 'pt' ? 'Nome da Semana' : 'Week Name'}
        </Text>
        <TextInput
          style={styles.textInput}
          value={weekName}
          onChangeText={setWeekName}
          placeholder={locale === 'pt' ? 'Ex: Semana 1 - Pré-temporada' : 'Ex: Week 1 - Pre-season'}
          placeholderTextColor={colors.text.tertiary}
          data-testid="week-name-input"
        />
      </View>

      <View style={styles.dateRow}>
        <View style={styles.dateGroup}>
          <Text style={styles.inputLabel}>
            {locale === 'pt' ? 'Data Início' : 'Start Date'}
          </Text>
          <TextInput
            style={styles.dateInput}
            value={startDateStr}
            onChangeText={setStartDateStr}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.text.tertiary}
            data-testid="start-date-input"
          />
        </View>

        <View style={styles.dateGroup}>
          <Text style={styles.inputLabel}>
            {locale === 'pt' ? 'Data Fim' : 'End Date'}
          </Text>
          <TextInput
            style={styles.dateInput}
            value={endDateStr}
            onChangeText={setEndDateStr}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.text.tertiary}
            data-testid="end-date-input"
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.nextButton, !weekName && styles.nextButtonDisabled]}
        onPress={() => {
          generateDays();
          setCurrentStep(2);
        }}
        disabled={!weekName}
        data-testid="next-step-1"
      >
        <Text style={styles.nextButtonText}>
          {locale === 'pt' ? 'Próximo: Classificar Dias' : 'Next: Classify Days'}
        </Text>
        <Ionicons name="arrow-forward" size={20} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );

  // Render step 2 - Day Classifications
  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>
        {locale === 'pt' ? 'Classificar Dias da Semana' : 'Classify Days'}
      </Text>
      <Text style={styles.stepDescription}>
        {locale === 'pt' 
          ? 'Defina o tipo de cada dia (MD, MD-1, D.O, etc.)'
          : 'Define each day type (MD, MD-1, D.O, etc.)'}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daysScroll}>
        {days.map((day, index) => {
          const classification = DAY_CLASSIFICATIONS.find(c => c.id === day.day_classification);
          return (
            <View key={day.date} style={styles.dayColumn}>
              <Text style={styles.dayDateLabel}>
                {format(parseISO(day.date), 'EEE', { locale: dateLocale })}
              </Text>
              <Text style={styles.dayDateNumber}>
                {format(parseISO(day.date), 'dd')}
              </Text>
              
              <View style={styles.classificationPicker}>
                {DAY_CLASSIFICATIONS.map(cls => (
                  <TouchableOpacity
                    key={cls.id}
                    style={[
                      styles.classificationOption,
                      { backgroundColor: cls.color },
                      day.day_classification === cls.id && styles.classificationSelected,
                    ]}
                    onPress={() => updateDayClassification(index, cls.id)}
                  >
                    <Text style={styles.classificationLabel}>{cls.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.navigationRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setCurrentStep(1)}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text.secondary} />
          <Text style={styles.backButtonText}>
            {locale === 'pt' ? 'Voltar' : 'Back'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.nextButton}
          onPress={() => setCurrentStep(3)}
          data-testid="next-step-2"
        >
          <Text style={styles.nextButtonText}>
            {locale === 'pt' ? 'Próximo: Carga Semanal' : 'Next: Weekly Load'}
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  // Render step 3 - Weekly Prescription
  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>
        {locale === 'pt' ? 'Prescrição Semanal' : 'Weekly Prescription'}
      </Text>
      <Text style={styles.stepDescription}>
        {locale === 'pt' 
          ? 'Defina o fator multiplicador para cada métrica (baseado no melhor valor de JOGO)'
          : 'Set the multiplier for each metric (based on best GAME value)'}
      </Text>

      <View style={styles.multipliersGrid}>
        {METRICS.map(metric => (
          <View key={metric.id} style={styles.multiplierCard}>
            <Text style={styles.multiplierLabel}>{metric.label}</Text>
            <View style={styles.multiplierSelector}>
              <TouchableOpacity
                style={styles.multiplierAdjust}
                onPress={() => {
                  const currentValue = (weeklyPrescription as any)[`${metric.id}_multiplier`];
                  const currentIndex = MULTIPLIER_OPTIONS.indexOf(currentValue);
                  if (currentIndex > 0) {
                    setWeeklyPrescription({
                      ...weeklyPrescription,
                      [`${metric.id}_multiplier`]: MULTIPLIER_OPTIONS[currentIndex - 1],
                    });
                  }
                }}
              >
                <Ionicons name="remove" size={20} color={colors.text.primary} />
              </TouchableOpacity>
              
              <Text style={styles.multiplierValue}>
                {(weeklyPrescription as any)[`${metric.id}_multiplier`].toFixed(1)}x
              </Text>
              
              <TouchableOpacity
                style={styles.multiplierAdjust}
                onPress={() => {
                  const currentValue = (weeklyPrescription as any)[`${metric.id}_multiplier`];
                  const currentIndex = MULTIPLIER_OPTIONS.indexOf(currentValue);
                  if (currentIndex < MULTIPLIER_OPTIONS.length - 1) {
                    setWeeklyPrescription({
                      ...weeklyPrescription,
                      [`${metric.id}_multiplier`]: MULTIPLIER_OPTIONS[currentIndex + 1],
                    });
                  }
                }}
              >
                <Ionicons name="add" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.navigationRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setCurrentStep(2)}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text.secondary} />
          <Text style={styles.backButtonText}>
            {locale === 'pt' ? 'Voltar' : 'Back'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.nextButton}
          onPress={() => setCurrentStep(4)}
          data-testid="next-step-3"
        >
          <Text style={styles.nextButtonText}>
            {locale === 'pt' ? 'Próximo: Carga Diária' : 'Next: Daily Load'}
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  // Render step 4 - Daily Prescription
  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>
        {locale === 'pt' ? 'Prescrição Diária' : 'Daily Prescription'}
      </Text>
      <Text style={styles.stepDescription}>
        {locale === 'pt' 
          ? 'Defina o percentual do valor de JOGO para cada dia'
          : 'Set the percentage of GAME value for each day'}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Header */}
          <View style={styles.dailyTableHeader}>
            <View style={styles.dailyTableMetricCell}>
              <Text style={styles.dailyTableHeaderText}>
                {locale === 'pt' ? 'Métrica' : 'Metric'}
              </Text>
            </View>
            {days.map(day => {
              const classification = DAY_CLASSIFICATIONS.find(c => c.id === day.day_classification);
              return (
                <View key={day.date} style={[styles.dailyTableDayCell, { backgroundColor: classification?.color + '30' }]}>
                  <Text style={styles.dailyTableDayText}>
                    {format(parseISO(day.date), 'EEE', { locale: dateLocale })}
                  </Text>
                  <Text style={[styles.dailyTableDayClass, { color: classification?.color }]}>
                    {classification?.label}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Metrics rows */}
          {METRICS.map(metric => (
            <View key={metric.id} style={styles.dailyTableRow}>
              <View style={styles.dailyTableMetricCell}>
                <Text style={styles.dailyTableMetricText}>{metric.shortLabel}</Text>
              </View>
              {days.map((day, dayIndex) => (
                <View key={day.date} style={styles.dailyTableDayCell}>
                  <TextInput
                    style={styles.percentInput}
                    value={String((day as any)[`${metric.id}_percent`])}
                    onChangeText={(text) => {
                      const numValue = parseInt(text) || 0;
                      updateDayPercent(dayIndex, metric.id, numValue);
                    }}
                    keyboardType="numeric"
                    selectTextOnFocus
                  />
                  <Text style={styles.percentSymbol}>%</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.navigationRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setCurrentStep(3)}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text.secondary} />
          <Text style={styles.backButtonText}>
            {locale === 'pt' ? 'Voltar' : 'Back'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveButton, createMutation.isPending && styles.saveButtonDisabled]}
          onPress={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          data-testid="save-week-button"
        >
          {createMutation.isPending ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color="#ffffff" />
              <Text style={styles.saveButtonText}>
                {locale === 'pt' ? 'Criar Semana' : 'Create Week'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  // Step indicator
  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {[1, 2, 3, 4].map(step => (
        <View key={step} style={styles.stepItem}>
          <View style={[
            styles.stepDot,
            currentStep >= step && styles.stepDotActive,
            currentStep === step && styles.stepDotCurrent,
          ]}>
            {currentStep > step ? (
              <Ionicons name="checkmark" size={14} color="#ffffff" />
            ) : (
              <Text style={[
                styles.stepDotText,
                currentStep >= step && styles.stepDotTextActive,
              ]}>{step}</Text>
            )}
          </View>
          {step < 4 && (
            <View style={[
              styles.stepLine,
              currentStep > step && styles.stepLineActive,
            ]} />
          )}
        </View>
      ))}
    </View>
  );

  return (
    <LinearGradient
      colors={[colors.dark.background, colors.dark.secondary]}
      style={styles.container}
    >
      {/* CORREÇÃO 3: Header com SafeAreaView e padding adequado para visibilidade do botão */}
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => router.push('/(tabs)/periodization')} 
            style={styles.headerBack}
            data-testid="back-to-periodization"
          >
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            <Text style={styles.headerBackText}>
              {locale === 'pt' ? 'Voltar' : 'Back'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {locale === 'pt' ? 'Nova Semana' : 'New Week'}
          </Text>
          <View style={{ width: 80 }} />
        </View>
      </SafeAreaView>

      {renderStepIndicator()}

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}
        <View style={{ height: 100 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    backgroundColor: 'transparent',
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 16,
  },
  headerBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
  },
  headerBackText: {
    fontSize: 14,
    color: colors.text.primary,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    marginBottom: 24,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.dark.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotActive: {
    backgroundColor: colors.accent.primary,
  },
  stepDotCurrent: {
    borderWidth: 2,
    borderColor: colors.accent.secondary,
  },
  stepDotText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
  stepDotTextActive: {
    color: '#ffffff',
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: colors.dark.card,
    marginHorizontal: 4,
  },
  stepLineActive: {
    backgroundColor: colors.accent.primary,
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text.primary,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  dateGroup: {
    flex: 1,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateButtonText: {
    fontSize: 16,
    color: colors.text.primary,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent.primary,
    borderRadius: 12,
    paddingVertical: 16,
    flex: 1,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  backButtonText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  navigationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 24,
  },
  // Day classification styles
  daysScroll: {
    marginBottom: 24,
  },
  dayColumn: {
    alignItems: 'center',
    marginRight: 12,
    width: 60,
  },
  dayDateLabel: {
    fontSize: 12,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
  },
  dayDateNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 12,
  },
  classificationPicker: {
    gap: 6,
  },
  classificationOption: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    opacity: 0.4,
  },
  classificationSelected: {
    opacity: 1,
    transform: [{ scale: 1.1 }],
  },
  classificationLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  // Multiplier styles
  multipliersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  multiplierCard: {
    width: (screenWidth - 52) / 2,
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
  },
  multiplierLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 12,
  },
  multiplierSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  multiplierAdjust: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.dark.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  multiplierValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.accent.primary,
  },
  // Daily prescription table styles
  dailyTableHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dailyTableMetricCell: {
    width: 60,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  dailyTableHeaderText: {
    fontSize: 10,
    color: colors.text.tertiary,
    fontWeight: '600',
  },
  dailyTableDayCell: {
    width: 56,
    alignItems: 'center',
    paddingVertical: 8,
    marginHorizontal: 2,
    borderRadius: 8,
  },
  dailyTableDayText: {
    fontSize: 10,
    color: colors.text.secondary,
  },
  dailyTableDayClass: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  dailyTableRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dailyTableMetricText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  percentInput: {
    backgroundColor: colors.dark.card,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
    width: 40,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
  },
  percentSymbol: {
    fontSize: 10,
    color: colors.text.tertiary,
    marginLeft: 2,
  },
  percentValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 16,
    flex: 1,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  dateInput: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text.primary,
    textAlign: 'center',
  },
});
