/**
 * Jump Detector
 * 
 * Core logic for detecting jump events from pose landmarks.
 * Handles ground calibration, takeoff/landing detection, and metric extraction.
 * 
 * IMPORTANT: This module ONLY extracts raw metrics (Flight Time, Contact Time, Jump Height).
 * All RSI, fatigue, z-score calculations are handled by the existing backend pipeline.
 * 
 * DETECTION PIPELINE:
 * 1. Ground calibration from standing frames
 * 2. Frame smoothing (moving average) for noise reduction
 * 3. Countermovement detection (hip descent) for CMJ
 * 4. Takeoff detection (feet above threshold)
 * 5. Landing detection (feet return to ground)
 * 6. Metric calculation from timestamps
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
  OrientationResult,
  JUMP_DETECTION_CONFIG,
} from './types';

const {
  CALIBRATION_FRAMES,
  GROUND_THRESHOLD_MARGIN,
  MIN_FLIGHT_TIME_MS,
  MAX_FLIGHT_TIME_MS,
  MIN_TAKEOFF_FRAMES,
  MIN_LANDING_FRAMES,
  DEFAULT_ATHLETE_HEIGHT_CM,
  HIP_TO_HEIGHT_RATIO,
  MIN_LANDMARK_CONFIDENCE,
  COUNTERMOVEMENT_THRESHOLD,
  SMOOTHING_WINDOW,
  ORIENTATION_MIN_WIDTH,
} = JUMP_DETECTION_CONFIG;

// ============================================================
// UTILITY: clamp
// ============================================================
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================
// FRAME SMOOTHING
// ============================================================

/**
 * Apply moving average smoothing to frame data
 * Reduces noise from pose detection jitter
 */
export function smoothFrames(frames: JumpFrameData[], windowSize: number = SMOOTHING_WINDOW): JumpFrameData[] {
  if (frames.length < windowSize) return frames;
  
  const smoothed: JumpFrameData[] = [];
  
  for (let i = 0; i < frames.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(frames.length, i + Math.ceil(windowSize / 2));
    const window = frames.slice(start, end);
    
    const avg = (field: keyof JumpFrameData) => {
      const values = window.map(f => f[field] as number);
      return values.reduce((a, b) => a + b, 0) / values.length;
    };
    
    smoothed.push({
      timestamp: frames[i].timestamp, // Keep original timestamp
      leftToeY: avg('leftToeY'),
      rightToeY: avg('rightToeY'),
      leftAnkleY: avg('leftAnkleY'),
      rightAnkleY: avg('rightAnkleY'),
      leftHipY: avg('leftHipY'),
      rightHipY: avg('rightHipY'),
      hipCenterY: avg('hipCenterY'),
      confidence: frames[i].confidence,
    });
  }
  
  return smoothed;
}

// ============================================================
// GROUND CALIBRATION
// ============================================================

/**
 * Ground Calibration
 * Calculates ground level and standing hip position from countdown frames
 */
export function calibrateGround(frames: JumpFrameData[]): GroundCalibration {
  const defaultResult: GroundCalibration = {
    groundLevel: 0.9,
    groundThreshold: 0.9 - 0.015,
    calibrationFrames: frames.length,
    isCalibrated: false,
    standingHipY: 0.5,
    confidenceScore: 0,
    footStability: 0,
    poseConfidence: 0,
    groundStability: 0,
    lockedLandmark: 'ankle',
  };

  if (frames.length < 10) {
    console.log('[JUMP_DETECTOR] Calibration: insufficient frames (' + frames.length + ')');
    return defaultResult;
  }

  // Use middle 60% of frames (skip first/last 20% for stability)
  const trimStart = Math.floor(frames.length * 0.2);
  const trimEnd = Math.floor(frames.length * 0.8);
  const stableFrames = frames.slice(trimStart, trimEnd);
  
  if (stableFrames.length < 5) {
    console.log('[JUMP_DETECTOR] Calibration: insufficient stable frames');
    return defaultResult;
  }

  // PART 4: Lock landmark - determine if foot_index is consistently available
  // Check if leftToeY and leftAnkleY differ significantly (foot_index vs ankle fallback)
  let footIndexCount = 0;
  for (const f of stableFrames) {
    // foot_index and ankle differ when foot_index is truly detected
    const leftDiff = Math.abs(f.leftToeY - f.leftAnkleY);
    const rightDiff = Math.abs(f.rightToeY - f.rightAnkleY);
    if (leftDiff > 0.005 || rightDiff > 0.005) {
      footIndexCount++;
    }
  }
  const lockedLandmark: 'foot_index' | 'ankle' = 
    (footIndexCount / stableFrames.length) > 0.7 ? 'foot_index' : 'ankle';

  // Calculate average Y position of feet (higher Y = lower on screen = on ground)
  const footYPositions = stableFrames.map(f => {
    return Math.max(f.leftToeY, f.rightToeY);
  });

  const groundLevel = footYPositions.reduce((a, b) => a + b, 0) / footYPositions.length;
  
  // Calculate standing hip Y for countermovement detection
  const hipYPositions = stableFrames.map(f => f.hipCenterY);
  const standingHipY = hipYPositions.reduce((a, b) => a + b, 0) / hipYPositions.length;
  
  // Calculate standard deviation for adaptive threshold
  const stdDev = Math.sqrt(
    footYPositions.reduce((sum, y) => sum + Math.pow(y - groundLevel, 2), 0) / footYPositions.length
  );
  
  // PART 2: Use clamp instead of max for adaptive margin
  // adaptiveMargin = clamp(stdDev * 1.5, 0.008, 0.02)
  const adaptiveMargin = clamp(stdDev * 1.5, 0.008, 0.02);
  
  // === CONFIDENCE SCORE CALCULATION (PART 5) ===
  
  // Component 1: Foot stability (0-1) — lower stdDev = more stable
  // stdDev < 0.003 = perfectly stable (1.0), stdDev > 0.02 = unstable (0.0)
  const footStability = clamp(1.0 - (stdDev / 0.02), 0, 1);
  
  // Component 2: Pose confidence (0-1) — average confidence across calibration frames
  const avgConfidence = stableFrames.reduce((sum, f) => sum + f.confidence, 0) / stableFrames.length;
  const poseConfidence = clamp(avgConfidence, 0, 1);
  
  // Component 3: Ground stability (0-1) — consistency of ground level
  const hipStdDev = Math.sqrt(
    hipYPositions.reduce((sum, y) => sum + Math.pow(y - standingHipY, 2), 0) / hipYPositions.length
  );
  const groundStability = clamp(1.0 - (hipStdDev / 0.015), 0, 1);
  
  // Combined score: foot_stability * 0.5 + pose_confidence * 0.3 + ground_stability * 0.2
  const confidenceScore = clamp(
    (footStability * 0.5) + (poseConfidence * 0.3) + (groundStability * 0.2),
    0, 1
  );
  
  console.log('[JUMP_DETECTOR] Calibration complete:');
  console.log('[JUMP_DETECTOR]   groundLevel=' + groundLevel.toFixed(4));
  console.log('[JUMP_DETECTOR]   standingHipY=' + standingHipY.toFixed(4));
  console.log('[JUMP_DETECTOR]   stdDev=' + stdDev.toFixed(4));
  console.log('[JUMP_DETECTOR]   adaptiveMargin=' + adaptiveMargin.toFixed(4) + ' (clamped)');
  console.log('[JUMP_DETECTOR]   threshold=' + (groundLevel - adaptiveMargin).toFixed(4));
  console.log('[JUMP_DETECTOR]   lockedLandmark=' + lockedLandmark);
  console.log('[JUMP_DETECTOR]   confidenceScore=' + confidenceScore.toFixed(3));
  console.log('[JUMP_DETECTOR]   footStability=' + footStability.toFixed(3));
  console.log('[JUMP_DETECTOR]   poseConfidence=' + poseConfidence.toFixed(3));
  console.log('[JUMP_DETECTOR]   groundStability=' + groundStability.toFixed(3));
  console.log('[JUMP_DETECTOR]   frames used=' + stableFrames.length);
  
  return {
    groundLevel,
    groundThreshold: groundLevel - adaptiveMargin,
    calibrationFrames: stableFrames.length,
    isCalibrated: true,
    standingHipY,
    confidenceScore,
    footStability,
    poseConfidence,
    groundStability,
    lockedLandmark,
  };
}

// ============================================================
// ACTIVE LEG DETECTION
// ============================================================

/**
 * Active Leg Detection (for SL-CMJ)
 * Determines which leg is the active (supporting) leg during countdown
 */
export function detectActiveLeg(frames: JumpFrameData[]): ActiveLeg {
  if (frames.length < 30) return null;

  let leftLower = 0;
  let rightLower = 0;

  for (const frame of frames) {
    if (frame.leftToeY > frame.rightToeY + 0.03) {
      leftLower++;
    } else if (frame.rightToeY > frame.leftToeY + 0.03) {
      rightLower++;
    }
  }

  const total = frames.length;
  if (leftLower / total > 0.6) return 'left';
  if (rightLower / total > 0.6) return 'right';
  return null;
}

// ============================================================
// TAKEOFF / LANDING DETECTION
// ============================================================

/**
 * CMJ Takeoff Detection - Both feet must be above ground threshold
 */
export function detectCMJTakeoff(
  frame: JumpFrameData,
  calibration: GroundCalibration
): boolean {
  const threshold = calibration.groundThreshold;
  return frame.leftToeY < threshold && frame.rightToeY < threshold;
}

/**
 * CMJ Landing Detection - Either foot touches ground
 */
export function detectCMJLanding(
  frame: JumpFrameData,
  calibration: GroundCalibration
): boolean {
  const threshold = calibration.groundThreshold;
  return frame.leftToeY >= threshold || frame.rightToeY >= threshold;
}

/**
 * SL-CMJ Takeoff Detection - Active foot must be above ground threshold
 */
export function detectSLCMJTakeoff(
  frame: JumpFrameData,
  calibration: GroundCalibration,
  activeLeg: ActiveLeg
): boolean {
  const threshold = calibration.groundThreshold;
  if (activeLeg === 'left') return frame.leftToeY < threshold;
  if (activeLeg === 'right') return frame.rightToeY < threshold;
  return false;
}

/**
 * SL-CMJ Landing Detection
 */
export function detectSLCMJLanding(
  frame: JumpFrameData,
  calibration: GroundCalibration,
  activeLeg: ActiveLeg
): boolean {
  const threshold = calibration.groundThreshold;
  if (activeLeg === 'left') return frame.leftToeY >= threshold || frame.rightToeY >= threshold;
  if (activeLeg === 'right') return frame.rightToeY >= threshold || frame.leftToeY >= threshold;
  return false;
}

// ============================================================
// COUNTERMOVEMENT DETECTION
// ============================================================

/**
 * Detect countermovement start (hip descends below standing position)
 */
export function detectCountermovementStart(
  frame: JumpFrameData,
  calibration: GroundCalibration
): boolean {
  // Hip Y increases (moves down) past threshold from standing
  return frame.hipCenterY > calibration.standingHipY + COUNTERMOVEMENT_THRESHOLD;
}

// ============================================================
// METRIC CALCULATIONS
// ============================================================

/**
 * Calculate Jump Height from Flight Time
 * Using physics formula: h = (g * t^2) / 8
 */
export function calculateJumpHeightFromFlightTime(flightTimeMs: number): number {
  const g = 9.81;
  const t = flightTimeMs / 1000;
  const heightM = (g * t * t) / 8;
  return heightM * 100; // cm
}

/**
 * Calculate Jump Height from Hip Displacement
 */
export function calculateJumpHeightFromHipDisplacement(
  standingHipY: number,
  peakHipY: number,
  athleteHeightCm: number = DEFAULT_ATHLETE_HEIGHT_CM
): number {
  const standingHipHeightCm = athleteHeightCm * HIP_TO_HEIGHT_RATIO;
  const displacement = standingHipY - peakHipY;
  const estimatedHeightCm = displacement * standingHipHeightCm * 2;
  return Math.max(0, estimatedHeightCm);
}

// ============================================================
// MAIN ANALYSIS FUNCTION
// ============================================================

export interface JumpAnalysisResult {
  events: JumpEvents;
  metrics: JumpMetrics | null;
  phase: JumpPhase;
  error?: string;
}

export function analyzeJumpFrames(
  rawFrames: JumpFrameData[],
  calibration: GroundCalibration,
  protocol: JumpProtocol,
  activeLeg: ActiveLeg,
  boxHeightCm: number = 0,
  athleteHeightCm: number = DEFAULT_ATHLETE_HEIGHT_CM
): JumpAnalysisResult {
  console.log('[LOG_JUMP_PIPELINE_START] analyzeJumpFrames called');
  console.log('[JUMP_DETECTOR] Protocol: ' + protocol);
  console.log('[JUMP_DETECTOR] Frames: ' + rawFrames.length);
  console.log('[JUMP_DETECTOR] Calibrated: ' + calibration.isCalibrated);
  console.log('[JUMP_DETECTOR] Ground: ' + calibration.groundLevel.toFixed(4));
  console.log('[JUMP_DETECTOR] Threshold: ' + calibration.groundThreshold.toFixed(4));
  
  if (!calibration.isCalibrated) {
    console.log('[JUMP_DETECTOR] ERROR: Not calibrated');
    return {
      events: createEmptyEvents(),
      metrics: null,
      phase: 'idle',
      error: 'Ground calibration not complete',
    };
  }

  if (rawFrames.length < 15) {
    console.log('[JUMP_DETECTOR] ERROR: Only ' + rawFrames.length + ' frames (need 15+)');
    return {
      events: createEmptyEvents(),
      metrics: null,
      phase: 'idle',
      error: 'Not enough frames for analysis (' + rawFrames.length + ')',
    };
  }

  // Apply smoothing to reduce noise
  const frames = smoothFrames(rawFrames, SMOOTHING_WINDOW);
  console.log('[JUMP_DETECTOR] Smoothed ' + frames.length + ' frames');
  
  // Log first few frames for debugging
  for (let i = 0; i < Math.min(5, frames.length); i++) {
    const f = frames[i];
    console.log('[JUMP_DETECTOR] Frame[' + i + ']: leftToe=' + f.leftToeY.toFixed(4) + 
      ' rightToe=' + f.rightToeY.toFixed(4) + ' hip=' + f.hipCenterY.toFixed(4) +
      ' conf=' + f.confidence.toFixed(2));
  }
  
  // Log last few frames
  for (let i = Math.max(0, frames.length - 3); i < frames.length; i++) {
    const f = frames[i];
    console.log('[JUMP_DETECTOR] Frame[' + i + ']: leftToe=' + f.leftToeY.toFixed(4) + 
      ' rightToe=' + f.rightToeY.toFixed(4) + ' hip=' + f.hipCenterY.toFixed(4));
  }

  const events: JumpEvents = createEmptyEvents();
  let minHipY = Infinity;

  return analyzeCMJ(frames, calibration, events, protocol, activeLeg, athleteHeightCm);
}

/**
 * CMJ / SL-CMJ Analysis
 */
function analyzeCMJ(
  frames: JumpFrameData[],
  calibration: GroundCalibration,
  events: JumpEvents,
  protocol: JumpProtocol,
  activeLeg: ActiveLeg,
  athleteHeightCm: number
): JumpAnalysisResult {
  let takeoffFrameIdx: number | null = null;
  let landingFrameIdx: number | null = null;
  let peakHeightFrameIdx: number | null = null;
  let countermovementStartIdx: number | null = null;
  let minHipY = Infinity;
  
  let state: 'waiting_countermovement' | 'countermovement' | 'waiting_takeoff' | 'in_air' | 'landed' = 'waiting_countermovement';
  let consecutiveTakeoffFrames = 0;
  let consecutiveLandingFrames = 0;
  
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    
    // PHASE 1: Detect countermovement (hip descent)
    if (state === 'waiting_countermovement') {
      if (detectCountermovementStart(frame, calibration)) {
        countermovementStartIdx = i;
        events.countermovementStart = frame.timestamp;
        state = 'countermovement';
        console.log('[JUMP_DETECTOR] Countermovement detected at frame ' + i);
      }
      // Also check for direct takeoff (no countermovement detected)
      let isTakeoff = false;
      if (protocol === 'cmj') {
        isTakeoff = detectCMJTakeoff(frame, calibration);
      } else {
        isTakeoff = detectSLCMJTakeoff(frame, calibration, activeLeg);
      }
      if (isTakeoff) {
        consecutiveTakeoffFrames++;
        if (consecutiveTakeoffFrames >= MIN_TAKEOFF_FRAMES) {
          takeoffFrameIdx = i - MIN_TAKEOFF_FRAMES + 1;
          events.takeoffTime = frames[takeoffFrameIdx].timestamp;
          state = 'in_air';
          console.log('[LOG_JUMP_TAKEOFF_DETECTED] Takeoff at frame ' + takeoffFrameIdx + ' (no countermovement)');
        }
      } else {
        consecutiveTakeoffFrames = 0;
      }
      continue;
    }
    
    // PHASE 2: During countermovement, wait for takeoff
    if (state === 'countermovement') {
      let isTakeoff = false;
      if (protocol === 'cmj') {
        isTakeoff = detectCMJTakeoff(frame, calibration);
      } else {
        isTakeoff = detectSLCMJTakeoff(frame, calibration, activeLeg);
      }
      
      if (isTakeoff) {
        consecutiveTakeoffFrames++;
        if (consecutiveTakeoffFrames >= MIN_TAKEOFF_FRAMES) {
          takeoffFrameIdx = i - MIN_TAKEOFF_FRAMES + 1;
          events.takeoffTime = frames[takeoffFrameIdx].timestamp;
          state = 'in_air';
          console.log('[LOG_JUMP_TAKEOFF_DETECTED] Takeoff at frame ' + takeoffFrameIdx);
        }
      } else {
        consecutiveTakeoffFrames = 0;
      }
      continue;
    }
    
    // PHASE 3: In air - track peak height and detect landing (SYMMETRIC: MIN_LANDING_FRAMES)
    if (state === 'in_air') {
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
        consecutiveLandingFrames++;
        if (consecutiveLandingFrames >= MIN_LANDING_FRAMES) {
          // Symmetric with takeoff: use first frame of confirmed landing sequence
          landingFrameIdx = i - MIN_LANDING_FRAMES + 1;
          events.landingTime = frames[landingFrameIdx].timestamp;
          state = 'landed';
          console.log('[LOG_JUMP_LANDING_DETECTED] Landing at frame ' + landingFrameIdx + ' (confirmed after ' + MIN_LANDING_FRAMES + ' frames)');
          break;
        }
      } else {
        consecutiveLandingFrames = 0;
      }
    }
  }
  
  // Calculate metrics
  if (takeoffFrameIdx !== null && landingFrameIdx !== null) {
    // PART 1.2: LATENCY COMPENSATION
    // Apply AFTER event confirmation, with bounds validation
    const compensatedTakeoffIdx = Math.max(0, takeoffFrameIdx - 1);
    const compensatedLandingIdx = Math.min(frames.length - 1, landingFrameIdx + 1);
    
    const flightTimeMs = frames[compensatedLandingIdx].timestamp - frames[compensatedTakeoffIdx].timestamp;
    
    console.log('[JUMP_DETECTOR] Raw takeoff=' + takeoffFrameIdx + ' compensated=' + compensatedTakeoffIdx);
    console.log('[JUMP_DETECTOR] Raw landing=' + landingFrameIdx + ' compensated=' + compensatedLandingIdx);
    console.log('[JUMP_DETECTOR] Flight time: ' + flightTimeMs + 'ms');
    
    if (flightTimeMs >= MIN_FLIGHT_TIME_MS && flightTimeMs <= MAX_FLIGHT_TIME_MS) {
      const jumpHeightCm = calculateJumpHeightFromFlightTime(flightTimeMs);
      const hipDisplacement = calculateJumpHeightFromHipDisplacement(
        calibration.standingHipY,
        minHipY,
        athleteHeightCm
      );
      
      // Eccentric duration: from countermovement start to takeoff
      let eccentricDurationMs = 0;
      if (countermovementStartIdx !== null && takeoffFrameIdx !== null) {
        eccentricDurationMs = frames[takeoffFrameIdx].timestamp - frames[countermovementStartIdx].timestamp;
      }
      
      // contactTimeMs nao se aplica ao CMJ/SL-CMJ
      // timeToTakeoff = eccentricDuration (from movement start to takeoff)
      const contactTimeMs = 0;
      const timeToTakeoffMs = eccentricDurationMs;
      
      // RSI modified for CMJ = jumpHeight (m) / timeToTakeoff (s)
      const rsiMod = timeToTakeoffMs > 0 ? (jumpHeightCm / 100) / (timeToTakeoffMs / 1000) : 0;
      
      const metrics: JumpMetrics = {
        flightTimeMs,
        contactTimeMs,
        jumpHeightCm,
        hipDisplacementCm: hipDisplacement,
        takeoffVelocityMs: Math.sqrt(2 * 9.81 * (jumpHeightCm / 100)),
        eccentricDurationMs,
        rsiMod: Math.round(rsiMod * 100) / 100,
      };
      
      console.log('[LOG_JUMP_METRICS_CALCULATED] CMJ Metrics:');
      console.log('[LOG_JUMP_METRICS_CALCULATED]   flightTime=' + flightTimeMs + 'ms');
      console.log('[LOG_JUMP_METRICS_CALCULATED]   jumpHeight=' + jumpHeightCm.toFixed(1) + 'cm');
      console.log('[LOG_JUMP_METRICS_CALCULATED]   eccentricDuration=' + eccentricDurationMs + 'ms');
      console.log('[LOG_JUMP_METRICS_CALCULATED]   timeToTakeoff=' + timeToTakeoffMs + 'ms');
      console.log('[LOG_JUMP_METRICS_CALCULATED]   rsiMod=' + rsiMod.toFixed(2) + ' (jumpHeight/timeToTakeoff)');
      
      return {
        events,
        metrics,
        phase: 'complete',
      };
    } else {
      console.log('[JUMP_DETECTOR] Flight time out of range: ' + flightTimeMs + 'ms');
    }
  } else {
    console.log('[JUMP_DETECTOR] Jump phases not detected:');
    console.log('[JUMP_DETECTOR]   takeoff=' + (takeoffFrameIdx !== null ? 'YES' : 'NO'));
    console.log('[JUMP_DETECTOR]   landing=' + (landingFrameIdx !== null ? 'YES' : 'NO'));
    
    // Provide diagnostic info about frame values vs threshold
    if (frames.length > 0) {
      const minLeftToe = Math.min(...frames.map(f => f.leftToeY));
      const minRightToe = Math.min(...frames.map(f => f.rightToeY));
      const maxLeftToe = Math.max(...frames.map(f => f.leftToeY));
      const maxRightToe = Math.max(...frames.map(f => f.rightToeY));
      console.log('[JUMP_DETECTOR] Foot Y range: leftToe=[' + minLeftToe.toFixed(4) + ',' + maxLeftToe.toFixed(4) + 
        '] rightToe=[' + minRightToe.toFixed(4) + ',' + maxRightToe.toFixed(4) + ']');
      console.log('[JUMP_DETECTOR] Ground threshold: ' + calibration.groundThreshold.toFixed(4));
      console.log('[JUMP_DETECTOR] For takeoff, both feet need Y < ' + calibration.groundThreshold.toFixed(4));
    }
  }

  return {
    events,
    metrics: null,
    phase: state === 'landed' ? 'complete' : 'idle',
    error: 'Could not detect complete jump. Ensure the athlete is fully visible and performs a clear jump.',
  };
}

/**
 * Helper to create empty events object
 */
function createEmptyEvents(): JumpEvents {
  return {
    countdownStart: null,
    countdownEnd: null,
    countermovementStart: null,
    takeoffTime: null,
    landingTime: null,
    peakHeightTime: null,
  };
}

/**
 * Extract pose landmarks relevant for jump detection
 * Uses locked landmark from calibration when available
 */
export function extractJumpLandmarks(
  keypoints: Array<{ name: string; x: number; y: number; score: number }>,
  lockedLandmark?: 'foot_index' | 'ankle'
): JumpPoseLandmarks {
  const findLandmark = (name: string) => {
    const kp = keypoints.find(k => k.name === name);
    return kp && kp.score >= MIN_LANDMARK_CONFIDENCE 
      ? { x: kp.x, y: kp.y, score: kp.score }
      : null;
  };

  // PART 4: Consistent landmark selection - no alternation during a jump
  let leftToe: { x: number; y: number; score: number } | null = null;
  let rightToe: { x: number; y: number; score: number } | null = null;

  if (lockedLandmark === 'foot_index') {
    // Locked to foot_index: use it if available, else null (don't fallback to ankle)
    leftToe = findLandmark('left_foot_index');
    rightToe = findLandmark('right_foot_index');
    // If foot_index not detected this frame, use ankle as emergency fallback
    // but keep it consistent (still targeting foot-level position)
    if (!leftToe) leftToe = findLandmark('left_ankle');
    if (!rightToe) rightToe = findLandmark('right_ankle');
  } else if (lockedLandmark === 'ankle') {
    // Locked to ankle: always use ankle, never foot_index
    leftToe = findLandmark('left_ankle');
    rightToe = findLandmark('right_ankle');
  } else {
    // No lock (pre-calibration): use foot_index with ankle fallback (original behavior)
    leftToe = findLandmark('left_foot_index') || findLandmark('left_ankle');
    rightToe = findLandmark('right_foot_index') || findLandmark('right_ankle');
  }

  return {
    leftToe,
    rightToe,
    leftAnkle: findLandmark('left_ankle'),
    rightAnkle: findLandmark('right_ankle'),
    leftHip: findLandmark('left_hip'),
    rightHip: findLandmark('right_hip'),
    leftShoulder: findLandmark('left_shoulder'),
    rightShoulder: findLandmark('right_shoulder'),
    leftKnee: findLandmark('left_knee'),
    rightKnee: findLandmark('right_knee'),
  };
}

/**
 * Check athlete orientation — LATERAL (side profile) is REQUIRED.
 * Small shoulder/hip widths = overlapping = lateral = VALID.
 * Large widths = frontal (facing camera) = INVALID.
 */
export function checkAthleteOrientation(
  landmarks: JumpPoseLandmarks
): OrientationResult {
  const { leftShoulder, rightShoulder, leftHip, rightHip } = landmarks;

  // If key landmarks not detected, don't block (graceful degradation)
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return { isValid: true, shoulderWidth: 0, hipWidth: 0, message: null };
  }

  const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
  const hipWidth = Math.abs(leftHip.x - rightHip.x);

  // Lateral (side profile): both widths below threshold (overlapping landmarks)
  const isLateral = shoulderWidth < ORIENTATION_MIN_WIDTH && hipWidth < ORIENTATION_MIN_WIDTH;

  if (!isLateral) {
    console.log('[JUMP_DETECTOR] Orientation INVALID (frontal): shoulderW=' + shoulderWidth.toFixed(4) +
      ' hipW=' + hipWidth.toFixed(4) + ' threshold=' + ORIENTATION_MIN_WIDTH);
    return {
      isValid: false,
      shoulderWidth,
      hipWidth,
      message: 'Posicione-se de lado para a camera',
    };
  }

  return { isValid: true, shoulderWidth, hipWidth, message: null };
}

/**
 * Identify which leg performed the jump based on ankle impulse.
 * Uses cumulative ankle Y displacement during the jump window.
 * The leg with MORE displacement is the active (jumping) leg.
 */
export function identifyJumpLeg(
  frames: JumpFrameData[],
  startIdx: number,
  endIdx: number
): 'left' | 'right' | null {
  if (frames.length < 2) return null;

  const safeStart = Math.max(0, startIdx);
  const safeEnd = Math.min(frames.length - 1, endIdx);

  let impulseLeft = 0;
  let impulseRight = 0;

  for (let i = safeStart + 1; i <= safeEnd; i++) {
    impulseLeft += Math.abs(frames[i].leftAnkleY - frames[i - 1].leftAnkleY);
    impulseRight += Math.abs(frames[i].rightAnkleY - frames[i - 1].rightAnkleY);
  }

  if (impulseLeft > impulseRight * 1.2) return 'left';
  if (impulseRight > impulseLeft * 1.2) return 'right';
  return null;
}

/**
 * Convert pose landmarks to JumpFrameData
 */
export function createJumpFrameData(
  landmarks: JumpPoseLandmarks,
  timestamp: number
): JumpFrameData | null {
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
