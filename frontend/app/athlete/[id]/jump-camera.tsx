/**
 * Jump Camera Page
 * 
 * Computer Vision-based Jump Assessment capture.
 * Uses MediaPipe pose detection to extract jump metrics automatically.
 * 
 * IMPORTANT: This page ONLY captures and extracts raw metrics.
 * All calculations (RSI, Fatigue, Z-Score, etc.) are handled by the existing backend.
 * 
 * ARCHITECTURE:
 * - Uses CameraMediapipeManager for safe lifecycle management
 * - Sequential state transitions prevent race conditions
 * - Safe cleanup on unmount/background
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../../services/api';
import { colors } from '../../../constants/theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import PremiumGate from '../../../components/PremiumGate';
import { 
  LANDMARK_INDEX_TO_VBT_NAME,
  ProcessedKeypoint,
} from '../../../services/pose';
import {
  JumpProtocol,
  JumpCameraPhase,
  JUMP_PROTOCOL_INFO,
  JUMP_DETECTION_CONFIG,
} from '../../../services/jump/types';
import { useJumpCamera } from '../../../services/jump/useJumpCamera';
import { useJumpCameraLifecycle } from '../../../services/camera';
import { format } from 'date-fns';

// Conditional import for native MediaPipe - SAFE GUARDED IMPORT
let RNMediapipe: any = null;
let MEDIAPIPE_AVAILABLE = false;

if (Platform.OS !== 'web') {
  try {
    const mediapipe = require('@thinksys/react-native-mediapipe');
    if (mediapipe && mediapipe.RNMediapipe) {
      RNMediapipe = mediapipe.RNMediapipe;
      MEDIAPIPE_AVAILABLE = true;
      console.log('[JUMP_CAMERA] MediaPipe loaded successfully');
    } else {
      MEDIAPIPE_AVAILABLE = false;
      console.log('[JUMP_CAMERA] MediaPipe module found but RNMediapipe component not available');
    }
  } catch (e) {
    // CRITICAL: Silent catch to prevent crash in production builds
    MEDIAPIPE_AVAILABLE = false;
    RNMediapipe = null;
    if (__DEV__) {
      console.log('[JUMP_CAMERA] MediaPipe not available:', e);
    }
  }
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

/**
 * JumpCameraPage - Jump Assessment via Camera
 * PREMIUM FEATURE
 */
export default function JumpCameraPage() {
  const { locale } = useLanguage();
  const featureName = locale === 'pt' ? 'Avaliacao de Salto via Camera' : 'Jump Assessment via Camera';
  
  return (
    <PremiumGate featureName={featureName}>
      <JumpCameraContent />
    </PremiumGate>
  );
}

function JumpCameraContent() {
  const { id: athleteId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { locale } = useLanguage();
  const insets = useSafeAreaInsets();
  
  // Camera permissions
  const [permission, requestPermission] = useCameraPermissions();
  
  // Camera lifecycle management - NEW SYSTEM
  const lifecycle = useJumpCameraLifecycle();
  
  // UI State - PHASE SEPARATION FOR SAFE INITIALIZATION
  // 'protocol' -> 'cameraPreview' -> 'recording' -> 'results'
  const [uiPhase, setUiPhase] = useState<'protocol' | 'cameraPreview' | 'recording' | 'results'>('protocol');
  const [selectedProtocol, setSelectedProtocol] = useState<JumpProtocol>('cmj');
  const [boxHeight, setBoxHeight] = useState('40');
  const [athleteHeight, setAthleteHeight] = useState('175');
  const [showProtocolModal, setShowProtocolModal] = useState(false);
  
  // SAFETY: Frame processing guard to prevent simultaneous processing
  const isProcessingFrameRef = useRef(false);
  
  // Frame counter for logging
  const frameCountRef = useRef(0);
  
  // Use jump camera hook
  const jumpCamera = useJumpCamera({
    protocol: selectedProtocol,
    athleteId: athleteId || '',
    boxHeightCm: parseFloat(boxHeight) || 40,
    athleteHeightCm: parseFloat(athleteHeight) || 175,
  });

  // Labels
  const t = {
    title: locale === 'pt' ? 'Jump Camera' : 'Jump Camera',
    selectProtocol: locale === 'pt' ? 'Selecionar Protocolo' : 'Select Protocol',
    startCapture: locale === 'pt' ? 'Iniciar Captura' : 'Start Capture',
    stopCapture: locale === 'pt' ? 'Parar Captura' : 'Stop Capture',
    analyzing: locale === 'pt' ? 'Analisando...' : 'Analyzing...',
    noPermission: locale === 'pt' ? 'Permissao de camera necessaria' : 'Camera permission required',
    grantPermission: locale === 'pt' ? 'Conceder Permissao' : 'Grant Permission',
    boxHeight: locale === 'pt' ? 'Altura da Caixa (cm)' : 'Box Height (cm)',
    athleteHeight: locale === 'pt' ? 'Altura do Atleta (cm)' : 'Athlete Height (cm)',
    prepareJump: locale === 'pt' ? 'Prepare-se para o Salto' : 'Prepare for Jump',
    standStill: locale === 'pt' ? 'Fique parado durante a contagem' : 'Stand still during countdown',
    jumpNow: locale === 'pt' ? 'SALTE AGORA!' : 'JUMP NOW!',
    recording: locale === 'pt' ? 'Gravando...' : 'Recording...',
    calibrating: locale === 'pt' ? 'Calibrando...' : 'Calibrating...',
    results: locale === 'pt' ? 'Resultados' : 'Results',
    flightTime: locale === 'pt' ? 'Tempo de Voo' : 'Flight Time',
    contactTime: locale === 'pt' ? 'Tempo de Contato' : 'Contact Time',
    jumpHeight: locale === 'pt' ? 'Altura do Salto' : 'Jump Height',
    saveAssessment: locale === 'pt' ? 'Salvar Avaliacao' : 'Save Assessment',
    tryAgain: locale === 'pt' ? 'Tentar Novamente' : 'Try Again',
    detectionFailed: locale === 'pt' ? 'Nao foi possivel detectar o salto' : 'Could not detect jump',
    tips: locale === 'pt' ? 'Dicas' : 'Tips',
    tip1: locale === 'pt' ? 'Posicione a camera de lado (perfil)' : 'Position camera from the side (profile)',
    tip2: locale === 'pt' ? 'Certifique-se que os pes e quadril estao visiveis' : 'Make sure feet and hips are visible',
    tip3: locale === 'pt' ? 'Boa iluminacao melhora a precisao' : 'Good lighting improves accuracy',
    activeLeg: locale === 'pt' ? 'Perna Ativa' : 'Active Leg',
    left: locale === 'pt' ? 'Esquerda' : 'Left',
    right: locale === 'pt' ? 'Direita' : 'Right',
    framesRecorded: locale === 'pt' ? 'Frames Gravados' : 'Frames Recorded',
    startRecording: locale === 'pt' ? 'Iniciar Gravacao' : 'Start Recording',
    waitingForCamera: locale === 'pt' ? 'Aguardando camera...' : 'Waiting for camera...',
    cameraReady: locale === 'pt' ? 'Camera pronta!' : 'Camera ready!',
    positionAthlete: locale === 'pt' ? 'Posicione o atleta no enquadramento' : 'Position athlete in frame',
    initializingCamera: locale === 'pt' ? 'Inicializando camera...' : 'Initializing camera...',
    initializingMediapipe: locale === 'pt' ? 'Iniciando deteccao de pose...' : 'Starting pose detection...',
  };

  // Convert MediaPipe landmarks to keypoints array
  const convertMediapipeLandmarks = useCallback((landmarkData: any): ProcessedKeypoint[] => {
    let landmarks: any[] = [];
    
    if (Array.isArray(landmarkData)) {
      landmarks = landmarkData;
    } else if (landmarkData?.landmarks && Array.isArray(landmarkData.landmarks)) {
      landmarks = landmarkData.landmarks;
    } else if (landmarkData?.poseLandmarks && Array.isArray(landmarkData.poseLandmarks)) {
      landmarks = landmarkData.poseLandmarks;
    } else if (landmarkData && typeof landmarkData === 'object') {
      // Body parts format from @thinksys
      const bodyPartMapping: Record<string, number[]> = {
        face: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        leftArm: [11, 13, 15, 17, 19, 21],
        rightArm: [12, 14, 16, 18, 20, 22],
        torso: [11, 12, 23, 24],
        leftLeg: [23, 25, 27, 29, 31],
        rightLeg: [24, 26, 28, 30, 32],
      };
      
      for (const [part, indices] of Object.entries(bodyPartMapping)) {
        const partData = landmarkData[part];
        if (partData && Array.isArray(partData)) {
          partData.forEach((point: any, i: number) => {
            if (point && indices[i] !== undefined) {
              let visibility = 0.85;
              if (typeof point === 'object' && point !== null) {
                const rawVis = point.visibility ?? point.score ?? point.confidence;
                visibility = (rawVis !== null && rawVis !== undefined && !isNaN(rawVis)) ? rawVis : 0.85;
              }
              landmarks[indices[i]] = {
                x: point.x ?? point[0] ?? 0,
                y: point.y ?? point[1] ?? 0,
                visibility: Math.max(0, Math.min(1, visibility)),
              };
            }
          });
        }
      }
    }
    
    if (!landmarks || landmarks.length === 0) return [];
    
    const keypoints: ProcessedKeypoint[] = [];
    
    // Also add foot_index landmarks for better toe detection
    const extendedMapping: Record<number, string> = {
      ...LANDMARK_INDEX_TO_VBT_NAME,
      29: 'left_heel',
      30: 'right_heel',
      31: 'left_foot_index',
      32: 'right_foot_index',
    };
    
    for (const [indexStr, name] of Object.entries(extendedMapping)) {
      const index = parseInt(indexStr, 10);
      const landmark = landmarks[index];
      
      if (landmark) {
        const x = landmark.x ?? landmark[0] ?? 0;
        const y = landmark.y ?? landmark[1] ?? 0;
        let score = 0.85;
        
        if (typeof landmark === 'object' && landmark !== null) {
          const rawScore = landmark.visibility ?? landmark.score ?? landmark.confidence;
          if (rawScore !== null && rawScore !== undefined && typeof rawScore === 'number' && !isNaN(rawScore)) {
            score = rawScore;
          }
        }
        
        keypoints.push({
          name: name as string,
          x,
          y,
          score: Math.max(0, Math.min(1, score)),
        });
      }
    }
    
    return keypoints;
  }, []);

  // Handle MediaPipe landmark callback - WITH LIFECYCLE SAFETY
  const handleMediapipeLandmark = useCallback((event: any) => {
    // SAFETY GUARD 1: Prevent simultaneous frame processing
    if (isProcessingFrameRef.current) {
      return;
    }
    
    // SAFETY GUARD 2: Validate event exists
    if (!event) {
      return;
    }
    
    // SAFETY GUARD 3: Use lifecycle validation
    // This handles all initialization state checks
    const landmarkData = event?.nativeEvent || event;
    if (!landmarkData) {
      return;
    }
    
    // Signal frame to lifecycle manager (handles state transitions)
    lifecycle.signalFirstFrame();
    
    // Check if we should process this frame
    if (!lifecycle.mediapipeReady) {
      // Still initializing - don't process yet, but frame was recorded
      return;
    }
    
    isProcessingFrameRef.current = true;
    
    try {
      frameCountRef.current++;
      
      const keypoints = convertMediapipeLandmarks(landmarkData);
      
      // Only process frames for jump detection when in recording UI phase
      if (keypoints && keypoints.length > 0 && uiPhase === 'recording') {
        jumpCamera.processFrame(keypoints);
      }
      
      // Log periodically
      if (frameCountRef.current % 60 === 0) {
        console.log(`[JUMP_CAMERA] Frame ${frameCountRef.current}, phase: ${lifecycle.phase}, mediapipeReady: ${lifecycle.mediapipeReady}`);
      }
    } catch (e) {
      if (__DEV__) {
        console.log('[JUMP_CAMERA] Frame processing error:', e);
      }
    } finally {
      isProcessingFrameRef.current = false;
    }
  }, [lifecycle, convertMediapipeLandmarks, uiPhase, jumpCamera]);

  // Submit mutation to save assessment
  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/jump/assessment', data);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['jump-analysis'] });
      queryClient.invalidateQueries({ queryKey: ['jump-assessments'] });
      queryClient.invalidateQueries({ queryKey: ['scientific-analysis'] });
      
      Alert.alert(
        locale === 'pt' ? 'Avaliacao Salva!' : 'Assessment Saved!',
        locale === 'pt' 
          ? `RSI: ${data.calculations.rsi}\nPotencia: ${data.calculations.peak_power_w}W`
          : `RSI: ${data.calculations.rsi}\nPower: ${data.calculations.peak_power_w}W`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    },
    onError: (error: any) => {
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        error.response?.data?.detail || (locale === 'pt' ? 'Erro ao salvar' : 'Error saving')
      );
    },
  });

  // Handle save
  const handleSaveAssessment = useCallback(() => {
    if (!jumpCamera.metrics) return;
    
    submitMutation.mutate({
      athlete_id: athleteId,
      date: format(new Date(), 'yyyy-MM-dd'),
      protocol: selectedProtocol,
      flight_time_ms: jumpCamera.metrics.flightTimeMs,
      contact_time_ms: jumpCamera.metrics.contactTimeMs,
      jump_height_cm: jumpCamera.metrics.jumpHeightCm,
      box_height_cm: selectedProtocol === 'dj' ? parseFloat(boxHeight) : null,
      notes: `data_source: camera`,
    });
  }, [athleteId, selectedProtocol, boxHeight, jumpCamera.metrics, submitMutation]);

  // Handle start camera - USING LIFECYCLE MANAGER
  const handleStartCamera = useCallback(() => {
    if (!permission?.granted) {
      requestPermission();
      return;
    }
    
    // Reset frame counter
    frameCountRef.current = 0;
    
    // Request camera through lifecycle manager
    const success = lifecycle.requestCameraStart();
    
    if (success) {
      console.log('[JUMP_CAMERA] Camera start requested successfully');
      setUiPhase('cameraPreview');
    } else {
      console.warn('[JUMP_CAMERA] Camera start request failed');
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        locale === 'pt' ? 'Nao foi possivel iniciar a camera' : 'Could not start camera'
      );
    }
  }, [permission, requestPermission, lifecycle, locale]);
  
  // Handle start recording - Called after camera is ready
  const handleStartRecording = useCallback(() => {
    if (!lifecycle.mediapipeReady && Platform.OS !== 'web') {
      console.log('[JUMP_CAMERA] Cannot start recording - mediapipe not ready');
      return;
    }
    
    console.log('[JUMP_CAMERA] Starting recording phase');
    lifecycle.signalCaptureStart();
    setUiPhase('recording');
    jumpCamera.startCountdown();
  }, [lifecycle, jumpCamera]);

  // Handle back from camera - SAFE CLEANUP
  const handleBackFromCamera = useCallback(() => {
    console.log('[JUMP_CAMERA] Exiting camera view');
    lifecycle.releaseCamera();
    frameCountRef.current = 0;
    jumpCamera.reset();
    setUiPhase('protocol');
  }, [lifecycle, jumpCamera]);

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      console.log('[JUMP_CAMERA] Component unmounting - releasing resources');
      lifecycle.releaseCamera();
      isProcessingFrameRef.current = false;
    };
  }, [lifecycle]);

  // Go to results when metrics are available
  useEffect(() => {
    if (jumpCamera.phase === 'review' && jumpCamera.metrics) {
      setUiPhase('results');
    }
  }, [jumpCamera.phase, jumpCamera.metrics]);

  // Permission loading
  if (!permission) {
    return (
      <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.accent.primary} />
        </View>
      </LinearGradient>
    );
  }

  // Protocol selection screen
  if (uiPhase === 'protocol') {
    const protocolInfo = JUMP_PROTOCOL_INFO[selectedProtocol];
    
    return (
      <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={styles.container}>
        <ScrollView 
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity 
              onPress={() => router.back()} 
              style={styles.backButton}
              data-testid="back-button"
            >
              <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.title}>{t.title}</Text>
            <View style={{ width: 40 }} />
          </View>
          
          {/* Protocol Selector */}
          <TouchableOpacity 
            style={styles.protocolSelector}
            onPress={() => setShowProtocolModal(true)}
            data-testid="protocol-selector"
          >
            <View style={styles.protocolSelectorContent}>
              <View style={styles.protocolIcon}>
                <Ionicons name={(protocolInfo.icon) as any} size={24} color="#ffffff" />
              </View>
              <View>
                <Text style={styles.protocolName}>
                  {locale === 'pt' ? protocolInfo.namePt : protocolInfo.name}
                </Text>
                <Text style={styles.protocolDescription}>
                  {locale === 'pt' ? protocolInfo.descriptionPt : protocolInfo.description}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-down" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          
          {/* Configuration Card */}
          <View style={styles.configCard}>
            <Text style={styles.configTitle}>
              {locale === 'pt' ? 'Configuracao' : 'Configuration'}
            </Text>
            
            {/* Box Height (DJ only) */}
            {selectedProtocol === 'dj' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t.boxHeight}</Text>
                <TextInput
                  style={styles.input}
                  value={boxHeight}
                  onChangeText={setBoxHeight}
                  keyboardType="numeric"
                  placeholder="40"
                  placeholderTextColor={colors.text.tertiary}
                  data-testid="box-height-input"
                />
              </View>
            )}
            
            {/* Athlete Height */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t.athleteHeight}</Text>
              <TextInput
                style={styles.input}
                value={athleteHeight}
                onChangeText={setAthleteHeight}
                keyboardType="numeric"
                placeholder="175"
                placeholderTextColor={colors.text.tertiary}
                data-testid="athlete-height-input"
              />
            </View>
          </View>
          
          {/* Tips Card */}
          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>{t.tips}</Text>
            <View style={styles.tipItem}>
              <Ionicons name="phone-portrait" size={16} color={colors.accent.primary} />
              <Text style={styles.tipText}>{t.tip1}</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="body" size={16} color={colors.accent.primary} />
              <Text style={styles.tipText}>{t.tip2}</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="sunny" size={16} color={colors.accent.primary} />
              <Text style={styles.tipText}>{t.tip3}</Text>
            </View>
          </View>
          
          {/* Start Button */}
          <TouchableOpacity
            style={styles.startButton}
            onPress={handleStartCamera}
            data-testid="start-capture-btn"
          >
            <LinearGradient colors={['#8b5cf6', '#6d28d9']} style={styles.startButtonGradient}>
              <Ionicons name="camera" size={24} color="#ffffff" />
              <Text style={styles.startButtonText}>{t.startCapture}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
        
        {/* Protocol Modal */}
        <Modal
          visible={showProtocolModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowProtocolModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t.selectProtocol}</Text>
                <TouchableOpacity onPress={() => setShowProtocolModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
              </View>
              <ScrollView>
                {(Object.keys(JUMP_PROTOCOL_INFO) as JumpProtocol[]).map((protocol) => {
                  const info = JUMP_PROTOCOL_INFO[protocol];
                  return (
                    <TouchableOpacity
                      key={protocol}
                      style={[styles.modalOption, selectedProtocol === protocol && styles.modalOptionActive]}
                      onPress={() => {
                        setSelectedProtocol(protocol);
                        setShowProtocolModal(false);
                      }}
                      data-testid={`protocol-${protocol}`}
                    >
                      <View style={styles.modalOptionIcon}>
                        <Ionicons 
                          name={info.icon as any} 
                          size={24} 
                          color={selectedProtocol === protocol ? '#ffffff' : colors.text.secondary} 
                        />
                      </View>
                      <View style={styles.modalOptionText}>
                        <Text style={styles.modalOptionName}>
                          {locale === 'pt' ? info.namePt : info.name}
                        </Text>
                        <Text style={styles.modalOptionDesc}>
                          {locale === 'pt' ? info.descriptionPt : info.description}
                        </Text>
                      </View>
                      {selectedProtocol === protocol && (
                        <Ionicons name="checkmark-circle" size={24} color={colors.accent.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </LinearGradient>
    );
  }

  // Camera Preview screen - Uses lifecycle for safe initialization
  if (uiPhase === 'cameraPreview') {
    // Determine status text based on lifecycle phase
    const getStatusText = () => {
      switch (lifecycle.phase) {
        case 'INITIALIZING_CAMERA':
          return t.initializingCamera;
        case 'CAMERA_READY':
        case 'INITIALIZING_MEDIAPIPE':
          return t.initializingMediapipe;
        case 'MEDIAPIPE_READY':
        case 'CAPTURE_ACTIVE':
          return t.cameraReady;
        default:
          return t.waitingForCamera;
      }
    };
    
    const isReady = lifecycle.mediapipeReady || Platform.OS === 'web';
    
    return (
      <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={styles.container}>
        {/* Header */}
        <View style={[styles.cameraHeader, { paddingTop: insets.top }]}>
          <TouchableOpacity 
            onPress={handleBackFromCamera} 
            style={styles.backButton}
            data-testid="camera-preview-back-btn"
          >
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.cameraTitle}>{t.title}</Text>
          <View style={{ width: 40 }} />
        </View>
        
        {/* Camera View - Only mount when lifecycle allows */}
        <View style={styles.cameraContainer}>
          {lifecycle.shouldMountCamera && Platform.OS !== 'web' && MEDIAPIPE_AVAILABLE && RNMediapipe ? (
            <View style={styles.camera}>
              <RNMediapipe
                style={StyleSheet.absoluteFill}
                height={screenHeight}
                width={screenWidth}
                onLandmark={handleMediapipeLandmark}
                face={false}
                leftArm={false}
                rightArm={false}
                leftWrist={false}
                rightWrist={false}
                torso={true}
                leftLeg={true}
                rightLeg={true}
                leftAnkle={true}
                rightAnkle={true}
                frameLimit={60}
              />
            </View>
          ) : lifecycle.shouldMountCamera ? (
            // Fallback when MediaPipe not available
            <CameraView
              style={styles.camera}
              facing="back"
              onCameraReady={() => {
                lifecycle.signalCameraReady();
                // For web/fallback, manually signal mediapipe ready
                setTimeout(() => lifecycle.signalFirstFrame(), 100);
              }}
            >
              <View style={styles.webFallbackOverlay}>
                <Text style={styles.webFallbackText}>
                  {locale === 'pt' 
                    ? 'MediaPipe nao disponivel. Use um dispositivo fisico com Dev Build.'
                    : 'MediaPipe not available. Use a physical device with Dev Build.'}
                </Text>
              </View>
            </CameraView>
          ) : (
            // Loading state while waiting to mount
            <View style={styles.cameraLoadingOverlay}>
              <ActivityIndicator size="large" color={colors.accent.primary} />
              <Text style={styles.cameraLoadingText}>
                {t.initializingCamera}
              </Text>
            </View>
          )}
          
          {/* Camera preview overlay - shows status */}
          <View style={styles.cameraOverlay}>
            <View style={styles.previewStatusOverlay}>
              {/* Camera status indicator */}
              {!isReady && (
                <>
                  <ActivityIndicator size="small" color="#f59e0b" />
                  <Text style={styles.previewStatusText}>{getStatusText()}</Text>
                </>
              )}
              {isReady && (
                <>
                  <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
                  <Text style={[styles.previewStatusText, { color: '#22c55e' }]}>{t.cameraReady}</Text>
                </>
              )}
              <Text style={styles.previewInstructionText}>{t.positionAthlete}</Text>
              
              {/* Debug info */}
              {__DEV__ && (
                <Text style={styles.debugText}>
                  Phase: {lifecycle.phase} | Frames: {lifecycle.frameCount}
                </Text>
              )}
            </View>
          </View>
        </View>
        
        {/* Bottom Controls - Start Recording button */}
        <View style={[styles.cameraControls, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            style={[
              styles.captureButton,
              !isReady && styles.captureButtonDisabled
            ]}
            onPress={handleStartRecording}
            disabled={!isReady}
            data-testid="start-recording-btn"
          >
            <LinearGradient 
              colors={!isReady ? ['#6b7280', '#4b5563'] : ['#22c55e', '#16a34a']} 
              style={styles.captureButtonGradient}
            >
              <Ionicons name="play" size={32} color="#ffffff" />
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.captureButtonLabel}>
            {t.startRecording}
          </Text>
        </View>
      </LinearGradient>
    );
  }

  // Recording screen - Active capture with countdown
  if (uiPhase === 'recording') {
    return (
      <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={styles.container}>
        {/* Header */}
        <View style={[styles.cameraHeader, { paddingTop: insets.top }]}>
          <TouchableOpacity 
            onPress={() => {
              jumpCamera.reset();
              setUiPhase('cameraPreview');
            }} 
            style={styles.backButton}
            data-testid="recording-back-btn"
          >
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.cameraTitle}>{t.title}</Text>
          <View style={{ width: 40 }} />
        </View>
        
        {/* Camera View - Active processing */}
        <View style={styles.cameraContainer}>
          {lifecycle.shouldMountCamera && Platform.OS !== 'web' && MEDIAPIPE_AVAILABLE && RNMediapipe ? (
            <View style={styles.camera}>
              <RNMediapipe
                style={StyleSheet.absoluteFill}
                height={screenHeight}
                width={screenWidth}
                onLandmark={handleMediapipeLandmark}
                face={false}
                leftArm={false}
                rightArm={false}
                leftWrist={false}
                rightWrist={false}
                torso={true}
                leftLeg={true}
                rightLeg={true}
                leftAnkle={true}
                rightAnkle={true}
                frameLimit={60}
              />
            </View>
          ) : lifecycle.shouldMountCamera ? (
            <CameraView
              style={styles.camera}
              facing="back"
            >
              <View style={styles.webFallbackOverlay}>
                <Text style={styles.webFallbackText}>
                  {locale === 'pt' 
                    ? 'MediaPipe nao disponivel.'
                    : 'MediaPipe not available.'}
                </Text>
              </View>
            </CameraView>
          ) : null}
          
          {/* Overlay based on jump detection phase */}
          <View style={styles.cameraOverlay}>
            {/* Countdown */}
            {jumpCamera.phase === 'countdown' && (
              <View style={styles.countdownOverlay}>
                <Text style={styles.countdownNumber}>{jumpCamera.countdown}</Text>
                <Text style={styles.countdownText}>{t.standStill}</Text>
                <View style={styles.calibrationBar}>
                  <View 
                    style={[
                      styles.calibrationBarFill, 
                      { width: `${jumpCamera.calibrationProgress}%` }
                    ]} 
                  />
                </View>
                <Text style={styles.calibrationText}>{t.calibrating}</Text>
              </View>
            )}
            
            {/* Recording */}
            {jumpCamera.phase === 'recording' && (
              <View style={styles.recordingOverlay}>
                <View style={styles.recordingBadge}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>{t.jumpNow}</Text>
                </View>
                <Text style={styles.frameCountText}>
                  {t.framesRecorded}: {jumpCamera.frameCount}
                </Text>
                {jumpCamera.activeLeg && (
                  <Text style={styles.activeLegText}>
                    {t.activeLeg}: {jumpCamera.activeLeg === 'left' ? t.left : t.right}
                  </Text>
                )}
              </View>
            )}
            
            {/* Processing */}
            {jumpCamera.phase === 'processing' && (
              <View style={styles.processingOverlay}>
                <ActivityIndicator size="large" color={colors.accent.primary} />
                <Text style={styles.processingText}>{t.analyzing}</Text>
              </View>
            )}
            
            {/* Setup state */}
            {jumpCamera.phase === 'setup' && (
              <View style={styles.idleOverlay}>
                <Text style={styles.idleText}>{t.prepareJump}</Text>
              </View>
            )}
          </View>
        </View>
        
        {/* Bottom Controls */}
        <View style={[styles.cameraControls, { paddingBottom: insets.bottom + 20 }]}>
          {jumpCamera.phase === 'recording' && (
            <TouchableOpacity
              style={styles.stopButton}
              onPress={jumpCamera.stopRecording}
              data-testid="stop-recording-btn"
            >
              <LinearGradient colors={['#ef4444', '#dc2626']} style={styles.captureButtonGradient}>
                <Ionicons name="stop" size={32} color="#ffffff" />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>
    );
  }

  // Results screen
  if (uiPhase === 'results') {
    return (
      <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={styles.container}>
        <ScrollView 
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity 
              onPress={() => {
                lifecycle.releaseCamera();
                jumpCamera.reset();
                setUiPhase('protocol');
              }} 
              style={styles.backButton}
              data-testid="results-back-btn"
            >
              <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.title}>{t.results}</Text>
            <View style={{ width: 40 }} />
          </View>
          
          {jumpCamera.metrics ? (
            <>
              {/* Success Banner */}
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
                <Text style={styles.successText}>
                  {locale === 'pt' ? 'Salto Detectado!' : 'Jump Detected!'}
                </Text>
              </View>
              
              {/* Metrics Cards */}
              <View style={styles.metricsGrid}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>
                    {jumpCamera.metrics.flightTimeMs.toFixed(0)}
                  </Text>
                  <Text style={styles.metricLabel}>{t.flightTime} (ms)</Text>
                </View>
                
                {selectedProtocol === 'dj' && (
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>
                      {jumpCamera.metrics.contactTimeMs.toFixed(0)}
                    </Text>
                    <Text style={styles.metricLabel}>{t.contactTime} (ms)</Text>
                  </View>
                )}
                
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>
                    {jumpCamera.metrics.jumpHeightCm.toFixed(1)}
                  </Text>
                  <Text style={styles.metricLabel}>{t.jumpHeight} (cm)</Text>
                </View>
              </View>
              
              {/* Info Text */}
              <View style={styles.infoCard}>
                <Ionicons name="information-circle" size={20} color={colors.text.secondary} />
                <Text style={styles.infoText}>
                  {locale === 'pt' 
                    ? 'Os calculos de RSI, Potencia e outros indicadores serao feitos automaticamente ao salvar.'
                    : 'RSI, Power, and other metrics will be calculated automatically when you save.'}
                </Text>
              </View>
              
              {/* Action Buttons */}
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveAssessment}
                disabled={submitMutation.isPending}
                data-testid="save-assessment-btn"
              >
                <LinearGradient colors={['#8b5cf6', '#6d28d9']} style={styles.saveButtonGradient}>
                  {submitMutation.isPending ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="save" size={20} color="#ffffff" />
                      <Text style={styles.saveButtonText}>{t.saveAssessment}</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.tryAgainButton}
                onPress={() => {
                  jumpCamera.reset();
                  frameCountRef.current = 0;
                  setUiPhase('cameraPreview');
                }}
                data-testid="try-again-btn"
              >
                <Ionicons name="refresh" size={20} color={colors.text.secondary} />
                <Text style={styles.tryAgainText}>{t.tryAgain}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Error State */}
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={48} color="#f59e0b" />
                <Text style={styles.errorText}>{t.detectionFailed}</Text>
                {jumpCamera.error && (
                  <Text style={styles.errorDetail}>{jumpCamera.error}</Text>
                )}
              </View>
              
              <TouchableOpacity
                style={styles.tryAgainButtonLarge}
                onPress={() => {
                  jumpCamera.reset();
                  frameCountRef.current = 0;
                  setUiPhase('cameraPreview');
                }}
                data-testid="error-try-again-btn"
              >
                <LinearGradient colors={['#f59e0b', '#d97706']} style={styles.tryAgainButtonGradient}>
                  <Ionicons name="refresh" size={24} color="#ffffff" />
                  <Text style={styles.tryAgainButtonLargeText}>{t.tryAgain}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </LinearGradient>
    );
  }

  return null;
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
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },
  protocolSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: colors.accent.primary,
  },
  protocolSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  protocolIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  protocolName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  protocolDescription: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  configCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  configTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
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
  tipsCard: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent.primary,
    marginBottom: 12,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  tipText: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  startButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
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
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: colors.dark.card,
    gap: 12,
  },
  modalOptionActive: {
    borderColor: colors.accent.primary,
    borderWidth: 2,
  },
  modalOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.dark.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOptionText: {
    flex: 1,
  },
  modalOptionName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  modalOptionDesc: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  cameraTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webFallbackOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  webFallbackText: {
    color: colors.text.secondary,
    textAlign: 'center',
    padding: 20,
  },
  cameraLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.dark.primary,
  },
  cameraLoadingText: {
    color: colors.text.secondary,
    marginTop: 12,
    fontSize: 16,
  },
  previewStatusOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 20,
    paddingHorizontal: 32,
    borderRadius: 16,
    gap: 8,
  },
  previewStatusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginTop: 4,
  },
  previewInstructionText: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 8,
  },
  debugText: {
    fontSize: 10,
    color: '#f59e0b',
    marginTop: 8,
  },
  captureButtonLabel: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 8,
  },
  cameraControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  captureButton: {
    borderRadius: 40,
    overflow: 'hidden',
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  captureButtonGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButton: {
    borderRadius: 40,
    overflow: 'hidden',
  },
  countdownOverlay: {
    alignItems: 'center',
  },
  countdownNumber: {
    fontSize: 120,
    fontWeight: 'bold',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  countdownText: {
    fontSize: 18,
    color: '#ffffff',
    marginTop: 8,
  },
  calibrationBar: {
    width: 200,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 3,
    marginTop: 16,
    overflow: 'hidden',
  },
  calibrationBarFill: {
    height: '100%',
    backgroundColor: colors.accent.primary,
    borderRadius: 3,
  },
  calibrationText: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 8,
  },
  recordingOverlay: {
    alignItems: 'center',
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    gap: 8,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  recordingText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  frameCountText: {
    fontSize: 14,
    color: '#ffffff',
    marginTop: 16,
  },
  activeLegText: {
    fontSize: 14,
    color: '#ffffff',
    marginTop: 8,
  },
  processingOverlay: {
    alignItems: 'center',
    gap: 16,
  },
  processingText: {
    fontSize: 18,
    color: '#ffffff',
  },
  idleOverlay: {
    alignItems: 'center',
  },
  idleText: {
    fontSize: 18,
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  successBanner: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 16,
    marginBottom: 16,
  },
  successText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#22c55e',
    marginTop: 8,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  metricLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 4,
    textAlign: 'center',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  saveButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  saveButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  tryAgainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
  },
  tryAgainText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  errorBanner: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 16,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f59e0b',
    marginTop: 8,
  },
  errorDetail: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 4,
    textAlign: 'center',
  },
  tryAgainButtonLarge: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  tryAgainButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  tryAgainButtonLargeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
});
