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
  PanResponder,
  Animated,
  Easing,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../../services/api';
import { colors } from '../../../constants/theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import { 
  useProtectedBarTracking, 
  RECOMMENDED_TRACKING_POINTS,
  EXERCISE_KEYPOINTS,
  vbtDiagnostics,
  getBlockingDiagnosis,
} from '../../../services/vbt';
import { 
  LANDMARK_INDEX_TO_VBT_NAME,
  ProcessedKeypoint,
  VBTPoseData,
} from '../../../services/pose';
import VBTDiagnosticOverlay from '../../../components/vbt/VBTDiagnosticOverlay';

// Conditional import for native MediaPipe
// @thinksys/react-native-mediapipe exports RNMediapipe component with onLandmark callback
// Also exports switchCamera function to toggle between front/back cameras
// IMPORTANT: This ONLY works in Development Build or EAS Build, NOT in Expo Go
let RNMediapipe: any = null;
let switchCamera: (() => void) | null = null;
let MEDIAPIPE_AVAILABLE = false;

if (Platform.OS !== 'web') {
  try {
    const mediapipe = require('@thinksys/react-native-mediapipe');
    RNMediapipe = mediapipe.RNMediapipe;
    switchCamera = mediapipe.switchCamera;
    MEDIAPIPE_AVAILABLE = !!RNMediapipe;
    console.log('[VBT_CAMERA] ✅ MediaPipe loaded successfully');
    console.log('[VBT_CAMERA] RNMediapipe component:', RNMediapipe ? 'AVAILABLE' : 'NOT FOUND');
    console.log('[VBT_CAMERA] switchCamera function:', switchCamera ? 'AVAILABLE' : 'NOT FOUND');
  } catch (e) {
    console.warn('[VBT_CAMERA] ⚠️ MediaPipe not available:', e);
    console.warn('[VBT_CAMERA] Make sure you are using Development Build or EAS Build, NOT Expo Go');
  }
} else {
  console.log('[VBT_CAMERA] Web platform detected - using expo-camera fallback');
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const GRAVITY = 9.81;

// Tutorial storage key
const TUTORIAL_COMPLETED_KEY = '@vbt_camera_tutorial_completed';

// Tutorial steps
type TutorialStep = 'welcome' | 'selectPoint' | 'pointSelected' | 'trackingStatus' | 'complete';

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
  
  // State for coach marker (direct touch on screen)
  const [coachMarkerPosition, setCoachMarkerPosition] = useState<{x: number, y: number} | null>(null);
  const [showMarkerInstruction, setShowMarkerInstruction] = useState(true);
  const markerAnimation = useRef(new Animated.Value(0)).current;
  
  // State for pose detection even before tracking (for stabilization preview)
  const [previewPoseData, setPreviewPoseData] = useState<VBTPoseData | null>(null);
  const [detectedKeypoints, setDetectedKeypoints] = useState<Map<string, {x: number, y: number, score: number}>>(new Map());

  // Tutorial state
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>('welcome');
  const [tutorialChecked, setTutorialChecked] = useState(false);
  const [selectionFeedback, setSelectionFeedback] = useState<{type: 'success' | 'error', message: string, position?: {x: number, y: number}} | null>(null);
  
  // Diagnostic overlay state - Enable for debugging pipeline blockers
  const [showDiagnosticOverlay, setShowDiagnosticOverlay] = useState<boolean>(true);
  
  // Camera facing control - EXPLICIT CONTROL
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('back');
  
  // Log camera state on mount and changes
  useEffect(() => {
    console.log("[VBT_CAMERA] Current camera facing:", cameraFacing);
  }, [cameraFacing]);
  
  // Toggle camera function - SYNCHRONIZED STATE + NATIVE CALL
  const toggleCamera = useCallback(() => {
    setCameraFacing(prev => {
      const next = prev === 'back' ? 'front' : 'back';
      
      // Call native switchCamera in sync with state update
      if (Platform.OS !== 'web' && switchCamera) {
        try {
          switchCamera();
        } catch (e) {
          console.warn("[VBT_CAMERA] switchCamera failed:", e);
        }
      }
      
      console.log("[VBT_CAMERA] Camera switched to:", next);
      
      return next;
    });
  }, []);
  
  // Tutorial animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const feedbackFadeAnim = useRef(new Animated.Value(0)).current;
  
  // Check if tutorial should show (first time user)
  useEffect(() => {
    const checkTutorialStatus = async () => {
      try {
        const completed = await AsyncStorage.getItem(TUTORIAL_COMPLETED_KEY);
        if (!completed && phase === 'pointSelection' && !tutorialChecked) {
          setShowTutorial(true);
          setTutorialStep('welcome');
          // Start pulse animation
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulseAnim, {
                toValue: 1.3,
                duration: 800,
                easing: Easing.ease,
                useNativeDriver: true,
              }),
              Animated.timing(pulseAnim, {
                toValue: 1,
                duration: 800,
                easing: Easing.ease,
                useNativeDriver: true,
              }),
            ])
          ).start();
          // Fade in tutorial
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }).start();
        }
        setTutorialChecked(true);
      } catch (e) {
        console.warn('[VBTCamera] Error checking tutorial status:', e);
        setTutorialChecked(true);
      }
    };
    
    if (phase === 'pointSelection' && !tutorialChecked) {
      checkTutorialStatus();
    }
  }, [phase, tutorialChecked]);
  
  // Skip tutorial
  const handleSkipTutorial = useCallback(async () => {
    try {
      await AsyncStorage.setItem(TUTORIAL_COMPLETED_KEY, 'true');
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setShowTutorial(false);
      });
    } catch (e) {
      console.warn('[VBTCamera] Error saving tutorial status:', e);
      setShowTutorial(false);
    }
  }, [fadeAnim]);
  
  // Complete tutorial
  const handleCompleteTutorial = useCallback(async () => {
    try {
      await AsyncStorage.setItem(TUTORIAL_COMPLETED_KEY, 'true');
      setTutorialStep('complete');
      setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => {
          setShowTutorial(false);
        });
      }, 1500);
    } catch (e) {
      console.warn('[VBTCamera] Error completing tutorial:', e);
      setShowTutorial(false);
    }
  }, [fadeAnim]);
  
  // Show selection feedback
  const showSelectionFeedback = useCallback((type: 'success' | 'error', message: string, position?: {x: number, y: number}) => {
    setSelectionFeedback({ type, message, position });
    feedbackFadeAnim.setValue(1);
    
    // Animate feedback out after delay
    setTimeout(() => {
      Animated.timing(feedbackFadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        setSelectionFeedback(null);
      });
    }, 2000);
  }, [feedbackFadeAnim]);

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
    const detectedKps = new Map<string, {x: number, y: number, score: number}>();
    
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
        
        // Store for visual overlay
        detectedKps.set(name as string, { x, y, score });
        
        if (shouldLog && name === 'left_hip') {
          console.log(`[VBTCamera] ${name}: x=${x.toFixed(3)}, y=${y.toFixed(3)}, score=${score.toFixed(2)}`);
        }
      }
    }
    
    // Update detected keypoints state for UI overlay
    setDetectedKeypoints(detectedKps);
    
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

  // Frame counter for detecting if onLandmark is being called
  const landmarkCallCountRef = useRef(0);
  const lastLandmarkLogTimeRef = useRef(Date.now());
  
  // Log frame reception rate every 5 seconds
  useEffect(() => {
    const logInterval = setInterval(() => {
      const now = Date.now();
      const elapsedSec = (now - lastLandmarkLogTimeRef.current) / 1000;
      const fps = landmarkCallCountRef.current / elapsedSec;
      
      if (shouldMountCamera) {
        console.log(`[VBT_CAMERA] 📊 Frame Reception Rate: ${fps.toFixed(1)} FPS (${landmarkCallCountRef.current} frames in ${elapsedSec.toFixed(1)}s)`);
        
        if (landmarkCallCountRef.current === 0) {
          console.warn('[VBT_CAMERA] ⚠️ NO FRAMES RECEIVED! Possible causes:');
          console.warn('[VBT_CAMERA]   1. Using Expo Go instead of Development Build');
          console.warn('[VBT_CAMERA]   2. MediaPipe native module not linked');
          console.warn('[VBT_CAMERA]   3. Camera permissions not granted');
          console.warn('[VBT_CAMERA]   4. Camera isActive is false');
        }
      }
      
      landmarkCallCountRef.current = 0;
      lastLandmarkLogTimeRef.current = now;
    }, 5000);
    
    return () => clearInterval(logInterval);
  }, [shouldMountCamera]);

  // Handle REAL pose detection from native MediaPipe (@thinksys/react-native-mediapipe)
  // This is called via onLandmark prop - processes BOTH during tracking AND point selection
  // IMPORTANT: This callback WILL NOT be called in Expo Go - only in Development/EAS builds
  const handleMediapipeLandmark = useCallback((event: any) => {
    // Increment frame counter
    landmarkCallCountRef.current++;
    
    try {
      // @thinksys/react-native-mediapipe passes data directly or via nativeEvent
      const landmarkData = event?.nativeEvent || event;
      
      // Log first frame received
      if (landmarkCallCountRef.current === 1) {
        console.log('[VBT_CAMERA] ✅ FIRST FRAME RECEIVED! MediaPipe is working.');
        console.log('[VBT_CAMERA] Raw event type:', typeof event);
        console.log('[VBT_CAMERA] Has nativeEvent:', !!event?.nativeEvent);
      }
      
      const vbtPose = convertMediapipeLandmarks(landmarkData);
      
      // Store preview pose data for stabilization visualization
      setPreviewPoseData(vbtPose);
      
      // If tracking is active, send to VBT pipeline
      if (isTracking) {
        if (vbtPose && vbtPose.keypoints.length > 0) {
          // Pass REAL pose data to the VBT pipeline
          processPose(vbtPose);
          
          // Log every 30 frames to avoid spam
          if (landmarkCallCountRef.current % 30 === 0) {
            console.log('[VBT_CAMERA] Frame processed: state=' + protectionState + ', stable=' + isStable + ', canCalc=' + canCalculate);
          }
        } else {
          // No pose detected - pass empty pose to trigger no-human state
          processPose({ keypoints: [], timestamp: Date.now() });
        }
      }
    } catch (e) {
      console.error('[VBT_CAMERA] Error processing MediaPipe landmark:', e);
    }
  }, [isTracking, convertMediapipeLandmarks, processPose, protectionState, isStable, canCalculate]);

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
    setCoachMarkerPosition(null); // Clear visual marker
    setShowMarkerInstruction(false);
    
    // Animate marker
    Animated.sequence([
      Animated.timing(markerAnimation, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(markerAnimation, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
    
    console.log('[VBTCamera] Coach selected keypoint from list:', keypointName);
  }, [setTrackingPoint, markerAnimation]);

  // Handle coach marker tap directly on screen - finds nearest detected keypoint
  const handleScreenTapForMarker = useCallback((event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    const { width, height } = Dimensions.get('window');
    
    // Convert to normalized coordinates (0-1)
    const normalizedX = locationX / width;
    const normalizedY = locationY / height;
    
    console.log('[VBTCamera] Coach tap at screen: x=' + normalizedX.toFixed(3) + ', y=' + normalizedY.toFixed(3));
    
    // Get exercise-relevant keypoints
    const relevantKeypoints = EXERCISE_KEYPOINTS[selectedExercise] || [];
    
    // Find the nearest detected keypoint to the tap position
    let nearestKeypoint: string | null = null;
    let minDistance = Infinity;
    
    detectedKeypoints.forEach((pos, name) => {
      // Only consider exercise-relevant keypoints
      if (relevantKeypoints.includes(name)) {
        const distance = Math.sqrt(
          Math.pow(pos.x - normalizedX, 2) + Math.pow(pos.y - normalizedY, 2)
        );
        
        if (distance < minDistance && pos.score >= 0.5) {
          minDistance = distance;
          nearestKeypoint = name;
        }
      }
    });
    
    // If a keypoint is found within reasonable distance (0.15 = 15% of screen)
    if (nearestKeypoint && minDistance < 0.15) {
      console.log('[VBTCamera] Nearest keypoint to tap: ' + nearestKeypoint + ' (distance: ' + minDistance.toFixed(3) + ')');
      
      // Set visual marker position
      setCoachMarkerPosition({ x: locationX, y: locationY });
      
      // Set as tracking point
      setTrackingPoint(normalizedX, normalizedY, nearestKeypoint);
      setShowMarkerInstruction(false);
      
      // Show success feedback
      showSelectionFeedback(
        'success',
        locale === 'pt' ? 'Ponto selecionado!' : 'Point selected!',
        { x: locationX, y: locationY }
      );
      
      // Advance tutorial if active
      if (showTutorial && tutorialStep === 'welcome') {
        setTutorialStep('pointSelected');
        setTimeout(() => {
          setTutorialStep('trackingStatus');
        }, 2000);
      }
      
      // Animate marker
      Animated.sequence([
        Animated.timing(markerAnimation, {
          toValue: 1.2,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(markerAnimation, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (detectedKeypoints.size === 0) {
      // Show error feedback
      showSelectionFeedback(
        'error',
        locale === 'pt' ? 'Nenhuma pose detectada. Aguarde...' : 'No pose detected. Please wait...'
      );
    } else {
      // Show feedback that tap was too far from any keypoint
      showSelectionFeedback(
        'error',
        locale === 'pt' 
          ? 'Toque mais próximo de uma articulação visível' 
          : 'Tap closer to a visible joint'
      );
    }
  }, [detectedKeypoints, selectedExercise, setTrackingPoint, locale, markerAnimation, showTutorial, tutorialStep, showSelectionFeedback]);

  // Function to change tracking point during session
  const handleChangeTrackingPoint = useCallback(() => {
    clearTrackingPoint();
    setCoachMarkerPosition(null);
    setShowMarkerInstruction(true);
    console.log('[VBTCamera] Coach cleared tracking point for re-selection');
  }, [clearTrackingPoint]);

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
        
        {/* Camera Toggle Button - Only show during camera phases */}
        {(phase === 'pointSelection' || phase === 'recording') ? (
          <TouchableOpacity 
            onPress={toggleCamera}
            style={styles.cameraToggleButton}
            data-testid="camera-toggle-btn"
            disabled={isTracking} // Disable during active recording
          >
            <Ionicons 
              name={cameraFacing === 'back' ? 'camera-reverse-outline' : 'camera-reverse'} 
              size={24} 
              color={isTracking ? colors.text.tertiary : colors.text.primary} 
            />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
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
              Platform.OS !== 'web' && RNMediapipe ? (
                /* Native platform: Use RNMediapipe for real-time pose detection */
                <View style={styles.camera}>
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
                  
                  {/* Touchable overlay for coach marker */}
                  <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    onPress={handleScreenTapForMarker}
                    activeOpacity={1}
                  >
                    {/* Overlay for point selection */}
                    <View style={styles.pointSelectionOverlay}>
                      {/* Instructions Banner */}
                      {showMarkerInstruction && (
                        <View style={styles.pointInstructionsBanner}>
                          <Ionicons name="hand-left" size={20} color="#ffffff" />
                          <Text style={styles.pointInstructionsText}>
                            {locale === 'pt' 
                              ? 'Toque no ponto do corpo que deseja rastrear' 
                              : 'Tap on the body point you want to track'}
                          </Text>
                        </View>
                      )}
                      
                      {/* Detected keypoints visualization */}
                      {Array.from(detectedKeypoints.entries()).map(([name, pos]) => {
                        if (!exerciseKeypoints.includes(name)) return null;
                        return (
                          <View
                            key={name}
                            style={[
                              styles.keypointDot,
                              {
                                left: `${pos.x * 100}%`,
                                top: `${pos.y * 100}%`,
                                backgroundColor: pos.score >= 0.6 ? '#10b981' : '#f59e0b',
                                borderColor: trackingPoint?.keypointName === name ? '#ffffff' : 'transparent',
                                borderWidth: trackingPoint?.keypointName === name ? 3 : 0,
                              },
                            ]}
                          >
                            {trackingPoint?.keypointName === name && (
                              <View style={styles.keypointDotInner} />
                            )}
                          </View>
                        );
                      })}
                      
                      {/* Coach marker position indicator */}
                      {coachMarkerPosition && (
                        <Animated.View
                          style={[
                            styles.coachMarker,
                            {
                              left: coachMarkerPosition.x - 25,
                              top: coachMarkerPosition.y - 25,
                              transform: [{ scale: markerAnimation }],
                            },
                          ]}
                        >
                          <Ionicons name="locate" size={30} color={colors.accent.primary} />
                        </Animated.View>
                      )}
                      
                      {/* Current selection indicator */}
                      {isTrackingPointSet && trackingPoint && (
                        <View style={styles.selectedPointBadge}>
                          <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                          <Text style={styles.selectedPointText}>
                            {getKeypointLabel(trackingPoint.keypointName)}
                          </Text>
                          <TouchableOpacity 
                            onPress={handleChangeTrackingPoint}
                            style={styles.changePointButton}
                          >
                            <Ionicons name="refresh" size={16} color="#ffffff" />
                          </TouchableOpacity>
                        </View>
                      )}
                      
                      {/* Debug info: detected keypoints count */}
                      <View style={styles.debugOverlay}>
                        <Text style={styles.debugOverlayText}>
                          {detectedKeypoints.size > 0 
                            ? `${detectedKeypoints.size} pontos detectados`
                            : 'Aguardando detecção...'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Web fallback: Use CameraView without real pose detection */
                <CameraView
                  ref={cameraRef}
                  style={styles.camera}
                  facing={cameraFacing}
                  onCameraReady={handleCameraReady}
                >
                  {/* Overlay for point selection */}
                  <View style={styles.pointSelectionOverlay}>
                    {/* Instructions */}
                    <View style={styles.pointInstructionsBanner}>
                      <Ionicons name="information-circle" size={20} color="#ffffff" />
                      <Text style={styles.pointInstructionsText}>
                        {locale === 'pt' 
                          ? 'Web: Selecione o ponto na lista abaixo' 
                          : 'Web: Select the point from the list below'}
                      </Text>
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
              )
            )}
          </View>
          
          {/* Keypoint Selection List (fallback/additional option) */}
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
          
          {/* Selection Feedback Overlay */}
          {selectionFeedback && (
            <Animated.View 
              style={[
                styles.selectionFeedbackOverlay,
                { opacity: feedbackFadeAnim },
                selectionFeedback.position && {
                  left: selectionFeedback.position.x - 100,
                  top: selectionFeedback.position.y - 60,
                }
              ]}
            >
              <View style={[
                styles.selectionFeedbackBox,
                selectionFeedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError
              ]}>
                <Ionicons 
                  name={selectionFeedback.type === 'success' ? 'checkmark-circle' : 'alert-circle'} 
                  size={24} 
                  color={selectionFeedback.type === 'success' ? '#10b981' : '#ef4444'} 
                />
                <Text style={[
                  styles.selectionFeedbackText,
                  selectionFeedback.type === 'success' ? styles.feedbackTextSuccess : styles.feedbackTextError
                ]}>
                  {selectionFeedback.message}
                </Text>
              </View>
            </Animated.View>
          )}
          
          {/* Tutorial Overlay */}
          {showTutorial && (
            <Animated.View style={[styles.tutorialOverlay, { opacity: fadeAnim }]}>
              {/* Skip Button */}
              <TouchableOpacity 
                style={styles.tutorialSkipButton}
                onPress={handleSkipTutorial}
                data-testid="tutorial-skip-btn"
              >
                <Text style={styles.tutorialSkipText}>
                  {locale === 'pt' ? 'Pular Tutorial' : 'Skip Tutorial'}
                </Text>
                <Ionicons name="close" size={20} color="#ffffff" />
              </TouchableOpacity>
              
              {/* Tutorial Content based on step */}
              {tutorialStep === 'welcome' && (
                <View style={styles.tutorialContent}>
                  <View style={styles.tutorialMessageBox}>
                    <Ionicons name="hand-left" size={28} color={colors.accent.primary} />
                    <Text style={styles.tutorialTitle}>
                      {locale === 'pt' ? 'Bem-vindo ao Coach Marker!' : 'Welcome to Coach Marker!'}
                    </Text>
                    <Text style={styles.tutorialMessage}>
                      {locale === 'pt' 
                        ? 'Toque no ponto do corpo que deseja rastrear para cálculos de velocidade.'
                        : 'Tap on the body point you want to track for velocity calculations.'}
                    </Text>
                  </View>
                  
                  {/* Pulsing Circle Indicator */}
                  <Animated.View style={[
                    styles.tutorialPulseCircle,
                    { transform: [{ scale: pulseAnim }] }
                  ]}>
                    <Ionicons name="finger-print" size={40} color={colors.accent.primary} />
                  </Animated.View>
                  
                  <Text style={styles.tutorialHint}>
                    {locale === 'pt' 
                      ? 'Os pontos verdes indicam articulações detectadas'
                      : 'Green dots indicate detected joints'}
                  </Text>
                </View>
              )}
              
              {tutorialStep === 'pointSelected' && (
                <View style={styles.tutorialContent}>
                  <View style={styles.tutorialMessageBox}>
                    <Ionicons name="checkmark-circle" size={28} color="#10b981" />
                    <Text style={styles.tutorialTitle}>
                      {locale === 'pt' ? 'Ponto Selecionado!' : 'Point Selected!'}
                    </Text>
                    <Text style={styles.tutorialMessage}>
                      {locale === 'pt' 
                        ? 'Ótimo! O sistema vai rastrear este ponto durante o exercício.'
                        : 'Great! The system will track this point during the exercise.'}
                    </Text>
                  </View>
                </View>
              )}
              
              {tutorialStep === 'trackingStatus' && (
                <View style={styles.tutorialContent}>
                  <View style={styles.tutorialMessageBox}>
                    <Ionicons name="pulse" size={28} color={colors.accent.primary} />
                    <Text style={styles.tutorialTitle}>
                      {locale === 'pt' ? 'Status de Tracking' : 'Tracking Status'}
                    </Text>
                    <Text style={styles.tutorialMessage}>
                      {locale === 'pt' 
                        ? 'A barra de estabilização mostra quando o sistema está pronto. Use "🔄 Trocar ponto" para re-selecionar.'
                        : 'The stabilization bar shows when the system is ready. Use "🔄 Change point" to re-select.'}
                    </Text>
                  </View>
                  
                  {/* Tutorial Change Point Button Demo */}
                  <View style={styles.tutorialButtonDemo}>
                    <Ionicons name="refresh" size={20} color="#ffffff" />
                    <Text style={styles.tutorialButtonDemoText}>
                      {locale === 'pt' ? 'Trocar ponto' : 'Change point'}
                    </Text>
                  </View>
                  
                  {/* Complete Tutorial Button */}
                  <TouchableOpacity 
                    style={styles.tutorialCompleteButton}
                    onPress={handleCompleteTutorial}
                    data-testid="tutorial-complete-btn"
                  >
                    <Text style={styles.tutorialCompleteText}>
                      {locale === 'pt' ? 'Começar Sessão' : 'Start Session'}
                    </Text>
                    <Ionicons name="arrow-forward" size={20} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              )}
              
              {tutorialStep === 'complete' && (
                <View style={styles.tutorialContent}>
                  <View style={styles.tutorialMessageBox}>
                    <Ionicons name="rocket" size={28} color="#10b981" />
                    <Text style={styles.tutorialTitle}>
                      {locale === 'pt' ? 'Pronto!' : 'Ready!'}
                    </Text>
                    <Text style={styles.tutorialMessage}>
                      {locale === 'pt' 
                        ? 'Agora você pode rastrear qualquer ponto do corpo em tempo real.'
                        : 'Now you can track any body point in real-time.'}
                    </Text>
                  </View>
                </View>
              )}
            </Animated.View>
          )}
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
                    
                    {/* Tracking Point Indicator with Change Button */}
                    {trackingPoint && (
                      <TouchableOpacity 
                        style={styles.trackingPointIndicator}
                        onPress={handleChangeTrackingPoint}
                        disabled={isTracking}
                      >
                        <Ionicons name="locate" size={16} color={colors.accent.primary} />
                        <Text style={styles.trackingPointText}>
                          {getKeypointLabel(trackingPoint.keypointName)}
                        </Text>
                        {!isTracking && (
                          <Ionicons name="refresh" size={14} color={colors.text.secondary} style={{marginLeft: 4}} />
                        )}
                      </TouchableOpacity>
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
                  facing={cameraFacing}
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
                      
                      {/* Tracking Point Indicator with Change Button */}
                      {trackingPoint && (
                        <TouchableOpacity 
                          style={styles.trackingPointIndicator}
                          onPress={handleChangeTrackingPoint}
                          disabled={isTracking}
                        >
                          <Ionicons name="locate" size={16} color={colors.accent.primary} />
                          <Text style={styles.trackingPointText}>
                            {getKeypointLabel(trackingPoint.keypointName)}
                          </Text>
                          {!isTracking && (
                            <Ionicons name="refresh" size={14} color={colors.text.secondary} style={{marginLeft: 4}} />
                          )}
                        </TouchableOpacity>
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
          
          {/* Diagnostic Toggle Button */}
          <TouchableOpacity
            style={styles.diagnosticToggleButton}
            onPress={() => setShowDiagnosticOverlay(!showDiagnosticOverlay)}
            data-testid="diagnostic-toggle-btn"
          >
            <Ionicons 
              name={showDiagnosticOverlay ? 'bug' : 'bug-outline'} 
              size={20} 
              color={showDiagnosticOverlay ? '#10b981' : '#6b7280'} 
            />
          </TouchableOpacity>
          
          {/* VBT Diagnostic Overlay - Real-time debugging */}
          <VBTDiagnosticOverlay 
            visible={showDiagnosticOverlay}
            compact={isTracking} /* Use compact mode during active recording */
            onClose={() => setShowDiagnosticOverlay(false)}
          />
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
  cameraToggleButton: {
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
  
  // Coach Marker & Keypoint Visualization Styles
  keypointDot: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
    marginTop: -8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  keypointDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  coachMarker: {
    position: 'absolute',
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 25,
    borderWidth: 2,
    borderColor: colors.accent.primary,
  },
  changePointButton: {
    marginLeft: 8,
    padding: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
  },
  debugOverlay: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  debugOverlayText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '500',
  },
  
  // Tutorial Styles
  tutorialOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  tutorialSkipButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  tutorialSkipText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  tutorialContent: {
    alignItems: 'center',
    paddingHorizontal: 30,
    gap: 24,
  },
  tutorialMessageBox: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.accent.primary,
    maxWidth: 320,
  },
  tutorialTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  tutorialMessage: {
    fontSize: 15,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  tutorialPulseCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderWidth: 2,
    borderColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tutorialHint: {
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  tutorialButtonDemo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  tutorialButtonDemoText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  tutorialCompleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#10b981',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  tutorialCompleteText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Selection Feedback Styles
  selectionFeedbackOverlay: {
    position: 'absolute',
    zIndex: 999,
  },
  selectionFeedbackBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 200,
  },
  feedbackSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
  },
  feedbackError: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
  },
  selectionFeedbackText: {
    fontSize: 14,
    fontWeight: '600',
  },
  feedbackTextSuccess: {
    color: '#ffffff',
  },
  feedbackTextError: {
    color: '#ffffff',
  },
  
  // Diagnostic Overlay Toggle Button
  diagnosticToggleButton: {
    position: 'absolute',
    top: 60,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    borderWidth: 1,
    borderColor: '#374151',
  },
});
