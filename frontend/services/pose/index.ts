/**
 * Pose Detection Services
 * 
 * Provides pose detection capabilities for VBT tracking.
 * Supports both native MediaPipe detection and simulation for development.
 */

export * from './types';
export * from './poseDetector';

// Re-export key types for convenience
export type {
  VBTPoseData,
  ProcessedKeypoint,
  RawLandmark,
  PoseDetectorConfig,
} from './types';

export type {
  PoseDetectorStatus,
  PoseDetectorState,
  PoseCallback,
} from './poseDetector';

export {
  PoseDetector,
  PoseSimulator,
  getPoseDetector,
  resetPoseDetector,
  generateSimulatedPose,
} from './poseDetector';

export {
  convertLandmarksToKeypoints,
  hasRequiredKeypoints,
  POSE_LANDMARK_NAMES,
  VBT_KEYPOINT_NAMES,
  LANDMARK_INDEX_TO_VBT_NAME,
  DEFAULT_POSE_CONFIG,
} from './types';
