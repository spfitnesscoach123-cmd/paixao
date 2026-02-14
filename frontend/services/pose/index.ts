/**
 * Pose Detection Services
 * 
 * Provides pose detection capabilities for VBT tracking.
 * Supports both native MediaPipe detection and simulation for development.
 * 
 * COMPONENTS:
 * - types: Type definitions and landmark mappings
 * - poseDetector: Core pose detection logic and state management
 * - usePoseDetection: React hook for pose detection
 * - PoseCamera: Camera component with integrated pose detection
 */

export * from './types';
export * from './poseDetector';
export * from './usePoseDetection';

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

export type {
  UsePoseDetectionConfig,
  UsePoseDetectionResult,
} from './usePoseDetection';

export {
  PoseDetector,
  PoseSimulator,
  getPoseDetector,
  resetPoseDetector,
  generateSimulatedPose,
} from './poseDetector';

export {
  usePoseDetection,
} from './usePoseDetection';

export {
  convertLandmarksToKeypoints,
  hasRequiredKeypoints,
  POSE_LANDMARK_NAMES,
  VBT_KEYPOINT_NAMES,
  LANDMARK_INDEX_TO_VBT_NAME,
  DEFAULT_POSE_CONFIG,
} from './types';

// Component exports
export { PoseCamera } from './PoseCamera';
export type { PoseCameraProps, PoseCameraRef } from './PoseCamera';
