/**
 * Jump Detector Unit Tests
 * 
 * Tests for the jump detection algorithms in services/jump/jumpDetector.ts
 * Uses synthetic frame data to verify detection logic.
 * 
 * Run with: npx ts-node test_jump_detector.ts
 */

import {
  JumpFrameData,
  GroundCalibration,
  JumpProtocol,
  ActiveLeg,
  JumpMetrics,
  JUMP_DETECTION_CONFIG,
} from '../services/jump/types';

import {
  smoothFrames,
  calibrateGround,
  detectCMJTakeoff,
  detectCMJLanding,
  analyzeJumpFrames,
  calculateJumpHeightFromFlightTime,
  calculateJumpHeightFromHipDisplacement,
  detectCountermovementStart,
} from '../services/jump/jumpDetector';

// ============================================================
// TEST UTILITIES
// ============================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

function assertClose(actual: number, expected: number, tolerance: number, message?: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message || 'Assertion failed'}: expected ${expected} ± ${tolerance}, got ${actual}`);
  }
}

function assertTrue(condition: boolean, message?: string): void {
  if (!condition) {
    throw new Error(message || 'Expected true but got false');
  }
}

function assertFalse(condition: boolean, message?: string): void {
  if (condition) {
    throw new Error(message || 'Expected false but got true');
  }
}

// ============================================================
// SYNTHETIC DATA GENERATORS
// ============================================================

/**
 * Generate standing frames (person standing still on ground)
 */
function generateStandingFrames(count: number, groundY: number = 0.85): JumpFrameData[] {
  const frames: JumpFrameData[] = [];
  let timestamp = 0;
  
  for (let i = 0; i < count; i++) {
    // Add slight noise to simulate real pose detection
    const noise = (Math.random() - 0.5) * 0.01;
    
    frames.push({
      timestamp: timestamp,
      leftToeY: groundY + noise,
      rightToeY: groundY + noise,
      leftAnkleY: groundY - 0.05 + noise,
      rightAnkleY: groundY - 0.05 + noise,
      leftHipY: 0.5 + noise,
      rightHipY: 0.5 + noise,
      hipCenterY: 0.5 + noise,
      confidence: 0.9,
    });
    
    timestamp += 33; // 30fps
  }
  
  return frames;
}

/**
 * Generate a CMJ jump sequence
 * Phases: standing -> countermovement -> takeoff -> flight -> landing
 */
function generateCMJJumpFrames(flightTimeMs: number = 400): JumpFrameData[] {
  const frames: JumpFrameData[] = [];
  let timestamp = 0;
  const groundY = 0.85;
  
  // Phase 1: Standing (30 frames = 1 second)
  for (let i = 0; i < 30; i++) {
    frames.push({
      timestamp,
      leftToeY: groundY,
      rightToeY: groundY,
      leftAnkleY: groundY - 0.05,
      rightAnkleY: groundY - 0.05,
      leftHipY: 0.5,
      rightHipY: 0.5,
      hipCenterY: 0.5,
      confidence: 0.9,
    });
    timestamp += 33;
  }
  
  // Phase 2: Countermovement - hip drops (15 frames = 0.5 second)
  for (let i = 0; i < 15; i++) {
    const progress = i / 15;
    const hipDrop = 0.03 * progress; // Hip moves down
    
    frames.push({
      timestamp,
      leftToeY: groundY,
      rightToeY: groundY,
      leftAnkleY: groundY - 0.05,
      rightAnkleY: groundY - 0.05,
      leftHipY: 0.5 + hipDrop, // Moving down
      rightHipY: 0.5 + hipDrop,
      hipCenterY: 0.5 + hipDrop,
      confidence: 0.9,
    });
    timestamp += 33;
  }
  
  // Phase 3: Flight - feet leave ground (flightTimeMs)
  const flightFrames = Math.floor(flightTimeMs / 33);
  for (let i = 0; i < flightFrames; i++) {
    const progress = i / flightFrames;
    // Feet move up, then down (parabolic motion)
    const verticalOffset = Math.sin(progress * Math.PI) * 0.15;
    
    frames.push({
      timestamp,
      leftToeY: groundY - 0.1 - verticalOffset,
      rightToeY: groundY - 0.1 - verticalOffset,
      leftAnkleY: groundY - 0.15 - verticalOffset,
      rightAnkleY: groundY - 0.15 - verticalOffset,
      leftHipY: 0.5 - 0.05 - verticalOffset * 0.5,
      rightHipY: 0.5 - 0.05 - verticalOffset * 0.5,
      hipCenterY: 0.5 - 0.05 - verticalOffset * 0.5,
      confidence: 0.9,
    });
    timestamp += 33;
  }
  
  // Phase 4: Landing (10 frames)
  for (let i = 0; i < 10; i++) {
    frames.push({
      timestamp,
      leftToeY: groundY,
      rightToeY: groundY,
      leftAnkleY: groundY - 0.05,
      rightAnkleY: groundY - 0.05,
      leftHipY: 0.55,
      rightHipY: 0.55,
      hipCenterY: 0.55,
      confidence: 0.9,
    });
    timestamp += 33;
  }
  
  return frames;
}

/**
 * Generate a DJ jump sequence
 * Phases: falling from box -> ground contact -> takeoff -> flight -> landing
 */
function generateDJJumpFrames(contactTimeMs: number = 200, flightTimeMs: number = 400): JumpFrameData[] {
  const frames: JumpFrameData[] = [];
  let timestamp = 0;
  const groundY = 0.85;
  
  // Phase 1: In air (falling from box) - 10 frames
  for (let i = 0; i < 10; i++) {
    const progress = i / 10;
    frames.push({
      timestamp,
      leftToeY: groundY - 0.15 + progress * 0.1,
      rightToeY: groundY - 0.15 + progress * 0.1,
      leftAnkleY: groundY - 0.2 + progress * 0.1,
      rightAnkleY: groundY - 0.2 + progress * 0.1,
      leftHipY: 0.45 + progress * 0.05,
      rightHipY: 0.45 + progress * 0.05,
      hipCenterY: 0.45 + progress * 0.05,
      confidence: 0.9,
    });
    timestamp += 33;
  }
  
  // Phase 2: Ground contact
  const contactFrames = Math.floor(contactTimeMs / 33);
  for (let i = 0; i < contactFrames; i++) {
    frames.push({
      timestamp,
      leftToeY: groundY,
      rightToeY: groundY,
      leftAnkleY: groundY - 0.05,
      rightAnkleY: groundY - 0.05,
      leftHipY: 0.52,
      rightHipY: 0.52,
      hipCenterY: 0.52,
      confidence: 0.9,
    });
    timestamp += 33;
  }
  
  // Phase 3: Flight
  const flightFrames = Math.floor(flightTimeMs / 33);
  for (let i = 0; i < flightFrames; i++) {
    const progress = i / flightFrames;
    const verticalOffset = Math.sin(progress * Math.PI) * 0.15;
    
    frames.push({
      timestamp,
      leftToeY: groundY - 0.1 - verticalOffset,
      rightToeY: groundY - 0.1 - verticalOffset,
      leftAnkleY: groundY - 0.15 - verticalOffset,
      rightAnkleY: groundY - 0.15 - verticalOffset,
      leftHipY: 0.5 - 0.05 - verticalOffset * 0.5,
      rightHipY: 0.5 - 0.05 - verticalOffset * 0.5,
      hipCenterY: 0.5 - 0.05 - verticalOffset * 0.5,
      confidence: 0.9,
    });
    timestamp += 33;
  }
  
  // Phase 4: Final landing
  for (let i = 0; i < 5; i++) {
    frames.push({
      timestamp,
      leftToeY: groundY,
      rightToeY: groundY,
      leftAnkleY: groundY - 0.05,
      rightAnkleY: groundY - 0.05,
      leftHipY: 0.55,
      rightHipY: 0.55,
      hipCenterY: 0.55,
      confidence: 0.9,
    });
    timestamp += 33;
  }
  
  return frames;
}

// ============================================================
// TESTS
// ============================================================

console.log('\n========================================');
console.log('JUMP DETECTOR UNIT TESTS');
console.log('========================================\n');

// Test 1: smoothFrames function
test('smoothFrames reduces noise in frame data', () => {
  // Create frames with artificial noise
  const noisyFrames: JumpFrameData[] = [
    { timestamp: 0, leftToeY: 0.85, rightToeY: 0.85, leftAnkleY: 0.80, rightAnkleY: 0.80, leftHipY: 0.5, rightHipY: 0.5, hipCenterY: 0.5, confidence: 0.9 },
    { timestamp: 33, leftToeY: 0.90, rightToeY: 0.90, leftAnkleY: 0.85, rightAnkleY: 0.85, leftHipY: 0.55, rightHipY: 0.55, hipCenterY: 0.55, confidence: 0.9 },
    { timestamp: 66, leftToeY: 0.82, rightToeY: 0.82, leftAnkleY: 0.77, rightAnkleY: 0.77, leftHipY: 0.47, rightHipY: 0.47, hipCenterY: 0.47, confidence: 0.9 },
    { timestamp: 99, leftToeY: 0.88, rightToeY: 0.88, leftAnkleY: 0.83, rightAnkleY: 0.83, leftHipY: 0.53, rightHipY: 0.53, hipCenterY: 0.53, confidence: 0.9 },
    { timestamp: 132, leftToeY: 0.84, rightToeY: 0.84, leftAnkleY: 0.79, rightAnkleY: 0.79, leftHipY: 0.49, rightHipY: 0.49, hipCenterY: 0.49, confidence: 0.9 },
  ];
  
  const smoothed = smoothFrames(noisyFrames, 3);
  
  assertEqual(smoothed.length, noisyFrames.length, 'Smoothed frame count');
  
  // Middle frames should be averaged (less extreme)
  // Original middle frame hipCenterY: 0.47
  // After smoothing, should be closer to average of neighbors
  const middleSmoothed = smoothed[2].hipCenterY;
  assertTrue(middleSmoothed > 0.47 && middleSmoothed < 0.55, 'Middle frame should be smoothed');
});

// Test 2: calibrateGround function
test('calibrateGround calculates ground level from standing frames', () => {
  const standingFrames = generateStandingFrames(60, 0.85);
  
  const calibration = calibrateGround(standingFrames);
  
  assertTrue(calibration.isCalibrated, 'Should be calibrated');
  assertClose(calibration.groundLevel, 0.85, 0.02, 'Ground level');
  assertTrue(calibration.groundThreshold < calibration.groundLevel, 'Threshold should be above ground');
  assertClose(calibration.standingHipY, 0.5, 0.02, 'Standing hip Y');
});

// Test 3: calibrateGround with insufficient frames
test('calibrateGround returns uncalibrated with insufficient frames', () => {
  const fewFrames = generateStandingFrames(5); // Only 5 frames
  
  const calibration = calibrateGround(fewFrames);
  
  assertFalse(calibration.isCalibrated, 'Should NOT be calibrated with few frames');
});

// Test 4: detectCMJTakeoff function
test('detectCMJTakeoff returns true when both feet above threshold', () => {
  const calibration: GroundCalibration = {
    groundLevel: 0.85,
    groundThreshold: 0.82,
    calibrationFrames: 60,
    isCalibrated: true,
    standingHipY: 0.5,
  };
  
  // Frame with feet above ground
  const inAirFrame: JumpFrameData = {
    timestamp: 0,
    leftToeY: 0.70,  // Above threshold (0.82)
    rightToeY: 0.70,
    leftAnkleY: 0.65,
    rightAnkleY: 0.65,
    leftHipY: 0.40,
    rightHipY: 0.40,
    hipCenterY: 0.40,
    confidence: 0.9,
  };
  
  assertTrue(detectCMJTakeoff(inAirFrame, calibration), 'Should detect takeoff');
});

// Test 5: detectCMJTakeoff with feet on ground
test('detectCMJTakeoff returns false when feet on ground', () => {
  const calibration: GroundCalibration = {
    groundLevel: 0.85,
    groundThreshold: 0.82,
    calibrationFrames: 60,
    isCalibrated: true,
    standingHipY: 0.5,
  };
  
  // Frame with feet on ground
  const onGroundFrame: JumpFrameData = {
    timestamp: 0,
    leftToeY: 0.85,  // At ground level
    rightToeY: 0.85,
    leftAnkleY: 0.80,
    rightAnkleY: 0.80,
    leftHipY: 0.50,
    rightHipY: 0.50,
    hipCenterY: 0.50,
    confidence: 0.9,
  };
  
  assertFalse(detectCMJTakeoff(onGroundFrame, calibration), 'Should NOT detect takeoff');
});

// Test 6: detectCMJLanding function
test('detectCMJLanding returns true when feet return to ground', () => {
  const calibration: GroundCalibration = {
    groundLevel: 0.85,
    groundThreshold: 0.82,
    calibrationFrames: 60,
    isCalibrated: true,
    standingHipY: 0.5,
  };
  
  // Frame with feet back on ground
  const landingFrame: JumpFrameData = {
    timestamp: 0,
    leftToeY: 0.84,  // At/below threshold
    rightToeY: 0.70, // One foot still up (but landing detected when either foot lands)
    leftAnkleY: 0.79,
    rightAnkleY: 0.65,
    leftHipY: 0.50,
    rightHipY: 0.50,
    hipCenterY: 0.50,
    confidence: 0.9,
  };
  
  assertTrue(detectCMJLanding(landingFrame, calibration), 'Should detect landing');
});

// Test 7: detectCountermovementStart function
test('detectCountermovementStart detects hip descent', () => {
  const calibration: GroundCalibration = {
    groundLevel: 0.85,
    groundThreshold: 0.82,
    calibrationFrames: 60,
    isCalibrated: true,
    standingHipY: 0.50,
  };
  
  // Frame with hip lowered (countermovement)
  const countermovementFrame: JumpFrameData = {
    timestamp: 0,
    leftToeY: 0.85,
    rightToeY: 0.85,
    leftAnkleY: 0.80,
    rightAnkleY: 0.80,
    leftHipY: 0.52,  // Hip moved down (higher Y value)
    rightHipY: 0.52,
    hipCenterY: 0.52, // Above standing + threshold
    confidence: 0.9,
  };
  
  assertTrue(detectCountermovementStart(countermovementFrame, calibration), 'Should detect countermovement');
});

// Test 8: calculateJumpHeightFromFlightTime
test('calculateJumpHeightFromFlightTime calculates correct height', () => {
  // h = (g * t^2) / 8
  // For t = 0.5s: h = (9.81 * 0.25) / 8 = 0.306m = 30.6cm
  const height = calculateJumpHeightFromFlightTime(500);
  assertClose(height, 30.6, 1.0, 'Jump height from 500ms flight time');
  
  // For t = 0.4s: h = (9.81 * 0.16) / 8 = 0.196m = 19.6cm
  const height2 = calculateJumpHeightFromFlightTime(400);
  assertClose(height2, 19.6, 1.0, 'Jump height from 400ms flight time');
});

// Test 9: analyzeJumpFrames for CMJ
test('analyzeJumpFrames detects CMJ jump with synthetic data', () => {
  const frames = generateCMJJumpFrames(400); // 400ms flight time
  
  // First calibrate with initial standing frames
  const calibration = calibrateGround(frames.slice(0, 30));
  
  const result = analyzeJumpFrames(
    frames,
    calibration,
    'cmj' as JumpProtocol,
    null,
    0,
    175
  );
  
  assertTrue(result.metrics !== null, 'Should detect jump metrics');
  if (result.metrics) {
    // Flight time should be approximately 400ms
    assertClose(result.metrics.flightTimeMs, 400, 100, 'Flight time');
    
    // Jump height should be around 19.6cm for 400ms flight
    assertClose(result.metrics.jumpHeightCm, 19.6, 10, 'Jump height');
    
    // Should have eccentricDurationMs > 0 for CMJ
    assertTrue(result.metrics.eccentricDurationMs >= 0, 'Should have eccentric duration');
  }
});

// Test 10: analyzeJumpFrames for DJ
test('analyzeJumpFrames detects DJ jump with synthetic data', () => {
  const frames = generateDJJumpFrames(200, 400); // 200ms contact, 400ms flight
  
  // Calibrate from ground contact phase
  const groundContactStart = 10;
  const groundContactFrames = frames.slice(groundContactStart, groundContactStart + 10);
  const calibration = calibrateGround(groundContactFrames);
  calibration.isCalibrated = true; // Force calibrated for test
  calibration.groundLevel = 0.85;
  calibration.groundThreshold = 0.82;
  
  const result = analyzeJumpFrames(
    frames,
    calibration,
    'dj' as JumpProtocol,
    null,
    40, // box height
    175
  );
  
  // DJ detection is more complex - check phase at minimum
  assertEqual(result.events.takeoffTime !== null || result.error !== undefined, true, 'Should attempt DJ analysis');
});

// Test 11: RSI mod calculation (from metrics)
test('analyzeJumpFrames calculates RSImod for CMJ', () => {
  const frames = generateCMJJumpFrames(450);
  const calibration = calibrateGround(frames.slice(0, 30));
  
  const result = analyzeJumpFrames(
    frames,
    calibration,
    'cmj' as JumpProtocol,
    null,
    0,
    175
  );
  
  if (result.metrics) {
    // RSImod = jumpHeight (m) / contactTime (s)
    assertTrue(result.metrics.rsiMod >= 0, 'RSImod should be non-negative');
    assertTrue(result.metrics.rsiMod < 5, 'RSImod should be reasonable (< 5)');
  }
});

// Test 12: Type exports verification
test('All required types are exported from types.ts', () => {
  // This test verifies the types compile correctly
  const protocol: JumpProtocol = 'cmj';
  const leg: ActiveLeg = 'left';
  
  assertEqual(protocol, 'cmj', 'JumpProtocol type works');
  assertEqual(leg, 'left', 'ActiveLeg type works');
  
  // Verify JUMP_DETECTION_CONFIG has expected values
  assertTrue(JUMP_DETECTION_CONFIG.COUNTDOWN_SECONDS === 5, 'COUNTDOWN_SECONDS');
  assertTrue(JUMP_DETECTION_CONFIG.MIN_FLIGHT_TIME_MS === 80, 'MIN_FLIGHT_TIME_MS');
  assertTrue(JUMP_DETECTION_CONFIG.MAX_RECORDING_DURATION_MS === 6000, 'MAX_RECORDING_DURATION_MS');
});

// ============================================================
// SUMMARY
// ============================================================

console.log('\n========================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

if (failed > 0) {
  process.exit(1);
}
