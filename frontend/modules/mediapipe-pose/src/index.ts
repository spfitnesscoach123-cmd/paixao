/**
 * mediapipe-pose — Entry point do módulo
 *
 * Exporta a view nativa, tipos e flag de disponibilidade.
 * Usado por MediaPipeCamera.tsx para substituir o stub.
 */

import { Platform, UIManager } from 'react-native';

export { MediaPipePoseView } from './MediaPipePoseView';
export type {
  PoseLandmark,
  PoseDetectedEvent,
  PoseErrorEvent,
  MediaPipePoseConfig,
  MediaPipePoseViewProps,
} from './MediaPipePose.types';
export { DEFAULT_CONFIG } from './MediaPipePose.types';

/**
 * Verifica se o módulo nativo MediaPipePose está disponível na plataforma atual.
 * false na web, true em iOS/Android após EAS build com o módulo linkado.
 */
export const NATIVE_POSE_AVAILABLE: boolean =
  Platform.OS !== 'web' &&
  UIManager.getViewManagerConfig != null &&
  UIManager.getViewManagerConfig('MediaPipePoseView') != null;
