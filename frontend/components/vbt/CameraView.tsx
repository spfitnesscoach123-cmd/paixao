/**
 * CameraView - Production-Grade Camera Component for VBT
 * 
 * This component provides:
 * - Camera with useRef for facing persistence (BUG 1 FIX)
 * - Proper recording lifecycle with native calls (BUG 2 FIX)
 * - MediaPipe integration for pose detection
 * - Toggle camera functionality without state resets
 * 
 * CRITICAL BUG FIXES:
 * 
 * BUG 1 - Camera facing uses useRef, not state
 *   cameraFacingRef.current is the source of truth
 *   State is only for UI display synchronization
 * 
 * BUG 2 - Recording calls actual native methods
 *   startRecording() calls cameraRef.current.recordAsync()
 *   NOT just setState
 */

import React, { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Platform,
  TouchableOpacity,
  Text,
} from 'react-native';
import { CameraView as ExpoCameraView } from 'expo-camera';
import { RecordingPipeline, RecordingResult } from '../../services/vbt/RecordingPipeline';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Conditional import for native MediaPipe
let RNMediapipe: any = null;
let nativeSwitchCamera: (() => void) | null = null;
let MEDIAPIPE_AVAILABLE = false;

if (Platform.OS !== 'web') {
  try {
    const mediapipe = require('@thinksys/react-native-mediapipe');
    RNMediapipe = mediapipe.RNMediapipe;
    nativeSwitchCamera = mediapipe.switchCamera;
    MEDIAPIPE_AVAILABLE = !!RNMediapipe;
  } catch (e) {
    console.warn('[CameraView] MediaPipe not available:', e);
  }
}

export interface CameraViewProps {
  // Callbacks
  onLandmark?: (event: any) => void;
  onCameraReady?: () => void;
  onRecordingStarted?: () => void;
  onRecordingFinished?: (result: RecordingResult) => void;
  onRecordingError?: (error: Error) => void;
  
  // Configuration
  initialFacing?: 'front' | 'back';
  enableMediaPipe?: boolean;
  frameLimit?: number;
  
  // Style
  style?: any;
  
  // Children for overlay
  children?: React.ReactNode;
}

export interface CameraViewRef {
  // Recording
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<RecordingResult | null>;
  isRecording: () => boolean;
  
  // Camera control
  toggleCamera: () => void;
  getCameraFacing: () => 'front' | 'back';
  
  // Reference access
  getCameraRef: () => React.RefObject<ExpoCameraView>;
}

/**
 * CameraView Component
 * 
 * Production-grade camera component with proper state management
 * and recording lifecycle handling.
 */
const CameraView = forwardRef<CameraViewRef, CameraViewProps>((props, ref) => {
  const {
    onLandmark,
    onCameraReady,
    onRecordingStarted,
    onRecordingFinished,
    onRecordingError,
    initialFacing = 'back',
    enableMediaPipe = true,
    frameLimit = 30,
    style,
    children,
  } = props;

  // ========================================
  // BUG 1 FIX: Camera facing persists using useRef
  // State is ONLY for triggering re-renders
  // ========================================
  const cameraFacingRef = useRef<'front' | 'back'>(initialFacing);
  const [displayFacing, setDisplayFacing] = useState<'front' | 'back'>(initialFacing);
  
  // Camera reference
  const cameraRef = useRef<ExpoCameraView>(null);
  
  // Recording pipeline
  const recordingPipelineRef = useRef<RecordingPipeline | null>(null);
  const [isRecordingState, setIsRecordingState] = useState(false);
  
  // Camera ready state
  const [isCameraReady, setIsCameraReady] = useState(false);

  // Initialize recording pipeline
  useEffect(() => {
    recordingPipelineRef.current = new RecordingPipeline({}, {
      onRecordingStarted: () => {
        setIsRecordingState(true);
        onRecordingStarted?.();
      },
      onRecordingFinished: (result) => {
        setIsRecordingState(false);
        onRecordingFinished?.(result);
      },
      onRecordingError: (error) => {
        setIsRecordingState(false);
        onRecordingError?.(error);
      },
    });

    return () => {
      recordingPipelineRef.current?.reset();
    };
  }, []);

  // Handle camera ready
  const handleCameraReady = useCallback(() => {
    setIsCameraReady(true);
    console.log('[CameraView] Camera ready, facing:', cameraFacingRef.current);
    onCameraReady?.();
  }, [onCameraReady]);

  /**
   * BUG 1 FIX: Toggle camera using ref as source of truth
   * 
   * REQUIREMENT: Camera facing must persist using useRef, not state.
   * CameraView must use cameraFacingRef.current as the source of truth.
   * Camera must NEVER reset during tracking, recording, or component re-render.
   */
  const toggleCamera = useCallback(() => {
    // Update ref (source of truth)
    const newFacing = cameraFacingRef.current === 'back' ? 'front' : 'back';
    cameraFacingRef.current = newFacing;
    
    // Update display state (for UI)
    setDisplayFacing(newFacing);
    
    // Call native switchCamera if available
    if (Platform.OS !== 'web' && nativeSwitchCamera) {
      try {
        nativeSwitchCamera();
      } catch (e) {
        console.warn('[CameraView] nativeSwitchCamera failed:', e);
      }
    }
    
    console.log('[CameraView] Camera toggled to:', newFacing);
  }, []);

  /**
   * BUG 2 FIX: Start recording calls actual native method
   * 
   * REQUIREMENT: The play button must call cameraRef.current.startRecording()
   * NOT only set state.
   */
  const startRecording = useCallback(async (): Promise<boolean> => {
    if (!cameraRef.current) {
      console.error('[CameraView] Cannot start recording: camera ref is null');
      return false;
    }
    
    if (!isCameraReady) {
      console.error('[CameraView] Cannot start recording: camera not ready');
      return false;
    }
    
    if (recordingPipelineRef.current?.isRecording()) {
      console.warn('[CameraView] Already recording');
      return false;
    }
    
    console.log('[CameraView] Starting recording...');
    
    // CRITICAL: Call the actual native recording method
    const success = await recordingPipelineRef.current?.startRecording(cameraRef) ?? false;
    
    return success;
  }, [isCameraReady]);

  /**
   * Stop recording
   */
  const stopRecording = useCallback(async (): Promise<RecordingResult | null> => {
    if (!recordingPipelineRef.current?.isRecording()) {
      console.warn('[CameraView] Not recording');
      return null;
    }
    
    console.log('[CameraView] Stopping recording...');
    
    const result = await recordingPipelineRef.current.stopRecording(cameraRef);
    return result;
  }, []);

  /**
   * Check if recording is active
   */
  const isRecording = useCallback((): boolean => {
    return recordingPipelineRef.current?.isRecording() ?? false;
  }, []);

  /**
   * Get current camera facing
   */
  const getCameraFacing = useCallback((): 'front' | 'back' => {
    return cameraFacingRef.current;
  }, []);

  /**
   * Get camera ref
   */
  const getCameraRef = useCallback(() => {
    return cameraRef;
  }, []);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    startRecording,
    stopRecording,
    isRecording,
    toggleCamera,
    getCameraFacing,
    getCameraRef,
  }), [startRecording, stopRecording, isRecording, toggleCamera, getCameraFacing, getCameraRef]);

  // Handle MediaPipe landmark callback
  const handleLandmark = useCallback((event: any) => {
    onLandmark?.(event);
  }, [onLandmark]);

  // Render based on platform and MediaPipe availability
  if (Platform.OS !== 'web' && MEDIAPIPE_AVAILABLE && enableMediaPipe && RNMediapipe) {
    // Native platform with MediaPipe
    return (
      <View style={[styles.container, style]}>
        <RNMediapipe
          style={StyleSheet.absoluteFill}
          height={screenHeight}
          width={screenWidth}
          onLandmark={handleLandmark}
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
          frameLimit={frameLimit}
        />
        {children}
      </View>
    );
  }

  // Web fallback or MediaPipe not available
  return (
    <View style={[styles.container, style]}>
      <ExpoCameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={displayFacing}
        onCameraReady={handleCameraReady}
      />
      {children}
    </View>
  );
});

CameraView.displayName = 'CameraView';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});

export { CameraView };
export default CameraView;
