import React, { useState, useEffect } from 'react';
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
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../../services/api';
import { Athlete } from '../../../types';
import { useTheme } from '../../../contexts/ThemeContext';

export default function EditAthlete() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [position, setPosition] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  const { data: athlete, isLoading } = useQuery({
    queryKey: ['athlete', id],
    queryFn: async () => {
      const response = await api.get<Athlete>(`/athletes/${id}`);
      return response.data;
    },
  });

  // Load athlete data into form
  useEffect(() => {
    if (athlete) {
      setName(athlete.name || '');
      setBirthDate(athlete.birth_date || '');
      setPosition(athlete.position || '');
      setHeight(athlete.height?.toString() || '');
      setWeight(athlete.weight?.toString() || '');
      setPhotoBase64(athlete.photo_base64 || null);
    }
  }, [athlete]);

  const updateMutation = useMutation({
    mutationFn: async (athleteData: Partial<Athlete>) => {
      const response = await api.put(`/athletes/${id}`, athleteData);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['athlete', id] });
      queryClient.invalidateQueries({ queryKey: ['athletes'] });
      Alert.alert('Sucesso', 'Perfil atualizado com sucesso!');
      router.back();
    },
    onError: (error: any) => {
      Alert.alert('Erro', error.response?.data?.detail || 'Erro ao atualizar perfil');
    },
  });

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert('Permissão negada', 'É necessário permitir acesso à galeria');
      return;
    }

    const result = await ImagePicker.launchImagePickerAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setPhotoBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleSubmit = () => {
    if (!name || !birthDate || !position) {
      Alert.alert('Erro', 'Por favor, preencha os campos obrigatórios');
      return;
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(birthDate)) {
      Alert.alert('Erro', 'Data de nascimento inválida. Use o formato AAAA-MM-DD');
      return;
    }

    updateMutation.mutate({
      name,
      birth_date: birthDate,
      position,
      height: height ? parseFloat(height) : undefined,
      weight: weight ? parseFloat(weight) : undefined,
      photo_base64: photoBase64 || undefined,
    });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.dark.secondary, colors.dark.primary]}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.accent.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Editar Perfil</Text>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity style={styles.photoContainer} onPress={pickImage}>
              {photoBase64 ? (
                <Image source={{ uri: photoBase64 }} style={styles.photo} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera" size={32} color={colors.accent.primary} />
                  <Text style={styles.photoText}>Adicionar Foto</Text>
                </View>
              )}
              <View style={styles.editPhotoIcon}>
                <Ionicons name="pencil" size={14} color="#ffffff" />
              </View>
            </TouchableOpacity>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Nome completo <Text style={styles.required}>*</Text>
                </Text>
                <View style={[styles.inputContainer, styles.glowEffect]}>
                  <Ionicons name="person-outline" size={20} color={colors.accent.primary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: João Silva"
                    placeholderTextColor={colors.text.tertiary}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Data de nascimento <Text style={styles.required}>*</Text>
                </Text>
                <View style={[styles.inputContainer, styles.glowEffect]}>
                  <Ionicons name="calendar-outline" size={20} color={colors.accent.primary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="AAAA-MM-DD (Ex: 2000-01-15)"
                    placeholderTextColor={colors.text.tertiary}
                    value={birthDate}
                    onChangeText={setBirthDate}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Posição <Text style={styles.required}>*</Text>
                </Text>
                <View style={[styles.inputContainer, styles.glowEffect]}>
                  <Ionicons name="football-outline" size={20} color={colors.accent.primary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: Atacante, Meio-campo, Zagueiro"
                    placeholderTextColor={colors.text.tertiary}
                    value={position}
                    onChangeText={setPosition}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.label}>Altura (cm)</Text>
                  <View style={[styles.inputContainer, styles.glowEffect]}>
                    <TextInput
                      style={styles.input}
                      placeholder="Ex: 175"
                      placeholderTextColor={colors.text.tertiary}
                      value={height}
                      onChangeText={setHeight}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.label}>Peso (kg)</Text>
                  <View style={[styles.inputContainer, styles.glowEffect]}>
                    <TextInput
                      style={styles.input}
                      placeholder="Ex: 70"
                      placeholderTextColor={colors.text.tertiary}
                      value={weight}
                      onChangeText={setWeight}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={styles.button}
                onPress={handleSubmit}
                disabled={updateMutation.isPending}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={colors.gradients.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.buttonGradient}
                >
                  {updateMutation.isPending ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={24} color="#ffffff" />
                      <Text style={styles.buttonText}>Salvar Alterações</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.dark.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 8,
    width: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  photoContainer: {
    alignSelf: 'center',
    marginBottom: 32,
    position: 'relative',
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.accent.primary,
  },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.dark.card,
    borderWidth: 2,
    borderColor: colors.border.default,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoText: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 8,
  },
  editPhotoIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.dark.primary,
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 8,
  },
  required: {
    color: colors.status.error,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: 16,
  },
  glowEffect: {
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 56,
    fontSize: 16,
    color: colors.text.primary,
  },
  row: {
    flexDirection: 'row',
  },
  button: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  buttonGradient: {
    height: 56,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
