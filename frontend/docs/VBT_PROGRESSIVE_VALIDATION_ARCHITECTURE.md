# VBT Detection Pipeline - Progressive Validation Architecture

**Date**: December 2025  
**Status**: IMPLEMENTED

---

## Overview

This document describes the **5-STAGE PROGRESSIVE VALIDATION PIPELINE** implemented to eliminate the circular dependency that caused the VBT camera system to remain stuck in "stabilizing" state.

### Previous Problem

The old 3-layer protection system had a **circular dependency**:
- Stabilization required tracking point validation
- Tracking point validation required stabilization
- Result: System could never exit "stabilizing" state

### Solution

**PROGRESSIVE VALIDATION**: Each stage is independent and computed in sequence. Stabilization is now **COMPLETELY INDEPENDENT** of tracking point validation.

---

## 5-Stage Validation Pipeline

```
┌──────────────────────────────────────────────────────────────────────┐
│                     FRAME PROCESSING PIPELINE                        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  STAGE 1: FRAME_USABLE (Minimum Entry Requirement)                   │
│  ├── Criteria:                                                       │
│  │   • pose !== null                                                 │
│  │   • pose.keypoints exists                                         │
│  │   • pose.keypoints.length > 0                                     │
│  │   • ANY keypoint.score >= minUsableScore (0.3)                   │
│  │                                                                   │
│  │   DOES NOT REQUIRE:                                               │
│  │   • trackingPoint.isSet                                          │
│  │   • confidence >= 0.6                                            │
│  │   • movement thresholds                                          │
│  │   • velocity thresholds                                          │
│  │                                                                   │
│  ├── On PASS: stableFrames += 1                                     │
│  └── On FAIL: stableFrames = max(stableFrames - decayRate, 0)       │
│                                                                      │
│  ▼                                                                   │
│                                                                      │
│  STAGE 2: FRAME_STABLE (Temporal Stabilization)                      │
│  ├── Criteria:                                                       │
│  │   • stableFrames >= requiredStableFrames (5)                     │
│  │                                                                   │
│  │   CRITICAL: Depends ONLY on FRAME_USABLE                         │
│  │   NOT on tracking point, NOT on confidence >= 0.6                │
│  │                                                                   │
│  ├── On PASS: State → READY                                         │
│  └── On FAIL: State → STABILIZING                                   │
│                                                                      │
│  ▼                                                                   │
│                                                                      │
│  STAGE 3: FRAME_TRACKABLE (Tracking Eligibility)                     │
│  ├── Criteria (ONLY checked AFTER stabilization):                    │
│  │   • frameStable === true                                         │
│  │   • trackingPoint.isSet === true                                 │
│  │   • tracking keypoint exists in pose                             │
│  │   • tracking keypoint.score >= trackingConfidenceThreshold (0.5) │
│  │                                                                   │
│  │   CRITICAL: Does NOT block stabilization                         │
│  │   Only applies AFTER stabilization is complete                   │
│  │                                                                   │
│  ├── On PASS: State → TRACKING                                      │
│  └── On FAIL: Stays in READY (can start recording)                  │
│                                                                      │
│  ▼                                                                   │
│                                                                      │
│  STAGE 4: FRAME_VALID (Movement Validation)                          │
│  ├── Criteria:                                                       │
│  │   • frameTrackable === true                                      │
│  │   • movementDelta >= movementThreshold (0.02)                    │
│  │                                                                   │
│  ├── On PASS: Movement is significant                               │
│  └── On FAIL: Movement filtered as noise                            │
│                                                                      │
│  ▼                                                                   │
│                                                                      │
│  STAGE 5: FRAME_COUNTABLE (Rep Counting Eligibility)                 │
│  ├── Criteria:                                                       │
│  │   • frameValid === true                                          │
│  │   • velocity >= velocityThreshold (0.05 m/s)                     │
│  │                                                                   │
│  └── On PASS: Frame eligible for rep counting                       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## State Machine

```
INITIALIZING  →  STABILIZING  →  READY  →  TRACKING  →  RECORDING
     │               │             │           │            │
     │               │             │           │            │
     └───────────────┴─────────────┴───────────┴────────────┘
                     ↑
              (pose lost → INITIALIZING)
```

### State Definitions

| State | Condition | Actions Allowed |
|-------|-----------|-----------------|
| `INITIALIZING` | No usable frame | None |
| `STABILIZING` | Frame usable, stableFrames < required | Pose detection |
| `READY` | frameStable = true | **Recording can START** |
| `TRACKING` | frameTrackable = true | Velocity calculation |
| `RECORDING` | Recording active + valid tracking | Rep counting |

---

## Key Changes from Previous Architecture

### 1. Stability Counter Logic

**BEFORE (BROKEN):**
```typescript
if (!allKeypointsValid) {
  stableFrames = 0;  // Hard reset - causes infinite loop
}
```

**AFTER (FIXED):**
```typescript
if (frameUsable) {
  stableFrames += 1;
} else {
  stableFrames = Math.max(stableFrames - stabilityDecayRate, 0);  // Gradual decay
}
```

### 2. Tracking Point Validation Decoupled

**BEFORE (BROKEN):**
```typescript
// Tracking point checked BEFORE stability
if (!trackingPoint.isSet) {
  return BLOCKED;  // Prevented stabilization
}
```

**AFTER (FIXED):**
```typescript
// Stage 1 & 2: Check usability and stability FIRST
const usableResult = checkFrameUsable(pose);
const stabilityResult = updateStability(usableResult.frameUsable);

// Stage 3: ONLY check tracking AFTER stable
if (stabilityResult.frameStable) {
  const trackableResult = checkFrameTrackable(pose);
}
```

### 3. Recording Button Behavior

**BEFORE (BROKEN):**
```typescript
// Recording required frameTrackable
if (!frameTrackable) {
  return "Cannot start recording";
}
```

**AFTER (FIXED):**
```typescript
// Recording allowed when state >= READY
if (state >= 'READY') {
  // Recording can start
  // System will transition to TRACKING/RECORDING when tracking becomes valid
}
```

---

## Validation Flags

The system now exposes 5 independent boolean flags:

```typescript
interface ValidationFlags {
  frameUsable: boolean;      // Stage 1: Pose exists with keypoints
  frameStable: boolean;      // Stage 2: Enough stable frames
  frameTrackable: boolean;   // Stage 3: Tracking point valid
  frameValid: boolean;       // Stage 4: Movement detected
  frameCountable: boolean;   // Stage 5: Ready for rep counting
}
```

---

## Configuration

```typescript
interface ProtectionConfig {
  // Stage 1
  minUsableScore: 0.3,              // Lower threshold for usability
  
  // Stage 2
  requiredStableFrames: 5,          // Frames needed for stability
  stabilityDecayRate: 1,            // Decay per unusable frame
  
  // Stage 3
  trackingConfidenceThreshold: 0.5, // Threshold for tracking point
  minKeypointScore: 0.6,            // Strict threshold (for validation)
  
  // Stage 4
  minMovementDelta: 0.02,           // 2% of screen
  
  // Stage 5
  velocityThreshold: 0.05,          // 0.05 m/s
}
```

---

## Files Modified

| File | Changes |
|------|---------|
| `trackingProtection.ts` | Complete rewrite with 5-stage architecture |
| `useProtectedBarTracking.ts` | Updated to use new validation flags |
| `diagnostics.ts` | Updated logging for new stages |
| `index.ts` | Export new types |

---

## Expected Behavior After Changes

1. **Exit stabilizing mode reliably** when pose is detected
2. **Never remain stuck in stabilizing** infinitely
3. **Allow recording to begin** when stabilized (state >= READY)
4. **Allow tracking to begin** when tracking point becomes valid
5. **Allow velocity calculation** when movement becomes valid
6. **Allow rep counting** when full criteria is met

---

## Testing

Run the test suite:
```bash
cd /app/frontend
npx jest services/vbt/__tests__/trackingProtection.test.ts
```

---

## Summary

The circular dependency between stabilization and tracking point validation has been **PERMANENTLY ELIMINATED** by:

1. Making stabilization depend **ONLY** on pose detection (frameUsable)
2. Using **gradual decay** instead of hard reset for stability counter
3. Checking tracking point **AFTER** stabilization is achieved
4. Allowing recording to start when **READY** (not requiring perfect tracking)
5. Exposing **5 independent validation flags** for clear debugging
