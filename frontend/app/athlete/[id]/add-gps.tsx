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
import { GPSData } from '../../../types';
import { useLanguage } from '../../../contexts/LanguageContext';

export default function AddGPS() {
  const { t } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [totalDistance, setTotalDistance] = useState('');
  const [highIntensityDistance, setHighIntensityDistance] = useState('');
  const [sprintDistance, setSprintDistance] = useState('');
  const [numberOfSprints, setNumberOfSprints] = useState('');
  const [numberOfAccelerations, setNumberOfAccelerations] = useState('');
  const [numberOfDecelerations, setNumberOfDecelerations] = useState('');
  const [maxSpeed, setMaxSpeed] = useState('');
  const [notes, setNotes] = useState('');

  const createMutation = useMutation({
    mutationFn: async (data: Omit<GPSData, 'id' | 'coach_id' | 'created_at'>) => {
      const response = await api.post('/gps-data', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gps', id] });
      Alert.alert('Sucesso', 'Dados GPS registrados com sucesso!');
      router.back();
    },
    onError: (error: any) => {
      Alert.alert('Erro', error.response?.data?.detail || 'Erro ao registrar dados GPS');
    },
  });

  const handleSubmit = () => {
    if (!totalDistance || !highIntensityDistance || !sprintDistance) {
      Alert.alert('Erro', 'Por favor, preencha os campos obrigatórios');
      return;
    }

    createMutation.mutate({
      athlete_id: id,
      date,
      total_distance: parseFloat(totalDistance),
      high_intensity_distance: parseFloat(highIntensityDistance),
      sprint_distance: parseFloat(sprintDistance),
      number_of_sprints: parseInt(numberOfSprints) || 0,
      number_of_accelerations: parseInt(numberOfAccelerations) || 0,
      number_of_decelerations: parseInt(numberOfDecelerations) || 0,
      max_speed: maxSpeed ? parseFloat(maxSpeed) : undefined,
      notes: notes || undefined,
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dados GPS - Entrada Manual</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data do Treino</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Data <Text style={styles.required}>*</Text></Text>
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
          <Text style={styles.sectionTitle}>Distâncias (metros)</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Distância Total <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 10500"
              value={totalDistance}
              onChangeText={setTotalDistance}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Alta Intensidade <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 2300"
              value={highIntensityDistance}
              onChangeText={setHighIntensityDistance}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Distância em Sprints <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 450"
              value={sprintDistance}
              onChangeText={setSprintDistance}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Eventos</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Número de Sprints</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 15"
              value={numberOfSprints}
              onChangeText={setNumberOfSprints}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Acelerações</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 35"
              value={numberOfAccelerations}
              onChangeText={setNumberOfAccelerations}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Desacelerações</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 32"
              value={numberOfDecelerations}
              onChangeText={setNumberOfDecelerations}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Velocidade Máxima (km/h)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 34.5"
              value={maxSpeed}
              onChangeText={setMaxSpeed}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Observações</Text>
          <View style={styles.inputGroup}>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Notas sobre o treino..."
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
            <Text style={styles.buttonText}>Registrar Dados GPS</Text>
          )}
        </TouchableOpacity>
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
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  required: {
    color: '#dc2626',
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
