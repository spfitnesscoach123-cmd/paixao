# VBT Camera - Frame Processor Fix Guide

## Problem Description

The VBT Camera displays:
- "BLOCKED BY: Waiting for first frame"
- Confidence: 0.00
- Human Presence: N/A
- Tracking Point: N/A

This means the `onLandmark` callback from `@thinksys/react-native-mediapipe` is NOT being called.

## Root Cause Analysis

The `@thinksys/react-native-mediapipe` library uses **native code** to process camera frames through MediaPipe. This native module:

1. **Does NOT work in Expo Go** - Expo Go doesn't include native MediaPipe bindings
2. **Requires a Development Build or EAS Build** - Native code must be compiled
3. **Does NOT work with Remote JS Debugger** - Frame processing happens in native threads

## Solution Steps

### STEP 1: Verify babel.config.js

The file `/app/frontend/babel.config.js` must contain:

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // react-native-reanimated/plugin MUST be listed LAST
      'react-native-reanimated/plugin',
    ],
  };
};
```

**Status**: ✅ CREATED

### STEP 2: Build with EAS or Dev Client

**You MUST use one of these options:**

#### Option A: EAS Build (Recommended)
```bash
# For iOS
eas build --profile development --platform ios

# For Android
eas build --profile development --platform android
```

#### Option B: Local Development Build
```bash
# Clean prebuild
npx expo prebuild --clean

# For iOS
npx expo run:ios

# For Android
npx expo run:android
```

### STEP 3: Verify Camera Permissions

Ensure `app.json` has proper permissions:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSCameraUsageDescription": "Precisamos acessar a câmera para capturar dados do VBT e detecção de pose."
      }
    },
    "android": {
      "permissions": [
        "android.permission.CAMERA"
      ]
    }
  }
}
```

**Status**: ✅ Already configured in app.json

### STEP 4: Disable Remote JS Debugger

On the device:
1. Shake the device or press `Cmd+D` (iOS) / `Cmd+M` (Android)
2. Select "Stop Remote JS Debugging" if enabled
3. Frame processing requires native threads, not JS debugger

### STEP 5: Clear Metro Cache

```bash
npx expo start --clear
```

## Diagnostic Tools Added

### Console Logging

The app now logs frame reception status every 5 seconds:

```
[VBT_CAMERA] 📊 Frame Reception Rate: 25.3 FPS (127 frames in 5.0s)
```

If you see:
```
[VBT_CAMERA] ⚠️ NO FRAMES RECEIVED!
```

Then MediaPipe is not working.

### Diagnostic Overlay

The VBT Diagnostic Overlay now shows:

- **MODULE**: MediaPipe load status (✓ LOADED / ✗ NOT AVAILABLE)
- **FRAMES**: Frame count (✓ X received / ✗ NO FRAMES)
- **PLATFORM**: Current platform (IOS/ANDROID/WEB)

If `FRAMES: ✗ NO FRAMES`, the overlay shows possible causes.

## Expected Result After Fix

Console should show:
```
[VBT_CAMERA] ✅ FIRST FRAME RECEIVED! MediaPipe is working.
[VBT_CAMERA] 📊 Frame Reception Rate: 25.0 FPS (125 frames in 5.0s)
```

Diagnostic overlay should show:
- MODULE: ✓ LOADED
- FRAMES: ✓ X received
- State changes from "noHuman" to "ready" to "executing"

## Architecture Notes

### Library Used: @thinksys/react-native-mediapipe

This library provides:
- `RNMediapipe` component with `onLandmark` callback
- `switchCamera()` function for camera toggle

**Important**: This is NOT the same as `react-native-vision-camera` with `frameProcessor`. 
The `@thinksys` library handles frame processing internally.

### Component Structure

```
vbt-camera.tsx
├── RNMediapipe (native, when Platform.OS !== 'web')
│   └── onLandmark callback → handleMediapipeLandmark
│       └── convertMediapipeLandmarks → VBTPoseData
│           └── processPose → VBT Pipeline
│
└── CameraView (web fallback, expo-camera)
    └── Simulation mode only
```

## Files Modified

1. `/app/frontend/babel.config.js` - Created
2. `/app/frontend/app/athlete/[id]/vbt-camera.tsx` - Added frame logging
3. `/app/frontend/components/vbt/VBTDiagnosticOverlay.tsx` - Added MediaPipe status display

## Quick Checklist

- [ ] Using Development Build (NOT Expo Go)
- [ ] babel.config.js has reanimated plugin LAST
- [ ] Camera permission granted
- [ ] Remote JS Debugger disabled
- [ ] Metro cache cleared
- [ ] App rebuilt after native code changes
