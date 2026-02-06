import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../services/api';
import { PhysicalAssessment } from '../../../types';

type AssessmentType = 'strength' | 'aerobic' | 'body_composition';

export default function AddAssessment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [assessmentType, setAssessmentType] = useState<AssessmentType | null>(null);
  const [notes, setNotes] = useState('');

  // Strength metrics
  const [squat, setSquat] = useState('');
  const [bench, setBench] = useState('');
  const [deadlift, setDeadlift] = useState('');
  const [pullUps, setPullUps] = useState('');
  const [pushUps, setPushUps] = useState('');

  // Aerobic metrics
  const [vo2Max, setVo2Max] = useState('');
  const [yoyoTest, setYoyoTest] = useState('');
  const [cooper, setCooper] = useState('');
  const [restingHR, setRestingHR] = useState('');
  const [maxHR, setMaxHR] = useState('');

  // Body composition
  const [bodyFat, setBodyFat] = useState('');
  const [muscleMass, setMuscleMass] = useState('');
  const [bmi, setBmi] = useState('');
  const [waist, setWaist] = useState('');
  const [chest, setChest] = useState('');
  const [arm, setArm] = useState('');
  const [thigh, setThigh] = useState('');

  const createMutation = useMutation({
    mutationFn: async (data: Omit<PhysicalAssessment, 'id' | 'coach_id' | 'created_at'>) => {
      const response = await api.post('/assessments', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments', id] });
      Alert.alert('Sucesso', 'Avaliação registrada com sucesso!');
      router.back();
    },
    onError: (error: any) => {
      Alert.alert('Erro', error.response?.data?.detail || 'Erro ao registrar avaliação');
    },
  });

  const getMetrics = (): Record<string, any> => {
    switch (assessmentType) {
      case 'strength':
        return {
          ...(squat && { squat_kg: parseFloat(squat) }),
          ...(bench && { bench_press_kg: parseFloat(bench) }),
          ...(deadlift && { deadlift_kg: parseFloat(deadlift) }),
          ...(pullUps && { pull_ups: parseInt(pullUps) }),
          ...(pushUps && { push_ups: parseInt(pushUps) }),
        };
      case 'aerobic':
        return {
          ...(vo2Max && { vo2_max: parseFloat(vo2Max) }),
          ...(yoyoTest && { yoyo_test_level: parseFloat(yoyoTest) }),
          ...(cooper && { cooper_test_meters: parseFloat(cooper) }),
          ...(restingHR && { resting_hr: parseInt(restingHR) }),
          ...(maxHR && { max_hr: parseInt(maxHR) }),
        };
      case 'body_composition':
        return {
          ...(bodyFat && { body_fat_percentage: parseFloat(bodyFat) }),
          ...(muscleMass && { muscle_mass_kg: parseFloat(muscleMass) }),
          ...(bmi && { bmi: parseFloat(bmi) }),
          ...(waist && { waist_cm: parseFloat(waist) }),
          ...(chest && { chest_cm: parseFloat(chest) }),
          ...(arm && { arm_cm: parseFloat(arm) }),
          ...(thigh && { thigh_cm: parseFloat(thigh) }),
        };
      default:
        return {};
    }
  };

  const handleSubmit = () => {
    if (!assessmentType) {
      Alert.alert('Erro', 'Por favor, selecione o tipo de avaliação');
      return;
    }

    const metrics = getMetrics();
    if (Object.keys(metrics).length === 0) {
      Alert.alert('Erro', 'Por favor, preencha pelo menos uma métrica');
      return;
    }

    createMutation.mutate({
      athlete_id: id,
      date,
      assessment_type: assessmentType,
      metrics,
      notes: notes || undefined,
    });
  };

  const renderTypeSelection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Tipo de Avaliação</Text>
      <View style={styles.typeButtons}>
        <TouchableOpacity
          style={[styles.typeButton, assessmentType === 'strength' && styles.typeButtonActive]}
          onPress={() => setAssessmentType('strength')}
        >
          <Ionicons
            name="barbell"
            size={32}
            color={assessmentType === 'strength' ? '#ffffff' : '#8b5cf6'}
          />
          <Text style={[styles.typeButtonText, assessmentType === 'strength' && styles.typeButtonTextActive]}>
            Força
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.typeButton, assessmentType === 'aerobic' && styles.typeButtonActive]}
          onPress={() => setAssessmentType('aerobic')}
        >
          <Ionicons
            name="heart"
            size={32}
            color={assessmentType === 'aerobic' ? '#ffffff' : '#8b5cf6'}
          />
          <Text style={[styles.typeButtonText, assessmentType === 'aerobic' && styles.typeButtonTextActive]}>
            Aeróbico
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.typeButton, assessmentType === 'body_composition' && styles.typeButtonActive]}
          onPress={() => setAssessmentType('body_composition')}
        >
          <Ionicons
            name="body"
            size={32}
            color={assessmentType === 'body_composition' ? '#ffffff' : '#8b5cf6'}
          />
          <Text style={[styles.typeButtonText, assessmentType === 'body_composition' && styles.typeButtonTextActive]}>
            Composição
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStrengthFields = () => (
    <>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Agachamento (kg)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 120"
          value={squat}
          onChangeText={setSquat}
          keyboardType="decimal-pad"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Supino (kg)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 80"
          value={bench}
          onChangeText={setBench}
          keyboardType="decimal-pad"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Levantamento Terra (kg)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 150"
          value={deadlift}
          onChangeText={setDeadlift}
          keyboardType="decimal-pad"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Pull-ups (repetições)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 15"
          value={pullUps}
          onChangeText={setPullUps}
          keyboardType="number-pad"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Push-ups (repetições)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 40"
          value={pushUps}
          onChangeText={setPushUps}
          keyboardType="number-pad"
        />
      </View>
    </>
  );

  const renderAerobicFields = () => (
    <>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>VO2 Max (ml/kg/min)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 55.5"
          value={vo2Max}
          onChangeText={setVo2Max}
          keyboardType="decimal-pad"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Yo-Yo Test (nível)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 18.5"
          value={yoyoTest}
          onChangeText={setYoyoTest}
          keyboardType="decimal-pad"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Teste de Cooper (metros)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 3200"
          value={cooper}
          onChangeText={setCooper}
          keyboardType="number-pad"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>FC Repouso (bpm)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 52"
          value={restingHR}
          onChangeText={setRestingHR}
          keyboardType="number-pad"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>FC Máxima (bpm)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 195"
          value={maxHR}
          onChangeText={setMaxHR}
          keyboardType="number-pad"
        />
      </View>
    </>
  );

  const renderBodyCompositionFields = () => (
    <>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Gordura Corporal (%)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 12.5"
          value={bodyFat}
          onChangeText={setBodyFat}
          keyboardType="decimal-pad"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Massa Muscular (kg)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 62.5"
          value={muscleMass}
          onChangeText={setMuscleMass}
          keyboardType="decimal-pad"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>IMC</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 22.5"
          value={bmi}
          onChangeText={setBmi}
          keyboardType="decimal-pad"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Cintura (cm)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 78"
          value={waist}
          onChangeText={setWaist}
          keyboardType="decimal-pad"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Peito (cm)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 95"
          value={chest}
          onChangeText={setChest}
          keyboardType="decimal-pad"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Braço (cm)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 32"
          value={arm}
          onChangeText={setArm}
          keyboardType="decimal-pad"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Coxa (cm)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 56"
          value={thigh}
          onChangeText={setThigh}
          keyboardType="decimal-pad"
        />
      </View>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nova Avaliação Física</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data</Text>
          <View style={styles.inputGroup}>
            <TextInput
              style={styles.input}
              placeholder="AAAA-MM-DD"
              value={date}
              onChangeText={setDate}
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </View>

        {renderTypeSelection()}

        {assessmentType && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Métricas</Text>
            {assessmentType === 'strength' && renderStrengthFields()}
            {assessmentType === 'aerobic' && renderAerobicFields()}
            {assessmentType === 'body_composition' && renderBodyCompositionFields()}
          </View>
        )}

        {assessmentType && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Observações</Text>
              <View style={styles.inputGroup}>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Notas sobre a avaliação..."
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={4}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, createMutation.isPending && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Registrar Avaliação</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2563eb',
    paddingTop: 48,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    flex: 1,
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  typeButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#8b5cf6',
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  typeButtonActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  typeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8b5cf6',
  },
  typeButtonTextActive: {
    color: '#ffffff',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#93c5fd',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
