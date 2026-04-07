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
      // Concentric-first: eccentric completes the rep
      if (dir !== 'down' && this.eccentricDisplacement >= this.config.minPhaseDisplacement) {
        return this.complete(now);
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
      // Eccentric-first: concentric completes the rep
      if (dir !== 'up' && this.concentricDisplacement >= this.config.minPhaseDisplacement) {
        return this.complete(now);
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
    this.clearPhaseData();
  }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
