/**
 * useProtectedBarTracking Hook
 * 
 * Enhanced React hook with 3-layer protection system:
 * - Layer 1: Human presence validation
 * - Layer 2: State machine control
 * - Layer 3: Coach-defined tracking point
 * 
 * This hook wraps the protection system with React state management.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  TrackingProtectionSystem,
  createProtectionSystem,
  ProtectionResult,
  TrackingState,
  TrackingPoint,
  PoseData,
  Keypoint,
  EXERCISE_KEYPOINTS,
  RECOMMENDED_TRACKING_POINTS,
  ProtectionConfig,
} from './trackingProtection';
import {
  BarTrackerState,
  BarPositionSimulator,
  VelocityData,
  createDefaultConfig,
  BarPosition,
} from './barTracker';

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
  // Protection State (Layer 1 & 2)
  protectionState: TrackingState;
  isHumanDetected: boolean;
  isStable: boolean;
  stabilityProgress: number;
  canCalculate: boolean;
  
  // Tracking Point (Layer 3)
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
  // Protection system state
  const [protectionState, setProtectionState] = useState<TrackingState>('noHuman');
  const [isHumanDetected, setIsHumanDetected] = useState(false);
  const [isStable, setIsStable] = useState(false);
  const [stabilityProgress, setStabilityProgress] = useState(0);
  const [canCalculate, setCanCalculate] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Waiting for tracking point selection...');
  
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRepCountRef = useRef(0);
  
  // Recommended tracking point based on exercise
  const recommendedTrackingPoint = RECOMMENDED_TRACKING_POINTS[config.exercise] || 'left_hip';
  
  // Initialize systems
  useEffect(() => {
    // Create protection system
    protectionSystemRef.current = createProtectionSystem({
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
    
    // Create simulator if needed
    if (simulationEnabled) {
      simulatorRef.current = new BarPositionSimulator(config.loadKg);
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [config.exercise, config.cameraHeight, config.cameraDistance, config.loadKg, simulationEnabled]);
  
  /**
   * Process pose data through protection system
   */
  const processPose = useCallback((pose: PoseData | null) => {
    if (!protectionSystemRef.current || !isTracking) return;
    
    const result = protectionSystemRef.current.processFrame(pose);
    
    // Update protection state
    setProtectionState(result.state);
    setIsHumanDetected(result.isValid);
    setIsStable(protectionSystemRef.current.getStabilityProgress() >= 1);
    setStabilityProgress(protectionSystemRef.current.getStabilityProgress());
    setCanCalculate(result.canCalculate);
    setStatusMessage(result.message);
    setTrackingPointState(result.trackingPoint);
    setRepPhase(protectionSystemRef.current.getRepPhase());
    
    // Only process velocity if allowed
    if (result.canCalculate && result.smoothedPosition && trackerRef.current) {
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
   */
  const startTracking = useCallback(() => {
    // CAMADA 3: Check if tracking point is set - MANDATORY
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
    
    // Start simulation if enabled
    if (simulationEnabled && simulatorRef.current) {
      simulatorRef.current.reset();
      
      intervalRef.current = setInterval(() => {
        if (!simulatorRef.current || !protectionSystemRef.current || !trackerRef.current) return;
        
        // Generate simulated pose with the tracking point
        const simPosition = simulatorRef.current.getNextPosition();
        const trackingPointInfo = protectionSystemRef.current.getTrackingPoint();
        
        // Create simulated pose data
        const simulatedPose: PoseData = {
          keypoints: generateSimulatedKeypoints(simPosition, trackingPointInfo.keypointName),
          timestamp: Date.now(),
        };
        
        processPose(simulatedPose);
      }, TRACKING_INTERVAL);
    }
    
    setStatusMessage('Tracking iniciado - Detectando presença humana...');
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
    
    setStatusMessage('Tracking stopped');
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
    setIsHumanDetected(false);
    setIsStable(false);
    setStabilityProgress(0);
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
    
    // Also clear tracking point on full reset
    setIsTrackingPointSet(false);
    setTrackingPointState(null);
    setStatusMessage('Reset complete - select tracking point');
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
    // Protection state
    protectionState,
    isHumanDetected,
    isStable,
    stabilityProgress,
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
