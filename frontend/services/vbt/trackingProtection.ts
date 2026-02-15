/**
 * VBT Tracking Protection System - PROGRESSIVE VALIDATION ARCHITECTURE
 * 
 * Implements 5-STAGE PROGRESSIVE VALIDATION PIPELINE to eliminate
 * circular dependencies between stabilization and tracking validation.
 * 
 * STAGE 1: FRAME_USABLE - Minimum entry requirement
 * STAGE 2: FRAME_STABLE - Temporal stabilization (INDEPENDENT of tracking)
 * STAGE 3: FRAME_TRACKABLE - Tracking eligibility (AFTER stabilization)
 * STAGE 4: FRAME_VALID - Movement validation
 * STAGE 5: FRAME_COUNTABLE - Rep counting eligibility
 * 
 * CRITICAL: Stabilization depends ONLY on pose detection, NOT tracking point.
 * This breaks the circular dependency that caused infinite stabilization loops.
 * 
 * STATE MACHINE: INITIALIZING → STABILIZING → READY → TRACKING → RECORDING
 */

import { vbtDiagnostics } from './diagnostics';
import { recordingController } from './recordingController';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface Keypoint {
  x: number;
  y: number;
  score: number;
  name: string;
}

export interface PoseData {
  keypoints: Keypoint[];
  timestamp: number;
}

export interface TrackingPoint {
  x: number;        // Normalized 0-1
  y: number;        // Normalized 0-1
  keypointName: string;
  isSet: boolean;
}

// NEW: Progressive validation states
export type ValidationStage = 
  | 'INITIALIZING'   // No pose detected yet
  | 'STABILIZING'    // Pose detected, accumulating stable frames
  | 'READY'          // Stabilization complete, waiting for tracking point
  | 'TRACKING'       // Tracking point valid, ready for movement
  | 'RECORDING';     // Active recording with valid movement

// Legacy state mapping for backward compatibility
export type TrackingState = 'noHuman' | 'ready' | 'executing';

// NEW: Progressive validation flags
export interface ValidationFlags {
  frameUsable: boolean;      // Stage 1: Pose exists with keypoints
  frameStable: boolean;      // Stage 2: Enough stable frames accumulated
  frameTrackable: boolean;   // Stage 3: Tracking point valid
  frameValid: boolean;       // Stage 4: Movement detected
  frameCountable: boolean;   // Stage 5: Ready for rep counting
}

export interface ProtectionConfig {
  minKeypointScore: number;           // Minimum confidence for keypoints (default 0.6)
  minUsableScore: number;             // NEW: Minimum score for frame_usable (default 0.3)
  trackingConfidenceThreshold: number; // NEW: Threshold for tracking point (default 0.5)
  requiredStableFrames: number;       // Consecutive valid frames needed (default 5)
  stabilityDecayRate: number;         // NEW: How fast stability decays (default 1)
  minMovementDelta: number;           // Minimum movement to detect (default 0.02)
  movingAverageWindow: number;        // Frames for smoothing (default 5)
  angularThreshold: number;           // Minimum angle change (default 5 degrees)
  velocityThreshold: number;          // NEW: Minimum velocity for countable (default 0.05)
  exerciseKeypoints: string[];        // Required keypoints for current exercise
}

export interface ProtectionResult {
  // Legacy fields
  state: TrackingState;
  isValid: boolean;
  canCalculate: boolean;
  canCountRep: boolean;
  trackingPoint: TrackingPoint | null;
  smoothedPosition: { x: number; y: number } | null;
  velocity: number;
  message: string;
  
  // NEW: Progressive validation fields
  validationStage: ValidationStage;
  validationFlags: ValidationFlags;
  stableFrameCount: number;
  stabilityProgress: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Default required keypoints by exercise type
export const EXERCISE_KEYPOINTS: Record<string, string[]> = {
  'Back Squat': ['left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle'],
  'Front Squat': ['left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle'],
  'Bench Press': ['left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist'],
  'Deadlift': ['left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_shoulder', 'right_shoulder'],
  'Power Clean': ['left_hip', 'right_hip', 'left_shoulder', 'right_shoulder', 'left_wrist', 'right_wrist'],
  'Hang Clean': ['left_hip', 'right_hip', 'left_shoulder', 'right_shoulder', 'left_wrist', 'right_wrist'],
  'Push Press': ['left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist'],
  'Hip Thrust': ['left_hip', 'right_hip', 'left_knee', 'right_knee'],
  'Leg Press': ['left_hip', 'right_hip', 'left_knee', 'right_knee'],
  'Shoulder Press': ['left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist'],
  'Pull Up': ['left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow'],
  'Row': ['left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist'],
};

// Recommended tracking point per exercise
export const RECOMMENDED_TRACKING_POINTS: Record<string, string> = {
  'Back Squat': 'left_hip',
  'Front Squat': 'left_hip',
  'Bench Press': 'left_wrist',
  'Deadlift': 'left_hip',
  'Power Clean': 'left_wrist',
  'Hang Clean': 'left_wrist',
  'Push Press': 'left_wrist',
  'Hip Thrust': 'left_hip',
  'Leg Press': 'left_knee',
  'Shoulder Press': 'left_wrist',
  'Pull Up': 'left_shoulder',
  'Row': 'left_elbow',
};

// Exercise movement direction type
// 'down' = eccentric-first (starts with descent): Squat, Bench Press, Hip Thrust
// 'up' = concentric-first (starts with lift): Deadlift, Power Clean, Hang Clean
export const EXERCISE_START_DIRECTION: Record<string, 'down' | 'up'> = {
  'Back Squat': 'down',
  'Front Squat': 'down',
  'Bench Press': 'down',
  'Deadlift': 'up',       // Starts from floor, lift UP first
  'Power Clean': 'up',     // Starts from floor, lift UP first
  'Hang Clean': 'up',      // Starts with pull UP
  'Push Press': 'down',    // Dip down first, then press
  'Hip Thrust': 'down',    // Lower first, then thrust up
  'Leg Press': 'down',
  'Shoulder Press': 'down',
  'Pull Up': 'up',         // Pull UP first
  'Row': 'up',             // Pull UP first
};

const DEFAULT_CONFIG: ProtectionConfig = {
  minKeypointScore: 0.6,
  minUsableScore: 0.3,              // NEW: Lower threshold for frame_usable
  trackingConfidenceThreshold: 0.5, // NEW: Separate threshold for tracking
  requiredStableFrames: 5,
  stabilityDecayRate: 1,            // NEW: Decay by 1 per unusable frame
  minMovementDelta: 0.02,
  movingAverageWindow: 5,
  angularThreshold: 5,
  velocityThreshold: 0.05,          // NEW: For frame_countable
  exerciseKeypoints: [],
};

// ============================================================================
// STAGE 1 & 2: FRAME USABILITY & STABILITY VALIDATOR
// ============================================================================

/**
 * FrameStabilityValidator - Handles STAGE 1 (FRAME_USABLE) and STAGE 2 (FRAME_STABLE)
 * 
 * CRITICAL: Stability depends ONLY on pose detection, NOT tracking point validation.
 * This breaks the circular dependency that caused infinite stabilization loops.
 */
export class FrameStabilityValidator {
  private config: ProtectionConfig;
  private stableFrameCount: number = 0;
  private consecutiveMissingFrames: number = 0;
  private lastFrameUsable: boolean = false;

  constructor(config: Partial<ProtectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * STAGE 1: Check if frame is USABLE (minimum entry requirement)
   * 
   * Criteria:
   * - pose !== null
   * - pose.keypoints exists
   * - pose.keypoints.length > 0
   * 
   * DOES NOT require:
   * - trackingPoint.isSet
   * - confidence >= 0.6
   * - movement thresholds
   * - velocity thresholds
   */
  checkFrameUsable(pose: PoseData | null): {
    frameUsable: boolean;
    keypointsCount: number;
    hasAnyKeypoint: boolean;
    message: string;
  } {
    // Frame is usable if pose exists with any keypoints
    const poseExists = pose !== null;
    const hasKeypoints = poseExists && pose.keypoints && pose.keypoints.length > 0;
    
    // Check if at least some keypoints have minimal confidence
    let hasAnyUsableKeypoint = false;
    if (hasKeypoints) {
      hasAnyUsableKeypoint = pose.keypoints.some(kp => kp.score >= this.config.minUsableScore);
    }
    
    const frameUsable = poseExists && hasKeypoints && hasAnyUsableKeypoint;
    this.lastFrameUsable = frameUsable;
    
    // Track consecutive missing frames
    if (!frameUsable) {
      this.consecutiveMissingFrames++;
    } else {
      this.consecutiveMissingFrames = 0;
    }

    return {
      frameUsable,
      keypointsCount: hasKeypoints ? pose.keypoints.length : 0,
      hasAnyKeypoint: hasAnyUsableKeypoint,
      message: frameUsable 
        ? `Frame usável: ${pose!.keypoints.length} keypoints detectados`
        : 'Frame não usável: pose não detectada ou sem keypoints válidos',
    };
  }

  /**
   * STAGE 2: Update stability counter and check if STABLE
   * 
   * CRITICAL CHANGE: Uses gradual increment/decrement instead of hard reset
   * 
   * if (frameUsable)
   *    stableFrames += 1
   * else
   *    stableFrames = Math.max(stableFrames - stabilityDecayRate, 0)
   * 
   * This prevents infinite stabilization loops.
   */
  updateStability(frameUsable: boolean): {
    frameStable: boolean;
    stableFrameCount: number;
    requiredFrames: number;
    stabilityProgress: number;
    message: string;
  } {
    // PROGRESSIVE STABILITY: Increment or decay, never hard reset
    if (frameUsable) {
      this.stableFrameCount++;
    } else {
      // Gradual decay instead of hard reset
      this.stableFrameCount = Math.max(this.stableFrameCount - this.config.stabilityDecayRate, 0);
    }
    
    // Only hard reset if pose missing for many consecutive frames
    if (this.consecutiveMissingFrames > this.config.requiredStableFrames * 2) {
      this.stableFrameCount = 0;
    }
    
    const frameStable = this.stableFrameCount >= this.config.requiredStableFrames;
    const stabilityProgress = Math.min(1, this.stableFrameCount / this.config.requiredStableFrames);
    
    // DIAGNOSTIC LOG
    vbtDiagnostics.logStabilityCheck(
      this.stableFrameCount,
      this.config.requiredStableFrames,
      frameStable
    );

    return {
      frameStable,
      stableFrameCount: this.stableFrameCount,
      requiredFrames: this.config.requiredStableFrames,
      stabilityProgress,
      message: frameStable
        ? 'Estabilização completa'
        : `Estabilizando... ${Math.round(stabilityProgress * 100)}%`,
    };
  }

  /**
   * Get current stability progress (0-1)
   */
  getStabilityProgress(): number {
    return Math.min(1, this.stableFrameCount / this.config.requiredStableFrames);
  }

  /**
   * Get current stable frame count
   */
  getStableFrameCount(): number {
    return this.stableFrameCount;
  }

  /**
   * Reset stability state
   */
  reset(): void {
    this.stableFrameCount = 0;
    this.consecutiveMissingFrames = 0;
    this.lastFrameUsable = false;
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<ProtectionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// LEGACY: HUMAN PRESENCE VALIDATOR (for backward compatibility)
// ============================================================================

export class HumanPresenceValidator {
  private config: ProtectionConfig;
  private consecutiveValidFrames: number = 0;
  private lastValidationResult: boolean = false;

  constructor(config: Partial<ProtectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate that required keypoints are present with sufficient confidence
   * NOTE: This is now used for TRACKING validation (Stage 3), not stabilization
   */
  validateKeypoints(pose: PoseData | null): {
    isValid: boolean;
    validKeypoints: Keypoint[];
    missingKeypoints: string[];
    lowestScore: number;
    message: string;
  } {
    if (!pose || !pose.keypoints || pose.keypoints.length === 0) {
      this.consecutiveValidFrames = 0;
      this.lastValidationResult = false;
      
      vbtDiagnostics.logHumanPresenceCheck(
        false, 0, this.config.exerciseKeypoints, [], 
        this.config.exerciseKeypoints, this.config.minKeypointScore, 0, false
      );
      
      return {
        isValid: false,
        validKeypoints: [],
        missingKeypoints: this.config.exerciseKeypoints,
        lowestScore: 0,
        message: 'Nenhuma pose detectada na câmera',
      };
    }

    const validKeypoints: Keypoint[] = [];
    const missingKeypoints: string[] = [];
    let lowestValidScore = 1.0;

    for (const requiredName of this.config.exerciseKeypoints) {
      const keypoint = pose.keypoints.find(kp => kp.name === requiredName);
      
      if (!keypoint) {
        missingKeypoints.push(requiredName);
      } else if (keypoint.score < this.config.minKeypointScore) {
        missingKeypoints.push(`${requiredName} (${(keypoint.score * 100).toFixed(0)}%)`);
        lowestValidScore = Math.min(lowestValidScore, keypoint.score);
      } else {
        validKeypoints.push(keypoint);
        lowestValidScore = Math.min(lowestValidScore, keypoint.score);
      }
    }

    const allValid = missingKeypoints.length === 0 && 
                     validKeypoints.length >= this.config.exerciseKeypoints.length;

    if (allValid) {
      this.consecutiveValidFrames++;
    } else {
      // Gradual decay for consistency with new architecture
      this.consecutiveValidFrames = Math.max(this.consecutiveValidFrames - 1, 0);
    }

    this.lastValidationResult = allValid;
    
    vbtDiagnostics.logHumanPresenceCheck(
      true, pose.keypoints.length, this.config.exerciseKeypoints,
      validKeypoints.map(kp => kp.name), missingKeypoints,
      this.config.minKeypointScore, lowestValidScore === 1.0 ? 0 : lowestValidScore, allValid
    );

    return {
      isValid: allValid,
      validKeypoints,
      missingKeypoints,
      lowestScore: lowestValidScore === 1.0 ? 0 : lowestValidScore,
      message: allValid 
        ? `Pose válida: ${validKeypoints.length} keypoints`
        : `Keypoints insuficientes: ${missingKeypoints.slice(0, 2).join(', ')}`,
    };
  }

  isStable(): boolean {
    return this.consecutiveValidFrames >= this.config.requiredStableFrames;
  }

  getStabilityProgress(): number {
    return Math.min(1, this.consecutiveValidFrames / this.config.requiredStableFrames);
  }

  reset(): void {
    this.consecutiveValidFrames = 0;
    this.lastValidationResult = false;
  }

  setExercise(exercise: string): void {
    this.config.exerciseKeypoints = EXERCISE_KEYPOINTS[exercise] || [];
    this.reset();
  }
}

// ============================================================================
// PROGRESSIVE STATE MACHINE
// ============================================================================

export type StateTransition = {
  from: ValidationStage;
  to: ValidationStage;
  condition: string;
  timestamp: number;
};

/**
 * ProgressiveStateMachine - New state machine with 5-stage validation
 * 
 * States: INITIALIZING → STABILIZING → READY → TRACKING → RECORDING
 * 
 * CRITICAL: STABILIZING depends ONLY on frameUsable and stableFrames
 * NOT on trackingPoint.isSet or tracking keypoint confidence
 */
export class ProgressiveStateMachine {
  private currentStage: ValidationStage = 'INITIALIZING';
  private lastStageChange: number = 0;
  private stageHistory: StateTransition[] = [];
  
  // Movement tracking
  private baselinePosition: { x: number; y: number } | null = null;
  private peakPosition: { x: number; y: number } | null = null;
  private movementDirection: 'up' | 'down' | 'stationary' = 'stationary';
  private repPhase: 'idle' | 'descending' | 'ascending' | 'completed' = 'idle';
  // REMOVED: isRecordingActive - now uses recordingController.isActive()

  constructor(private config: ProtectionConfig) {}

  /**
   * Get current validation stage
   */
  getStage(): ValidationStage {
    return this.currentStage;
  }

  /**
   * Map new stage to legacy state for backward compatibility
   */
  getLegacyState(): TrackingState {
    switch (this.currentStage) {
      case 'INITIALIZING':
      case 'STABILIZING':
        return 'noHuman';
      case 'READY':
      case 'TRACKING':
        return 'ready';
      case 'RECORDING':
        return 'executing';
      default:
        return 'noHuman';
    }
  }

  /**
   * Get rep phase
   */
  getRepPhase(): string {
    return this.repPhase;
  }

  // REMOVED: setRecordingActive() - now uses recordingController.isActive() directly
  // The recording state is controlled by RecordingController singleton

  /**
   * Update state based on validation flags
   * 
   * CRITICAL: State transitions follow strict hierarchy:
   * - STABILIZING depends ONLY on frameUsable
   * - READY requires frameStable
   * - TRACKING requires frameTrackable (tracking point valid)
   * - RECORDING requires active recording + movement
   */
  updateState(
    flags: ValidationFlags,
    currentPosition: { x: number; y: number } | null,
    movementDelta: number
  ): {
    stage: ValidationStage;
    legacyState: TrackingState;
    repCompleted: boolean;
    message: string;
  } {
    const previousStage = this.currentStage;
    let repCompleted = false;
    let message = '';

    // Read recording state from global controller - SINGLE SOURCE OF TRUTH
    const isRecordingActive = recordingController.isActive();

    // [RecordingController] Frame loop log
    console.log("[RecordingController] state:", recordingController.isActive());

    // [VBT_STATE_CHECK] DIAGNOSTIC LOG - MANDATORY
    console.log("[VBT_STATE_CHECK]", {
      stage: this.currentStage,
      recording: isRecordingActive,
      frameUsable: flags.frameUsable,
      frameStable: flags.frameStable,
      frameTrackable: flags.frameTrackable
    });

    // STAGE TRANSITIONS (strictly hierarchical)
    
    // If no usable frame → INITIALIZING
    if (!flags.frameUsable) {
      if (this.currentStage !== 'INITIALIZING') {
        this.transitionTo('INITIALIZING', 'No usable frame');
      }
      this.resetMovementTracking();
      message = 'Aguardando detecção de pose...';
      
      vbtDiagnostics.logStateMachineTransition(
        previousStage, 'INITIALIZING', false, false, 0,
        this.config.minMovementDelta, true, 'frameUsable === false'
      );
      
      return { stage: 'INITIALIZING', legacyState: 'noHuman', repCompleted: false, message };
    }

    // Frame usable but not stable → STABILIZING
    if (!flags.frameStable) {
      if (this.currentStage !== 'STABILIZING') {
        this.transitionTo('STABILIZING', 'Pose detected, stabilizing');
      }
      message = 'Estabilizando detecção...';
      
      vbtDiagnostics.logStateMachineTransition(
        previousStage, 'STABILIZING', true, false, movementDelta,
        this.config.minMovementDelta, true, 'frameStable === false'
      );
      
      return { stage: 'STABILIZING', legacyState: 'noHuman', repCompleted: false, message };
    }

    // Frame stable but not trackable → READY
    // This is where we BREAK THE CIRCULAR DEPENDENCY
    // System can reach READY without tracking point being set
    if (!flags.frameTrackable) {
      if (this.currentStage !== 'READY' && this.currentStage !== 'STABILIZING' && this.currentStage !== 'INITIALIZING') {
        // Allow transition back to READY if tracking lost
        this.transitionTo('READY', 'Tracking point not valid');
      } else if (this.currentStage === 'STABILIZING' || this.currentStage === 'INITIALIZING') {
        this.transitionTo('READY', 'Stabilization complete');
      }
      
      if (currentPosition) {
        this.baselinePosition = { ...currentPosition };
      }
      
      message = 'PRONTO - Defina o ponto de tracking para iniciar';
      
      vbtDiagnostics.logStateMachineTransition(
        previousStage, 'READY', true, true, movementDelta,
        this.config.minMovementDelta, false, null
      );
      
      return { stage: 'READY', legacyState: 'ready', repCompleted: false, message };
    }

    // TRACKING → RECORDING: Automatic transition when recordingController.isActive() === true
    // Frame trackable → Check if recording is active
    if (isRecordingActive) {
      // AUTOMATIC TRANSITION: TRACKING → RECORDING when recording is active
      if (this.currentStage !== 'RECORDING') {
        this.transitionTo('RECORDING', 'Recording active with valid tracking');
        this.repPhase = 'idle';
      }
    } else {
      // Not recording - stay in or transition to TRACKING
      if (this.currentStage !== 'TRACKING') {
        this.transitionTo('TRACKING', 'Tracking point valid');
      }
      message = 'TRACKING - Ponto de tracking válido, pronto para gravar';
      
      vbtDiagnostics.logStateMachineTransition(
        previousStage, 'TRACKING', true, true, movementDelta,
        this.config.minMovementDelta, false, null
      );
      
      return { stage: 'TRACKING', legacyState: 'ready', repCompleted: false, message };
    }

    // At this point: Recording is active with valid tracking → RECORDING state

    // Process movement during recording
    if (currentPosition && this.baselinePosition) {
      const deltaY = currentPosition.y - this.baselinePosition.y;
      
      // Detect movement direction
      const newDirection = deltaY > this.config.minMovementDelta ? 'down' : 
                          deltaY < -this.config.minMovementDelta ? 'up' : 'stationary';

      // Rep phase detection
      if (this.repPhase === 'idle' && Math.abs(deltaY) >= this.config.minMovementDelta) {
        this.repPhase = 'descending';
        message = 'Movimento detectado (fase excêntrica)';
      } else if (this.repPhase === 'descending' && newDirection === 'up') {
        this.repPhase = 'ascending';
        this.peakPosition = { ...currentPosition };
        message = 'Fase concêntrica (subindo)';
      } else if (this.repPhase === 'ascending' && 
                 Math.abs(currentPosition.y - this.baselinePosition.y) < this.config.minMovementDelta) {
        this.repPhase = 'completed';
        repCompleted = true;
        message = 'REPETIÇÃO COMPLETA!';
        
        // Reset for next rep
        setTimeout(() => {
          this.repPhase = 'idle';
          this.baselinePosition = currentPosition ? { ...currentPosition } : null;
          this.peakPosition = null;
        }, 100);
      }

      this.movementDirection = newDirection;
    } else if (currentPosition) {
      this.baselinePosition = { ...currentPosition };
    }

    const phaseLabel = {
      'idle': 'Aguardando movimento',
      'descending': 'Fase excêntrica',
      'ascending': 'Fase concêntrica',
      'completed': 'Completa'
    }[this.repPhase] || this.repPhase;

    vbtDiagnostics.logStateMachineTransition(
      previousStage, 'RECORDING', true, true, movementDelta,
      this.config.minMovementDelta, false, null
    );

    return { 
      stage: 'RECORDING', 
      legacyState: 'executing', 
      repCompleted, 
      message: message || `GRAVANDO: ${phaseLabel}` 
    };
  }

  /**
   * Transition to new stage
   */
  private transitionTo(newStage: ValidationStage, condition: string): void {
    if (this.currentStage !== newStage) {
      const transition: StateTransition = {
        from: this.currentStage,
        to: newStage,
        condition,
        timestamp: Date.now(),
      };
      this.stageHistory.push(transition);
      if (this.stageHistory.length > 50) {
        this.stageHistory.shift();
      }
      
      console.log(`[VBT_STATE] ${this.currentStage} → ${newStage}: ${condition}`);
      this.currentStage = newStage;
      this.lastStageChange = Date.now();
    }
  }

  /**
   * Reset movement tracking
   */
  resetMovementTracking(): void {
    this.baselinePosition = null;
    this.peakPosition = null;
    this.movementDirection = 'stationary';
    this.repPhase = 'idle';
  }

  /**
   * Get transition history
   */
  getHistory(): StateTransition[] {
    return [...this.stageHistory];
  }

  /**
   * Reset state machine
   */
  reset(): void {
    this.currentStage = 'INITIALIZING';
    this.lastStageChange = Date.now();
    this.stageHistory = [];
    this.resetMovementTracking();
    // NOTE: Recording state is NOT reset here - it's controlled by RecordingController
    // Call recordingController.reset() separately if needed
  }
}

// ============================================================================
// LEGACY STATE MACHINE (for backward compatibility)
// ============================================================================

export class TrackingStateMachine {
  private currentState: TrackingState = 'noHuman';
  private lastStateChange: number = 0;
  private stateHistory: Array<{ from: TrackingState; to: TrackingState; condition: string }> = [];
  
  private baselinePosition: { x: number; y: number } | null = null;
  private peakPosition: { x: number; y: number } | null = null;
  private movementDirection: 'up' | 'down' | 'stationary' = 'stationary';
  private repPhase: 'idle' | 'descending' | 'ascending' | 'completed' = 'idle';

  constructor(private config: ProtectionConfig) {}

  getState(): TrackingState {
    return this.currentState;
  }

  getRepPhase(): string {
    return this.repPhase;
  }

  transition(
    humanValid: boolean,
    humanStable: boolean,
    movementDelta: number,
    currentPosition: { x: number; y: number } | null
  ): { newState: TrackingState; repCompleted: boolean; message: string } {
    const previousState = this.currentState;
    let repCompleted = false;
    let message = '';

    if (!humanValid) {
      if (this.currentState !== 'noHuman') {
        this.transitionTo('noHuman', 'Human detection lost');
      }
      this.resetMovementTracking();
      
      vbtDiagnostics.logStateMachineTransition(
        previousState, 'noHuman', humanValid, humanStable, movementDelta,
        this.config.minMovementDelta, true, 'humanValid === false'
      );
      
      return { newState: 'noHuman', repCompleted: false, message: 'SEM PESSOA' };
    }

    if (!humanStable) {
      if (this.currentState !== 'noHuman') {
        this.transitionTo('noHuman', 'Detection unstable');
      }
      
      vbtDiagnostics.logStateMachineTransition(
        previousState, 'noHuman', humanValid, humanStable, movementDelta,
        this.config.minMovementDelta, true, 'humanStable === false'
      );
      
      return { newState: 'noHuman', repCompleted: false, message: 'Estabilizando...' };
    }

    if (this.currentState === 'noHuman') {
      this.transitionTo('ready', 'Human stable');
      if (currentPosition) {
        this.baselinePosition = { ...currentPosition };
      }
      
      vbtDiagnostics.logStateMachineTransition(
        previousState, 'ready', humanValid, humanStable, movementDelta,
        this.config.minMovementDelta, false, null
      );
      
      return { newState: 'ready', repCompleted: false, message: 'PRONTO' };
    }

    if (this.currentState === 'ready' && currentPosition) {
      if (movementDelta >= this.config.minMovementDelta) {
        this.transitionTo('executing', 'Movement detected');
        this.repPhase = 'descending';
        
        vbtDiagnostics.logStateMachineTransition(
          previousState, 'executing', humanValid, humanStable, movementDelta,
          this.config.minMovementDelta, false, null
        );
        
        return { newState: 'executing', repCompleted: false, message: 'EXECUTANDO' };
      }
      return { newState: 'ready', repCompleted: false, message: 'PRONTO' };
    }

    if (this.currentState === 'executing' && currentPosition && this.baselinePosition) {
      const deltaY = currentPosition.y - this.baselinePosition.y;
      const newDirection = deltaY > this.config.minMovementDelta ? 'down' : 
                          deltaY < -this.config.minMovementDelta ? 'up' : 'stationary';

      if (this.repPhase === 'descending' && newDirection === 'up') {
        this.repPhase = 'ascending';
        this.peakPosition = { ...currentPosition };
        message = 'Fase concêntrica';
      } else if (this.repPhase === 'ascending' && 
                 Math.abs(currentPosition.y - this.baselinePosition.y) < this.config.minMovementDelta) {
        this.repPhase = 'completed';
        repCompleted = true;
        message = 'REP COMPLETA!';
        
        setTimeout(() => {
          this.repPhase = 'idle';
          this.baselinePosition = currentPosition ? { ...currentPosition } : null;
          this.peakPosition = null;
        }, 100);
      }

      this.movementDirection = newDirection;

      if (movementDelta < this.config.minMovementDelta / 2 && this.repPhase === 'idle') {
        this.transitionTo('ready', 'Movement stopped');
        return { newState: 'ready', repCompleted, message: message || 'PRONTO' };
      }

      return { newState: 'executing', repCompleted, message: message || 'EXECUTANDO' };
    }

    return { newState: this.currentState, repCompleted, message: '' };
  }

  private transitionTo(newState: TrackingState, condition: string): void {
    if (this.currentState !== newState) {
      this.stateHistory.push({ from: this.currentState, to: newState, condition });
      if (this.stateHistory.length > 50) this.stateHistory.shift();
      this.currentState = newState;
      this.lastStateChange = Date.now();
    }
  }

  resetMovementTracking(): void {
    this.baselinePosition = null;
    this.peakPosition = null;
    this.movementDirection = 'stationary';
    this.repPhase = 'idle';
  }

  reset(): void {
    this.currentState = 'noHuman';
    this.lastStateChange = Date.now();
    this.stateHistory = [];
    this.resetMovementTracking();
  }
}

// ============================================================================
// STAGE 3: TRACKING POINT MANAGER
// ============================================================================

export class TrackingPointManager {
  private trackingPoint: TrackingPoint = {
    x: 0,
    y: 0,
    keypointName: '',
    isSet: false,
  };
  
  private positionHistory: Array<{ x: number; y: number; timestamp: number }> = [];
  private config: ProtectionConfig;
  private lastValidPosition: { x: number; y: number } | null = null;
  private lastVelocity: number = 0;

  constructor(config: Partial<ProtectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setTrackingPoint(x: number, y: number, keypointName: string): void {
    this.trackingPoint = { x, y, keypointName, isSet: true };
    this.positionHistory = [];
    this.lastValidPosition = null;
    this.lastVelocity = 0;
    console.log(`[VBT_TRACKING] Point SET: ${keypointName} at (${x.toFixed(3)}, ${y.toFixed(3)})`);
  }

  clearTrackingPoint(): void {
    console.log(`[VBT_TRACKING] Point CLEARED (was: ${this.trackingPoint.keypointName})`);
    this.trackingPoint = { x: 0, y: 0, keypointName: '', isSet: false };
    this.positionHistory = [];
    this.lastValidPosition = null;
    this.lastVelocity = 0;
  }

  getTrackingPoint(): TrackingPoint {
    return { ...this.trackingPoint };
  }

  isSet(): boolean {
    return this.trackingPoint.isSet;
  }

  /**
   * STAGE 3: Check if frame is TRACKABLE
   * 
   * This is called AFTER stabilization is achieved.
   * Uses separate trackingConfidenceThreshold (lower than strict validation).
   */
  checkFrameTrackable(pose: PoseData | null): {
    frameTrackable: boolean;
    position: { x: number; y: number } | null;
    confidence: number;
    message: string;
  } {
    if (!this.trackingPoint.isSet) {
      vbtDiagnostics.logTrackingPointCheck(
        false, null, false, 0, this.config.trackingConfidenceThreshold, false
      );
      
      return {
        frameTrackable: false,
        position: null,
        confidence: 0,
        message: 'Ponto de tracking não definido pelo coach',
      };
    }

    if (!pose || !pose.keypoints) {
      vbtDiagnostics.logTrackingPointCheck(
        true, this.trackingPoint.keypointName, false, 0, 
        this.config.trackingConfidenceThreshold, false
      );
      
      return {
        frameTrackable: false,
        position: null,
        confidence: 0,
        message: 'Sem dados de pose',
      };
    }

    const keypoint = pose.keypoints.find(kp => kp.name === this.trackingPoint.keypointName);

    if (!keypoint) {
      vbtDiagnostics.logTrackingPointCheck(
        true, this.trackingPoint.keypointName, false, 0,
        this.config.trackingConfidenceThreshold, false
      );
      
      return {
        frameTrackable: false,
        position: null,
        confidence: 0,
        message: `Ponto "${this.trackingPoint.keypointName}" não detectado`,
      };
    }

    // Use trackingConfidenceThreshold (lower than minKeypointScore)
    if (keypoint.score < this.config.trackingConfidenceThreshold) {
      vbtDiagnostics.logTrackingPointCheck(
        true, this.trackingPoint.keypointName, true, keypoint.score,
        this.config.trackingConfidenceThreshold, false
      );
      
      return {
        frameTrackable: false,
        position: { x: keypoint.x, y: keypoint.y }, // Still return position for reference
        confidence: keypoint.score,
        message: `Confiança baixa: ${(keypoint.score * 100).toFixed(0)}% (mín: ${(this.config.trackingConfidenceThreshold * 100).toFixed(0)}%)`,
      };
    }

    vbtDiagnostics.logTrackingPointCheck(
      true, this.trackingPoint.keypointName, true, keypoint.score,
      this.config.trackingConfidenceThreshold, true
    );

    return {
      frameTrackable: true,
      position: { x: keypoint.x, y: keypoint.y },
      confidence: keypoint.score,
      message: 'Ponto de tracking detectado',
    };
  }

  /**
   * Legacy method for backward compatibility
   */
  getTrackedPosition(pose: PoseData | null): {
    position: { x: number; y: number } | null;
    confidence: number;
    isValid: boolean;
    message: string;
  } {
    const result = this.checkFrameTrackable(pose);
    return {
      position: result.position,
      confidence: result.confidence,
      isValid: result.frameTrackable,
      message: result.message,
    };
  }

  /**
   * Get smoothed position using moving average
   */
  getSmoothedPosition(currentPosition: { x: number; y: number } | null): { x: number; y: number } | null {
    if (!currentPosition) return this.lastValidPosition;

    const now = Date.now();
    this.positionHistory.push({ ...currentPosition, timestamp: now });

    // Keep only recent positions
    const maxAge = 500; // ms
    this.positionHistory = this.positionHistory.filter(p => now - p.timestamp < maxAge);

    // Limit to window size
    while (this.positionHistory.length > this.config.movingAverageWindow) {
      this.positionHistory.shift();
    }

    if (this.positionHistory.length === 0) return currentPosition;

    // Calculate moving average
    const sumX = this.positionHistory.reduce((sum, p) => sum + p.x, 0);
    const sumY = this.positionHistory.reduce((sum, p) => sum + p.y, 0);
    
    this.lastValidPosition = {
      x: sumX / this.positionHistory.length,
      y: sumY / this.positionHistory.length,
    };

    return this.lastValidPosition;
  }

  /**
   * Calculate movement delta from position history
   */
  getMovementDelta(): number {
    if (this.positionHistory.length < 2) return 0;
    
    const latest = this.positionHistory[this.positionHistory.length - 1];
    const previous = this.positionHistory[this.positionHistory.length - 2];
    
    const deltaX = latest.x - previous.x;
    const deltaY = latest.y - previous.y;
    
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  }

  /**
   * Calculate velocity from position history
   */
  getVelocity(): number {
    if (this.positionHistory.length < 2) return 0;
    
    const latest = this.positionHistory[this.positionHistory.length - 1];
    const previous = this.positionHistory[this.positionHistory.length - 2];
    
    const deltaY = latest.y - previous.y;
    const deltaTime = (latest.timestamp - previous.timestamp) / 1000; // Convert to seconds
    
    if (deltaTime <= 0) return this.lastVelocity;
    
    this.lastVelocity = Math.abs(deltaY) / deltaTime;
    return this.lastVelocity;
  }

  reset(): void {
    this.positionHistory = [];
    this.lastValidPosition = null;
    this.lastVelocity = 0;
  }

  updateConfig(config: Partial<ProtectionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// STAGE 4 & 5: MOVEMENT & VELOCITY FILTER
// ============================================================================

export class NoiseFilter {
  private config: ProtectionConfig;
  private lastValidMovement: number = 0;
  private lastValidVelocity: number = 0;

  constructor(config: Partial<ProtectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * STAGE 4: Check if frame has VALID movement
   */
  checkFrameValid(movementDelta: number): {
    frameValid: boolean;
    filteredMovement: number;
  } {
    const passed = Math.abs(movementDelta) >= this.config.minMovementDelta;
    
    vbtDiagnostics.logNoiseFilter(
      movementDelta, passed ? movementDelta : 0, this.config.minMovementDelta, passed
    );
    
    if (passed) {
      this.lastValidMovement = movementDelta;
    }
    
    return {
      frameValid: passed,
      filteredMovement: passed ? movementDelta : 0,
    };
  }

  /**
   * STAGE 5: Check if frame is COUNTABLE (velocity threshold)
   */
  checkFrameCountable(velocity: number): {
    frameCountable: boolean;
    filteredVelocity: number;
  } {
    const passed = Math.abs(velocity) >= this.config.velocityThreshold;
    
    vbtDiagnostics.logVelocityFilter(
      velocity, passed ? velocity : 0, this.config.velocityThreshold, passed
    );
    
    if (passed) {
      this.lastValidVelocity = velocity;
    }
    
    return {
      frameCountable: passed,
      filteredVelocity: passed ? velocity : 0,
    };
  }

  filterMovement(delta: number): number {
    return this.checkFrameValid(delta).filteredMovement;
  }

  filterVelocity(velocity: number): number {
    return this.checkFrameCountable(velocity).filteredVelocity;
  }

  reset(): void {
    this.lastValidMovement = 0;
    this.lastValidVelocity = 0;
  }
}

// ============================================================================
// MAIN: TRACKING PROTECTION SYSTEM (Progressive Architecture)
// ============================================================================

export class TrackingProtectionSystem {
  private config: ProtectionConfig;
  
  // Stage validators
  private frameStabilityValidator: FrameStabilityValidator;
  private humanValidator: HumanPresenceValidator;
  private trackingPointManager: TrackingPointManager;
  private noiseFilter: NoiseFilter;
  
  // State machines
  private progressiveStateMachine: ProgressiveStateMachine;
  private legacyStateMachine: TrackingStateMachine; // For backward compatibility

  constructor(config: Partial<ProtectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.frameStabilityValidator = new FrameStabilityValidator(this.config);
    this.humanValidator = new HumanPresenceValidator(this.config);
    this.trackingPointManager = new TrackingPointManager(this.config);
    this.noiseFilter = new NoiseFilter(this.config);
    
    this.progressiveStateMachine = new ProgressiveStateMachine(this.config);
    this.legacyStateMachine = new TrackingStateMachine(this.config);
  }

  /**
   * Set tracking point (coach selection)
   */
  setTrackingPoint(x: number, y: number, keypointName: string): void {
    this.trackingPointManager.setTrackingPoint(x, y, keypointName);
  }

  /**
   * Clear tracking point
   */
  clearTrackingPoint(): void {
    this.trackingPointManager.clearTrackingPoint();
  }

  /**
   * Check if tracking point is set
   */
  isTrackingPointSet(): boolean {
    return this.trackingPointManager.isSet();
  }

  /**
   * Get tracking point
   */
  getTrackingPoint(): TrackingPoint {
    return this.trackingPointManager.getTrackingPoint();
  }

  // REMOVED: setRecordingActive() - Use recordingController.start()/stop() instead
  // Recording state is controlled by RecordingController singleton

  /**
   * MAIN: Process frame through 5-STAGE PROGRESSIVE VALIDATION PIPELINE
   * 
   * Stage 1: FRAME_USABLE - Pose exists with keypoints
   * Stage 2: FRAME_STABLE - Enough stable frames accumulated
   * Stage 3: FRAME_TRACKABLE - Tracking point valid
   * Stage 4: FRAME_VALID - Movement detected
   * Stage 5: FRAME_COUNTABLE - Ready for rep counting
   */
  processFrame(pose: PoseData | null): ProtectionResult {
    // START DIAGNOSTIC FRAME
    vbtDiagnostics.startFrame();

    // ========================================
    // STAGE 1: FRAME_USABLE
    // ========================================
    const usableResult = this.frameStabilityValidator.checkFrameUsable(pose);

    // ========================================
    // STAGE 2: FRAME_STABLE (INDEPENDENT of tracking point!)
    // ========================================
    const stabilityResult = this.frameStabilityValidator.updateStability(usableResult.frameUsable);

    // ========================================
    // STAGE 3: FRAME_TRACKABLE (only after stable)
    // ========================================
    let trackableResult = {
      frameTrackable: false,
      position: null as { x: number; y: number } | null,
      confidence: 0,
      message: 'Not checked (not stable)',
    };
    
    // Only check tracking AFTER stabilization is achieved
    if (stabilityResult.frameStable) {
      trackableResult = this.trackingPointManager.checkFrameTrackable(pose);
    }

    // ========================================
    // STAGE 4 & 5: FRAME_VALID & FRAME_COUNTABLE
    // ========================================
    let smoothedPosition: { x: number; y: number } | null = null;
    let movementDelta = 0;
    let velocity = 0;
    let frameValid = false;
    let frameCountable = false;

    if (trackableResult.frameTrackable && trackableResult.position) {
      smoothedPosition = this.trackingPointManager.getSmoothedPosition(trackableResult.position);
      movementDelta = this.trackingPointManager.getMovementDelta();
      velocity = this.trackingPointManager.getVelocity();
      
      const validResult = this.noiseFilter.checkFrameValid(movementDelta);
      frameValid = validResult.frameValid;
      
      const countableResult = this.noiseFilter.checkFrameCountable(velocity);
      frameCountable = countableResult.frameCountable;
    }

    // ========================================
    // Build validation flags
    // ========================================
    const validationFlags: ValidationFlags = {
      frameUsable: usableResult.frameUsable,
      frameStable: stabilityResult.frameStable,
      frameTrackable: trackableResult.frameTrackable,
      frameValid: frameValid,
      frameCountable: frameCountable,
    };

    // ========================================
    // Update state machine with flags
    // ========================================
    const stateResult = this.progressiveStateMachine.updateState(
      validationFlags,
      smoothedPosition,
      movementDelta
    );

    // ========================================
    // Determine capabilities based on stage
    // ========================================
    const stage = stateResult.stage;
    
    // canCalculate: Recording is allowed when state >= READY
    const canCalculate = stage === 'READY' || stage === 'TRACKING' || stage === 'RECORDING';
    
    // canCountRep: Only when fully valid and rep completed
    const canCountRep = stage === 'RECORDING' && stateResult.repCompleted;

    // ========================================
    // Log recording gate status
    // ========================================
    const recordingBlocked = !canCalculate;
    let recordingBlockReason: string | null = null;
    
    if (recordingBlocked) {
      if (!validationFlags.frameUsable) {
        recordingBlockReason = 'frameUsable === false (no pose)';
      } else if (!validationFlags.frameStable) {
        recordingBlockReason = `frameStable === false (${stabilityResult.stableFrameCount}/${stabilityResult.requiredFrames})`;
      }
    }
    
    vbtDiagnostics.logRecordingGate(
      false, // buttonPressed (unknown at this layer)
      stage === 'RECORDING',
      canCalculate,
      this.trackingPointManager.isSet(),
      stage,
      recordingBlocked,
      recordingBlockReason
    );

    // ========================================
    // Log rep counting status
    // ========================================
    vbtDiagnostics.logRepCounting(
      frameCountable,
      stage,
      this.progressiveStateMachine.getRepPhase(),
      canCountRep,
      !canCountRep,
      canCountRep ? null : `Stage: ${stage}, frameCountable: ${frameCountable}`
    );

    // ========================================
    // Log final decision
    // ========================================
    vbtDiagnostics.logFinalDecision(
      validationFlags.frameUsable && validationFlags.frameStable,
      validationFlags.frameTrackable && velocity > 0,
      canCountRep,
      canCalculate,
      canCalculate,
      stage
    );

    // END DIAGNOSTIC FRAME
    vbtDiagnostics.endFrame();

    // ========================================
    // Build and return result
    // ========================================
    return {
      // Legacy fields
      state: stateResult.legacyState,
      isValid: validationFlags.frameUsable && validationFlags.frameStable,
      canCalculate,
      canCountRep,
      trackingPoint: this.trackingPointManager.getTrackingPoint(),
      smoothedPosition,
      velocity: canCalculate && validationFlags.frameTrackable ? velocity : 0,
      message: stateResult.message,
      
      // NEW: Progressive validation fields
      validationStage: stage,
      validationFlags,
      stableFrameCount: stabilityResult.stableFrameCount,
      stabilityProgress: stabilityResult.stabilityProgress,
    };
  }

  /**
   * Get current validation stage
   */
  getValidationStage(): ValidationStage {
    return this.progressiveStateMachine.getStage();
  }

  /**
   * Get stability progress
   */
  getStabilityProgress(): number {
    return this.frameStabilityValidator.getStabilityProgress();
  }

  /**
   * Get rep phase
   */
  getRepPhase(): string {
    return this.progressiveStateMachine.getRepPhase();
  }

  /**
   * Check if movement delta is significant
   */
  isSignificantMovement(delta: number): boolean {
    return Math.abs(delta) >= this.config.minMovementDelta;
  }

  /**
   * Check if angle change is significant
   */
  isSignificantAngleChange(angleDelta: number): boolean {
    return Math.abs(angleDelta) >= this.config.angularThreshold;
  }

  /**
   * Set exercise (updates required keypoints)
   */
  setExercise(exercise: string): void {
    this.config.exerciseKeypoints = EXERCISE_KEYPOINTS[exercise] || [];
    this.humanValidator.setExercise(exercise);
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.frameStabilityValidator.reset();
    this.humanValidator.reset();
    this.trackingPointManager.reset();
    this.noiseFilter.reset();
    this.progressiveStateMachine.reset();
    this.legacyStateMachine.reset();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ProtectionConfig>): void {
    this.config = { ...this.config, ...config };
    this.frameStabilityValidator.updateConfig(this.config);
    this.trackingPointManager.updateConfig(this.config);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export const createTrackingProtection = (config: Partial<ProtectionConfig> = {}): TrackingProtectionSystem => {
  return new TrackingProtectionSystem(config);
};
