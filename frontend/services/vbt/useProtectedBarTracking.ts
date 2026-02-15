/**
 * useProtectedBarTracking Hook
 * 
 * Enhanced React hook with 5-STAGE PROGRESSIVE VALIDATION pipeline:
 * - Stage 1: FRAME_USABLE - Pose exists with keypoints
 * - Stage 2: FRAME_STABLE - Enough stable frames accumulated (INDEPENDENT of tracking)
 * - Stage 3: FRAME_TRACKABLE - Tracking point valid
 * - Stage 4: FRAME_VALID - Movement detected
 * - Stage 5: FRAME_COUNTABLE - Ready for rep counting
 * 
 * CRITICAL: Stabilization is INDEPENDENT of tracking point validation.
 * This breaks the circular dependency that caused infinite stabilization loops.
 * 
 * Recording can begin when state >= READY (stable), even before tracking is perfect.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  TrackingProtectionSystem,
  createTrackingProtection,
  ProtectionResult,
  TrackingState,
  ValidationStage,
  ValidationFlags,
  TrackingPoint,
  PoseData,
  Keypoint,
  EXERCISE_KEYPOINTS,
  RECOMMENDED_TRACKING_POINTS,
  ProtectionConfig,
} from './trackingProtection';
import { recordingController } from './recordingController';
import {
  BarTrackerState,
  BarPositionSimulator,
  VelocityData,
  createDefaultConfig,
  BarPosition,
} from './barTracker';
import {
  PoseSimulator,
  VBTPoseData,
} from '../pose';

// ============================================================================
// TYPES
// ============================================================================

export interface ProtectedTrackingConfig {
  loadKg: number;
  cameraHeight: number;
  cameraDistance: number;
  exercise: string;
  useSimulation?: boolean;
  protectionConfig?: Partial<ProtectionConfig>;
}

export interface ProtectedRepData {
  rep: number;
  meanVelocity: number;
  peakVelocity: number;
  velocityDrop: number;
  timestamp: number;
  trackingPointUsed: string;
}

export interface ProtectedTrackingResult {
  // Protection State (Progressive Stages)
  protectionState: TrackingState;
  validationStage: ValidationStage;
  validationFlags: ValidationFlags;
  isHumanDetected: boolean;
  isStable: boolean;
  stabilityProgress: number;
  stableFrameCount: number;
  canCalculate: boolean;
  
  // Tracking Point (Stage 3)
  trackingPoint: TrackingPoint | null;
  isTrackingPointSet: boolean;
  recommendedTrackingPoint: string;
  
  // Velocity Data
  isTracking: boolean;
  currentVelocity: number;
  peakVelocity: number;
  meanVelocity: number;
  velocityDrop: number;
  
  // Rep Data
  repCount: number;
  repPhase: string;
  repsData: ProtectedRepData[];
  
  // Feedback
  feedbackColor: 'green' | 'red' | 'neutral';
  statusMessage: string;
  
  // Actions
  setTrackingPoint: (x: number, y: number, keypointName: string) => void;
  clearTrackingPoint: () => void;
  startTracking: () => void;
  stopTracking: () => void;
  resetTracking: () => void;
  
  // For real pose detection integration
  processPose: (pose: PoseData | null) => void;
  
  // Simulation control
  setSimulationEnabled: (enabled: boolean) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const VELOCITY_DROP_THRESHOLD = 10;
const TRACKING_INTERVAL = 33; // ~30 fps

// ============================================================================
// HOOK
// ============================================================================

export function useProtectedBarTracking(config: ProtectedTrackingConfig): ProtectedTrackingResult {
  // Protection system state (Progressive Stages)
  const [protectionState, setProtectionState] = useState<TrackingState>('noHuman');
  const [validationStage, setValidationStage] = useState<ValidationStage>('INITIALIZING');
  const [validationFlags, setValidationFlags] = useState<ValidationFlags>({
    frameUsable: false,
    frameStable: false,
    frameTrackable: false,
    frameValid: false,
    frameCountable: false,
  });
  const [isHumanDetected, setIsHumanDetected] = useState(false);
  const [isStable, setIsStable] = useState(false);
  const [stabilityProgress, setStabilityProgress] = useState(0);
  const [stableFrameCount, setStableFrameCount] = useState(0);
  const [canCalculate, setCanCalculate] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Aguardando seleção de ponto de tracking...');
  
  // Tracking point state
  const [trackingPoint, setTrackingPointState] = useState<TrackingPoint | null>(null);
  const [isTrackingPointSet, setIsTrackingPointSet] = useState(false);
  
  // Velocity state
  const [isTracking, setIsTracking] = useState(false);
  const [currentVelocity, setCurrentVelocity] = useState(0);
  const [peakVelocity, setPeakVelocity] = useState(0);
  const [meanVelocity, setMeanVelocity] = useState(0);
  const [velocityDrop, setVelocityDrop] = useState(0);
  
  // Rep state
  const [repCount, setRepCount] = useState(0);
  const [repPhase, setRepPhase] = useState('idle');
  const [repsData, setRepsData] = useState<ProtectedRepData[]>([]);
  
  // Feedback
  const [feedbackColor, setFeedbackColor] = useState<'green' | 'red' | 'neutral'>('neutral');
  
  // Simulation state
  const [simulationEnabled, setSimulationEnabled] = useState(config.useSimulation !== false);
  
  // Refs
  const protectionSystemRef = useRef<TrackingProtectionSystem | null>(null);
  const trackerRef = useRef<BarTrackerState | null>(null);
  const simulatorRef = useRef<BarPositionSimulator | null>(null);
  const poseSimulatorRef = useRef<PoseSimulator | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRepCountRef = useRef(0);
  
  // Recommended tracking point based on exercise
  const recommendedTrackingPoint = RECOMMENDED_TRACKING_POINTS[config.exercise] || 'left_hip';
  
  // Initialize systems with NEW progressive architecture
  useEffect(() => {
    // Create protection system with progressive validation
    protectionSystemRef.current = createTrackingProtection({
      ...config.protectionConfig,
      exerciseKeypoints: EXERCISE_KEYPOINTS[config.exercise] || [],
    });
    protectionSystemRef.current.setExercise(config.exercise);
    
    // Create tracker
    const trackerConfig = createDefaultConfig({
      heightCm: config.cameraHeight,
      distanceCm: config.cameraDistance,
    });
    trackerRef.current = new BarTrackerState(trackerConfig);
    
    // Create simulators if simulation mode is enabled
    if (simulationEnabled) {
      simulatorRef.current = new BarPositionSimulator(config.loadKg);
      poseSimulatorRef.current = new PoseSimulator(config.loadKg);
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [config.exercise, config.cameraHeight, config.cameraDistance, config.loadKg, simulationEnabled]);
  
  /**
   * Process pose data through 5-STAGE PROGRESSIVE VALIDATION pipeline
   * 
   * Stage 1: FRAME_USABLE - Pose exists with keypoints
   * Stage 2: FRAME_STABLE - Enough stable frames accumulated (INDEPENDENT)
   * Stage 3: FRAME_TRACKABLE - Tracking point valid
   * Stage 4: FRAME_VALID - Movement detected
   * Stage 5: FRAME_COUNTABLE - Ready for rep counting
   */
  const processPose = useCallback((pose: PoseData | null) => {
    if (!protectionSystemRef.current || !isTracking) return;
    
    const result = protectionSystemRef.current.processFrame(pose);
    
    // Update protection state with NEW progressive fields
    setProtectionState(result.state);
    setValidationStage(result.validationStage);
    setValidationFlags(result.validationFlags);
    setIsHumanDetected(result.validationFlags.frameUsable);
    setIsStable(result.validationFlags.frameStable);
    setStabilityProgress(result.stabilityProgress);
    setStableFrameCount(result.stableFrameCount);
    setCanCalculate(result.canCalculate);
    setStatusMessage(result.message);
    setTrackingPointState(result.trackingPoint);
    setRepPhase(protectionSystemRef.current.getRepPhase());
    
    // Only process velocity if allowed (Stage 3+ is trackable)
    if (result.canCalculate && result.validationFlags.frameTrackable && result.smoothedPosition && trackerRef.current) {
      const barPosition: BarPosition = {
        x: result.smoothedPosition.x,
        y: result.smoothedPosition.y,
        confidence: 1,
        timestamp: Date.now(),
      };
      
      const velocityData = trackerRef.current.processPosition(barPosition);
      processVelocityData(velocityData, result.trackingPoint?.keypointName || '');
    }
    
    // Handle rep completion from protection system
    if (result.canCountRep) {
      handleRepCompletion(result.trackingPoint?.keypointName || '');
    }
  }, [isTracking]);
  
  /**
   * Process velocity data
   */
  const processVelocityData = useCallback((data: VelocityData, trackingPointName: string) => {
    setCurrentVelocity(Math.round(data.instantVelocity * 100) / 100);
    setMeanVelocity(Math.round(data.meanVelocity * 100) / 100);
    setVelocityDrop(data.velocityDrop);
    
    // Update peak
    if (data.instantVelocity > peakVelocity) {
      setPeakVelocity(Math.round(data.instantVelocity * 100) / 100);
    }
    
    // Feedback color
    if (data.velocityDrop > VELOCITY_DROP_THRESHOLD) {
      setFeedbackColor('red');
    } else if (data.instantVelocity > 0.1) {
      setFeedbackColor('green');
    } else {
      setFeedbackColor('neutral');
    }
  }, [peakVelocity]);
  
  /**
   * Handle rep completion
   */
  const handleRepCompletion = useCallback((trackingPointName: string) => {
    const newRepCount = lastRepCountRef.current + 1;
    lastRepCountRef.current = newRepCount;
    setRepCount(newRepCount);
    
    const newRepData: ProtectedRepData = {
      rep: newRepCount,
      meanVelocity: Math.round(meanVelocity * 100) / 100,
      peakVelocity: Math.round(peakVelocity * 100) / 100,
      velocityDrop,
      timestamp: Date.now(),
      trackingPointUsed: trackingPointName,
    };
    
    setRepsData(prev => [...prev, newRepData]);
  }, [meanVelocity, peakVelocity, velocityDrop]);
  
  /**
   * Set tracking point (LAYER 3 - CAMADA 3)
   */
  const setTrackingPoint = useCallback((x: number, y: number, keypointName: string) => {
    if (protectionSystemRef.current) {
      protectionSystemRef.current.setTrackingPoint(x, y, keypointName);
      setIsTrackingPointSet(true);
      setTrackingPointState({
        x,
        y,
        keypointName,
        isSet: true,
      });
      setStatusMessage(`Ponto de tracking definido: ${keypointName}`);
    }
  }, []);
  
  /**
   * Clear tracking point
   */
  const clearTrackingPoint = useCallback(() => {
    if (protectionSystemRef.current) {
      protectionSystemRef.current.clearTrackingPoint();
      setIsTrackingPointSet(false);
      setTrackingPointState(null);
      setStatusMessage('Ponto de tracking removido - selecione novo ponto');
    }
  }, []);
  
  /**
   * Start tracking
   * 
   * RECORDING BEHAVIOR CHANGE:
   * - Recording is NOW ALLOWED when state >= READY (stable)
   * - Recording does NOT require tracking point to be perfectly valid
   * - Recording will begin capturing frames and transition to active tracking
   *   once tracking becomes valid
   * 
   * USES recordingController.start() as SINGLE SOURCE OF TRUTH
   */
  const startTracking = useCallback(() => {
    // CAMADA 3: Check if tracking point is set - STILL MANDATORY for actual tracking
    // But we ALLOW starting recording to begin stabilization
    if (!isTrackingPointSet) {
      setStatusMessage('ERRO: Defina ponto de tracking antes de iniciar');
      return;
    }
    
    setIsTracking(true);
    setCurrentVelocity(0);
    setPeakVelocity(0);
    setMeanVelocity(0);
    setVelocityDrop(0);
    setRepCount(0);
    setRepsData([]);
    setFeedbackColor('neutral');
    lastRepCountRef.current = 0;
    
    // Reset systems
    if (trackerRef.current) {
      trackerRef.current.reset();
    }
    if (protectionSystemRef.current) {
      // Keep tracking point, just reset other state
      const tp = protectionSystemRef.current.getTrackingPoint();
      protectionSystemRef.current.reset();
      if (tp.isSet) {
        protectionSystemRef.current.setTrackingPoint(tp.x, tp.y, tp.keypointName);
      }
    }
    
    // SINGLE SOURCE OF TRUTH: Call recordingController.start()
    // The state machine will automatically transition to RECORDING when appropriate
    recordingController.start();
    
    // Start simulation if enabled (development/testing mode)
    // In production, real poses come from PoseCamera via processPose()
    if (simulationEnabled) {
      // Reset simulators
      if (simulatorRef.current) {
        simulatorRef.current.reset();
      }
      if (poseSimulatorRef.current) {
        poseSimulatorRef.current.reset();
      }
      
      intervalRef.current = setInterval(() => {
        if (!protectionSystemRef.current || !trackerRef.current) return;
        
        const trackingPointInfo = protectionSystemRef.current.getTrackingPoint();
        let simulatedPose: PoseData;
        
        // Use PoseSimulator if available (better quality), fallback to BarPositionSimulator
        if (poseSimulatorRef.current) {
          // PoseSimulator generates full body keypoints with realistic movement
          const vbtPose = poseSimulatorRef.current.getNextPose(trackingPointInfo.keypointName);
          simulatedPose = {
            keypoints: vbtPose.keypoints,
            timestamp: vbtPose.timestamp,
          };
        } else if (simulatorRef.current) {
          // Fallback: use bar position simulator
          const simPosition = simulatorRef.current.getNextPosition();
          simulatedPose = {
            keypoints: generateSimulatedKeypoints(simPosition, trackingPointInfo.keypointName),
            timestamp: Date.now(),
          };
        } else {
          return;
        }
        
        processPose(simulatedPose);
      }, TRACKING_INTERVAL);
    }
    
    setStatusMessage(simulationEnabled 
      ? 'Tracking iniciado (SIMULAÇÃO) - Detectando presença...'
      : 'Tracking iniciado - Aguardando detecção real de pose...'
    );
  }, [isTrackingPointSet, simulationEnabled, processPose]);
  
  /**
   * Stop tracking
   */
  const stopTracking = useCallback(() => {
    setIsTracking(false);
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // SINGLE SOURCE OF TRUTH: Call recordingController.stop()
    recordingController.stop();
    
    setStatusMessage('Tracking parado');
  }, []);
  
  /**
   * Reset all tracking state
   */
  const resetTracking = useCallback(() => {
    stopTracking();
    setCurrentVelocity(0);
    setPeakVelocity(0);
    setMeanVelocity(0);
    setVelocityDrop(0);
    setRepCount(0);
    setRepsData([]);
    setFeedbackColor('neutral');
    setProtectionState('noHuman');
    setValidationStage('INITIALIZING');
    setValidationFlags({
      frameUsable: false,
      frameStable: false,
      frameTrackable: false,
      frameValid: false,
      frameCountable: false,
    });
    setIsHumanDetected(false);
    setIsStable(false);
    setStabilityProgress(0);
    setStableFrameCount(0);
    setCanCalculate(false);
    setRepPhase('idle');
    lastRepCountRef.current = 0;
    
    if (trackerRef.current) {
      trackerRef.current.reset();
    }
    if (protectionSystemRef.current) {
      protectionSystemRef.current.reset();
    }
    if (simulatorRef.current) {
      simulatorRef.current.reset();
    }
    if (poseSimulatorRef.current) {
      poseSimulatorRef.current.reset();
    }
    
    // Also reset recording controller
    recordingController.reset();
    
    // Also clear tracking point on full reset
    setIsTrackingPointSet(false);
    setTrackingPointState(null);
    setStatusMessage('Reset completo - selecione ponto de tracking');
  }, [stopTracking]);
  
  /**
   * Toggle simulation
   */
  const setSimulationEnabledCallback = useCallback((enabled: boolean) => {
    setSimulationEnabled(enabled);
    if (enabled && !simulatorRef.current) {
      simulatorRef.current = new BarPositionSimulator(config.loadKg);
    }
  }, [config.loadKg]);
  
  // Cleanup
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
  
  return {
    // Protection state (Progressive Stages)
    protectionState,
    validationStage,
    validationFlags,
    isHumanDetected,
    isStable,
    stabilityProgress,
    stableFrameCount,
    canCalculate,
    
    // Tracking point
    trackingPoint,
    isTrackingPointSet,
    recommendedTrackingPoint,
    
    // Velocity
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
    setSimulationEnabled: setSimulationEnabledCallback,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate simulated keypoints for testing
 */
function generateSimulatedKeypoints(position: BarPosition, trackingKeypointName: string): Keypoint[] {
  const baseY = position.y;
  const baseScore = position.confidence;
  
  // Generate all standard pose keypoints
  const keypointNames = [
    'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
    'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
    'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
    'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
  ];
  
  return keypointNames.map((name, index) => {
    // Vary position slightly for each keypoint
    let y = baseY;
    
    // Position keypoints relative to body
    if (name.includes('shoulder')) {
      y = baseY - 0.2;
    } else if (name.includes('hip')) {
      y = baseY;
    } else if (name.includes('knee')) {
      y = baseY + 0.15;
    } else if (name.includes('ankle')) {
      y = baseY + 0.3;
    } else if (name.includes('wrist')) {
      y = baseY - 0.1;
    } else if (name.includes('elbow')) {
      y = baseY - 0.15;
    }
    
    // Add slight noise
    const noise = (Math.random() - 0.5) * 0.02;
    
    // Tracking point gets exact position
    const isTrackingPoint = name === trackingKeypointName;
    
    return {
      name,
      x: 0.5 + (name.includes('left') ? -0.1 : name.includes('right') ? 0.1 : 0) + noise,
      y: isTrackingPoint ? position.y : y + noise,
      score: isTrackingPoint ? Math.max(0.8, baseScore) : 0.7 + Math.random() * 0.25,
    };
  });
}
