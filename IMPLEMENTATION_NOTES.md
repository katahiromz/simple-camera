# FFmpeg.wasm Implementation Notes

## Overview

This document describes the implementation of FFmpeg.wasm for video recording in the Simple Camera application, replacing the previous MediaRecorder API implementation.

## Motivation

The MediaRecorder API, while widely supported, has compatibility and performance issues on certain Android devices. By replacing it with FFmpeg.wasm, we achieve:

1. **Better Android Compatibility**: FFmpeg.wasm runs in WebAssembly and provides consistent behavior across devices
2. **Consistent Output Format**: All videos are encoded to MP4 format with H.264 video codec and AAC audio codec
3. **Better Control**: More control over encoding parameters like bitrate, framerate, and quality
4. **Future Extensibility**: Easier to add video filters and effects in the future

## Architecture

### Components

#### 1. FFmpegRecorder Class (`src/components/ffmpegRecorder.ts`)

A self-contained class that handles all FFmpeg.wasm operations:

- **Initialization**: Loads FFmpeg.wasm core from CDN (with fallback)
- **Frame Capture**: Captures frames from HTML Canvas at specified FPS
- **Audio Recording**: Uses MediaRecorder to capture audio separately (WebM format)
- **Video Encoding**: Combines frames and audio using FFmpeg to create MP4 output

Key methods:
- `load()`: Loads FFmpeg.wasm core files
- `startRecording()`: Begins capturing frames and audio
- `stopRecording()`: Stops capture and encodes final video
- `cancelRecording()`: Aborts recording without encoding

#### 2. AdvancedCamera Integration (`src/components/AdvancedCamera.tsx`)

Modified to use FFmpegRecorder instead of MediaRecorder:

- Initializes FFmpegRecorder on component mount
- Passes canvas element and audio stream to FFmpegRecorder
- Handles encoding completion and file download/save
- Maintains backward compatibility with all existing features (zoom, pan, effects, etc.)

### Recording Flow

```
1. User clicks record button
   ↓
2. FFmpegRecorder.startRecording() is called
   ↓
3. Start capturing:
   - Video frames from canvas (JPEG) at 12 FPS
   - Audio from microphone (WebM/Opus) at 48kHz
   ↓
4. User clicks stop button
   ↓
5. FFmpegRecorder.stopRecording() is called
   ↓
6. Encoding process:
   - Write all frames to FFmpeg filesystem (frame00000.jpg, frame00001.jpg, ...)
   - Write audio file to FFmpeg filesystem (audio.webm)
   - Run FFmpeg command to encode MP4:
     ffmpeg -framerate 12 -pattern_type glob -i "frame*.jpg" -i audio.webm \
            -c:v libx264 -preset ultrafast -pix_fmt yuv420p -b:v 2500k \
            -c:a aac -b:a 128k -shortest output.mp4
   ↓
7. Read output.mp4 from FFmpeg filesystem
   ↓
8. Create Blob and trigger download/save
   ↓
9. Cleanup FFmpeg filesystem
```

## Technical Details

### FFmpeg.wasm Loading

FFmpeg.wasm requires loading core files (~30MB) from a CDN. We implement:

1. **Primary CDN**: unpkg.com
2. **Fallback CDN**: cdn.jsdelivr.net
3. **Error Handling**: Graceful degradation if FFmpeg fails to load

The core files are loaded once and cached by the browser.

### Frame Capture

Frames are captured using `canvas.toBlob()` at 12 FPS:

- **Format**: JPEG with 90% quality
- **Timing**: Uses `setInterval` for consistent capture rate
- **Storage**: Frames are stored in memory as Blobs until encoding

### Audio Capture

Audio is captured separately using MediaRecorder:

- **Format**: WebM with Opus codec (widely supported)
- **Settings**: Echo cancellation and noise suppression enabled
- **Chunk Interval**: Audio data collected every 100ms
- **Synchronization**: FFmpeg `-shortest` flag ensures audio/video sync

### Video Encoding

FFmpeg encodes the final video with:

- **Video Codec**: H.264 (libx264) with yuv420p pixel format
- **Audio Codec**: AAC at 128 kbps
- **Preset**: ultrafast (prioritizes speed over file size)
- **Video Bitrate**: 2500 kbps
- **Synchronization**: `-shortest` flag ends video when shortest stream ends

### Memory Management

- Frames are stored in memory during recording
- FFmpeg filesystem is cleaned up after encoding
- Audio stream tracks are stopped after recording

## Configuration

### Recording Parameters

Configurable in FFmpegRecorder:

```typescript
{
  fps: 12,                    // Frames per second
  videoBitrate: '2500k',      // Video bitrate
  audioBitrate: '128k'        // Audio bitrate
}
```

### CDN Configuration

Edit `ffmpegRecorder.ts` to change CDN URLs:

```typescript
const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
const altBaseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
```

## Browser Compatibility

### Requirements

- **SharedArrayBuffer Support**: Required by FFmpeg.wasm
- **WebAssembly**: Required by FFmpeg.wasm
- **HTTPS or localhost**: Required for SharedArrayBuffer
- **Modern Browser**: Chrome 67+, Firefox 79+, Safari 15.2+, Edge 79+

### Known Limitations

1. **Initial Load Time**: First use requires downloading ~30MB of FFmpeg core files
2. **Memory Usage**: Recording stores frames in memory; longer recordings use more RAM
3. **Encoding Time**: Encoding happens after recording stops and may take several seconds
4. **Mobile Performance**: Encoding may be slower on mobile devices

## Testing

### Automated Tests

Run the integration test script:

```bash
./test-ffmpeg-integration.sh
```

This verifies:
- Build succeeds
- Linter passes
- FFmpeg dependencies are installed
- FFmpegRecorder module exists
- AdvancedCamera integration is correct
- MediaRecorder references are removed

### Manual Testing

1. **Start Development Server**:
   ```bash
   npm run dev
   ```

2. **Open in Browser**:
   - Navigate to `http://localhost:5173/camera/`
   - Grant camera and microphone permissions

3. **Test Scenarios**:

   #### Photo Capture
   - Click camera icon
   - Verify photo downloads/saves
   - Test with different zoom levels
   - Test with different pan positions

   #### Video Recording (Without Audio)
   - Toggle microphone off
   - Click video icon to start recording
   - Record for 5-10 seconds
   - Click video icon to stop
   - Wait for encoding to complete
   - Verify video downloads/saves
   - Verify video plays correctly
   - Verify video duration matches recording time

   #### Video Recording (With Audio)
   - Toggle microphone on
   - Click video icon to start recording
   - Speak or make noise
   - Record for 5-10 seconds
   - Click video icon to stop
   - Wait for encoding to complete
   - Verify video downloads/saves
   - Verify video plays correctly
   - Verify audio is present and synchronized with video

   #### Zoom and Pan During Recording
   - Start recording
   - Zoom in/out during recording
   - Pan around during recording
   - Stop recording
   - Verify zoom/pan effects are captured in video

   #### Camera Switching
   - Test switching between front/back cameras
   - Verify camera switch works before recording
   - Verify camera switch is disabled during recording

### Mobile Testing

Test on actual Android devices:

1. Build for production: `npm run build`
2. Deploy to a test server or use ngrok
3. Access from Android device
4. Test all scenarios above
5. Verify performance is acceptable
6. Check memory usage during long recordings

## Troubleshooting

### FFmpeg Fails to Load

**Symptoms**: "Failed to load FFmpeg" error on startup

**Causes**:
- Network connection issues
- CDN blocked by firewall/ad blocker
- SharedArrayBuffer not available

**Solutions**:
1. Check browser console for detailed error
2. Disable ad blockers
3. Ensure site is served over HTTPS or localhost
4. Check browser compatibility

### Video Recording Fails to Start

**Symptoms**: Recording button does nothing or shows error

**Causes**:
- FFmpeg not loaded
- Canvas not ready
- Microphone permission denied

**Solutions**:
1. Check browser console for errors
2. Wait for camera to initialize fully
3. Grant microphone permission if audio is enabled
4. Try disabling microphone and recording video-only

### Encoding Takes Too Long

**Symptoms**: Long wait after stopping recording

**Causes**:
- Long recording duration
- High resolution
- Low-end device

**Solutions**:
1. Reduce recording duration
2. Recording automatically captures at 12 FPS (already optimized)
3. Consider reducing video bitrate in `ffmpegRecorder.ts`

### Audio Not Synchronized

**Symptoms**: Audio and video are out of sync

**Causes**:
- Frame capture timing issues
- Audio buffer delays

**Solutions**:
1. Ensure stable frame rate during recording
2. FFmpeg `-shortest` flag should handle this automatically
3. Report issue with detailed device/browser information

## Future Improvements

Potential enhancements for future versions:

1. **Progressive Encoding**: Encode video chunks progressively instead of all at once
2. **Custom Presets**: Allow users to choose quality vs. file size presets
3. **Video Filters**: Add real-time video filters using FFmpeg filters
4. **Format Options**: Support additional output formats (WebM, etc.)
5. **Streaming**: Support live streaming to servers
6. **Background Recording**: Use Web Workers for encoding to avoid blocking UI
7. **Thumbnail Generation**: Generate video thumbnails during encoding

## Security Considerations

### Code Review

- All code has been reviewed and passed linting
- No security vulnerabilities found in CodeQL scan
- No vulnerabilities found in dependency scan

### Dependencies

- `@ffmpeg/ffmpeg@0.12.15`: No known vulnerabilities
- `@ffmpeg/util@0.12.2`: No known vulnerabilities

### Best Practices

- FFmpeg core files loaded from trusted CDNs
- No user input passed directly to FFmpeg commands
- Temporary files cleaned up after encoding
- Audio/video streams properly stopped after recording

## Maintenance

### Updating FFmpeg.wasm

To update FFmpeg.wasm to a newer version:

1. Update package versions in `package.json`:
   ```json
   "@ffmpeg/ffmpeg": "^0.12.x",
   "@ffmpeg/util": "^0.12.x"
   ```

2. Update CDN URLs in `ffmpegRecorder.ts` if core version changed:
   ```typescript
   const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.x/dist/esm';
   ```

3. Test thoroughly with the manual test scenarios

4. Update this document with any breaking changes

## References

- [FFmpeg.wasm Documentation](https://ffmpegwasm.netlify.app/)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
