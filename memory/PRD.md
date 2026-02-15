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
- [x] **RecordingController Refactor** (December 2025) ✨ NEW
  - Created global `RecordingController` singleton as SINGLE SOURCE OF TRUTH
  - Removed `setRecordingActive()` method from `ProgressiveStateMachine`
  - State machine now reads directly from `recordingController.isActive()`
  - Automatic transition TRACKING → RECORDING when recording is active
  - Added `[VBT_STATE_CHECK]` diagnostic logging
  - All 34 unit tests passing

## Architecture Documentation
- `/app/frontend/docs/VBT_PROGRESSIVE_VALIDATION_ARCHITECTURE.md` - New 5-stage pipeline
- `/app/frontend/docs/VBT_DIAGNOSTIC_INSTRUMENTATION.md` - Debugging guide
- `/app/frontend/services/vbt/recordingController.ts` - Recording state singleton

## Key Files Modified (RecordingController Refactor)
- `services/vbt/recordingController.ts` - NEW: Single source of truth for recording state
- `services/vbt/trackingProtection.ts` - Refactored to use recordingController
- `services/vbt/useProtectedBarTracking.ts` - Updated to call recordingController.start()/stop()
- `services/vbt/index.ts` - Export recordingController
- `services/vbt/__tests__/trackingProtection.test.ts` - Added RecordingController tests

## Current Blocker 🔴
**iOS Build requires interactive credential setup**
- EAS Build needs Apple Distribution Certificate + Provisioning Profile
- Credential configuration requires interactive terminal (not available in CI)
- User must run `eas build --platform ios --profile production` on macOS with interactive terminal

## Command Ready to Execute (on user's Mac)
```bash
cd frontend
export EXPO_TOKEN="bzr31V2lay3v8wey672xCPqx-skJ5YbtshEMoJDe"
eas build --platform ios --profile production --clear-cache
```

## Pending Issues (P1-P3)
1. **P1**: Verify diagnostic overlay works with new RecordingController
2. **P1**: Internationalization of `ScientificAnalysisTab.tsx`
3. **P1**: Internationalization of "Avaliações" page
4. **P2**: Test `gps_import` pipeline with `identity_resolver`
5. **P3**: Back button icon not rendering on web

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
