/**
 * VBT Diagnostics Module
 * 
 * Real-time diagnostic logging for the VBT detection pipeline.
 * OBSERVATION ONLY - No logic changes, no threshold modifications.
 * 
 * Purpose: Reveal EXACTLY which protection layer, threshold, or state
 * condition is blocking detection, recording, velocity calculation, or rep counting.
 */

// ============================================================================
// DIAGNOSTIC TYPES
// ============================================================================

export interface FrameDiagnostics {
  poseDetected: boolean;
  keypointsDetected: number;
  trackingPointSet: boolean;
  trackingKeypointFound: boolean;
  trackingKeypointConfidence: number;
}

export interface ThresholdDiagnostics {
  minKeypointScoreRequired: number;
  actualKeypointScore: number;
  requiredStableFrames: number;
  currentStableFrames: number;
  minMovementDeltaRequired: number;
  actualMovementDelta: number;
  velocityThresholdRequired: number;
  actualVelocity: number;
}

export type LayerStatus = 'PASS' | 'FAIL' | 'SKIP';

export interface LayerStatusDiagnostics {
  humanPresence: LayerStatus;
  stability: LayerStatus;
  trackingPoint: LayerStatus;
  movement: LayerStatus;
  velocity: LayerStatus;
  stateMachine: LayerStatus;
  recordingGate: LayerStatus;
}

export interface StateMachineDiagnostics {
  currentState: string;
  previousState: string;
  transitionBlocked: boolean;
  blockedBy: string | null;
}

export interface RecordingDiagnostics {
  recordButtonPressed: boolean;
  recordingStarted: boolean;
  recordingBlocked: boolean;
  blockingReason: string | null;
}

export interface RepCountingDiagnostics {
  eligible: boolean;
  blocked: boolean;
  blockingReason: string | null;
}

export interface FinalDecisionDiagnostics {
  frameValid: boolean;
  velocityCalculated: boolean;
  repCounted: boolean;
  recordingAllowed: boolean;
  primaryBlockingLayer: string | null;
  primaryBlockingReason: string | null;
}

export interface VBTDiagnosticFrame {
  timestamp: number;
  frameNumber: number;
  frame: FrameDiagnostics;
  thresholds: ThresholdDiagnostics;
  layerStatus: LayerStatusDiagnostics;
  stateMachine: StateMachineDiagnostics;
  recording: RecordingDiagnostics;
  repCounting: RepCountingDiagnostics;
  finalDecision: FinalDecisionDiagnostics;
}

export interface BlockingDiagnosis {
  blocked: boolean;
  blockingLayer: string | null;
  blockingFunction: string | null;
  blockingVariable: string | null;
  expectedValue: number | boolean | string;
  actualValue: number | boolean | string;
  file: string | null;
  line: number | null;
}

// ============================================================================
// DIAGNOSTIC STATE MANAGER
// ============================================================================

class VBTDiagnosticsManager {
  private enabled: boolean = true;
  private frameCount: number = 0;
  private logInterval: number = 1; // Log every N frames (1 = every frame)
  private lastDiagnostic: VBTDiagnosticFrame | null = null;
  private blockingHistory: BlockingDiagnosis[] = [];
  private subscribers: Set<(diag: VBTDiagnosticFrame) => void> = new Set();
  
  // Current state trackers
  private currentFrame: Partial<FrameDiagnostics> = {};
  private currentThresholds: Partial<ThresholdDiagnostics> = {};
  private currentLayerStatus: Partial<LayerStatusDiagnostics> = {};
  private currentStateMachine: Partial<StateMachineDiagnostics> = {};
  private currentRecording: Partial<RecordingDiagnostics> = {};
  private currentRepCounting: Partial<RepCountingDiagnostics> = {};
  private currentFinalDecision: Partial<FinalDecisionDiagnostics> = {};
  private currentBlockingDiagnosis: BlockingDiagnosis | null = null;
  
  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`[VBT_DIAG] Diagnostics ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }
  
  setLogInterval(interval: number): void {
    this.logInterval = Math.max(1, interval);
  }
  
  subscribe(callback: (diag: VBTDiagnosticFrame) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
  
  // ============================================================================
  // FRAME LIFECYCLE
  // ============================================================================
  
  startFrame(): void {
    if (!this.enabled) return;
    
    this.frameCount++;
    this.currentFrame = {};
    this.currentThresholds = {};
    this.currentLayerStatus = {
      humanPresence: 'SKIP',
      stability: 'SKIP',
      trackingPoint: 'SKIP',
      movement: 'SKIP',
      velocity: 'SKIP',
      stateMachine: 'SKIP',
      recordingGate: 'SKIP',
    };
    this.currentStateMachine = {};
    this.currentRecording = { recordButtonPressed: false, recordingStarted: false };
    this.currentRepCounting = {};
    this.currentFinalDecision = {};
    this.currentBlockingDiagnosis = null;
  }
  
  endFrame(): VBTDiagnosticFrame | null {
    if (!this.enabled) return null;
    
    const diagnostic: VBTDiagnosticFrame = {
      timestamp: Date.now(),
      frameNumber: this.frameCount,
      frame: {
        poseDetected: this.currentFrame.poseDetected ?? false,
        keypointsDetected: this.currentFrame.keypointsDetected ?? 0,
        trackingPointSet: this.currentFrame.trackingPointSet ?? false,
        trackingKeypointFound: this.currentFrame.trackingKeypointFound ?? false,
        trackingKeypointConfidence: this.currentFrame.trackingKeypointConfidence ?? 0,
      },
      thresholds: {
        minKeypointScoreRequired: this.currentThresholds.minKeypointScoreRequired ?? 0.6,
        actualKeypointScore: this.currentThresholds.actualKeypointScore ?? 0,
        requiredStableFrames: this.currentThresholds.requiredStableFrames ?? 5,
        currentStableFrames: this.currentThresholds.currentStableFrames ?? 0,
        minMovementDeltaRequired: this.currentThresholds.minMovementDeltaRequired ?? 0.02,
        actualMovementDelta: this.currentThresholds.actualMovementDelta ?? 0,
        velocityThresholdRequired: this.currentThresholds.velocityThresholdRequired ?? 0.05,
        actualVelocity: this.currentThresholds.actualVelocity ?? 0,
      },
      layerStatus: this.currentLayerStatus as LayerStatusDiagnostics,
      stateMachine: {
        currentState: this.currentStateMachine.currentState ?? 'unknown',
        previousState: this.currentStateMachine.previousState ?? 'unknown',
        transitionBlocked: this.currentStateMachine.transitionBlocked ?? false,
        blockedBy: this.currentStateMachine.blockedBy ?? null,
      },
      recording: {
        recordButtonPressed: this.currentRecording.recordButtonPressed ?? false,
        recordingStarted: this.currentRecording.recordingStarted ?? false,
        recordingBlocked: this.currentRecording.recordingBlocked ?? false,
        blockingReason: this.currentRecording.blockingReason ?? null,
      },
      repCounting: {
        eligible: this.currentRepCounting.eligible ?? false,
        blocked: this.currentRepCounting.blocked ?? true,
        blockingReason: this.currentRepCounting.blockingReason ?? 'Not evaluated',
      },
      finalDecision: {
        frameValid: this.currentFinalDecision.frameValid ?? false,
        velocityCalculated: this.currentFinalDecision.velocityCalculated ?? false,
        repCounted: this.currentFinalDecision.repCounted ?? false,
        recordingAllowed: this.currentFinalDecision.recordingAllowed ?? false,
        primaryBlockingLayer: this.currentFinalDecision.primaryBlockingLayer ?? null,
        primaryBlockingReason: this.currentFinalDecision.primaryBlockingReason ?? null,
      },
    };
    
    this.lastDiagnostic = diagnostic;
    
    // Log based on interval
    if (this.frameCount % this.logInterval === 0) {
      this.logDiagnostic(diagnostic);
    }
    
    // Notify subscribers
    this.subscribers.forEach(cb => {
      try {
        cb(diagnostic);
      } catch (e) {
        console.error('[VBT_DIAG] Subscriber error:', e);
      }
    });
    
    return diagnostic;
  }
  
  // ============================================================================
  // LAYER 1: HUMAN PRESENCE LOGGING
  // ============================================================================
  
  logHumanPresenceCheck(
    poseExists: boolean,
    keypointsCount: number,
    requiredKeypoints: string[],
    validKeypoints: string[],
    missingKeypoints: string[],
    minScore: number,
    lowestScore: number,
    passed: boolean
  ): void {
    if (!this.enabled) return;
    
    this.currentFrame.poseDetected = poseExists;
    this.currentFrame.keypointsDetected = keypointsCount;
    this.currentThresholds.minKeypointScoreRequired = minScore;
    this.currentThresholds.actualKeypointScore = lowestScore;
    this.currentLayerStatus.humanPresence = passed ? 'PASS' : 'FAIL';
    
    if (!passed) {
      this.setBlockingDiagnosis({
        blocked: true,
        blockingLayer: 'LAYER 1: Human Presence',
        blockingFunction: 'validateKeypoints()',
        blockingVariable: poseExists ? 'keypoint.score' : 'pose',
        expectedValue: poseExists ? `>= ${minScore}` : 'not null',
        actualValue: poseExists ? lowestScore : 'null',
        file: 'trackingProtection.ts',
        line: poseExists ? 158 : 140,
      });
    }
    
    console.log(`[VBT_DIAG][LAYER1:PRESENCE] ${passed ? '✅ PASS' : '❌ FAIL'}`, {
      poseExists,
      keypointsCount,
      required: requiredKeypoints.length,
      valid: validKeypoints.length,
      missing: missingKeypoints,
      minScore,
      lowestScore,
    });
  }
  
  // ============================================================================
  // LAYER 1: STABILITY LOGGING
  // ============================================================================
  
  logStabilityCheck(
    currentFrames: number,
    requiredFrames: number,
    passed: boolean
  ): void {
    if (!this.enabled) return;
    
    this.currentThresholds.requiredStableFrames = requiredFrames;
    this.currentThresholds.currentStableFrames = currentFrames;
    this.currentLayerStatus.stability = passed ? 'PASS' : 'FAIL';
    
    if (!passed && this.currentLayerStatus.humanPresence === 'PASS') {
      this.setBlockingDiagnosis({
        blocked: true,
        blockingLayer: 'LAYER 1: Stability',
        blockingFunction: 'isStable()',
        blockingVariable: 'consecutiveValidFrames',
        expectedValue: `>= ${requiredFrames}`,
        actualValue: currentFrames,
        file: 'trackingProtection.ts',
        line: 188,
      });
    }
    
    console.log(`[VBT_DIAG][LAYER1:STABILITY] ${passed ? '✅ PASS' : '⏳ WAIT'}`, {
      currentFrames,
      requiredFrames,
      progress: `${Math.round((currentFrames / requiredFrames) * 100)}%`,
    });
  }
  
  // ============================================================================
  // LAYER 2: STATE MACHINE LOGGING
  // ============================================================================
  
  logStateMachineTransition(
    previousState: string,
    newState: string,
    humanValid: boolean,
    humanStable: boolean,
    movementDelta: number,
    minDelta: number,
    blocked: boolean,
    blockReason: string | null
  ): void {
    if (!this.enabled) return;
    
    this.currentStateMachine.previousState = previousState;
    this.currentStateMachine.currentState = newState;
    this.currentStateMachine.transitionBlocked = blocked;
    this.currentStateMachine.blockedBy = blockReason;
    this.currentThresholds.minMovementDeltaRequired = minDelta;
    this.currentThresholds.actualMovementDelta = movementDelta;
    this.currentLayerStatus.stateMachine = blocked ? 'FAIL' : 'PASS';
    
    if (blocked && !this.currentBlockingDiagnosis) {
      this.setBlockingDiagnosis({
        blocked: true,
        blockingLayer: 'LAYER 2: State Machine',
        blockingFunction: 'transition()',
        blockingVariable: blockReason || 'state',
        expectedValue: 'ready or executing',
        actualValue: newState,
        file: 'trackingProtection.ts',
        line: 258,
      });
    }
    
    const stateChanged = previousState !== newState;
    console.log(`[VBT_DIAG][LAYER2:STATE] ${stateChanged ? '🔄' : '➡️'} ${previousState} → ${newState}`, {
      humanValid,
      humanStable,
      movementDelta: movementDelta.toFixed(4),
      minDelta,
      blocked,
      blockReason,
    });
  }
  
  // ============================================================================
  // LAYER 3: TRACKING POINT LOGGING
  // ============================================================================
  
  logTrackingPointCheck(
    isSet: boolean,
    keypointName: string | null,
    keypointFound: boolean,
    confidence: number,
    minConfidence: number,
    passed: boolean
  ): void {
    if (!this.enabled) return;
    
    this.currentFrame.trackingPointSet = isSet;
    this.currentFrame.trackingKeypointFound = keypointFound;
    this.currentFrame.trackingKeypointConfidence = confidence;
    this.currentLayerStatus.trackingPoint = passed ? 'PASS' : 'FAIL';
    
    if (!passed && !this.currentBlockingDiagnosis) {
      let blockVar = 'trackingPoint.isSet';
      let expectedVal: string | number | boolean = true;
      let actualVal: string | number | boolean = isSet;
      let line = 702;
      
      if (isSet && !keypointFound) {
        blockVar = 'keypoint';
        expectedVal = 'present';
        actualVal = 'not found';
        line = 501;
      } else if (isSet && keypointFound && confidence < minConfidence) {
        blockVar = 'keypoint.score';
        expectedVal = `>= ${minConfidence}`;
        actualVal = confidence;
        line = 507;
      }
      
      this.setBlockingDiagnosis({
        blocked: true,
        blockingLayer: 'LAYER 3: Tracking Point',
        blockingFunction: isSet ? 'getTrackedPosition()' : 'isSet()',
        blockingVariable: blockVar,
        expectedValue: expectedVal,
        actualValue: actualVal,
        file: 'trackingProtection.ts',
        line,
      });
    }
    
    console.log(`[VBT_DIAG][LAYER3:TRACKING] ${passed ? '✅ PASS' : '❌ FAIL'}`, {
      isSet,
      keypointName,
      keypointFound,
      confidence: confidence.toFixed(3),
      minConfidence,
    });
  }
  
  // ============================================================================
  // NOISE FILTER LOGGING
  // ============================================================================
  
  logNoiseFilter(
    rawMovement: number,
    filteredMovement: number,
    threshold: number,
    passed: boolean
  ): void {
    if (!this.enabled) return;
    
    this.currentLayerStatus.movement = passed ? 'PASS' : 'FAIL';
    this.currentThresholds.actualMovementDelta = rawMovement;
    
    console.log(`[VBT_DIAG][NOISE:MOVEMENT] ${passed ? '✅ PASS' : '🔇 FILTERED'}`, {
      raw: rawMovement.toFixed(4),
      filtered: filteredMovement.toFixed(4),
      threshold,
    });
  }
  
  logVelocityFilter(
    rawVelocity: number,
    filteredVelocity: number,
    threshold: number,
    passed: boolean
  ): void {
    if (!this.enabled) return;
    
    this.currentLayerStatus.velocity = passed ? 'PASS' : 'FAIL';
    this.currentThresholds.actualVelocity = rawVelocity;
    this.currentThresholds.velocityThresholdRequired = threshold;
    
    console.log(`[VBT_DIAG][NOISE:VELOCITY] ${passed ? '✅ PASS' : '🔇 FILTERED'}`, {
      raw: rawVelocity.toFixed(4),
      filtered: filteredVelocity.toFixed(4),
      threshold,
    });
  }
  
  // ============================================================================
  // RECORDING GATE LOGGING
  // ============================================================================
  
  logRecordingGate(
    buttonPressed: boolean,
    recordingStarted: boolean,
    canCalculate: boolean,
    trackingPointSet: boolean,
    state: string,
    blocked: boolean,
    blockReason: string | null
  ): void {
    if (!this.enabled) return;
    
    this.currentRecording.recordButtonPressed = buttonPressed;
    this.currentRecording.recordingStarted = recordingStarted;
    this.currentRecording.recordingBlocked = blocked;
    this.currentRecording.blockingReason = blockReason;
    this.currentLayerStatus.recordingGate = blocked ? 'FAIL' : 'PASS';
    
    if (blocked) {
      console.log(`[VBT_DIAG][RECORDING] ❌ BLOCKED`, {
        buttonPressed,
        recordingStarted,
        canCalculate,
        trackingPointSet,
        state,
        blockReason,
      });
      
      // Log specific blocking condition
      if (!trackingPointSet) {
        console.log(`[VBT_DIAG] RECORDING BLOCKED:\n  Layer: TrackingPointManager\n  Reason: trackingPoint.isSet() === false\n  File: trackingProtection.ts\n  Line: 702`);
      } else if (!canCalculate) {
        console.log(`[VBT_DIAG] RECORDING BLOCKED:\n  Layer: ProtectionSystem\n  Reason: canCalculate === false\n  File: trackingProtection.ts\n  Line: 785`);
      } else if (state === 'noHuman') {
        console.log(`[VBT_DIAG] RECORDING BLOCKED:\n  Layer: StateMachine\n  Reason: state === 'noHuman'\n  File: trackingProtection.ts\n  Line: 723`);
      }
    } else {
      console.log(`[VBT_DIAG][RECORDING] ✅ ALLOWED`, {
        buttonPressed,
        recordingStarted,
        canCalculate,
        state,
      });
    }
  }
  
  // ============================================================================
  // REP COUNTING LOGGING
  // ============================================================================
  
  logRepCounting(
    eligible: boolean,
    state: string,
    repPhase: string,
    canCountRep: boolean,
    blocked: boolean,
    blockReason: string | null
  ): void {
    if (!this.enabled) return;
    
    this.currentRepCounting.eligible = eligible;
    this.currentRepCounting.blocked = blocked;
    this.currentRepCounting.blockingReason = blockReason;
    
    if (canCountRep) {
      console.log(`[VBT_DIAG][REP] 🎯 REP COUNTED!`, { state, repPhase });
    } else if (blocked) {
      console.log(`[VBT_DIAG][REP] ⏸️ BLOCKED`, { state, repPhase, blockReason });
    }
  }
  
  // ============================================================================
  // FINAL DECISION LOGGING
  // ============================================================================
  
  logFinalDecision(
    frameValid: boolean,
    velocityCalculated: boolean,
    repCounted: boolean,
    recordingAllowed: boolean,
    canCalculate: boolean,
    state: string
  ): void {
    if (!this.enabled) return;
    
    // Determine primary blocking layer
    let blockingLayer: string | null = null;
    let blockingReason: string | null = null;
    
    if (!frameValid) {
      if (this.currentLayerStatus.trackingPoint === 'FAIL') {
        blockingLayer = 'LAYER 3: Tracking Point';
        blockingReason = !this.currentFrame.trackingPointSet 
          ? 'Tracking point not set by coach'
          : !this.currentFrame.trackingKeypointFound
          ? 'Tracking keypoint not detected'
          : `Confidence ${this.currentFrame.trackingKeypointConfidence?.toFixed(2)} < 0.6`;
      } else if (this.currentLayerStatus.humanPresence === 'FAIL') {
        blockingLayer = 'LAYER 1: Human Presence';
        blockingReason = !this.currentFrame.poseDetected
          ? 'No pose detected'
          : 'Required keypoints missing or low confidence';
      } else if (this.currentLayerStatus.stability === 'FAIL') {
        blockingLayer = 'LAYER 1: Stability';
        blockingReason = `Only ${this.currentThresholds.currentStableFrames}/${this.currentThresholds.requiredStableFrames} stable frames`;
      } else if (this.currentLayerStatus.stateMachine === 'FAIL') {
        blockingLayer = 'LAYER 2: State Machine';
        blockingReason = `State is ${state}, not ready/executing`;
      }
    }
    
    this.currentFinalDecision = {
      frameValid,
      velocityCalculated,
      repCounted,
      recordingAllowed,
      primaryBlockingLayer: blockingLayer,
      primaryBlockingReason: blockingReason,
    };
    
    const emoji = frameValid ? '✅' : '❌';
    console.log(`[VBT_DIAG][FINAL] ${emoji} Frame #${this.frameCount}`, {
      frameValid,
      velocityCalculated,
      repCounted,
      recordingAllowed,
      canCalculate,
      state,
      blockingLayer,
      blockingReason,
    });
  }
  
  // ============================================================================
  // BLOCKING DIAGNOSIS
  // ============================================================================
  
  private setBlockingDiagnosis(diagnosis: BlockingDiagnosis): void {
    if (!this.currentBlockingDiagnosis) {
      this.currentBlockingDiagnosis = diagnosis;
      this.blockingHistory.push(diagnosis);
      
      // Keep only last 100
      if (this.blockingHistory.length > 100) {
        this.blockingHistory.shift();
      }
    }
  }
  
  getBlockingDiagnosis(): BlockingDiagnosis {
    return this.currentBlockingDiagnosis || {
      blocked: false,
      blockingLayer: null,
      blockingFunction: null,
      blockingVariable: null,
      expectedValue: '',
      actualValue: '',
      file: null,
      line: null,
    };
  }
  
  getLastDiagnostic(): VBTDiagnosticFrame | null {
    return this.lastDiagnostic;
  }
  
  getBlockingHistory(): BlockingDiagnosis[] {
    return [...this.blockingHistory];
  }
  
  // ============================================================================
  // FORMATTED OUTPUT
  // ============================================================================
  
  private logDiagnostic(diag: VBTDiagnosticFrame): void {
    const summary = `
╔══════════════════════════════════════════════════════════════════╗
║  VBT DIAGNOSTIC FRAME #${String(diag.frameNumber).padStart(6, '0')}                               ║
╠══════════════════════════════════════════════════════════════════╣
║  CURRENT STATE:    ${diag.stateMachine.currentState.padEnd(12)} │ TRACKING POINT: ${diag.frame.trackingPointSet ? '✅ SET' : '❌ NOT SET'}   ║
║  HUMAN PRESENCE:   ${diag.layerStatus.humanPresence.padEnd(12)} │ STABILITY:      ${String(diag.thresholds.currentStableFrames).padEnd(2)}/${diag.thresholds.requiredStableFrames}         ║
║  CONFIDENCE:       ${diag.thresholds.actualKeypointScore.toFixed(2).padEnd(12)} │ REQUIRED:       ${diag.thresholds.minKeypointScoreRequired.toFixed(2)}        ║
║  MOVEMENT DELTA:   ${diag.thresholds.actualMovementDelta.toFixed(4).padEnd(12)} │ REQUIRED:       ${diag.thresholds.minMovementDeltaRequired.toFixed(4)}    ║
║  VELOCITY:         ${diag.thresholds.actualVelocity.toFixed(4).padEnd(12)} │ REQUIRED:       ${diag.thresholds.velocityThresholdRequired.toFixed(4)}    ║
║  RECORDING:        ${diag.recording.recordingBlocked ? '❌ BLOCKED' : '✅ ALLOWED'}      │                                   ║
╠══════════════════════════════════════════════════════════════════╣
║  BLOCKED BY:       ${(diag.finalDecision.primaryBlockingLayer || 'NONE').padEnd(45)}║
║  REASON:           ${(diag.finalDecision.primaryBlockingReason || 'N/A').substring(0, 45).padEnd(45)}║
╚══════════════════════════════════════════════════════════════════╝`;
    
    console.log(summary);
  }
  
  getOverlayData(): {
    currentState: string;
    trackingPoint: string;
    humanPresence: string;
    stability: string;
    confidence: string;
    movementDelta: string;
    velocity: string;
    recording: string;
    blockedBy: string;
    reason: string;
  } {
    const diag = this.lastDiagnostic;
    if (!diag) {
      return {
        currentState: 'N/A',
        trackingPoint: 'N/A',
        humanPresence: 'N/A',
        stability: '0/5',
        confidence: '0.00/0.60',
        movementDelta: '0.0000/0.0200',
        velocity: '0.0000/0.0500',
        recording: 'N/A',
        blockedBy: 'N/A',
        reason: 'Waiting for first frame',
      };
    }
    
    return {
      currentState: diag.stateMachine.currentState,
      trackingPoint: diag.frame.trackingPointSet ? 'SET' : 'NOT SET',
      humanPresence: diag.layerStatus.humanPresence,
      stability: `${diag.thresholds.currentStableFrames}/${diag.thresholds.requiredStableFrames}`,
      confidence: `${diag.thresholds.actualKeypointScore.toFixed(2)}/${diag.thresholds.minKeypointScoreRequired.toFixed(2)}`,
      movementDelta: `${diag.thresholds.actualMovementDelta.toFixed(4)}/${diag.thresholds.minMovementDeltaRequired.toFixed(4)}`,
      velocity: `${diag.thresholds.actualVelocity.toFixed(4)}/${diag.thresholds.velocityThresholdRequired.toFixed(4)}`,
      recording: diag.recording.recordingBlocked ? 'BLOCKED' : 'ALLOWED',
      blockedBy: diag.finalDecision.primaryBlockingLayer || 'NONE',
      reason: diag.finalDecision.primaryBlockingReason || 'N/A',
    };
  }
  
  // ============================================================================
  // RESET
  // ============================================================================
  
  reset(): void {
    this.frameCount = 0;
    this.lastDiagnostic = null;
    this.blockingHistory = [];
    console.log('[VBT_DIAG] Diagnostics reset');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const vbtDiagnostics = new VBTDiagnosticsManager();

// Export helper function
export function getBlockingDiagnosis(): BlockingDiagnosis {
  return vbtDiagnostics.getBlockingDiagnosis();
}
