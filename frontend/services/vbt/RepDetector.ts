/**
 * RepDetector - Production-Grade Repetition Detection for VBT
 * 
 * Detects full rep cycles using velocity and direction analysis:
 * - Eccentric phase (descending/negative velocity)
 * - Transition at bottom
 * - Concentric phase (ascending/positive velocity)
 * - Rep completion at top
 * 
 * Prevents false positives with:
 * - Minimum velocity thresholds
 * - Minimum phase duration requirements
 * - Direction change detection with hysteresis
 * - Rep lockout period to prevent double counting
 */

export type RepPhase = 
  | 'idle'           // Waiting for movement
  | 'eccentric'      // Descending phase (bar going down)
  | 'transition'     // At bottom, changing direction
  | 'concentric'     // Ascending phase (bar going up)
  | 'lockout';       // At top, rep complete

export interface RepData {
  repNumber: number;
  meanVelocity: number;      // Mean concentric velocity (m/s)
  peakVelocity: number;      // Peak concentric velocity (m/s)
  eccentricVelocity: number; // Mean eccentric velocity (m/s)
  duration: number;          // Total rep duration (ms)
  concentricDuration: number; // Concentric phase duration (ms)
  eccentricDuration: number;  // Eccentric phase duration (ms)
  timestamp: number;          // Rep completion timestamp
  velocityDrop: number;       // Percentage drop from first rep
}

export interface RepDetectorConfig {
  minVelocityThreshold: number;      // Minimum velocity to detect movement (m/s)
  minPhaseDuration: number;          // Minimum phase duration (ms)
  directionChangeThreshold: number;  // Velocity threshold for direction change
  repLockoutDuration: number;        // Cooldown period after rep completion (ms)
  maxRepDuration: number;            // Maximum single rep duration (ms)
  startDirection: 'down' | 'up';     // Which direction starts the rep (eccentric-first vs concentric-first)
}

export interface RepDetectorResult {
  phase: RepPhase;
  repCompleted: boolean;
  currentRep: RepData | null;
  repCount: number;
}

const DEFAULT_CONFIG: RepDetectorConfig = {
  minVelocityThreshold: 0.03,    // 3cm/s minimum - lowered to detect slower movements
  minPhaseDuration: 150,          // 150ms minimum phase - lowered for faster reps
  directionChangeThreshold: 0.05, // 5cm/s - INCREASED to be less sensitive to micro-changes
  repLockoutDuration: 300,        // 300ms lockout after rep
  maxRepDuration: 10000,          // 10s maximum rep duration
  startDirection: 'down',         // Default: eccentric-first exercises (squat, bench)
};

/**
 * RepDetector Class
 * 
 * State machine for detecting complete repetition cycles
 * based on velocity and movement direction.
 */
export class RepDetector {
  private config: RepDetectorConfig;
  private currentPhase: RepPhase = 'idle';
  private repCount: number = 0;
  private firstRepMeanVelocity: number | null = null;
  
  // Phase tracking
  private phaseStartTime: number = 0;
  private repStartTime: number = 0;
  private eccentricStartTime: number = 0;
  private concentricStartTime: number = 0;
  private lastRepCompletionTime: number = 0;
  
  // Velocity tracking within phases
  private concentricVelocities: number[] = [];
  private eccentricVelocities: number[] = [];
  private peakConcentricVelocity: number = 0;
  
  // Direction tracking for hysteresis
  private lastDirection: 'up' | 'down' | 'stationary' = 'stationary';
  private directionChangeCount: number = 0;
  
  // CRITICAL: Store completed rep data BEFORE resetting arrays
  // This fixes the bug where meanVelocity was 0 in the result
  private lastCompletedRepData: RepData | null = null;

  constructor(config: Partial<RepDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update rep detector with new velocity data
   * Call this every frame with velocity from VelocityCalculator
   * 
   * @param velocity - Smoothed velocity in m/s (positive = up, negative = down)
   * @param direction - Movement direction from velocity calculator
   * @returns RepDetectorResult with current phase and rep completion status
   */
  update(velocity: number, direction: 'up' | 'down' | 'stationary'): RepDetectorResult {
    const now = Date.now();
    const absVelocity = Math.abs(velocity);
    
    // DEBUG: Log state machine updates (every 15th call to avoid spam)
    if (this.directionChangeCount++ % 15 === 0) {
      console.log('[RepDetector] STATE:', this.currentPhase, 
        '| vel:', absVelocity.toFixed(3), 
        '| dir:', direction, 
        '| eccCount:', this.eccentricVelocities.length,
        '| concCount:', this.concentricVelocities.length);
    }
    
    // Check if in lockout period
    if (this.currentPhase === 'lockout') {
      if (now - this.lastRepCompletionTime >= this.config.repLockoutDuration) {
        this.transitionToPhase('idle', now);
      }
      return this.createResult(false);
    }
    
    // Check for maximum rep duration exceeded
    if (this.currentPhase !== 'idle' && 
        now - this.repStartTime > this.config.maxRepDuration) {
      this.abortCurrentRep();
      return this.createResult(false);
    }
    
    // Process based on current phase
    let repCompleted = false;
    
    switch (this.currentPhase) {
      case 'idle':
        repCompleted = this.processIdle(velocity, direction, absVelocity, now);
        break;
        
      case 'eccentric':
        repCompleted = this.processEccentric(velocity, direction, absVelocity, now);
        break;
        
      case 'transition':
        repCompleted = this.processTransition(velocity, direction, absVelocity, now);
        break;
        
      case 'concentric':
        repCompleted = this.processConcentric(velocity, direction, absVelocity, now);
        break;
    }
    
    // Update direction tracking
    if (direction !== 'stationary') {
      this.lastDirection = direction;
    }
    
    return this.createResult(repCompleted);
  }

  /**
   * Process IDLE phase - waiting for movement to start
   */
  private processIdle(
    velocity: number,
    direction: 'up' | 'down' | 'stationary',
    absVelocity: number,
    now: number
  ): boolean {
    // Start eccentric phase when downward movement detected
    if (direction === 'down' && absVelocity >= this.config.minVelocityThreshold) {
      this.transitionToPhase('eccentric', now);
      this.repStartTime = now;
      this.eccentricStartTime = now;
      this.eccentricVelocities = [absVelocity];
      console.log('[RepDetector] Started ECCENTRIC phase');
    }
    
    return false;
  }

  /**
   * Process ECCENTRIC phase - descending movement
   * FIXED: Transition based on DIRECTION CHANGE, not velocity threshold
   */
  private processEccentric(
    velocity: number,
    direction: 'up' | 'down' | 'stationary',
    absVelocity: number,
    now: number
  ): boolean {
    // Track eccentric velocities
    if (direction === 'down' && absVelocity >= this.config.minVelocityThreshold) {
      this.eccentricVelocities.push(absVelocity);
    }
    
    // Check minimum phase duration
    const phaseDuration = now - this.phaseStartTime;
    if (phaseDuration < this.config.minPhaseDuration) {
      return false;
    }
    
    // FIXED: Detect transition based on DIRECTION CHANGE or velocity drop
    // When direction changes from 'down' to 'up' or 'stationary', we hit the bottom
    if (direction === 'up') {
      // Direct transition to concentric when direction changes
      this.transitionToPhase('concentric', now);
      this.concentricStartTime = now;
      this.concentricVelocities = [absVelocity];
      this.peakConcentricVelocity = absVelocity;
      console.log('[RepDetector] ECCENTRIC -> CONCENTRIC (direction change)');
      return false;
    }
    
    // Also transition if velocity drops significantly (stationary at bottom)
    if (direction === 'stationary' || absVelocity < this.config.directionChangeThreshold) {
      this.transitionToPhase('transition', now);
      console.log('[RepDetector] ECCENTRIC -> TRANSITION (velocity drop)');
    }
    
    return false;
  }

  /**
   * Process TRANSITION phase - at bottom, waiting for direction change
   */
  private processTransition(
    velocity: number,
    direction: 'up' | 'down' | 'stationary',
    absVelocity: number,
    now: number
  ): boolean {
    // Check for transition timeout (shouldn't stay here too long)
    const transitionDuration = now - this.phaseStartTime;
    if (transitionDuration > 1000) { // 1 second max transition
      // Long pause - might be resting, abort rep
      this.abortCurrentRep();
      return false;
    }
    
    // Start concentric phase when upward movement detected
    if (direction === 'up' && absVelocity >= this.config.minVelocityThreshold) {
      this.transitionToPhase('concentric', now);
      this.concentricStartTime = now;
      this.concentricVelocities = [absVelocity];
      this.peakConcentricVelocity = absVelocity;
      console.log('[RepDetector] Started CONCENTRIC phase');
    }
    
    return false;
  }

  /**
   * Process CONCENTRIC phase - ascending movement
   * Rep completes when velocity drops indicating lockout OR direction changes
   * IMPROVED: More robust detection with direction change
   */
  private processConcentric(
    velocity: number,
    direction: 'up' | 'down' | 'stationary',
    absVelocity: number,
    now: number
  ): boolean {
    // Track concentric velocities
    if (direction === 'up' && absVelocity >= this.config.minVelocityThreshold) {
      this.concentricVelocities.push(absVelocity);
      
      // Update peak velocity
      if (absVelocity > this.peakConcentricVelocity) {
        this.peakConcentricVelocity = absVelocity;
      }
    }
    
    // Check minimum phase duration
    const phaseDuration = now - this.phaseStartTime;
    if (phaseDuration < this.config.minPhaseDuration) {
      return false;
    }
    
    // IMPROVED: Detect rep completion with multiple conditions
    // 1. Direction reverses to down (next rep starting)
    // 2. Velocity drops to near-zero (lockout at top)
    // 3. Movement becomes stationary
    const isVelocityDropped = absVelocity < this.config.directionChangeThreshold;
    const isDirectionReversed = direction === 'down' && absVelocity >= this.config.minVelocityThreshold;
    const isStationary = direction === 'stationary' && this.concentricVelocities.length >= 2;
    
    if (isVelocityDropped || isDirectionReversed || isStationary) {
      console.log('[RepDetector] CONCENTRIC COMPLETE! reason:', 
        isVelocityDropped ? 'velocity_drop' : 
        isDirectionReversed ? 'direction_reversed' : 'stationary');
      return this.completeRep(now);
    }
    
    return false;
  }

  /**
   * Complete the current rep and record data
   * CRITICAL FIX: Store rep data BEFORE resetting velocity arrays
   */
  private completeRep(now: number): boolean {
    this.repCount++;
    this.lastRepCompletionTime = now;
    
    // Calculate rep metrics BEFORE resetting arrays
    const meanConcentricVelocity = this.calculateMean(this.concentricVelocities);
    const meanEccentricVelocity = this.calculateMean(this.eccentricVelocities);
    
    // Store first rep velocity as baseline
    if (this.firstRepMeanVelocity === null) {
      this.firstRepMeanVelocity = meanConcentricVelocity;
    }
    
    // Calculate velocity drop
    const velocityDrop = this.firstRepMeanVelocity > 0
      ? Math.max(0, ((this.firstRepMeanVelocity - meanConcentricVelocity) / this.firstRepMeanVelocity) * 100)
      : 0;
    
    // CRITICAL: Store the completed rep data BEFORE resetting arrays
    // This fixes the bug where createResult() returned 0 values
    this.lastCompletedRepData = {
      repNumber: this.repCount,
      meanVelocity: Math.round(meanConcentricVelocity * 1000) / 1000,
      peakVelocity: Math.round(this.peakConcentricVelocity * 1000) / 1000,
      eccentricVelocity: Math.round(meanEccentricVelocity * 1000) / 1000,
      duration: now - this.repStartTime,
      concentricDuration: now - this.concentricStartTime,
      eccentricDuration: this.concentricStartTime - this.eccentricStartTime,
      timestamp: now,
      velocityDrop: Math.round(velocityDrop * 10) / 10,
    };
    
    console.log(`[RepDetector] REP ${this.repCount} COMPLETE!`);
    console.log(`  Mean Velocity: ${meanConcentricVelocity.toFixed(3)} m/s`);
    console.log(`  Peak Velocity: ${this.peakConcentricVelocity.toFixed(3)} m/s`);
    console.log(`  Velocity Drop: ${velocityDrop.toFixed(1)}%`);
    console.log(`  Stored in lastCompletedRepData:`, this.lastCompletedRepData);
    
    // Transition to lockout
    this.transitionToPhase('lockout', now);
    
    // Reset phase tracking for next rep AFTER storing data
    this.concentricVelocities = [];
    this.eccentricVelocities = [];
    this.peakConcentricVelocity = 0;
    
    return true;
  }

  /**
   * Abort current rep (timeout or invalid movement)
   */
  private abortCurrentRep(): void {
    console.log('[RepDetector] Rep aborted - resetting to idle');
    this.transitionToPhase('idle', Date.now());
    this.concentricVelocities = [];
    this.eccentricVelocities = [];
    this.peakConcentricVelocity = 0;
  }

  /**
   * Transition to a new phase
   */
  private transitionToPhase(newPhase: RepPhase, timestamp: number): void {
    console.log(`[RepDetector] Phase transition: ${this.currentPhase} -> ${newPhase}`);
    this.currentPhase = newPhase;
    this.phaseStartTime = timestamp;
  }

  /**
   * Calculate mean of an array
   */
  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, v) => acc + v, 0);
    return sum / values.length;
  }

  /**
   * Create result object
   * CRITICAL FIX: Use lastCompletedRepData instead of recalculating from empty arrays
   */
  private createResult(repCompleted: boolean): RepDetectorResult {
    let currentRep: RepData | null = null;
    
    if (repCompleted && this.lastCompletedRepData) {
      // Use the stored data from completeRep() instead of recalculating
      // This fixes the bug where arrays were already cleared
      currentRep = this.lastCompletedRepData;
      
      console.log('[RepDetector] createResult using stored data:', currentRep);
    }
    
    return {
      phase: this.currentPhase,
      repCompleted,
      currentRep,
      repCount: this.repCount,
    };
  }

  /**
   * Get current rep count
   */
  getRepCount(): number {
    return this.repCount;
  }

  /**
   * Get current phase
   */
  getPhase(): RepPhase {
    return this.currentPhase;
  }

  /**
   * Get first rep mean velocity (baseline)
   */
  getBaselineVelocity(): number | null {
    return this.firstRepMeanVelocity;
  }

  /**
   * Calculate current velocity drop percentage
   */
  getCurrentVelocityDrop(currentMeanVelocity: number): number {
    if (!this.firstRepMeanVelocity || this.firstRepMeanVelocity <= 0) {
      return 0;
    }
    return Math.max(0, ((this.firstRepMeanVelocity - currentMeanVelocity) / this.firstRepMeanVelocity) * 100);
  }

  /**
   * Reset detector for new set
   */
  reset(): void {
    this.currentPhase = 'idle';
    this.repCount = 0;
    this.firstRepMeanVelocity = null;
    this.phaseStartTime = 0;
    this.repStartTime = 0;
    this.eccentricStartTime = 0;
    this.concentricStartTime = 0;
    this.lastRepCompletionTime = 0;
    this.concentricVelocities = [];
    this.eccentricVelocities = [];
    this.peakConcentricVelocity = 0;
    this.lastDirection = 'stationary';
    this.directionChangeCount = 0;
    this.lastCompletedRepData = null;  // Reset stored rep data
  }

  /**
   * Reset baseline velocity only (for new set comparison)
   */
  resetBaseline(): void {
    this.firstRepMeanVelocity = null;
  }
}

/**
 * Create a rep detector with custom configuration
 */
export function createRepDetector(
  config?: Partial<RepDetectorConfig>
): RepDetector {
  return new RepDetector(config);
}

export default RepDetector;
