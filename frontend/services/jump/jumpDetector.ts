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
  COUNTERMOVEMENT_THRESHOLD,
  SMOOTHING_WINDOW,
} = JUMP_DETECTION_CONFIG;

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
  if (frames.length < 10) {
    console.log('[JUMP_DETECTOR] Calibration: insufficient frames (' + frames.length + ')');
    return {
      groundLevel: 0.9,
      groundThreshold: 0.9 - GROUND_THRESHOLD_MARGIN,
      calibrationFrames: frames.length,
      isCalibrated: false,
      standingHipY: 0.5,
    };
  }

  // Use middle 60% of frames (skip first/last 20% for stability)
  const trimStart = Math.floor(frames.length * 0.2);
  const trimEnd = Math.floor(frames.length * 0.8);
  const stableFrames = frames.slice(trimStart, trimEnd);
  
  if (stableFrames.length < 5) {
    console.log('[JUMP_DETECTOR] Calibration: insufficient stable frames');
    return {
      groundLevel: 0.9,
      groundThreshold: 0.9 - GROUND_THRESHOLD_MARGIN,
      calibrationFrames: frames.length,
      isCalibrated: false,
      standingHipY: 0.5,
    };
  }

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
  
  // Use max of fixed margin and 2x stddev for threshold
  const adaptiveMargin = Math.max(GROUND_THRESHOLD_MARGIN, stdDev * 2.5);
  
  console.log('[JUMP_DETECTOR] Calibration complete:');
  console.log('[JUMP_DETECTOR]   groundLevel=' + groundLevel.toFixed(4));
  console.log('[JUMP_DETECTOR]   standingHipY=' + standingHipY.toFixed(4));
  console.log('[JUMP_DETECTOR]   stdDev=' + stdDev.toFixed(4));
  console.log('[JUMP_DETECTOR]   adaptiveMargin=' + adaptiveMargin.toFixed(4));
  console.log('[JUMP_DETECTOR]   threshold=' + (groundLevel - adaptiveMargin).toFixed(4));
  console.log('[JUMP_DETECTOR]   frames used=' + stableFrames.length);
  
  return {
    groundLevel,
    groundThreshold: groundLevel - adaptiveMargin,
    calibrationFrames: stableFrames.length,
    isCalibrated: true,
    standingHipY,
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

/**
 * DJ Initial Landing Detection
 */
export function detectDJInitialLanding(
  frame: JumpFrameData,
  calibration: GroundCalibration,
  previousFrame: JumpFrameData | null
): boolean {
  const threshold = calibration.groundThreshold;
  if (!previousFrame) return false;
  const wasInAir = previousFrame.leftToeY < threshold && previousFrame.rightToeY < threshold;
  const nowOnGround = frame.leftToeY >= threshold || frame.rightToeY >= threshold;
  return wasInAir && nowOnGround;
}

/**
 * DJ Takeoff Detection (after ground contact)
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

  if (protocol === 'dj') {
    return analyzeDJ(frames, calibration, events, athleteHeightCm);
  } else {
    return analyzeCMJ(frames, calibration, events, protocol, activeLeg, athleteHeightCm);
  }
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
    
    // Skip waiting_takeoff - handled above
    
    // PHASE 3: In air - track peak height and detect landing
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
        landingFrameIdx = i;
        events.landingTime = frame.timestamp;
        state = 'landed';
        console.log('[LOG_JUMP_LANDING_DETECTED] Landing at frame ' + i);
        break;
      }
    }
  }
  
  // Calculate metrics
  if (takeoffFrameIdx !== null && landingFrameIdx !== null) {
    const flightTimeMs = frames[landingFrameIdx].timestamp - frames[takeoffFrameIdx].timestamp;
    
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
      
      // For CMJ: contactTimeMs is NOT applicable (reactive contact is a DJ concept)
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
 * DJ Analysis
 */
function analyzeDJ(
  frames: JumpFrameData[],
  calibration: GroundCalibration,
  events: JumpEvents,
  athleteHeightCm: number
): JumpAnalysisResult {
  let djInitialLandingIdx: number | null = null;
  let djTakeoffIdx: number | null = null;
  let djFinalLandingIdx: number | null = null;
  let minHipY = Infinity;
  
  let state: 'waiting_land' | 'on_ground' | 'in_air' | 'final_land' = 'waiting_land';
  let consecutiveTakeoffFrames = 0;
  
  for (let i = 1; i < frames.length; i++) {
    const frame = frames[i];
    const prevFrame = frames[i - 1];
    
    if (state === 'waiting_land') {
      if (detectDJInitialLanding(frame, calibration, prevFrame)) {
        djInitialLandingIdx = i;
        events.djInitialLandingTime = frame.timestamp;
        state = 'on_ground';
        console.log('[JUMP_DETECTOR] DJ initial landing at frame ' + i);
      }
    } else if (state === 'on_ground') {
      if (detectDJTakeoff(frame, calibration)) {
        consecutiveTakeoffFrames++;
        if (consecutiveTakeoffFrames >= MIN_TAKEOFF_FRAMES) {
          djTakeoffIdx = i - MIN_TAKEOFF_FRAMES + 1;
          events.takeoffTime = frames[djTakeoffIdx].timestamp;
          events.djContactEndTime = frames[djTakeoffIdx].timestamp;
          state = 'in_air';
          console.log('[LOG_JUMP_TAKEOFF_DETECTED] DJ takeoff at frame ' + djTakeoffIdx);
        }
      } else {
        consecutiveTakeoffFrames = 0;
      }
    } else if (state === 'in_air') {
      if (frame.hipCenterY < minHipY) {
        minHipY = frame.hipCenterY;
        events.peakHeightTime = frame.timestamp;
      }
      
      if (detectDJFinalLanding(frame, calibration)) {
        djFinalLandingIdx = i;
        events.landingTime = frame.timestamp;
        state = 'final_land';
        console.log('[LOG_JUMP_LANDING_DETECTED] DJ final landing at frame ' + i);
        break;
      }
    }
  }
  
  // Calculate DJ metrics
  if (djInitialLandingIdx !== null && djTakeoffIdx !== null && djFinalLandingIdx !== null) {
    const contactTimeMs = frames[djTakeoffIdx].timestamp - frames[djInitialLandingIdx].timestamp;
    const flightTimeMs = frames[djFinalLandingIdx].timestamp - frames[djTakeoffIdx].timestamp;
    
    console.log('[JUMP_DETECTOR] DJ contact time: ' + contactTimeMs + 'ms');
    console.log('[JUMP_DETECTOR] DJ flight time: ' + flightTimeMs + 'ms');
    
    if (flightTimeMs >= MIN_FLIGHT_TIME_MS && flightTimeMs <= MAX_FLIGHT_TIME_MS) {
      const jumpHeightCm = calculateJumpHeightFromFlightTime(flightTimeMs);
      const hipDisplacement = calculateJumpHeightFromHipDisplacement(
        calibration.standingHipY,
        minHipY,
        athleteHeightCm
      );
      
      // RSImod for DJ = jumpHeight (m) / contactTime (s) — contactTime = time_to_takeoff no DJ
      const rsi = contactTimeMs > 0 ? (jumpHeightCm / 100) / (contactTimeMs / 1000) : 0;
      
      const metrics: JumpMetrics = {
        flightTimeMs,
        contactTimeMs,
        jumpHeightCm,
        hipDisplacementCm: hipDisplacement,
        takeoffVelocityMs: Math.sqrt(2 * 9.81 * (jumpHeightCm / 100)),
        eccentricDurationMs: 0, // N/A for DJ
        rsiMod: Math.round(rsi * 100) / 100,
      };
      
      console.log('[LOG_JUMP_METRICS_CALCULATED] DJ Metrics:');
      console.log('[LOG_JUMP_METRICS_CALCULATED]   flightTime=' + flightTimeMs + 'ms');
      console.log('[LOG_JUMP_METRICS_CALCULATED]   contactTime=' + contactTimeMs + 'ms');
      console.log('[LOG_JUMP_METRICS_CALCULATED]   jumpHeight=' + jumpHeightCm.toFixed(1) + 'cm');
      console.log('[LOG_JUMP_METRICS_CALCULATED]   RSImod=' + rsi.toFixed(2) + ' (jumpHeight/contactTime)');
      
      return {
        events,
        metrics,
        phase: 'complete',
      };
    }
  }
  
  return {
    events,
    metrics: null,
    phase: 'idle',
    error: 'Could not detect complete drop jump. Ensure the drop from box and subsequent jump are clearly visible.',
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
    djInitialLandingTime: null,
    djContactEndTime: null,
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
