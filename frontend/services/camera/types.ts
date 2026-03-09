/**
 * Camera & MediaPipe Manager Types
 * 
 * Type definitions for the safe camera/mediapipe lifecycle management system.
 * Used to prevent race conditions and ensure proper resource cleanup.
 */

/**
 * Camera initialization phases - SEQUENTIAL STATES
 * 
 * The camera must progress through these states in order.
 * No state can be skipped.
 */
export type CameraPhase =
  | 'IDLE'                    // Initial state - nothing active
  | 'REQUESTING_PERMISSION'   // Checking/requesting camera permission
  | 'PERMISSION_GRANTED'      // Permission confirmed
  | 'INITIALIZING_CAMERA'     // Camera component mounting
  | 'CAMERA_READY'            // Camera active and producing frames
  | 'INITIALIZING_MEDIAPIPE'  // MediaPipe pipeline starting
  | 'MEDIAPIPE_READY'         // MediaPipe ready to process
  | 'CAPTURE_ACTIVE'          // Full system ready for capture
  | 'RELEASING'               // Cleanup in progress
  | 'ERROR';                  // Error state

/**
 * Camera module identifier
 * Used to track which module owns the camera session
 */
export type CameraOwner = 'none' | 'jump_camera' | 'vbt_camera';

/**
 * Camera manager state
 */
export interface CameraManagerState {
  phase: CameraPhase;
  owner: CameraOwner;
  error: string | null;
  lastTransition: number;
  frameCount: number;
  isAppActive: boolean;
}

/**
 * Transition result
 */
export interface TransitionResult {
  success: boolean;
  previousPhase: CameraPhase;
  newPhase: CameraPhase;
  error?: string;
}

/**
 * Camera readiness check result
 */
export interface ReadinessCheck {
  cameraReady: boolean;
  mediapipeReady: boolean;
  canProcess: boolean;
  phase: CameraPhase;
  owner: CameraOwner;
}

/**
 * Lifecycle event types
 */
export type LifecycleEvent = 
  | 'app_background'
  | 'app_foreground'
  | 'component_mount'
  | 'component_unmount'
  | 'permission_granted'
  | 'permission_denied'
  | 'camera_ready'
  | 'mediapipe_ready'
  | 'first_frame'
  | 'error'
  | 'release';

/**
 * Lifecycle callback
 */
export type LifecycleCallback = (event: LifecycleEvent, state: CameraManagerState) => void;

/**
 * Valid phase transitions
 * Maps current phase to allowed next phases
 */
export const VALID_TRANSITIONS: Record<CameraPhase, CameraPhase[]> = {
  'IDLE': ['REQUESTING_PERMISSION', 'PERMISSION_GRANTED', 'INITIALIZING_CAMERA'],
  'REQUESTING_PERMISSION': ['PERMISSION_GRANTED', 'ERROR', 'IDLE'],
  'PERMISSION_GRANTED': ['INITIALIZING_CAMERA', 'IDLE'],
  'INITIALIZING_CAMERA': ['CAMERA_READY', 'ERROR', 'RELEASING', 'IDLE'],
  'CAMERA_READY': ['INITIALIZING_MEDIAPIPE', 'RELEASING', 'IDLE', 'ERROR'],
  'INITIALIZING_MEDIAPIPE': ['MEDIAPIPE_READY', 'ERROR', 'RELEASING', 'IDLE'],
  'MEDIAPIPE_READY': ['CAPTURE_ACTIVE', 'RELEASING', 'IDLE', 'ERROR'],
  'CAPTURE_ACTIVE': ['RELEASING', 'IDLE', 'ERROR'],
  'RELEASING': ['IDLE'],
  'ERROR': ['IDLE', 'RELEASING'],
};

/**
 * Phase descriptions for logging/debugging
 */
export const PHASE_DESCRIPTIONS: Record<CameraPhase, string> = {
  'IDLE': 'Camera not active',
  'REQUESTING_PERMISSION': 'Requesting camera permission',
  'PERMISSION_GRANTED': 'Permission granted, ready to initialize',
  'INITIALIZING_CAMERA': 'Camera component mounting',
  'CAMERA_READY': 'Camera active and ready',
  'INITIALIZING_MEDIAPIPE': 'MediaPipe pipeline initializing',
  'MEDIAPIPE_READY': 'MediaPipe ready to process frames',
  'CAPTURE_ACTIVE': 'Full capture system active',
  'RELEASING': 'Releasing resources',
  'ERROR': 'Error occurred',
};
