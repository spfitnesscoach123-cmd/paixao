/**
 * Jump Detector
 * 
 * Core logic for detecting jump events from pose landmarks.
 * Handles ground calibration, takeoff/landing detection, and metric extraction.
 * 
 * IMPORTANT: This module ONLY extracts raw metrics (Flight Time, Contact Time, Jump Height).
 * All RSI, fatigue, z-score calculations are handled by the existing backend pipeline.
 */

import {
  JumpProtocol,
  ActiveLeg,
  JumpPhase,
  JumpEvents,
  JumpMetrics,
  JumpFrameData,
  GroundCalibration,
  JumpPoseLandmarks,
  JUMP_DETECTION_CONFIG,
} from './types';

const {
  CALIBRATION_FRAMES,
  GROUND_THRESHOLD_MARGIN,
  MIN_FLIGHT_TIME_MS,
  MAX_FLIGHT_TIME_MS,
  MIN_TAKEOFF_FRAMES,
  DEFAULT_ATHLETE_HEIGHT_CM,
  HIP_TO_HEIGHT_RATIO,
  MIN_LANDMARK_CONFIDENCE,
} = JUMP_DETECTION_CONFIG;

/**
 * Ground Calibration
 * Calculates ground level from a set of frames during countdown
 */
export function calibrateGround(frames: JumpFrameData[]): GroundCalibration {
  if (frames.length < 10) {
    return {
      groundLevel: 0.9,  // Default near bottom
      groundThreshold: 0.9 - GROUND_THRESHOLD_MARGIN,
      calibrationFrames: frames.length,
      isCalibrated: false,
    };
  }

  // Calculate average Y position of feet (lower Y = higher on screen in normalized coords)
  // In most camera coordinate systems: Y increases downward
  const footYPositions = frames.map(f => {
    const leftFoot = f.leftToeY;
    const rightFoot = f.rightToeY;
    return Math.max(leftFoot, rightFoot);  // Use the lower foot (higher Y value)
  });

  const groundLevel = footYPositions.reduce((a, b) => a + b, 0) / footYPositions.length;
  
  return {
    groundLevel,
    groundThreshold: groundLevel - GROUND_THRESHOLD_MARGIN,  // Threshold slightly above ground
    calibrationFrames: frames.length,
    isCalibrated: true,
  };
}

/**
 * Active Leg Detection (for SL-CMJ)
 * Determines which leg is the active (supporting) leg during countdown
 */
export function detectActiveLeg(frames: JumpFrameData[]): ActiveLeg {
  if (frames.length < 30) return null;

  let leftOnGround = 0;
  let rightOnGround = 0;
  let leftElevated = 0;
  let rightElevated = 0;

  const avgLeftToe = frames.reduce((a, f) => a + f.leftToeY, 0) / frames.length;
  const avgRightToe = frames.reduce((a, f) => a + f.rightToeY, 0) / frames.length;

  // Count frames where each foot is on ground vs elevated
  for (const frame of frames) {
    const leftDiff = Math.abs(frame.leftToeY - avgLeftToe);
    const rightDiff = Math.abs(frame.rightToeY - avgRightToe);

    // If left foot is consistently lower (higher Y), it's on ground
    if (frame.leftToeY > frame.rightToeY + 0.05) {
      leftOnGround++;
      rightElevated++;
    } else if (frame.rightToeY > frame.leftToeY + 0.05) {
      rightOnGround++;
      leftElevated++;
    }
  }

  const total = frames.length;
  const leftGroundRatio = leftOnGround / total;
  const rightGroundRatio = rightOnGround / total;

  // Determine which leg is active (on ground)
  if (leftGroundRatio > 0.7) {
    return 'left';  // Left foot on ground = left leg active
  } else if (rightGroundRatio > 0.7) {
    return 'right';  // Right foot on ground = right leg active
  }

  return null;  // Cannot determine (possibly both feet on ground)
}

/**
 * CMJ Takeoff Detection
 * Both feet must be above ground threshold
 */
export function detectCMJTakeoff(
  frame: JumpFrameData,
  calibration: GroundCalibration
): boolean {
  const threshold = calibration.groundThreshold;
  
  // Both feet must be above threshold (lower Y value)
  return frame.leftToeY < threshold && frame.rightToeY < threshold;
}

/**
 * CMJ Landing Detection
 * First foot to touch ground
 */
export function detectCMJLanding(
  frame: JumpFrameData,
  calibration: GroundCalibration
): boolean {
  const threshold = calibration.groundThreshold;
  
  // Either foot touches ground (higher Y value, closer to calibrated ground)
  return frame.leftToeY >= threshold || frame.rightToeY >= threshold;
}

/**
 * SL-CMJ Takeoff Detection
 * Active foot must be above ground threshold
 */
export function detectSLCMJTakeoff(
  frame: JumpFrameData,
  calibration: GroundCalibration,
  activeLeg: ActiveLeg
): boolean {
  const threshold = calibration.groundThreshold;
  
  if (activeLeg === 'left') {
    return frame.leftToeY < threshold;
  } else if (activeLeg === 'right') {
    return frame.rightToeY < threshold;
  }
  
  return false;
}

/**
 * SL-CMJ Landing Detection
 * Either foot touches ground (athlete may land on both feet)
 */
export function detectSLCMJLanding(
  frame: JumpFrameData,
  calibration: GroundCalibration,
  activeLeg: ActiveLeg
): boolean {
  const threshold = calibration.groundThreshold;
  
  // Landing can be on active leg OR both legs
  if (activeLeg === 'left') {
    return frame.leftToeY >= threshold || frame.rightToeY >= threshold;
  } else if (activeLeg === 'right') {
    return frame.rightToeY >= threshold || frame.leftToeY >= threshold;
  }
  
  return false;
}

/**
 * DJ Initial Landing Detection
 * Detect when athlete first lands from the box
 */
export function detectDJInitialLanding(
  frame: JumpFrameData,
  calibration: GroundCalibration,
  previousFrame: JumpFrameData | null
): boolean {
  const threshold = calibration.groundThreshold;
  
  // Feet must touch ground (high Y) after being in air (low Y)
  if (!previousFrame) return false;
  
  const wasInAir = previousFrame.leftToeY < threshold && previousFrame.rightToeY < threshold;
  const nowOnGround = frame.leftToeY >= threshold || frame.rightToeY >= threshold;
  
  return wasInAir && nowOnGround;
}

/**
 * DJ Takeoff Detection (after ground contact)
 * Both feet leave ground after initial landing
 */
export function detectDJTakeoff(
  frame: JumpFrameData,
  calibration: GroundCalibration
): boolean {
  return detectCMJTakeoff(frame, calibration);
}

/**
 * DJ Final Landing Detection
 */
export function detectDJFinalLanding(
  frame: JumpFrameData,
  calibration: GroundCalibration
): boolean {
  return detectCMJLanding(frame, calibration);
}

/**
 * Calculate Jump Height from Flight Time
 * Using physics formula: h = (g * t²) / 8
 * Where t is total flight time in seconds
 */
export function calculateJumpHeightFromFlightTime(flightTimeMs: number): number {
  const g = 9.81;  // m/s²
  const t = flightTimeMs / 1000;  // Convert to seconds
  const heightM = (g * t * t) / 8;
  return heightM * 100;  // Convert to cm
}

/**
 * Calculate Jump Height from Hip Displacement
 * Uses the change in hip Y position from standing to peak height
 */
export function calculateJumpHeightFromHipDisplacement(
  standingHipY: number,
  peakHipY: number,
  athleteHeightCm: number = DEFAULT_ATHLETE_HEIGHT_CM
): number {
  // Calculate pixel-to-cm ratio based on athlete height
  const standingHipHeightCm = athleteHeightCm * HIP_TO_HEIGHT_RATIO;
  
  // Assuming camera captures full body, estimate scale
  // This is a rough estimate - actual implementation would need camera calibration
  const displacement = standingHipY - peakHipY;  // Positive if hip went up
  
  // Estimate height based on displacement ratio
  // If hip moves 10% of screen height, estimate actual displacement
  const estimatedHeightCm = displacement * standingHipHeightCm * 2;
  
  return Math.max(0, estimatedHeightCm);
}

/**
 * Process frames and extract jump events
 */
export interface JumpAnalysisResult {
  events: JumpEvents;
  metrics: JumpMetrics | null;
  phase: JumpPhase;
  error?: string;
}

export function analyzeJumpFrames(
  frames: JumpFrameData[],
  calibration: GroundCalibration,
  protocol: JumpProtocol,
  activeLeg: ActiveLeg,
  boxHeightCm: number = 0,
  athleteHeightCm: number = DEFAULT_ATHLETE_HEIGHT_CM
): JumpAnalysisResult {
  if (!calibration.isCalibrated) {
    return {
      events: createEmptyEvents(),
      metrics: null,
      phase: 'idle',
      error: 'Ground calibration not complete',
    };
  }

  if (frames.length < 30) {
    return {
      events: createEmptyEvents(),
      metrics: null,
      phase: 'idle',
      error: 'Not enough frames for analysis',
    };
  }

  const events: JumpEvents = createEmptyEvents();
  let phase: JumpPhase = 'idle';
  let takeoffFrameIdx: number | null = null;
  let landingFrameIdx: number | null = null;
  let peakHeightFrameIdx: number | null = null;
  let minHipY = Infinity;
  
  // For DJ protocol
  let djInitialLandingIdx: number | null = null;
  let djTakeoffIdx: number | null = null;
  let djFinalLandingIdx: number | null = null;

  // Analyze frames based on protocol
  if (protocol === 'dj') {
    // Drop Jump analysis - looking for: drop -> land -> takeoff -> land
    let state: 'waiting_land' | 'on_ground' | 'in_air' | 'final_land' = 'waiting_land';
    
    for (let i = 1; i < frames.length; i++) {
      const frame = frames[i];
      const prevFrame = frames[i - 1];
      
      if (state === 'waiting_land') {
        if (detectDJInitialLanding(frame, calibration, prevFrame)) {
          djInitialLandingIdx = i;
          events.landingTime = frame.timestamp;
          state = 'on_ground';
        }
      } else if (state === 'on_ground') {
        if (detectDJTakeoff(frame, calibration)) {
          djTakeoffIdx = i;
          events.takeoffTime = frame.timestamp;
          state = 'in_air';
        }
      } else if (state === 'in_air') {
        // Track peak height
        if (frame.hipCenterY < minHipY) {
          minHipY = frame.hipCenterY;
          peakHeightFrameIdx = i;
          events.peakHeightTime = frame.timestamp;
        }
        
        if (detectDJFinalLanding(frame, calibration)) {
          djFinalLandingIdx = i;
          state = 'final_land';
          phase = 'complete';
          break;
        }
      }
    }
    
    // Calculate DJ metrics
    if (djInitialLandingIdx !== null && djTakeoffIdx !== null && djFinalLandingIdx !== null) {
      const contactTimeMs = frames[djTakeoffIdx].timestamp - frames[djInitialLandingIdx].timestamp;
      const flightTimeMs = frames[djFinalLandingIdx].timestamp - frames[djTakeoffIdx].timestamp;
      
      if (flightTimeMs >= MIN_FLIGHT_TIME_MS && flightTimeMs <= MAX_FLIGHT_TIME_MS) {
        const jumpHeightCm = calculateJumpHeightFromFlightTime(flightTimeMs);
        const hipDisplacement = calculateJumpHeightFromHipDisplacement(
          calibration.groundLevel,
          minHipY,
          athleteHeightCm
        );
        
        return {
          events,
          metrics: {
            flightTimeMs,
            contactTimeMs,
            jumpHeightCm,
            hipDisplacementCm: hipDisplacement,
            takeoffVelocityMs: Math.sqrt(2 * 9.81 * (jumpHeightCm / 100)),
          },
          phase: 'complete',
        };
      }
    }
  } else {
    // CMJ / SL-CMJ analysis - looking for: takeoff -> peak -> landing
    let state: 'waiting_takeoff' | 'in_air' | 'landed' = 'waiting_takeoff';
    let consecutiveTakeoffFrames = 0;
    
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      
      if (state === 'waiting_takeoff') {
        let isTakeoff = false;
        
        if (protocol === 'cmj') {
          isTakeoff = detectCMJTakeoff(frame, calibration);
        } else {
          isTakeoff = detectSLCMJTakeoff(frame, calibration, activeLeg);
        }
        
        if (isTakeoff) {
          consecutiveTakeoffFrames++;
          if (consecutiveTakeoffFrames >= MIN_TAKEOFF_FRAMES && takeoffFrameIdx === null) {
            takeoffFrameIdx = i - MIN_TAKEOFF_FRAMES + 1;
            events.takeoffTime = frames[takeoffFrameIdx].timestamp;
            state = 'in_air';
          }
        } else {
          consecutiveTakeoffFrames = 0;
        }
      } else if (state === 'in_air') {
        // Track peak height
        if (frame.hipCenterY < minHipY) {
          minHipY = frame.hipCenterY;
          peakHeightFrameIdx = i;
          events.peakHeightTime = frame.timestamp;
        }
        
        let isLanding = false;
        if (protocol === 'cmj') {
          isLanding = detectCMJLanding(frame, calibration);
        } else {
          isLanding = detectSLCMJLanding(frame, calibration, activeLeg);
        }
        
        if (isLanding) {
          landingFrameIdx = i;
          state = 'landed';
          phase = 'complete';
          break;
        }
      }
    }
    
    // Calculate CMJ/SL-CMJ metrics
    if (takeoffFrameIdx !== null && landingFrameIdx !== null) {
      const flightTimeMs = frames[landingFrameIdx].timestamp - frames[takeoffFrameIdx].timestamp;
      
      if (flightTimeMs >= MIN_FLIGHT_TIME_MS && flightTimeMs <= MAX_FLIGHT_TIME_MS) {
        const jumpHeightCm = calculateJumpHeightFromFlightTime(flightTimeMs);
        const hipDisplacement = calculateJumpHeightFromHipDisplacement(
          calibration.groundLevel,
          minHipY,
          athleteHeightCm
        );
        
        // For CMJ/SL-CMJ, contact time is typically measured as the time from
        // lowest position to takeoff. We use a placeholder value here.
        const estimatedContactTimeMs = 250;  // Default estimate
        
        return {
          events,
          metrics: {
            flightTimeMs,
            contactTimeMs: estimatedContactTimeMs,
            jumpHeightCm,
            hipDisplacementCm: hipDisplacement,
            takeoffVelocityMs: Math.sqrt(2 * 9.81 * (jumpHeightCm / 100)),
          },
          phase: 'complete',
        };
      }
    }
  }

  return {
    events,
    metrics: null,
    phase: phase === 'complete' ? 'complete' : 'idle',
    error: phase !== 'complete' ? 'Could not detect complete jump' : undefined,
  };
}

/**
 * Helper to create empty events object
 */
function createEmptyEvents(): JumpEvents {
  return {
    countdownStart: null,
    countdownEnd: null,
    takeoffTime: null,
    landingTime: null,
    peakHeightTime: null,
  };
}

/**
 * Extract pose landmarks relevant for jump detection
 */
export function extractJumpLandmarks(
  keypoints: Array<{ name: string; x: number; y: number; score: number }>
): JumpPoseLandmarks {
  const findLandmark = (name: string) => {
    const kp = keypoints.find(k => k.name === name);
    return kp && kp.score >= MIN_LANDMARK_CONFIDENCE 
      ? { x: kp.x, y: kp.y, score: kp.score }
      : null;
  };

  return {
    leftToe: findLandmark('left_foot_index') || findLandmark('left_ankle'),
    rightToe: findLandmark('right_foot_index') || findLandmark('right_ankle'),
    leftAnkle: findLandmark('left_ankle'),
    rightAnkle: findLandmark('right_ankle'),
    leftHip: findLandmark('left_hip'),
    rightHip: findLandmark('right_hip'),
  };
}

/**
 * Convert pose landmarks to JumpFrameData
 */
export function createJumpFrameData(
  landmarks: JumpPoseLandmarks,
  timestamp: number
): JumpFrameData | null {
  // Need at least toe/ankle landmarks for both sides and hips
  if (!landmarks.leftAnkle || !landmarks.rightAnkle || 
      !landmarks.leftHip || !landmarks.rightHip) {
    return null;
  }

  const leftToe = landmarks.leftToe || landmarks.leftAnkle;
  const rightToe = landmarks.rightToe || landmarks.rightAnkle;

  const avgConfidence = [
    leftToe.score,
    rightToe.score,
    landmarks.leftHip.score,
    landmarks.rightHip.score,
  ].reduce((a, b) => a + b, 0) / 4;

  return {
    timestamp,
    leftToeY: leftToe.y,
    rightToeY: rightToe.y,
    leftAnkleY: landmarks.leftAnkle.y,
    rightAnkleY: landmarks.rightAnkle.y,
    leftHipY: landmarks.leftHip.y,
    rightHipY: landmarks.rightHip.y,
    hipCenterY: (landmarks.leftHip.y + landmarks.rightHip.y) / 2,
    confidence: avgConfidence,
  };
}
