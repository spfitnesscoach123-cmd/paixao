/**
 * mediapipe-pose — Entry point do módulo
 *
 * Exporta a view nativa, tipos e flag de disponibilidade.
 * Usado por MediaPipeCamera.tsx para substituir o stub.
 *
 * Compativel com Fabric (New Architecture) via expo-modules-core.
 */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

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
 * Usa requireOptionalNativeModule (compativel com Fabric/New Architecture).
 * false na web, true em iOS/Android após EAS build com o módulo linkado.
 */
export const NATIVE_POSE_AVAILABLE: boolean =
  Platform.OS !== 'web' &&
  requireOptionalNativeModule('MediaPipePose') != null;
