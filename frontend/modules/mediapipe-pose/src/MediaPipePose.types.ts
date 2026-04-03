/**
 * mediapipe-pose — Tipos TypeScript
 *
 * Interface entre o módulo nativo (iOS/Android) e o código JS.
 * Reflete exatamente o formato de dados retornado pelo código Swift/Kotlin.
 */

import type { ViewProps } from 'react-native';

/** Landmark individual retornado pelo MediaPipe Pose Landmarker (33 por frame) */
export interface PoseLandmark {
  x: number;          // Normalizado 0-1 (esquerda → direita)
  y: number;          // Normalizado 0-1 (topo → base)
  z: number;          // Profundidade (negativo = mais perto da câmera)
  visibility: number; // Confiança 0-1
}

/** Evento emitido pelo módulo nativo a cada frame processado */
export interface PoseDetectedEvent {
  landmarks: PoseLandmark[];
  timestamp: number;     // Timestamp nativo do frame em ms (monotônico)
  frameWidth: number;
  frameHeight: number;
}

/** Evento de erro emitido pelo módulo nativo */
export interface PoseErrorEvent {
  message: string;
  code?: string;
}

/** Configuração do PoseLandmarker */
export interface MediaPipePoseConfig {
  modelComplexity: 0 | 1 | 2;        // 0=Lite, 1=Full, 2=Heavy
  minDetectionConfidence: number;      // 0.0-1.0
  minTrackingConfidence: number;       // 0.0-1.0
  minPresenceConfidence: number;       // 0.0-1.0
  maxNumPoses: number;                 // Normalmente 1 para VBT/Jump
}

/** Props do componente nativo MediaPipePoseView */
export interface MediaPipePoseViewProps extends ViewProps {
  cameraFacing?: 'front' | 'back';
  isActive?: boolean;
  modelComplexity?: 0 | 1 | 2;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
  onPoseDetected?: (event: { nativeEvent: PoseDetectedEvent }) => void;
  onError?: (event: { nativeEvent: PoseErrorEvent }) => void;
  onCameraReady?: () => void;
}

/** Configuração padrão otimizada para VBT/Jump */
export const DEFAULT_CONFIG: MediaPipePoseConfig = {
  modelComplexity: 0,                  // Lite para melhor FPS
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6,
  minPresenceConfidence: 0.6,
  maxNumPoses: 1,
};
