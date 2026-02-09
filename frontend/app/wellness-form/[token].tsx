import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Picker } from '@react-native-picker/picker';
import Slider from '@react-native-community/slider';
import api from '../../services/api';
import { colors } from '../../constants/theme';

// App Store URLs - Replace with your actual app URLs when published
const APP_STORE_URL = 'https://apps.apple.com/app/load-manager/id0000000000';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.loadmanager.app';

interface Athlete {
  id: string;
  name: string;
}

interface Feedback {
  athlete_name: string;
  date: string;
  readiness_score: number;
  status: string;
  recommendations: string[];
}

// Fallback page component for web browsers
const WebFallbackPage = ({ token }: { token: string }) => {
  const handleOpenStore = (store: 'ios' | 'android') => {
    const url = store === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  return (
    <View style={fallbackStyles.container}>
      <LinearGradient
        colors={[colors.dark.primary, colors.dark.secondary]}
        style={fallbackStyles.gradient}
      >
        <View style={fallbackStyles.content}>
          {/* Logo/Icon */}
          <View style={fallbackStyles.iconContainer}>
            <Ionicons name="fitness" size={80} color={colors.accent.primary} />
          </View>
          
          {/* Title */}
          <Text style={fallbackStyles.title}>Load Manager</Text>
          <Text style={fallbackStyles.subtitle}>Formulário de Wellness</Text>
          
          {/* Message */}
          <View style={fallbackStyles.messageBox}>
            <Ionicons name="phone-portrait-outline" size={32} color={colors.accent.primary} />
            <Text style={fallbackStyles.messageTitle}>
              Baixe o app para continuar
            </Text>
            <Text style={fallbackStyles.messageText}>
              Para preencher o formulário de wellness, você precisa ter o app Load Manager instalado no seu celular.
            </Text>
          </View>
          
          {/* Download Buttons */}
          <View style={fallbackStyles.buttonsContainer}>
            <TouchableOpacity
              style={fallbackStyles.storeButton}
              onPress={() => handleOpenStore('ios')}
            >
              <Ionicons name="logo-apple" size={28} color="#fff" />
              <View style={fallbackStyles.storeButtonText}>
                <Text style={fallbackStyles.storeButtonLabel}>Baixar na</Text>
                <Text style={fallbackStyles.storeButtonName}>App Store</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[fallbackStyles.storeButton, fallbackStyles.playStoreButton]}
              onPress={() => handleOpenStore('android')}
            >
              <Ionicons name="logo-google-playstore" size={28} color="#fff" />
              <View style={fallbackStyles.storeButtonText}>
                <Text style={fallbackStyles.storeButtonLabel}>Baixar no</Text>
                <Text style={fallbackStyles.storeButtonName}>Google Play</Text>
              </View>
            </TouchableOpacity>
          </View>
          
          {/* Instructions */}
          <View style={fallbackStyles.instructions}>
            <Text style={fallbackStyles.instructionsTitle}>Como funciona:</Text>
            <View style={fallbackStyles.step}>
              <View style={fallbackStyles.stepNumber}>
                <Text style={fallbackStyles.stepNumberText}>1</Text>
              </View>
              <Text style={fallbackStyles.stepText}>Baixe o app Load Manager</Text>
            </View>
            <View style={fallbackStyles.step}>
              <View style={fallbackStyles.stepNumber}>
                <Text style={fallbackStyles.stepNumberText}>2</Text>
              </View>
              <Text style={fallbackStyles.stepText}>Abra o app no seu celular</Text>
            </View>
            <View style={fallbackStyles.step}>
              <View style={fallbackStyles.stepNumber}>
                <Text style={fallbackStyles.stepNumberText}>3</Text>
              </View>
              <Text style={fallbackStyles.stepText}>Clique novamente no link do coach</Text>
            </View>
          </View>
          
          {/* Token info (for debugging) */}
          <Text style={fallbackStyles.tokenInfo}>
            Link válido: {token ? '✓' : '✗'}
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
};

const fallbackStyles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: '100vh' as any,
  },
  gradient: {
    flex: 1,
    minHeight: '100vh' as any,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    maxWidth: 500,
    marginHorizontal: 'auto' as any,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 18,
    color: colors.text.secondary,
    marginBottom: 32,
  },
  messageBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  messageTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginTop: 12,
    marginBottom: 8,
  },
  messageText: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonsContainer: {
    width: '100%',
    gap: 12,
    marginBottom: 32,
  },
  storeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  playStoreButton: {
    backgroundColor: '#1a472a',
  },
  storeButtonText: {
    marginLeft: 12,
  },
  storeButtonLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  storeButtonName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  instructions: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 20,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 16,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  stepText: {
    fontSize: 14,
    color: colors.text.primary,
  },
  tokenInfo: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: 24,
  },
});

export default function WellnessForm() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Client-side only state - prevents SSR issues
  const [isClient, setIsClient] = useState(false);
  const [isWebPlatform, setIsWebPlatform] = useState(false);

  // Form state
  const [selectedAthlete, setSelectedAthlete] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [sleepHours, setSleepHours] = useState(7);
  const [sleepQuality, setSleepQuality] = useState(5);
  const [fatigue, setFatigue] = useState(5);
  const [muscleSoreness, setMuscleSoreness] = useState(5);
  const [stress, setStress] = useState(5);
  const [mood, setMood] = useState(5);

  // First effect: detect client-side and platform (runs once after mount)
  useEffect(() => {
    setIsClient(true);
    const isWeb = Platform.OS === 'web';
    setIsWebPlatform(isWeb);
    
    // If we're on web, stop loading immediately
    if (isWeb) {
      setIsLoading(false);
    }
  }, []);

  // Second effect: load athletes only on native platforms after client detection
  useEffect(() => {
    // Wait until we've determined we're on client-side
    if (!isClient) return;
    
    // If we're on web, don't fetch athletes
    if (isWebPlatform) return;
    
    // Native app - load athletes
    loadAthletes();
  }, [isClient, isWebPlatform, token]);

  const loadAthletes = async () => {
    try {
      const response = await api.get(`/wellness/public/${token}/athletes`);
      setAthletes(response.data);
      if (response.data.length > 0) {
        setSelectedAthlete(response.data[0].id);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Link inválido ou expirado');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedAthlete) {
      Alert.alert('Erro', 'Por favor, selecione seu nome');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post(`/wellness/public/${token}/submit`, {
        athlete_id: selectedAthlete,
        date,
        sleep_hours: sleepHours,
        sleep_quality: sleepQuality,
        fatigue,
        muscle_soreness: muscleSoreness,
        stress,
        mood,
      });

      setFeedback(response.data.feedback);
      setIsSubmitted(true);
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.detail || 'Erro ao enviar questionário');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'optimal': return colors.status.success;
      case 'moderate': return colors.status.warning;
      case 'low': return colors.status.error;
      default: return colors.text.secondary;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'optimal': return 'Ótimo';
      case 'moderate': return 'Moderado';
      case 'low': return 'Baixo';
      default: return status;
    }
  };

  const renderSlider = (
    label: string,
    value: number,
    setValue: (val: number) => void,
    lowLabel: string,
    highLabel: string
  ) => (
    <View style={styles.sliderContainer}>
      <Text style={styles.sliderLabel}>{label}: {value}/10</Text>
      <Slider
        style={styles.slider}
        minimumValue={1}
        maximumValue={10}
        step={1}
        value={value}
        onValueChange={setValue}
        minimumTrackTintColor={colors.accent.primary}
        maximumTrackTintColor={colors.dark.tertiary}
        thumbTintColor={colors.accent.primary}
      />
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderEndLabel}>{lowLabel}</Text>
        <Text style={styles.sliderEndLabel}>{highLabel}</Text>
      </View>
    </View>
  );

  // Show loading while determining platform (client-side detection)
  if (!isClient || isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  // Show fallback page for web browsers (only after client-side detection)
  if (isWebPlatform) {
    return <WebFallbackPage token={token || ''} />;
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle" size={64} color={colors.status.error} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (isSubmitted && feedback) {
    return (
      <LinearGradient
        colors={[colors.dark.secondary, colors.dark.primary]}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.feedbackContainer}>
          <View style={styles.feedbackCard}>
            <Ionicons name="checkmark-circle" size={64} color={colors.status.success} />
            <Text style={styles.feedbackTitle}>Questionário Enviado!</Text>
            <Text style={styles.feedbackSubtitle}>{feedback.athlete_name}</Text>
            
            <View style={styles.scoreContainer}>
              <Text style={styles.scoreLabel}>Prontidão</Text>
              <Text style={[styles.scoreValue, { color: getStatusColor(feedback.status) }]}>
                {feedback.readiness_score}/10
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(feedback.status) + '30' }]}>
                <Text style={[styles.statusText, { color: getStatusColor(feedback.status) }]}>
                  {getStatusText(feedback.status)}
                </Text>
              </View>
            </View>

            <View style={styles.recommendationsContainer}>
              <Text style={styles.recommendationsTitle}>Recomendações:</Text>
              {feedback.recommendations.map((rec, index) => (
                <View key={index} style={styles.recommendationItem}>
                  <Ionicons name="chevron-forward" size={16} color={colors.accent.primary} />
                  <Text style={styles.recommendationText}>{rec}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[colors.dark.secondary, colors.dark.primary]}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Ionicons name="fitness" size={48} color={colors.accent.primary} />
          <Text style={styles.title}>Questionário de Bem-Estar</Text>
          <Text style={styles.subtitle}>Preencha diariamente para monitorar sua recuperação</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Selecione seu nome:</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedAthlete}
                onValueChange={setSelectedAthlete}
                style={styles.picker}
                dropdownIconColor={colors.accent.primary}
              >
                {athletes.map(athlete => (
                  <Picker.Item 
                    key={athlete.id} 
                    label={athlete.name} 
                    value={athlete.id}
                    color={colors.text.primary}
                  />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Data: {date}</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Horas de sono: {sleepHours}h</Text>
            <Slider
              style={styles.slider}
              minimumValue={3}
              maximumValue={12}
              step={0.5}
              value={sleepHours}
              onValueChange={setSleepHours}
              minimumTrackTintColor={colors.accent.primary}
              maximumTrackTintColor={colors.dark.tertiary}
              thumbTintColor={colors.accent.primary}
            />
          </View>

          {renderSlider('Qualidade do sono', sleepQuality, setSleepQuality, 'Ruim', 'Excelente')}
          {renderSlider('Fadiga', fatigue, setFatigue, 'Nenhuma', 'Extrema')}
          {renderSlider('Dor muscular', muscleSoreness, setMuscleSoreness, 'Nenhuma', 'Muita')}
          {renderSlider('Estresse', stress, setStress, 'Relaxado', 'Muito estressado')}
          {renderSlider('Humor', mood, setMood, 'Ruim', 'Excelente')}

          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={colors.gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitGradient}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="send" size={24} color="#ffffff" />
                  <Text style={styles.submitText}>Enviar Questionário</Text>
                </>
              )}
            </LinearGradient>
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.dark.primary,
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.text.secondary,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    color: colors.status.error,
    textAlign: 'center',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 48,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: 8,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 8,
  },
  pickerContainer: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: 'hidden',
  },
  picker: {
    color: colors.text.primary,
    backgroundColor: 'transparent',
  },
  sliderContainer: {
    marginBottom: 16,
  },
  sliderLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 8,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderEndLabel: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  submitButton: {
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  submitText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  feedbackContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  feedbackCard: {
    backgroundColor: colors.dark.cardSolid,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  feedbackTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: 16,
  },
  feedbackSubtitle: {
    fontSize: 16,
    color: colors.text.secondary,
    marginTop: 4,
  },
  scoreContainer: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 24,
  },
  scoreLabel: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: 'bold',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '700',
  },
  recommendationsContainer: {
    width: '100%',
  },
  recommendationsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 12,
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  recommendationText: {
    flex: 1,
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
});
