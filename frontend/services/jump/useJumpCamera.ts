/**
 * useJumpCamera Hook
 * 
 * React hook for managing jump camera state and processing.
 * Handles countdown, recording, and frame analysis.
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
  JumpCameraConfig,
  JUMP_DETECTION_CONFIG,
} from './types';
import {
  calibrateGround,
  detectActiveLeg,
  analyzeJumpFrames,
  extractJumpLandmarks,
  createJumpFrameData,
} from './jumpDetector';

const { COUNTDOWN_SECONDS, TARGET_FPS, CALIBRATION_FRAMES } = JUMP_DETECTION_CONFIG;

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
  });
  const [metrics, setMetrics] = useState<JumpMetrics | null>(null);
  const [events, setEvents] = useState<JumpEvents | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  // Refs for frame storage (don't trigger re-renders)
  const calibrationFramesRef = useRef<JumpFrameData[]>([]);
  const recordingFramesRef = useRef<JumpFrameData[]>([]);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartTimeRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  /**
   * Start countdown
   */
  const startCountdown = useCallback(() => {
    setPhase('countdown');
    setCountdown(COUNTDOWN_SECONDS);
    setError(null);
    calibrationFramesRef.current = [];
    recordingFramesRef.current = [];

    // Start countdown timer
    countdownTimerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Countdown finished - start recording
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          
          // Process calibration data collected during countdown
          const calibration = calibrateGround(calibrationFramesRef.current);
          setGroundCalibration(calibration);
          
          // Detect active leg for SL-CMJ
          if (protocol === 'sl_cmj_left' || protocol === 'sl_cmj_right') {
            const detected = detectActiveLeg(calibrationFramesRef.current);
            setActiveLeg(detected);
            
            // Override with protocol-specified leg if detection fails
            if (!detected) {
              setActiveLeg(protocol === 'sl_cmj_left' ? 'left' : 'right');
            }
          }
          
          setPhase('recording');
          setIsRecording(true);
          recordingStartTimeRef.current = Date.now();
          
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [protocol]);

  /**
   * Stop recording and analyze
   */
  const stopRecording = useCallback(() => {
    setIsRecording(false);
    setPhase('processing');
    setAnalysisProgress(0);

    // Analyze collected frames
    setTimeout(() => {
      setAnalysisProgress(50);
      
      const result = analyzeJumpFrames(
        recordingFramesRef.current,
        groundCalibration,
        protocol,
        activeLeg,
        boxHeightCm,
        athleteHeightCm
      );

      setAnalysisProgress(100);

      if (result.metrics) {
        setMetrics(result.metrics);
        setEvents(result.events);
        setError(null);
      } else {
        setMetrics(null);
        setEvents(null);
        setError(result.error || 'Failed to analyze jump');
      }

      setPhase('review');
    }, 100);
  }, [groundCalibration, protocol, activeLeg, boxHeightCm, athleteHeightCm]);

  /**
   * Process a single frame from pose detection
   */
  const processFrame = useCallback((
    keypoints: Array<{ name: string; x: number; y: number; score: number }>
  ) => {
    const timestamp = Date.now();
    
    // Extract jump-relevant landmarks
    const landmarks = extractJumpLandmarks(keypoints);
    const frameData = createJumpFrameData(landmarks, timestamp);
    
    if (!frameData) {
      return;  // Skip frames with insufficient landmarks
    }

    if (phase === 'countdown') {
      // Collect frames for calibration during countdown
      calibrationFramesRef.current.push(frameData);
      setCalibrationProgress(
        Math.min(100, (calibrationFramesRef.current.length / CALIBRATION_FRAMES) * 100)
      );
      setFrameCount(prev => prev + 1);
    } else if (phase === 'recording' && isRecording) {
      // Collect frames during recording
      recordingFramesRef.current.push(frameData);
      setFrameCount(prev => prev + 1);
      
      // Auto-stop after 5 seconds of recording
      if (recordingStartTimeRef.current && 
          timestamp - recordingStartTimeRef.current > 5000) {
        stopRecording();
      }
    }
  }, [phase, isRecording, stopRecording]);

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
    });
    setMetrics(null);
    setEvents(null);
    setError(null);
    setCalibrationProgress(0);
    setAnalysisProgress(0);
    
    calibrationFramesRef.current = [];
    recordingFramesRef.current = [];
    recordingStartTimeRef.current = null;
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
