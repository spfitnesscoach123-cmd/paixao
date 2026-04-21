/**
 * RepDetectorV2 — Displacement-driven rep detection for VBT V2
 *
 * Key difference from V1:
 *   V1: velocity >= threshold → starts phase
 *   V2: displacement >= threshold → starts phase
 *       velocity is ONLY collected for metrics, NOT for transitions.
 *
 * State machine:
 *   idle → eccentric → concentric → lockout → idle   (eccentric-first)
 *   idle → concentric → eccentric → lockout → idle   (concentric-first)
 *
 * Rep is counted when the FULL cycle completes AND displacement is above minimum.
 */

import { getFrameTimestamp } from '../frameTime';

export type RepPhaseV2 =
  | 'idle'
  | 'eccentric'
  | 'concentric'
  | 'lockout';

export interface RepDataV2 {
  repNumber: number;
  meanVelocity: number;       // Mean concentric velocity (m/s)
  peakVelocity: number;       // Peak concentric velocity (m/s)
  eccentricVelocity: number;  // Mean eccentric velocity (m/s)
  duration: number;            // Total rep duration (ms)
  concentricDuration: number;
  eccentricDuration: number;
  eccentricDisplacement: number;
  concentricDisplacement: number;
  timestamp: number;
}

export interface RepDetectorV2Config {
  minPhaseDuration: number;          // Minimum phase duration (ms)
  repLockoutDuration: number;        // Cooldown after rep (ms)
  maxRepDuration: number;            // Abort if rep takes too long (ms)
  startDirection: 'down' | 'up';     // Eccentric-first or concentric-first
  minPhaseDisplacement: number;      // Min displacement per phase (normalized 0-1)
  // Plateau trigger — OR complement to reversal-based completion.
  // Restores V1's velocity-drop/stationary completion paths that V2 lost,
  // fixing the off-by-one where rep N was only committed when rep N+1 began.
  plateauConfirmMs: number;             // Sustained window required (Invariant 5)
  plateauVelocityThreshold: number;     // Vel below = plateau armed (Invariant 4a)
  plateauDisplacementEpsilon: number;   // Max phaseDisplacement growth in window (Invariant 4b)
}

export interface RepDetectorV2Result {
  phase: RepPhaseV2;
  repCompleted: boolean;
  currentRep: RepDataV2 | null;
  repCount: number;
}

const DEFAULT_CONFIG: RepDetectorV2Config = {
  minPhaseDuration: 150,
  repLockoutDuration: 300,
  maxRepDuration: 10000,
  startDirection: 'down',
  minPhaseDisplacement: 0.03,  // 3% of screen — lower than MovementDetector's 8% to allow partial tracking
  // Plateau trigger defaults (see checkPlateau). Values chosen so that:
  //  • top-hold (noise-only displacement) fires within 400ms
  //  • grinder sticking point (bar still moving ~0.03+/400ms) does NOT fire
  plateauConfirmMs: 400,
  plateauVelocityThreshold: 0.15,
  plateauDisplacementEpsilon: 0.015,
};

export class RepDetectorV2 {
  private config: RepDetectorV2Config;
  private phase: RepPhaseV2 = 'idle';
  private repCount = 0;

  // Phase timing
  private phaseStartTime = 0;
  private repStartTime = 0;
  private eccentricStartTime = 0;
  private concentricStartTime = 0;
  private lastRepTime = 0;

  // Displacement per phase
  private eccentricDisplacement = 0;
  private concentricDisplacement = 0;

  // Velocity tracking (metrics only)
  private eccentricVelocities: number[] = [];
  private concentricVelocities: number[] = [];
  private peakConcentricVelocity = 0;

  // Stored rep data
  private lastCompletedRep: RepDataV2 | null = null;

  // Plateau trigger state (reset on every phase transition)
  private plateauStartTime = 0;
  private plateauStartDisplacement = 0;

  constructor(config: Partial<RepDetectorV2Config> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main update — driven by DISPLACEMENT direction, not velocity.
   *
   * @param confirmedDirection  'up' | 'down' | 'hold' from MovementDetector
   * @param phaseDisplacement   displacement accumulated in current movement direction
   * @param velocity            smoothed velocity from VelocityCalculator (metrics only)
   * @param timestamp           frame timestamp
   */
  update(
    confirmedDirection: 'up' | 'down' | 'hold',
    phaseDisplacement: number,
    velocity: number,
    timestamp?: number,
  ): RepDetectorV2Result {
    const now = timestamp ?? getFrameTimestamp();
    const absVelocity = Math.abs(velocity);

    // Lockout cooldown
    if (this.phase === 'lockout') {
      if (now - this.lastRepTime >= this.config.repLockoutDuration) {
        this.transition('idle', now);
      }
      return this.result(false);
    }

    // Max duration guard
    if (this.phase !== 'idle' && now - this.repStartTime > this.config.maxRepDuration) {
      this.abort(now);
      return this.result(false);
    }

    let completed = false;

    switch (this.phase) {
      case 'idle':
        completed = this.onIdle(confirmedDirection, phaseDisplacement, absVelocity, now);
        break;
      case 'eccentric':
        completed = this.onEccentric(confirmedDirection, phaseDisplacement, absVelocity, now);
        break;
      case 'concentric':
        completed = this.onConcentric(confirmedDirection, phaseDisplacement, absVelocity, now);
        break;
    }

    return this.result(completed);
  }

  // ──────────── Phase handlers ────────────

  private onIdle(dir: string, disp: number, vel: number, now: number): boolean {
    const startDir = this.config.startDirection;
    if (dir === startDir) {
      this.repStartTime = now;
      if (startDir === 'down') {
        this.transition('eccentric', now);
        this.eccentricStartTime = now;
        this.eccentricDisplacement = disp;
        this.eccentricVelocities = vel > 0 ? [vel] : [];
      } else {
        this.transition('concentric', now);
        this.concentricStartTime = now;
        this.concentricDisplacement = disp;
        this.concentricVelocities = vel > 0 ? [vel] : [];
        this.peakConcentricVelocity = vel;
      }
    }
    return false;
  }

  private onEccentric(dir: string, disp: number, vel: number, now: number): boolean {
    // Collect metrics
    this.eccentricDisplacement = Math.max(this.eccentricDisplacement, disp);
    if (vel > 0) this.eccentricVelocities.push(vel);

    const elapsed = now - this.phaseStartTime;
    if (elapsed < this.config.minPhaseDuration) return false;

    if (this.config.startDirection === 'up') {
      // Concentric-first: eccentric completes the rep.
      // Invariant 2: displacement gate is mandatory for BOTH completion paths.
      if (this.eccentricDisplacement >= this.config.minPhaseDisplacement) {
        // Plateau trigger (OR complement to reversal) — off-by-one fix.
        if (this.checkPlateau(vel, disp, now)) {
          return this.complete(now);
        }
        // Existing reversal trigger — preserved unchanged.
        if (dir !== 'down') {
          return this.complete(now);
        }
      }
    } else {
      // Eccentric-first: transition to concentric when direction flips
      if (dir === 'up') {
        this.transition('concentric', now);
        this.concentricStartTime = now;
        this.concentricDisplacement = 0;
        this.concentricVelocities = vel > 0 ? [vel] : [];
        this.peakConcentricVelocity = vel;
      }
    }
    return false;
  }

  private onConcentric(dir: string, disp: number, vel: number, now: number): boolean {
    this.concentricDisplacement = Math.max(this.concentricDisplacement, disp);
    if (vel > 0) {
      this.concentricVelocities.push(vel);
      if (vel > this.peakConcentricVelocity) this.peakConcentricVelocity = vel;
    }

    const elapsed = now - this.phaseStartTime;
    if (elapsed < this.config.minPhaseDuration) return false;

    if (this.config.startDirection === 'up') {
      // Concentric-first: after concentric, expect eccentric
      if (dir === 'down') {
        this.transition('eccentric', now);
        this.eccentricStartTime = now;
        this.eccentricDisplacement = 0;
        this.eccentricVelocities = vel > 0 ? [vel] : [];
      }
    } else {
      // Eccentric-first: concentric completes the rep.
      // Invariant 2: displacement gate is mandatory for BOTH completion paths.
      if (this.concentricDisplacement >= this.config.minPhaseDisplacement) {
        // Plateau trigger (OR complement to reversal) — off-by-one fix.
        if (this.checkPlateau(vel, disp, now)) {
          return this.complete(now);
        }
        // Existing reversal trigger — preserved unchanged.
        if (dir !== 'up') {
          return this.complete(now);
        }
      }
    }
    return false;
  }

  // ──────────── Helpers ────────────

  private complete(now: number): boolean {
    this.repCount++;
    this.lastRepTime = now;

    const meanConc = this.mean(this.concentricVelocities);
    const meanEcc = this.mean(this.eccentricVelocities);

    this.lastCompletedRep = {
      repNumber: this.repCount,
      meanVelocity: round3(meanConc),
      peakVelocity: round3(this.peakConcentricVelocity),
      eccentricVelocity: round3(meanEcc),
      duration: now - this.repStartTime,
      concentricDuration: now - this.concentricStartTime,
      eccentricDuration: this.concentricStartTime - this.eccentricStartTime,
      eccentricDisplacement: round3(this.eccentricDisplacement),
      concentricDisplacement: round3(this.concentricDisplacement),
      timestamp: now,
    };

    console.log(`[RepDetectorV2] REP ${this.repCount} | meanV=${meanConc.toFixed(3)} | peakV=${this.peakConcentricVelocity.toFixed(3)} | eccDisp=${this.eccentricDisplacement.toFixed(3)} | concDisp=${this.concentricDisplacement.toFixed(3)}`);

    this.transition('lockout', now);
    this.clearPhaseData();
    return true;
  }

  private abort(now: number): void {
    console.log('[RepDetectorV2] Rep aborted (timeout)');
    this.transition('idle', now);
    this.clearPhaseData();
  }

  private transition(next: RepPhaseV2, now: number): void {
    this.phase = next;
    this.phaseStartTime = now;
    // Reset plateau tracker on any phase change — no dirty-time carry-over
    this.plateauStartTime = 0;
    this.plateauStartDisplacement = 0;
  }

  /**
   * Plateau trigger — OR complement to reversal-based completion.
   *
   * Off-by-one fix: V1 completed on velocity-drop OR stationary OR reversal.
   * V2 only kept reversal, so rep N was committed when rep N+1's descent was
   * confirmed — producing "1 physical rep = 0 counted". This helper restores
   * the missing completion path, tightly gated by DUAL signal (Invariant 4):
   *
   *   armed  = velocity below plateauVelocityThreshold
   *   stable = phaseDisplacement growth ≤ plateauDisplacementEpsilon
   *   time   = both held for ≥ plateauConfirmMs (Invariant 5: ≥400ms)
   *
   * Timer resets if either signal breaks (no dirty-time accumulation).
   * Caller MUST gate on minPhaseDisplacement + minPhaseDuration (Invariants 2, 3).
   */
  private checkPlateau(vel: number, disp: number, now: number): boolean {
    // Invariant 4a: velocity must be low to arm the window
    if (vel >= this.config.plateauVelocityThreshold) {
      this.plateauStartTime = 0;
      this.plateauStartDisplacement = 0;
      return false;
    }

    // Arm the window with the current displacement snapshot
    if (this.plateauStartTime === 0) {
      this.plateauStartTime = now;
      this.plateauStartDisplacement = disp;
      return false;
    }

    // Invariant 4b: displacement must stay stagnant across the window
    const displacementGrowth = disp - this.plateauStartDisplacement;
    if (displacementGrowth > this.config.plateauDisplacementEpsilon) {
      // Bar is still moving — restart window from here (no dirty-time)
      this.plateauStartTime = now;
      this.plateauStartDisplacement = disp;
      return false;
    }

    // Dual signal sustained — confirm after plateauConfirmMs
    return (now - this.plateauStartTime) >= this.config.plateauConfirmMs;
  }

  private clearPhaseData(): void {
    this.eccentricVelocities = [];
    this.concentricVelocities = [];
    this.peakConcentricVelocity = 0;
    this.eccentricDisplacement = 0;
    this.concentricDisplacement = 0;
  }

  private mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private result(completed: boolean): RepDetectorV2Result {
    return {
      phase: this.phase,
      repCompleted: completed,
      currentRep: completed ? this.lastCompletedRep : null,
      repCount: this.repCount,
    };
  }

  getPhase(): RepPhaseV2 { return this.phase; }
  getRepCount(): number { return this.repCount; }

  reset(): void {
    this.phase = 'idle';
    this.repCount = 0;
    this.phaseStartTime = 0;
    this.repStartTime = 0;
    this.eccentricStartTime = 0;
    this.concentricStartTime = 0;
    this.lastRepTime = 0;
    this.lastCompletedRep = null;
    this.plateauStartTime = 0;
    this.plateauStartDisplacement = 0;
    this.clearPhaseData();
  }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
