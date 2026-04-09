/**
 * useBodyScan.ts — Hook principal do Body Scan
 *
 * State machine:
 *   IDLE -> POSITIONING -> CAPTURING -> PROCESSING -> COMPLETE / ERROR
 *
 * Gerencia buffer de frames, validacao de pose, e processamento final.
 * Usa refs internamente para evitar re-renders durante captura.
 *
 * Retorna interface compativel com Avatar3D:
 *   { bodyParams, loading, confidence }
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
  // State
  phase: BodyScanPhase;
  poseValidation: PoseValidation;
  progress: number;              // 0-100 durante captura
  framesCollected: number;
  result: BodyScanResult | null;
  error: string | null;
  currentLandmarks: Landmark[];
  stateLabel: string;            // Label legivel: "Buscando corpo", "Ajustando posicao", etc.

  // Avatar3D compatible interface
  bodyParams: BodyParams | null;
  loading: boolean;
  confidence: number;

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

// Labels para os 4 estados visuais
const STATE_LABELS: Record<string, string> = {
  idle: '',
  positioning_searching: 'BUSCANDO CORPO',
  positioning_adjusting: 'AJUSTANDO POSICAO',
  capturing: 'ESCANEANDO',
  processing: 'PROCESSANDO',
  complete: 'COMPLETO',
  error: 'ERRO',
};

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
  const [stateLabel, setStateLabel] = useState('');

  // Refs (performance — nao dispara re-renders)
  const phaseRef = useRef<BodyScanPhase>('idle');
  const frameBufferRef = useRef<CapturedFrame[]>([]);
  const validConsecutiveRef = useRef(0);
  const frameCountRef = useRef(0);
  const isProcessingRef = useRef(false);
  const hasBodyRef = useRef(false);

  // ============================================================
  // DERIVED (Avatar3D interface)
  // ============================================================

  const bodyParams = result?.bodyParams ?? null;
  const loading = phase === 'positioning' || phase === 'capturing' || phase === 'processing';
  const confidence = result ? result.captureQuality : poseValidation.confidence;

  // ============================================================
  // ACTIONS
  // ============================================================

  const startPositioning = useCallback(() => {
    phaseRef.current = 'positioning';
    hasBodyRef.current = false;
    setPhase('positioning');
    setStateLabel(STATE_LABELS.positioning_searching);
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
    hasBodyRef.current = false;
    setPhase('idle');
    setStateLabel('');
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
   *
   * Performance: usa refs para leitura, setState throttled.
   * Nao faz log por frame.
   */
  const processFrame = useCallback((landmarks: Landmark[]) => {
    // Guard: re-entrant
    if (isProcessingRef.current) return;
    const currentPhase = phaseRef.current;
    if (currentPhase !== 'positioning' && currentPhase !== 'capturing') return;

    isProcessingRef.current = true;

    try {
      frameCountRef.current++;
      const fc = frameCountRef.current;

      // Atualiza landmarks para overlay visual (throttled ~10fps)
      if (fc % 3 === 0) {
        setCurrentLandmarks(landmarks);
      }

      // Valida pose
      const validation = validatePose(landmarks);

      // Track se tem corpo detectado
      const bodyDetected = validation.isFullBodyVisible;
      if (bodyDetected && !hasBodyRef.current) {
        hasBodyRef.current = true;
      }

      // Atualiza validacao UI + stateLabel (throttled ~10fps)
      if (fc % 3 === 0) {
        setPoseValidation(validation);

        // Determinar label do estado visual
        if (currentPhase === 'positioning') {
          const allOk = validation.isFullBodyVisible && validation.isGoodDistance && validation.isCentered;
          if (!hasBodyRef.current) {
            setStateLabel(STATE_LABELS.positioning_searching);
          } else if (!allOk) {
            setStateLabel(STATE_LABELS.positioning_adjusting);
          } else {
            setStateLabel(STATE_LABELS.positioning_adjusting); // prestes a capturar
          }
        }
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
          setStateLabel(STATE_LABELS.capturing);
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

        // Atualiza progress (throttled ~15fps)
        if (fc % 2 === 0) {
          setProgress(pct);
          setFramesCollected(collected);
        }

        // Captura completa?
        if (collected >= targetFrames) {
          phaseRef.current = 'processing';
          setPhase('processing');
          setStateLabel(STATE_LABELS.processing);

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
        setStateLabel(STATE_LABELS.error);
        return;
      }

      // Avaliar estabilidade
      const stability = evaluateStability(frames);
      if (!stability.isStable) {
        setError('Movimento detectado durante captura. Tente novamente ficando mais parado.');
        phaseRef.current = 'error';
        setPhase('error');
        setStateLabel(STATE_LABELS.error);
        return;
      }

      // Media dos landmarks
      const averaged = averageLandmarks(frames);
      if (averaged.length < 33) {
        setError('Landmarks insuficientes na media');
        phaseRef.current = 'error';
        setPhase('error');
        setStateLabel(STATE_LABELS.error);
        return;
      }

      // Body Mapping
      const params = mapBody(averaged, athleteHeightCm);
      if (!params) {
        setError('Falha ao calcular proporcoes corporais');
        phaseRef.current = 'error';
        setPhase('error');
        setStateLabel(STATE_LABELS.error);
        return;
      }

      // Qualidade: ratio de frames validos vs total
      const captureQuality = frames.length / targetFrames;

      const scanResult: BodyScanResult = {
        bodyParams: params,
        averagedLandmarks: averaged,
        framesUsed: frames.length,
        captureQuality: Math.min(1, captureQuality),
      };

      setResult(scanResult);
      phaseRef.current = 'complete';
      setPhase('complete');
      setStateLabel(STATE_LABELS.complete);
    } catch (e) {
      setError(`Erro no processamento: ${e}`);
      phaseRef.current = 'error';
      setPhase('error');
      setStateLabel(STATE_LABELS.error);
    }
  }, [athleteHeightCm, minValidFrames, targetFrames]);

  return {
    // State
    phase,
    poseValidation,
    progress,
    framesCollected,
    result,
    error,
    currentLandmarks,
    stateLabel,

    // Avatar3D compatible
    bodyParams,
    loading,
    confidence,

    // Actions
    startPositioning,
    processFrame,
    reset,
  };
}
