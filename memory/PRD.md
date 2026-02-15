# LoadManager Pro VBT - Product Requirements Document

## Original Problem Statement
Build a fully functional VBT (Velocity-Based Training) Camera feature within a React Native application and prepare it for TestFlight release.

## Core Requirements
1. **VBT Camera Feature**: Camera state transitions, Coach Marker for manual keypoint selection, one-time interactive tutorial
2. **Real Pose Detection**: MediaPipe for real-time pose detection on iOS/Android
3. **Build Integrity**: No location-related APIs (avoid Apple ITMS-90683 warning)
4. **Build Configuration**: New Architecture enabled, JSC JavaScript engine

## What's Been Implemented ✅
- [x] VBT Camera with Coach Marker and Tutorial features (tested and validated)
- [x] Location API audit completed - project is clean
- [x] Build configuration fixed (jsc engine in Podfile.properties.json)
- [x] @react-native-async-storage/async-storage installed
- [x] Git repository initialized in /app/frontend
- [x] EAS project created and linked: `f4714b6a-260d-41fa-9c24-a4e0e6f28b6d`
- [x] eas.json configured with appVersionSource: "local"
- [x] app.json updated with projectId
- [x] **5-STAGE PROGRESSIVE VALIDATION PIPELINE** (December 2025)
  - Eliminated circular dependency causing infinite stabilization
  - Stages: FRAME_USABLE → FRAME_STABLE → FRAME_TRACKABLE → FRAME_VALID → FRAME_COUNTABLE
  - State Machine: INITIALIZING → STABILIZING → READY → TRACKING → RECORDING
  - Stabilization now INDEPENDENT of tracking point validation
- [x] **Diagnostic Instrumentation** - Real-time debugging overlay
- [x] **RecordingController Refactor** (December 2025)
  - Created global `RecordingController` singleton as SINGLE SOURCE OF TRUTH
  - Removed `setRecordingActive()` method from `ProgressiveStateMachine`
  - State machine now reads directly from `recordingController.isActive()`
  - Automatic transition TRACKING → RECORDING when recording is active
  - Added `[VBT_STATE_CHECK]` diagnostic logging
  - All 34 unit tests passing
- [x] **Camera Selection Control** (December 2025)
  - Added explicit `cameraFacing` state control (`'front' | 'back'`)
  - Default camera is always `'back'` on mount
  - Toggle button in header during camera phases
  - Uses native `switchCamera()` from `@thinksys/react-native-mediapipe`
  - Synchronized state + native call in single atomic operation
- [x] **Frame Processor Debugging** (December 2025) ✨ NEW
  - Created `babel.config.js` with reanimated plugin configured LAST
  - Added frame reception rate logging (every 5 seconds)
  - Added first frame detection with `[VBT_CAMERA] ✅ FIRST FRAME RECEIVED!`
  - Enhanced `VBTDiagnosticOverlay` with MediaPipe status section
  - Created `/app/memory/VBT_FRAME_PROCESSOR_FIX.md` guide

## Architecture Documentation
- `/app/frontend/docs/VBT_PROGRESSIVE_VALIDATION_ARCHITECTURE.md` - New 5-stage pipeline
- `/app/frontend/docs/VBT_DIAGNOSTIC_INSTRUMENTATION.md` - Debugging guide
- `/app/frontend/services/vbt/recordingController.ts` - Recording state singleton
- `/app/memory/VBT_FRAME_PROCESSOR_FIX.md` - Frame processor debugging guide ✨ NEW

## Key Files Modified (Frame Processor Fix)
- `babel.config.js` - NEW: Created with reanimated plugin
- `app/athlete/[id]/vbt-camera.tsx` - Added frame logging, fixed toggleCamera sync
- `components/vbt/VBTDiagnosticOverlay.tsx` - Added MediaPipe status display

## Current Blocker 🔴
**"Waiting for first frame" issue - Requires Development Build**
- The `@thinksys/react-native-mediapipe` library uses native code
- **Does NOT work in Expo Go** - requires Development Build or EAS Build
- User must rebuild the app after native code changes

### Steps to Fix
1. Run `npx expo prebuild --clean`
2. Run `npx expo run:ios` or `eas build --profile development --platform ios`
3. Disable Remote JS Debugger on device
4. Verify camera permissions

## Pending Issues (P0-P3)
1. **P0**: Rebuild app with EAS/Dev Build to enable MediaPipe frames ⚠️ CRITICAL
2. **P1**: Verify diagnostic overlay works with new frame props
3. **P1**: Internationalization of `ScientificAnalysisTab.tsx`
4. **P1**: Internationalization of "Avaliações" page
5. **P2**: Test `gps_import` pipeline with `identity_resolver`
6. **P3**: Back button icon not rendering on web

## Future Tasks
- Integrate identity resolution into `force_import` and `wellness_import`
- UI for manual resolution of ambiguous athlete names
- Feature for merging duplicate athlete profiles

## Tech Stack
- React Native with Expo
- EAS Build for iOS/Android
- react-native-vision-camera + @thinksys/react-native-mediapipe
- @react-native-async-storage/async-storage

## Project Links
- EAS Project: https://expo.dev/accounts/paixaofit/projects/loadmanager-pro-vbt
- Project ID: f4714b6a-260d-41fa-9c24-a4e0e6f28b6d

## Last Updated
December 2025
