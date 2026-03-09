/**
 * useJumpCameraLifecycle Hook
 * 
 * React hook that integrates with CameraMediapipeManager for safe
 * camera/mediapipe lifecycle management in Jump Camera.
 * 
 * This hook handles:
 * - Sequential state transitions
 * - Frame validation
 * - Safe cleanup on unmount
 * - App state handling
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { 
  getCameraManager, 
  CameraMediapipeManager,
} from './CameraMediapipeManager';
import { 
  CameraPhase, 
  CameraOwner,
  ReadinessCheck,
  LifecycleEvent,
  CameraManagerState,
} from './types';

const LOG_PREFIX = '[useJumpCameraLifecycle]';
const OWNER: CameraOwner = 'jump_camera';

export interface UseJumpCameraLifecycleResult {
  // State
  phase: CameraPhase;
  cameraReady: boolean;
  mediapipeReady: boolean;
  canProcess: boolean;
  shouldMountCamera: boolean;
  error: string | null;
  frameCount: number;
  
  // Actions
  requestCameraStart: () => boolean;
  signalFirstFrame: () => void;
  signalCameraReady: () => void;
  signalCaptureStart: () => void;
  releaseCamera: () => void;
  
  // Frame validation
  validateFrame: (event: any) => boolean;
  
  // Utilities
  getReadiness: () => ReadinessCheck;
}

export function useJumpCameraLifecycle(): UseJumpCameraLifecycleResult {
  const managerRef = useRef<CameraMediapipeManager | null>(null);
  
  // Local state (synced with manager)
  const [phase, setPhase] = useState<CameraPhase>('IDLE');
  const [cameraReady, setCameraReady] = useState(false);
  const [mediapipeReady, setMediapipeReady] = useState(false);
  const [canProcess, setCanProcess] = useState(false);
  const [shouldMountCamera, setShouldMountCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  
  // Frame processing guard
  const isProcessingRef = useRef(false);
  
  // Initialize manager reference
  useEffect(() => {
    managerRef.current = getCameraManager();
    
    // Subscribe to lifecycle events
    const unsubscribe = managerRef.current.subscribe(handleLifecycleEvent);
    
    // Sync initial state
    syncState();
    
    return () => {
      unsubscribe();
      
      // Release on unmount
      if (managerRef.current?.isOwnedBy(OWNER)) {
        console.log(`${LOG_PREFIX} Unmounting - releasing camera`);
        managerRef.current.releaseAll(OWNER);
      }
    };
  }, []);
  
  /**
   * Handle lifecycle events from manager
   */
  const handleLifecycleEvent = useCallback((event: LifecycleEvent, state: CameraManagerState) => {
    console.log(`${LOG_PREFIX} Lifecycle event: ${event}, phase: ${state.phase}`);
    syncState();
    
    switch (event) {
      case 'camera_ready':
        // Camera is ready, we can start MediaPipe
        break;
        
      case 'mediapipe_ready':
        // MediaPipe is ready, can start processing
        break;
        
      case 'error':
        setError(state.error);
        setShouldMountCamera(false);
        break;
        
      case 'app_background':
        // App going to background - pause processing
        break;
        
      case 'app_foreground':
        // App returning - resume if we were active
        syncState();
        break;
        
      case 'release':
        setShouldMountCamera(false);
        break;
    }
  }, []);
  
  /**
   * Sync local state with manager
   */
  const syncState = useCallback(() => {
    if (!managerRef.current) return;
    
    const readiness = managerRef.current.getReadiness();
    const state = managerRef.current.getState();
    
    setPhase(readiness.phase);
    setCameraReady(readiness.cameraReady);
    setMediapipeReady(readiness.mediapipeReady);
    setCanProcess(readiness.canProcess);
    setError(state.error);
    setFrameCount(state.frameCount);
    
    // shouldMountCamera is true when we're past IDLE and not in error/releasing
    const shouldMount = ![
      'IDLE', 
      'REQUESTING_PERMISSION', 
      'PERMISSION_GRANTED',
      'ERROR',
      'RELEASING',
    ].includes(readiness.phase);
    
    setShouldMountCamera(shouldMount);
  }, []);
  
  /**
   * Request camera start
   */
  const requestCameraStart = useCallback((): boolean => {
    if (!managerRef.current) return false;
    
    console.log(`${LOG_PREFIX} Requesting camera start`);
    
    // Request ownership and start camera
    const success = managerRef.current.startCamera(OWNER);
    
    if (success) {
      // Delay syncing slightly to allow React to process state update
      setTimeout(() => {
        syncState();
      }, 50);
    }
    
    syncState();
    return success;
  }, [syncState]);
  
  /**
   * Signal first frame received
   */
  const signalFirstFrame = useCallback(() => {
    if (!managerRef.current) return;
    
    console.log(`${LOG_PREFIX} First frame signal`);
    managerRef.current.recordFrame(OWNER);
    syncState();
  }, [syncState]);
  
  /**
   * Signal camera ready (explicit)
   */
  const signalCameraReady = useCallback(() => {
    if (!managerRef.current) return;
    
    console.log(`${LOG_PREFIX} Camera ready signal`);
    managerRef.current.signalCameraReady(OWNER);
    syncState();
  }, [syncState]);
  
  /**
   * Signal capture start (countdown complete)
   */
  const signalCaptureStart = useCallback(() => {
    if (!managerRef.current) return;
    
    console.log(`${LOG_PREFIX} Capture start signal`);
    managerRef.current.signalCaptureActive(OWNER);
    syncState();
  }, [syncState]);
  
  /**
   * Release camera
   */
  const releaseCamera = useCallback(() => {
    if (!managerRef.current) return;
    
    console.log(`${LOG_PREFIX} Release camera`);
    managerRef.current.releaseAll(OWNER);
    syncState();
  }, [syncState]);
  
  /**
   * Validate incoming frame
   * Returns true if frame should be processed
   */
  const validateFrame = useCallback((event: any): boolean => {
    // Guard against concurrent processing
    if (isProcessingRef.current) {
      return false;
    }
    
    // Check manager state
    if (!managerRef.current) {
      return false;
    }
    
    // Only process if MediaPipe is ready
    if (!managerRef.current.isMediapipeReady()) {
      // But still record frames for initialization
      if (event && (event.nativeEvent || event.landmarks || event.poseLandmarks)) {
        managerRef.current.recordFrame(OWNER);
        syncState();
      }
      return false;
    }
    
    // Validate event structure
    if (!event) {
      return false;
    }
    
    // Get landmark data
    const landmarkData = event.nativeEvent || event;
    if (!landmarkData) {
      return false;
    }
    
    // Record frame
    managerRef.current.recordFrame(OWNER);
    
    return true;
  }, [syncState]);
  
  /**
   * Get current readiness
   */
  const getReadiness = useCallback((): ReadinessCheck => {
    if (!managerRef.current) {
      return {
        cameraReady: false,
        mediapipeReady: false,
        canProcess: false,
        phase: 'IDLE',
        owner: 'none',
      };
    }
    return managerRef.current.getReadiness();
  }, []);
  
  return {
    // State
    phase,
    cameraReady,
    mediapipeReady,
    canProcess,
    shouldMountCamera,
    error,
    frameCount,
    
    // Actions
    requestCameraStart,
    signalFirstFrame,
    signalCameraReady,
    signalCaptureStart,
    releaseCamera,
    
    // Frame validation
    validateFrame,
    
    // Utilities
    getReadiness,
  };
}
