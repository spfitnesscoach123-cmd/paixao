/**
 * VBT Tracking Protection System
 * 
 * Implements 3 layers of protection for accurate rep counting:
 * 
 * LAYER 1: Human Presence Validation
 * - Requires minimum keypoints with confidence >= 0.6
 * - 5 consecutive valid frames before tracking
 * 
 * LAYER 2: State Machine Control
 * - States: "noHuman" | "ready" | "executing"
 * - Strict transitions prevent false positives
 * 
 * LAYER 3: Coach-Defined Tracking Point
 * - Manual point selection on screen
 * - All calculations use ONLY this point
 * 
 * DIAGNOSTIC INSTRUMENTATION: Added for debugging pipeline blockers
 */

import { vbtDiagnostics } from './diagnostics';

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

// Estados em português conforme especificação do usuário
// 'noHuman' = 'semPessoa'
// 'ready' = 'pronto'  
// 'executing' = 'executando'
export type TrackingState = 'noHuman' | 'ready' | 'executing';

export interface ProtectionConfig {
  minKeypointScore: number;           // Minimum confidence for keypoints (default 0.6)
  requiredStableFrames: number;       // Consecutive valid frames needed (default 5)
  minMovementDelta: number;           // Minimum movement to detect (default 0.02)
  movingAverageWindow: number;        // Frames for smoothing (default 5)
  angularThreshold: number;           // Minimum angle change (default 5 degrees)
  exerciseKeypoints: string[];        // Required keypoints for current exercise
}

export interface ProtectionResult {
  state: TrackingState;
  isValid: boolean;
  canCalculate: boolean;
  canCountRep: boolean;
  trackingPoint: TrackingPoint | null;
  smoothedPosition: { x: number; y: number } | null;
  velocity: number;
  message: string;
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

const DEFAULT_CONFIG: ProtectionConfig = {
  minKeypointScore: 0.6,
  requiredStableFrames: 5,
  minMovementDelta: 0.02,
  movingAverageWindow: 5,
  angularThreshold: 5,
  exerciseKeypoints: [],
};

// ============================================================================
// LAYER 1: HUMAN PRESENCE VALIDATION
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
   * CAMADA 1: Validação rígida de presença humana
   * INSTRUMENTED: Logs all validation checks
   */
  validateKeypoints(pose: PoseData | null): {
    isValid: boolean;
    validKeypoints: Keypoint[];
    missingKeypoints: string[];
    message: string;
  } {
    if (!pose || !pose.keypoints || pose.keypoints.length === 0) {
      this.consecutiveValidFrames = 0;
      this.lastValidationResult = false;
      
      // DIAGNOSTIC LOG
      vbtDiagnostics.logHumanPresenceCheck(
        false, // poseExists
        0, // keypointsCount
        this.config.exerciseKeypoints, // requiredKeypoints
        [], // validKeypoints
        this.config.exerciseKeypoints, // missingKeypoints
        this.config.minKeypointScore, // minScore
        0, // lowestScore
        false // passed
      );
      
      return {
        isValid: false,
        validKeypoints: [],
        missingKeypoints: this.config.exerciseKeypoints,
        message: 'Nenhuma pose detectada na câmera',
      };
    }

    const validKeypoints: Keypoint[] = [];
    const missingKeypoints: string[] = [];
    let lowestValidScore = 1.0;

    // Check each required keypoint
    for (const requiredName of this.config.exerciseKeypoints) {
      const keypoint = pose.keypoints.find(kp => kp.name === requiredName);
      
      if (!keypoint) {
        missingKeypoints.push(requiredName);
      } else if (keypoint.score < this.config.minKeypointScore) {
        missingKeypoints.push(`${requiredName} (confiança baixa: ${(keypoint.score * 100).toFixed(0)}%)`);
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
      this.consecutiveValidFrames = 0;
    }

    this.lastValidationResult = allValid;
    
    // DIAGNOSTIC LOG
    vbtDiagnostics.logHumanPresenceCheck(
      true, // poseExists
      pose.keypoints.length, // keypointsCount
      this.config.exerciseKeypoints, // requiredKeypoints
      validKeypoints.map(kp => kp.name), // validKeypoints
      missingKeypoints, // missingKeypoints
      this.config.minKeypointScore, // minScore
      lowestValidScore === 1.0 ? 0 : lowestValidScore, // lowestScore
      allValid // passed
    );

    return {
      isValid: allValid,
      validKeypoints,
      missingKeypoints,
      message: allValid 
        ? `Pose válida: ${validKeypoints.length} keypoints detectados`
        : `Pontos faltando/inválidos: ${missingKeypoints.slice(0, 3).join(', ')}${missingKeypoints.length > 3 ? '...' : ''}`,
    };
  }

  /**
   * Check if we have stable detection (required frames met)
   * INSTRUMENTED: Logs stability check
   */
  isStable(): boolean {
    const stable = this.consecutiveValidFrames >= this.config.requiredStableFrames;
    
    // DIAGNOSTIC LOG
    vbtDiagnostics.logStabilityCheck(
      this.consecutiveValidFrames,
      this.config.requiredStableFrames,
      stable
    );
    
    return stable;
  }

  /**
   * Get stability progress (0-1)
   */
  getStabilityProgress(): number {
    return Math.min(1, this.consecutiveValidFrames / this.config.requiredStableFrames);
  }

  /**
   * Reset validation state
   */
  reset(): void {
    this.consecutiveValidFrames = 0;
    this.lastValidationResult = false;
  }

  /**
   * Update exercise keypoints
   */
  setExercise(exercise: string): void {
    this.config.exerciseKeypoints = EXERCISE_KEYPOINTS[exercise] || [];
    this.reset();
  }
}

// ============================================================================
// LAYER 2: STATE MACHINE
// ============================================================================

export type StateTransition = {
  from: TrackingState;
  to: TrackingState;
  condition: string;
};

export class TrackingStateMachine {
  private currentState: TrackingState = 'noHuman';
  private lastStateChange: number = 0;
  private stateHistory: StateTransition[] = [];
  
  // Movement tracking for state transitions
  private baselinePosition: { x: number; y: number } | null = null;
  private peakPosition: { x: number; y: number } | null = null;
  private movementDirection: 'up' | 'down' | 'stationary' = 'stationary';
  private repPhase: 'idle' | 'descending' | 'ascending' | 'completed' = 'idle';

  constructor(private config: ProtectionConfig) {}

  /**
   * Get current state
   */
  getState(): TrackingState {
    return this.currentState;
  }

  /**
   * Attempt state transition based on conditions
   * INSTRUMENTED: Logs all transition attempts and blocking conditions
   * 
   * States (seguindo nomenclatura do usuário):
   * - 'noHuman' = 'semPessoa'
   * - 'ready' = 'pronto'
   * - 'executing' = 'executando'
   */
  transition(
    humanValid: boolean,
    humanStable: boolean,
    movementDelta: number,
    currentPosition: { x: number; y: number } | null
  ): { newState: TrackingState; repCompleted: boolean; message: string } {
    const previousState = this.currentState;
    let repCompleted = false;
    let message = '';
    let blocked = false;
    let blockReason: string | null = null;

    // STATE: noHuman (semPessoa)
    if (!humanValid) {
      if (this.currentState !== 'noHuman') {
        this.transitionTo('noHuman', 'Detecção de pessoa perdida');
      }
      this.resetMovementTracking();
      blocked = true;
      blockReason = 'humanValid === false';
      
      // DIAGNOSTIC LOG
      vbtDiagnostics.logStateMachineTransition(
        previousState,
        'noHuman',
        humanValid,
        humanStable,
        movementDelta,
        this.config.minMovementDelta,
        blocked,
        blockReason
      );
      
      return { newState: 'noHuman', repCompleted: false, message: 'SEM PESSOA - Nenhuma pessoa válida detectada' };
    }

    // STATE: Aguardando estabilidade (5 frames consecutivos)
    if (!humanStable) {
      if (this.currentState !== 'noHuman') {
        this.transitionTo('noHuman', 'Detecção instável');
      }
      blocked = true;
      blockReason = 'humanStable === false';
      
      // DIAGNOSTIC LOG
      vbtDiagnostics.logStateMachineTransition(
        previousState,
        'noHuman',
        humanValid,
        humanStable,
        movementDelta,
        this.config.minMovementDelta,
        blocked,
        blockReason
      );
      
      return { newState: 'noHuman', repCompleted: false, message: 'Aguardando detecção estável...' };
    }

    // Human is valid and stable - can transition to "ready" or "executing"
    if (this.currentState === 'noHuman') {
      this.transitionTo('ready', 'Pessoa detectada e estável');
      
      // Set baseline position
      if (currentPosition) {
        this.baselinePosition = { ...currentPosition };
      }
      
      // DIAGNOSTIC LOG
      vbtDiagnostics.logStateMachineTransition(
        previousState,
        'ready',
        humanValid,
        humanStable,
        movementDelta,
        this.config.minMovementDelta,
        false,
        null
      );
      
      return { newState: 'ready', repCompleted: false, message: 'PRONTO - Aguardando início do movimento' };
    }

    // STATE: ready -> executing (movement detected)
    if (this.currentState === 'ready' && currentPosition) {
      if (movementDelta >= this.config.minMovementDelta) {
        this.transitionTo('executing', 'Movimento significativo detectado');
        this.repPhase = 'descending';
        
        // DIAGNOSTIC LOG
        vbtDiagnostics.logStateMachineTransition(
          previousState,
          'executing',
          humanValid,
          humanStable,
          movementDelta,
          this.config.minMovementDelta,
          false,
          null
        );
        
        return { newState: 'executing', repCompleted: false, message: 'EXECUTANDO - Movimento detectado, rastreando...' };
      }
      
      // DIAGNOSTIC LOG - waiting for movement
      vbtDiagnostics.logStateMachineTransition(
        previousState,
        'ready',
        humanValid,
        humanStable,
        movementDelta,
        this.config.minMovementDelta,
        true,
        `movementDelta (${movementDelta.toFixed(4)}) < minMovementDelta (${this.config.minMovementDelta})`
      );
      
      return { newState: 'ready', repCompleted: false, message: 'PRONTO - Aguardando movimento' };
    }

    // STATE: executing (tracking movement)
    if (this.currentState === 'executing' && currentPosition && this.baselinePosition) {
      const deltaY = currentPosition.y - this.baselinePosition.y;
      
      // Detect movement direction
      const newDirection = deltaY > this.config.minMovementDelta ? 'down' : 
                          deltaY < -this.config.minMovementDelta ? 'up' : 'stationary';

      // Rep phase detection
      if (this.repPhase === 'descending' && newDirection === 'up') {
        // Bottom reached, now ascending
        this.repPhase = 'ascending';
        this.peakPosition = { ...currentPosition };
        message = 'Fase concêntrica (subindo)';
      } else if (this.repPhase === 'ascending' && 
                 Math.abs(currentPosition.y - this.baselinePosition.y) < this.config.minMovementDelta) {
        // Returned to start position - rep complete
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

      // Check if movement stopped (return to ready)
      if (movementDelta < this.config.minMovementDelta / 2 && this.repPhase === 'idle') {
        this.transitionTo('ready', 'Movimento parou');
        
        // DIAGNOSTIC LOG
        vbtDiagnostics.logStateMachineTransition(
          previousState,
          'ready',
          humanValid,
          humanStable,
          movementDelta,
          this.config.minMovementDelta,
          false,
          null
        );
        
        return { newState: 'ready', repCompleted, message: message || 'Movimento parou - aguardando' };
      }

      const phaseLabel = {
        'idle': 'Aguardando',
        'descending': 'Fase excêntrica',
        'ascending': 'Fase concêntrica',
        'completed': 'Completa'
      }[this.repPhase] || this.repPhase;

      // DIAGNOSTIC LOG
      vbtDiagnostics.logStateMachineTransition(
        previousState,
        'executing',
        humanValid,
        humanStable,
        movementDelta,
        this.config.minMovementDelta,
        false,
        null
      );

      return { newState: 'executing', repCompleted, message: message || `EXECUTANDO: ${phaseLabel}` };
    }

    // DIAGNOSTIC LOG - unknown state
    vbtDiagnostics.logStateMachineTransition(
      previousState,
      this.currentState,
      humanValid,
      humanStable,
      movementDelta,
      this.config.minMovementDelta,
      true,
      'Unknown state condition'
    );

    return { newState: this.currentState, repCompleted, message: 'Estado desconhecido' };
  }

  /**
   * Internal transition helper
   */
  private transitionTo(newState: TrackingState, condition: string): void {
    if (this.currentState === newState) return;

    this.stateHistory.push({
      from: this.currentState,
      to: newState,
      condition,
    });

    // Keep only last 20 transitions
    if (this.stateHistory.length > 20) {
      this.stateHistory.shift();
    }

    this.currentState = newState;
    this.lastStateChange = Date.now();
  }

  /**
   * Reset movement tracking
   */
  private resetMovementTracking(): void {
    this.baselinePosition = null;
    this.peakPosition = null;
    this.movementDirection = 'stationary';
    this.repPhase = 'idle';
  }

  /**
   * Get state history for debugging
   */
  getStateHistory(): StateTransition[] {
    return [...this.stateHistory];
  }

  /**
   * Full reset
   */
  reset(): void {
    this.currentState = 'noHuman';
    this.lastStateChange = 0;
    this.stateHistory = [];
    this.resetMovementTracking();
  }

  /**
   * Get current rep phase
   */
  getRepPhase(): string {
    return this.repPhase;
  }
}

// ============================================================================
// LAYER 3: COACH-DEFINED TRACKING POINT
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

  constructor(config: Partial<ProtectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the tracking point (coach selection)
   */
  setTrackingPoint(x: number, y: number, keypointName: string): void {
    this.trackingPoint = {
      x,
      y,
      keypointName,
      isSet: true,
    };
    this.positionHistory = [];
    console.log(`[VBT_DIAG][LAYER3] Tracking point SET: ${keypointName} at (${x.toFixed(3)}, ${y.toFixed(3)})`);
  }

  /**
   * Clear the tracking point
   */
  clearTrackingPoint(): void {
    console.log(`[VBT_DIAG][LAYER3] Tracking point CLEARED (was: ${this.trackingPoint.keypointName})`);
    this.trackingPoint = {
      x: 0,
      y: 0,
      keypointName: '',
      isSet: false,
    };
    this.positionHistory = [];
  }

  /**
   * Get current tracking point
   */
  getTrackingPoint(): TrackingPoint {
    return { ...this.trackingPoint };
  }

  /**
   * Check if tracking point is set
   */
  isSet(): boolean {
    return this.trackingPoint.isSet;
  }

  /**
   * Get the position of the tracking point from pose data
   * CAMADA 3: Ponto de tracking definido pelo coach
   * INSTRUMENTED: Logs all tracking point checks
   * Returns null if point not found or confidence too low
   */
  getTrackedPosition(pose: PoseData | null): {
    position: { x: number; y: number } | null;
    confidence: number;
    isValid: boolean;
    message: string;
  } {
    if (!this.trackingPoint.isSet) {
      // DIAGNOSTIC LOG
      vbtDiagnostics.logTrackingPointCheck(
        false, // isSet
        null, // keypointName
        false, // keypointFound
        0, // confidence
        this.config.minKeypointScore, // minConfidence
        false // passed
      );
      
      return {
        position: null,
        confidence: 0,
        isValid: false,
        message: 'Ponto de tracking não definido pelo coach',
      };
    }

    if (!pose || !pose.keypoints) {
      // DIAGNOSTIC LOG
      vbtDiagnostics.logTrackingPointCheck(
        true, // isSet
        this.trackingPoint.keypointName, // keypointName
        false, // keypointFound
        0, // confidence
        this.config.minKeypointScore, // minConfidence
        false // passed
      );
      
      return {
        position: null,
        confidence: 0,
        isValid: false,
        message: 'Sem dados de pose disponíveis',
      };
    }

    // Find the specific keypoint (LAYER 3: ONLY this point is used)
    const keypoint = pose.keypoints.find(kp => kp.name === this.trackingPoint.keypointName);

    if (!keypoint) {
      // DIAGNOSTIC LOG
      vbtDiagnostics.logTrackingPointCheck(
        true, // isSet
        this.trackingPoint.keypointName, // keypointName
        false, // keypointFound
        0, // confidence
        this.config.minKeypointScore, // minConfidence
        false // passed
      );
      
      return {
        position: null,
        confidence: 0,
        isValid: false,
        message: `Ponto "${this.trackingPoint.keypointName}" não detectado`,
      };
    }

    if (keypoint.score < this.config.minKeypointScore) {
      // DIAGNOSTIC LOG
      vbtDiagnostics.logTrackingPointCheck(
        true, // isSet
        this.trackingPoint.keypointName, // keypointName
        true, // keypointFound
        keypoint.score, // confidence
        this.config.minKeypointScore, // minConfidence
        false // passed
      );
      
      return {
        position: null,
        confidence: keypoint.score,
        isValid: false,
        message: `Confiança do ponto muito baixa: ${(keypoint.score * 100).toFixed(0)}% (mín: 60%)`,
      };
    }

    // DIAGNOSTIC LOG - SUCCESS
    vbtDiagnostics.logTrackingPointCheck(
      true, // isSet
      this.trackingPoint.keypointName, // keypointName
      true, // keypointFound
      keypoint.score, // confidence
      this.config.minKeypointScore, // minConfidence
      true // passed
    );

    return {
      position: { x: keypoint.x, y: keypoint.y },
      confidence: keypoint.score,
      isValid: true,
      message: 'Ponto de tracking detectado',
    };
  }

  /**
   * Apply moving average smoothing to position
   */
  getSmoothedPosition(currentPosition: { x: number; y: number } | null): { x: number; y: number } | null {
    if (!currentPosition) {
      return null;
    }

    // Add to history
    this.positionHistory.push({
      x: currentPosition.x,
      y: currentPosition.y,
      timestamp: Date.now(),
    });

    // Keep only window size
    while (this.positionHistory.length > this.config.movingAverageWindow) {
      this.positionHistory.shift();
    }

    // Calculate moving average
    if (this.positionHistory.length < 2) {
      return currentPosition;
    }

    const sumX = this.positionHistory.reduce((sum, pos) => sum + pos.x, 0);
    const sumY = this.positionHistory.reduce((sum, pos) => sum + pos.y, 0);

    return {
      x: sumX / this.positionHistory.length,
      y: sumY / this.positionHistory.length,
    };
  }

  /**
   * Calculate movement delta from last position
   */
  getMovementDelta(): number {
    if (this.positionHistory.length < 2) {
      return 0;
    }

    const prev = this.positionHistory[this.positionHistory.length - 2];
    const curr = this.positionHistory[this.positionHistory.length - 1];

    const deltaX = curr.x - prev.x;
    const deltaY = curr.y - prev.y;

    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  }

  /**
   * Calculate velocity (units per second)
   */
  getVelocity(): number {
    if (this.positionHistory.length < 2) {
      return 0;
    }

    const prev = this.positionHistory[this.positionHistory.length - 2];
    const curr = this.positionHistory[this.positionHistory.length - 1];

    const timeDelta = (curr.timestamp - prev.timestamp) / 1000; // seconds
    if (timeDelta <= 0) return 0;

    const deltaY = curr.y - prev.y;
    
    // Negative because Y increases downward, but we want upward movement to be positive
    return -deltaY / timeDelta;
  }

  /**
   * Reset position history
   */
  reset(): void {
    this.positionHistory = [];
  }
}

// ============================================================================
// NOISE FILTER
// ============================================================================

export class NoiseFilter {
  private config: ProtectionConfig;
  private lastValidValue: number = 0;

  constructor(config: Partial<ProtectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Filter out micro-movements (noise)
   * INSTRUMENTED: Logs filtering decisions
   */
  filterMovement(delta: number): number {
    // Ignore movements smaller than threshold
    const passed = Math.abs(delta) >= this.config.minMovementDelta;
    
    // DIAGNOSTIC LOG
    vbtDiagnostics.logNoiseFilter(
      delta,
      passed ? delta : 0,
      this.config.minMovementDelta,
      passed
    );
    
    if (!passed) {
      return 0;
    }
    
    this.lastValidValue = delta;
    return delta;
  }

  /**
   * Filter velocity value
   * INSTRUMENTED: Logs filtering decisions
   */
  filterVelocity(velocity: number): number {
    const threshold = 0.05; // 5cm/s threshold
    const passed = Math.abs(velocity) >= threshold;
    
    // DIAGNOSTIC LOG
    vbtDiagnostics.logVelocityFilter(
      velocity,
      passed ? velocity : 0,
      threshold,
      passed
    );
    
    // Ignore micro-velocities
    if (!passed) {
      return 0;
    }
    return velocity;
  }

  /**
   * Check if angular change is significant
   */
  isSignificantAngleChange(angleDelta: number): boolean {
    return Math.abs(angleDelta) >= this.config.angularThreshold;
  }

  reset(): void {
    this.lastValidValue = 0;
  }
}

// ============================================================================
// MAIN PROTECTION SYSTEM
// ============================================================================

export class TrackingProtectionSystem {
  private humanValidator: HumanPresenceValidator;
  private stateMachine: TrackingStateMachine;
  private trackingPointManager: TrackingPointManager;
  private noiseFilter: NoiseFilter;
  private config: ProtectionConfig;

  constructor(config: Partial<ProtectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.humanValidator = new HumanPresenceValidator(this.config);
    this.stateMachine = new TrackingStateMachine(this.config);
    this.trackingPointManager = new TrackingPointManager(this.config);
    this.noiseFilter = new NoiseFilter(this.config);
  }

  /**
   * Set the exercise type (updates required keypoints)
   */
  setExercise(exercise: string): void {
    this.config.exerciseKeypoints = EXERCISE_KEYPOINTS[exercise] || [];
    this.humanValidator.setExercise(exercise);
  }

  /**
   * Set the tracking point (LAYER 3)
   */
  setTrackingPoint(x: number, y: number, keypointName: string): void {
    this.trackingPointManager.setTrackingPoint(x, y, keypointName);
  }

  /**
   * Get recommended tracking point for exercise
   */
  getRecommendedTrackingPoint(exercise: string): string {
    return RECOMMENDED_TRACKING_POINTS[exercise] || 'left_hip';
  }

  /**
   * Process a frame through all 3 protection layers
   * 
   * LAYER 1: Human Presence Validation
   * LAYER 2: State Machine Control  
   * LAYER 3: Coach-Defined Tracking Point
   */
  processFrame(pose: PoseData | null): ProtectionResult {
    // LAYER 3: FIRST - Check if tracking point is set (MANDATORY)
    if (!this.trackingPointManager.isSet()) {
      return {
        state: 'noHuman',
        isValid: false,
        canCalculate: false,
        canCountRep: false,
        trackingPoint: null,
        smoothedPosition: null,
        velocity: 0,
        message: 'BLOQUEADO: Coach deve definir ponto de tracking antes de gravar',
      };
    }

    // LAYER 1: Validate human presence (keypoints with score >= 0.6)
    const humanValidation = this.humanValidator.validateKeypoints(pose);
    const humanStable = this.humanValidator.isStable();
    
    // If no valid human keypoints, block everything
    if (!humanValidation.isValid) {
      this.stateMachine.transition(false, false, 0, null);
      return {
        state: 'noHuman',
        isValid: false,
        canCalculate: false,
        canCountRep: false,
        trackingPoint: this.trackingPointManager.getTrackingPoint(),
        smoothedPosition: null,
        velocity: 0,
        message: `BLOQUEADO: ${humanValidation.message}`,
      };
    }
    
    // If not stable (5 consecutive valid frames), block calculations
    if (!humanStable) {
      const progress = Math.round(this.humanValidator.getStabilityProgress() * 100);
      return {
        state: 'noHuman',
        isValid: true,
        canCalculate: false,
        canCountRep: false,
        trackingPoint: this.trackingPointManager.getTrackingPoint(),
        smoothedPosition: null,
        velocity: 0,
        message: `Estabilizando detecção... ${progress}% (${this.config.requiredStableFrames} frames necessários)`,
      };
    }

    // LAYER 3: Get tracking point position from pose
    const trackingResult = this.trackingPointManager.getTrackedPosition(pose);
    
    // If tracking point not detected or low confidence, block
    if (!trackingResult.isValid) {
      return {
        state: 'noHuman',
        isValid: false,
        canCalculate: false,
        canCountRep: false,
        trackingPoint: this.trackingPointManager.getTrackingPoint(),
        smoothedPosition: null,
        velocity: 0,
        message: `BLOQUEADO: ${trackingResult.message}`,
      };
    }

    // Get smoothed position (moving average)
    const smoothedPosition = this.trackingPointManager.getSmoothedPosition(trackingResult.position);
    
    // Get filtered movement delta (ignore micro-variations)
    const rawDelta = this.trackingPointManager.getMovementDelta();
    const filteredDelta = this.noiseFilter.filterMovement(rawDelta);
    
    // Get filtered velocity
    const rawVelocity = this.trackingPointManager.getVelocity();
    const filteredVelocity = this.noiseFilter.filterVelocity(rawVelocity);

    // LAYER 2: State machine transition
    const stateResult = this.stateMachine.transition(
      humanValidation.isValid,
      humanStable,
      filteredDelta,
      smoothedPosition
    );

    // Determine what's allowed based on state
    const canCalculate = stateResult.newState !== 'noHuman' && trackingResult.isValid;
    const canCountRep = stateResult.newState === 'executing' && stateResult.repCompleted;

    return {
      state: stateResult.newState,
      isValid: humanValidation.isValid && trackingResult.isValid,
      canCalculate,
      canCountRep,
      trackingPoint: this.trackingPointManager.getTrackingPoint(),
      smoothedPosition,
      velocity: canCalculate ? filteredVelocity : 0,
      message: stateResult.message,
    };
  }

  /**
   * Get current state
   */
  getState(): TrackingState {
    return this.stateMachine.getState();
  }

  /**
   * Get stability progress
   */
  getStabilityProgress(): number {
    return this.humanValidator.getStabilityProgress();
  }

  /**
   * Get tracking point
   */
  getTrackingPoint(): TrackingPoint {
    return this.trackingPointManager.getTrackingPoint();
  }

  /**
   * Check if tracking point is set
   */
  isTrackingPointSet(): boolean {
    return this.trackingPointManager.isSet();
  }

  /**
   * Get rep phase
   */
  getRepPhase(): string {
    return this.stateMachine.getRepPhase();
  }

  /**
   * Clear tracking point
   */
  clearTrackingPoint(): void {
    this.trackingPointManager.clearTrackingPoint();
  }

  /**
   * Full reset
   */
  reset(): void {
    this.humanValidator.reset();
    this.stateMachine.reset();
    this.trackingPointManager.reset();
    this.noiseFilter.reset();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const createProtectionSystem = (config?: Partial<ProtectionConfig>): TrackingProtectionSystem => {
  return new TrackingProtectionSystem(config);
};
