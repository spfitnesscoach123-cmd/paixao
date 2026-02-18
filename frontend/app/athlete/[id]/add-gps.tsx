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

// CORREÇÃO 1: Padronização dos campos GPS conforme CSV Catapult
// Campos padronizados:
// - totalDistance (Dist. Total)
// - hidZone3 (HID Z3: 14.4-19.8 km/h)
// - hsrZone4 (HSR Z4: 19.8-25.2 km/h)
// - sprintZone5 (Sprint Z5: >25 km/h)
// - sprintCount (Sprints)
// - accDecCount (ACC+DEC)

export default function AddGPS() {
  const { t, locale } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  // Campos padronizados para compatibilidade com CSV e Periodização
  const [totalDistance, setTotalDistance] = useState('');        // total_distance
  const [hidZone3, setHidZone3] = useState('');                  // high_intensity_distance (HID Z3)
  const [hsrZone4, setHsrZone4] = useState('');                  // high_speed_running (HSR Z4)
  const [sprintZone5, setSprintZone5] = useState('');            // sprint_distance (Sprint Z5)
  const [sprintCount, setSprintCount] = useState('');            // number_of_sprints
  const [accCount, setAccCount] = useState('');                  // number_of_accelerations
  const [decCount, setDecCount] = useState('');                  // number_of_decelerations
  const [maxSpeed, setMaxSpeed] = useState('');
  const [notes, setNotes] = useState('');

  const createMutation = useMutation({
    mutationFn: async (data: Omit<GPSData, 'id' | 'coach_id' | 'created_at'>) => {
      const response = await api.post('/gps-data', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gps', id] });
      queryClient.invalidateQueries({ queryKey: ['athlete-analysis', id] });
      queryClient.invalidateQueries({ queryKey: ['acwr', id] });
      Alert.alert(
        locale === 'pt' ? 'Sucesso' : 'Success', 
        locale === 'pt' ? 'Dados GPS registrados com sucesso!' : 'GPS data saved successfully!'
      );
      router.back();
    },
    onError: (error: any) => {
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error', 
        error.response?.data?.detail || (locale === 'pt' ? 'Erro ao registrar dados GPS' : 'Failed to save GPS data')
      );
    },
  });

  const handleSubmit = () => {
    // Validação: campos obrigatórios
    if (!totalDistance || !hidZone3 || !sprintZone5) {
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error', 
        locale === 'pt' ? 'Por favor, preencha os campos obrigatórios' : 'Please fill in required fields'
      );
      return;
    }

    // Calcular ACC+DEC total
    const totalAccDec = (parseInt(accCount) || 0) + (parseInt(decCount) || 0);

    createMutation.mutate({
      athlete_id: id,
      date,
      total_distance: parseFloat(totalDistance),
      high_intensity_distance: parseFloat(hidZone3),      // HID Z3 (14.4-19.8 km/h)
      high_speed_running: parseFloat(hsrZone4) || 0,      // HSR Z4 (19.8-25.2 km/h)
      sprint_distance: parseFloat(sprintZone5),           // Sprint Z5 (>25 km/h)
      number_of_sprints: parseInt(sprintCount) || 0,
      number_of_accelerations: parseInt(accCount) || 0,
      number_of_decelerations: parseInt(decCount) || 0,
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
