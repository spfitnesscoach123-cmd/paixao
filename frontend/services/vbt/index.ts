/**
 * VBT (Velocity Based Training) Services
 * 
 * This module provides barbell tracking and velocity calculation
 * for VBT assessments using the device camera.
 * 
 * COMPONENTS:
 * - barTracker: Core tracking logic, physics calculations, position processing
 * - useBarTracking: Basic React hook (simulation/dev)
 * - trackingProtection: 5-STAGE PROGRESSIVE VALIDATION pipeline
 * - useProtectedBarTracking: Protected React hook for production
 * - diagnostics: Real-time diagnostic logging for debugging
 * 
 * PROGRESSIVE VALIDATION STAGES:
 * 1. FRAME_USABLE - Pose exists with keypoints
 * 2. FRAME_STABLE - Enough stable frames (INDEPENDENT of tracking)
 * 3. FRAME_TRACKABLE - Tracking point valid
 * 4. FRAME_VALID - Movement detected
 * 5. FRAME_COUNTABLE - Ready for rep counting
 */

export * from './barTracker';
export * from './useBarTracking';
export * from './trackingProtection';
export * from './useProtectedBarTracking';
export * from './diagnostics';

// Re-export types
export type {
  BarPosition,
  VelocityData,
  CameraCalibration,
  TrackerConfig,
} from './barTracker';

export type {
  BarTrackingConfig,
  RepData,
  BarTrackingResult,
} from './useBarTracking';

export type {
  Keypoint,
  PoseData,
  TrackingPoint,
  TrackingState,
  ValidationStage,
  ValidationFlags,
  ProtectionConfig,
  ProtectionResult,
} from './trackingProtection';

export type {
  ProtectedTrackingConfig,
  ProtectedRepData,
  ProtectedTrackingResult,
} from './useProtectedBarTracking';

export type {
  VBTDiagnosticFrame,
  BlockingDiagnosis,
  LayerStatus,
} from './diagnostics';
