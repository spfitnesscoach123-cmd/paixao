/**
 * useJumpCamera Hook
 * 
 * React hook for managing jump camera state and processing.
 * Handles countdown, recording, frame analysis, and SL-CMJ two-jump sequences.
 * 
 * PIPELINE:
 * setup -> countdown (calibration) -> recording (frame collection) -> processing -> review
 * 
 * For SL-CMJ: adds between_jumps phase between leg 1 and leg 2
 * setup -> countdown -> recording -> processing -> between_jumps -> countdown -> recording -> processing -> review
 * 
 * DEBUG LOGS:
 * LOG_JUMP_PIPELINE_START - Pipeline analysis begins
 * LOG_JUMP_TAKEOFF_DETECTED - Takeoff event found
 * LOG_JUMP_LANDING_DETECTED - Landing event found
 * LOG_JUMP_METRICS_CALCULATED - Metrics computed
 * LOG_JUMP_RESULTS_SCREEN_OPENED - Results displayed
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  JumpProtocol,
  ActiveLeg,
  JumpCameraPhase,
  JumpFrameData,
  GroundCalibration,
  JumpMetrics,
  JumpEvents,
  LiveMetrics,
  SlCmjLegResult,
  OrientationResult,
  JUMP_DETECTION_CONFIG,
} from './types';
import {
  calibrateGround,
  detectActiveLeg,
  analyzeJumpFrames,
  extractJumpLandmarks,
  createJumpFrameData,
  detectCMJTakeoff,
  detectCMJLanding,
  detectSLCMJTakeoff,
  detectSLCMJLanding,
  checkAthleteOrientation,
} from './jumpDetector';
import { getFrameTimestamp, getNextFrameId, resetFrameTime } from '../frameTime';
import { FrameIntegrityMonitor } from '../frameDrop';

const { 
  COUNTDOWN_SECONDS, CALIBRATION_FRAMES, MAX_RECORDING_DURATION_MS, BETWEEN_JUMPS_COUNTDOWN,
  SCANNER_COLLECT_MS, SCANNER_STABILITY_MS,
  CONFIDENCE_AUTO_START, CONFIDENCE_WARNING, CONFIDENCE_BLOCK,
  MAX_RECALIBRATION_RETRIES,
  MAX_RECORDING_DURATION_SLCMJ_MS, SLCMJ_MIN_JUMP_INTERVAL_MS,
  MIN_LANDING_FRAMES_AUTO_STOP,
} = JUMP_DETECTION_CONFIG;

/**
 * SL-CMJ continuous recording sub-state
 */
export type SlCmjRecordingState = 'idle' | 'waiting_first' | 'first_detected' | 'waiting_second' | 'completed';

/**
 * Scanner phase for calibration UI
 */
export type ScannerPhase = 'inactive' | 'collecting' | 'analyzing' | 'countdown' | 'ready' | 'blocked';

export interface ScannerState {
  phase: ScannerPhase;
  progress: number;          // 0-100 for current phase
  confidenceScore: number;   // 0-1 combined score
  footStability: number;     // 0-1
  poseConfidence: number;    // 0-1
  groundStability: number;   // 0-1
  retryCount: number;        // Number of recalibration retries
  warningMessage: string | null;
  showContinueButton: boolean; // For 65-79% confidence, shown after 500ms
}

export interface UseJumpCameraConfig {
  protocol: JumpProtocol;
  athleteId: string;
  boxHeightCm?: number;
  athleteHeightCm?: number;
  firstLeg?: 'left' | 'right';
}

export interface UseJumpCameraResult {
  // State
  phase: JumpCameraPhase;
  countdown: number;
  isRecording: boolean;
  frameCount: number;
  activeLeg: ActiveLeg;
  groundCalibration: GroundCalibration;
  
  // Scanner state
  scannerState: ScannerState;
  
  // Results
  metrics: JumpMetrics | null;
  events: JumpEvents | null;
  error: string | null;
  
  // SL-CMJ dual jump
  slCmjLeg1: SlCmjLegResult | null;
  slCmjLeg2: SlCmjLegResult | null;
  slCmjJumpNumber: number; // 1 or 2
  
  // Real-time metrics
  liveMetrics: LiveMetrics;
  
  // Actions
  startCountdown: () => void;
  stopRecording: () => void;
  processFrame: (keypoints: Array<{ name: string; x: number; y: number; score: number }>, nativeTimestamp?: number) => void;
  reset: () => void;
  retryCalibration: () => void;
  confirmContinue: () => void;
  
  // Orientation
  orientationResult: OrientationResult;
  
  // SL-CMJ continuous pipeline state
  slcmjRecordingState: SlCmjRecordingState;
  
  // Progress
  calibrationProgress: number;
  analysisProgress: number;
}

export function useJumpCamera(config: UseJumpCameraConfig): UseJumpCameraResult {
  const { protocol, athleteId, boxHeightCm = 0, athleteHeightCm = 175, firstLeg = 'right' } = config;
  const isSlCmj = protocol === 'sl_cmj_left' || protocol === 'sl_cmj_right' || protocol === 'sl_cmj';

  // State
  const [phase, setPhase] = useState<JumpCameraPhase>('setup');
  const [countdown, setCountdown] = useState<number>(COUNTDOWN_SECONDS);
  const [isRecording, setIsRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [activeLeg, setActiveLeg] = useState<ActiveLeg>(null);
  const [groundCalibration, setGroundCalibration] = useState<GroundCalibration>({
    groundLevel: 0,
    groundThreshold: 0,
    calibrationFrames: 0,
    isCalibrated: false,
    standingHipY: 0.5,
    confidenceScore: 0,
    footStability: 0,
    poseConfidence: 0,
    groundStability: 0,
    lockedLandmark: 'ankle',
    cmjMode: 'BOTH_FEET',
    bestFoot: null,
  });
  const [metrics, setMetrics] = useState<JumpMetrics | null>(null);
  const [events, setEvents] = useState<JumpEvents | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  
  // Scanner state
  const [scannerState, setScannerState] = useState<ScannerState>({
    phase: 'inactive',
    progress: 0,
    confidenceScore: 0,
    footStability: 0,
    poseConfidence: 0,
    groundStability: 0,
    retryCount: 0,
    warningMessage: null,
    showContinueButton: false,
  });
  
  // SL-CMJ dual jump state
  const [slCmjLeg1, setSlCmjLeg1] = useState<SlCmjLegResult | null>(null);
  const [slCmjLeg2, setSlCmjLeg2] = useState<SlCmjLegResult | null>(null);
  const [slCmjJumpNumber, setSlCmjJumpNumber] = useState(1);
  
  // Real-time metrics
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics>({
    currentHipY: 0,
    hipDelta: 0,
    feetAboveGround: false,
    eccentricTimeMs: 0,
    flightTimeMs: 0,
    contactTimeMs: 0,
    jumpDetected: false,
  });

  // Refs for frame storage (don't trigger re-renders)
  const calibrationFramesRef = useRef<JumpFrameData[]>([]);
  const recordingFramesRef = useRef<JumpFrameData[]>([]);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartTimeRef = useRef<number | null>(null);
  
  // Scanner timing refs
  const scannerStartTimeRef = useRef<number | null>(null);
  const scannerRetryCountRef = useRef(0);
  const stableScoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Orientation tracking
  const [orientationResult, setOrientationResult] = useState<OrientationResult>({
    isValid: true, shoulderWidth: 0, hipWidth: 0, message: null,
  });
  
  // Refs for real-time tracking
  const countermovementStartTimeRef = useRef<number | null>(null);
  const takeoffTimeRef = useRef<number | null>(null);
  const contactStartTimeRef = useRef<number | null>(null);
  
  // Frame integrity monitor
  const frameIntegrityRef = useRef<FrameIntegrityMonitor>(new FrameIntegrityMonitor({
    targetFps: JUMP_DETECTION_CONFIG.TARGET_FPS,
  }));

  // Landing-based auto-stop refs
  const landingAutoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landingFrameCountRef = useRef(0);
  
  // SL-CMJ continuous pipeline refs
  const [slcmjRecordingState, setSlcmjRecordingState] = useState<SlCmjRecordingState>('idle');
  const slcmjRecordingStateRef = useRef<SlCmjRecordingState>('idle');
  const firstJumpFrameEndRef = useRef<number>(0);
  const firstJumpLandingTimestampRef = useRef<number>(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  /**
   * Start scanner + countdown flow
   * Phase 1 (0-3s): Scanner collecting calibration data
   * Phase 2 (3-5s): Analyzing stability + confidence
   * Phase 3 (5s countdown): Standard countdown if confidence OK
   */
  const startCountdown = useCallback(() => {
    console.log('[JUMP_CAMERA_HOOK] ========================================');
    console.log('[JUMP_CAMERA_HOOK] startCountdown() called');
    console.log('[JUMP_CAMERA_HOOK] Protocol: ' + protocol);
    console.log('[JUMP_CAMERA_HOOK] Jump #' + slCmjJumpNumber);
    console.log('[JUMP_CAMERA_HOOK] ========================================');
    
    // Start scanner phase
    setPhase('scanning');
    setCountdown(COUNTDOWN_SECONDS);
    setError(null);
    calibrationFramesRef.current = [];
    recordingFramesRef.current = [];
    countermovementStartTimeRef.current = null;
    takeoffTimeRef.current = null;
    contactStartTimeRef.current = null;
    scannerStartTimeRef.current = Date.now();
    
    setScannerState(prev => ({
      ...prev,
      phase: 'collecting',
      progress: 0,
      confidenceScore: 0,
      footStability: 0,
      poseConfidence: 0,
      groundStability: 0,
      warningMessage: null,
    }));
    
    setLiveMetrics({
      currentHipY: 0,
      hipDelta: 0,
      feetAboveGround: false,
      eccentricTimeMs: 0,
      flightTimeMs: 0,
      contactTimeMs: 0,
      jumpDetected: false,
    });
  }, [protocol, slCmjJumpNumber]);

  /**
   * Evaluate scanner data and decide: proceed to countdown, warn, or block
   * Called internally when scanner phases complete
   */
  const evaluateCalibration = useCallback(() => {
    console.log('[JUMP_CAMERA_HOOK] Evaluating calibration...');
    console.log('[JUMP_CAMERA_HOOK] Calibration frames collected: ' + calibrationFramesRef.current.length);
    
    const calibration = calibrateGround(calibrationFramesRef.current);
    setGroundCalibration(calibration);
    
    // CMJ: Check for INVALID_CALIBRATION (foot selection failed)
    if (!isSlCmj && calibration.cmjMode === 'INVALID_CALIBRATION') {
      console.log('[JUMP_CAMERA_HOOK] CMJ INVALID_CALIBRATION — both feet unreliable');
      setScannerState(prev => ({
        ...prev,
        phase: 'blocked',
        confidenceScore: calibration.confidenceScore,
        footStability: calibration.footStability,
        poseConfidence: calibration.poseConfidence,
        groundStability: calibration.groundStability,
        warningMessage: 'Calibracao inconsistente. Reposicione o atleta.',
        showContinueButton: false,
      }));
      return;
    }
    
    // Detect active leg for SL-CMJ — protocol choice has ABSOLUTE priority
    if (protocol === 'sl_cmj_left' || protocol === 'sl_cmj_right') {
      const protocolLeg: ActiveLeg = protocol === 'sl_cmj_left' ? 'left' : 'right';
      const detected = detectActiveLeg(calibrationFramesRef.current);
      // Use auto-detection ONLY as fallback when it agrees or when protocol is ambiguous
      // Protocol choice always wins
      setActiveLeg(protocolLeg);
      if (detected && detected !== protocolLeg) {
        console.log('[JUMP_CAMERA_HOOK] detectActiveLeg returned "' + detected + '" but protocol says "' + protocolLeg + '" — using protocol');
      }
    }
    
    const score = calibration.confidenceScore;
    console.log('[JUMP_CAMERA_HOOK] Confidence score: ' + score.toFixed(3));
    
    // Check orientation at the decision point
    const latestLandmarks = calibrationFramesRef.current.length > 0
      ? extractJumpLandmarks([], calibration.lockedLandmark) // dummy — orientation uses stored result
      : null;
    const orientation = orientationResult; // Use latest tracked orientation
    console.log('[JUMP_CAMERA_HOOK] Orientation valid: ' + orientation.isValid +
      ' shoulderW=' + orientation.shoulderWidth.toFixed(4) +
      ' hipW=' + orientation.hipWidth.toFixed(4));
    
    if (score >= CONFIDENCE_AUTO_START) {
      // HIGH CONFIDENCE — check orientation before auto-start
      if (!orientation.isValid) {
        console.log('[JUMP_CAMERA_HOOK] Score OK but orientation INVALID — blocking');
        setScannerState(prev => ({
          ...prev,
          phase: 'blocked',
          confidenceScore: score,
          footStability: calibration.footStability,
          poseConfidence: calibration.poseConfidence,
          groundStability: calibration.groundStability,
          warningMessage: orientation.message || 'Posicione-se de lado para a camera',
          showContinueButton: false,
        }));
        return;
      }
      console.log('[JUMP_CAMERA_HOOK] Confidence OK (>= ' + CONFIDENCE_AUTO_START + '), starting countdown');
      setScannerState(prev => ({
        ...prev,
        phase: 'countdown',
        confidenceScore: score,
        footStability: calibration.footStability,
        poseConfidence: calibration.poseConfidence,
        groundStability: calibration.groundStability,
        warningMessage: null,
        showContinueButton: false,
      }));
      beginCountdown();
    } else if (score >= CONFIDENCE_WARNING) {
      // MARGINAL CONFIDENCE — show "Continue anyway" button after 500ms stable
      console.log('[JUMP_CAMERA_HOOK] Confidence marginal (' + score.toFixed(3) + '), showing ready state');
      setScannerState(prev => ({
        ...prev,
        phase: 'ready',
        confidenceScore: score,
        footStability: calibration.footStability,
        poseConfidence: calibration.poseConfidence,
        groundStability: calibration.groundStability,
        warningMessage: 'Calibracao instavel. Resultados podem variar.',
        showContinueButton: false,
      }));
      // Show "Continue" button after 500ms of stable score
      if (stableScoreTimerRef.current) clearTimeout(stableScoreTimerRef.current);
      stableScoreTimerRef.current = setTimeout(() => {
        setScannerState(prev => {
          if (prev.phase !== 'ready') return prev;
          return { ...prev, showContinueButton: true };
        });
      }, 500);
    } else {
      // BLOCK — confidence too low
      console.log('[JUMP_CAMERA_HOOK] Confidence TOO LOW (' + score.toFixed(3) + ')');
      const currentRetries = scannerRetryCountRef.current;
      
      if (currentRetries < MAX_RECALIBRATION_RETRIES) {
        // Auto-retry
        scannerRetryCountRef.current = currentRetries + 1;
        console.log('[JUMP_CAMERA_HOOK] Auto-retry #' + (currentRetries + 1));
        setScannerState(prev => ({
          ...prev,
          phase: 'collecting',
          progress: 0,
          retryCount: currentRetries + 1,
          confidenceScore: score,
          footStability: calibration.footStability,
          poseConfidence: calibration.poseConfidence,
          groundStability: calibration.groundStability,
          warningMessage: 'Recalibrando... (' + (currentRetries + 1) + '/' + MAX_RECALIBRATION_RETRIES + ')',
          showContinueButton: false,
        }));
        // Reset frames and restart scanner
        calibrationFramesRef.current = [];
        scannerStartTimeRef.current = Date.now();
      } else {
        // Max retries reached — block and show manual retry button
        console.log('[JUMP_CAMERA_HOOK] Max retries reached, blocking');
        setScannerState(prev => ({
          ...prev,
          phase: 'blocked',
          confidenceScore: score,
          footStability: calibration.footStability,
          poseConfidence: calibration.poseConfidence,
          groundStability: calibration.groundStability,
          retryCount: currentRetries,
          warningMessage: 'Calibracao falhou. Ajuste a posicao e tente novamente.',
          showContinueButton: false,
        }));
      }
    }
  }, [protocol, orientationResult]);

  /**
   * Begin the actual countdown (Phase 3) after scanner approval
   */
  const beginCountdown = useCallback(() => {
    setPhase('countdown');
    setCountdown(COUNTDOWN_SECONDS);
    
    countdownTimerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          
          console.log('[JUMP_CAMERA_HOOK] Countdown complete');
          console.log('[JUMP_CAMERA_HOOK] Starting RECORDING phase');
          setPhase('recording');
          setIsRecording(true);
          // P0.2: Defer recordingStartTime to first recording frame
          // This ensures both baseline and frame timestamps use same source
          recordingStartTimeRef.current = null;
          frameIntegrityRef.current.reset();
          resetFrameTime();
          
          // Reset landing detection
          landingAutoStopRef.current = null;
          landingFrameCountRef.current = 0;
          
          // Initialize SL-CMJ continuous pipeline
          if (isSlCmj) {
            slcmjRecordingStateRef.current = 'waiting_first';
            setSlcmjRecordingState('waiting_first');
            firstJumpFrameEndRef.current = 0;
            firstJumpLandingTimestampRef.current = 0;
          }
          
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  /**
   * Manual retry calibration (when blocked after max retries)
   */
  const retryCalibration = useCallback(() => {
    console.log('[JUMP_CAMERA_HOOK] Manual retry calibration');
    scannerRetryCountRef.current = 0;
    calibrationFramesRef.current = [];
    scannerStartTimeRef.current = Date.now();
    if (stableScoreTimerRef.current) {
      clearTimeout(stableScoreTimerRef.current);
      stableScoreTimerRef.current = null;
    }
    setScannerState({
      phase: 'collecting',
      progress: 0,
      confidenceScore: 0,
      footStability: 0,
      poseConfidence: 0,
      groundStability: 0,
      retryCount: 0,
      warningMessage: null,
      showContinueButton: false,
    });
    setPhase('scanning');
  }, []);

  /**
   * Confirm continue with marginal confidence (65-79%)
   * Checks orientation on click — blocks if invalid
   */
  const confirmContinue = useCallback(() => {
    console.log('[JUMP_CAMERA_HOOK] confirmContinue() — user accepted marginal confidence');
    if (!orientationResult.isValid) {
      console.log('[JUMP_CAMERA_HOOK] Orientation invalid on confirm — blocking');
      setScannerState(prev => ({
        ...prev,
        warningMessage: orientationResult.message || 'Posicione-se de lado para a camera',
      }));
      return;
    }
    if (stableScoreTimerRef.current) {
      clearTimeout(stableScoreTimerRef.current);
      stableScoreTimerRef.current = null;
    }
    setScannerState(prev => ({
      ...prev,
      phase: 'countdown',
      showContinueButton: false,
      warningMessage: 'Calibracao instavel. Resultados podem variar.',
    }));
    beginCountdown();
  }, [orientationResult, beginCountdown]);

  /**
   * Stop recording and analyze
   * This is the CRITICAL function that connects recording to results
   */
  const stopRecording = useCallback(() => {
    console.log('[JUMP_CAMERA_HOOK] ========================================');
    console.log('[JUMP_CAMERA_HOOK] stopRecording() called');
    console.log('[JUMP_CAMERA_HOOK] Frames collected: ' + recordingFramesRef.current.length);
    console.log('[JUMP_CAMERA_HOOK] ========================================');
    
    // Clear any pending auto-stop timeout
    if (landingAutoStopRef.current) {
      clearTimeout(landingAutoStopRef.current);
      landingAutoStopRef.current = null;
    }
    
    setIsRecording(false);
    setPhase('processing');
    setAnalysisProgress(0);

    // Use a slight delay to ensure state is updated before analysis
    setTimeout(() => {
      setAnalysisProgress(30);
      
      console.log('[LOG_JUMP_PIPELINE_START] Starting jump analysis...');
      console.log('[JUMP_CAMERA_HOOK] Protocol: ' + protocol);
      console.log('[JUMP_CAMERA_HOOK] Active leg: ' + activeLeg);
      console.log('[JUMP_CAMERA_HOOK] Recording frames: ' + recordingFramesRef.current.length);
      console.log('[JUMP_CAMERA_HOOK] Calibration: isCalibrated=' + groundCalibration.isCalibrated +
        ' ground=' + groundCalibration.groundLevel.toFixed(4) +
        ' threshold=' + groundCalibration.groundThreshold.toFixed(4));
      
      setAnalysisProgress(50);
      
      // SL-CMJ CONTINUOUS: Split frames and analyze each jump segment
      if (isSlCmj && firstJumpFrameEndRef.current > 0) {
        const allFrames = recordingFramesRef.current;
        const splitIdx = firstJumpFrameEndRef.current;
        
        // Buffer: skip ~15 frames after first landing for re-stabilization
        const bufferFrames = 15;
        const jump2StartIdx = Math.min(splitIdx + bufferFrames, allFrames.length - 1);
        
        const jump1Frames = allFrames.slice(0, splitIdx);
        const jump2Frames = allFrames.slice(jump2StartIdx);
        
        console.log('[JUMP_CAMERA_HOOK] SL-CMJ split: jump1=[0..' + splitIdx + '] jump2=[' + jump2StartIdx + '..' + allFrames.length + ']');
        
        // Determine protocols for each leg
        const firstLegProtocol = protocol === 'sl_cmj_left' ? 'sl_cmj_left' : 'sl_cmj_right';
        const secondLegProtocol = protocol === 'sl_cmj_left' ? 'sl_cmj_right' : 'sl_cmj_left';
        const firstLegSide = protocol === 'sl_cmj_left' ? 'left' : 'right';
        const secondLegSide = firstLegSide === 'left' ? 'right' : 'left';
        
        const result1 = analyzeJumpFrames(
          jump1Frames, groundCalibration, firstLegProtocol as any, firstLegSide as any, boxHeightCm, athleteHeightCm
        );
        const result2 = jump2Frames.length >= 15 ? analyzeJumpFrames(
          jump2Frames, groundCalibration, secondLegProtocol as any, secondLegSide as any, boxHeightCm, athleteHeightCm
        ) : null;
        
        console.log('[JUMP_CAMERA_HOOK] SL-CMJ result1: ' + (result1.metrics ? 'OK' : 'FAIL'));
        console.log('[JUMP_CAMERA_HOOK] SL-CMJ result2: ' + (result2?.metrics ? 'OK' : 'FAIL'));
        
        setAnalysisProgress(90);
        
        if (result1.metrics) {
          setSlCmjLeg1({ leg: firstLegSide, metrics: result1.metrics });
        }
        if (result2?.metrics) {
          setSlCmjLeg2({ leg: secondLegSide, metrics: result2.metrics });
        }
        
        // Use the better result as primary metrics
        const primaryMetrics = result2?.metrics || result1.metrics;
        const primaryEvents = result2?.events || result1.events;
        
        setMetrics(primaryMetrics || null);
        setEvents(primaryEvents || null);
        setError(primaryMetrics ? null : 'Nao foi possivel detectar ambos os saltos');
        setAnalysisProgress(100);
        setSlCmjJumpNumber(2);
        
        console.log('[LOG_JUMP_RESULTS_SCREEN_OPENED] SL-CMJ Transitioning to REVIEW phase');
        setPhase('review');
        return;
      }
      
      // CMJ: Single jump analysis (existing logic)
      const result = analyzeJumpFrames(
        recordingFramesRef.current,
        groundCalibration,
        protocol,
        activeLeg,
        boxHeightCm,
        athleteHeightCm
      );

      setAnalysisProgress(90);
      
      console.log('[JUMP_CAMERA_HOOK] Analysis result:');
      console.log('[JUMP_CAMERA_HOOK]   metrics=' + (result.metrics ? 'YES' : 'NULL'));
      console.log('[JUMP_CAMERA_HOOK]   error=' + (result.error || 'none'));
      console.log('[JUMP_CAMERA_HOOK]   phase=' + result.phase);

      if (result.metrics) {
        console.log('[LOG_JUMP_METRICS_CALCULATED] Metrics extracted successfully');
        
        setMetrics(result.metrics);
        setEvents(result.events);
        setError(null);
      } else {
        console.log('[JUMP_CAMERA_HOOK] Jump detection FAILED: ' + result.error);
        setMetrics(null);
        setEvents(null);
        setError(result.error || 'Failed to analyze jump');
      }

      setAnalysisProgress(100);
      
      console.log('[LOG_JUMP_RESULTS_SCREEN_OPENED] Transitioning to REVIEW phase');
      setPhase('review');
    }, 150);
  }, [groundCalibration, protocol, activeLeg, boxHeightCm, athleteHeightCm, isSlCmj]);

  /**
   * Process a single frame from pose detection
   * Handles scanning, calibration, recording, and real-time metric updates
   * Accepts optional nativeTimestamp from camera hardware for precision
   */
  const processFrame = useCallback((
    keypoints: Array<{ name: string; x: number; y: number; score: number }>,
    nativeTimestamp?: number
  ) => {
    // P0.2: Use native timestamp when available, fallback to performance.now()
    const timestamp = getFrameTimestamp(nativeTimestamp);
    const frameId = getNextFrameId();
    
    // Detecção de frame drop
    const integrity = frameIntegrityRef.current.checkFrame(frameId, timestamp);
    
    // Extract jump-relevant landmarks (use locked landmark from calibration if available)
    const lockedLandmark = groundCalibration.isCalibrated ? groundCalibration.lockedLandmark : undefined;
    const landmarks = extractJumpLandmarks(keypoints, lockedLandmark);
    const frameData = createJumpFrameData(landmarks, timestamp);
    
    if (!frameData) {
      return;  // Skip frames with insufficient landmarks
    }

    if (phase === 'scanning') {
      // SCANNER: collect frames and track progress
      calibrationFramesRef.current.push(frameData);
      setFrameCount(prev => prev + 1);
      
      // P0.1: Track orientation during scanning (visual feedback, doesn't block here)
      const orientation = checkAthleteOrientation(landmarks);
      setOrientationResult(orientation);
      
      const elapsed = Date.now() - (scannerStartTimeRef.current || Date.now());
      const totalScannerTime = SCANNER_COLLECT_MS + SCANNER_STABILITY_MS;
      
      if (elapsed < SCANNER_COLLECT_MS) {
        // Phase 1: Collecting data
        const progress = Math.min(100, (elapsed / SCANNER_COLLECT_MS) * 100);
        setScannerState(prev => {
          if (prev.phase !== 'collecting') return prev;
          return { ...prev, progress };
        });
        setCalibrationProgress(
          Math.min(100, (calibrationFramesRef.current.length / CALIBRATION_FRAMES) * 100)
        );
      } else if (elapsed < totalScannerTime) {
        // Phase 2: Analyzing stability
        const analyzeProgress = Math.min(100, ((elapsed - SCANNER_COLLECT_MS) / SCANNER_STABILITY_MS) * 100);
        setScannerState(prev => {
          if (prev.phase === 'analyzing') return { ...prev, progress: analyzeProgress };
          return { ...prev, phase: 'analyzing', progress: analyzeProgress };
        });
      } else {
        // Scanner phases complete — evaluate calibration
        evaluateCalibration();
      }
    } else if (phase === 'countdown') {
      // Continue collecting frames during countdown for extra calibration data
      calibrationFramesRef.current.push(frameData);
      setCalibrationProgress(
        Math.min(100, (calibrationFramesRef.current.length / CALIBRATION_FRAMES) * 100)
      );
      setFrameCount(prev => prev + 1);
    } else if (phase === 'recording' && isRecording) {
      // During recording, use locked landmark and store frames
      recordingFramesRef.current.push(frameData);
      setFrameCount(prev => prev + 1);
      
      // P0.2: Set recording start time from FIRST recording frame
      // Ensures same timestamp source as frame processing
      if (recordingStartTimeRef.current === null) {
        recordingStartTimeRef.current = timestamp;
        console.log('[JUMP_CAMERA_HOOK] Recording baseline set from first frame: ' + timestamp.toFixed(1));
      }
      
      // Update real-time metrics
      if (integrity.isValid) {
        updateLiveMetrics(frameData, timestamp);
      }
      
      // =============================================
      // LANDING-BASED AUTO-STOP
      // =============================================
      let inAir: boolean;
      let landed: boolean;
      if (isSlCmj) {
        // SL-CMJ: dedicated functions from jumpDetector.ts — only active leg
        inAir = detectSLCMJTakeoff(frameData, groundCalibration, activeLeg);
        landed = detectSLCMJLanding(frameData, groundCalibration, activeLeg);
      } else {
        // CMJ: cmjMode-aware detection + hip validation
        const footTakeoff = detectCMJTakeoff(frameData, groundCalibration);
        const hipAbove = frameData.hipCenterY < groundCalibration.standingHipY;
        inAir = footTakeoff && hipAbove;
        const footLanding = detectCMJLanding(frameData, groundCalibration);
        const hipBelow = frameData.hipCenterY >= groundCalibration.standingHipY;
        landed = footLanding && hipBelow;
      }
      
      if (takeoffTimeRef.current !== null && landed) {
        // Feet back on ground after takeoff = potential landing
        landingFrameCountRef.current++;
        
        if (landingFrameCountRef.current >= MIN_LANDING_FRAMES_AUTO_STOP) {
          // Confirmed landing!
          if (isSlCmj) {
            // SL-CMJ CONTINUOUS PIPELINE
            const currentSlState = slcmjRecordingStateRef.current;
            
            if (currentSlState === 'waiting_first') {
              // First jump landed
              console.log('[JUMP_CAMERA_HOOK] SL-CMJ: First jump LANDED at frame ' + recordingFramesRef.current.length);
              slcmjRecordingStateRef.current = 'first_detected';
              setSlcmjRecordingState('first_detected');
              firstJumpFrameEndRef.current = recordingFramesRef.current.length;
              firstJumpLandingTimestampRef.current = timestamp;
              
              // Reset tracking for second jump
              takeoffTimeRef.current = null;
              countermovementStartTimeRef.current = null;
              landingFrameCountRef.current = 0;
            } else if (currentSlState === 'waiting_second') {
              // Second jump landed — AUTO-STOP
              console.log('[JUMP_CAMERA_HOOK] SL-CMJ: Second jump LANDED — auto-stop in 300ms');
              slcmjRecordingStateRef.current = 'completed';
              setSlcmjRecordingState('completed');
              if (!landingAutoStopRef.current) {
                landingAutoStopRef.current = setTimeout(() => {
                  console.log('[JUMP_CAMERA_HOOK] SL-CMJ auto-stop triggered');
                  stopRecording();
                }, 300);
              }
            }
          } else {
            // CMJ: Single jump — AUTO-STOP after landing
            if (!landingAutoStopRef.current) {
              console.log('[JUMP_CAMERA_HOOK] CMJ: Landing detected — auto-stop in 300ms');
              landingAutoStopRef.current = setTimeout(() => {
                console.log('[JUMP_CAMERA_HOOK] CMJ auto-stop triggered');
                stopRecording();
              }, 300);
            }
          }
        }
      } else {
        // Reset consecutive landing frame counter
        landingFrameCountRef.current = 0;
      }
      
      // SL-CMJ: Transition from first_detected → waiting_second after interval
      if (isSlCmj && slcmjRecordingStateRef.current === 'first_detected') {
        const timeSinceFirstLanding = timestamp - firstJumpLandingTimestampRef.current;
        if (timeSinceFirstLanding >= SLCMJ_MIN_JUMP_INTERVAL_MS) {
          // Swap active leg for second jump detection
          const secondLeg: ActiveLeg = activeLeg === 'left' ? 'right' : 'left';
          console.log('[JUMP_CAMERA_HOOK] SL-CMJ: Interval elapsed (' + timeSinceFirstLanding.toFixed(0) + 'ms) — waiting for second jump (leg: ' + secondLeg + ')');
          slcmjRecordingStateRef.current = 'waiting_second';
          setSlcmjRecordingState('waiting_second');
          setActiveLeg(secondLeg);
          // Clean slate for second jump detection
          takeoffTimeRef.current = null;
          countermovementStartTimeRef.current = null;
          landingFrameCountRef.current = 0;
        }
      }
      
      // FALLBACK: Auto-stop after max recording duration
      const maxDuration = isSlCmj ? MAX_RECORDING_DURATION_SLCMJ_MS : MAX_RECORDING_DURATION_MS;
      if (recordingStartTimeRef.current && 
          timestamp - recordingStartTimeRef.current > maxDuration) {
        // SL-CMJ: provide specific error feedback based on which jump failed
        if (isSlCmj) {
          const currentSlState = slcmjRecordingStateRef.current;
          if (currentSlState === 'waiting_first') {
            console.log('[JUMP_CAMERA_HOOK] SL-CMJ fallback: first jump never detected');
            setError('Salto nao detectado. Ajuste a posicao e tente novamente.');
          } else if (currentSlState === 'first_detected' || currentSlState === 'waiting_second') {
            console.log('[JUMP_CAMERA_HOOK] SL-CMJ fallback: second jump never detected');
            setError('Segundo salto nao detectado. Tente novamente.');
          }
        }
        console.log('[JUMP_CAMERA_HOOK] Fallback auto-stop: max recording duration reached (' + maxDuration + 'ms)');
        stopRecording();
      }
    }
  }, [phase, isRecording, stopRecording, groundCalibration, evaluateCalibration, activeLeg]);

  /**
   * Update real-time metrics during recording
   */
  const updateLiveMetrics = useCallback((frame: JumpFrameData, timestamp: number) => {
    if (!groundCalibration.isCalibrated) return;
    
    // CMJ: BOTH feet must be above threshold
    // SL-CMJ: only active leg's foot (from jumpDetector.ts)
    let feetAboveGround: boolean;
    if (isSlCmj) {
      feetAboveGround = detectSLCMJTakeoff(frame, groundCalibration, activeLeg);
    } else {
      const footTakeoff = detectCMJTakeoff(frame, groundCalibration);
      const hipAbove = frame.hipCenterY < groundCalibration.standingHipY;
      feetAboveGround = footTakeoff && hipAbove;
    }
    
    const hipDelta = frame.hipCenterY - groundCalibration.standingHipY;
    
    // Track countermovement start
    if (!countermovementStartTimeRef.current && hipDelta > 0.008) {
      countermovementStartTimeRef.current = timestamp;
    }
    
    // Track takeoff
    if (!takeoffTimeRef.current && feetAboveGround && countermovementStartTimeRef.current) {
      takeoffTimeRef.current = timestamp;
    }
    
    // Calculate running times
    const eccentricTimeMs = countermovementStartTimeRef.current && !takeoffTimeRef.current
      ? timestamp - countermovementStartTimeRef.current
      : countermovementStartTimeRef.current && takeoffTimeRef.current
        ? takeoffTimeRef.current - countermovementStartTimeRef.current
        : 0;
    
    const flightTimeMs = takeoffTimeRef.current && feetAboveGround
      ? timestamp - takeoffTimeRef.current
      : 0;
    
    // Detect if jump is complete (was in air, now on ground)
    const jumpDetected = takeoffTimeRef.current !== null && !feetAboveGround && flightTimeMs > 0;
    
    setLiveMetrics({
      currentHipY: frame.hipCenterY,
      hipDelta,
      feetAboveGround,
      eccentricTimeMs,
      flightTimeMs,
      contactTimeMs: 0,
      jumpDetected,
    });
  }, [groundCalibration, isSlCmj, activeLeg]);

  /**
   * Start second jump for SL-CMJ sequence
   */
  const startSecondJump = useCallback(() => {
    console.log('[JUMP_CAMERA_HOOK] Starting SL-CMJ second jump');
    setMetrics(null);
    setEvents(null);
    setError(null);
    setFrameCount(0);
    setCalibrationProgress(0);
    setAnalysisProgress(0);
    calibrationFramesRef.current = [];
    recordingFramesRef.current = [];
    recordingStartTimeRef.current = null;
    countermovementStartTimeRef.current = null;
    takeoffTimeRef.current = null;
    contactStartTimeRef.current = null;
    
    // Swap active leg for second jump
    if (protocol === 'sl_cmj_left') {
      setActiveLeg('right');
    } else if (protocol === 'sl_cmj_right') {
      setActiveLeg('left');
    }
    
    startCountdown();
  }, [protocol, startCountdown]);
  
  // Auto-start second jump countdown when entering between_jumps phase
  useEffect(() => {
    if (phase === 'between_jumps') {
      const timer = setTimeout(() => {
        startSecondJump();
      }, BETWEEN_JUMPS_COUNTDOWN * 1000);
      
      return () => clearTimeout(timer);
    }
  }, [phase, startSecondJump]);

  /**
   * Reset all state
   */
  const reset = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    
    setPhase('setup');
    setCountdown(COUNTDOWN_SECONDS);
    setIsRecording(false);
    setFrameCount(0);
    setActiveLeg(null);
    setGroundCalibration({
      groundLevel: 0,
      groundThreshold: 0,
      calibrationFrames: 0,
      isCalibrated: false,
      standingHipY: 0.5,
      confidenceScore: 0,
      footStability: 0,
      poseConfidence: 0,
      groundStability: 0,
      lockedLandmark: 'ankle',
      cmjMode: 'BOTH_FEET',
      bestFoot: null,
    });
    setMetrics(null);
    setEvents(null);
    setError(null);
    setCalibrationProgress(0);
    setAnalysisProgress(0);
    setSlCmjLeg1(null);
    setSlCmjLeg2(null);
    setSlCmjJumpNumber(1);
    setLiveMetrics({
      currentHipY: 0,
      hipDelta: 0,
      feetAboveGround: false,
      eccentricTimeMs: 0,
      flightTimeMs: 0,
      contactTimeMs: 0,
      jumpDetected: false,
    });
    setScannerState({
      phase: 'inactive',
      progress: 0,
      confidenceScore: 0,
      footStability: 0,
      poseConfidence: 0,
      groundStability: 0,
      retryCount: 0,
      warningMessage: null,
      showContinueButton: false,
    });
    setOrientationResult({ isValid: true, shoulderWidth: 0, hipWidth: 0, message: null });
    scannerRetryCountRef.current = 0;
    scannerStartTimeRef.current = null;
    if (stableScoreTimerRef.current) {
      clearTimeout(stableScoreTimerRef.current);
      stableScoreTimerRef.current = null;
    }
    
    // Landing auto-stop cleanup
    if (landingAutoStopRef.current) {
      clearTimeout(landingAutoStopRef.current);
      landingAutoStopRef.current = null;
    }
    landingFrameCountRef.current = 0;
    
    // SL-CMJ continuous pipeline cleanup
    slcmjRecordingStateRef.current = 'idle';
    setSlcmjRecordingState('idle');
    firstJumpFrameEndRef.current = 0;
    firstJumpLandingTimestampRef.current = 0;
    
    calibrationFramesRef.current = [];
    recordingFramesRef.current = [];
    recordingStartTimeRef.current = null;
    countermovementStartTimeRef.current = null;
    takeoffTimeRef.current = null;
    contactStartTimeRef.current = null;
  }, []);

  return {
    // State
    phase,
    countdown,
    isRecording,
    frameCount,
    activeLeg,
    groundCalibration,
    
    // Scanner state
    scannerState,
    
    // Results
    metrics,
    events,
    error,
    
    // SL-CMJ dual jump
    slCmjLeg1,
    slCmjLeg2,
    slCmjJumpNumber,
    
    // Real-time metrics
    liveMetrics,
    
    // Actions
    startCountdown,
    stopRecording,
    processFrame,
    reset,
    retryCalibration,
    confirmContinue,
    
    // Orientation
    orientationResult,
    
    // SL-CMJ continuous pipeline
    slcmjRecordingState,
    
    // Progress
    calibrationProgress,
    analysisProgress,
  };
}
