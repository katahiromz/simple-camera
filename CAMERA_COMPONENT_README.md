# CameraComponent - react-webcam Integration

A reusable, feature-rich camera component built with `react-webcam` for the simple-camera project.

## Overview

The `CameraComponent` provides a clean, modern interface for camera functionality using the popular `react-webcam` library. It's designed to be a simpler alternative to the advanced `AdvancedCamera` component, focusing on ease of use and reusability.

## Features

✅ **Camera Switching**: Toggle between front and back cameras  
✅ **Photo Capture**: High-quality photo capture with configurable quality  
✅ **Resolution Control**: Switch between 720p, 480p, and 360p  
✅ **TypeScript Support**: Full type definitions and interfaces  
✅ **Responsive Design**: Works seamlessly on desktop, tablet, and mobile  
✅ **Keyboard Shortcuts**: Accessible keyboard controls  
✅ **Error Handling**: Graceful error handling with user feedback  
✅ **i18n Ready**: Integrated with the project's translation system  
✅ **Customizable**: Extensive props for configuration  

## Installation

The component uses `react-webcam` which is already installed in this project:

```bash
npm install react-webcam
npm install --save-dev @types/react-webcam
```

## Basic Usage

```tsx
import CameraComponent from './components/CameraComponent';

function App() {
  const handleCapture = (imageSrc: string) => {
    console.log('Photo captured:', imageSrc);
    // Do something with the captured image
  };

  return (
    <CameraComponent
      onCapture={handleCapture}
      initialFacingMode="environment"
      initialResolution="720p"
    />
  );
}
```

## Props API

### CameraComponentProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `showCaptureButton` | `boolean` | `true` | Show/hide the photo capture button |
| `showSwitchButton` | `boolean` | `true` | Show/hide the camera switch button |
| `showResolutionButton` | `boolean` | `true` | Show/hide the resolution toggle button |
| `initialFacingMode` | `'user' \| 'environment'` | `'environment'` | Initial camera facing mode |
| `initialResolution` | `'720p' \| '480p' \| '360p'` | `'720p'` | Initial video resolution |
| `onCapture` | `(imageSrc: string) => void` | `undefined` | Callback when photo is captured |
| `onReady` | `() => void` | `undefined` | Callback when camera is ready |
| `onError` | `(error: string \| DOMException) => void` | `undefined` | Callback when error occurs |
| `className` | `string` | `''` | Custom CSS class name |
| `photoQuality` | `number` | `0.92` | JPEG quality (0-1) |
| `mirrored` | `boolean` | `true` | Mirror front camera view |

## Resolution Options

The component supports three resolution presets:

- **720p**: 1280×720 (High quality, default)
- **480p**: 640×480 (Standard quality)
- **360p**: 640×360 (Low bandwidth)

## Keyboard Shortcuts

- **Space/Enter**: Capture photo
- **S**: Switch camera (front/back)
- **R**: Toggle resolution

## Advanced Examples

### Custom Styling

```tsx
<CameraComponent
  className="my-custom-camera"
  onCapture={handleCapture}
/>
```

```css
.my-custom-camera {
  border: 2px solid #667eea;
  border-radius: 20px;
}
```

### Auto-download Photos

If no `onCapture` callback is provided, photos are automatically downloaded:

```tsx
<CameraComponent
  // No onCapture prop - photos will auto-download
  initialFacingMode="user"
/>
```

### Minimal UI

```tsx
<CameraComponent
  showSwitchButton={false}
  showResolutionButton={false}
  onCapture={handleCapture}
/>
```

### Front Camera with High Quality

```tsx
<CameraComponent
  initialFacingMode="user"
  initialResolution="720p"
  photoQuality={0.95}
  mirrored={true}
  onCapture={handleCapture}
/>
```

### With Error Handling

```tsx
<CameraComponent
  onCapture={(imageSrc) => {
    console.log('Captured:', imageSrc);
    // Save to gallery or upload to server
  }}
  onReady={() => {
    console.log('Camera initialized successfully');
  }}
  onError={(error) => {
    console.error('Camera error:', error);
    // Show error notification to user
  }}
/>
```

## Demo Application

A complete demo application is provided in `SimpleCameraDemo.tsx`:

```tsx
import SimpleCameraDemo from './components/SimpleCameraDemo';

function App() {
  return <SimpleCameraDemo />;
}
```

The demo showcases:
- Photo capture with preview
- Image download functionality
- Capture counter
- Responsive design
- All component features

## Integration with Existing App

The new `CameraComponent` can be used alongside the existing `AdvancedCamera`:

```tsx
import { useState } from 'react';
import AdvancedCamera from './components/AdvancedCamera';
import CameraComponent from './components/CameraComponent';

function App() {
  const [useSimpleCamera, setUseSimpleCamera] = useState(false);

  return (
    <div>
      <button onClick={() => setUseSimpleCamera(!useSimpleCamera)}>
        Toggle Camera Type
      </button>
      
      {useSimpleCamera ? (
        <CameraComponent />
      ) : (
        <AdvancedCamera />
      )}
    </div>
  );
}
```

## Browser Compatibility

The component works in all modern browsers that support:
- getUserMedia API
- Canvas API
- React 19+

Tested on:
- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Chrome/Safari on iOS 14+
- ✅ Chrome on Android 10+

## Performance Considerations

1. **Resolution Selection**: Lower resolutions (360p, 480p) use less bandwidth and battery
2. **Mirroring**: Disable mirroring for back camera to improve performance
3. **Photo Quality**: Lower quality (0.8-0.85) reduces file size

## Comparison with AdvancedCamera

| Feature | CameraComponent | AdvancedCamera |
|---------|-----------------|----------------|
| Library | react-webcam | Native Web APIs |
| Setup Complexity | Simple | Complex |
| Zoom/Pan | ❌ | ✅ |
| Image Processing | ❌ | ✅ |
| Video Recording | ❌ | ✅ |
| Photo Capture | ✅ | ✅ |
| Camera Switch | ✅ | ✅ |
| Resolution Toggle | ✅ | ✅ |
| Code Size | Small | Large |
| Best For | Simple apps | Advanced features |

## TypeScript Types

```typescript
import { CameraResolution, CameraComponentProps } from './components/CameraComponent';

// Resolution type
type CameraResolution = '720p' | '480p' | '360p';

// Component props interface
interface CameraComponentProps {
  showCaptureButton?: boolean;
  showSwitchButton?: boolean;
  showResolutionButton?: boolean;
  initialFacingMode?: 'user' | 'environment';
  initialResolution?: CameraResolution;
  onCapture?: (imageSrc: string) => void;
  onReady?: () => void;
  onError?: (error: string | DOMException) => void;
  className?: string;
  photoQuality?: number;
  mirrored?: boolean;
}
```

## Testing

The component has been tested for:
- ✅ Camera initialization
- ✅ Front/back switching
- ✅ Photo capture
- ✅ Resolution changes
- ✅ Error handling
- ✅ Keyboard shortcuts
- ✅ Responsive design

## Troubleshooting

### Camera not starting
- Check browser permissions for camera access
- Ensure HTTPS connection (required for camera API)
- Verify camera is not in use by another application

### Black screen
- Check if correct facingMode is supported
- Try switching to different resolution
- Check browser console for errors

### Photos not capturing
- Ensure camera is ready (check `isReady` state)
- Verify `onCapture` callback is properly set
- Check browser console for errors

## License

MIT - Same as the parent project

## Credits

Built with:
- [react-webcam](https://www.npmjs.com/package/react-webcam) by mozmorris
- [lucide-react](https://lucide.dev/) for icons
- Part of the [simple-camera](https://github.com/katahiromz/simple-camera) project by katahiromz
