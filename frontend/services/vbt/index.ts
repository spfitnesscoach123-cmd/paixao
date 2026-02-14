/**
 * VBT (Velocity Based Training) Services
 * 
 * This module provides barbell tracking and velocity calculation
 * for VBT assessments using the device camera.
 * 
 * COMPONENTS:
 * - barTracker: Core tracking logic, physics calculations, position processing
 * - useBarTracking: Basic React hook (simulation/dev)
 * - trackingProtection: 3-layer protection system
 * - useProtectedBarTracking: Protected React hook for production
 * 
 * PROTECTION LAYERS:
 * 1. Human Presence Validation - Requires keypoints with score >= 0.6
 * 2. State Machine Control - noHuman | ready | executing
 * 3. Coach-Defined Tracking Point - Manual point selection required
 */

export * from './barTracker';
export * from './useBarTracking';
export * from './trackingProtection';
export * from './useProtectedBarTracking';

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
  ProtectionConfig,
  ProtectionResult,
} from './trackingProtection';

export type {
  ProtectedTrackingConfig,
  ProtectedRepData,
  ProtectedTrackingResult,
} from './useProtectedBarTracking';
