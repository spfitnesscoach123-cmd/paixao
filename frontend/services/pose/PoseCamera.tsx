/**
 * PoseCamera Component
 * 
 * Camera component with integrated pose detection.
 * Supports both native MediaPipe detection (via VisionCamera) and Expo Camera with simulation.
 * 
 * ARCHITECTURE:
 * - For native builds: Uses react-native-vision-camera with MediaPipe frame processor
 * - For Expo Go/Web: Falls back to expo-camera with simulation
 * 
 * This component provides pose data to the VBT pipeline without modifying
 * any existing calculation, tracking, or visualization logic.
 */

import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import { VBTPoseData } from './types';
import { usePoseDetection, UsePoseDetectionConfig } from './usePoseDetection';
import { colors } from '../../constants/theme';

// ============================================================================
// TYPES
// ============================================================================

export interface PoseCameraProps {
  /** Camera facing direction */
  facing?: CameraType;
  /** Called when pose is detected */
  onPoseDetected?: (pose: VBTPoseData | null) => void;
  /** Called when camera is ready */
  onCameraReady?: () => void;
  /** Enable pose detection */
  enablePoseDetection?: boolean;
  /** Use simulation mode (for development) */
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
}, ref) => {
  // Camera state
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraReady, setIsCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  
  // Pose detection hook
  const {
    pose,
    isDetecting,
    status,
    error,
    fps,
    isSimulation,
    startDetection,
    stopDetection,
    processExternalPose,
    reset,
  } = usePoseDetection({
    onPoseDetected,
    useSimulation: useSimulation || Platform.OS === 'web',
    trackingPointName,
    loadKg,
  });
  
  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    startDetection,
    stopDetection,
    reset,
    getCurrentPose: () => pose,
    isDetecting: () => isDetecting,
  }), [pose, isDetecting, startDetection, stopDetection, reset]);
  
  // Handle camera ready
  const handleCameraReady = useCallback(() => {
    setIsCameraReady(true);
    
    if (onCameraReady) {
      onCameraReady();
    }
    
    // Auto-start detection if enabled
    if (enablePoseDetection) {
      startDetection();
    }
  }, [onCameraReady, enablePoseDetection, startDetection]);
  
  // Start/stop detection based on prop
  useEffect(() => {
    if (isCameraReady && enablePoseDetection && !isDetecting) {
      startDetection();
    } else if (!enablePoseDetection && isDetecting) {
      stopDetection();
    }
  }, [isCameraReady, enablePoseDetection, isDetecting, startDetection, stopDetection]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopDetection();
    };
  }, [stopDetection]);
  
  // Request permission if needed
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);
  
  // Loading state
  if (!permission) {
    return (
      <View style={[styles.container, styles.centered, style]}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.statusText}>Verificando permissões...</Text>
      </View>
    );
  }
  
  // Permission denied
  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centered, style]}>
        <Text style={styles.errorText}>Permissão de câmera necessária</Text>
      </View>
    );
  }
  
  return (
    <View style={[styles.container, style]}>
      {/* Camera View */}
      <CameraView
        ref={cameraRef}
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
              Modo: {isSimulation ? 'Simulação' : 'Real'}
            </Text>
            <Text style={styles.debugText}>
              Detectando: {isDetecting ? 'Sim' : 'Não'}
            </Text>
            {pose && (
              <Text style={styles.debugText}>
                Keypoints: {pose.keypoints.length}
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
            <Text style={styles.statusText}>Iniciando câmera...</Text>
          </View>
        )}
      </CameraView>
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
