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
  GestureResponderEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { colors } from '../../../constants/theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import { 
  useProtectedBarTracking, 
  RECOMMENDED_TRACKING_POINTS,
  EXERCISE_KEYPOINTS,
} from '../../../services/vbt';
import { 
  LANDMARK_INDEX_TO_VBT_NAME,
  ProcessedKeypoint,
  VBTPoseData,
} from '../../../services/pose';

// Conditional import for native MediaPipe
// @thinksys/react-native-mediapipe exports RNMediapipe component with onLandmark callback
let RNMediapipe: any = null;
if (Platform.OS !== 'web') {
  try {
    const mediapipe = require('@thinksys/react-native-mediapipe');
    RNMediapipe = mediapipe.RNMediapipe;
    console.log('[VBTCamera] MediaPipe loaded successfully');
  } catch (e) {
    console.warn('[VBTCamera] MediaPipe not available:', e);
  }
}

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
  
  // Permission state
  const [permission, requestPermission] = useCameraPermissions();
  
  // Phase control
  const [phase, setPhase] = useState<'config' | 'pointSelection' | 'recording' | 'review'>('config');
  
  // Camera mount control
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
  
  // Use the protected tracking hook with 3 layers
  const {
    // Protection state
    protectionState,
    isHumanDetected,
    isStable,
    stabilityProgress,
    canCalculate,
    
    // Tracking point (LAYER 3)
    trackingPoint,
    isTrackingPointSet,
    recommendedTrackingPoint,
    
    // Velocity data
    isTracking,
    currentVelocity,
    peakVelocity,
    meanVelocity,
    velocityDrop,
    
    // Rep data
    repCount,
    repPhase,
    repsData,
    
    // Feedback
    feedbackColor,
    statusMessage,
    
    // Actions
    setTrackingPoint,
    clearTrackingPoint,
    startTracking,
    stopTracking,
    resetTracking,
    processPose,
  } = useProtectedBarTracking({
    loadKg: cameraConfig.loadKg,
    cameraHeight: cameraConfig.cameraHeight,
    cameraDistance: cameraConfig.distanceFromBar,
    exercise: selectedExercise,
    useSimulation: false,
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
    waitCamera: locale === 'pt' ? 'Aguarde a câmera inicializar' : 'Wait for camera to initialize',
    
    // New labels for protection system
    selectTrackingPoint: locale === 'pt' ? 'Selecionar Ponto de Tracking' : 'Select Tracking Point',
    tapToSelect: locale === 'pt' 
      ? 'Toque no ponto que deseja rastrear (ex: quadril, punho)' 
      : 'Tap on the point you want to track (e.g., hip, wrist)',
    recommendedPoint: locale === 'pt' ? 'Ponto Recomendado' : 'Recommended Point',
    trackingPointSet: locale === 'pt' ? 'Ponto Definido' : 'Tracking Point Set',
    changePoint: locale === 'pt' ? 'Alterar Ponto' : 'Change Point',
    continueToRecording: locale === 'pt' ? 'Continuar para Gravação' : 'Continue to Recording',
    
    // Protection state labels (3 CAMADAS DE PROTEÇÃO)
    noHuman: locale === 'pt' ? 'SEM PESSOA - Bloqueado' : 'NO PERSON - Blocked',
    waitingStable: locale === 'pt' ? 'Estabilizando Detecção...' : 'Stabilizing Detection...',
    ready: locale === 'pt' ? 'PRONTO - Aguardando Movimento' : 'READY - Waiting for Movement',
    executing: locale === 'pt' ? 'EXECUTANDO - Rastreando' : 'EXECUTING - Tracking',
    blocked: locale === 'pt' ? 'BLOQUEADO - Ponto não detectado' : 'BLOCKED - Point not detected',
    lowConfidence: locale === 'pt' ? 'Confiança Baixa - Bloqueado' : 'Low Confidence - Blocked',
    
    // Keypoint names
    left_hip: locale === 'pt' ? 'Quadril Esquerdo' : 'Left Hip',
    right_hip: locale === 'pt' ? 'Quadril Direito' : 'Right Hip',
    left_knee: locale === 'pt' ? 'Joelho Esquerdo' : 'Left Knee',
    right_knee: locale === 'pt' ? 'Joelho Direito' : 'Right Knee',
    left_wrist: locale === 'pt' ? 'Punho Esquerdo' : 'Left Wrist',
    right_wrist: locale === 'pt' ? 'Punho Direito' : 'Right Wrist',
    left_shoulder: locale === 'pt' ? 'Ombro Esquerdo' : 'Left Shoulder',
    right_shoulder: locale === 'pt' ? 'Ombro Direito' : 'Right Shoulder',
    left_elbow: locale === 'pt' ? 'Cotovelo Esquerdo' : 'Left Elbow',
    right_elbow: locale === 'pt' ? 'Cotovelo Direito' : 'Right Elbow',
    left_ankle: locale === 'pt' ? 'Tornozelo Esquerdo' : 'Left Ankle',
    right_ankle: locale === 'pt' ? 'Tornozelo Direito' : 'Right Ankle',
  };

  // Get localized keypoint name
  const getKeypointLabel = (name: string): string => {
    return (labels as any)[name] || name;
  };

  // State for debug logging
  const [debugLandmarks, setDebugLandmarks] = useState<string>('');
  const frameCountRef = useRef(0);

  // Convert MediaPipe landmarks to VBT pose format
  // @thinksys/react-native-mediapipe returns landmarks as an object with body parts
  const convertMediapipeLandmarks = useCallback((landmarkData: any): VBTPoseData | null => {
    // Log raw data for debugging (every 30 frames to avoid spam)
    frameCountRef.current++;
    const shouldLog = frameCountRef.current % 30 === 0;
    
    if (shouldLog) {
      console.log('[VBTCamera] Raw landmark data:', JSON.stringify(landmarkData).substring(0, 500));
    }

    // Handle different data formats from MediaPipe
    let landmarks: any[] = [];
    
    // Format 1: Direct array of landmarks
    if (Array.isArray(landmarkData)) {
      landmarks = landmarkData;
    }
    // Format 2: Object with landmarks property
    else if (landmarkData?.landmarks && Array.isArray(landmarkData.landmarks)) {
      landmarks = landmarkData.landmarks;
    }
    // Format 3: Object with poseLandmarks property
    else if (landmarkData?.poseLandmarks && Array.isArray(landmarkData.poseLandmarks)) {
      landmarks = landmarkData.poseLandmarks;
    }
    // Format 4: @thinksys format with body part objects
    else if (landmarkData && typeof landmarkData === 'object') {
      // Convert body part format to landmark array
      const bodyPartMapping: Record<string, number[]> = {
        face: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        leftArm: [11, 13, 15, 17, 19, 21],
        rightArm: [12, 14, 16, 18, 20, 22],
        torso: [11, 12, 23, 24],
        leftLeg: [23, 25, 27, 29, 31],
        rightLeg: [24, 26, 28, 30, 32],
      };
      
      // Try to extract coordinates from body parts
      for (const [part, indices] of Object.entries(bodyPartMapping)) {
        const partData = landmarkData[part];
        if (partData && Array.isArray(partData)) {
          partData.forEach((point: any, i: number) => {
            if (point && indices[i] !== undefined) {
              landmarks[indices[i]] = {
                x: point.x ?? point[0] ?? 0,
                y: point.y ?? point[1] ?? 0,
                visibility: point.visibility ?? point.confidence ?? point[2] ?? 0.7,
              };
            }
          });
        }
      }
    }
    
    if (!landmarks || landmarks.length === 0) {
      if (shouldLog) {
        console.log('[VBTCamera] No landmarks extracted');
        setDebugLandmarks('No landmarks');
      }
      return null;
    }
    
    const keypoints: ProcessedKeypoint[] = [];
    
    // Map MediaPipe 33 landmarks to VBT 17 keypoints
    for (const [indexStr, name] of Object.entries(LANDMARK_INDEX_TO_VBT_NAME)) {
      const index = parseInt(indexStr, 10);
      const landmark = landmarks[index];
      
      if (landmark) {
        const x = landmark.x ?? landmark[0] ?? 0;
        const y = landmark.y ?? landmark[1] ?? 0;
        const score = landmark.visibility ?? landmark.confidence ?? landmark[2] ?? 0.5;
        
        keypoints.push({
          name: name as string,
          x,
          y,
          score,
        });
        
        if (shouldLog && name === 'left_hip') {
          console.log(`[VBTCamera] ${name}: x=${x.toFixed(3)}, y=${y.toFixed(3)}, score=${score.toFixed(2)}`);
        }
      }
    }
    
    if (shouldLog) {
      const validCount = keypoints.filter(kp => kp.score >= 0.5).length;
      setDebugLandmarks(`${validCount}/${keypoints.length} keypoints`);
      console.log(`[VBTCamera] Converted ${keypoints.length} keypoints, ${validCount} valid`);
    }
    
    return {
      keypoints,
      timestamp: Date.now(),
    };
  }, []);

  // Handle REAL pose detection from native MediaPipe (@thinksys/react-native-mediapipe)
  // This is called via onLandmark prop
  const handleMediapipeLandmark = useCallback((event: any) => {
    if (!isTracking) return;
    
    try {
      // @thinksys/react-native-mediapipe passes data directly or via nativeEvent
      const landmarkData = event?.nativeEvent || event;
      
      const vbtPose = convertMediapipeLandmarks(landmarkData);
      
      if (vbtPose && vbtPose.keypoints.length > 0) {
        // Pass REAL pose data to the VBT pipeline
        processPose(vbtPose);
      } else {
        // No pose detected - pass empty pose to trigger no-human state
        processPose({ keypoints: [], timestamp: Date.now() });
      }
    } catch (e) {
      console.error('[VBTCamera] Error processing MediaPipe landmark:', e);
    }
  }, [isTracking, convertMediapipeLandmarks, processPose]);

  // Legacy handler name for compatibility
  const handleMediapipePoseDetected = handleMediapipeLandmark;

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

  // Go to point selection phase
  const goToPointSelection = useCallback(() => {
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
    setPhase('pointSelection');
  }, [permission, cameraConfig.loadKg, locale]);

  // Handle tracking point selection from keypoint list
  const handleSelectKeypoint = useCallback((keypointName: string) => {
    // Set tracking point at center of screen (will be tracked by name)
    setTrackingPoint(0.5, 0.5, keypointName);
  }, [setTrackingPoint]);

  // Go to recording phase (after point selection)
  const goToRecording = useCallback(() => {
    if (!isTrackingPointSet) {
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        locale === 'pt' ? 'Selecione um ponto de tracking' : 'Select a tracking point'
      );
      return;
    }
    setPhase('recording');
  }, [isTrackingPointSet, locale]);

  // Safe transition from recording to review
  const goToReview = useCallback(() => {
    if (isTracking) {
      stopTracking();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    setShouldMountCamera(false);
    setCameraReady(false);
    
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
    
    if (!isTrackingPointSet) {
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        locale === 'pt' ? 'Ponto de tracking não definido' : 'Tracking point not set'
      );
      return;
    }
    
    setRecordingTime(0);
    startTracking();
    
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  }, [cameraReady, isTrackingPointSet, startTracking, labels, locale]);

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
        tracking_point: trackingPoint?.keypointName || 'unknown',
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

  // Get available keypoints for current exercise
  const exerciseKeypoints = EXERCISE_KEYPOINTS[selectedExercise] || [];

  // Protection state color
  const getProtectionStateColor = () => {
    switch (protectionState) {
      case 'noHuman': return '#ef4444';
      case 'ready': return '#f59e0b';
      case 'executing': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getProtectionStateLabel = () => {
    if (!isTrackingPointSet) {
      return locale === 'pt' ? 'PONTO NÃO DEFINIDO' : 'POINT NOT SET';
    }
    
    // Se não está estável, mostrar progresso
    if (!isStable && protectionState === 'noHuman') {
      return `${labels.waitingStable} (${Math.round(stabilityProgress * 100)}%)`;
    }
    
    switch (protectionState) {
      case 'noHuman': return labels.noHuman;
      case 'ready': return labels.ready;
      case 'executing': return labels.executing;
      default: return protectionState;
    }
  };

  // LOADING STATE
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

  // PERMISSION DENIED
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

  // MAIN RENDER
  return (
    <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            if (phase === 'recording' || phase === 'pointSelection') {
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
            
            {/* Protection Info */}
            <View style={styles.protectionInfoCard}>
              <View style={styles.protectionInfoHeader}>
                <Ionicons name="shield-checkmark" size={20} color="#10b981" />
                <Text style={styles.protectionInfoTitle}>
                  {locale === 'pt' ? 'Sistema de Proteção Ativo' : 'Protection System Active'}
                </Text>
              </View>
              <Text style={styles.protectionInfoText}>
                {locale === 'pt' 
                  ? '✓ Validação de presença humana\n✓ Controle de estado\n✓ Ponto de tracking definido pelo coach'
                  : '✓ Human presence validation\n✓ State control\n✓ Coach-defined tracking point'}
              </Text>
            </View>
            
            {/* Start Button */}
            <TouchableOpacity
              style={[
                styles.startButton,
                !cameraConfig.loadKg && styles.startButtonDisabled
              ]}
              onPress={goToPointSelection}
              disabled={!cameraConfig.loadKg}
              data-testid="go-to-point-selection-btn"
            >
              <LinearGradient 
                colors={cameraConfig.loadKg ? ['#10b981', '#059669'] : ['#4b5563', '#374151']} 
                style={styles.startButtonGradient}
              >
                <Ionicons name="locate" size={24} color="#ffffff" />
                <Text style={styles.startButtonText}>{labels.selectTrackingPoint}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
      
      {/* POINT SELECTION PHASE */}
      {phase === 'pointSelection' && (
        <View style={styles.pointSelectionContainer}>
          <View style={styles.cameraContainer}>
            {shouldMountCamera && (
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
                onCameraReady={handleCameraReady}
              >
                {/* Overlay for point selection */}
                <View style={styles.pointSelectionOverlay}>
                  {/* Instructions */}
                  <View style={styles.pointInstructionsBanner}>
                    <Ionicons name="information-circle" size={20} color="#ffffff" />
                    <Text style={styles.pointInstructionsText}>{labels.tapToSelect}</Text>
                  </View>
                  
                  {/* Current selection indicator */}
                  {isTrackingPointSet && trackingPoint && (
                    <View style={styles.selectedPointBadge}>
                      <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                      <Text style={styles.selectedPointText}>
                        {getKeypointLabel(trackingPoint.keypointName)}
                      </Text>
                    </View>
                  )}
                </View>
              </CameraView>
            )}
          </View>
          
          {/* Keypoint Selection List */}
          <View style={styles.keypointSelectionPanel}>
            <Text style={styles.keypointPanelTitle}>
              {locale === 'pt' ? 'Selecione o Ponto de Tracking' : 'Select Tracking Point'}
            </Text>
            
            <Text style={styles.recommendedText}>
              {labels.recommendedPoint}: <Text style={styles.recommendedHighlight}>{getKeypointLabel(recommendedTrackingPoint)}</Text>
            </Text>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.keypointScroll}>
              {exerciseKeypoints.map((kp) => (
                <TouchableOpacity
                  key={kp}
                  style={[
                    styles.keypointButton,
                    trackingPoint?.keypointName === kp && styles.keypointButtonSelected,
                    kp === recommendedTrackingPoint && styles.keypointButtonRecommended,
                  ]}
                  onPress={() => handleSelectKeypoint(kp)}
                  data-testid={`keypoint-${kp}`}
                >
                  <Text style={[
                    styles.keypointButtonText,
                    trackingPoint?.keypointName === kp && styles.keypointButtonTextSelected,
                  ]}>
                    {getKeypointLabel(kp)}
                  </Text>
                  {kp === recommendedTrackingPoint && (
                    <Ionicons name="star" size={12} color="#f59e0b" style={styles.starIcon} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            {/* Continue Button */}
            <TouchableOpacity
              style={[
                styles.continueButton,
                !isTrackingPointSet && styles.continueButtonDisabled
              ]}
              onPress={goToRecording}
              disabled={!isTrackingPointSet}
              data-testid="continue-to-recording-btn"
            >
              <Text style={styles.continueButtonText}>{labels.continueToRecording}</Text>
              <Ionicons name="arrow-forward" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      )}
      
      {/* RECORDING PHASE */}
      {phase === 'recording' && (
        <View style={styles.recordingContainer}>
          <View style={styles.cameraContainer}>
            {shouldMountCamera && (
              /* Use RNMediapipe for REAL pose detection on native platforms */
              Platform.OS !== 'web' && RNMediapipe ? (
                <View style={styles.camera}>
                  {/* Native MediaPipe Camera Component */}
                  <RNMediapipe
                    style={StyleSheet.absoluteFill}
                    height={screenHeight}
                    width={screenWidth}
                    onLandmark={handleMediapipeLandmark}
                    face={true}
                    leftArm={true}
                    rightArm={true}
                    leftWrist={true}
                    rightWrist={true}
                    torso={true}
                    leftLeg={true}
                    rightLeg={true}
                    leftAnkle={true}
                    rightAnkle={true}
                    frameLimit={30}
                  />
                  
                  {/* Overlay UI on top of camera */}
                  <View style={[
                    styles.feedbackOverlay,
                    feedbackColor === 'green' && styles.feedbackGreen,
                    feedbackColor === 'red' && styles.feedbackRed,
                  ]}>
                    {/* Protection State Banner - 3 CAMADAS */}
                    <View style={[styles.protectionStateBanner, { backgroundColor: getProtectionStateColor() }]}>
                      <Ionicons 
                        name={
                          protectionState === 'executing' ? 'radio-button-on' : 
                          protectionState === 'ready' ? 'checkmark-circle' :
                          'alert-circle'
                        } 
                        size={16} 
                        color="#ffffff" 
                      />
                      <Text style={styles.protectionStateText}>{getProtectionStateLabel()}</Text>
                      <Text style={styles.protectionModeText}> (REAL MediaPipe)</Text>
                    </View>
                    
                    {/* Debug Landmarks Display */}
                    {debugLandmarks && (
                      <View style={styles.debugBanner}>
                        <Text style={styles.debugText}>Landmarks: {debugLandmarks}</Text>
                      </View>
                    )}
                    
                    {/* Recording indicator */}
                    <View style={styles.recordingIndicator}>
                      <View style={[styles.recordingDot, isTracking && styles.recordingDotActive]} />
                      <Text style={styles.recordingText}>
                        {isTracking ? labels.recording : ''} {formatTime(recordingTime)}
                      </Text>
                    </View>
                    
                    {/* Status Message - CRITICAL INFO */}
                    <View style={[
                      styles.statusMessageContainer,
                      !canCalculate && styles.statusMessageBlocked
                    ]}>
                      <Text style={[
                        styles.statusMessageText,
                        !canCalculate && styles.statusMessageTextBlocked
                      ]}>
                        {statusMessage}
                      </Text>
                    </View>
                    
                    {/* Stability Progress Bar */}
                    {!isStable && stabilityProgress > 0 && (
                      <View style={styles.stabilityProgressContainer}>
                        <View style={[styles.stabilityProgressBar, { width: `${stabilityProgress * 100}%` }]} />
                        <Text style={styles.stabilityProgressText}>
                          Estabilizando: {Math.round(stabilityProgress * 100)}%
                        </Text>
                      </View>
                    )}
                    
                    {/* Tracking Point Indicator */}
                    {trackingPoint && (
                      <View style={styles.trackingPointIndicator}>
                        <Ionicons name="locate" size={16} color={colors.accent.primary} />
                        <Text style={styles.trackingPointText}>
                          {getKeypointLabel(trackingPoint.keypointName)}
                        </Text>
                      </View>
                    )}
                    
                    {/* Velocity Display - Only show when canCalculate */}
                    {canCalculate && (
                      <View style={styles.velocityDisplay}>
                        <Text style={styles.velocityLabel}>{labels.currentVelocity}</Text>
                        <Text style={[
                          styles.velocityValue,
                          feedbackColor === 'red' && styles.velocityValueRed
                        ]}>
                          {currentVelocity.toFixed(2)} m/s
                        </Text>
                      </View>
                    )}
                    
                    {/* Rep Counter */}
                    <View style={styles.repCounter}>
                      <Text style={styles.repLabel}>{labels.repCount}</Text>
                      <Text style={styles.repValue}>{repCount}</Text>
                      {repPhase !== 'idle' && (
                        <Text style={styles.repPhaseText}>{repPhase}</Text>
                      )}
                    </View>
                    
                    {/* Status Badge */}
                    {canCalculate && (
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
                    )}
                  </View>
                </View>
              ) : (
                /* Fallback to CameraView for web (simulation mode) */
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
                      {/* Protection State Banner - 3 CAMADAS */}
                      <View style={[styles.protectionStateBanner, { backgroundColor: getProtectionStateColor() }]}>
                        <Ionicons 
                          name={
                            protectionState === 'executing' ? 'radio-button-on' : 
                            protectionState === 'ready' ? 'checkmark-circle' :
                            'alert-circle'
                          } 
                          size={16} 
                          color="#ffffff" 
                        />
                        <Text style={styles.protectionStateText}>{getProtectionStateLabel()}</Text>
                        <Text style={styles.protectionModeText}> (Simulação)</Text>
                      </View>
                      
                      {/* Recording indicator */}
                      <View style={styles.recordingIndicator}>
                        <View style={[styles.recordingDot, isTracking && styles.recordingDotActive]} />
                        <Text style={styles.recordingText}>
                          {isTracking ? labels.recording : ''} {formatTime(recordingTime)}
                        </Text>
                      </View>
                      
                      {/* Status Message - CRITICAL INFO */}
                      <View style={[
                        styles.statusMessageContainer,
                        !canCalculate && styles.statusMessageBlocked
                      ]}>
                        <Text style={[
                          styles.statusMessageText,
                          !canCalculate && styles.statusMessageTextBlocked
                        ]}>
                          {statusMessage}
                        </Text>
                      </View>
                      
                      {/* Tracking Point Indicator */}
                      {trackingPoint && (
                        <View style={styles.trackingPointIndicator}>
                          <Ionicons name="locate" size={16} color={colors.accent.primary} />
                          <Text style={styles.trackingPointText}>
                            {getKeypointLabel(trackingPoint.keypointName)}
                          </Text>
                        </View>
                      )}
                      
                      {/* Velocity Display - Only show when canCalculate */}
                      {canCalculate && (
                        <View style={styles.velocityDisplay}>
                          <Text style={styles.velocityLabel}>{labels.currentVelocity}</Text>
                          <Text style={[
                            styles.velocityValue,
                            feedbackColor === 'red' && styles.velocityValueRed
                          ]}>
                            {currentVelocity.toFixed(2)} m/s
                          </Text>
                        </View>
                      )}
                      
                      {/* Rep Counter */}
                      <View style={styles.repCounter}>
                        <Text style={styles.repLabel}>{labels.repCount}</Text>
                        <Text style={styles.repValue}>{repCount}</Text>
                        {repPhase !== 'idle' && (
                          <Text style={styles.repPhaseText}>{repPhase}</Text>
                        )}
                      </View>
                      
                      {/* Status Badge */}
                      {canCalculate && (
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
                      )}
                    </View>
                  ) : (
                    <View style={styles.cameraLoadingOverlay}>
                      <ActivityIndicator size="large" color={colors.accent.primary} />
                      <Text style={styles.cameraLoadingText}>{labels.initializingCamera}</Text>
                    </View>
                  )}
                </CameraView>
              )
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
          
          {/* Tracking Info */}
          <View style={styles.trackingInfoCard}>
            <View style={styles.trackingInfoRow}>
              <Ionicons name="locate" size={18} color={colors.accent.primary} />
              <Text style={styles.trackingInfoLabel}>
                {locale === 'pt' ? 'Ponto Rastreado' : 'Tracked Point'}:
              </Text>
              <Text style={styles.trackingInfoValue}>
                {trackingPoint ? getKeypointLabel(trackingPoint.keypointName) : '-'}
              </Text>
            </View>
          </View>
          
          {/* Exercise Info */}
          <View style={styles.exerciseInfoCard}>
            <Text style={styles.exerciseInfoLabel}>{labels.exercise}</Text>
            <View style={styles.exerciseInfoSelector}>
              <Ionicons name="barbell" size={20} color={colors.accent.primary} />
              <Text style={styles.exerciseInfoText}>{selectedExercise}</Text>
            </View>
            <Text style={styles.exerciseLoadText}>
              {labels.loadKg}: {cameraConfig.loadKg} kg
            </Text>
          </View>
          
          {/* Rep Details */}
          <View style={styles.repDetailsCard}>
            <Text style={styles.repDetailsTitle}>
              {locale === 'pt' ? 'Detalhes por Repetição' : 'Rep Details'}
            </Text>
            
            {repsData.map((rep, index) => (
              <View key={index} style={styles.repDetailRow}>
                <Text style={styles.repDetailNumber}>#{rep.rep}</Text>
                <View style={styles.repDetailData}>
                  <Text style={styles.repDetailVelocity}>{rep.meanVelocity} m/s</Text>
                  <Text style={[
                    styles.repDetailDrop,
                    rep.velocityDrop > 10 && styles.repDetailDropWarning
                  ]}>
                    {rep.velocityDrop > 0 ? `-${rep.velocityDrop}%` : '0%'}
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
                setPhase('pointSelection');
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
  protectionInfoCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  protectionInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  protectionInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
  },
  protectionInfoText: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 20,
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
  
  // Point Selection Phase
  pointSelectionContainer: {
    flex: 1,
  },
  pointSelectionOverlay: {
    flex: 1,
    padding: 16,
  },
  pointInstructionsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    alignSelf: 'center',
  },
  pointInstructionsText: {
    color: '#ffffff',
    fontSize: 14,
  },
  selectedPointBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    alignSelf: 'center',
    marginTop: 12,
  },
  selectedPointText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  keypointSelectionPanel: {
    backgroundColor: colors.dark.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  keypointPanelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 8,
  },
  recommendedText: {
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: 16,
  },
  recommendedHighlight: {
    color: '#f59e0b',
    fontWeight: '600',
  },
  keypointScroll: {
    marginBottom: 16,
  },
  keypointButton: {
    backgroundColor: colors.dark.secondary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
    flexDirection: 'row',
    alignItems: 'center',
  },
  keypointButtonSelected: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  keypointButtonRecommended: {
    borderColor: '#f59e0b',
  },
  keypointButtonText: {
    color: colors.text.secondary,
    fontSize: 13,
    fontWeight: '500',
  },
  keypointButtonTextSelected: {
    color: '#ffffff',
  },
  starIcon: {
    marginLeft: 6,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Recording Phase
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
  protectionStateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  protectionStateText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  protectionModeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '400',
  },
  mediapipeLoadingText: {
    color: colors.accent.primary,
    fontSize: 12,
    marginTop: 8,
    fontWeight: '500',
  },
  stabilityText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  debugBanner: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 4,
  },
  debugText: {
    color: '#00ff00',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  stabilityProgressContainer: {
    alignSelf: 'center',
    width: '80%',
    height: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
    justifyContent: 'center',
  },
  stabilityProgressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.accent.primary,
    borderRadius: 12,
  },
  stabilityProgressText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    zIndex: 1,
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
  statusMessageContainer: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    maxWidth: '90%',
  },
  statusMessageBlocked: {
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  statusMessageText: {
    color: '#ffffff',
    fontSize: 13,
    textAlign: 'center',
  },
  statusMessageTextBlocked: {
    fontWeight: '700',
  },
  trackingPointIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    position: 'absolute',
    top: 60,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  trackingPointText: {
    color: '#ffffff',
    fontSize: 12,
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
  repPhaseText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
    marginTop: 4,
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
  
  // Review Phase
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
  trackingInfoCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  trackingInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trackingInfoLabel: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  trackingInfoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
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
