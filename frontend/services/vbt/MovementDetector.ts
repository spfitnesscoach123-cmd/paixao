/**
 * MovementDetector — Displacement-based movement detection for VBT V2
 *
 * Detects movement direction and magnitude using position deltas ONLY.
 * Completely independent of velocity calculations.
 *
 * - Direction via deltaY with N-frame confirmation
 * - Cumulative displacement tracking per phase
 * - Minimum displacement threshold for movement validation
 */

export type MovementDirection = 'up' | 'down' | 'hold';

export interface MovementDetectorConfig {
  directionThreshold: number;   // Min deltaY to register direction (normalized 0-1)
  confirmationFrames: number;   // Consecutive frames to confirm direction change
  minDisplacement: number;      // Min cumulative displacement for valid movement (normalized)
}

export interface MovementFrame {
  direction: MovementDirection;
  confirmedDirection: MovementDirection;
  movementDetected: boolean;
  cumulativeDisplacement: number;
  phaseDisplacement: number;
  rawDeltaY: number;
}

const DEFAULT_CONFIG: MovementDetectorConfig = {
  directionThreshold: 0.005,  // 0.5% of screen
  confirmationFrames: 3,
  minDisplacement: 0.08,      // 8% of screen
};

export class MovementDetector {
  private config: MovementDetectorConfig;
  private lastY: number | null = null;
  private rawDirection: MovementDirection = 'hold';
  private confirmedDirection: MovementDirection = 'hold';
  private consecutiveSame: number = 0;
  private phaseDisplacement: number = 0;
  private cumulativeDisplacement: number = 0;

  constructor(config: Partial<MovementDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Feed a new Y position (normalized 0-1, Y increases downward).
   * Returns the current movement state.
   */
  update(y: number): MovementFrame {
    if (this.lastY === null) {
      this.lastY = y;
      return this.snap(0);
    }

    const deltaY = y - this.lastY;
    this.lastY = y;
    const absDelta = Math.abs(deltaY);

    // 1. Raw direction from delta
    let dir: MovementDirection = 'hold';
    if (deltaY > this.config.directionThreshold) dir = 'down';
    else if (deltaY < -this.config.directionThreshold) dir = 'up';

    // 2. Consecutive frame confirmation
    if (dir !== 'hold') {
      if (dir === this.rawDirection) {
        this.consecutiveSame++;
      } else {
        this.rawDirection = dir;
        this.consecutiveSame = 1;
      }
    }

    // 3. Promote to confirmed after N frames
    if (this.consecutiveSame >= this.config.confirmationFrames) {
      if (this.confirmedDirection !== this.rawDirection) {
        // Direction change → reset phase displacement
        this.phaseDisplacement = 0;
      }
      this.confirmedDirection = this.rawDirection;
    }

    // 4. Track displacement
    this.cumulativeDisplacement += absDelta;
    if (this.confirmedDirection !== 'hold') {
      this.phaseDisplacement += absDelta;
    }

    return this.snap(deltaY);
  }

  /** Reset displacement for the current phase (called after phase transition). */
  resetPhase(): void {
    this.phaseDisplacement = 0;
  }

  /** Full reset for a new set. */
  reset(): void {
    this.lastY = null;
    this.rawDirection = 'hold';
    this.confirmedDirection = 'hold';
    this.consecutiveSame = 0;
    this.phaseDisplacement = 0;
    this.cumulativeDisplacement = 0;
  }

  getConfirmedDirection(): MovementDirection { return this.confirmedDirection; }
  getPhaseDisplacement(): number { return this.phaseDisplacement; }

  private snap(deltaY: number): MovementFrame {
    return {
      direction: this.rawDirection,
      confirmedDirection: this.confirmedDirection,
      movementDetected: this.phaseDisplacement >= this.config.minDisplacement,
      cumulativeDisplacement: this.cumulativeDisplacement,
      phaseDisplacement: this.phaseDisplacement,
      rawDeltaY: deltaY,
    };
  }
}
