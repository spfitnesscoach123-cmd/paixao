/**
 * VBT (Velocity Based Training) Services
 * 
 * This module provides barbell tracking and velocity calculation
 * for VBT assessments using the device camera.
 * 
 * COMPONENTS:
 * - barTracker: Core tracking logic, physics calculations, position processing
 * - useBarTracking: React hook for easy integration with camera screens
 * 
 * INTEGRATION GUIDE FOR NATIVE BUILD:
 * 
 * 1. Install react-native-vision-camera:
 *    yarn add react-native-vision-camera react-native-worklets-core
 * 
 * 2. Add babel plugin to babel.config.js:
 *    plugins: ['react-native-worklets-core/plugin']
 * 
 * 3. Create frame processor with MediaPipe pose detection:
 *    
 *    import { useFrameProcessor } from 'react-native-vision-camera';
 *    import { runOnJS } from 'react-native-reanimated';
 *    
 *    const { processFrame } = useBarTracking({ ... });
 *    
 *    const frameProcessor = useFrameProcessor((frame) => {
 *      'worklet';
 *      // MediaPipe pose detection here
 *      const pose = detectPose(frame);
 *      
 *      // Get wrist/bar position (use landmarks 15/16 for wrists)
 *      if (pose && pose.landmarks) {
 *        const barPosition = {
 *          x: (pose.landmarks[15].x + pose.landmarks[16].x) / 2,
 *          y: (pose.landmarks[15].y + pose.landmarks[16].y) / 2,
 *          confidence: pose.landmarks[15].visibility,
 *          timestamp: Date.now(),
 *        };
 *        runOnJS(processFrame)(barPosition);
 *      }
 *    }, [processFrame]);
 * 
 * 4. For object detection (colored markers on bar):
 *    - Use TensorFlow.js with custom trained model
 *    - Or use color-based tracking with HSV filtering
 */

export * from './barTracker';
export * from './useBarTracking';

// Re-export types
export type {
  BarPosition,
  VelocityData,
  CameraCalibration,
  TrackerConfig,
} from './barTracker';

export type {
  BarTrackingConfig,
  RepData,
  BarTrackingResult,
} from './useBarTracking';
