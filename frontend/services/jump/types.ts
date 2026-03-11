/**
 * Jump Camera Types
 * 
 * Types and interfaces for the Jump Assessment via Camera feature.
 * Uses pose detection to extract biomechanical metrics from video frames.
 */

/**
 * Jump protocols supported
 */
export type JumpProtocol = 'cmj' | 'sl_cmj_right' | 'sl_cmj_left' | 'dj';

/**
 * Active leg for single-leg jumps
 */
export type ActiveLeg = 'left' | 'right' | null;

/**
 * Jump phase states
 */
export type JumpPhase = 
  | 'idle'           // Waiting for jump
  | 'countermovement' // Descending phase
  | 'takeoff'        // Left the ground
  | 'flight'         // In the air
  | 'landing'        // Touched down
  | 'complete';      // Analysis complete

/**
 * Ground calibration data
 */
export interface GroundCalibration {
  groundLevel: number;        // Average Y position of feet on ground (normalized 0-1)
  groundThreshold: number;    // Threshold to detect ground contact (groundLevel + margin)
  calibrationFrames: number;  // Number of frames used for calibration
  isCalibrated: boolean;
  standingHipY: number;       // Average hip Y during calibration (for countermovement)
}

/**
 * Jump event timestamps
 */
export interface JumpEvents {
  countdownStart: number | null;    // Countdown started
  countdownEnd: number | null;      // Countdown ended (recording starts)
  countermovementStart: number | null; // Hip started descending (CMJ)
  takeoffTime: number | null;       // Feet left ground
  landingTime: number | null;       // First foot touched ground
  peakHeightTime: number | null;    // Maximum height reached
  // DJ-specific
  djInitialLandingTime: number | null; // First land from box (DJ)
  djContactEndTime: number | null;     // Takeoff after ground contact (DJ)
}

/**
 * Extracted jump metrics
 */
export interface JumpMetrics {
  flightTimeMs: number;       // Time in air (milliseconds)
  contactTimeMs: number;      // Ground contact time - for DJ, or eccentric+concentric for CMJ
  jumpHeightCm: number;       // Estimated jump height (cm) from flight time formula
  hipDisplacementCm: number;  // Vertical hip displacement (cm)
  takeoffVelocityMs: number;  // Estimated takeoff velocity (m/s)
  eccentricDurationMs: number; // Countermovement/eccentric phase duration (CMJ)
  rsiMod: number;             // RSI modified = jumpHeight / contactTime (for CMJ)
}

/**
 * Single frame pose data for jump analysis
 */
export interface JumpFrameData {
  timestamp: number;
  leftToeY: number;           // Normalized Y position (0=top, 1=bottom)
  rightToeY: number;
  leftAnkleY: number;
  rightAnkleY: number;
  leftHipY: number;
  rightHipY: number;
  hipCenterY: number;         // Average of left and right hip
  confidence: number;         // Average landmark confidence
}

/**
 * SL-CMJ Dual Jump Result
 */
export interface SlCmjLegResult {
  leg: 'left' | 'right';
  metrics: JumpMetrics;
}

/**
 * Recording session data
 */
export interface JumpRecordingSession {
  id: string;
  protocol: JumpProtocol;
  athleteId: string;
  startTime: number;
  frames: JumpFrameData[];
  groundCalibration: GroundCalibration;
  activeLeg: ActiveLeg;
  events: JumpEvents;
  metrics: JumpMetrics | null;
  dataSource: 'camera';
}

/**
 * Jump camera state
 */
export type JumpCameraPhase = 
  | 'setup'           // Configuration screen
  | 'countdown'       // Countdown before recording
  | 'recording'       // Active recording
  | 'processing'      // Analyzing video
  | 'between_jumps'   // Between SL-CMJ jumps (leg 1 done, preparing leg 2)
  | 'review';         // Showing results

/**
 * Camera configuration for jump analysis
 */
export interface JumpCameraConfig {
  protocol: JumpProtocol;
  boxHeightCm: number;        // Only for DJ protocol
  athleteHeightCm: number;    // For height estimation calibration
  frameRate: number;          // Target FPS (30)
}

/**
 * Pose landmark subset for jump analysis
 */
export interface JumpPoseLandmarks {
  leftToe: { x: number; y: number; score: number } | null;
  rightToe: { x: number; y: number; score: number } | null;
  leftAnkle: { x: number; y: number; score: number } | null;
  rightAnkle: { x: number; y: number; score: number } | null;
  leftHip: { x: number; y: number; score: number } | null;
  rightHip: { x: number; y: number; score: number } | null;
}

/**
 * Real-time metrics during recording
 */
export interface LiveMetrics {
  currentHipY: number;
  hipDelta: number;           // Difference from standing position
  feetAboveGround: boolean;   // Whether both feet are above ground threshold
  eccentricTimeMs: number;    // Running eccentric timer
  flightTimeMs: number;       // Running flight timer
  contactTimeMs: number;      // Running contact timer (DJ)
  jumpDetected: boolean;      // Whether a complete jump has been detected
}

/**
 * Constants for jump detection
 */
export const JUMP_DETECTION_CONFIG = {
  // Ground calibration
  CALIBRATION_FRAMES: 60,            // Frames to use for ground calibration (~2 seconds at 30fps)
  GROUND_THRESHOLD_MARGIN: 0.025,    // 2.5% of screen height as margin
  
  // Event detection
  MIN_FLIGHT_TIME_MS: 80,            // Minimum valid flight time (lowered for sensitivity)
  MAX_FLIGHT_TIME_MS: 2000,          // Maximum valid flight time
  MIN_TAKEOFF_FRAMES: 2,             // Frames needed to confirm takeoff
  
  // Countermovement detection
  COUNTERMOVEMENT_THRESHOLD: 0.008,  // Hip must move down by this ratio to start countermovement
  
  // Height estimation
  DEFAULT_ATHLETE_HEIGHT_CM: 175,    // Default height for estimation
  HIP_TO_HEIGHT_RATIO: 0.53,         // Hip height as ratio of total height (standing)
  
  // Confidence thresholds
  MIN_LANDMARK_CONFIDENCE: 0.4,      // Minimum confidence for landmark detection (lowered)
  MIN_POSE_CONFIDENCE: 0.5,          // Minimum overall pose confidence
  
  // Smoothing
  SMOOTHING_WINDOW: 3,               // Moving average window for noise reduction
  
  // Countdown
  COUNTDOWN_SECONDS: 5,              // Countdown duration
  
  // Frame processing
  TARGET_FPS: 30,                    // Target frame rate
  
  // Recording
  MAX_RECORDING_DURATION_MS: 6000,   // Max recording time (6 seconds)
  
  // SL-CMJ
  BETWEEN_JUMPS_COUNTDOWN: 5,        // Seconds between SL-CMJ jumps
} as const;

/**
 * Protocol display information
 */
export const JUMP_PROTOCOL_INFO: Record<JumpProtocol, {
  name: string;
  namePt: string;
  description: string;
  descriptionPt: string;
  icon: string;
  requiresBoxHeight: boolean;
  requiresLegSelection: boolean;
}> = {
  cmj: {
    name: 'Counter Movement Jump',
    namePt: 'Salto com Contra-Movimento',
    description: 'Standard jump with arm swing and knee bend',
    descriptionPt: 'Salto padrao com movimento de bracos e flexao de joelhos',
    icon: 'trending-up',
    requiresBoxHeight: false,
    requiresLegSelection: false,
  },
  sl_cmj_left: {
    name: 'Single Leg CMJ - Left',
    namePt: 'CMJ Unipodal - Esquerda',
    description: 'Jump using left leg only',
    descriptionPt: 'Salto usando apenas a perna esquerda',
    icon: 'accessibility',
    requiresBoxHeight: false,
    requiresLegSelection: false,
  },
  sl_cmj_right: {
    name: 'Single Leg CMJ - Right',
    namePt: 'CMJ Unipodal - Direita',
    description: 'Jump using right leg only',
    descriptionPt: 'Salto usando apenas a perna direita',
    icon: 'accessibility',
    requiresBoxHeight: false,
    requiresLegSelection: false,
  },
  dj: {
    name: 'Drop Jump',
    namePt: 'Salto em Profundidade',
    description: 'Jump from box with quick ground contact',
    descriptionPt: 'Salto a partir de caixa com contato rapido no solo',
    icon: 'arrow-down',
    requiresBoxHeight: true,
    requiresLegSelection: false,
  },
};
