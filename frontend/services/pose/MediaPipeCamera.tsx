/**
 * MediaPipeCamera — Drop-in replacement for @thinksys/react-native-mediapipe
 *
 * Uses react-native-vision-camera + custom frame processor plugin (detectPose)
 * to detect 33 BlazePose landmarks in real time.
 *
 * RETURNS via onLandmark callback:
 *   Array<{ x: number, y: number, z: number, visibility: number }>
 *   Exactly 33 landmarks, normalized 0-1, BlazePose order.
 *
 * ZERO processing beyond raw landmark delivery.
 * The existing convertMediapipeLandmarks in vbt-camera/jump-camera handles Format 1 (direct array).
 */

import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import { StyleSheet, Platform } from 'react-native';

// ─── Conditional imports (native only) ───

let VisionCamera: any = null;
let useFrameProcessorHook: any = null;
let useCameraDeviceHook: any = null;
let useCameraPermissionHook: any = null;
let VisionCameraProxy: any = null;
let VISION_CAMERA_LOADED = false;

if (Platform.OS !== 'web') {
  try {
    const vc = require('react-native-vision-camera');
    VisionCamera = vc.Camera;
    useFrameProcessorHook = vc.useFrameProcessor;
    useCameraDeviceHook = vc.useCameraDevice;
    useCameraPermissionHook = vc.useCameraPermission;
    VisionCameraProxy = vc.VisionCameraProxy;
    VISION_CAMERA_LOADED = !!VisionCamera && !!useFrameProcessorHook;
  } catch (e) {
    console.warn('[MediaPipeCamera] react-native-vision-camera not available:', e);
  }
}

let WorkletsModule: any = null;
if (Platform.OS !== 'web') {
  try {
    WorkletsModule = require('react-native-worklets-core');
  } catch (e) {
    console.warn('[MediaPipeCamera] react-native-worklets-core not available:', e);
  }
}

// ─── Exports ───

/** True when Vision Camera + Worklets are available (native only) */
export const MEDIAPIPE_AVAILABLE: boolean =
  Platform.OS !== 'web' && VISION_CAMERA_LOADED && !!WorkletsModule;

// ─── Props ───

export interface MediaPipeCameraProps {
  /** Style for the camera view */
  style?: any;
  /** Callback with raw landmarks — same signature as RNMediapipe onLandmark */
  onLandmark?: (landmarks: any) => void;
  /** Camera direction */
  cameraType?: 'front' | 'back';
  /** Whether camera is active */
  isActive?: boolean;
  /** Target FPS */
  fps?: number;
  /** Children rendered on top of camera */
  children?: React.ReactNode;
}

// ─── Inner component (only rendered when native modules exist) ───

function MediaPipeCameraInner({
  style,
  onLandmark,
  cameraType = 'back',
  isActive = true,
  fps = 30,
  children,
}: MediaPipeCameraProps) {
  const device = useCameraDeviceHook(cameraType);

  // Stable ref for the onLandmark callback
  const onLandmarkRef = useRef(onLandmark);
  useEffect(() => {
    onLandmarkRef.current = onLandmark;
  }, [onLandmark]);

  // Initialize the detectPose frame processor plugin (once)
  const plugin = useMemo(() => {
    try {
      return VisionCameraProxy?.initFrameProcessorPlugin('detectPose');
    } catch (e) {
      console.warn('[MediaPipeCamera] Failed to init detectPose plugin:', e);
      return null;
    }
  }, []);

  // Bridge worklet → JS thread
  const callOnLandmark = useMemo(() => {
    if (!WorkletsModule?.Worklets?.createRunOnJS) return null;
    return WorkletsModule.Worklets.createRunOnJS((landmarks: any) => {
      onLandmarkRef.current?.(landmarks);
    });
  }, []);

  // Frame processor (runs on camera thread via worklet)
  const frameProcessor = useFrameProcessorHook(
    (frame: any) => {
      'worklet';
      if (!plugin || !callOnLandmark) return;

      const result = plugin.call(frame);
      if (result && Array.isArray(result) && result.length === 33) {
        callOnLandmark(result);
      }
    },
    [plugin, callOnLandmark]
  );

  if (!device) {
    console.warn('[MediaPipeCamera] No camera device found for:', cameraType);
    return null;
  }

  return (
    <>
      <VisionCamera
        style={style || StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        frameProcessor={frameProcessor}
        fps={fps}
        pixelFormat="yuv"
      />
      {children}
    </>
  );
}

// ─── Public component ───

/**
 * MediaPipeCamera
 *
 * Drop-in replacement for <RNMediapipe>.
 * Returns null on web or when native modules aren't available.
 *
 * Usage:
 *   <MediaPipeCamera
 *     style={StyleSheet.absoluteFill}
 *     onLandmark={handleLandmarks}
 *     cameraType="back"
 *     fps={30}
 *   />
 */
export function MediaPipeCamera(props: MediaPipeCameraProps) {
  if (!MEDIAPIPE_AVAILABLE) return null;
  return <MediaPipeCameraInner {...props} />;
}
