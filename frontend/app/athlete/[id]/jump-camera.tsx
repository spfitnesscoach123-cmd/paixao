/**
 * Jump Camera Page
 * 
 * Computer Vision-based Jump Assessment capture.
 * Uses MediaPipe pose detection to extract jump metrics automatically.
 * 
 * IMPORTANT: This page ONLY captures and extracts raw metrics.
 * All calculations (RSI, Fatigue, Z-Score, etc.) are handled by the existing backend.
 * 
 * ARCHITECTURE (PROGRESSIVE INITIALIZATION):
 * This component implements a THREE-STAGE pipeline to prevent crashes:
 * 
 * STAGE 1 - CAMERA READY:
 *   - RNMediapipe mounts and displays camera preview
 *   - First frame received marks cameraReady = true
 *   - NO MediaPipe processing, NO engine, NO frame handling
 * 
 * STAGE 2 - MEDIAPIPE READY:
 *   - Only starts AFTER cameraReady = true
 *   - Waits for first valid landmark detection
 *   - First landmark marks mediapipeReady = true
 * 
 * STAGE 3 - ENGINE READY:
 *   - Only starts AFTER mediapipeReady = true
 *   - Jump engine initializes
 *   - jumpEngineReady = true enables PLAY button
 * 
 * Frame processing callback MUST check ALL THREE states before processing.
 * This prevents crash from simultaneous initialization.
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
  JUMP_PROTOCOL_INFO,
} from '../../../services/jump/types';
import { useJumpCamera } from '../../../services/jump/useJumpCamera';
import { OverlayLayer } from '../../../components/jump/OverlayLayer';
import { JumpGraph } from '../../../components/jump/JumpGraph';
import { format } from 'date-fns';

// MediaPipe via Vision Camera + native frame processor plugin (detectPose)
// Replaces @thinksys/react-native-mediapipe with direct MediaPipe Tasks Vision integration
import { MediaPipeCamera, MEDIAPIPE_AVAILABLE } from '../../../services/pose/MediaPipeCamera';

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
  
  // PHASE 1A SAFETY: Freeze athleteId at recording start to prevent cross-athlete save
  const recordingAthleteIdRef = useRef<string | null>(null);
  
  // Camera permissions
  const [permission, requestPermission] = useCameraPermissions();
  
  // ============================================================
  // THREE-STAGE PIPELINE STATE (PROGRESSIVE INITIALIZATION)
  // ============================================================
  // These states MUST transition in strict order to prevent crash:
  // shouldMountCamera -> cameraReady -> mediapipeReady -> jumpEngineReady
  
  // STAGE 0: Camera component mounting control
  const [shouldMountCamera, setShouldMountCamera] = useState(false);
  
  // STAGE 1: Camera preview is rendering and sending frames
  // Set to true ONLY when first raw frame is received from RNMediapipe
  // At this stage: camera preview visible, NO landmark processing
  const [cameraReady, setCameraReady] = useState(false);
  
  // STAGE 2: MediaPipe pose detection is working
  // Set to true ONLY when first VALID landmark is detected (after cameraReady)
  // At this stage: landmarks being detected, engine NOT yet active
  const [mediapipeReady, setMediapipeReady] = useState(false);
  
  // STAGE 3: Jump engine is initialized and ready
  // Set to true ONLY after mediapipeReady (small delay for stability)
  // At this stage: ALL systems ready, PLAY button enabled
  const [jumpEngineReady, setJumpEngineReady] = useState(false);
  
  // UI State - PHASE SEPARATION FOR SAFE INITIALIZATION
  // 'protocol' -> 'cameraPreview' -> 'recording' -> 'results'
  const [uiPhase, setUiPhase] = useState<'protocol' | 'cameraPreview' | 'recording' | 'results'>('protocol');
  const [selectedProtocol, setSelectedProtocol] = useState<JumpProtocol>('cmj');
  const [boxHeight, setBoxHeight] = useState('40');
  const [athleteHeight, setAthleteHeight] = useState('175');
  const [showProtocolModal, setShowProtocolModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [firstLeg, setFirstLeg] = useState<'left' | 'right'>('right');
  
  // Hip Y history for JumpGraph (CMJ only)
  const hipYHistoryRef = useRef<number[]>([]);
  
  // SAFETY: Frame processing guard to prevent simultaneous processing
  const isProcessingFrameRef = useRef(false);
  
  // Frame counter for logging
  const frameCountRef = useRef(0);
  
  // Map selected protocol to internal camera protocol
  const cameraProtocol = selectedProtocol === 'sl_cmj' 
    ? (firstLeg === 'left' ? 'sl_cmj_left' : 'sl_cmj_right') 
    : selectedProtocol;
  
  // Use jump camera hook
  const jumpCamera = useJumpCamera({
    protocol: cameraProtocol as any,
    athleteId: athleteId || '',
    boxHeightCm: parseFloat(boxHeight) || 40,
    athleteHeightCm: parseFloat(athleteHeight) || 175,
    firstLeg,
  });

  // Collect hip Y data for JumpGraph during CMJ recording
  const isCmjProtocol = selectedProtocol === 'cmj';
  useEffect(() => {
    if (jumpCamera.phase === 'recording' && isCmjProtocol && jumpCamera.liveMetrics.currentHipY > 0) {
      hipYHistoryRef.current.push(jumpCamera.liveMetrics.currentHipY);
    }
    if (jumpCamera.phase !== 'recording') {
      hipYHistoryRef.current = [];
    }
  }, [jumpCamera.phase, jumpCamera.liveMetrics.currentHipY, isCmjProtocol]);

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
    eccentricTime: locale === 'pt' ? 'Tempo Excentrico' : 'Eccentric Time',
    rsiMod: 'RSI mod',
    takeoffVelocity: locale === 'pt' ? 'Vel. Decolagem' : 'Takeoff Velocity',
    protocol: locale === 'pt' ? 'Protocolo' : 'Protocol',
    repeatTest: locale === 'pt' ? 'Repetir Teste' : 'Repeat Test',
    saveTest: locale === 'pt' ? 'Salvar Teste' : 'Save Test',
    betweenJumps: locale === 'pt' ? 'Prepare-se para o proximo salto' : 'Prepare for next jump',
    leg1Complete: locale === 'pt' ? 'Perna 1 completa!' : 'Leg 1 complete!',
    switchLeg: locale === 'pt' ? 'Troque de perna' : 'Switch leg',
    liveEccentric: locale === 'pt' ? 'Exc.' : 'Ecc.',
    liveFlight: locale === 'pt' ? 'Voo' : 'Flight',
    liveContact: locale === 'pt' ? 'Contato' : 'Contact',
    // Scanner
    scannerCollecting: locale === 'pt' ? 'Escaneando...' : 'Scanning...',
    scannerAnalyzing: locale === 'pt' ? 'Analisando estabilidade...' : 'Analyzing stability...',
    scannerReady: locale === 'pt' ? 'Pronto!' : 'Ready!',
    scannerBlocked: locale === 'pt' ? 'Calibracao falhou' : 'Calibration failed',
    scannerRetry: locale === 'pt' ? 'Recalibrar' : 'Recalibrate',
    scannerStandStill: locale === 'pt' ? 'Fique parado, pes no chao' : 'Stand still, feet on ground',
    scannerAdjustPosition: locale === 'pt' ? 'Ajuste a posicao e tente novamente' : 'Adjust position and try again',
    scannerGroundLine: locale === 'pt' ? 'Linha do Solo' : 'Ground Line',
    scannerConfidence: locale === 'pt' ? 'Confianca' : 'Confidence',
    // New labels
    scannerContinueAnyway: locale === 'pt' ? 'Continuar mesmo assim' : 'Continue anyway',
    orientationWarning: locale === 'pt' ? 'Posicione-se de lado para a camera' : 'Position yourself sideways to the camera',
    // SL-CMJ
    slcmjFirstLeg: locale === 'pt' ? 'Qual perna primeiro?' : 'Which leg first?',
    slcmjJump1Detected: locale === 'pt' ? 'Salto 1 detectado' : 'Jump 1 detected',
    slcmjPrepareSecond: locale === 'pt' ? 'Prepare-se para o proximo salto' : 'Prepare for next jump',
    slcmjJump2Detected: locale === 'pt' ? 'Salto 2 detectado' : 'Jump 2 detected',
    slcmjProcessing: locale === 'pt' ? 'Processando...' : 'Processing...',
    scientificDetails: locale === 'pt' ? 'Ver Detalhes Cientificos' : 'View Scientific Details',
  };

  // Overlay keypoints for visual feedback (throttled to ~15fps)
  const [overlayKeypoints, setOverlayKeypoints] = useState<ProcessedKeypoint[]>([]);
  const overlayFrameCountRef = useRef(0);

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

  // ============================================================
  // LANDMARK CALLBACK - THREE-STAGE PROGRESSIVE PROCESSING
  // ============================================================
  // This callback implements the progressive initialization:
  // 
  // FIRST FRAME: Only set cameraReady, return immediately
  // AFTER cameraReady: Check for valid landmarks to set mediapipeReady
  // AFTER mediapipeReady: Wait for jumpEngineReady (set by useEffect)
  // AFTER jumpEngineReady: Process frames for jump detection
  //
  // CRITICAL: Each stage MUST complete before the next begins
  // ============================================================
  const handleMediapipeLandmark = useCallback((event: any, nativeTimestamp?: number) => {
    // ========================================
    // GUARD 1: Prevent re-entrant processing
    // ========================================
    if (isProcessingFrameRef.current) {
      return;
    }
    
    // ========================================
    // GUARD 2: Validate event exists
    // ========================================
    if (!event) {
      return;
    }
    
    const landmarkData = event?.nativeEvent || event;
    if (!landmarkData) {
      return;
    }
    
    isProcessingFrameRef.current = true;
    frameCountRef.current++;
    
    try {
      // ========================================
      // STAGE 1: CAMERA READY
      // ========================================
      // First frame received = camera preview is working
      // At this stage we ONLY mark cameraReady and return
      // NO landmark processing, NO engine, NO calculations
      if (!cameraReady) {
        console.log('[JUMP_CAMERA] ========================================');
        console.log('[JUMP_CAMERA] STAGE 1: First frame received from RNMediapipe');
        console.log('[JUMP_CAMERA] Camera preview is now rendering');
        console.log('[JUMP_CAMERA] Setting cameraReady = true');
        console.log('[JUMP_CAMERA] ========================================');
        setCameraReady(true);
        // CRITICAL: Return immediately, do NOT process anything else
        return;
      }
      
      // ========================================
      // STAGE 2: MEDIAPIPE READY
      // ========================================
      // Only check landmarks AFTER camera is confirmed ready
      // Wait for first valid landmark to confirm MediaPipe is working
      if (!mediapipeReady) {
        // Try to parse landmarks
        const keypoints = convertMediapipeLandmarks(landmarkData);
        
        // Check if we have valid landmarks (at least hip and ankle for jumps)
        const hasValidLandmarks = keypoints && keypoints.length > 0 && 
          keypoints.some(kp => kp.name.includes('hip') && kp.score > 0.3) &&
          keypoints.some(kp => kp.name.includes('ankle') && kp.score > 0.3);
        
        if (hasValidLandmarks) {
          console.log('[JUMP_CAMERA] ========================================');
          console.log('[JUMP_CAMERA] STAGE 2: Valid landmarks detected');
          console.log('[JUMP_CAMERA] MediaPipe pose detection confirmed working');
          console.log('[JUMP_CAMERA] Keypoints found:', keypoints.length);
          console.log('[JUMP_CAMERA] Setting mediapipeReady = true');
          console.log('[JUMP_CAMERA] ========================================');
          setMediapipeReady(true);
        } else if (frameCountRef.current % 30 === 0) {
          // Log periodically while waiting for valid landmarks
          console.log(`[JUMP_CAMERA] STAGE 2: Waiting for valid landmarks... (frame ${frameCountRef.current})`);
        }
        // CRITICAL: Return, do NOT process frames yet
        return;
      }
      
      // ========================================
      // STAGE 3: ENGINE READY CHECK
      // ========================================
      // jumpEngineReady is set by useEffect after mediapipeReady
      // This ensures a small stabilization delay
      if (!jumpEngineReady) {
        // Log periodically while waiting for engine
        if (frameCountRef.current % 30 === 0) {
          console.log(`[JUMP_CAMERA] STAGE 3: Waiting for engine initialization... (frame ${frameCountRef.current})`);
        }
        // CRITICAL: Return, engine not ready
        return;
      }
      
      // ========================================
      // ALL STAGES COMPLETE - SAFE TO PROCESS
      // ========================================
      // Only now can we process frames for jump detection
      // During 'recording' UI phase: scanning, countdown, and recording all need frames
      if (uiPhase === 'recording') {
        const keypoints = convertMediapipeLandmarks(landmarkData);
        
        if (keypoints && keypoints.length > 0) {
          // P0.2: Pass native timestamp for precision
          jumpCamera.processFrame(keypoints, nativeTimestamp);
          
          // Throttled overlay update (~15fps for visual smoothness)
          overlayFrameCountRef.current++;
          if (overlayFrameCountRef.current % 2 === 0) {
            setOverlayKeypoints(keypoints);
          }
          
          // Log periodically during active processing
          if (frameCountRef.current % 60 === 0) {
            console.log(`[JUMP_CAMERA] Processing frame ${frameCountRef.current}, jumpPhase: ${jumpCamera.phase}`);
          }
        }
      }
    } catch (e) {
      if (__DEV__) {
        console.log('[JUMP_CAMERA] Frame processing error:', e);
      }
    } finally {
      isProcessingFrameRef.current = false;
    }
  }, [convertMediapipeLandmarks, uiPhase, jumpCamera, cameraReady, mediapipeReady, jumpEngineReady]);

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
  const handleSaveAssessment = useCallback(async () => {
    if (!jumpCamera.metrics) return;
    
    // PHASE 1A SAFETY: Use frozen athleteId, fallback to current
    const ownerAthleteId = recordingAthleteIdRef.current || athleteId;
    
    const isSlCmj = selectedProtocol === 'sl_cmj' || selectedProtocol === 'sl_cmj_left' || selectedProtocol === 'sl_cmj_right';
    const today = format(new Date(), 'yyyy-MM-dd');
    const assessmentDate = selectedDate || today;
    
    // SL-CMJ: Block save if incomplete data
    if (isSlCmj && (!jumpCamera.slCmjLeg1 || !jumpCamera.slCmjLeg2)) {
      Alert.alert(
        locale === 'pt' ? 'Dados Incompletos' : 'Incomplete Data',
        locale === 'pt' 
          ? 'Dois saltos nao foram detectados corretamente. Tente novamente.'
          : 'Both jumps were not detected correctly. Please try again.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    // SL-CMJ: Save BOTH legs as separate assessments
    if (isSlCmj && jumpCamera.slCmjLeg1 && jumpCamera.slCmjLeg2) {
      try {
        const leg1Protocol = jumpCamera.slCmjLeg1.leg === 'left' ? 'sl_cmj_left' : 'sl_cmj_right';
        const leg2Protocol = jumpCamera.slCmjLeg2.leg === 'left' ? 'sl_cmj_left' : 'sl_cmj_right';
        
        const [res1, res2] = await Promise.all([
          api.post('/jump/assessment', {
            athlete_id: ownerAthleteId,
            date: assessmentDate,
            protocol: leg1Protocol,
            flight_time_ms: jumpCamera.slCmjLeg1.metrics.flightTimeMs,
            contact_time_ms: 0,
            jump_height_cm: jumpCamera.slCmjLeg1.metrics.jumpHeightCm,
            time_to_takeoff_ms: jumpCamera.slCmjLeg1.metrics.eccentricDurationMs,
            notes: 'data_source: camera',
          }),
          api.post('/jump/assessment', {
            athlete_id: ownerAthleteId,
            date: assessmentDate,
            protocol: leg2Protocol,
            flight_time_ms: jumpCamera.slCmjLeg2.metrics.flightTimeMs,
            contact_time_ms: 0,
            jump_height_cm: jumpCamera.slCmjLeg2.metrics.jumpHeightCm,
            time_to_takeoff_ms: jumpCamera.slCmjLeg2.metrics.eccentricDurationMs,
            notes: 'data_source: camera',
          }),
        ]);
        
        queryClient.invalidateQueries({ queryKey: ['jump-analysis'] });
        queryClient.invalidateQueries({ queryKey: ['jump-assessments'] });
        queryClient.invalidateQueries({ queryKey: ['scientific-analysis'] });
        
        const r1 = res1.data?.calculations;
        const r2 = res2.data?.calculations;
        
        Alert.alert(
          locale === 'pt' ? 'SL-CMJ Salvo!' : 'SL-CMJ Saved!',
          locale === 'pt'
            ? `${jumpCamera.slCmjLeg1.leg === 'left' ? 'Esq' : 'Dir'}: ${r1?.jump_height_cm?.toFixed(1)} cm | RSImod: ${r1?.rsi?.toFixed(2)}\n${jumpCamera.slCmjLeg2.leg === 'left' ? 'Esq' : 'Dir'}: ${r2?.jump_height_cm?.toFixed(1)} cm | RSImod: ${r2?.rsi?.toFixed(2)}`
            : `${jumpCamera.slCmjLeg1.leg === 'left' ? 'L' : 'R'}: ${r1?.jump_height_cm?.toFixed(1)} cm | RSImod: ${r1?.rsi?.toFixed(2)}\n${jumpCamera.slCmjLeg2.leg === 'left' ? 'L' : 'R'}: ${r2?.jump_height_cm?.toFixed(1)} cm | RSImod: ${r2?.rsi?.toFixed(2)}`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } catch (error: any) {
        Alert.alert(
          locale === 'pt' ? 'Erro' : 'Error',
          error.response?.data?.detail || (locale === 'pt' ? 'Erro ao salvar SL-CMJ' : 'Error saving SL-CMJ')
        );
      }
      return;
    }
    
    // CMJ: Save single assessment with time_to_takeoff_ms
    submitMutation.mutate({
      athlete_id: ownerAthleteId,
      date: assessmentDate,
      protocol: selectedProtocol,
      flight_time_ms: jumpCamera.metrics.flightTimeMs,
      contact_time_ms: 0,
      jump_height_cm: jumpCamera.metrics.jumpHeightCm,
      time_to_takeoff_ms: jumpCamera.metrics.eccentricDurationMs || null,
      notes: `data_source: camera`,
    });
  }, [athleteId, selectedProtocol, selectedDate, jumpCamera.metrics, jumpCamera.slCmjLeg1, jumpCamera.slCmjLeg2, submitMutation, locale, queryClient, router]);

  // ============================================================
  // handleStartCamera - Initiates the progressive initialization
  // ============================================================
  // This function ONLY mounts the camera and changes UI phase
  // It does NOT start any processing - that happens progressively
  // through the three-stage pipeline in handleMediapipeLandmark
  const handleStartCamera = useCallback(() => {
    if (!permission?.granted) {
      requestPermission();
      return;
    }
    
    console.log('[JUMP_CAMERA] ========================================');
    console.log('[JUMP_CAMERA] handleStartCamera called');
    console.log('[JUMP_CAMERA] Resetting ALL pipeline states to false');
    console.log('[JUMP_CAMERA] ========================================');
    
    // Reset frame counter
    frameCountRef.current = 0;
    
    // CRITICAL: Reset ALL THREE pipeline states to false
    // This ensures progressive initialization starts fresh
    setCameraReady(false);
    setMediapipeReady(false);
    setJumpEngineReady(false);
    
    // STEP 1: Mount camera component (will trigger RNMediapipe to render)
    // The camera preview will appear, and onLandmark will start receiving frames
    setShouldMountCamera(true);
    
    // STEP 2: Change UI phase to camera preview
    // User will see camera preview and status indicators
    setUiPhase('cameraPreview');
    
    console.log('[JUMP_CAMERA] Camera mounting initiated');
    console.log('[JUMP_CAMERA] Waiting for STAGE 1: cameraReady...');
  }, [permission, requestPermission]);
  
  // ============================================================
  // handleStartRecording - Only allowed after ALL 3 stages complete
  // ============================================================
  // This function is called when user taps the PLAY button
  // It MUST verify all three pipeline stages are ready
  const handleStartRecording = useCallback(() => {
    // CRITICAL: All three pipeline stages MUST be ready
    if (!cameraReady) {
      console.log('[JUMP_CAMERA] Cannot start recording - camera not ready');
      return;
    }
    
    if (!mediapipeReady) {
      console.log('[JUMP_CAMERA] Cannot start recording - mediapipe not ready');
      return;
    }
    
    if (!jumpEngineReady && Platform.OS !== 'web') {
      console.log('[JUMP_CAMERA] Cannot start recording - engine not ready');
      console.log(`[JUMP_CAMERA] Pipeline state: camera=${cameraReady}, mediapipe=${mediapipeReady}, engine=${jumpEngineReady}`);
      return;
    }
    
    console.log('[JUMP_CAMERA] ========================================');
    console.log('[JUMP_CAMERA] All pipeline stages confirmed ready');
    console.log('[JUMP_CAMERA] Starting recording phase');
    console.log('[JUMP_CAMERA] ========================================');
    
    // PHASE 1A SAFETY: Freeze athleteId at recording start
    recordingAthleteIdRef.current = athleteId;
    console.log('[JUMP_CAMERA] FREEZE athleteId:', athleteId);
    
    setUiPhase('recording');
    jumpCamera.startCountdown();
  }, [cameraReady, mediapipeReady, jumpEngineReady, jumpCamera]);

  // ============================================================
  // handleBackFromCamera - Safe cleanup of all pipeline states
  // ============================================================
  const handleBackFromCamera = useCallback(() => {
    console.log('[JUMP_CAMERA] ========================================');
    console.log('[JUMP_CAMERA] Exiting camera view - cleaning up');
    console.log('[JUMP_CAMERA] ========================================');
    
    // Reset ALL pipeline states in reverse order
    setJumpEngineReady(false);
    setMediapipeReady(false);
    setCameraReady(false);
    
    // Unmount camera component
    setShouldMountCamera(false);
    
    // Reset frame counter
    frameCountRef.current = 0;
    
    // Reset jump camera hook
    jumpCamera.reset();
    
    // Return to protocol selection
    setUiPhase('protocol');
  }, [jumpCamera]);

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      console.log('[JUMP_CAMERA] Component unmounting - releasing all resources');
      // Reset all pipeline states
      setShouldMountCamera(false);
      setCameraReady(false);
      setMediapipeReady(false);
      setJumpEngineReady(false);
      isProcessingFrameRef.current = false;
      frameCountRef.current = 0;
    };
  }, []);

  // CRITICAL: Transition to results when analysis is complete
  // Must transition regardless of whether metrics exist (null = detection failed)
  // The results screen handles both success (metrics present) and error (metrics null)
  useEffect(() => {
    if (jumpCamera.phase === 'review') {
      console.log('[LOG_JUMP_RESULTS_SCREEN_OPENED] Transitioning to results screen');
      console.log('[JUMP_CAMERA] metrics=' + (jumpCamera.metrics ? 'YES' : 'NULL'));
      console.log('[JUMP_CAMERA] error=' + (jumpCamera.error || 'none'));
      setUiPhase('results');
    }
  }, [jumpCamera.phase]);

  // ============================================================
  // STAGE 3: Jump Engine Initialization (useEffect)
  // ============================================================
  // This effect ONLY runs after BOTH cameraReady AND mediapipeReady are true
  // It adds a stabilization delay before enabling frame processing
  // This ensures the camera and MediaPipe have fully initialized
  useEffect(() => {
    // Only proceed if camera AND mediapipe are confirmed ready
    if (!cameraReady || !mediapipeReady) {
      return;
    }
    
    // If engine is already ready, do nothing
    if (jumpEngineReady) {
      return;
    }
    
    console.log('[JUMP_CAMERA] ========================================');
    console.log('[JUMP_CAMERA] STAGE 3: Camera and MediaPipe confirmed ready');
    console.log('[JUMP_CAMERA] Starting engine initialization with 300ms delay...');
    console.log('[JUMP_CAMERA] ========================================');
    
    // Add stabilization delay before enabling engine
    // This gives RNMediapipe time to fully stabilize after first landmarks
    const timer = setTimeout(() => {
      console.log('[JUMP_CAMERA] ========================================');
      console.log('[JUMP_CAMERA] STAGE 3 COMPLETE: Jump engine ready');
      console.log('[JUMP_CAMERA] ALL SYSTEMS GO - Frame processing enabled');
      console.log('[JUMP_CAMERA] PLAY button will now be enabled');
      console.log('[JUMP_CAMERA] ========================================');
      setJumpEngineReady(true);
    }, 300); // 300ms delay for stability
    
    return () => clearTimeout(timer);
  }, [cameraReady, mediapipeReady, jumpEngineReady]);

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
            
            {/* Assessment Date */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {locale === 'pt' ? 'Data da Avaliacao' : 'Assessment Date'}
              </Text>
              <TextInput
                style={styles.input}
                value={selectedDate}
                onChangeText={setSelectedDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.text.tertiary}
                data-testid="assessment-date-input"
              />
              <Text style={{ fontSize: 10, color: colors.text.tertiary, marginTop: 2 }}>
                {locale === 'pt' ? 'Formato: AAAA-MM-DD (padrao: hoje)' : 'Format: YYYY-MM-DD (default: today)'}
              </Text>
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
          
          {/* SL-CMJ: Leg selection */}
          {(selectedProtocol === 'sl_cmj') && (
            <View style={styles.configCard} data-testid="leg-selection-card">
              <Text style={styles.configTitle}>{t.slcmjFirstLeg}</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                <TouchableOpacity
                  style={[
                    styles.legOption,
                    firstLeg === 'right' && styles.legOptionActive,
                  ]}
                  onPress={() => setFirstLeg('right')}
                  data-testid="leg-right-btn"
                >
                  <Text style={[
                    styles.legOptionText,
                    firstLeg === 'right' && styles.legOptionTextActive,
                  ]}>
                    {t.right}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.legOption,
                    firstLeg === 'left' && styles.legOptionActive,
                  ]}
                  onPress={() => setFirstLeg('left')}
                  data-testid="leg-left-btn"
                >
                  <Text style={[
                    styles.legOptionText,
                    firstLeg === 'left' && styles.legOptionTextActive,
                  ]}>
                    {t.left}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 8 }}>
                {locale === 'pt' 
                  ? `1o salto: ${firstLeg === 'right' ? 'PERNA DIREITA' : 'PERNA ESQUERDA'}\n2o salto: ${firstLeg === 'right' ? 'PERNA ESQUERDA' : 'PERNA DIREITA'}`
                  : `1st jump: ${firstLeg === 'right' ? 'RIGHT LEG' : 'LEFT LEG'}\n2nd jump: ${firstLeg === 'right' ? 'LEFT LEG' : 'RIGHT LEG'}`}
              </Text>
            </View>
          )}
          
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
                {(['cmj'] as JumpProtocol[]).map((protocol) => {
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

  // Camera Preview screen - Uses THREE-STAGE PIPELINE for safe initialization
  if (uiPhase === 'cameraPreview') {
    // Determine status text based on three-stage pipeline
    const getStatusText = () => {
      if (!cameraReady) {
        return t.initializingCamera;
      }
      if (!mediapipeReady) {
        return t.initializingMediapipe;
      }
      if (!jumpEngineReady) {
        return locale === 'pt' ? 'Inicializando engine...' : 'Initializing engine...';
      }
      return t.cameraReady;
    };
    
    // ALL THREE stages must be ready for processing
    const isReady = jumpEngineReady || Platform.OS === 'web';
    
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
        
        {/* Camera View - Mount when shouldMountCamera is true (LOCAL STATE) */}
        <View style={styles.cameraContainer}>
          {shouldMountCamera && Platform.OS !== 'web' && MEDIAPIPE_AVAILABLE ? (
            <View style={styles.camera}>
              <MediaPipeCamera
                style={StyleSheet.absoluteFill}
                onLandmark={handleMediapipeLandmark}
                cameraType="back"
                fps={30}
              />
            </View>
          ) : shouldMountCamera ? (
            // Fallback when MediaPipe not available
            <CameraView
              style={styles.camera}
              facing="back"
              onCameraReady={() => {
                setCameraReady(true);
                // For web/fallback, manually mark all stages ready
                setTimeout(() => {
                  setMediapipeReady(true);
                  setJumpEngineReady(true);
                }, 100);
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
              
              {/* Debug info - Three-stage pipeline status */}
              {__DEV__ && (
                <Text style={styles.debugText}>
                  Cam: {cameraReady ? '✓' : '○'} | MP: {mediapipeReady ? '✓' : '○'} | Eng: {jumpEngineReady ? '✓' : '○'}
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
              // Reset pipeline states but keep camera mounted
              setCameraReady(false);
              setMediapipeReady(false);
              setJumpEngineReady(false);
              jumpCamera.reset();
              frameCountRef.current = 0;
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
          {shouldMountCamera && Platform.OS !== 'web' && MEDIAPIPE_AVAILABLE ? (
            <View style={styles.camera}>
              <MediaPipeCamera
                style={StyleSheet.absoluteFill}
                onLandmark={handleMediapipeLandmark}
                cameraType="back"
                fps={30}
              />
            </View>
          ) : shouldMountCamera ? (
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
            {/* P1.1: OverlayLayer — visual skeleton, dots, scan line (isolated, read-only) */}
            <OverlayLayer
              keypoints={overlayKeypoints}
              phase={jumpCamera.phase}
              scannerPhase={jumpCamera.scannerState.phase}
              groundLevel={jumpCamera.groundCalibration.groundLevel}
              confidenceScore={jumpCamera.scannerState.confidenceScore}
              orientationValid={jumpCamera.orientationResult.isValid}
              showSkeleton={jumpCamera.phase === 'scanning' || jumpCamera.phase === 'countdown'}
            />
            
            {/* Scanner Overlay (text/bars/buttons) */}
            {(jumpCamera.phase === 'scanning') && (
              <View style={styles.scannerOverlay} data-testid="scanner-overlay">
                {/* Scanner animated bar */}
                <View style={styles.scannerBarContainer}>
                  <View 
                    style={[
                      styles.scannerBar,
                      { 
                        width: `${jumpCamera.scannerState.progress}%`,
                        backgroundColor: jumpCamera.scannerState.phase === 'blocked' 
                          ? '#ef4444' 
                          : jumpCamera.scannerState.confidenceScore >= 0.80 
                            ? '#22c55e' 
                            : jumpCamera.scannerState.confidenceScore >= 0.65 
                              ? '#eab308' 
                              : '#3b82f6',
                      }
                    ]} 
                  />
                </View>
                
                {/* Scanner status text */}
                <View style={styles.scannerStatusContainer}>
                  {jumpCamera.scannerState.phase === 'collecting' && (
                    <>
                      <ActivityIndicator size="small" color="#3b82f6" />
                      <Text style={styles.scannerStatusText}>{t.scannerCollecting}</Text>
                      <Text style={styles.scannerHintText}>{t.scannerStandStill}</Text>
                    </>
                  )}
                  {jumpCamera.scannerState.phase === 'analyzing' && (
                    <>
                      <ActivityIndicator size="small" color="#eab308" />
                      <Text style={styles.scannerStatusText}>{t.scannerAnalyzing}</Text>
                    </>
                  )}
                  {jumpCamera.scannerState.phase === 'ready' && (
                    <>
                      <Ionicons name="checkmark-circle" size={36} color="#eab308" />
                      <Text style={[styles.scannerStatusText, { color: '#eab308' }]}>
                        {t.scannerConfidence}: {Math.round(jumpCamera.scannerState.confidenceScore * 100)}%
                      </Text>
                      <Text style={styles.scannerHintText}>
                        {jumpCamera.scannerState.warningMessage}
                      </Text>
                      {jumpCamera.scannerState.showContinueButton && (
                        <TouchableOpacity 
                          style={[styles.scannerRetryButton, { backgroundColor: '#eab308' }]}
                          onPress={jumpCamera.confirmContinue}
                          data-testid="scanner-continue-btn"
                        >
                          <Text style={styles.scannerRetryText}>{t.scannerContinueAnyway}</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                  {jumpCamera.scannerState.phase === 'blocked' && (
                    <>
                      <Ionicons name="alert-circle" size={36} color="#ef4444" />
                      <Text style={[styles.scannerStatusText, { color: '#ef4444' }]}>{t.scannerBlocked}</Text>
                      <Text style={styles.scannerHintText}>
                        {jumpCamera.scannerState.warningMessage || t.scannerAdjustPosition}
                      </Text>
                      <TouchableOpacity 
                        style={styles.scannerRetryButton}
                        onPress={jumpCamera.retryCalibration}
                        data-testid="scanner-retry-btn"
                      >
                        <Text style={styles.scannerRetryText}>{t.scannerRetry}</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
                
                {/* Confidence score display */}
                {jumpCamera.scannerState.confidenceScore > 0 && jumpCamera.scannerState.phase !== 'ready' && (
                  <View style={styles.scannerScoreContainer}>
                    <Text style={[
                      styles.scannerScoreText,
                      { 
                        color: jumpCamera.scannerState.confidenceScore >= 0.80 
                          ? '#22c55e' 
                          : jumpCamera.scannerState.confidenceScore >= 0.65 
                            ? '#eab308' 
                            : '#ef4444' 
                      }
                    ]}>
                      {t.scannerConfidence}: {Math.round(jumpCamera.scannerState.confidenceScore * 100)}%
                    </Text>
                  </View>
                )}
                
                {/* Warning message */}
                {jumpCamera.scannerState.warningMessage && jumpCamera.scannerState.phase !== 'ready' && jumpCamera.scannerState.phase !== 'blocked' && (
                  <View style={styles.scannerWarning}>
                    <Text style={styles.scannerWarningText}>{jumpCamera.scannerState.warningMessage}</Text>
                  </View>
                )}
              </View>
            )}
            
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
                {/* P1: Confidence score — top center, discrete */}
                {jumpCamera.scannerState.confidenceScore > 0 && (
                  <View style={[styles.confidenceBadgeTopCenter, { position: 'relative', marginTop: 8, alignSelf: 'center' }]} data-testid="confidence-badge-countdown">
                    <Text style={[styles.confidenceBadgeTopText, {
                      color: jumpCamera.scannerState.confidenceScore >= 0.80 ? '#22c55e' 
                        : jumpCamera.scannerState.confidenceScore >= 0.65 ? '#eab308' : '#ef4444',
                    }]}>
                      {t.scannerConfidence}: {Math.round(jumpCamera.scannerState.confidenceScore * 100)}%
                    </Text>
                  </View>
                )}
                {/* Show scanner warning during countdown if confidence was marginal */}
                {jumpCamera.scannerState.warningMessage && jumpCamera.scannerState.phase === 'countdown' && (
                  <View style={styles.scannerWarning}>
                    <Text style={styles.scannerWarningText}>{jumpCamera.scannerState.warningMessage}</Text>
                  </View>
                )}
              </View>
            )}
            
            {/* Recording - clean overlay with graph (CMJ) or feedback (SL-CMJ) */}
            {jumpCamera.phase === 'recording' && (
              <View style={styles.recordingOverlay}>
                {/* Recording badge */}
                <View style={styles.recordingBadge}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>{t.jumpNow}</Text>
                </View>
                
                {/* CMJ: Jump displacement graph */}
                {isCmjProtocol && (
                  <View style={styles.jumpGraphContainer} data-testid="jump-graph-overlay">
                    <JumpGraph
                      points={[...hipYHistoryRef.current]}
                      baseline={jumpCamera.groundCalibration?.standingHipY ?? 0}
                      eccentricMs={jumpCamera.liveMetrics.eccentricTimeMs}
                      flightMs={jumpCamera.liveMetrics.flightTimeMs}
                      width={260}
                      height={90}
                    />
                  </View>
                )}
                
                {/* SL-CMJ: Real-time feedback during continuous recording */}
                {(selectedProtocol === 'sl_cmj' || selectedProtocol === 'sl_cmj_left' || selectedProtocol === 'sl_cmj_right') && (
                  <View style={styles.slcmjFeedback} data-testid="slcmj-feedback">
                    {jumpCamera.slcmjRecordingState === 'waiting_first' && (
                      <Text style={styles.slcmjFeedbackText}>
                        {locale === 'pt' ? 'Aguardando salto 1...' : 'Waiting for jump 1...'}
                      </Text>
                    )}
                    {jumpCamera.slcmjRecordingState === 'first_detected' && (
                      <Text style={[styles.slcmjFeedbackText, { color: '#22c55e' }]}>
                        {t.slcmjJump1Detected} ({firstLeg === 'right' ? t.right : t.left})
                        {'\n'}{t.slcmjPrepareSecond} ({firstLeg === 'right' ? t.left : t.right})
                      </Text>
                    )}
                    {jumpCamera.slcmjRecordingState === 'waiting_second_grounded' && (
                      <Text style={[styles.slcmjFeedbackText, { color: '#eab308' }]}>
                        {locale === 'pt' ? 'Posicione a perna ' : 'Position leg '}
                        ({firstLeg === 'right' ? t.left : t.right})
                        {locale === 'pt' ? ' no chao...' : ' on ground...'}
                      </Text>
                    )}
                    {jumpCamera.slcmjRecordingState === 'waiting_second' && (
                      <Text style={[styles.slcmjFeedbackText, { color: '#eab308' }]}>
                        {locale === 'pt' ? 'Aguardando salto 2...' : 'Waiting for jump 2...'}
                      </Text>
                    )}
                    {jumpCamera.slcmjRecordingState === 'completed' && (
                      <Text style={[styles.slcmjFeedbackText, { color: '#22c55e' }]}>
                        {t.slcmjJump2Detected}
                        {'\n'}{t.slcmjProcessing}
                      </Text>
                    )}
                  </View>
                )}
                
                {/* Active leg — SL-CMJ only */}
                {jumpCamera.activeLeg && !isCmjProtocol && (
                  <Text style={styles.activeLegText}>
                    {t.activeLeg}: {jumpCamera.activeLeg === 'left' ? t.left : t.right}
                  </Text>
                )}
              </View>
            )}
            
            {/* Between Jumps (SL-CMJ) */}
            {jumpCamera.phase === 'between_jumps' && (
              <View style={styles.betweenJumpsOverlay}>
                <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
                <Text style={styles.betweenJumpsTitle}>{t.leg1Complete}</Text>
                <Text style={styles.betweenJumpsSubtitle}>{t.switchLeg}</Text>
                <Text style={styles.betweenJumpsCountdown}>{t.betweenJumps}</Text>
                <ActivityIndicator size="small" color={colors.accent.primary} style={{ marginTop: 12 }} />
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
                setShouldMountCamera(false);
                setCameraReady(false);
                setMediapipeReady(false);
                setJumpEngineReady(false);
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
                <Text style={styles.protocolBadge}>
                  {JUMP_PROTOCOL_INFO[selectedProtocol]?.[locale === 'pt' ? 'namePt' : 'name'] || selectedProtocol.toUpperCase()}
                </Text>
              </View>
              
              {/* Primary Metrics Cards */}
              <View style={styles.metricsGrid}>
                <View style={[styles.metricCard, styles.metricCardHighlight]} data-testid="metric-jump-height">
                  <Text style={styles.metricValueLarge}>
                    {jumpCamera.metrics.jumpHeightCm.toFixed(1)}
                  </Text>
                  <Text style={styles.metricLabel}>{t.jumpHeight} (cm)</Text>
                </View>
                
                <View style={styles.metricCard} data-testid="metric-flight-time">
                  <Text style={styles.metricValue}>
                    {jumpCamera.metrics.flightTimeMs.toFixed(0)}
                  </Text>
                  <Text style={styles.metricLabel}>{t.flightTime} (ms)</Text>
                </View>
                
              </View>
              
              {/* Secondary Metrics */}
              <View style={styles.metricsGrid}>
                {jumpCamera.metrics.eccentricDurationMs > 0 && (
                  <View style={styles.metricCard} data-testid="metric-eccentric-time">
                    <Text style={styles.metricValue}>
                      {jumpCamera.metrics.eccentricDurationMs.toFixed(0)}
                    </Text>
                    <Text style={styles.metricLabel}>{t.eccentricTime} (ms)</Text>
                  </View>
                )}
                
                {jumpCamera.metrics.rsiMod > 0 && (
                  <View style={styles.metricCard} data-testid="metric-rsi-mod">
                    <Text style={styles.metricValue}>
                      {jumpCamera.metrics.rsiMod.toFixed(2)}
                    </Text>
                    <Text style={styles.metricLabel}>{t.rsiMod}</Text>
                  </View>
                )}
                
                <View style={styles.metricCard} data-testid="metric-takeoff-velocity">
                  <Text style={styles.metricValue}>
                    {jumpCamera.metrics.takeoffVelocityMs.toFixed(2)}
                  </Text>
                  <Text style={styles.metricLabel}>{t.takeoffVelocity} (m/s)</Text>
                </View>
              </View>
              
              {/* SL-CMJ Dual Jump Results */}
              {jumpCamera.slCmjLeg1 && jumpCamera.slCmjLeg2 && (
                <View style={styles.dualJumpCard} data-testid="sl-cmj-dual-results">
                  <Text style={styles.dualJumpTitle}>
                    {locale === 'pt' ? 'Comparacao Bilateral' : 'Bilateral Comparison'}
                  </Text>
                  <View style={styles.dualJumpRow}>
                    <View style={styles.dualJumpLeg}>
                      <Text style={styles.dualJumpLegLabel}>
                        {jumpCamera.slCmjLeg1.leg === 'left' ? t.left : t.right}
                      </Text>
                      <Text style={styles.dualJumpLegValue}>
                        {jumpCamera.slCmjLeg1.metrics.jumpHeightCm.toFixed(1)} cm
                      </Text>
                    </View>
                    <View style={styles.dualJumpLeg}>
                      <Text style={styles.dualJumpLegLabel}>
                        {jumpCamera.slCmjLeg2.leg === 'left' ? t.left : t.right}
                      </Text>
                      <Text style={styles.dualJumpLegValue}>
                        {jumpCamera.slCmjLeg2.metrics.jumpHeightCm.toFixed(1)} cm
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.dualJumpAsymmetry}>
                    {locale === 'pt' ? 'Assimetria' : 'Asymmetry'}: {
                      Math.abs(
                        ((jumpCamera.slCmjLeg1.metrics.jumpHeightCm - jumpCamera.slCmjLeg2.metrics.jumpHeightCm) /
                        Math.max(jumpCamera.slCmjLeg1.metrics.jumpHeightCm, jumpCamera.slCmjLeg2.metrics.jumpHeightCm)) * 100
                      ).toFixed(1)
                    }%
                  </Text>
                </View>
              )}
              
              {/* Info Text */}
              <View style={styles.infoCard}>
                <Ionicons name="information-circle" size={20} color={colors.text.secondary} />
                <Text style={styles.infoText}>
                  {locale === 'pt' 
                    ? 'Os calculos de RSI, Potencia e outros indicadores serao feitos automaticamente ao salvar.'
                    : 'RSI, Power, and other metrics will be calculated automatically when you save.'}
                </Text>
              </View>
              
              {/* Scientific Details button */}
              <TouchableOpacity
                style={styles.scientificDetailsButton}
                onPress={() => {
                  // Navigate to scientific analysis for this athlete
                  router.push(`/athlete/${athleteId}` as any);
                }}
                data-testid="scientific-details-btn"
              >
                <Ionicons name="analytics" size={18} color={colors.accent.primary} />
                <Text style={styles.scientificDetailsText}>{t.scientificDetails}</Text>
              </TouchableOpacity>
              
              {/* Action Buttons */}
              <TouchableOpacity
                style={[styles.saveButton, !!jumpCamera.error && { opacity: 0.5 }]}
                onPress={handleSaveAssessment}
                disabled={submitMutation.isPending || !!jumpCamera.error}
                data-testid="save-assessment-btn"
              >
                <LinearGradient colors={['#8b5cf6', '#6d28d9']} style={styles.saveButtonGradient}>
                  {submitMutation.isPending ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="save" size={20} color="#ffffff" />
                      <Text style={styles.saveButtonText}>{t.saveTest}</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.tryAgainButton}
                onPress={() => {
                  setCameraReady(false);
                  setMediapipeReady(false);
                  setJumpEngineReady(false);
                  jumpCamera.reset();
                  frameCountRef.current = 0;
                  setUiPhase('cameraPreview');
                }}
                data-testid="repeat-test-btn"
              >
                <Ionicons name="refresh" size={20} color={colors.text.secondary} />
                <Text style={styles.tryAgainText}>{t.repeatTest}</Text>
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
                  // Reset pipeline states but keep camera mounted
                  setCameraReady(false);
                  setMediapipeReady(false);
                  setJumpEngineReady(false);
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
  // Scanner styles (Parte 5)
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  scannerGroundLine: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.8,
  },
  scannerBarContainer: {
    width: 240,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    overflow: 'hidden' as const,
    marginBottom: 16,
  },
  scannerBar: {
    height: '100%' as const,
    borderRadius: 3,
  },
  scannerStatusContainer: {
    alignItems: 'center' as const,
    gap: 8,
  },
  scannerStatusText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  scannerHintText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center' as const,
  },
  scannerRetryButton: {
    marginTop: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  scannerRetryText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#ffffff',
  },
  scannerScoreContainer: {
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 8,
  },
  scannerScoreText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  scannerWarning: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(234, 179, 8, 0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.4)',
  },
  scannerWarningText: {
    fontSize: 12,
    color: '#eab308',
    textAlign: 'center' as const,
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
  // Live metrics panel during recording
  liveMetricsPanel: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  liveMetricItem: {
    alignItems: 'center',
  },
  liveMetricLabel: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  liveMetricValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#22c55e',
  },
  // Between jumps overlay (SL-CMJ)
  betweenJumpsOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingVertical: 32,
    paddingHorizontal: 40,
    borderRadius: 20,
  },
  betweenJumpsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#22c55e',
    marginTop: 12,
  },
  betweenJumpsSubtitle: {
    fontSize: 16,
    color: '#ffffff',
    marginTop: 8,
  },
  betweenJumpsCountdown: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 8,
  },
  // Enhanced results
  protocolBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(34, 197, 94, 0.8)',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  metricCardHighlight: {
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
  },
  metricValueLarge: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#8b5cf6',
  },
  // SL-CMJ dual jump results
  dualJumpCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  dualJumpTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent.primary,
    marginBottom: 12,
    textAlign: 'center',
  },
  dualJumpRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  dualJumpLeg: {
    alignItems: 'center',
  },
  dualJumpLegLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  dualJumpLegValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  dualJumpAsymmetry: {
    fontSize: 13,
    color: '#f59e0b',
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
  },
  // Confidence badge (visible during countdown + recording)
  confidenceBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: 'flex-end',
    position: 'absolute',
    top: 8,
    right: 8,
  },
  confidenceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  // Confidence badge — top center, discrete
  confidenceBadgeTopCenter: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    zIndex: 10,
  },
  confidenceBadgeTopText: {
    fontSize: 10,
    fontWeight: '600',
  },
  // Jump graph container (CMJ recording overlay)
  jumpGraphContainer: {
    marginTop: 8,
    alignItems: 'center',
  },
  // SL-CMJ leg selection
  legOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    alignItems: 'center',
  },
  legOptionActive: {
    borderColor: '#8b5cf6',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  legOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  legOptionTextActive: {
    color: '#8b5cf6',
  },
  // SL-CMJ real-time feedback
  slcmjFeedback: {
    marginTop: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  slcmjFeedbackText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  // Scientific details button
  scientificDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    borderRadius: 10,
  },
  scientificDetailsText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent.primary,
  },
});
