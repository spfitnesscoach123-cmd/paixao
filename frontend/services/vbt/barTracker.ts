/**
 * VBT Bar Tracking Service
 * 
 * This module provides barbell tracking functionality for Velocity Based Training.
 * 
 * ARCHITECTURE:
 * - Uses a strategy pattern for easy swapping between simulation and real tracking
 * - Real tracking requires native build with react-native-vision-camera + MediaPipe
 * - Simulation mode works on web preview for development/testing
 * 
 * PHYSICS MODEL:
 * - Tracks vertical displacement of barbell markers
 * - Calculates instantaneous velocity: v = Δy / Δt
 * - Detects concentric (lifting) and eccentric (lowering) phases
 * - Implements rep detection via velocity sign changes
 */

export interface BarPosition {
  x: number;       // Horizontal position in frame (0-1 normalized)
  y: number;       // Vertical position in frame (0-1 normalized)
  confidence: number; // Detection confidence (0-1)
  timestamp: number;  // Frame timestamp in ms
}

export interface VelocityData {
  instantVelocity: number;  // Current velocity in m/s
  meanVelocity: number;     // Mean velocity of current rep
  peakVelocity: number;     // Peak velocity of current rep
  phase: 'concentric' | 'eccentric' | 'stationary';
  repComplete: boolean;     // True when a rep is detected
  velocityDrop: number;     // Percentage drop from first rep
}

export interface CameraCalibration {
  heightCm: number;         // Camera height from ground
  distanceCm: number;       // Camera distance from bar path
  fov: number;              // Field of view in degrees (default 60)
  frameHeight: number;      // Frame height in pixels
  frameWidth: number;       // Frame width in pixels
}

export interface TrackerConfig {
  calibration: CameraCalibration;
  velocityThreshold: number;  // Minimum velocity to detect movement (m/s)
  repDetectionWindow: number; // Window for rep detection (ms)
  smoothingFactor: number;    // Velocity smoothing (0-1)
}

// Constants
const GRAVITY = 9.81; // m/s²
const MIN_REP_DURATION = 300; // ms
const STATIONARY_THRESHOLD = 0.05; // m/s

/**
 * Convert pixel displacement to real-world meters
 * Uses pinhole camera model: real_size = (pixel_size * distance) / focal_length
 */
export function pixelsToMeters(
  pixelDisplacement: number,
  calibration: CameraCalibration
): number {
  // Estimate focal length from FOV
  const focalLengthPixels = calibration.frameHeight / (2 * Math.tan((calibration.fov * Math.PI) / 360));
  
  // Calculate real displacement
  const realDisplacement = (pixelDisplacement * calibration.distanceCm) / (focalLengthPixels * 100);
  
  return realDisplacement;
}

/**
 * Calculate instantaneous velocity from two position samples
 */
export function calculateVelocity(
  pos1: BarPosition,
  pos2: BarPosition,
  calibration: CameraCalibration
): number {
  const timeDelta = (pos2.timestamp - pos1.timestamp) / 1000; // Convert to seconds
  
  if (timeDelta <= 0) return 0;
  
  // Convert normalized Y to pixels, then to meters
  const pixelDelta = (pos2.y - pos1.y) * calibration.frameHeight;
  const meterDelta = pixelsToMeters(pixelDelta, calibration);
  
  // Velocity (positive = moving up/concentric phase)
  // Note: In image coordinates, Y increases downward, so we negate
  return -meterDelta / timeDelta;
}

/**
 * Bar Tracking State Machine
 * Manages position history, velocity calculations, and rep detection
 */
export class BarTrackerState {
  private positions: BarPosition[] = [];
  private velocities: number[] = [];
  private repVelocities: number[] = [];
  private firstRepMeanVelocity: number | null = null;
  private repCount: number = 0;
  private lastRepTime: number = 0;
  private currentPhase: 'concentric' | 'eccentric' | 'stationary' = 'stationary';
  private repStartTime: number = 0;
  private repPeakVelocity: number = 0;
  
  constructor(private config: TrackerConfig) {}
  
  /**
   * Process a new bar position and return velocity data
   */
  processPosition(position: BarPosition): VelocityData {
    this.positions.push(position);
    
    // Keep only last 30 positions (about 1 second at 30fps)
    if (this.positions.length > 30) {
      this.positions.shift();
    }
    
    // Need at least 2 positions to calculate velocity
    if (this.positions.length < 2) {
      return this.createVelocityData(0, false);
    }
    
    const prevPos = this.positions[this.positions.length - 2];
    const currPos = this.positions[this.positions.length - 1];
    
    // Calculate raw velocity
    const rawVelocity = calculateVelocity(prevPos, currPos, this.config.calibration);
    
    // Apply smoothing (exponential moving average)
    const smoothedVelocity = this.applySmoothing(rawVelocity);
    
    // Detect phase and rep completion
    const { phase, repComplete } = this.detectPhaseAndRep(smoothedVelocity, position.timestamp);
    
    return this.createVelocityData(smoothedVelocity, repComplete);
  }
  
  private applySmoothing(velocity: number): number {
    this.velocities.push(velocity);
    
    if (this.velocities.length > 10) {
      this.velocities.shift();
    }
    
    // Exponential smoothing
    if (this.velocities.length === 1) return velocity;
    
    const alpha = this.config.smoothingFactor;
    const lastSmoothed = this.velocities[this.velocities.length - 2];
    return alpha * velocity + (1 - alpha) * lastSmoothed;
  }
  
  private detectPhaseAndRep(velocity: number, timestamp: number): { phase: 'concentric' | 'eccentric' | 'stationary'; repComplete: boolean } {
    const absVelocity = Math.abs(velocity);
    let repComplete = false;
    
    // Determine current phase
    let newPhase: 'concentric' | 'eccentric' | 'stationary';
    if (absVelocity < STATIONARY_THRESHOLD) {
      newPhase = 'stationary';
    } else if (velocity > 0) {
      newPhase = 'concentric';
    } else {
      newPhase = 'eccentric';
    }
    
    // Rep detection: transition from concentric to eccentric or stationary
    if (this.currentPhase === 'concentric' && 
        (newPhase === 'eccentric' || newPhase === 'stationary') &&
        timestamp - this.lastRepTime > MIN_REP_DURATION) {
      
      // Complete the rep
      repComplete = true;
      this.repCount++;
      this.lastRepTime = timestamp;
      
      // Calculate mean velocity for this rep
      const repMeanVelocity = this.repVelocities.length > 0
        ? this.repVelocities.reduce((a, b) => a + b, 0) / this.repVelocities.length
        : velocity;
      
      // Store first rep velocity as baseline
      if (this.firstRepMeanVelocity === null) {
        this.firstRepMeanVelocity = repMeanVelocity;
      }
      
      // Reset for next rep
      this.repVelocities = [];
      this.repPeakVelocity = 0;
    }
    
    // Track velocities during concentric phase
    if (newPhase === 'concentric') {
      this.repVelocities.push(velocity);
      if (velocity > this.repPeakVelocity) {
        this.repPeakVelocity = velocity;
      }
      
      if (this.currentPhase !== 'concentric') {
        this.repStartTime = timestamp;
      }
    }
    
    this.currentPhase = newPhase;
    
    return { phase: newPhase, repComplete };
  }
  
  private createVelocityData(velocity: number, repComplete: boolean): VelocityData {
    const meanVelocity = this.repVelocities.length > 0
      ? this.repVelocities.reduce((a, b) => a + b, 0) / this.repVelocities.length
      : Math.abs(velocity);
    
    const velocityDrop = this.firstRepMeanVelocity && this.firstRepMeanVelocity > 0
      ? Math.max(0, ((this.firstRepMeanVelocity - meanVelocity) / this.firstRepMeanVelocity) * 100)
      : 0;
    
    return {
      instantVelocity: Math.abs(velocity),
      meanVelocity: meanVelocity,
      peakVelocity: this.repPeakVelocity,
      phase: this.currentPhase,
      repComplete,
      velocityDrop: Math.round(velocityDrop * 10) / 10,
    };
  }
  
  /**
   * Reset tracker state for new recording session
   */
  reset(): void {
    this.positions = [];
    this.velocities = [];
    this.repVelocities = [];
    this.firstRepMeanVelocity = null;
    this.repCount = 0;
    this.lastRepTime = 0;
    this.currentPhase = 'stationary';
    this.repStartTime = 0;
    this.repPeakVelocity = 0;
  }
  
  /**
   * Get current rep count
   */
  getRepCount(): number {
    return this.repCount;
  }
  
  /**
   * Get baseline velocity (first rep)
   */
  getBaselineVelocity(): number | null {
    return this.firstRepMeanVelocity;
  }
}

/**
 * Simulated bar position generator for testing
 * Generates realistic barbell movement patterns
 */
export class BarPositionSimulator {
  private startTime: number;
  private repPhase: number = 0; // 0-1 within rep cycle
  private repNumber: number = 0;
  private baseVelocity: number;
  
  constructor(
    private loadKg: number,
    private fatigueRate: number = 0.02 // 2% velocity loss per rep
  ) {
    this.startTime = Date.now();
    // Higher loads = lower velocities (inverse relationship)
    this.baseVelocity = Math.max(0.3, 1.2 - (loadKg / 200));
  }
  
  /**
   * Generate next simulated bar position
   * Simulates a realistic squat/bench press movement pattern
   */
  getNextPosition(): BarPosition {
    const now = Date.now();
    const elapsed = now - this.startTime;
    
    // Each rep takes about 2-3 seconds
    const repDuration = 2500;
    const totalPhase = (elapsed % repDuration) / repDuration;
    
    // Detect new rep
    const currentRep = Math.floor(elapsed / repDuration);
    if (currentRep > this.repNumber) {
      this.repNumber = currentRep;
    }
    
    // Apply fatigue to velocity
    const fatigueMultiplier = Math.max(0.6, 1 - (this.repNumber * this.fatigueRate));
    
    // Movement pattern:
    // 0.0 - 0.4: Eccentric (going down) - slower
    // 0.4 - 0.5: Bottom position (stationary)
    // 0.5 - 0.85: Concentric (going up) - faster
    // 0.85 - 1.0: Top position (stationary)
    
    let y: number;
    let velocityFactor: number;
    
    if (totalPhase < 0.4) {
      // Eccentric phase - smooth descent
      const eccentricProgress = totalPhase / 0.4;
      y = 0.3 + (eccentricProgress * 0.4); // 0.3 -> 0.7
      velocityFactor = -0.5; // Slower descent
    } else if (totalPhase < 0.5) {
      // Bottom - slight pause
      y = 0.7;
      velocityFactor = 0;
    } else if (totalPhase < 0.85) {
      // Concentric phase - explosive ascent
      const concentricProgress = (totalPhase - 0.5) / 0.35;
      y = 0.7 - (concentricProgress * 0.4); // 0.7 -> 0.3
      // Velocity peaks in middle of concentric
      const velocityCurve = Math.sin(concentricProgress * Math.PI);
      velocityFactor = velocityCurve * this.baseVelocity * fatigueMultiplier;
    } else {
      // Top - lockout
      y = 0.3;
      velocityFactor = 0;
    }
    
    // Add small random noise for realism
    const noise = (Math.random() - 0.5) * 0.01;
    
    return {
      x: 0.5 + noise, // Centered with slight horizontal sway
      y: y + noise,
      confidence: 0.85 + (Math.random() * 0.15), // 0.85-1.0
      timestamp: now,
    };
  }
  
  /**
   * Reset simulator for new session
   */
  reset(): void {
    this.startTime = Date.now();
    this.repPhase = 0;
    this.repNumber = 0;
  }
}

/**
 * Default tracker configuration
 */
export function createDefaultConfig(calibration: Partial<CameraCalibration>): TrackerConfig {
  return {
    calibration: {
      heightCm: calibration.heightCm || 100,
      distanceCm: calibration.distanceCm || 150,
      fov: calibration.fov || 60,
      frameHeight: calibration.frameHeight || 1920,
      frameWidth: calibration.frameWidth || 1080,
    },
    velocityThreshold: 0.1,
    repDetectionWindow: 300,
    smoothingFactor: 0.3,
  };
}
