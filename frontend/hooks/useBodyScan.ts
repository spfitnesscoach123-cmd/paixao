/**
 * useBodyScan.ts — Hook principal do Body Scan
 *
 * State machine:
 *   IDLE -> POSITIONING -> CAPTURING -> PROCESSING -> COMPLETE / ERROR
 *
 * Gerencia buffer de frames, validacao de pose, e processamento final.
 * Usa refs internamente para evitar re-renders durante captura.
 */

import { useRef, useCallback, useState } from 'react';
import {
  type Landmark,
  type BodyParams,
  type CapturedFrame,
  type PoseValidation,
  validatePose,
  evaluateStability,
  averageLandmarks,
  mapBody,
} from '../engine/body-composition/bodyMapping';

// ============================================================
// TYPES
// ============================================================

export type BodyScanPhase =
  | 'idle'
  | 'positioning'   // camera ativa, aguardando pose valida
  | 'capturing'     // coletando frames (2-3s)
  | 'processing'    // calculando body params
  | 'complete'      // sucesso
  | 'error';        // falha

export interface BodyScanConfig {
  athleteHeightCm: number;
  targetFrames?: number;   // frames a capturar (default: 75 = ~2.5s @ 30fps)
  minValidFrames?: number; // minimo de frames validos para processar (default: 45)
}

export interface BodyScanResult {
  bodyParams: BodyParams;
  averagedLandmarks: Landmark[];
  framesUsed: number;
  captureQuality: number; // 0-1
}

export interface UseBodyScanReturn {
  phase: BodyScanPhase;
  poseValidation: PoseValidation;
  progress: number;              // 0-100 durante captura
  framesCollected: number;
  result: BodyScanResult | null;
  error: string | null;
  currentLandmarks: Landmark[];

  // Actions
  startPositioning: () => void;
  processFrame: (landmarks: Landmark[]) => void;
  reset: () => void;
}

// ============================================================
// CONSTANTES
// ============================================================

const DEFAULT_TARGET_FRAMES = 75;    // ~2.5s @ 30fps
const DEFAULT_MIN_VALID = 45;
const POSITIONING_AUTO_START_FRAMES = 15; // 15 frames validos consecutivos -> auto-start captura
const MIN_CONFIDENCE_FOR_FRAME = 0.6;

// ============================================================
// HOOK
// ============================================================

export function useBodyScan(config: BodyScanConfig): UseBodyScanReturn {
  const { athleteHeightCm, targetFrames = DEFAULT_TARGET_FRAMES, minValidFrames = DEFAULT_MIN_VALID } = config;

  // React state (atualiza UI)
  const [phase, setPhase] = useState<BodyScanPhase>('idle');
  const [poseValidation, setPoseValidation] = useState<PoseValidation>({
    isFullBodyVisible: false,
    isGoodDistance: false,
    isCentered: false,
    isStable: true,
    confidence: 0,
    message: null,
  });
  const [progress, setProgress] = useState(0);
  const [framesCollected, setFramesCollected] = useState(0);
  const [result, setResult] = useState<BodyScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentLandmarks, setCurrentLandmarks] = useState<Landmark[]>([]);

  // Refs (performance — nao dispara re-renders)
  const phaseRef = useRef<BodyScanPhase>('idle');
  const frameBufferRef = useRef<CapturedFrame[]>([]);
  const validConsecutiveRef = useRef(0);
  const frameCountRef = useRef(0);
  const isProcessingRef = useRef(false);

  // ============================================================
  // ACTIONS
  // ============================================================

  const startPositioning = useCallback(() => {
    phaseRef.current = 'positioning';
    setPhase('positioning');
    frameBufferRef.current = [];
    validConsecutiveRef.current = 0;
    frameCountRef.current = 0;
    setProgress(0);
    setFramesCollected(0);
    setResult(null);
    setError(null);
  }, []);

  const reset = useCallback(() => {
    phaseRef.current = 'idle';
    setPhase('idle');
    frameBufferRef.current = [];
    validConsecutiveRef.current = 0;
    frameCountRef.current = 0;
    isProcessingRef.current = false;
    setProgress(0);
    setFramesCollected(0);
    setResult(null);
    setError(null);
    setCurrentLandmarks([]);
    setPoseValidation({
      isFullBodyVisible: false,
      isGoodDistance: false,
      isCentered: false,
      isStable: true,
      confidence: 0,
      message: null,
    });
  }, []);

  /**
   * Processa um frame de landmarks do MediaPipe.
   * Chamado a cada frame (~30fps).
   */
  const processFrame = useCallback((landmarks: Landmark[]) => {
    // Guard: re-entrant
    if (isProcessingRef.current) return;
    const currentPhase = phaseRef.current;
    if (currentPhase !== 'positioning' && currentPhase !== 'capturing') return;

    isProcessingRef.current = true;

    try {
      frameCountRef.current++;

      // Atualiza landmarks para overlay visual (throttled ~15fps)
      if (frameCountRef.current % 2 === 0) {
        setCurrentLandmarks(landmarks);
      }

      // Valida pose
      const validation = validatePose(landmarks);

      // Atualiza validacao UI (throttled)
      if (frameCountRef.current % 3 === 0) {
        setPoseValidation(validation);
      }

      const poseOk = validation.isFullBodyVisible && validation.isGoodDistance && validation.isCentered;

      // ============ POSITIONING PHASE ============
      if (currentPhase === 'positioning') {
        if (poseOk && validation.confidence >= MIN_CONFIDENCE_FOR_FRAME) {
          validConsecutiveRef.current++;
        } else {
          validConsecutiveRef.current = 0;
        }

        // Auto-start captura apos N frames consecutivos validos
        if (validConsecutiveRef.current >= POSITIONING_AUTO_START_FRAMES) {
          phaseRef.current = 'capturing';
          setPhase('capturing');
          frameBufferRef.current = [];
          setProgress(0);
          setFramesCollected(0);
        }
        return;
      }

      // ============ CAPTURING PHASE ============
      if (currentPhase === 'capturing') {
        // Confianca media dos landmarks criticos
        const criticalVis = [
          landmarks[0]?.visibility ?? 0,   // nose
          landmarks[11]?.visibility ?? 0,  // l_shoulder
          landmarks[12]?.visibility ?? 0,  // r_shoulder
          landmarks[23]?.visibility ?? 0,  // l_hip
          landmarks[24]?.visibility ?? 0,  // r_hip
          landmarks[27]?.visibility ?? 0,  // l_ankle
          landmarks[28]?.visibility ?? 0,  // r_ankle
        ];
        const avgConf = criticalVis.reduce((s, v) => s + v, 0) / criticalVis.length;

        // Aceita frame se confianca ok
        if (avgConf >= MIN_CONFIDENCE_FOR_FRAME) {
          frameBufferRef.current.push({
            landmarks: [...landmarks],
            timestamp: Date.now(),
            confidence: avgConf,
          });
        }

        const collected = frameBufferRef.current.length;
        const pct = Math.min(100, Math.round((collected / targetFrames) * 100));

        // Atualiza progress (throttled)
        if (frameCountRef.current % 2 === 0) {
          setProgress(pct);
          setFramesCollected(collected);
        }

        // Captura completa?
        if (collected >= targetFrames) {
          phaseRef.current = 'processing';
          setPhase('processing');

          // Processar em "background" (microtask)
          queueMicrotask(() => processCapturedFrames());
        }
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, [targetFrames, athleteHeightCm]);

  // ============================================================
  // PROCESSAMENTO FINAL
  // ============================================================

  const processCapturedFrames = useCallback(() => {
    try {
      const frames = frameBufferRef.current;

      if (frames.length < minValidFrames) {
        setError(`Frames insuficientes: ${frames.length}/${minValidFrames}`);
        phaseRef.current = 'error';
        setPhase('error');
        return;
      }

      // Avaliar estabilidade
      const stability = evaluateStability(frames);
      if (!stability.isStable) {
        setError('Movimento detectado durante captura. Tente novamente ficando mais parado.');
        phaseRef.current = 'error';
        setPhase('error');
        return;
      }

      // Media dos landmarks
      const averaged = averageLandmarks(frames);
      if (averaged.length < 33) {
        setError('Landmarks insuficientes na media');
        phaseRef.current = 'error';
        setPhase('error');
        return;
      }

      // Body Mapping
      const bodyParams = mapBody(averaged, athleteHeightCm);
      if (!bodyParams) {
        setError('Falha ao calcular proporcoes corporais');
        phaseRef.current = 'error';
        setPhase('error');
        return;
      }

      // Qualidade: ratio de frames validos vs total
      const captureQuality = frames.length / targetFrames;

      const scanResult: BodyScanResult = {
        bodyParams,
        averagedLandmarks: averaged,
        framesUsed: frames.length,
        captureQuality: Math.min(1, captureQuality),
      };

      setResult(scanResult);
      phaseRef.current = 'complete';
      setPhase('complete');
    } catch (e) {
      setError(`Erro no processamento: ${e}`);
      phaseRef.current = 'error';
      setPhase('error');
    }
  }, [athleteHeightCm, minValidFrames, targetFrames]);

  return {
    phase,
    poseValidation,
    progress,
    framesCollected,
    result,
    error,
    currentLandmarks,
    startPositioning,
    processFrame,
    reset,
  };
}
