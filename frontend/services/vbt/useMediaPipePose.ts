/**
 * useMediaPipePose - Production-Grade MediaPipe Pose Hook for VBT
 * 
 * React hook that provides:
 * - Continuous pose detection from camera
 * - Integration with VelocityCalculator
 * - Integration with RepDetector  
 * - Integration with TrackingSystem
 * - Real-time velocity and rep counting
 * 
 * REQUIREMENTS:
 * - Runs continuous pose detection
 * - Outputs pose landmarks with timestamp
 * - Calls velocity calculator each frame
 * - Calls rep detector each frame
 * - Operates in real-time
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { VBTPoseData, ProcessedKeypoint } from '../pose';
import { VelocityCalculator, VelocityResult, VelocityCalibration } from './VelocityCalculator';
import { RepDetector, RepDetectorResult, RepData, RepPhase } from './RepDetector';
import { TrackingSystem, TrackingResult, TrackingConfig } from './TrackingSystem';
import { recordingController } from './recordingController';

export interface MediaPipePoseConfig {
  // Calibration
  cameraHeightCm: number;
  cameraDistanceCm: number;
  
  // Tracking
  confidenceThreshold: number;
  smoothingEnabled: boolean;
  
  // Exercise
  exercise: string;
  exerciseKeypoints: string[];
  
  // Behavior
  autoProcess: boolean;  // Automatically process poses when received
}

export interface MediaPipePoseResult {
  // Pose data
  currentPose: VBTPoseData | null;
  poseTimestamp: number;
  frameCount: number;
  
  // Tracking
  isTrackingPointSet: boolean;
  trackingPointName: string | null;
  trackingConfidence: number;
  isTrackingValid: boolean;
  
  // Velocity (from VelocityCalculator)
  currentVelocity: number;
  smoothedVelocity: number;
  velocityDirection: 'up' | 'down' | 'stationary';
  peakVelocity: number;
  meanVelocity: number;
  
  // Reps (from RepDetector)
  repCount: number;
  repPhase: RepPhase;
  currentRep: RepData | null;
  repsData: RepData[];
  velocityDrop: number;
  
  // Status
  isReady: boolean;        // Stable tracking established
  isRecording: boolean;    // Currently recording
  statusMessage: string;
  
  // Actions
  setTrackingPoint: (keypointName: string) => boolean;
  setTrackingPointByTap: (x: number, y: number, pose: VBTPoseData | null) => { success: boolean; landmarkName: string | null };
  clearTrackingPoint: () => void;
  processPose: (pose: VBTPoseData | null) => void;
  startRecording: () => void;
  stopRecording: () => void;
  reset: () => void;
}

const DEFAULT_CONFIG: MediaPipePoseConfig = {
  cameraHeightCm: 100,
  cameraDistanceCm: 150,
  confidenceThreshold: 0.5,
  smoothingEnabled: true,
  exercise: 'Back Squat',
  exerciseKeypoints: ['left_hip', 'right_hip', 'left_knee', 'right_knee'],
  autoProcess: true,
};

/**
 * useMediaPipePose Hook
 * 
 * Main hook for integrating MediaPipe pose detection with VBT system.
 * Manages velocity calculation and rep detection internally.
 */
export function useMediaPipePose(
  config: Partial<MediaPipePoseConfig> = {}
): MediaPipePoseResult {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  // State
  const [currentPose, setCurrentPose] = useState<VBTPoseData | null>(null);
  const [poseTimestamp, setPoseTimestamp] = useState<number>(0);
  const [frameCount, setFrameCount] = useState<number>(0);
  
  // Tracking state
  const [isTrackingPointSet, setIsTrackingPointSet] = useState<boolean>(false);
  const [trackingPointName, setTrackingPointName] = useState<string | null>(null);
  const [trackingConfidence, setTrackingConfidence] = useState<number>(0);
  const [isTrackingValid, setIsTrackingValid] = useState<boolean>(false);
  
  // Velocity state
  const [currentVelocity, setCurrentVelocity] = useState<number>(0);
  const [smoothedVelocity, setSmoothedVelocity] = useState<number>(0);
  const [velocityDirection, setVelocityDirection] = useState<'up' | 'down' | 'stationary'>('stationary');
  const [peakVelocity, setPeakVelocity] = useState<number>(0);
  const [meanVelocity, setMeanVelocity] = useState<number>(0);
  
  // Rep state
  const [repCount, setRepCount] = useState<number>(0);
  const [repPhase, setRepPhase] = useState<RepPhase>('idle');
  const [currentRep, setCurrentRep] = useState<RepData | null>(null);
  const [repsData, setRepsData] = useState<RepData[]>([]);
  const [velocityDrop, setVelocityDrop] = useState<number>(0);
  
  // Status state
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Aguardando detecção de pose...');
  
  // Refs for core systems
  const velocityCalculatorRef = useRef<VelocityCalculator | null>(null);
  const repDetectorRef = useRef<RepDetector | null>(null);
  const trackingSystemRef = useRef<TrackingSystem | null>(null);
  
  // Tracking refs
  const velocitiesRef = useRef<number[]>([]);
  const peakVelocityRef = useRef<number>(0);
  
  // Initialize core systems
  useEffect(() => {
    // Initialize VelocityCalculator with calibration
    velocityCalculatorRef.current = new VelocityCalculator({
      calibration: {
        cameraHeightCm: fullConfig.cameraHeightCm,
        cameraDistanceCm: fullConfig.cameraDistanceCm,
        fovDegrees: 60,
        frameHeight: 1920,
      },
      smoothingWindowSize: 5,
      noiseThresholdMs: 0.02,
    });
    
    // Initialize RepDetector
    repDetectorRef.current = new RepDetector({
      minVelocityThreshold: 0.05,
      minPhaseDuration: 200,
    });
    
    // Initialize TrackingSystem
    trackingSystemRef.current = new TrackingSystem({
      confidenceThreshold: fullConfig.confidenceThreshold,
      smoothingEnabled: fullConfig.smoothingEnabled,
    });
    
    return () => {
      // Cleanup
      velocityCalculatorRef.current = null;
      repDetectorRef.current = null;
      trackingSystemRef.current = null;
    };
  }, [fullConfig.cameraHeightCm, fullConfig.cameraDistanceCm, fullConfig.confidenceThreshold]);

  /**
   * Set tracking point by keypoint name
   */
  const setTrackingPoint = useCallback((keypointName: string): boolean => {
    if (!trackingSystemRef.current) return false;
    
    const success = trackingSystemRef.current.setTrackingPoint(keypointName);
    if (success) {
      setIsTrackingPointSet(true);
      setTrackingPointName(keypointName);
      setStatusMessage(`Tracking point definido: ${keypointName}`);
    }
    return success;
  }, []);

  /**
   * Set tracking point by tap coordinates
   */
  const setTrackingPointByTap = useCallback((
    x: number, 
    y: number, 
    pose: VBTPoseData | null
  ): { success: boolean; landmarkName: string | null } => {
    if (!trackingSystemRef.current) {
      return { success: false, landmarkName: null };
    }
    
    const result = trackingSystemRef.current.setTrackingPointByTap(
      x, y, pose, fullConfig.exerciseKeypoints
    );
    
    if (result.success && result.landmarkName) {
      setIsTrackingPointSet(true);
      setTrackingPointName(result.landmarkName);
      setStatusMessage(`Tracking point definido: ${result.landmarkName}`);
    }
    
    return result;
  }, [fullConfig.exerciseKeypoints]);

  /**
   * Clear tracking point
   */
  const clearTrackingPoint = useCallback(() => {
    if (trackingSystemRef.current) {
      trackingSystemRef.current.clearTrackingPoint();
    }
    setIsTrackingPointSet(false);
    setTrackingPointName(null);
    setTrackingConfidence(0);
    setIsTrackingValid(false);
    setStatusMessage('Tracking point removido');
  }, []);

  /**
   * Process pose data through the VBT pipeline
   * 
   * This is the main processing function that should be called
   * on every frame from MediaPipe onLandmark callback.
   * 
   * PIPELINE:
   * 1. Track landmark position
   * 2. Calculate velocity  
   * 3. Detect reps
   * 4. Update state
   */
  const processPose = useCallback((pose: VBTPoseData | null) => {
    // Update pose state
    setCurrentPose(pose);
    setPoseTimestamp(pose?.timestamp || Date.now());
    setFrameCount(prev => prev + 1);
    
    // Check if systems are initialized
    if (!trackingSystemRef.current || !velocityCalculatorRef.current || !repDetectorRef.current) {
      setStatusMessage('Sistemas não inicializados');
      return;
    }
    
    // STEP 1: Track landmark
    const trackingResult = trackingSystemRef.current.trackLandmark(pose);
    setTrackingConfidence(trackingResult.confidence);
    setIsTrackingValid(trackingResult.success);
    
    // Update readiness based on tracking stability
    const isStable = trackingSystemRef.current.isStable(5);
    setIsReady(isStable && trackingResult.success);
    
    // If tracking is not valid, update status and return
    if (!trackingResult.success) {
      setStatusMessage(trackingResult.message);
      // Don't process velocity if tracking is not valid
      return;
    }
    
    // STEP 2: Calculate velocity (only if we have valid position)
    const position = trackingResult.smoothedPosition || trackingResult.position;
    if (position) {
      const velocityResult = velocityCalculatorRef.current.update({
        x: position.x,
        y: position.y,
        timestamp: pose?.timestamp || Date.now(),
      });
      
      setCurrentVelocity(velocityResult.instantVelocity);
      setSmoothedVelocity(velocityResult.smoothedVelocity);
      setVelocityDirection(velocityResult.direction);
      
      // Track velocities for mean calculation
      if (velocityResult.isValid) {
        velocitiesRef.current.push(velocityResult.smoothedVelocity);
        if (velocitiesRef.current.length > 30) {
          velocitiesRef.current.shift();
        }
        
        // Update peak velocity
        if (velocityResult.smoothedVelocity > peakVelocityRef.current) {
          peakVelocityRef.current = velocityResult.smoothedVelocity;
          setPeakVelocity(velocityResult.smoothedVelocity);
        }
        
        // Calculate mean velocity
        const mean = velocitiesRef.current.reduce((a, b) => a + b, 0) / velocitiesRef.current.length;
        setMeanVelocity(mean);
      }
      
      // STEP 3: Detect reps (only when recording is active)
      if (recordingController.isActive()) {
        setIsRecording(true);
        
        const repResult = repDetectorRef.current.update(
          velocityResult.smoothedVelocity,
          velocityResult.direction
        );
        
        setRepPhase(repResult.phase);
        setRepCount(repResult.repCount);
        
        if (repResult.repCompleted && repResult.currentRep) {
          setCurrentRep(repResult.currentRep);
          setRepsData(prev => [...prev, repResult.currentRep!]);
          setVelocityDrop(repResult.currentRep.velocityDrop);
        }
        
        setStatusMessage(`GRAVANDO: ${repResult.phase} - ${repResult.repCount} reps`);
      } else {
        setIsRecording(false);
        setStatusMessage(isStable ? 'PRONTO - Aguardando gravação' : 'Estabilizando...');
      }
    }
  }, []);

  /**
   * Start recording
   */
  const startRecording = useCallback(() => {
    // Reset tracking refs
    velocitiesRef.current = [];
    peakVelocityRef.current = 0;
    
    // Reset systems
    velocityCalculatorRef.current?.reset();
    repDetectorRef.current?.reset();
    trackingSystemRef.current?.reset();
    
    // Reset state
    setCurrentVelocity(0);
    setSmoothedVelocity(0);
    setPeakVelocity(0);
    setMeanVelocity(0);
    setRepCount(0);
    setRepPhase('idle');
    setCurrentRep(null);
    setRepsData([]);
    setVelocityDrop(0);
    
    // Start recording via global controller
    recordingController.start();
    setIsRecording(true);
    setStatusMessage('Gravação iniciada');
  }, []);

  /**
   * Stop recording
   */
  const stopRecording = useCallback(() => {
    recordingController.stop();
    setIsRecording(false);
    setStatusMessage('Gravação parada');
  }, []);

  /**
   * Reset all state
   */
  const reset = useCallback(() => {
    // Reset systems
    velocityCalculatorRef.current?.reset();
    repDetectorRef.current?.reset();
    trackingSystemRef.current?.fullReset();
    recordingController.reset();
    
    // Reset refs
    velocitiesRef.current = [];
    peakVelocityRef.current = 0;
    
    // Reset all state
    setCurrentPose(null);
    setPoseTimestamp(0);
    setFrameCount(0);
    setIsTrackingPointSet(false);
    setTrackingPointName(null);
    setTrackingConfidence(0);
    setIsTrackingValid(false);
    setCurrentVelocity(0);
    setSmoothedVelocity(0);
    setVelocityDirection('stationary');
    setPeakVelocity(0);
    setMeanVelocity(0);
    setRepCount(0);
    setRepPhase('idle');
    setCurrentRep(null);
    setRepsData([]);
    setVelocityDrop(0);
    setIsReady(false);
    setIsRecording(false);
    setStatusMessage('Reset completo - selecione ponto de tracking');
  }, []);

  return {
    // Pose data
    currentPose,
    poseTimestamp,
    frameCount,
    
    // Tracking
    isTrackingPointSet,
    trackingPointName,
    trackingConfidence,
    isTrackingValid,
    
    // Velocity
    currentVelocity,
    smoothedVelocity,
    velocityDirection,
    peakVelocity,
    meanVelocity,
    
    // Reps
    repCount,
    repPhase,
    currentRep,
    repsData,
    velocityDrop,
    
    // Status
    isReady,
    isRecording,
    statusMessage,
    
    // Actions
    setTrackingPoint,
    setTrackingPointByTap,
    clearTrackingPoint,
    processPose,
    startRecording,
    stopRecording,
    reset,
  };
}

export default useMediaPipePose;
