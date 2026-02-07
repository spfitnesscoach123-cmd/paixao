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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../../services/api';
import { colors } from '../../../constants/theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import { format } from 'date-fns';

export default function AddStrengthAssessment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useLanguage();
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [meanPower, setMeanPower] = useState('');
  const [peakPower, setPeakPower] = useState('');
  const [meanSpeed, setMeanSpeed] = useState('');
  const [peakSpeed, setPeakSpeed] = useState('');
  const [rsi, setRsi] = useState('');
  const [fatigueIndex, setFatigueIndex] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async () => {
    if (!meanPower && !peakPower && !meanSpeed && !peakSpeed && !rsi) {
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        locale === 'pt' ? 'Preencha pelo menos uma métrica' : 'Fill at least one metric'
      );
      return;
    }

    setLoading(true);
    try {
      const metrics: Record<string, number> = {};
      
      if (meanPower) metrics.mean_power = parseFloat(meanPower);
      if (peakPower) metrics.peak_power = parseFloat(peakPower);
      if (meanSpeed) metrics.mean_speed = parseFloat(meanSpeed);
      if (peakSpeed) metrics.peak_speed = parseFloat(peakSpeed);
      if (rsi) metrics.rsi = parseFloat(rsi);
      if (fatigueIndex) metrics.fatigue_index = parseFloat(fatigueIndex);

      await api.post('/assessments', {
        athlete_id: id,
        date: date,
        assessment_type: 'strength',
        metrics: metrics,
        notes: notes || null,
      });

      Alert.alert(
        locale === 'pt' ? 'Sucesso' : 'Success',
        locale === 'pt' ? 'Avaliação de força registrada!' : 'Strength assessment recorded!',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        error.response?.data?.detail || (locale === 'pt' ? 'Erro ao salvar avaliação' : 'Error saving assessment')
      );
    } finally {
      setLoading(false);
    }
  };

  const labels = {
    title: locale === 'pt' ? 'Avaliação de Força' : 'Strength Assessment',
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
  };

  return (
    <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>{labels.title}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Date */}
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
                  onChangeText={setMeanSpeed}
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
                  onChangeText={setPeakSpeed}
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
                  onChangeText={setRsi}
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
            onPress={handleSubmit}
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
      </ScrollView>
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
    marginBottom: 24,
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
});
