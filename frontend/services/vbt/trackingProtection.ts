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
 */

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
      return {
        isValid: false,
        validKeypoints: [],
        missingKeypoints: this.config.exerciseKeypoints,
        message: 'No pose detected',
      };
    }

    const validKeypoints: Keypoint[] = [];
    const missingKeypoints: string[] = [];

    // Check each required keypoint
    for (const requiredName of this.config.exerciseKeypoints) {
      const keypoint = pose.keypoints.find(kp => kp.name === requiredName);
      
      if (!keypoint) {
        missingKeypoints.push(requiredName);
      } else if (keypoint.score < this.config.minKeypointScore) {
        missingKeypoints.push(`${requiredName} (low confidence: ${keypoint.score.toFixed(2)})`);
      } else {
        validKeypoints.push(keypoint);
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

    return {
      isValid: allValid,
      validKeypoints,
      missingKeypoints,
      message: allValid 
        ? `Valid pose: ${validKeypoints.length} keypoints detected`
        : `Missing/invalid keypoints: ${missingKeypoints.join(', ')}`,
    };
  }

  /**
   * Check if we have stable detection (required frames met)
   */
  isStable(): boolean {
    return this.consecutiveValidFrames >= this.config.requiredStableFrames;
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

    // STATE: noHuman
    if (!humanValid) {
      if (this.currentState !== 'noHuman') {
        this.transitionTo('noHuman', 'Lost human detection');
      }
      this.resetMovementTracking();
      return { newState: 'noHuman', repCompleted: false, message: 'No valid human detected' };
    }

    // STATE: ready (waiting for stable detection)
    if (!humanStable) {
      if (this.currentState !== 'noHuman') {
        this.transitionTo('noHuman', 'Unstable detection');
      }
      return { newState: 'noHuman', repCompleted: false, message: 'Waiting for stable detection...' };
    }

    // Human is valid and stable - can be "ready" or "executing"
    if (this.currentState === 'noHuman') {
      this.transitionTo('ready', 'Human detected and stable');
      
      // Set baseline position
      if (currentPosition) {
        this.baselinePosition = { ...currentPosition };
      }
      return { newState: 'ready', repCompleted: false, message: 'Ready - waiting for movement' };
    }

    // STATE: ready -> executing (movement detected)
    if (this.currentState === 'ready' && currentPosition) {
      if (movementDelta >= this.config.minMovementDelta) {
        this.transitionTo('executing', 'Significant movement detected');
        this.repPhase = 'descending';
        return { newState: 'executing', repCompleted: false, message: 'Movement detected - tracking...' };
      }
      return { newState: 'ready', repCompleted: false, message: 'Ready - waiting for movement' };
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
        message = 'Ascending phase';
      } else if (this.repPhase === 'ascending' && 
                 Math.abs(currentPosition.y - this.baselinePosition.y) < this.config.minMovementDelta) {
        // Returned to start position - rep complete
        this.repPhase = 'completed';
        repCompleted = true;
        message = 'Rep completed!';
        
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
        this.transitionTo('ready', 'Movement stopped');
        return { newState: 'ready', repCompleted, message: message || 'Movement stopped' };
      }

      return { newState: 'executing', repCompleted, message: message || `Tracking: ${this.repPhase}` };
    }

    return { newState: this.currentState, repCompleted, message: 'Unknown state' };
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
  }

  /**
   * Clear the tracking point
   */
  clearTrackingPoint(): void {
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
   * Returns null if point not found or confidence too low
   */
  getTrackedPosition(pose: PoseData | null): {
    position: { x: number; y: number } | null;
    confidence: number;
    isValid: boolean;
    message: string;
  } {
    if (!this.trackingPoint.isSet) {
      return {
        position: null,
        confidence: 0,
        isValid: false,
        message: 'Tracking point not set by coach',
      };
    }

    if (!pose || !pose.keypoints) {
      return {
        position: null,
        confidence: 0,
        isValid: false,
        message: 'No pose data available',
      };
    }

    // Find the specific keypoint
    const keypoint = pose.keypoints.find(kp => kp.name === this.trackingPoint.keypointName);

    if (!keypoint) {
      return {
        position: null,
        confidence: 0,
        isValid: false,
        message: `Keypoint "${this.trackingPoint.keypointName}" not detected`,
      };
    }

    if (keypoint.score < this.config.minKeypointScore) {
      return {
        position: null,
        confidence: keypoint.score,
        isValid: false,
        message: `Keypoint confidence too low: ${(keypoint.score * 100).toFixed(0)}%`,
      };
    }

    return {
      position: { x: keypoint.x, y: keypoint.y },
      confidence: keypoint.score,
      isValid: true,
      message: 'Tracking point detected',
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
   */
  filterMovement(delta: number): number {
    // Ignore movements smaller than threshold
    if (Math.abs(delta) < this.config.minMovementDelta) {
      return 0;
    }
    
    this.lastValidValue = delta;
    return delta;
  }

  /**
   * Filter velocity value
   */
  filterVelocity(velocity: number): number {
    // Ignore micro-velocities
    if (Math.abs(velocity) < 0.05) { // 5cm/s threshold
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
   */
  processFrame(pose: PoseData | null): ProtectionResult {
    // LAYER 1: Validate human presence
    const humanValidation = this.humanValidator.validateKeypoints(pose);
    const humanStable = this.humanValidator.isStable();

    // LAYER 3: Get tracking point position
    const trackingResult = this.trackingPointManager.getTrackedPosition(pose);
    
    // If tracking point not set, block everything
    if (!this.trackingPointManager.isSet()) {
      return {
        state: 'noHuman',
        isValid: false,
        canCalculate: false,
        canCountRep: false,
        trackingPoint: null,
        smoothedPosition: null,
        velocity: 0,
        message: 'Coach must set tracking point before recording',
      };
    }

    // If tracking point not valid, block
    if (!trackingResult.isValid) {
      return {
        state: 'noHuman',
        isValid: false,
        canCalculate: false,
        canCountRep: false,
        trackingPoint: this.trackingPointManager.getTrackingPoint(),
        smoothedPosition: null,
        velocity: 0,
        message: trackingResult.message,
      };
    }

    // Get smoothed position
    const smoothedPosition = this.trackingPointManager.getSmoothedPosition(trackingResult.position);
    
    // Get filtered movement delta
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

    // Determine what's allowed
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
