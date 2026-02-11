import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../services/api';
import { Slider } from '../../../components/Slider';
import { WellnessQuestionnaire } from '../../../types';
import { useLanguage } from '../../../contexts/LanguageContext';

export default function AddWellness() {
  const { t } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [fatigue, setFatigue] = useState(5);
  const [stress, setStress] = useState(5);
  const [mood, setMood] = useState(7);
  const [sleepQuality, setSleepQuality] = useState(7);
  const [sleepHours, setSleepHours] = useState('7');
  const [muscleSoreness, setMuscleSoreness] = useState(5);
  const [hydration, setHydration] = useState(7);
  const [notes, setNotes] = useState('');

  const createMutation = useMutation({
    mutationFn: async (data: Omit<WellnessQuestionnaire, 'id' | 'coach_id' | 'created_at' | 'wellness_score' | 'readiness_score'>) => {
      const response = await api.post('/wellness', data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['wellness', id] });
      Alert.alert(
        'Sucesso',
        `Questionário registrado!\n\nWellness Score: ${data.wellness_score?.toFixed(1)}\nReadiness Score: ${data.readiness_score?.toFixed(1)}`
      );
      router.back();
    },
    onError: (error: any) => {
      Alert.alert('Erro', error.response?.data?.detail || 'Erro ao registrar questionário');
    },
  });

  const handleSubmit = () => {
    if (!sleepHours) {
      Alert.alert('Erro', 'Por favor, preencha as horas de sono');
      return;
    }

    createMutation.mutate({
      athlete_id: id,
      date,
      fatigue,
      stress,
      mood,
      sleep_quality: sleepQuality,
      sleep_hours: parseFloat(sleepHours),
      muscle_soreness: muscleSoreness,
      hydration,
      notes: notes || undefined,
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Questionário Wellness</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Data</Text>
            <TextInput
              style={styles.input}
              placeholder="AAAA-MM-DD"
              value={date}
              onChangeText={setDate}
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Estado Físico e Mental</Text>
          
          <Slider
            label="Fadiga"
            value={fatigue}
            onValueChange={setFatigue}
            minimumValue={1}
            maximumValue={10}
          />

          <Slider
            label="Estresse"
            value={stress}
            onValueChange={setStress}
            minimumValue={1}
            maximumValue={10}
          />

          <Slider
            label="Humor"
            value={mood}
            onValueChange={setMood}
            minimumValue={1}
            maximumValue={10}
          />

          <Slider
            label="Dor Muscular"
            value={muscleSoreness}
            onValueChange={setMuscleSoreness}
            minimumValue={1}
            maximumValue={10}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sono e Hidratação</Text>
          
          <Slider
            label="Qualidade do Sono"
            value={sleepQuality}
            onValueChange={setSleepQuality}
            minimumValue={1}
            maximumValue={10}
          />

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Horas de Sono</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 7.5"
              value={sleepHours}
              onChangeText={setSleepHours}
              keyboardType="decimal-pad"
            />
          </View>

          <Slider
            label="Hidratação"
            value={hydration}
            onValueChange={setHydration}
            minimumValue={1}
            maximumValue={10}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Observações</Text>
          <View style={styles.inputGroup}>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Notas adicionais..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
            />
          </View>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={24} color="#2563eb" />
          <Text style={styles.infoText}>
            Os scores de Wellness e Prontidão serão calculados automaticamente com base nas respostas.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, createMutation.isPending && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Registrar Questionário</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
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
    marginBottom: 16,
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
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 18,
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
