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
} from './jumpDetector';
import { getFrameTimestamp, getNextFrameId, resetFrameTime } from '../frameTime';
import { FrameIntegrityMonitor } from '../frameDrop';

const { COUNTDOWN_SECONDS, CALIBRATION_FRAMES, MAX_RECORDING_DURATION_MS, BETWEEN_JUMPS_COUNTDOWN } = JUMP_DETECTION_CONFIG;

export interface UseJumpCameraConfig {
  protocol: JumpProtocol;
  athleteId: string;
  boxHeightCm?: number;
  athleteHeightCm?: number;
}

export interface UseJumpCameraResult {
  // State
  phase: JumpCameraPhase;
  countdown: number;
  isRecording: boolean;
  frameCount: number;
  activeLeg: ActiveLeg;
  groundCalibration: GroundCalibration;
  
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
  processFrame: (keypoints: Array<{ name: string; x: number; y: number; score: number }>) => void;
  reset: () => void;
  
  // Progress
  calibrationProgress: number;
  analysisProgress: number;
}

export function useJumpCamera(config: UseJumpCameraConfig): UseJumpCameraResult {
  const { protocol, athleteId, boxHeightCm = 0, athleteHeightCm = 175 } = config;

  // State
  const [phase, setPhase] = useState<JumpCameraPhase>('setup');
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [isRecording, setIsRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [activeLeg, setActiveLeg] = useState<ActiveLeg>(null);
  const [groundCalibration, setGroundCalibration] = useState<GroundCalibration>({
    groundLevel: 0,
    groundThreshold: 0,
    calibrationFrames: 0,
    isCalibrated: false,
    standingHipY: 0.5,
  });
  const [metrics, setMetrics] = useState<JumpMetrics | null>(null);
  const [events, setEvents] = useState<JumpEvents | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  
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
  
  // Refs for real-time tracking
  const countermovementStartTimeRef = useRef<number | null>(null);
  const takeoffTimeRef = useRef<number | null>(null);
  const contactStartTimeRef = useRef<number | null>(null);
  
  // Frame integrity monitor para detecção de frame drop
  const frameIntegrityRef = useRef<FrameIntegrityMonitor>(new FrameIntegrityMonitor({
    targetFps: JUMP_DETECTION_CONFIG.TARGET_FPS,
  }));

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  /**
   * Start countdown - begins calibration phase
   */
  const startCountdown = useCallback(() => {
    console.log('[JUMP_CAMERA_HOOK] ========================================');
    console.log('[JUMP_CAMERA_HOOK] startCountdown() called');
    console.log('[JUMP_CAMERA_HOOK] Protocol: ' + protocol);
    console.log('[JUMP_CAMERA_HOOK] Jump #' + slCmjJumpNumber);
    console.log('[JUMP_CAMERA_HOOK] ========================================');
    
    setPhase('countdown');
    setCountdown(COUNTDOWN_SECONDS);
    setError(null);
    calibrationFramesRef.current = [];
    recordingFramesRef.current = [];
    countermovementStartTimeRef.current = null;
    takeoffTimeRef.current = null;
    contactStartTimeRef.current = null;
    
    setLiveMetrics({
      currentHipY: 0,
      hipDelta: 0,
      feetAboveGround: false,
      eccentricTimeMs: 0,
      flightTimeMs: 0,
      contactTimeMs: 0,
      jumpDetected: false,
    });

    // Start countdown timer
    countdownTimerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Countdown finished - start recording
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          
          console.log('[JUMP_CAMERA_HOOK] Countdown complete');
          console.log('[JUMP_CAMERA_HOOK] Calibration frames: ' + calibrationFramesRef.current.length);
          
          // Process calibration data collected during countdown
          const calibration = calibrateGround(calibrationFramesRef.current);
          setGroundCalibration(calibration);
          
          // Detect active leg for SL-CMJ
          if (protocol === 'sl_cmj_left' || protocol === 'sl_cmj_right') {
            const detected = detectActiveLeg(calibrationFramesRef.current);
            setActiveLeg(detected);
            if (!detected) {
              setActiveLeg(protocol === 'sl_cmj_left' ? 'left' : 'right');
            }
          }
          
          console.log('[JUMP_CAMERA_HOOK] Starting RECORDING phase');
          setPhase('recording');
          setIsRecording(true);
          recordingStartTimeRef.current = getFrameTimestamp();
          // Resetar monitor de integridade para nova gravação
          frameIntegrityRef.current.reset();
          resetFrameTime();
          
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [protocol, slCmjJumpNumber]);

  /**
   * Stop recording and analyze
   * This is the CRITICAL function that connects recording to results
   */
  const stopRecording = useCallback(() => {
    console.log('[JUMP_CAMERA_HOOK] ========================================');
    console.log('[JUMP_CAMERA_HOOK] stopRecording() called');
    console.log('[JUMP_CAMERA_HOOK] Frames collected: ' + recordingFramesRef.current.length);
    console.log('[JUMP_CAMERA_HOOK] ========================================');
    
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
        
        // Handle SL-CMJ dual jump
        const isSlCmj = protocol === 'sl_cmj_left' || protocol === 'sl_cmj_right';
        
        if (isSlCmj && slCmjJumpNumber === 1) {
          // First leg done - store result and prepare for second
          const leg = protocol === 'sl_cmj_left' ? 'left' : 'right';
          setSlCmjLeg1({ leg: leg as 'left' | 'right', metrics: result.metrics });
          
          console.log('[JUMP_CAMERA_HOOK] SL-CMJ Leg 1 complete (' + leg + ')');
          console.log('[JUMP_CAMERA_HOOK] Transitioning to between_jumps phase');
          
          setMetrics(result.metrics);
          setEvents(result.events);
          setError(null);
          setAnalysisProgress(100);
          setSlCmjJumpNumber(2);
          setPhase('between_jumps');
          return;
        }
        
        if (isSlCmj && slCmjJumpNumber === 2) {
          // Second leg done - store result
          const leg = protocol === 'sl_cmj_left' ? 'right' : 'left'; // Opposite leg for jump 2
          setSlCmjLeg2({ leg: leg as 'left' | 'right', metrics: result.metrics });
          console.log('[JUMP_CAMERA_HOOK] SL-CMJ Leg 2 complete (' + leg + ')');
        }
        
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
      
      // CRITICAL: Always transition to review, regardless of whether metrics exist
      // The UI handles both success (metrics present) and error (metrics null) states
      console.log('[LOG_JUMP_RESULTS_SCREEN_OPENED] Transitioning to REVIEW phase');
      setPhase('review');
    }, 150);
  }, [groundCalibration, protocol, activeLeg, boxHeightCm, athleteHeightCm, slCmjJumpNumber]);

  /**
   * Process a single frame from pose detection
   * Handles calibration, recording, and real-time metric updates
   */
  const processFrame = useCallback((
    keypoints: Array<{ name: string; x: number; y: number; score: number }>
  ) => {
    // Timestamp monotônico do frame (performance.now) — substitui Date.now()
    const timestamp = getFrameTimestamp();
    const frameId = getNextFrameId();
    
    // Detecção de frame drop
    const integrity = frameIntegrityRef.current.checkFrame(frameId, timestamp);
    
    // Extract jump-relevant landmarks
    const landmarks = extractJumpLandmarks(keypoints);
    const frameData = createJumpFrameData(landmarks, timestamp);
    
    if (!frameData) {
      return;  // Skip frames with insufficient landmarks
    }

    if (phase === 'countdown') {
      // Collect frames for calibration during countdown
      // Frame drops durante calibração não são críticos — incluir mesmo assim
      calibrationFramesRef.current.push(frameData);
      setCalibrationProgress(
        Math.min(100, (calibrationFramesRef.current.length / CALIBRATION_FRAMES) * 100)
      );
      setFrameCount(prev => prev + 1);
    } else if (phase === 'recording' && isRecording) {
      // Durante gravação, marcar frames com drop mas NÃO descartar
      // (a análise offline usa smoothing que mitiga gaps pontuais)
      recordingFramesRef.current.push(frameData);
      setFrameCount(prev => prev + 1);
      
      // Update real-time metrics — pular se frame degradado por drop
      if (integrity.isValid) {
        updateLiveMetrics(frameData, timestamp);
      }
      
      // Auto-stop after MAX_RECORDING_DURATION_MS of recording
      if (recordingStartTimeRef.current && 
          timestamp - recordingStartTimeRef.current > MAX_RECORDING_DURATION_MS) {
        console.log('[JUMP_CAMERA_HOOK] Auto-stop: max recording duration reached (' + MAX_RECORDING_DURATION_MS + 'ms)');
        stopRecording();
      }
    }
  }, [phase, isRecording, stopRecording]);

  /**
   * Update real-time metrics during recording
   */
  const updateLiveMetrics = useCallback((frame: JumpFrameData, timestamp: number) => {
    if (!groundCalibration.isCalibrated) return;
    
    const feetAboveGround = frame.leftToeY < groundCalibration.groundThreshold && 
                            frame.rightToeY < groundCalibration.groundThreshold;
    
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
      contactTimeMs: 0, // Updated for DJ only
      jumpDetected,
    });
  }, [groundCalibration]);

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
    
    // Progress
    calibrationProgress,
    analysisProgress,
  };
}
