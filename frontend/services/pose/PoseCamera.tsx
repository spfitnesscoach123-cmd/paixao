/**
 * PoseCamera Component
 * 
 * Camera component with integrated REAL MediaPipe Pose Detection.
 * Uses @thinksys/react-native-mediapipe for native pose detection.
 * 
 * ARCHITECTURE:
 * - Native platforms: Uses @thinksys/react-native-mediapipe with Vision Camera
 * - Web: Falls back to expo-camera with simulation
 * 
 * This component provides REAL pose data to the VBT pipeline.
 */

import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  Platform,
} from 'react-native';
import { VBTPoseData, ProcessedKeypoint, LANDMARK_INDEX_TO_VBT_NAME } from './types';
import { getPoseDetector, PoseDetectorStatus, PoseSimulator } from './poseDetector';
import { colors } from '../../constants/theme';

// ============================================================================
// CONDITIONAL IMPORTS - Native MediaPipe only on iOS/Android
// ============================================================================

let MediapipePoseView: any = null;
let MediapipeModule: any = null;
let switchCamera: (() => void) | null = null;

// Only import native MediaPipe on iOS/Android
if (Platform.OS !== 'web') {
  try {
    const mediapipe = require('@thinksys/react-native-mediapipe');
    MediapipePoseView = mediapipe.MediapipePoseView;
    MediapipeModule = mediapipe.default || mediapipe;
    switchCamera = mediapipe.switchCamera;
  } catch (e) {
    console.warn('[PoseCamera] MediaPipe not available, will use simulation fallback');
  }
}

// Fallback for web
let CameraView: any = null;
let useCameraPermissions: any = null;

if (Platform.OS === 'web' || !MediapipePoseView) {
  try {
    const expoCamera = require('expo-camera');
    CameraView = expoCamera.CameraView;
    useCameraPermissions = expoCamera.useCameraPermissions;
  } catch (e) {
    console.warn('[PoseCamera] expo-camera not available');
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface PoseCameraProps {
  /** Camera facing direction */
  facing?: 'front' | 'back';
  /** Called when pose is detected */
  onPoseDetected?: (pose: VBTPoseData | null) => void;
  /** Called when camera is ready */
  onCameraReady?: () => void;
  /** Enable pose detection */
  enablePoseDetection?: boolean;
  /** Use simulation mode (for development/web) */
  useSimulation?: boolean;
  /** Tracking point name for simulation */
  trackingPointName?: string;
  /** Load in kg (affects simulation) */
  loadKg?: number;
  /** Custom overlay to render on top of camera */
  overlay?: React.ReactNode;
  /** Additional style for container */
  style?: any;
  /** Show debug info overlay */
  showDebugInfo?: boolean;
  /** Minimum confidence threshold */
  minConfidence?: number;
  /** Callback when camera is toggled (for native switchCamera) */
  onCameraToggle?: () => void;
}

export interface PoseCameraRef {
  /** Start pose detection */
  startDetection: () => void;
  /** Stop pose detection */
  stopDetection: () => void;
  /** Reset detection state */
  reset: () => void;
  /** Get current pose */
  getCurrentPose: () => VBTPoseData | null;
  /** Is detection active */
  isDetecting: () => boolean;
  /** Toggle camera (front/back) */
  toggleCamera: () => void;
}

// ============================================================================
// LANDMARK CONVERSION
// ============================================================================

/**
 * Convert MediaPipe landmarks to VBT keypoints format
 */
function convertMediapipeLandmarksToVBT(landmarks: any[]): VBTPoseData {
  const keypoints: ProcessedKeypoint[] = [];
  
  if (!landmarks || !Array.isArray(landmarks)) {
    return { keypoints: [], timestamp: Date.now() };
  }
  
  // Map MediaPipe 33 landmarks to VBT 17 keypoints
  for (const [indexStr, name] of Object.entries(LANDMARK_INDEX_TO_VBT_NAME)) {
    const index = parseInt(indexStr, 10);
    const landmark = landmarks[index];
    
    if (landmark) {
      keypoints.push({
        name: name as string,
        x: landmark.x ?? 0,
        y: landmark.y ?? 0,
        score: landmark.visibility ?? landmark.confidence ?? 0.5,
      });
    }
  }
  
  return {
    keypoints,
    timestamp: Date.now(),
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export const PoseCamera = forwardRef<PoseCameraRef, PoseCameraProps>(({
  facing = 'back',
  onPoseDetected,
  onCameraReady,
  enablePoseDetection = true,
  useSimulation = false,
  trackingPointName = 'left_hip',
  loadKg = 60,
  overlay,
  style,
  showDebugInfo = false,
  minConfidence = 0.6,
  onCameraToggle,
}, ref) => {
  // State
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [currentPose, setCurrentPose] = useState<VBTPoseData | null>(null);
  const [fps, setFps] = useState(0);
  const [status, setStatus] = useState<PoseDetectorStatus>('uninitialized');
  const [error, setError] = useState<string | null>(null);
  
  // Refs
  const simulatorRef = useRef<PoseSimulator | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());
  const onPoseDetectedRef = useRef(onPoseDetected);
  
  // Determine if we should use native MediaPipe or simulation
  const shouldUseNativeMediapipe = Platform.OS !== 'web' && MediapipePoseView && !useSimulation;
  
  // Log camera facing on mount and changes
  useEffect(() => {
    console.log("[Camera] Using camera:", facing);
  }, [facing]);
  
  // Keep callback ref updated
  useEffect(() => {
    onPoseDetectedRef.current = onPoseDetected;
  }, [onPoseDetected]);
  
  // Toggle camera handler
  const handleToggleCamera = useCallback(() => {
    console.log("[Camera] Toggle camera requested, current facing:", facing);
    
    // Use native switchCamera if available (for RNMediapipe)
    if (Platform.OS !== 'web' && switchCamera) {
      try {
        switchCamera();
        console.log("[Camera] Native switchCamera called");
      } catch (e) {
        console.warn("[Camera] switchCamera failed:", e);
      }
    }
    
    // Notify parent component
    if (onCameraToggle) {
      onCameraToggle();
    }
  }, [facing, onCameraToggle]);
  
  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    startDetection: () => {
      setIsDetecting(true);
    },
    stopDetection: () => {
      setIsDetecting(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    },
    reset: () => {
      setCurrentPose(null);
      setFps(0);
      setIsDetecting(false);
      if (simulatorRef.current) {
        simulatorRef.current.reset();
      }
    },
    toggleCamera: handleToggleCamera,
    getCurrentPose: () => currentPose,
    isDetecting: () => isDetecting,
  }), [currentPose, isDetecting]);
  
  // Update FPS counter
  const updateFps = useCallback(() => {
    frameCountRef.current++;
    const now = Date.now();
    
    if (now - lastFpsTimeRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFpsTimeRef.current = now;
    }
  }, []);
  
  // Handle pose detection from native MediaPipe
  const handleNativePoseDetected = useCallback((event: any) => {
    if (!isDetecting || !enablePoseDetection) return;
    
    try {
      // Extract landmarks from native event
      const landmarks = event?.nativeEvent?.landmarks || 
                       event?.nativeEvent?.poseLandmarks ||
                       event?.landmarks ||
                       event?.poseLandmarks ||
                       event;
      
      if (landmarks && Array.isArray(landmarks) && landmarks.length > 0) {
        const vbtPose = convertMediapipeLandmarksToVBT(landmarks);
        
        // Filter by minimum confidence
        const validKeypoints = vbtPose.keypoints.filter(kp => kp.score >= minConfidence);
        
        if (validKeypoints.length > 0) {
          const filteredPose: VBTPoseData = {
            keypoints: vbtPose.keypoints, // Keep all but mark which are valid
            timestamp: vbtPose.timestamp,
          };
          
          setCurrentPose(filteredPose);
          updateFps();
          
          if (onPoseDetectedRef.current) {
            onPoseDetectedRef.current(filteredPose);
          }
        } else {
          // No valid keypoints above threshold
          setCurrentPose(null);
          if (onPoseDetectedRef.current) {
            onPoseDetectedRef.current(null);
          }
        }
      } else {
        // No landmarks detected
        setCurrentPose(null);
        if (onPoseDetectedRef.current) {
          onPoseDetectedRef.current(null);
        }
      }
    } catch (e) {
      console.error('[PoseCamera] Error processing pose:', e);
    }
  }, [isDetecting, enablePoseDetection, minConfidence, updateFps]);
  
  // Handle camera ready
  const handleCameraReady = useCallback(() => {
    setIsCameraReady(true);
    setStatus('ready');
    
    if (onCameraReady) {
      onCameraReady();
    }
    
    // Auto-start detection if enabled
    if (enablePoseDetection) {
      setIsDetecting(true);
    }
  }, [onCameraReady, enablePoseDetection]);
  
  // Initialize simulator for web/fallback
  useEffect(() => {
    if (!shouldUseNativeMediapipe) {
      simulatorRef.current = new PoseSimulator(loadKg);
      setStatus('ready');
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [shouldUseNativeMediapipe, loadKg]);
  
  // Simulation loop for web/fallback
  useEffect(() => {
    if (!shouldUseNativeMediapipe && isDetecting && simulatorRef.current) {
      intervalRef.current = setInterval(() => {
        if (!simulatorRef.current) return;
        
        const simPose = simulatorRef.current.getNextPose(trackingPointName);
        setCurrentPose(simPose);
        updateFps();
        
        if (onPoseDetectedRef.current) {
          onPoseDetectedRef.current(simPose);
        }
      }, 33); // ~30 FPS
    } else if (intervalRef.current && (!isDetecting || shouldUseNativeMediapipe)) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [shouldUseNativeMediapipe, isDetecting, trackingPointName, updateFps]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setIsDetecting(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
  
  // ============================================================================
  // RENDER - Native MediaPipe Camera
  // ============================================================================
  
  if (shouldUseNativeMediapipe && MediapipePoseView) {
    return (
      <View style={[styles.container, style]}>
        <MediapipePoseView
          style={styles.camera}
          cameraType={facing}
          enablePoseDetection={enablePoseDetection && isDetecting}
          minPoseDetectionConfidence={minConfidence}
          minPosePresenceConfidence={minConfidence}
          minTrackingConfidence={minConfidence}
          onPoseDetected={handleNativePoseDetected}
          onCameraReady={handleCameraReady}
        >
          {/* Custom Overlay */}
          {overlay}
          
          {/* Debug Info Overlay */}
          {showDebugInfo && (
            <View style={styles.debugOverlay}>
              <Text style={styles.debugText}>
                Status: {status}
              </Text>
              <Text style={styles.debugText}>
                FPS: {fps}
              </Text>
              <Text style={styles.debugText}>
                Modo: REAL MediaPipe
              </Text>
              <Text style={styles.debugText}>
                Detectando: {isDetecting ? 'Sim' : 'Não'}
              </Text>
              {currentPose && (
                <Text style={styles.debugText}>
                  Keypoints: {currentPose.keypoints.length}
                </Text>
              )}
              {error && (
                <Text style={[styles.debugText, styles.errorText]}>
                  Erro: {error}
                </Text>
              )}
            </View>
          )}
          
          {/* Loading indicator */}
          {!isCameraReady && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.accent.primary} />
              <Text style={styles.statusText}>Iniciando câmera com MediaPipe...</Text>
            </View>
          )}
        </MediapipePoseView>
      </View>
    );
  }
  
  // ============================================================================
  // RENDER - Fallback (Web or Simulation)
  // ============================================================================
  
  if (CameraView) {
    return (
      <View style={[styles.container, style]}>
        <CameraView
          style={styles.camera}
          facing={facing}
          onCameraReady={handleCameraReady}
        >
          {/* Custom Overlay */}
          {overlay}
          
          {/* Debug Info Overlay */}
          {showDebugInfo && (
            <View style={styles.debugOverlay}>
              <Text style={styles.debugText}>
                Status: {status}
              </Text>
              <Text style={styles.debugText}>
                FPS: {fps}
              </Text>
              <Text style={styles.debugText}>
                Modo: Simulação (Web/Fallback)
              </Text>
              <Text style={styles.debugText}>
                Detectando: {isDetecting ? 'Sim' : 'Não'}
              </Text>
              {currentPose && (
                <Text style={styles.debugText}>
                  Keypoints: {currentPose.keypoints.length}
                </Text>
              )}
            </View>
          )}
          
          {/* Loading indicator */}
          {!isCameraReady && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.accent.primary} />
              <Text style={styles.statusText}>Iniciando câmera...</Text>
            </View>
          )}
        </CameraView>
      </View>
    );
  }
  
  // ============================================================================
  // RENDER - No Camera Available
  // ============================================================================
  
  return (
    <View style={[styles.container, styles.centered, style]}>
      <Text style={styles.errorText}>Câmera não disponível</Text>
    </View>
  );
});

PoseCamera.displayName = 'PoseCamera';

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  debugOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 8,
    padding: 8,
    minWidth: 150,
  },
  debugText: {
    color: '#ffffff',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    color: '#ef4444',
  },
});

export default PoseCamera;
