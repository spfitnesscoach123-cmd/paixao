/**
 * VBTAnalyzer — Performance analysis brain for VBT V2
 *
 * Decouples rep DETECTION from PERFORMANCE analysis.
 *
 * - Baseline = max(mean velocities of first N reps)
 * - Optional baseline update when a faster rep appears
 * - Drop % with calibration phase awareness
 * - Rep classification: FAST / NORMAL / FATIGUED / CALIBRATING
 */

export type RepClassification = 'fast' | 'normal' | 'fatigued' | 'calibrating';

export interface VBTRepAnalysis {
  repNumber: number;
  meanVelocity: number;
  peakVelocity: number;
  dropPercent: number;
  classification: RepClassification;
  isCalibrating: boolean;
}

export interface VBTAnalyzerConfig {
  calibrationReps: number;       // Reps needed to establish baseline (default: 3)
  allowBaselineUpdate: boolean;  // Update baseline when a faster rep appears
  fastThreshold: number;         // ratio >= this → FAST (default: 0.75)
  fatigueThreshold: number;      // ratio < this → FATIGUED (default: 0.50)
}

const DEFAULT_CONFIG: VBTAnalyzerConfig = {
  calibrationReps: 3,
  allowBaselineUpdate: true,
  fastThreshold: 0.75,
  fatigueThreshold: 0.50,
};

export class VBTAnalyzer {
  private config: VBTAnalyzerConfig;
  private calibrationVelocities: number[] = [];
  private baseline: number | null = null;
  private calibrated = false;
  private analyses: VBTRepAnalysis[] = [];

  constructor(config: Partial<VBTAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze a completed rep. During calibration phase (first N reps),
   * collects velocities and establishes baseline. After calibration,
   * calculates drop % and classifies.
   */
  analyzeRep(repNumber: number, meanVelocity: number, peakVelocity: number): VBTRepAnalysis {
    // Calibration phase
    if (!this.calibrated) {
      this.calibrationVelocities.push(meanVelocity);

      if (this.calibrationVelocities.length >= this.config.calibrationReps) {
        this.baseline = Math.max(...this.calibrationVelocities);
        this.calibrated = true;
        console.log('[VBTAnalyzer] Calibrated. Baseline:', this.baseline.toFixed(3), 'm/s');
      }

      const a: VBTRepAnalysis = {
        repNumber,
        meanVelocity,
        peakVelocity,
        dropPercent: 0,
        classification: 'calibrating',
        isCalibrating: !this.calibrated,
      };
      this.analyses.push(a);
      return a;
    }

    // Optional baseline bump
    if (this.config.allowBaselineUpdate && meanVelocity > this.baseline!) {
      console.log('[VBTAnalyzer] Baseline updated:', this.baseline!.toFixed(3), '->', meanVelocity.toFixed(3));
      this.baseline = meanVelocity;
    }

    const drop = this.baseline! > 0
      ? Math.max(0, ((this.baseline! - meanVelocity) / this.baseline!) * 100)
      : 0;

    const ratio = this.baseline! > 0 ? meanVelocity / this.baseline! : 1;
    let cls: RepClassification = 'normal';
    if (ratio >= this.config.fastThreshold) cls = 'fast';
    else if (ratio < this.config.fatigueThreshold) cls = 'fatigued';

    const a: VBTRepAnalysis = {
      repNumber,
      meanVelocity,
      peakVelocity,
      dropPercent: Math.round(drop * 10) / 10,
      classification: cls,
      isCalibrating: false,
    };
    this.analyses.push(a);
    return a;
  }

  /** Live drop % for the current (in-progress) rep velocity. */
  getCurrentDrop(currentMeanVelocity: number): number {
    if (!this.baseline || this.baseline <= 0) return 0;
    return Math.max(0, ((this.baseline - currentMeanVelocity) / this.baseline) * 100);
  }

  getBaseline(): number | null { return this.baseline; }
  isCalibrationComplete(): boolean { return this.calibrated; }
  getCalibrationProgress(): number {
    if (this.calibrated) return 100;
    return Math.round((this.calibrationVelocities.length / this.config.calibrationReps) * 100);
  }
  getAllAnalyses(): VBTRepAnalysis[] { return [...this.analyses]; }

  reset(): void {
    this.calibrationVelocities = [];
    this.baseline = null;
    this.calibrated = false;
    this.analyses = [];
  }
}
