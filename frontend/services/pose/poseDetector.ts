/**
 * Pose Detector Service
 * 
 * Provides pose detection using MediaPipe Pose via native camera frame processing.
 * This module handles the bridge between native pose detection and the VBT pipeline.
 * 
 * ARCHITECTURE:
 * - Native pose detection via react-native-vision-camera + MediaPipe
 * - Converts MediaPipe landmarks to VBT-compatible format
 * - Provides fallback simulation for development/testing
 * 
 * USAGE:
 * The detector receives raw frame data from VisionCamera and returns
 * processed keypoints compatible with the existing VBT pipeline.
 */

import { Platform } from 'react-native';
import {
  RawLandmark,
  VBTPoseData,
  PoseDetectorConfig,
  DEFAULT_POSE_CONFIG,
  convertLandmarksToKeypoints,
  LANDMARK_INDEX_TO_VBT_NAME,
  ProcessedKeypoint,
} from './types';

// ============================================================================
// TYPES
// ============================================================================

export type PoseDetectorStatus = 
  | 'uninitialized'
  | 'loading'
  | 'ready'
  | 'error'
  | 'not_available';

export interface PoseDetectorState {
  status: PoseDetectorStatus;
  error: string | null;
  lastPose: VBTPoseData | null;
  fps: number;
}

export type PoseCallback = (pose: VBTPoseData | null) => void;

// ============================================================================
// POSE DETECTOR CLASS
// ============================================================================

/**
 * Manages pose detection lifecycle and provides poses to VBT pipeline
 */
export class PoseDetector {
  private config: PoseDetectorConfig;
  private status: PoseDetectorStatus = 'uninitialized';
  private error: string | null = null;
  private lastPose: VBTPoseData | null = null;
  private callbacks: Set<PoseCallback> = new Set();
  private frameCount: number = 0;
  private lastFpsTime: number = 0;
  private currentFps: number = 0;
  
  constructor(config: Partial<PoseDetectorConfig> = {}) {
    this.config = { ...DEFAULT_POSE_CONFIG, ...config };
  }
  
  /**
   * Initialize the pose detector
   * Note: Actual MediaPipe initialization happens in native code
   */
  async initialize(): Promise<boolean> {
    try {
      this.status = 'loading';
      
      // Check platform support
      if (Platform.OS === 'web') {
        // Web uses JavaScript MediaPipe
        this.status = 'ready';
        console.log('[PoseDetector] Initialized for web platform');
        return true;
      }
      
      // Native platforms use VisionCamera + MediaPipe native bindings
      // The actual initialization happens when the camera component mounts
      this.status = 'ready';
      console.log('[PoseDetector] Ready for native platform');
      return true;
      
    } catch (error) {
      this.status = 'error';
      this.error = error instanceof Error ? error.message : 'Failed to initialize pose detector';
      console.error('[PoseDetector] Initialization error:', this.error);
      return false;
    }
  }
  
  /**
   * Get current detector status
   */
  getStatus(): PoseDetectorStatus {
    return this.status;
  }
  
  /**
   * Get last error message
   */
  getError(): string | null {
    return this.error;
  }
  
  /**
   * Get current FPS
   */
  getFps(): number {
    return this.currentFps;
  }
  
  /**
   * Get last detected pose
   */
  getLastPose(): VBTPoseData | null {
    return this.lastPose;
  }
  
  /**
   * Subscribe to pose updates
   */
  subscribe(callback: PoseCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  
  /**
   * Process raw landmarks from native pose detection
   * Called by the camera component's frame processor
   */
  processLandmarks(landmarks: RawLandmark[], timestamp?: number): VBTPoseData | null {
    if (!landmarks || landmarks.length === 0) {
      this.notifyCallbacks(null);
      return null;
    }
    
    const pose = convertLandmarksToKeypoints(landmarks, timestamp ?? Date.now());
    this.lastPose = pose;
    
    // Update FPS calculation
    this.updateFps();
    
    // Notify subscribers
    this.notifyCallbacks(pose);
    
    return pose;
  }
  
  /**
   * Process pose detection result from native module
   * Handles the format from @thinksys/react-native-mediapipe or similar
   */
  processPoseResult(result: any): VBTPoseData | null {
    if (!result) {
      this.notifyCallbacks(null);
      return null;
    }
    
    // Handle different result formats from various MediaPipe wrappers
    let landmarks: RawLandmark[] = [];
    
    if (result.poseLandmarks) {
      // Format: { poseLandmarks: [{x, y, z, visibility}...] }
      landmarks = result.poseLandmarks;
    } else if (result.landmarks) {
      // Format: { landmarks: [{x, y, z, visibility}...] }
      landmarks = result.landmarks;
    } else if (Array.isArray(result)) {
      // Format: [{x, y, z, visibility}...]
      landmarks = result;
    } else if (result.pose && Array.isArray(result.pose)) {
      // Format: { pose: [{x, y, z, visibility}...] }
      landmarks = result.pose;
    }
    
    return this.processLandmarks(landmarks, result.timestamp);
  }
  
  /**
   * Update FPS counter
   */
  private updateFps(): void {
    this.frameCount++;
    const now = Date.now();
    
    if (now - this.lastFpsTime >= 1000) {
      this.currentFps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTime = now;
    }
  }
  
  /**
   * Notify all subscribers
   */
  private notifyCallbacks(pose: VBTPoseData | null): void {
    for (const callback of this.callbacks) {
      try {
        callback(pose);
      } catch (error) {
        console.error('[PoseDetector] Callback error:', error);
      }
    }
  }
  
  /**
   * Reset detector state
   */
  reset(): void {
    this.lastPose = null;
    this.frameCount = 0;
    this.currentFps = 0;
    this.lastFpsTime = Date.now();
  }
  
  /**
   * Cleanup
   */
  destroy(): void {
    this.callbacks.clear();
    this.lastPose = null;
    this.status = 'uninitialized';
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let detectorInstance: PoseDetector | null = null;

/**
 * Get or create the pose detector singleton
 */
export function getPoseDetector(config?: Partial<PoseDetectorConfig>): PoseDetector {
  if (!detectorInstance) {
    detectorInstance = new PoseDetector(config);
  }
  return detectorInstance;
}

/**
 * Reset the pose detector singleton
 */
export function resetPoseDetector(): void {
  if (detectorInstance) {
    detectorInstance.destroy();
    detectorInstance = null;
  }
}

// ============================================================================
// SIMULATION FOR DEVELOPMENT
// ============================================================================

/**
 * Generate simulated pose data for development/testing
 * Produces realistic human pose with movement patterns
 */
export function generateSimulatedPose(
  baseY: number = 0.5,
  trackingPointName: string = 'left_hip'
): VBTPoseData {
  const timestamp = Date.now();
  const noise = () => (Math.random() - 0.5) * 0.02;
  
  // Generate keypoints in a realistic body configuration
  const keypoints: ProcessedKeypoint[] = [
    // Head
    { name: 'nose', x: 0.5 + noise(), y: baseY - 0.35 + noise(), score: 0.9 },
    { name: 'left_eye', x: 0.48 + noise(), y: baseY - 0.37 + noise(), score: 0.85 },
    { name: 'right_eye', x: 0.52 + noise(), y: baseY - 0.37 + noise(), score: 0.85 },
    { name: 'left_ear', x: 0.45 + noise(), y: baseY - 0.35 + noise(), score: 0.8 },
    { name: 'right_ear', x: 0.55 + noise(), y: baseY - 0.35 + noise(), score: 0.8 },
    
    // Upper body
    { name: 'left_shoulder', x: 0.4 + noise(), y: baseY - 0.25 + noise(), score: 0.92 },
    { name: 'right_shoulder', x: 0.6 + noise(), y: baseY - 0.25 + noise(), score: 0.92 },
    { name: 'left_elbow', x: 0.35 + noise(), y: baseY - 0.1 + noise(), score: 0.88 },
    { name: 'right_elbow', x: 0.65 + noise(), y: baseY - 0.1 + noise(), score: 0.88 },
    { name: 'left_wrist', x: 0.3 + noise(), y: baseY + 0.05 + noise(), score: 0.85 },
    { name: 'right_wrist', x: 0.7 + noise(), y: baseY + 0.05 + noise(), score: 0.85 },
    
    // Lower body
    { name: 'left_hip', x: 0.45 + noise(), y: baseY + noise(), score: 0.95 },
    { name: 'right_hip', x: 0.55 + noise(), y: baseY + noise(), score: 0.95 },
    { name: 'left_knee', x: 0.43 + noise(), y: baseY + 0.2 + noise(), score: 0.9 },
    { name: 'right_knee', x: 0.57 + noise(), y: baseY + 0.2 + noise(), score: 0.9 },
    { name: 'left_ankle', x: 0.42 + noise(), y: baseY + 0.4 + noise(), score: 0.85 },
    { name: 'right_ankle', x: 0.58 + noise(), y: baseY + 0.4 + noise(), score: 0.85 },
  ];
  
  // Ensure tracking point has high confidence
  const trackingKp = keypoints.find(kp => kp.name === trackingPointName);
  if (trackingKp) {
    trackingKp.score = Math.max(0.9, trackingKp.score);
  }
  
  return {
    keypoints,
    timestamp,
  };
}

/**
 * Simulated pose generator for development
 * Generates movement patterns similar to squats/presses
 */
export class PoseSimulator {
  private startTime: number = Date.now();
  private repNumber: number = 0;
  
  constructor(
    private loadKg: number = 60,
    private fatigueRate: number = 0.02
  ) {}
  
  /**
   * Get next simulated pose
   */
  getNextPose(trackingPointName: string = 'left_hip'): VBTPoseData {
    const now = Date.now();
    const elapsed = now - this.startTime;
    
    // Rep cycle: 2.5 seconds per rep
    const repDuration = 2500;
    const phase = (elapsed % repDuration) / repDuration;
    
    // Calculate base Y position based on movement phase
    let baseY: number;
    
    if (phase < 0.4) {
      // Eccentric (going down)
      const eccentricProgress = phase / 0.4;
      baseY = 0.35 + (eccentricProgress * 0.3);
    } else if (phase < 0.5) {
      // Bottom pause
      baseY = 0.65;
    } else if (phase < 0.85) {
      // Concentric (going up)
      const concentricProgress = (phase - 0.5) / 0.35;
      baseY = 0.65 - (concentricProgress * 0.3);
    } else {
      // Top pause
      baseY = 0.35;
    }
    
    // Apply fatigue (slight position drift)
    const currentRep = Math.floor(elapsed / repDuration);
    const fatigueFactor = 1 + (currentRep * this.fatigueRate * 0.1);
    baseY = Math.min(0.7, baseY * fatigueFactor);
    
    return generateSimulatedPose(baseY, trackingPointName);
  }
  
  /**
   * Reset simulator
   */
  reset(): void {
    this.startTime = Date.now();
    this.repNumber = 0;
  }
}
