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
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { Athlete } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

export default function AddAthlete() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [position, setPosition] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (athleteData: Omit<Athlete, 'id' | 'coach_id' | 'created_at' | 'updated_at'>) => {
      const response = await api.post('/athletes', athleteData);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['athletes'] });
      Alert.alert(t('common.success'), t('athletes.athleteCreated'));
      router.back();
    },
    onError: (error: any) => {
      Alert.alert(t('common.error'), error.response?.data?.detail || t('athletes.errorCreating'));
    },
  });

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert(t('common.error'), t('athletes.galleryPermission'));
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
      Alert.alert(t('common.error'), t('auth.fillAllFields'));
      return;
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(birthDate)) {
      Alert.alert(t('common.error'), t('athletes.invalidDateFormat'));
      return;
    }

    createMutation.mutate({
      name,
      birth_date: birthDate,
      position,
      height: height ? parseFloat(height) : undefined,
      weight: weight ? parseFloat(weight) : undefined,
      photo_base64: photoBase64 || undefined,
    });
  };

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
          <Text style={styles.headerTitle}>{t('athletes.addAthlete')}</Text>
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
                  <Text style={styles.photoText}>{t('athletes.addPhoto')}</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  {t('athletes.name')} <Text style={styles.required}>*</Text>
                </Text>
                <View style={[styles.inputContainer, styles.glowEffect]}>
                  <Ionicons name="person-outline" size={20} color={colors.accent.primary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder={t('athletes.namePlaceholder')}
                    placeholderTextColor={colors.text.tertiary}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  {t('athletes.birthDate')} <Text style={styles.required}>*</Text>
                </Text>
                <View style={[styles.inputContainer, styles.glowEffect]}>
                  <Ionicons name="calendar-outline" size={20} color={colors.accent.primary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder={t('athletes.birthDatePlaceholder')}
                    placeholderTextColor={colors.text.tertiary}
                    value={birthDate}
                    onChangeText={setBirthDate}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  {t('athletes.position')} <Text style={styles.required}>*</Text>
                </Text>
                <View style={[styles.inputContainer, styles.glowEffect]}>
                  <Ionicons name="football-outline" size={20} color={colors.accent.primary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder={t('athletes.positionPlaceholder')}
                    placeholderTextColor={colors.text.tertiary}
                    value={position}
                    onChangeText={setPosition}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.label}>{t('athletes.height')}</Text>
                  <View style={[styles.inputContainer, styles.glowEffect]}>
                    <TextInput
                      style={styles.input}
                      placeholder={t('athletes.heightPlaceholder')}
                      placeholderTextColor={colors.text.tertiary}
                      value={height}
                      onChangeText={setHeight}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.label}>{t('athletes.weight')}</Text>
                  <View style={[styles.inputContainer, styles.glowEffect]}>
                    <TextInput
                      style={styles.input}
                      placeholder={t('athletes.weightPlaceholder')}
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
                disabled={createMutation.isPending}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={colors.gradients.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.buttonGradient}
                >
                  {createMutation.isPending ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="add-circle" size={24} color="#ffffff" />
                      <Text style={styles.buttonText}>{t('athletes.registerAthlete')}</Text>
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
    borderColor: 'rgba(0, 212, 255, 0.3)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoText: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 8,
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
    borderColor: 'rgba(0, 212, 255, 0.2)',
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
    shadowColor: colors.accent.tertiary,
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
