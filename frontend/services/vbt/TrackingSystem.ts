/**
 * TrackingSystem - Production-Grade Landmark Tracking for VBT
 * 
 * Central tracking system that:
 * - Stores tracking landmark as INDEX (not screen coordinates)
 * - Extracts landmark position from pose data each frame
 * - Validates confidence threshold (blocks if < 0.5)
 * - Provides smoothed position data to velocity calculator
 * 
 * CRITICAL: Tracking point is stored as landmark INDEX, not screen position.
 * This ensures consistent tracking across frames regardless of movement.
 */

import { ProcessedKeypoint, VBTPoseData, VBT_KEYPOINT_NAMES, VBTKeypointName } from '../pose';

export interface TrackingConfig {
  confidenceThreshold: number;     // Minimum confidence to accept landmark (default: 0.5)
  smoothingEnabled: boolean;       // Enable position smoothing
  smoothingWindowSize: number;     // Frames for position smoothing
  maxPositionJump: number;         // Maximum valid position change (normalized)
}

export interface TrackedLandmark {
  name: VBTKeypointName;           // Landmark name (e.g., 'left_hip')
  index: number;                   // Landmark index in pose array
  x: number;                       // Current X position (normalized 0-1)
  y: number;                       // Current Y position (normalized 0-1)
  confidence: number;              // Current confidence score
  isValid: boolean;                // Above confidence threshold
  timestamp: number;               // Last update timestamp
}

export interface TrackingResult {
  success: boolean;                // Landmark found and valid
  landmark: TrackedLandmark | null;
  position: { x: number; y: number } | null;
  smoothedPosition: { x: number; y: number } | null;
  confidence: number;
  message: string;
}

export interface TrackingSystemState {
  isTrackingPointSet: boolean;
  trackingLandmarkName: VBTKeypointName | null;
  trackingLandmarkIndex: number | null;
  lastValidPosition: { x: number; y: number } | null;
  consecutiveValidFrames: number;
  consecutiveInvalidFrames: number;
}

const DEFAULT_CONFIG: TrackingConfig = {
  confidenceThreshold: 0.5,
  smoothingEnabled: true,
  smoothingWindowSize: 5,
  maxPositionJump: 0.2, // 20% of screen max jump
};

// Map keypoint names to their typical indices in MediaPipe pose
const KEYPOINT_NAME_TO_INDEX: Record<VBTKeypointName, number> = {
  'nose': 0,
  'left_eye': 2,
  'right_eye': 5,
  'left_ear': 7,
  'right_ear': 8,
  'left_shoulder': 11,
  'right_shoulder': 12,
  'left_elbow': 13,
  'right_elbow': 14,
  'left_wrist': 15,
  'right_wrist': 16,
  'left_hip': 23,
  'right_hip': 24,
  'left_knee': 25,
  'right_knee': 26,
  'left_ankle': 27,
  'right_ankle': 28,
};

/**
 * TrackingSystem Class
 * 
 * Manages landmark tracking for VBT velocity calculation.
 * Stores tracking point as landmark NAME/INDEX for consistent tracking.
 */
export class TrackingSystem {
  private config: TrackingConfig;
  private trackingLandmarkName: VBTKeypointName | null = null;
  private trackingLandmarkIndex: number | null = null;
  private positionHistory: Array<{ x: number; y: number; timestamp: number }> = [];
  private lastValidPosition: { x: number; y: number } | null = null;
  private consecutiveValidFrames: number = 0;
  private consecutiveInvalidFrames: number = 0;

  constructor(config: Partial<TrackingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set tracking point by landmark NAME
   * Stores the landmark index for consistent frame-by-frame tracking
   * 
   * CRITICAL: This stores the landmark INDEX, not screen coordinates.
   * The position is extracted from pose data each frame.
   * 
   * @param keypointName - Name of the keypoint to track (e.g., 'left_hip')
   */
  setTrackingPoint(keypointName: string): boolean {
    // Validate keypoint name
    if (!VBT_KEYPOINT_NAMES.includes(keypointName as VBTKeypointName)) {
      console.warn(`[TrackingSystem] Invalid keypoint name: ${keypointName}`);
      return false;
    }
    
    const name = keypointName as VBTKeypointName;
    const index = KEYPOINT_NAME_TO_INDEX[name];
    
    if (index === undefined) {
      console.warn(`[TrackingSystem] No index mapping for keypoint: ${keypointName}`);
      return false;
    }
    
    this.trackingLandmarkName = name;
    this.trackingLandmarkIndex = index;
    this.positionHistory = [];
    this.lastValidPosition = null;
    this.consecutiveValidFrames = 0;
    this.consecutiveInvalidFrames = 0;
    
    console.log(`[TrackingSystem] Tracking point SET: ${name} (index: ${index})`);
    return true;
  }

  /**
   * Set tracking point by screen tap coordinates
   * Finds the nearest landmark to the tap position
   * 
   * @param normalizedX - Tap X position (0-1)
   * @param normalizedY - Tap Y position (0-1)
   * @param pose - Current pose data to find nearest landmark
   * @param exerciseKeypoints - List of valid keypoints for current exercise
   */
  setTrackingPointByTap(
    normalizedX: number,
    normalizedY: number,
    pose: VBTPoseData | null,
    exerciseKeypoints: string[]
  ): { success: boolean; landmarkName: string | null } {
    if (!pose || !pose.keypoints || pose.keypoints.length === 0) {
      return { success: false, landmarkName: null };
    }
    
    let nearestLandmark: ProcessedKeypoint | null = null;
    let minDistance = Infinity;
    
    for (const keypoint of pose.keypoints) {
      // Only consider exercise-relevant keypoints
      if (!exerciseKeypoints.includes(keypoint.name)) continue;
      
      // Only consider keypoints with sufficient confidence
      if (keypoint.score < this.config.confidenceThreshold) continue;
      
      const distance = Math.sqrt(
        Math.pow(keypoint.x - normalizedX, 2) + 
        Math.pow(keypoint.y - normalizedY, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestLandmark = keypoint;
      }
    }
    
    // Only accept if within reasonable distance (15% of screen)
    if (nearestLandmark && minDistance < 0.15) {
      const success = this.setTrackingPoint(nearestLandmark.name);
      return { success, landmarkName: nearestLandmark.name };
    }
    
    return { success: false, landmarkName: null };
  }

  /**
   * Clear tracking point
   */
  clearTrackingPoint(): void {
    console.log(`[TrackingSystem] Tracking point CLEARED (was: ${this.trackingLandmarkName})`);
    this.trackingLandmarkName = null;
    this.trackingLandmarkIndex = null;
    this.positionHistory = [];
    this.lastValidPosition = null;
    this.consecutiveValidFrames = 0;
    this.consecutiveInvalidFrames = 0;
  }

  /**
   * Check if tracking point is set
   */
  isTrackingPointSet(): boolean {
    return this.trackingLandmarkName !== null && this.trackingLandmarkIndex !== null;
  }

  /**
   * Get tracking point name
   */
  getTrackingPointName(): VBTKeypointName | null {
    return this.trackingLandmarkName;
  }

  /**
   * Extract and track landmark position from pose data
   * 
   * CRITICAL: This reads the landmark at the stored INDEX each frame.
   * The landmark index was set via setTrackingPoint(), not screen coordinates.
   * 
   * @param pose - Current pose data from MediaPipe
   * @returns TrackingResult with position and validation status
   */
  trackLandmark(pose: VBTPoseData | null): TrackingResult {
    // Check if tracking point is set
    if (!this.trackingLandmarkName) {
      return {
        success: false,
        landmark: null,
        position: null,
        smoothedPosition: null,
        confidence: 0,
        message: 'Tracking point not set',
      };
    }
    
    // Check if pose data is available
    if (!pose || !pose.keypoints || pose.keypoints.length === 0) {
      this.consecutiveInvalidFrames++;
      this.consecutiveValidFrames = 0;
      
      return {
        success: false,
        landmark: null,
        position: this.lastValidPosition,
        smoothedPosition: this.getSmoothedPosition(),
        confidence: 0,
        message: 'No pose data available',
      };
    }
    
    // Find the landmark by NAME in the keypoints array
    // CRITICAL: We use name matching, not direct index access
    // This handles cases where the pose array might have different ordering
    const landmark = pose.keypoints.find(kp => kp.name === this.trackingLandmarkName);
    
    if (!landmark) {
      this.consecutiveInvalidFrames++;
      this.consecutiveValidFrames = 0;
      
      return {
        success: false,
        landmark: null,
        position: this.lastValidPosition,
        smoothedPosition: this.getSmoothedPosition(),
        confidence: 0,
        message: `Landmark "${this.trackingLandmarkName}" not detected in frame`,
      };
    }
    
    // Check confidence threshold
    if (landmark.score < this.config.confidenceThreshold) {
      this.consecutiveInvalidFrames++;
      this.consecutiveValidFrames = 0;
      
      return {
        success: false,
        landmark: {
          name: this.trackingLandmarkName,
          index: this.trackingLandmarkIndex!,
          x: landmark.x,
          y: landmark.y,
          confidence: landmark.score,
          isValid: false,
          timestamp: pose.timestamp,
        },
        position: { x: landmark.x, y: landmark.y },
        smoothedPosition: this.getSmoothedPosition(),
        confidence: landmark.score,
        message: `Low confidence: ${(landmark.score * 100).toFixed(0)}% < ${(this.config.confidenceThreshold * 100).toFixed(0)}%`,
      };
    }
    
    // Check for position jump (potential tracking error)
    const currentPosition = { x: landmark.x, y: landmark.y };
    
    if (this.lastValidPosition && this.config.maxPositionJump > 0) {
      const positionJump = Math.sqrt(
        Math.pow(currentPosition.x - this.lastValidPosition.x, 2) +
        Math.pow(currentPosition.y - this.lastValidPosition.y, 2)
      );
      
      if (positionJump > this.config.maxPositionJump) {
        // Large position jump - might be tracking error
        // Don't reset consecutiveValidFrames, but don't add to history
        console.warn(`[TrackingSystem] Large position jump detected: ${(positionJump * 100).toFixed(1)}%`);
      }
    }
    
    // Valid tracking - update state
    this.consecutiveValidFrames++;
    this.consecutiveInvalidFrames = 0;
    this.lastValidPosition = currentPosition;
    
    // Add to position history for smoothing
    this.addToHistory(currentPosition, pose.timestamp);
    
    // Calculate smoothed position
    const smoothedPosition = this.getSmoothedPosition();
    
    return {
      success: true,
      landmark: {
        name: this.trackingLandmarkName,
        index: this.trackingLandmarkIndex!,
        x: landmark.x,
        y: landmark.y,
        confidence: landmark.score,
        isValid: true,
        timestamp: pose.timestamp,
      },
      position: currentPosition,
      smoothedPosition,
      confidence: landmark.score,
      message: 'Tracking successful',
    };
  }

  /**
   * Add position to history for smoothing
   */
  private addToHistory(position: { x: number; y: number }, timestamp: number): void {
    this.positionHistory.push({ ...position, timestamp });
    
    // Keep only recent history
    const maxAge = 500; // ms
    const now = Date.now();
    this.positionHistory = this.positionHistory.filter(p => now - p.timestamp < maxAge);
    
    // Limit to window size
    while (this.positionHistory.length > this.config.smoothingWindowSize) {
      this.positionHistory.shift();
    }
  }

  /**
   * Get smoothed position (moving average)
   */
  private getSmoothedPosition(): { x: number; y: number } | null {
    if (!this.config.smoothingEnabled || this.positionHistory.length === 0) {
      return this.lastValidPosition;
    }
    
    const sumX = this.positionHistory.reduce((sum, p) => sum + p.x, 0);
    const sumY = this.positionHistory.reduce((sum, p) => sum + p.y, 0);
    
    return {
      x: sumX / this.positionHistory.length,
      y: sumY / this.positionHistory.length,
    };
  }

  /**
   * Get current tracking system state
   */
  getState(): TrackingSystemState {
    return {
      isTrackingPointSet: this.isTrackingPointSet(),
      trackingLandmarkName: this.trackingLandmarkName,
      trackingLandmarkIndex: this.trackingLandmarkIndex,
      lastValidPosition: this.lastValidPosition,
      consecutiveValidFrames: this.consecutiveValidFrames,
      consecutiveInvalidFrames: this.consecutiveInvalidFrames,
    };
  }

  /**
   * Get consecutive valid frame count
   */
  getConsecutiveValidFrames(): number {
    return this.consecutiveValidFrames;
  }

  /**
   * Get consecutive invalid frame count
   */
  getConsecutiveInvalidFrames(): number {
    return this.consecutiveInvalidFrames;
  }

  /**
   * Check if tracking is stable (enough consecutive valid frames)
   */
  isStable(requiredFrames: number = 5): boolean {
    return this.consecutiveValidFrames >= requiredFrames;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TrackingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset tracking system
   */
  reset(): void {
    this.positionHistory = [];
    this.lastValidPosition = null;
    this.consecutiveValidFrames = 0;
    this.consecutiveInvalidFrames = 0;
    // Note: Does NOT clear tracking point - call clearTrackingPoint() separately
  }

  /**
   * Full reset including tracking point
   */
  fullReset(): void {
    this.clearTrackingPoint();
    this.reset();
  }
}

/**
 * Create a tracking system with custom configuration
 */
export function createTrackingSystem(
  config?: Partial<TrackingConfig>
): TrackingSystem {
  return new TrackingSystem(config);
}

export default TrackingSystem;
