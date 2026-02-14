/**
 * Pose Detection Types
 * 
 * Defines the interface between pose detection and VBT pipeline.
 * These types are compatible with MediaPipe Pose landmarks.
 */

/**
 * MediaPipe Pose Landmark names (33 landmarks)
 * Compatible with BlazePose model
 */
export const POSE_LANDMARK_NAMES = [
  'nose',
  'left_eye_inner',
  'left_eye',
  'left_eye_outer',
  'right_eye_inner',
  'right_eye',
  'right_eye_outer',
  'left_ear',
  'right_ear',
  'mouth_left',
  'mouth_right',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_pinky',
  'right_pinky',
  'left_index',
  'right_index',
  'left_thumb',
  'right_thumb',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
  'left_heel',
  'right_heel',
  'left_foot_index',
  'right_foot_index',
] as const;

export type PoseLandmarkName = typeof POSE_LANDMARK_NAMES[number];

/**
 * VBT-relevant keypoint names (simplified subset)
 * These are the landmarks used by the VBT tracking system
 */
export const VBT_KEYPOINT_NAMES = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
] as const;

export type VBTKeypointName = typeof VBT_KEYPOINT_NAMES[number];

/**
 * Raw landmark from MediaPipe
 */
export interface RawLandmark {
  x: number;  // Normalized 0-1 (from left edge)
  y: number;  // Normalized 0-1 (from top edge)
  z: number;  // Depth (negative = closer to camera)
  visibility?: number;  // Confidence score 0-1
}

/**
 * Processed keypoint for VBT system
 * Compatible with existing PoseData interface
 */
export interface ProcessedKeypoint {
  name: string;
  x: number;     // Normalized 0-1
  y: number;     // Normalized 0-1
  score: number; // Confidence 0-1
}

/**
 * Pose detection result from MediaPipe
 */
export interface PoseDetectionResult {
  landmarks: RawLandmark[];
  worldLandmarks?: RawLandmark[];  // 3D world coordinates
  timestamp: number;
  segmentationMask?: any;  // Optional segmentation data
}

/**
 * Processed pose data for VBT pipeline
 * This is the interface expected by useProtectedBarTracking
 */
export interface VBTPoseData {
  keypoints: ProcessedKeypoint[];
  timestamp: number;
}

/**
 * Pose detector configuration
 */
export interface PoseDetectorConfig {
  modelComplexity?: 0 | 1 | 2;  // 0=Lite, 1=Full, 2=Heavy
  smoothLandmarks?: boolean;
  enableSegmentation?: boolean;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
  runningMode?: 'IMAGE' | 'VIDEO';
}

/**
 * Default pose detector configuration optimized for VBT
 */
export const DEFAULT_POSE_CONFIG: PoseDetectorConfig = {
  modelComplexity: 1,         // Full model for accuracy
  smoothLandmarks: true,      // Reduces jitter
  enableSegmentation: false,  // Not needed for VBT
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6,
  runningMode: 'VIDEO',
};

/**
 * Mapping from MediaPipe landmark index to VBT keypoint name
 */
export const LANDMARK_INDEX_TO_VBT_NAME: Record<number, VBTKeypointName> = {
  0: 'nose',
  2: 'left_eye',
  5: 'right_eye',
  7: 'left_ear',
  8: 'right_ear',
  11: 'left_shoulder',
  12: 'right_shoulder',
  13: 'left_elbow',
  14: 'right_elbow',
  15: 'left_wrist',
  16: 'right_wrist',
  23: 'left_hip',
  24: 'right_hip',
  25: 'left_knee',
  26: 'right_knee',
  27: 'left_ankle',
  28: 'right_ankle',
};

/**
 * Convert MediaPipe landmarks to VBT-compatible keypoints
 */
export function convertLandmarksToKeypoints(
  landmarks: RawLandmark[],
  timestamp: number
): VBTPoseData {
  const keypoints: ProcessedKeypoint[] = [];
  
  for (const [indexStr, name] of Object.entries(LANDMARK_INDEX_TO_VBT_NAME)) {
    const index = parseInt(indexStr, 10);
    const landmark = landmarks[index];
    
    if (landmark) {
      keypoints.push({
        name,
        x: landmark.x,
        y: landmark.y,
        score: landmark.visibility ?? 0.5,
      });
    }
  }
  
  return {
    keypoints,
    timestamp,
  };
}

/**
 * Check if a pose has the required keypoints for a given exercise
 */
export function hasRequiredKeypoints(
  pose: VBTPoseData,
  requiredKeypoints: string[],
  minConfidence: number = 0.6
): boolean {
  for (const required of requiredKeypoints) {
    const keypoint = pose.keypoints.find(kp => kp.name === required);
    if (!keypoint || keypoint.score < minConfidence) {
      return false;
    }
  }
  return true;
}
