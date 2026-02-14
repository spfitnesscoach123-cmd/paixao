import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { colors } from '../../../constants/theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useBarTracking, RepData } from '../../../services/vbt';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const GRAVITY = 9.81;

interface CameraConfig {
  cameraHeight: number;
  distanceFromBar: number;
  loadKg: number;
}

export default function VBTCameraPage() {
  const { id: athleteId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { locale } = useLanguage();
  
  // Permission state - MUST be checked before ANY camera render
  const [permission, requestPermission] = useCameraPermissions();
  
  // Phase control - camera only exists in 'recording' phase
  const [phase, setPhase] = useState<'config' | 'recording' | 'review'>('config');
  
  // Camera mount control - separate from phase for safe lifecycle
  const [shouldMountCamera, setShouldMountCamera] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  
  // Config state
  const [cameraConfig, setCameraConfig] = useState<CameraConfig>({
    cameraHeight: 100,
    distanceFromBar: 150,
    loadKg: 0,
  });
  
  const [recordingTime, setRecordingTime] = useState(0);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState('Back Squat');
  
  const cameraRef = useRef<CameraView>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const {
    isTracking,
    currentVelocity,
    peakVelocity,
    meanVelocity,
    velocityDrop,
    repCount,
    phase: trackingPhase,
    feedbackColor,
    repsData,
    startTracking,
    stopTracking,
    resetTracking,
  } = useBarTracking({
    loadKg: cameraConfig.loadKg,
    cameraHeight: cameraConfig.cameraHeight,
    cameraDistance: cameraConfig.distanceFromBar,
    useSimulation: true,
  });
  
  const EXERCISES = [
    'Back Squat', 'Front Squat', 'Bench Press', 'Deadlift',
    'Power Clean', 'Hang Clean', 'Push Press', 'Hip Thrust',
    'Leg Press', 'Shoulder Press', 'Pull Up', 'Row',
  ];
  
  const labels = {
    title: locale === 'pt' ? 'VBT via Câmera' : 'VBT via Camera',
    configTitle: locale === 'pt' ? 'Configuração da Câmera' : 'Camera Setup',
    cameraHeight: locale === 'pt' ? 'Altura da Câmera (cm)' : 'Camera Height (cm)',
    distanceFromBar: locale === 'pt' ? 'Distância da Barra (cm)' : 'Distance from Bar (cm)',
    loadKg: locale === 'pt' ? 'Carga na Barra (kg)' : 'Bar Load (kg)',
    startRecording: locale === 'pt' ? 'Iniciar Gravação' : 'Start Recording',
    stopRecording: locale === 'pt' ? 'Parar Gravação' : 'Stop Recording',
    currentVelocity: locale === 'pt' ? 'Velocidade Atual' : 'Current Velocity',
    repCount: locale === 'pt' ? 'Repetições' : 'Reps',
    velocityDrop: locale === 'pt' ? 'Queda de Velocidade' : 'Velocity Drop',
    withinLimit: locale === 'pt' ? 'Dentro do Limite' : 'Within Limit',
    exceedsLimit: locale === 'pt' ? 'Excede 10%' : 'Exceeds 10%',
    reviewData: locale === 'pt' ? 'Revisar Dados' : 'Review Data',
    saveData: locale === 'pt' ? 'Salvar Dados VBT' : 'Save VBT Data',
    exercise: locale === 'pt' ? 'Exercício' : 'Exercise',
    configHint: locale === 'pt' 
      ? 'Posicione a câmera lateralmente ao atleta para melhor precisão'
      : 'Position camera to the side of the athlete for best accuracy',
    recording: locale === 'pt' ? 'Gravando...' : 'Recording...',
    noPermission: locale === 'pt' 
      ? 'Permissão de câmera necessária'
      : 'Camera permission required',
    grantPermission: locale === 'pt' ? 'Conceder Permissão' : 'Grant Permission',
    selectExercise: locale === 'pt' ? 'Selecionar Exercício' : 'Select Exercise',
    summary: locale === 'pt' ? 'Resumo da Sessão' : 'Session Summary',
    avgVelocity: locale === 'pt' ? 'Vel. Média' : 'Avg Velocity',
    maxVelocity: locale === 'pt' ? 'Vel. Máxima' : 'Max Velocity',
    totalReps: locale === 'pt' ? 'Total de Reps' : 'Total Reps',
    fatigueDetected: locale === 'pt' ? 'Fadiga Detectada' : 'Fatigue Detected',
    configWarning: locale === 'pt'
      ? 'Configure a altura e distância para calibração precisa'
      : 'Configure height and distance for accurate calibration',
    initializingCamera: locale === 'pt' ? 'Iniciando câmera...' : 'Initializing camera...',
    cameraOk: locale === 'pt' ? 'Câmera OK' : 'Camera OK',
    waitCamera: locale === 'pt' ? 'Aguarde a câmera inicializar' : 'Wait for camera to initialize',
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setShouldMountCamera(false);
    };
  }, []);

  // Handle camera ready callback
  const handleCameraReady = useCallback(() => {
    setCameraReady(true);
  }, []);

  // Safe transition to recording phase
  const goToRecording = useCallback(() => {
    if (!permission?.granted) {
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        locale === 'pt' ? 'Permissão de câmera necessária' : 'Camera permission required'
      );
      return;
    }
    if (!cameraConfig.loadKg) {
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        locale === 'pt' ? 'Informe a carga na barra' : 'Enter the bar load'
      );
      return;
    }
    
    setCameraReady(false);
    setShouldMountCamera(true);
    setPhase('recording');
  }, [permission, cameraConfig.loadKg, locale]);

  // Safe transition from recording
  const goToReview = useCallback(() => {
    // Stop tracking first
    if (isTracking) {
      stopTracking();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    // Unmount camera before phase change
    setShouldMountCamera(false);
    setCameraReady(false);
    
    // Small delay to allow camera cleanup
    setTimeout(() => {
      setPhase('review');
    }, 50);
  }, [isTracking, stopTracking]);

  // Start recording
  const handleStartRecording = useCallback(() => {
    if (!cameraReady) {
      Alert.alert(labels.title, labels.waitCamera);
      return;
    }
    
    setRecordingTime(0);
    startTracking();
    
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  }, [cameraReady, startTracking, labels]);

  // Stop recording
  const handleStopRecording = useCallback(() => {
    stopTracking();
    
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    if (repsData.length > 0 || repCount > 0) {
      goToReview();
    }
  }, [stopTracking, repsData.length, repCount, goToReview]);

  // VBT submission mutation
  const vbtMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/vbt/data', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vbt-analysis', athleteId] });
      queryClient.invalidateQueries({ queryKey: ['vbt-analysis'] });
      queryClient.invalidateQueries({ queryKey: ['scientific-analysis', athleteId] });
      queryClient.invalidateQueries({ queryKey: ['scientific-analysis'] });
      queryClient.invalidateQueries({ queryKey: ['strength-analysis', athleteId] });
      
      Alert.alert(
        locale === 'pt' ? 'Sucesso' : 'Success',
        locale === 'pt' ? 'Dados VBT salvos com sucesso!' : 'VBT data saved successfully!',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    },
    onError: (error: any) => {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save VBT data');
    },
  });

  const handleSaveData = () => {
    if (repsData.length === 0) {
      Alert.alert(
        locale === 'pt' ? 'Sem Dados' : 'No Data',
        locale === 'pt' ? 'Nenhum dado de repetição registrado' : 'No rep data recorded'
      );
      return;
    }
    
    const avgVelocity = repsData.reduce((sum, s) => sum + s.meanVelocity, 0) / repsData.length;
    
    const vbtData = {
      athlete_id: athleteId,
      date: new Date().toISOString().split('T')[0],
      provider: 'camera',
      exercise: selectedExercise,
      sets: repsData.map((s) => ({
        reps: 1,
        mean_velocity: s.meanVelocity,
        peak_velocity: s.peakVelocity,
        load_kg: cameraConfig.loadKg,
        power_watts: Math.round(cameraConfig.loadKg * s.meanVelocity * GRAVITY),
        velocity_drop: s.velocityDrop,
      })),
      camera_config: {
        height_cm: cameraConfig.cameraHeight,
        distance_cm: cameraConfig.distanceFromBar,
      },
    };
    
    vbtMutation.mutate(vbtData);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const sessionSummary = {
    avgVelocity: repsData.length > 0 
      ? (repsData.reduce((sum, s) => sum + s.meanVelocity, 0) / repsData.length).toFixed(2)
      : '0.00',
    maxVelocity: repsData.length > 0 
      ? Math.max(...repsData.map(s => s.peakVelocity)).toFixed(2)
      : '0.00',
    totalReps: repsData.length,
    fatigueDetected: repsData.some(s => s.velocityDrop > 10),
    avgVelocityDrop: repsData.length > 0
      ? (repsData.reduce((sum, s) => sum + s.velocityDrop, 0) / repsData.length).toFixed(1)
      : '0',
  };

  // LOADING STATE - permission not yet determined
  if (!permission) {
    return (
      <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.accent.primary} />
          <Text style={styles.loadingText}>
            {locale === 'pt' ? 'Verificando permissões...' : 'Checking permissions...'}
          </Text>
        </View>
      </LinearGradient>
    );
  }

  // PERMISSION DENIED STATE
  if (!permission.granted) {
    return (
      <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => router.back()} 
            style={styles.backButton}
            data-testid="vbt-camera-back-btn"
          >
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>{labels.title}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color={colors.text.tertiary} />
          <Text style={styles.permissionText}>{labels.noPermission}</Text>
          <TouchableOpacity 
            style={styles.permissionButton} 
            onPress={requestPermission}
            data-testid="grant-permission-btn"
          >
            <Text style={styles.permissionButtonText}>{labels.grantPermission}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  // MAIN RENDER - permission granted
  return (
    <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            if (phase === 'recording') {
              if (isTracking) stopTracking();
              if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
              setShouldMountCamera(false);
            }
            router.back();
          }} 
          style={styles.backButton}
          data-testid="vbt-camera-back-btn"
        >
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>{labels.title}</Text>
        <View style={{ width: 40 }} />
      </View>
      
      {/* CONFIG PHASE */}
      {phase === 'config' && (
        <ScrollView style={styles.configContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.configCard}>
            <View style={styles.configHeader}>
              <Ionicons name="settings" size={24} color={colors.accent.primary} />
              <Text style={styles.configTitle}>{labels.configTitle}</Text>
            </View>
            
            <Text style={styles.configHint}>{labels.configHint}</Text>
            
            {/* Camera Height */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{labels.cameraHeight}</Text>
              <TextInput
                style={styles.input}
                value={String(cameraConfig.cameraHeight)}
                onChangeText={(v) => setCameraConfig({...cameraConfig, cameraHeight: parseInt(v) || 0})}
                keyboardType="numeric"
                placeholderTextColor={colors.text.tertiary}
                data-testid="camera-height-input"
              />
            </View>
            
            {/* Distance from Bar */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{labels.distanceFromBar}</Text>
              <TextInput
                style={styles.input}
                value={String(cameraConfig.distanceFromBar)}
                onChangeText={(v) => setCameraConfig({...cameraConfig, distanceFromBar: parseInt(v) || 0})}
                keyboardType="numeric"
                placeholderTextColor={colors.text.tertiary}
                data-testid="camera-distance-input"
              />
            </View>
            
            {/* Load in kg */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{labels.loadKg} *</Text>
              <TextInput
                style={[styles.input, !cameraConfig.loadKg && styles.inputRequired]}
                value={cameraConfig.loadKg ? String(cameraConfig.loadKg) : ''}
                onChangeText={(v) => setCameraConfig({...cameraConfig, loadKg: parseFloat(v.replace(',', '.')) || 0})}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.text.tertiary}
                data-testid="load-kg-input"
              />
            </View>
            
            {/* Exercise Selector */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{labels.exercise}</Text>
              <TouchableOpacity 
                style={styles.exerciseSelector}
                onPress={() => setShowExerciseModal(true)}
                data-testid="exercise-selector"
              >
                <Ionicons name="barbell" size={20} color={colors.accent.primary} />
                <Text style={styles.exerciseSelectorText}>{selectedExercise}</Text>
                <Ionicons name="chevron-down" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.configWarning}>
              <Ionicons name="information-circle" size={16} color={colors.accent.primary} />
              <Text style={styles.configWarningText}>{labels.configWarning}</Text>
            </View>
            
            {/* Start Button */}
            <TouchableOpacity
              style={[
                styles.startButton,
                !cameraConfig.loadKg && styles.startButtonDisabled
              ]}
              onPress={goToRecording}
              disabled={!cameraConfig.loadKg}
              data-testid="start-recording-btn"
            >
              <LinearGradient 
                colors={cameraConfig.loadKg ? ['#10b981', '#059669'] : ['#4b5563', '#374151']} 
                style={styles.startButtonGradient}
              >
                <Ionicons name="videocam" size={24} color="#ffffff" />
                <Text style={styles.startButtonText}>{labels.startRecording}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
      
      {/* RECORDING PHASE */}
      {phase === 'recording' && (
        <View style={styles.recordingContainer}>
          <View style={styles.cameraContainer}>
            {shouldMountCamera ? (
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
                onCameraReady={handleCameraReady}
              >
                {cameraReady ? (
                  <View style={[
                    styles.feedbackOverlay,
                    feedbackColor === 'green' && styles.feedbackGreen,
                    feedbackColor === 'red' && styles.feedbackRed,
                  ]}>
                    {/* Recording indicator */}
                    <View style={styles.recordingIndicator}>
                      <View style={[styles.recordingDot, isTracking && styles.recordingDotActive]} />
                      <Text style={styles.recordingText}>
                        {isTracking ? labels.recording : ''} {formatTime(recordingTime)}
                      </Text>
                    </View>
                    
                    {/* Velocity Display */}
                    <View style={styles.velocityDisplay}>
                      <Text style={styles.velocityLabel}>{labels.currentVelocity}</Text>
                      <Text style={[
                        styles.velocityValue,
                        feedbackColor === 'red' && styles.velocityValueRed
                      ]}>
                        {currentVelocity.toFixed(2)} m/s
                      </Text>
                    </View>
                    
                    {/* Rep Counter */}
                    <View style={styles.repCounter}>
                      <Text style={styles.repLabel}>{labels.repCount}</Text>
                      <Text style={styles.repValue}>{repCount}</Text>
                    </View>
                    
                    {/* Status Badge */}
                    <View style={[
                      styles.statusBadge,
                      feedbackColor === 'green' && styles.statusBadgeGreen,
                      feedbackColor === 'red' && styles.statusBadgeRed,
                    ]}>
                      <Ionicons 
                        name={feedbackColor === 'green' ? 'checkmark-circle' : 'warning'} 
                        size={16} 
                        color="#ffffff" 
                      />
                      <Text style={styles.statusText}>
                        {feedbackColor === 'green' ? labels.withinLimit : labels.exceedsLimit}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.cameraLoadingOverlay}>
                    <ActivityIndicator size="large" color={colors.accent.primary} />
                    <Text style={styles.cameraLoadingText}>{labels.initializingCamera}</Text>
                  </View>
                )}
              </CameraView>
            ) : (
              <View style={styles.cameraPlaceholder}>
                <ActivityIndicator size="large" color={colors.accent.primary} />
              </View>
            )}
          </View>
          
          {/* Controls */}
          <View style={styles.recordingControls}>
            <TouchableOpacity
              style={[styles.recordButton, isTracking && styles.stopButton]}
              onPress={isTracking ? handleStopRecording : handleStartRecording}
              disabled={!cameraReady}
              data-testid="record-toggle-btn"
            >
              <Ionicons 
                name={isTracking ? 'stop' : 'play'} 
                size={32} 
                color="#ffffff" 
              />
            </TouchableOpacity>
            
            {!isTracking && repsData.length > 0 && (
              <TouchableOpacity
                style={styles.reviewButton}
                onPress={goToReview}
                data-testid="go-to-review-btn"
              >
                <Text style={styles.reviewButtonText}>{labels.reviewData}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      
      {/* REVIEW PHASE */}
      {phase === 'review' && (
        <ScrollView style={styles.reviewContainer} showsVerticalScrollIndicator={false}>
          {/* Summary Card */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>{labels.summary}</Text>
            
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{sessionSummary.avgVelocity}</Text>
                <Text style={styles.summaryLabel}>{labels.avgVelocity} (m/s)</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{sessionSummary.maxVelocity}</Text>
                <Text style={styles.summaryLabel}>{labels.maxVelocity} (m/s)</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{sessionSummary.totalReps}</Text>
                <Text style={styles.summaryLabel}>{labels.totalReps}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[
                  styles.summaryValue,
                  sessionSummary.fatigueDetected && styles.summaryValueWarning
                ]}>
                  {sessionSummary.avgVelocityDrop}%
                </Text>
                <Text style={styles.summaryLabel}>{labels.velocityDrop}</Text>
              </View>
            </View>
            
            {sessionSummary.fatigueDetected && (
              <View style={styles.fatigueAlert}>
                <Ionicons name="warning" size={20} color="#ef4444" />
                <Text style={styles.fatigueAlertText}>{labels.fatigueDetected}</Text>
              </View>
            )}
          </View>
          
          {/* Exercise Info */}
          <View style={styles.exerciseInfoCard}>
            <Text style={styles.exerciseInfoLabel}>{labels.exercise}</Text>
            <TouchableOpacity 
              style={styles.exerciseInfoSelector}
              onPress={() => setShowExerciseModal(true)}
            >
              <Ionicons name="barbell" size={20} color={colors.accent.primary} />
              <Text style={styles.exerciseInfoText}>{selectedExercise}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.text.secondary} />
            </TouchableOpacity>
            <Text style={styles.exerciseLoadText}>
              {labels.loadKg}: {cameraConfig.loadKg} kg
            </Text>
          </View>
          
          {/* Rep Details */}
          <View style={styles.repDetailsCard}>
            <Text style={styles.repDetailsTitle}>
              {locale === 'pt' ? 'Detalhes por Repetição' : 'Rep Details'}
            </Text>
            
            {repsData.map((set, index) => (
              <View key={index} style={styles.repDetailRow}>
                <Text style={styles.repDetailNumber}>#{set.rep}</Text>
                <View style={styles.repDetailData}>
                  <Text style={styles.repDetailVelocity}>{set.meanVelocity} m/s</Text>
                  <Text style={[
                    styles.repDetailDrop,
                    set.velocityDrop > 10 && styles.repDetailDropWarning
                  ]}>
                    {set.velocityDrop > 0 ? `-${set.velocityDrop}%` : '0%'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          
          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.recordAgainButton}
              onPress={() => {
                resetTracking();
                setRecordingTime(0);
                setCameraReady(false);
                setShouldMountCamera(true);
                setPhase('recording');
              }}
              data-testid="record-again-btn"
            >
              <Ionicons name="refresh" size={20} color={colors.accent.primary} />
              <Text style={styles.recordAgainText}>
                {locale === 'pt' ? 'Gravar Novamente' : 'Record Again'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.saveButton, vbtMutation.isPending && styles.saveButtonDisabled]}
              onPress={handleSaveData}
              disabled={vbtMutation.isPending}
              data-testid="save-vbt-data-btn"
            >
              <LinearGradient colors={['#7c3aed', '#4f46e5']} style={styles.saveButtonGradient}>
                {vbtMutation.isPending ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="save" size={20} color="#ffffff" />
                    <Text style={styles.saveButtonText}>{labels.saveData}</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
          
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
      
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
              <Text style={styles.modalTitle}>{labels.selectExercise}</Text>
              <TouchableOpacity onPress={() => setShowExerciseModal(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
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
            </ScrollView>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.text.secondary,
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionText: {
    fontSize: 16,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  configContainer: {
    flex: 1,
    padding: 16,
  },
  configCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  configHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  configTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  configHint: {
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.dark.secondary,
    borderRadius: 12,
    padding: 14,
    color: colors.text.primary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  inputRequired: {
    borderColor: colors.status.warning,
  },
  exerciseSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.secondary,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  exerciseSelectorText: {
    flex: 1,
    fontSize: 16,
    color: colors.text.primary,
  },
  configWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  configWarningText: {
    flex: 1,
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  startButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  startButtonDisabled: {
    opacity: 0.7,
  },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
  },
  startButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  recordingContainer: {
    flex: 1,
  },
  cameraContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  cameraPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  cameraLoadingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  cameraLoadingText: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 12,
  },
  feedbackOverlay: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  feedbackGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  feedbackRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6b7280',
  },
  recordingDotActive: {
    backgroundColor: '#ef4444',
  },
  recordingText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  velocityDisplay: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  velocityLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginBottom: 4,
  },
  velocityValue: {
    color: '#10b981',
    fontSize: 48,
    fontWeight: 'bold',
  },
  velocityValueRed: {
    color: '#ef4444',
  },
  repCounter: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  repLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
  },
  repValue: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  statusBadge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  statusBadgeGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.8)',
  },
  statusBadgeRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.8)',
  },
  statusText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  recordingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 20,
    backgroundColor: colors.dark.secondary,
  },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#ef4444',
  },
  reviewButton: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  reviewButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  reviewContainer: {
    flex: 1,
    padding: 16,
  },
  summaryCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.dark.secondary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  summaryValueWarning: {
    color: '#f59e0b',
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 4,
  },
  fatigueAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  fatigueAlertText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 13,
  },
  exerciseInfoCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  exerciseInfoLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 8,
  },
  exerciseInfoSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  exerciseInfoText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  exerciseLoadText: {
    fontSize: 14,
    color: colors.accent.primary,
    fontWeight: '600',
  },
  repDetailsCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  repDetailsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  repDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  repDetailNumber: {
    fontSize: 14,
    color: colors.text.secondary,
    width: 40,
  },
  repDetailData: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  repDetailVelocity: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  repDetailDrop: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: '500',
  },
  repDetailDropWarning: {
    color: '#ef4444',
  },
  actionButtons: {
    gap: 12,
  },
  recordAgainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent.primary,
  },
  recordAgainText: {
    color: colors.accent.primary,
    fontWeight: '600',
  },
  saveButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
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
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: colors.dark.card,
  },
  modalOptionActive: {
    borderColor: colors.accent.primary,
    borderWidth: 1,
  },
  modalOptionText: {
    fontSize: 15,
    color: colors.text.primary,
  },
});
