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
 * 
 * BUG FIXES IMPLEMENTED:
 * - BUG 3: Velocity calculated in MediaPipe pose loop with smoothing
 * - BUG 4: RepDetector detects full rep cycle (eccentric -> transition -> concentric)
 * - BUG 5: Tracking point stored as landmark index, confidence checked each frame
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
  EXERCISE_START_DIRECTION,
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

// Import new production modules for bug fixes
import { VelocityCalculator, VelocityResult } from './VelocityCalculator';
import { RepDetector, RepDetectorResult, RepPhase } from './RepDetector';
import { getFrameTimestamp, getNextFrameId, resetFrameTime } from '../frameTime';
import { FrameIntegrityMonitor } from '../frameDrop';

// VBT V2 modules
import { MovementDetector, MovementFrame } from './MovementDetector';
import { RepDetectorV2, RepDetectorV2Result, RepPhaseV2 } from './RepDetectorV2';
import { VBTAnalyzer, VBTRepAnalysis, RepClassification } from './VBTAnalyzer';

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
  
  // VBT V2 analysis
  repClassification: RepClassification;
  isCalibrating: boolean;
  calibrationProgress: number;
  vbtBaseline: number | null;
  gaugeProgress: number;
  velocityTrend: 'up' | 'down' | 'stable';
  
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
  
  // VBT V2 state
  const [repClassification, setRepClassification] = useState<RepClassification>('calibrating');
  const [isCalibrating, setIsCalibrating] = useState(true);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [vbtBaseline, setVbtBaseline] = useState<number | null>(null);
  const [gaugeProgress, setGaugeProgress] = useState(0);
  const [velocityTrend, setVelocityTrend] = useState<'up' | 'down' | 'stable'>('stable');
  
  // Simulation state
  const [simulationEnabled, setSimulationEnabled] = useState(config.useSimulation !== false);
  
  // Refs
  const protectionSystemRef = useRef<TrackingProtectionSystem | null>(null);
  const trackerRef = useRef<BarTrackerState | null>(null);
  const simulatorRef = useRef<BarPositionSimulator | null>(null);
  const poseSimulatorRef = useRef<PoseSimulator | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRepCountRef = useRef(0);
  
  // ========================================
  // BUG 3, 4, 5 FIXES: New production modules
  // ========================================
  const velocityCalculatorRef = useRef<VelocityCalculator | null>(null);
  const repDetectorRef = useRef<RepDetector | null>(null);
  
  // VBT V2 modules
  const movementDetectorRef = useRef<MovementDetector | null>(null);
  const repDetectorV2Ref = useRef<RepDetectorV2 | null>(null);
  const vbtAnalyzerRef = useRef<VBTAnalyzer | null>(null);
  const prevVelocityRef = useRef<number>(0); // For trend detection
  
  // BUG 5 FIX: Tracking landmark stored as INDEX, not screen coordinates
  const trackingLandmarkIndexRef = useRef<number | null>(null);
  
  // Frame counter for debug logging
  const frameCountRef = useRef(0);

  // Frame integrity monitor para detecção de frame drop (VBT)
  const frameIntegrityRef = useRef<FrameIntegrityMonitor>(new FrameIntegrityMonitor({
    targetFps: 30,
  }));

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
    
    // ========================================
    // BUG 3 FIX: Initialize VelocityCalculator with camera calibration
    // Velocity is now calculated inside the MediaPipe pose loop
    // with proper smoothing using last 5 frames moving average
    // ========================================
    velocityCalculatorRef.current = new VelocityCalculator({
      calibration: {
        cameraHeightCm: config.cameraHeight,
        cameraDistanceCm: config.cameraDistance,
        fovDegrees: 60,
        frameHeight: 1920,
      },
      smoothingWindowSize: 5,  // Moving average over last 5 frames
      noiseThresholdMs: 0.02,  // Reject noise below 2cm/s
    });
    
    // ========================================
    // BUG 4 FIX: Initialize RepDetector for full cycle detection
    // Detects: eccentric -> transition -> concentric -> completion
    // IMPROVED: Uses direction change detection, not just velocity thresholds
    // CONCENTRIC-FIRST: Deadlift, Power Clean start with UP movement
    // ========================================
    const exerciseStartDir = EXERCISE_START_DIRECTION[config.exercise] || 'down';
    console.log(`[VBT] Initializing RepDetector for ${config.exercise} with startDirection: ${exerciseStartDir}`);
    
    repDetectorRef.current = new RepDetector({
      minVelocityThreshold: 0.03,   // 3cm/s - lowered to detect slower movements
      minPhaseDuration: 150,         // 150ms - faster response to phase changes
      directionChangeThreshold: 0.05, // 5cm/s - less sensitive to micro-changes
      startDirection: exerciseStartDir, // Use exercise-specific direction
    });
    
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
   * 
   * CRITICAL: This function MUST process poses in ALL phases, not just during isTracking.
   * The protection system needs continuous pose data to:
   * - Detect human presence
   * - Build stability frames
   * - Validate tracking point selection
   * 
   * If we only process when isTracking === true, the system will remain stuck
   * showing "N/A" for trackingPoint, humanPresence, and stability = 0
   * 
   * BUG FIXES:
   * - BUG 3: Velocity calculated with VelocityCalculator.update() each frame
   * - BUG 4: Rep detection uses RepDetector with full cycle detection
   * - BUG 5: Tracking point is read from landmark by INDEX, confidence checked
   */
  const processPose = useCallback((pose: PoseData | null) => {
    // Only check for protection system, NOT isTracking
    // We need to process frames in all phases for stability and human detection
    if (!protectionSystemRef.current) return;
    
    // Timestamp monotônico e ID do frame para integridade
    const frameTimestamp = pose?.timestamp || getFrameTimestamp();
    const frameId = getNextFrameId();
    
    // Detecção de frame drop
    const integrity = frameIntegrityRef.current.checkFrame(frameId, frameTimestamp);
    
    // Increment frame counter for debug logging
    frameCountRef.current++;
    
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
    
    // Only process velocity and rep counting when ACTIVELY TRACKING (recording phase)
    // Stability and human detection should work in all phases
    if (isTracking) {
      // Only process velocity if allowed (Stage 3+ is trackable)
      if (result.canCalculate && result.validationFlags.frameTrackable && result.smoothedPosition) {
        
        // ========================================
        // BUG 3 FIX: Calculate velocity using VelocityCalculator
        // Velocity is calculated inside the pose loop with smoothing
        // Formula: velocity = deltaPosition / deltaTime
        // Smoothing: Moving average over last 5 frames
        // ========================================
        // Proteção: pular cálculo de velocidade se frame degradado por drop
        if (velocityCalculatorRef.current && integrity.isValid) {
          const velocityResult = velocityCalculatorRef.current.update({
            x: result.smoothedPosition.x,
            y: result.smoothedPosition.y,
            timestamp: frameTimestamp,
          });
          
          // Update velocity state
          setCurrentVelocity(velocityResult.smoothedVelocity);
          
          // Update peak velocity
          if (velocityResult.smoothedVelocity > peakVelocity) {
            setPeakVelocity(velocityResult.smoothedVelocity);
          }
          
          // Calculate mean from all valid velocities
          const velocityBuffer = velocityCalculatorRef.current.getVelocityBuffer();
          if (velocityBuffer.length > 0) {
            const mean = velocityBuffer.reduce((a, b) => a + b, 0) / velocityBuffer.length;
            setMeanVelocity(mean);
          }
          
          // ========================================
          // VBT V2: Displacement-driven rep detection
          // MovementDetector → RepDetectorV2 → VBTAnalyzer
          // Velocity is for METRICS only, NOT for detection gating
          // ========================================
          
          // 1. Feed position to MovementDetector
          const movFrame = movementDetectorRef.current
            ? movementDetectorRef.current.update(result.smoothedPosition.y)
            : null;
          
          // 2. Feed displacement + velocity to RepDetectorV2
          if (repDetectorV2Ref.current && movFrame) {
            const repV2 = repDetectorV2Ref.current.update(
              movFrame.confirmedDirection,
              movFrame.phaseDisplacement,
              velocityResult.smoothedVelocity,
              frameTimestamp,
            );
            
            // DEBUG: Log every 30 frames
            if (frameCountRef.current % 30 === 0) {
              console.log('[VBT_V2] vel:', velocityResult.smoothedVelocity.toFixed(3),
                '| dir:', movFrame.confirmedDirection,
                '| disp:', movFrame.phaseDisplacement.toFixed(3),
                '| phase:', repV2.phase,
                '| reps:', repV2.repCount);
            }
            
            // Update rep phase
            setRepPhase(repV2.phase);
            
            // On direction change within V2 detection, reset phase displacement
            if (repV2.phase === 'eccentric' || repV2.phase === 'concentric') {
              // Phase displacement is managed by MovementDetector's confirmed direction changes
            }
            
            // Handle rep completion
            if (repV2.repCompleted && repV2.currentRep) {
              const newRepCount = repV2.repCount;
              setRepCount(newRepCount);
              
              // 3. Feed completed rep to VBTAnalyzer
              const analysis = vbtAnalyzerRef.current
                ? vbtAnalyzerRef.current.analyzeRep(
                    newRepCount,
                    repV2.currentRep.meanVelocity,
                    repV2.currentRep.peakVelocity
                  )
                : null;
              
              // Update VBT V2 state
              if (analysis) {
                setVelocityDrop(analysis.dropPercent);
                setRepClassification(analysis.classification);
                setIsCalibrating(analysis.isCalibrating);
                setCalibrationProgress(vbtAnalyzerRef.current?.getCalibrationProgress() ?? 0);
                setVbtBaseline(vbtAnalyzerRef.current?.getBaseline() ?? null);
                
                // Gauge progress
                const bl = vbtAnalyzerRef.current?.getBaseline();
                if (bl && bl > 0) {
                  setGaugeProgress(Math.min(1, repV2.currentRep.meanVelocity / bl));
                }
              } else {
                setVelocityDrop(0);
              }
              
              // Velocity trend
              if (repV2.currentRep.meanVelocity > prevVelocityRef.current * 1.05) {
                setVelocityTrend('up');
              } else if (repV2.currentRep.meanVelocity < prevVelocityRef.current * 0.95) {
                setVelocityTrend('down');
              } else {
                setVelocityTrend('stable');
              }
              prevVelocityRef.current = repV2.currentRep.meanVelocity;
              
              // Reset phase displacement for next rep
              movementDetectorRef.current?.resetPhase();
              
              // Add to reps data
              const newRepData: ProtectedRepData = {
                rep: newRepCount,
                meanVelocity: repV2.currentRep.meanVelocity,
                peakVelocity: repV2.currentRep.peakVelocity,
                velocityDrop: analysis?.dropPercent ?? 0,
                timestamp: repV2.currentRep.timestamp,
                trackingPointUsed: result.trackingPoint?.keypointName || '',
              };
              setRepsData(prev => [...prev, newRepData]);
              
              console.log(`[VBT_V2] ===== REP ${newRepCount} ===== mean=${repV2.currentRep.meanVelocity.toFixed(3)} peak=${repV2.currentRep.peakVelocity.toFixed(3)} drop=${analysis?.dropPercent.toFixed(1)}% class=${analysis?.classification}`);
            }
            
            // Feedback color based on VBTAnalyzer state
            if (vbtAnalyzerRef.current?.isCalibrationComplete()) {
              const liveDrop = vbtAnalyzerRef.current.getCurrentDrop(velocityResult.smoothedVelocity);
              if (liveDrop > 20) setFeedbackColor('red');
              else if (liveDrop > 10) setFeedbackColor('neutral');
              else if (velocityResult.smoothedVelocity > 0.05) setFeedbackColor('green');
              else setFeedbackColor('neutral');
              
              // Update live gauge
              const bl = vbtAnalyzerRef.current.getBaseline();
              if (bl && bl > 0 && velocityResult.smoothedVelocity > 0.01) {
                setGaugeProgress(Math.min(1, velocityResult.smoothedVelocity / bl));
              }
            } else {
              setFeedbackColor(velocityResult.smoothedVelocity > 0.05 ? 'green' : 'neutral');
            }
          }
        }
        
        // Legacy: Also update old tracker for backward compatibility
        if (trackerRef.current) {
          const barPosition: BarPosition = {
            x: result.smoothedPosition.x,
            y: result.smoothedPosition.y,
            confidence: 1,
            timestamp: getFrameTimestamp(),
          };
          trackerRef.current.processPosition(barPosition);
        }
      }
    }
  }, [isTracking, peakVelocity]);
  
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
      timestamp: getFrameTimestamp(),
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
    
    // ========================================
    // BUG 3 & 4 FIX: Reset new velocity and rep modules
    // ========================================
    if (velocityCalculatorRef.current) {
      velocityCalculatorRef.current.reset();
    }
    if (repDetectorRef.current) {
      repDetectorRef.current.reset();
    }
    
    // VBT V2: Initialize/reset new modules
    if (!movementDetectorRef.current) {
      movementDetectorRef.current = new MovementDetector();
    } else {
      movementDetectorRef.current.reset();
    }
    if (!repDetectorV2Ref.current) {
      repDetectorV2Ref.current = new RepDetectorV2({ startDirection: 'down' });
    } else {
      repDetectorV2Ref.current.reset();
    }
    if (!vbtAnalyzerRef.current) {
      vbtAnalyzerRef.current = new VBTAnalyzer();
    } else {
      vbtAnalyzerRef.current.reset();
    }
    prevVelocityRef.current = 0;
    setRepClassification('calibrating');
    setIsCalibrating(true);
    setCalibrationProgress(0);
    setVbtBaseline(null);
    setGaugeProgress(0);
    setVelocityTrend('stable');
    
    // Resetar monitor de integridade e contadores de frame para nova sessão
    frameIntegrityRef.current.reset();
    resetFrameTime();
    
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
            timestamp: getFrameTimestamp(),
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
    
    // Reset VBT V2 modules
    movementDetectorRef.current?.reset();
    repDetectorV2Ref.current?.reset();
    vbtAnalyzerRef.current?.reset();
    prevVelocityRef.current = 0;
    setRepClassification('calibrating');
    setIsCalibrating(true);
    setCalibrationProgress(0);
    setVbtBaseline(null);
    setGaugeProgress(0);
    setVelocityTrend('stable');
    
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
    
    // VBT V2 analysis
    repClassification,
    isCalibrating,
    calibrationProgress,
    vbtBaseline,
    gaugeProgress,
    velocityTrend,
    
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
