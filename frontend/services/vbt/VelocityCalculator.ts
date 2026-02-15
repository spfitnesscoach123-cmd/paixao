/**
 * VelocityCalculator - Production-Grade Velocity Calculation for VBT
 * 
 * Implements real-world velocity calculation with:
 * - Delta position / delta time calculation
 * - Moving average smoothing (last 5 frames)
 * - Noise rejection below minimum threshold
 * - Pixel-to-meter conversion using camera calibration
 * 
 * FORMULA: velocity = deltaPosition / deltaTime
 * SMOOTHING: Moving average over last 5 frames
 * THRESHOLD: Rejects movements below noise floor
 */

export interface VelocityPosition {
  x: number;        // Normalized 0-1
  y: number;        // Normalized 0-1
  timestamp: number; // Unix timestamp in ms
}

export interface VelocityResult {
  instantVelocity: number;   // Current frame velocity (m/s)
  smoothedVelocity: number;  // Smoothed velocity (m/s)
  direction: 'up' | 'down' | 'stationary';
  deltaY: number;            // Raw Y delta
  deltaTime: number;         // Time delta in seconds
  isValid: boolean;          // Above noise threshold
}

export interface VelocityCalibration {
  cameraHeightCm: number;     // Camera height from ground
  cameraDistanceCm: number;   // Camera distance from movement plane
  fovDegrees: number;         // Camera field of view
  frameHeight: number;        // Frame height in pixels (for pixel/meter conversion)
}

export interface VelocityCalculatorConfig {
  smoothingWindowSize: number;      // Number of frames for moving average (default: 5)
  noiseThresholdMs: number;         // Minimum velocity threshold in m/s (default: 0.02)
  maxValidVelocityMs: number;       // Maximum realistic velocity (default: 3.0)
  calibration: VelocityCalibration;
}

const DEFAULT_CALIBRATION: VelocityCalibration = {
  cameraHeightCm: 100,
  cameraDistanceCm: 150,
  fovDegrees: 60,
  frameHeight: 1920,
};

const DEFAULT_CONFIG: VelocityCalculatorConfig = {
  smoothingWindowSize: 5,
  noiseThresholdMs: 0.02,  // 2cm/s minimum
  maxValidVelocityMs: 3.0, // 3m/s maximum
  calibration: DEFAULT_CALIBRATION,
};

/**
 * VelocityCalculator Class
 * 
 * Core velocity calculation engine for VBT system.
 * Processes position updates from tracking system and outputs
 * real-world velocity measurements.
 */
export class VelocityCalculator {
  private config: VelocityCalculatorConfig;
  private positionBuffer: VelocityPosition[] = [];
  private velocityBuffer: number[] = [];
  private lastValidVelocity: number = 0;
  private metersPerNormalizedUnit: number;

  constructor(config: Partial<VelocityCalculatorConfig> = {}) {
    this.config = { 
      ...DEFAULT_CONFIG, 
      ...config,
      calibration: { ...DEFAULT_CALIBRATION, ...config.calibration },
    };
    
    // Pre-calculate conversion factor
    this.metersPerNormalizedUnit = this.calculateMetersPerUnit();
  }

  /**
   * Calculate conversion factor from normalized coordinates to meters
   * Uses pinhole camera model for accurate conversion
   */
  private calculateMetersPerUnit(): number {
    const { cameraDistanceCm, fovDegrees, frameHeight } = this.config.calibration;
    
    // Calculate focal length from FOV
    const fovRadians = (fovDegrees * Math.PI) / 180;
    const focalLengthPixels = frameHeight / (2 * Math.tan(fovRadians / 2));
    
    // At 1 normalized unit = frameHeight pixels
    // Real size = (pixel_size * distance) / focal_length
    const metersPerPixel = (cameraDistanceCm / 100) / focalLengthPixels;
    const metersPerNormalized = metersPerPixel * frameHeight;
    
    return metersPerNormalized;
  }

  /**
   * Convert normalized Y displacement to meters
   */
  private normalizedToMeters(normalizedDelta: number): number {
    return normalizedDelta * this.metersPerNormalizedUnit;
  }

  /**
   * Update velocity calculator with new position
   * This should be called every frame from the pose detection loop
   * 
   * @param position - Current position with timestamp
   * @returns VelocityResult with calculated velocity data
   */
  update(position: VelocityPosition): VelocityResult {
    // Add to position buffer
    this.positionBuffer.push(position);
    
    // Trim buffer to max size (2x smoothing window for stability)
    const maxBufferSize = this.config.smoothingWindowSize * 2;
    while (this.positionBuffer.length > maxBufferSize) {
      this.positionBuffer.shift();
    }
    
    // Need at least 2 positions to calculate velocity
    if (this.positionBuffer.length < 2) {
      return this.createResult(0, 0, 0, false);
    }
    
    // Get current and previous position
    const current = this.positionBuffer[this.positionBuffer.length - 1];
    const previous = this.positionBuffer[this.positionBuffer.length - 2];
    
    // Calculate time delta in seconds
    const deltaTimeMs = current.timestamp - previous.timestamp;
    const deltaTimeSec = deltaTimeMs / 1000;
    
    // Reject invalid time deltas
    if (deltaTimeSec <= 0 || deltaTimeSec > 1) {
      return this.createResult(0, this.lastValidVelocity, 0, false);
    }
    
    // Calculate Y delta (normalized coordinates)
    // Note: In image coordinates, Y increases downward
    // So negative deltaY means moving up (bar going up in concentric phase)
    const deltaY = current.y - previous.y;
    
    // Convert to meters
    const deltaMeters = this.normalizedToMeters(Math.abs(deltaY));
    
    // Calculate instantaneous velocity: v = d / t
    const instantVelocity = deltaMeters / deltaTimeSec;
    
    // Check if above noise threshold
    const isAboveThreshold = instantVelocity >= this.config.noiseThresholdMs;
    
    // Check if below maximum (reject outliers)
    const isBelowMax = instantVelocity <= this.config.maxValidVelocityMs;
    
    const isValid = isAboveThreshold && isBelowMax;
    
    // Add to velocity buffer if valid
    if (isValid) {
      this.velocityBuffer.push(instantVelocity);
      
      // Trim velocity buffer to smoothing window size
      while (this.velocityBuffer.length > this.config.smoothingWindowSize) {
        this.velocityBuffer.shift();
      }
    }
    
    // Calculate smoothed velocity (moving average)
    const smoothedVelocity = this.calculateSmoothedVelocity();
    
    // Update last valid velocity
    if (isValid) {
      this.lastValidVelocity = smoothedVelocity;
    }
    
    return this.createResult(
      isValid ? instantVelocity : 0,
      smoothedVelocity,
      deltaY,
      isValid
    );
  }

  /**
   * Calculate moving average of velocity buffer
   */
  private calculateSmoothedVelocity(): number {
    if (this.velocityBuffer.length === 0) {
      return 0;
    }
    
    const sum = this.velocityBuffer.reduce((acc, v) => acc + v, 0);
    return sum / this.velocityBuffer.length;
  }

  /**
   * Create velocity result object
   */
  private createResult(
    instantVelocity: number,
    smoothedVelocity: number,
    deltaY: number,
    isValid: boolean
  ): VelocityResult {
    // Determine direction based on Y delta
    // Negative deltaY = moving up (concentric)
    // Positive deltaY = moving down (eccentric)
    // IMPROVED: Increased threshold to reduce direction flickering
    let direction: 'up' | 'down' | 'stationary' = 'stationary';
    
    // Use 1% of screen as minimum to avoid micro-movement noise
    if (Math.abs(deltaY) >= 0.01) {
      direction = deltaY < 0 ? 'up' : 'down';
    }
    
    return {
      instantVelocity: Math.round(instantVelocity * 1000) / 1000, // Round to mm/s precision
      smoothedVelocity: Math.round(smoothedVelocity * 1000) / 1000,
      direction,
      deltaY,
      deltaTime: this.positionBuffer.length >= 2 
        ? (this.positionBuffer[this.positionBuffer.length - 1].timestamp - 
           this.positionBuffer[this.positionBuffer.length - 2].timestamp) / 1000
        : 0,
      isValid,
    };
  }

  /**
   * Get current smoothed velocity
   */
  getVelocity(): number {
    return this.lastValidVelocity;
  }

  /**
   * Get raw velocity buffer for debugging
   */
  getVelocityBuffer(): number[] {
    return [...this.velocityBuffer];
  }

  /**
   * Get position buffer size
   */
  getBufferSize(): number {
    return this.positionBuffer.length;
  }

  /**
   * Update calibration (e.g., when camera settings change)
   */
  updateCalibration(calibration: Partial<VelocityCalibration>): void {
    this.config.calibration = { ...this.config.calibration, ...calibration };
    this.metersPerNormalizedUnit = this.calculateMetersPerUnit();
  }

  /**
   * Reset calculator state
   */
  reset(): void {
    this.positionBuffer = [];
    this.velocityBuffer = [];
    this.lastValidVelocity = 0;
  }
}

/**
 * Create a velocity calculator with custom configuration
 */
export function createVelocityCalculator(
  config?: Partial<VelocityCalculatorConfig>
): VelocityCalculator {
  return new VelocityCalculator(config);
}

export default VelocityCalculator;
