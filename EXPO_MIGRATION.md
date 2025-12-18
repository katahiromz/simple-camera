# Expo Migration Guide

## Overview

This document describes the migration of the simple-camera app from a React+Vite web-only application to a hybrid application supporting both Web/PWA and native mobile platforms (Android/iOS) using Expo framework.

## Migration Summary

### Before Migration
- **Framework**: React 19 + Vite 7
- **Camera Library**: react-webcam (web-only)
- **Zoom/Pan**: react-zoom-pan-pinch
- **Video Recording**: MediaRecorder API
- **Platforms**: Web browsers, PWA

### After Migration
The app now supports **two modes**:

#### 1. Web/PWA Mode (Original)
- Continues to use Vite, react-webcam, and all original features
- No changes to existing functionality
- Commands: `npm run dev`, `npm run build`

#### 2. Expo/React Native Mode (New)
- Uses Expo SDK 54 with expo-camera
- Supports Android and iOS natively
- Commands: `npm start`, `npm run android`, `npm run ios`

## New Files Created

### Configuration Files
- `app.json` - Expo configuration with permissions and platform settings
- `babel.config.js` - Babel configuration for Expo
- `metro.config.js` - Metro bundler configuration
- `expo-entry.js` - Entry point for Expo/React Native

### Application Files
- `App-Native.tsx` - React Native version of the App component
- `src/components/SimpleCamera-Native.tsx` - Native camera implementation using expo-camera

### Updated Files
- `package.json` - Added Expo dependencies and scripts
- `.gitignore` - Added Expo build artifacts
- `eslint.config.js` - Excluded CommonJS config files
- `README.md` - Documented both versions
- `public/locales/en/translation.json` - Added native UI translations
- `public/locales/ja/translation.json` - Added native UI translations

## Key Features of Expo Version

### Camera Functionality
- Photo capture using expo-camera's `takePictureAsync()`
- Video recording using expo-camera's `recordAsync()`
- Front/back camera switching
- Microphone enable/disable
- Automatic saving to device gallery via expo-media-library

### Zoom Feature
- Pinch-to-zoom gesture using react-native-gesture-handler
- Expo-camera native zoom (0-1 range)
- Smooth gesture tracking with base zoom reference

### Permissions
- Camera permission (for taking photos/videos)
- Microphone permission (for recording audio with videos)
- Media library permission (for saving to gallery)
- Proper permission request flow with UI feedback

### Platform Support
- **Android**: Full support with proper permissions
- **iOS**: Full support with Info.plist configurations
- **Web**: Can run via Metro bundler (expo start --web)

## Development Workflow

### Starting Development

#### For Web/PWA Development:
```bash
npm run dev
```

#### For Expo Development:
```bash
npm start
# Then choose:
# - Press 'a' for Android
# - Press 'i' for iOS (macOS only)
# - Press 'w' for Web
```

### Building for Production

#### Web/PWA:
```bash
npm run build
```

#### Native Apps:
```bash
# Development builds
npx expo run:android
npx expo run:ios

# Production builds (requires Expo account)
eas build --platform android
eas build --platform ios
```

### Testing on Physical Devices

1. Install Expo Go app on your device
2. Run `npm start`
3. Scan the QR code with your device
4. App will load in Expo Go

## Important Notes

### Limitations
- **Pause/Resume Recording**: Not supported in the current Expo implementation (expo-camera doesn't have native pause/resume)
- **Image Processing Filters**: Not implemented in the native version (would require React Native compatible image processing library)
- **Pan Gesture**: Not implemented in the native version (only zoom is supported)

### Differences from Web Version

| Feature | Web/PWA Version | Expo/Native Version |
|---------|----------------|---------------------|
| Camera Library | react-webcam | expo-camera |
| Zoom | 1x-4x with pan | 0-1 (native zoom only) |
| Image Filters | Yes (CSS filters) | No |
| Recording Pause/Resume | Yes | No |
| Gallery Integration | Download to device | expo-media-library |
| Platforms | Browsers, PWA | Android, iOS, Web |

## Dependencies

### Expo-Specific Dependencies
- `expo@^54.0.29` - Core Expo SDK
- `expo-camera@^17.0.10` - Camera functionality
- `expo-media-library@^18.2.1` - Gallery integration
- `expo-av@^16.0.8` - Audio playback
- `react-native-gesture-handler@^2.29.1` - Gesture recognition
- `react-native-reanimated@^4.2.0` - Animations (required by gesture-handler)

### Shared Dependencies
- `react@^19.2.0` - React framework
- `i18next@^25.7.2` - Internationalization
- `react-i18next@^16.5.0` - React i18n bindings

## Security

### Permission Descriptions

#### Android (app.json)
```json
"permissions": [
  "CAMERA",
  "RECORD_AUDIO",
  "READ_EXTERNAL_STORAGE",
  "WRITE_EXTERNAL_STORAGE",
  "READ_MEDIA_IMAGES",
  "READ_MEDIA_VIDEO"
]
```

#### iOS (app.json infoPlist)
- `NSCameraUsageDescription` - Camera access for photos/videos
- `NSMicrophoneUsageDescription` - Microphone access for audio recording
- `NSPhotoLibraryUsageDescription` - Photo library read access
- `NSPhotoLibraryAddUsageDescription` - Photo library write access

### Security Checks
- ✅ No vulnerabilities in dependencies (checked via gh-advisory-database)
- ✅ No security alerts (checked via CodeQL)
- ✅ Proper permission handling in code
- ✅ User consent required for all sensitive operations

## Future Enhancements

### Potential Improvements
1. Add image processing filters to native version using react-native-image-filter-kit
2. Implement pan gesture with zoom in native version
3. Add pause/resume capability with custom video recording logic
4. Create unified component that works across both web and native
5. Add Expo EAS Build configuration for easier production builds
6. Implement in-app gallery viewer
7. Add photo editing capabilities
8. Implement burst mode and timer

## Troubleshooting

### Common Issues

#### "Module not found" errors
```bash
rm -rf node_modules package-lock.json
npm install
```

#### Metro bundler cache issues
```bash
npx expo start -c
```

#### Android build errors
```bash
cd android
./gradlew clean
cd ..
npx expo run:android
```

#### Permission errors on device
- Check app permissions in device settings
- Uninstall and reinstall the app
- Ensure permissions are properly configured in app.json

## Conclusion

The migration to Expo provides native mobile app capabilities while maintaining the original web/PWA functionality. Both versions coexist in the same repository and can be developed independently.

The Expo version provides a foundation for building native mobile features, while the web version continues to offer advanced features like image processing filters and recording pause/resume.
