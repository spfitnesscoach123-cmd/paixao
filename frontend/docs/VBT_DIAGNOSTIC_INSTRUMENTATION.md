# VBT Detection Pipeline - Diagnostic Instrumentation Report

**Date**: December 2025  
**Status**: INSTRUMENTATION COMPLETE

---

## Overview

Real-time diagnostic logging has been added to the VBT camera detection pipeline. This instrumentation reveals EXACTLY which protection layer, threshold, or state condition is blocking detection, recording, velocity calculation, or rep counting.

**NO LOGIC OR THRESHOLDS WERE MODIFIED** - Only observation and logging was added.

---

## Files Modified

### 1. `/app/frontend/services/vbt/diagnostics.ts` (NEW)
Complete diagnostic module with:
- `VBTDiagnosticsManager` class - Singleton for managing diagnostics
- `VBTDiagnosticFrame` interface - Structured diagnostic output per frame
- `BlockingDiagnosis` interface - Identifies exactly what's blocking
- `getBlockingDiagnosis()` function - Returns first blocking condition

### 2. `/app/frontend/services/vbt/trackingProtection.ts` (MODIFIED)
Instrumented with diagnostic logging:
- **LAYER 1**: `HumanPresenceValidator.validateKeypoints()` - logs all keypoint checks
- **LAYER 1**: `HumanPresenceValidator.isStable()` - logs stability progress
- **LAYER 2**: `TrackingStateMachine.transition()` - logs all state transitions
- **LAYER 3**: `TrackingPointManager.getTrackedPosition()` - logs tracking point checks
- **NoiseFilter**: `filterMovement()` and `filterVelocity()` - logs filtering decisions
- **TrackingProtectionSystem.processFrame()**: Complete diagnostic logging per frame

### 3. `/app/frontend/components/vbt/VBTDiagnosticOverlay.tsx` (NEW)
On-screen debug overlay showing:
- Current state (noHuman/ready/executing)
- Tracking point status (SET/NOT SET)
- Human presence validation (PASS/FAIL)
- Stability progress (X/5 frames)
- Confidence values (actual/required)
- Movement delta (actual/required)
- Velocity (actual/required)
- Recording status (ALLOWED/BLOCKED)
- Blocking layer and reason

### 4. `/app/frontend/app/athlete/[id]/vbt-camera.tsx` (MODIFIED)
- Added diagnostic overlay import and state
- Added toggle button for diagnostic overlay
- Integrated `VBTDiagnosticOverlay` component

---

## Diagnostic Output Format

Every processed frame outputs a structured diagnostic object:

```typescript
{
  timestamp: number,
  frameNumber: number,

  frame: {
    poseDetected: boolean,
    keypointsDetected: number,
    trackingPointSet: boolean,
    trackingKeypointFound: boolean,
    trackingKeypointConfidence: number,
  },

  thresholds: {
    minKeypointScoreRequired: 0.6,
    actualKeypointScore: number,
    requiredStableFrames: 5,
    currentStableFrames: number,
    minMovementDeltaRequired: 0.02,
    actualMovementDelta: number,
    velocityThresholdRequired: 0.05,
    actualVelocity: number,
  },

  layerStatus: {
    humanPresence: "PASS" | "FAIL",
    stability: "PASS" | "FAIL",
    trackingPoint: "PASS" | "FAIL",
    movement: "PASS" | "FAIL",
    velocity: "PASS" | "FAIL",
    stateMachine: "PASS" | "FAIL",
    recordingGate: "PASS" | "FAIL"
  },

  stateMachine: {
    currentState: string,
    previousState: string,
    transitionBlocked: boolean,
    blockedBy: string | null
  },

  recording: {
    recordButtonPressed: boolean,
    recordingStarted: boolean,
    recordingBlocked: boolean,
    blockingReason: string | null
  },

  repCounting: {
    eligible: boolean,
    blocked: boolean,
    blockingReason: string | null
  },

  finalDecision: {
    frameValid: boolean,
    velocityCalculated: boolean,
    repCounted: boolean,
    recordingAllowed: boolean,
    primaryBlockingLayer: string | null,
    primaryBlockingReason: string | null
  }
}
```

---

## Console Logging Format

### Formatted Summary (Every Frame)

```
╔══════════════════════════════════════════════════════════════════╗
║  VBT DIAGNOSTIC FRAME #000042                                    ║
╠══════════════════════════════════════════════════════════════════╣
║  CURRENT STATE:    ready        │ TRACKING POINT: ✅ SET         ║
║  HUMAN PRESENCE:   PASS         │ STABILITY:      5/5            ║
║  CONFIDENCE:       0.85         │ REQUIRED:       0.60           ║
║  MOVEMENT DELTA:   0.0123       │ REQUIRED:       0.0200         ║
║  VELOCITY:         0.0000       │ REQUIRED:       0.0500         ║
║  RECORDING:        ✅ ALLOWED   │                                ║
╠══════════════════════════════════════════════════════════════════╣
║  BLOCKED BY:       NONE                                          ║
║  REASON:           N/A                                           ║
╚══════════════════════════════════════════════════════════════════╝
```

### Layer-Specific Logs

```
[VBT_DIAG][LAYER1:PRESENCE] ✅ PASS {poseExists: true, keypointsCount: 12, ...}
[VBT_DIAG][LAYER1:STABILITY] ⏳ WAIT {currentFrames: 3, requiredFrames: 5, progress: "60%"}
[VBT_DIAG][LAYER2:STATE] 🔄 noHuman → ready {humanValid: true, humanStable: true, ...}
[VBT_DIAG][LAYER3:TRACKING] ❌ FAIL {isSet: true, keypointFound: true, confidence: 0.42, ...}
[VBT_DIAG][NOISE:MOVEMENT] 🔇 FILTERED {raw: 0.01, threshold: 0.02}
[VBT_DIAG][RECORDING] ❌ BLOCKED {canCalculate: false, state: "noHuman", ...}
[VBT_DIAG][FINAL] ❌ Frame #42 {frameValid: false, blockingLayer: "LAYER 3: Tracking Point", ...}
```

### Recording Blocked Log

```
[VBT_DIAG] RECORDING BLOCKED:
  Layer: TrackingPointManager
  Reason: trackingPoint.isSet() === false
  File: trackingProtection.ts
  Line: 702
```

---

## Blocking Diagnosis Function

```typescript
function getBlockingDiagnosis(): {
  blocked: boolean,
  blockingLayer: string | null,
  blockingFunction: string | null,
  blockingVariable: string | null,
  expectedValue: number | boolean | string,
  actualValue: number | boolean | string,
  file: string | null,
  line: number | null,
}
```

Returns the FIRST condition in the pipeline that prevents frame validation, recording, or rep counting.

---

## How to Use

### 1. View Console Logs
Open browser console (F12) or React Native debugger to see real-time diagnostic logs.

### 2. Toggle On-Screen Overlay
Click the bug icon (🐛) on the recording screen to toggle the diagnostic overlay.

### 3. Programmatic Access
```typescript
import { vbtDiagnostics, getBlockingDiagnosis } from '../services/vbt';

// Get last diagnostic frame
const lastFrame = vbtDiagnostics.getLastDiagnostic();

// Get current blocking diagnosis
const blocking = getBlockingDiagnosis();
if (blocking.blocked) {
  console.log(`Blocked by ${blocking.blockingLayer}: ${blocking.blockingVariable}`);
}

// Subscribe to updates
const unsubscribe = vbtDiagnostics.subscribe((diagnostic) => {
  // Handle new diagnostic frame
});
```

### 4. Disable Diagnostics (Production)
```typescript
import { vbtDiagnostics } from '../services/vbt';
vbtDiagnostics.setEnabled(false);
```

---

## Common Blocking Scenarios

| Blocking Layer | Reason | Solution |
|---------------|--------|----------|
| LAYER 3: Tracking Point | `trackingPoint.isSet() === false` | Coach must tap screen to set tracking point |
| LAYER 3: Tracking Point | `confidence < 0.6` | Improve lighting, adjust camera angle |
| LAYER 1: Human Presence | `pose === null` | Athlete must be in camera frame |
| LAYER 1: Human Presence | `keypoint.score < 0.6` | Better lighting, clearer view of athlete |
| LAYER 1: Stability | `currentFrames < 5` | Wait for detection to stabilize |
| LAYER 2: State Machine | `movementDelta < 0.02` | Wait for significant movement |
| Noise Filter | `velocity < 0.05` | Movement too slow to register |

---

## Summary

This instrumentation provides complete visibility into the VBT detection pipeline without modifying any functional logic. Use the console logs and on-screen overlay to identify exactly which condition is blocking detection, recording, or rep counting in real-time.
