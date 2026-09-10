/**
 * usePoseDetection Hook
 * 
 * React hook that manages pose detection state and connects to the VBT pipeline.
 * Provides both native MediaPipe detection and simulation fallback.
 * 
 * USAGE:
 * ```tsx
 * const { pose, isDetecting, startDetection, stopDetection } = usePoseDetection({
 *   onPoseDetected: (pose) => processPose(pose),
 *   useSimulation: false,
 * });
 * ```
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import {
  PoseDetector,
  PoseSimulator,
  getPoseDetector,
  PoseDetectorStatus,
  VBTPoseData,
} from './index';

// ============================================================================
// TYPES
// ============================================================================

export interface UsePoseDetectionConfig {
  /** Callback when pose is detected */
  onPoseDetected?: (pose: VBTPoseData | null) => void;
  /** Use simulation instead of real detection */
  useSimulation?: boolean;
  /** Tracking point name for simulation */
  trackingPointName?: string;
  /** Load in kg (affects simulation) */
  loadKg?: number;
  /** Frame rate for simulation */
  simulationFps?: number;
  /** Minimum detection confidence */
  minConfidence?: number;
}

export interface UsePoseDetectionResult {
  /** Current pose data */
  pose: VBTPoseData | null;
  /** Whether detection is active */
  isDetecting: boolean;
  /** Detector status */
  status: PoseDetectorStatus;
  /** Error message if any */
  error: string | null;
  /** Current FPS */
  fps: number;
  /** Whether simulation is being used */
  isSimulation: boolean;
  /** Start pose detection */
  startDetection: () => void;
  /** Stop pose detection */
  stopDetection: () => void;
  /** Process external pose data (from native camera) */
  processExternalPose: (poseResult: any) => void;
  /** Reset detection state */
  reset: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_SIMULATION_FPS = 30;
const SIMULATION_INTERVAL = 1000 / DEFAULT_SIMULATION_FPS;

// ============================================================================
// HOOK
// ============================================================================

export function usePoseDetection(config: UsePoseDetectionConfig = {}): UsePoseDetectionResult {
  const {
    onPoseDetected,
    useSimulation = false,
    trackingPointName = 'left_hip',
    loadKg = 60,
    simulationFps = DEFAULT_SIMULATION_FPS,
    minConfidence = 0.6,
  } = config;
  
  // State
  const [pose, setPose] = useState<VBTPoseData | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [status, setStatus] = useState<PoseDetectorStatus>('uninitialized');
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  
  // Refs
  const detectorRef = useRef<PoseDetector | null>(null);
  const simulatorRef = useRef<PoseSimulator | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callbackRef = useRef(onPoseDetected);
  
  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = onPoseDetected;
  }, [onPoseDetected]);
  
  // Initialize detector
  useEffect(() => {
    const initDetector = async () => {
      if (useSimulation) {
        simulatorRef.current = new PoseSimulator(loadKg);
        setStatus('ready');
        return;
      }
      
      const detector = getPoseDetector({ minDetectionConfidence: minConfidence });
      detectorRef.current = detector;
      
      const success = await detector.initialize();
      if (success) {
        setStatus('ready');
        
        // Subscribe to pose updates
        detector.subscribe((detectedPose) => {
          setPose(detectedPose);
          setFps(detector.getFps());
          
          if (callbackRef.current) {
            callbackRef.current(detectedPose);
          }
        });
      } else {
        setStatus('error');
        setError(detector.getError());
      }
    };
    
    initDetector();
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (detectorRef.current) {
        detectorRef.current.destroy();
      }
    };
  }, [useSimulation, loadKg, minConfidence]);
  
  /**
   * Start pose detection
   */
  const startDetection = useCallback(() => {
    if (isDetecting) return;
    
    setIsDetecting(true);
    setError(null);
    
    if (useSimulation && simulatorRef.current) {
      // Start simulation loop
      simulatorRef.current.reset();
      
      const interval = 1000 / simulationFps;
      intervalRef.current = setInterval(() => {
        if (!simulatorRef.current) return;
        
        const simPose = simulatorRef.current.getNextPose(trackingPointName);
        setPose(simPose);
        setFps(simulationFps);
        
        if (callbackRef.current) {
          callbackRef.current(simPose);
        }
      }, interval);
      
      console.log('[usePoseDetection] Started simulation mode');
    } else {
      // Real detection - wait for frames from camera
      console.log('[usePoseDetection] Started real detection mode');
    }
  }, [isDetecting, useSimulation, simulationFps, trackingPointName]);
  
  /**
   * Stop pose detection
   */
  const stopDetection = useCallback(() => {
    setIsDetecting(false);
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    console.log('[usePoseDetection] Stopped detection');
  }, []);
  
  /**
   * Process external pose data from native camera frame processor
   */
  const processExternalPose = useCallback((poseResult: any) => {
    if (!isDetecting || useSimulation) return;
    
    if (detectorRef.current) {
      const processedPose = detectorRef.current.processPoseResult(poseResult);
      // State updates happen via subscription
    }
  }, [isDetecting, useSimulation]);
  
  /**
   * Reset detection state
   */
  const reset = useCallback(() => {
    stopDetection();
    setPose(null);
    setFps(0);
    setError(null);
    
    if (detectorRef.current) {
      detectorRef.current.reset();
    }
    if (simulatorRef.current) {
      simulatorRef.current.reset();
    }
  }, [stopDetection]);
  
  return {
    pose,
    isDetecting,
    status,
    error,
    fps,
    isSimulation: useSimulation,
    startDetection,
    stopDetection,
    processExternalPose,
    reset,
  };
}

export default usePoseDetection;
