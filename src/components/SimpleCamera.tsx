// SimpleCamera.tsx --- New camera implementation using react-webcam and react-zoom-pan-pinch
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import Webcam from 'react-webcam';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Camera, Mic, MicOff, Video, VideoOff, Square, SwitchCamera, RefreshCw, Pause } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './SimpleCamera.css';

// Image processing
import ImageProcessingControls from './ImageProcessingControls';
import {
  ImageProcessingParams,
  getDefaultImageProcessingParams,
  loadImageProcessingParams,
  applyCSSFilters,
  buildCSSFilterString,
} from './ImageProcessingUtils';

// Utils
import {
  generateFileName,
  formatTime,
  isAndroidWebView,
  saveImageToAndroidGallery,
  saveVideoToAndroidGallery,
} from './utils';

// Base URL
const BASE_URL = import.meta.env.BASE_URL;

// Constants
const ICON_SIZE = 32;
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Camera status
type CameraStatus = 'initializing' | 'ready' | 'noPermission' | 'noDevice';
type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopping';

interface SimpleCameraProps {
  audio?: boolean;
  showTakePhoto?: boolean;
  showMic?: boolean;
  showRecord?: boolean;
  showControls?: boolean;
  photoQuality?: number;
  soundEffect?: boolean;
  showStatus?: boolean;
  showTimer?: boolean;
  shutterSoundUrl?: string | null;
  videoStartSoundUrl?: string | null;
  videoCompleteSoundUrl?: string | null;
}

const SimpleCamera: React.FC<SimpleCameraProps> = ({
  audio = true,
  showTakePhoto = true,
  showMic = true,
  showRecord = true,
  showControls = true,
  photoQuality = 0.92,
  soundEffect = true,
  showStatus = true,
  showTimer = true,
  shutterSoundUrl = `${BASE_URL}ac-camera-shutter-sound.mp3`,
  videoStartSoundUrl = `${BASE_URL}ac-video-started.mp3`,
  videoCompleteSoundUrl = `${BASE_URL}ac-video-completed.mp3`,
}) => {
  const { t } = useTranslation();

  // Refs
  const webcamRef = useRef<Webcam>(null);
  const transformRef = useRef<{ instance: { transformState: { scale: number; positionX: number; positionY: number } } } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const shutterAudioRef = useRef<HTMLAudioElement | null>(null);
  const videoStartAudioRef = useRef<HTMLAudioElement | null>(null);
  const videoCompleteAudioRef = useRef<HTMLAudioElement | null>(null);

  // State
  const [status, setStatus] = useState<CameraStatus>('initializing');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [micEnabled, setMicEnabled] = useState(audio);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [imageProcessing, setImageProcessing] = useState<ImageProcessingParams>(
    loadImageProcessingParams('SimpleCamera_imageProcessing') || getDefaultImageProcessingParams()
  );

  // Video constraints
  const videoConstraints = {
    facingMode,
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };

  const audioConstraints = micEnabled
    ? {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 48000,
      }
    : false;

  // Initialize audio elements
  useEffect(() => {
    if (soundEffect && shutterSoundUrl) {
      shutterAudioRef.current = new Audio(shutterSoundUrl);
    }
    if (soundEffect && videoStartSoundUrl) {
      videoStartAudioRef.current = new Audio(videoStartSoundUrl);
    }
    if (soundEffect && videoCompleteSoundUrl) {
      videoCompleteAudioRef.current = new Audio(videoCompleteSoundUrl);
    }
  }, [soundEffect, shutterSoundUrl, videoStartSoundUrl, videoCompleteSoundUrl]);

  // Recording timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (recordingStatus === 'recording') {
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else if (recordingStatus === 'idle') {
      setRecordingTime(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [recordingStatus]);

  // Handle camera ready
  const handleUserMedia = useCallback(() => {
    setStatus('ready');
  }, []);

  // Handle camera error
  const handleUserMediaError = useCallback((error: string | DOMException) => {
    console.error('Camera error:', error);
    if (typeof error === 'string' && error.includes('Permission')) {
      setStatus('noPermission');
    } else {
      setStatus('noDevice');
    }
  }, []);

  // Play sound
  const playSound = useCallback((audioRef: React.RefObject<HTMLAudioElement>) => {
    if (soundEffect && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(console.error);
    }
  }, [soundEffect]);

  // Capture photo with zoom, pan, and image processing filters applied
  const capturePhoto = useCallback(() => {
    if (!webcamRef.current || !webcamRef.current.video) return;

    try {
      const video = webcamRef.current.video;
      
      // Get transform state (zoom and pan)
      const transformState = transformRef.current?.instance?.transformState;
      const scale = transformState?.scale || 1;
      const positionX = transformState?.positionX || 0;
      const positionY = transformState?.positionY || 0;

      // Get video dimensions
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      
      // Get display dimensions (viewport)
      const displayWidth = video.clientWidth;
      const displayHeight = video.clientHeight;

      if (videoWidth === 0 || videoHeight === 0) {
        console.error('Video not ready or failed to load. Ensure camera is initialized before capturing.');
        return;
      }

      // Create canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Calculate the video rendering metrics (how video fits in viewport with object-fit: cover)
      const scaleX = displayWidth / videoWidth;
      const scaleY = displayHeight / videoHeight;
      const coverScale = Math.max(scaleX, scaleY);
      
      const renderWidth = videoWidth * coverScale;
      const renderHeight = videoHeight * coverScale;
      const offsetX = (displayWidth - renderWidth) / 2;
      const offsetY = (displayHeight - renderHeight) / 2;

      // Calculate the visible region in the viewport after zoom and pan
      // Coordinate system explanation:
      // 1. Original video coordinates (videoWidth x videoHeight)
      // 2. Rendered video coordinates after object-fit: cover (renderWidth x renderHeight, centered with offsetX, offsetY)
      // 3. Zoomed coordinates after scale transformation (renderWidth * scale x renderHeight * scale)
      // 4. Final display after pan (moved by positionX, positionY)
      //
      // To find what part of the original video is visible in the viewport:
      // - Viewport shows display coordinates (0, 0) to (displayWidth, displayHeight)
      // - After pan, the visible content in zoomed coordinates is at (-positionX, -positionY)
      // - After zoom, the visible content in rendered coordinates is at (-positionX/scale, -positionY/scale)
      // - After cover scaling, the visible content in video coordinates needs to account for the offset
      
      // Step 1: Find the visible region in rendered coordinates (before zoom, after cover scale)
      // The viewport origin (0, 0) maps to (-positionX, -positionY) in zoomed coordinates
      // In pre-zoom (rendered) coordinates, this is (-positionX / scale, -positionY / scale)
      const visibleRenderX = -positionX / scale;
      const visibleRenderY = -positionY / scale;
      const visibleRenderWidth = displayWidth / scale;
      const visibleRenderHeight = displayHeight / scale;
      
      // Step 2: Account for the offset from object-fit: cover
      // The rendered video is centered in the display, so we need to subtract the offset
      // to get coordinates relative to the rendered video's top-left corner
      const renderCropX = visibleRenderX - offsetX;
      const renderCropY = visibleRenderY - offsetY;
      
      // Step 3: Convert from rendered coordinates to original video coordinates
      // The rendered video is scaled by coverScale from the original video
      let videoCropX = renderCropX / coverScale;
      let videoCropY = renderCropY / coverScale;
      let videoCropWidth = visibleRenderWidth / coverScale;
      let videoCropHeight = visibleRenderHeight / coverScale;

      // Clamp to valid video bounds (handle over-panning)
      // If the user panned beyond the content, we clamp to show the edge of the video
      if (videoCropX < 0) {
        videoCropWidth += videoCropX;
        videoCropX = 0;
      }
      if (videoCropY < 0) {
        videoCropHeight += videoCropY;
        videoCropY = 0;
      }
      if (videoCropX + videoCropWidth > videoWidth) {
        videoCropWidth = videoWidth - videoCropX;
      }
      if (videoCropY + videoCropHeight > videoHeight) {
        videoCropHeight = videoHeight - videoCropY;
      }

      // Ensure dimensions are positive (safety check for extreme over-panning)
      videoCropWidth = Math.max(1, videoCropWidth);
      videoCropHeight = Math.max(1, videoCropHeight);
      videoCropX = Math.max(0, Math.min(videoCropX, videoWidth - videoCropWidth));
      videoCropY = Math.max(0, Math.min(videoCropY, videoHeight - videoCropHeight));

      // Set canvas size to the output resolution (use high quality)
      const outputWidth = 1920;
      const outputScale = outputWidth / videoCropWidth;
      const outputHeight = videoCropHeight * outputScale;
      
      canvas.width = outputWidth;
      canvas.height = outputHeight;

      // Apply image processing filters to the canvas context
      // This ensures the captured photo matches the live preview
      applyCSSFilters(ctx, imageProcessing);

      // Draw the cropped and zoomed portion of the video
      ctx.drawImage(
        video,
        videoCropX, videoCropY, videoCropWidth, videoCropHeight,  // source rectangle
        0, 0, outputWidth, outputHeight  // destination rectangle
      );

      // Convert canvas to blob and download/save
      canvas.toBlob((blob) => {
        if (blob) {
          playSound(shutterAudioRef);
          
          const filename = generateFileName('photo-', '.jpg');
          
          // Android WebView環境ではギャラリーに保存
          if (isAndroidWebView()) {
            // BlobをBase64に変換してAndroidのギャラリーに保存
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64data = reader.result as string;
              const success = saveImageToAndroidGallery(base64data, filename, 'image/jpeg');
              if (!success) {
                console.error('Failed to save image to Android gallery');
                // フォールバック: 通常のダウンロード
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                link.click();
                URL.revokeObjectURL(url);
              }
            };
            reader.readAsDataURL(blob);
          } else {
            // 通常のブラウザ環境ではダウンロード
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
          }
        }
      }, 'image/jpeg', photoQuality);

    } catch (error) {
      console.error('Error capturing photo:', error);
    }
  }, [playSound, photoQuality, imageProcessing]);

  // Toggle camera
  const toggleCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  }, []);

  // Toggle mic
  const toggleMic = useCallback(() => {
    setMicEnabled((prev) => !prev);
  }, []);

  // Start recording
  const startRecording = useCallback(() => {
    if (!webcamRef.current || !webcamRef.current.stream) return;

    try {
      recordedChunksRef.current = [];

      // Get video stream from webcam
      const videoStream = webcamRef.current.stream;
      
      // Create a combined stream with video and optionally audio
      let combinedStream: MediaStream;
      
      if (micEnabled && audio) {
        // Get audio stream
        navigator.mediaDevices.getUserMedia({ audio: audioConstraints as MediaTrackConstraints })
          .then((audioStream) => {
            const videoTracks = videoStream.getVideoTracks();
            const audioTracks = audioStream.getAudioTracks();
            
            combinedStream = new MediaStream([...videoTracks, ...audioTracks]);
            
            // Determine the best codec
            const mimeType = getSupportedMimeType();
            
            const options: MediaRecorderOptions = {
              mimeType,
              videoBitsPerSecond: isMobile ? 2500000 : undefined,
              audioBitsPerSecond: 128000,
            };

            mediaRecorderRef.current = new MediaRecorder(combinedStream, options);

            mediaRecorderRef.current.ondataavailable = (event) => {
              if (event.data && event.data.size > 0) {
                recordedChunksRef.current.push(event.data);
              }
            };

            mediaRecorderRef.current.onstop = () => {
              const blob = new Blob(recordedChunksRef.current, { type: mimeType });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = generateFileName('video-', getExtensionFromMimeType(mimeType));
              link.click();
              URL.revokeObjectURL(url);

              playSound(videoCompleteAudioRef);
              setRecordingStatus('idle');
            };

            mediaRecorderRef.current.start(100);
            setRecordingStatus('recording');
            playSound(videoStartAudioRef);
          })
          .catch((error) => {
            console.error('Error getting audio stream:', error);
            // Fallback to video only
            startVideoOnlyRecording(videoStream);
          });
      } else {
        startVideoOnlyRecording(videoStream);
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      setRecordingStatus('idle');
    }
  }, [micEnabled, audio, audioConstraints, playSound]);

  // Helper function to start video-only recording
  const startVideoOnlyRecording = (videoStream: MediaStream) => {
    const mimeType = getSupportedMimeType();
    
    const options: MediaRecorderOptions = {
      mimeType,
      videoBitsPerSecond: isMobile ? 2500000 : undefined,
    };

    mediaRecorderRef.current = new MediaRecorder(videoStream, options);

    mediaRecorderRef.current.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      const filename = generateFileName('video-', getExtensionFromMimeType(mimeType));
      
      // Android WebView環境ではギャラリーに保存
      if (isAndroidWebView()) {
        // BlobをBase64に変換してAndroidのギャラリーに保存
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          const success = saveVideoToAndroidGallery(base64data, filename, mimeType);
          if (!success) {
            console.error('Failed to save video to Android gallery');
            // フォールバック: 通常のダウンロード
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
          }
        };
        reader.readAsDataURL(blob);
      } else {
        // 通常のブラウザ環境ではダウンロード
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      }

      playSound(videoCompleteAudioRef);
      setRecordingStatus('idle');
    };

    mediaRecorderRef.current.start(100);
    setRecordingStatus('recording');
    playSound(videoStartAudioRef);
  };

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recordingStatus === 'recording') {
      setRecordingStatus('stopping');
      mediaRecorderRef.current.stop();
    }
  }, [recordingStatus]);

  // Pause recording
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && recordingStatus === 'recording') {
      mediaRecorderRef.current.pause();
      setRecordingStatus('paused');
    }
  }, [recordingStatus]);

  // Resume recording
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && recordingStatus === 'paused') {
      mediaRecorderRef.current.resume();
      setRecordingStatus('recording');
    }
  }, [recordingStatus]);

  // Get supported mime type
  const getSupportedMimeType = (): string => {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=h264,aac',
      'video/mp4;codecs=avc1,mp4a',
      'video/mp4',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'video/webm';
  };

  // Get file extension from mime type
  const getExtensionFromMimeType = (mimeType: string): string => {
    if (mimeType.includes('webm')) return '.webm';
    if (mimeType.includes('mp4')) return '.mp4';
    return '.webm';
  };

  // Handle image processing change
  const handleImageProcessingChange = useCallback((params: ImageProcessingParams) => {
    setImageProcessing(params);
  }, []);

  // Memoize style objects to prevent unnecessary re-renders
  const wrapperStyle = useMemo(() => ({
    width: '100%',
    height: '100%',
  }), []);

  const contentStyle = useMemo(() => ({
    width: '100%',
    height: '100%',
  }), []);

  const webcamStyle = useMemo(() => ({
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    filter: buildCSSFilterString(imageProcessing),
  }), [imageProcessing]);

  return (
    <div className="simple-camera-container">
      <div className="simple-camera-viewport">
        <TransformWrapper
          ref={transformRef}
          initialScale={1}
          minScale={1}
          maxScale={4}
          centerOnInit
          wheel={{ step: 0.1 }}
          pinch={{ step: 5 }}
          doubleClick={{ disabled: false }}
        >
          <TransformComponent
            wrapperStyle={wrapperStyle}
            contentStyle={contentStyle}
          >
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              screenshotQuality={photoQuality}
              videoConstraints={videoConstraints}
              onUserMedia={handleUserMedia}
              onUserMediaError={handleUserMediaError}
              style={webcamStyle}
            />
          </TransformComponent>
        </TransformWrapper>
      </div>

      {/* Status display */}
      {showStatus && status !== 'ready' && (
        <div className="camera-status-overlay">
          {status === 'initializing' && <p>{t('initializing')}</p>}
          {status === 'noPermission' && <p>{t('noPermission')}</p>}
          {status === 'noDevice' && <p>{t('noDevice')}</p>}
        </div>
      )}

      {/* Recording timer */}
      {showTimer && recordingStatus !== 'idle' && (
        <div className="recording-timer">
          <span className="recording-indicator">●</span>
          {formatTime(recordingTime)}
        </div>
      )}

      {/* Controls */}
      {showControls && status === 'ready' && (
        <div className="camera-controls">
          {/* Image processing controls */}
          <ImageProcessingControls
            params={imageProcessing}
            onChange={handleImageProcessingChange}
            disabled={recordingStatus !== 'idle'}
          />

          {/* Main control buttons */}
          <div className="control-buttons">
            {/* Switch camera button */}
            <button
              className="control-button"
              onClick={toggleCamera}
              title={t('switchCamera')}
              disabled={recordingStatus !== 'idle'}
            >
              <SwitchCamera size={ICON_SIZE} />
            </button>

            {/* Mic toggle button */}
            {showMic && (
              <button
                className={`control-button ${micEnabled ? 'active' : ''}`}
                onClick={toggleMic}
                title={micEnabled ? t('muteMic') : t('unmuteMic')}
                disabled={recordingStatus !== 'idle'}
              >
                {micEnabled ? <Mic size={ICON_SIZE} /> : <MicOff size={ICON_SIZE} />}
              </button>
            )}

            {/* Capture photo button */}
            {showTakePhoto && (
              <button
                className="control-button capture-button"
                onClick={capturePhoto}
                title={t('takePhoto')}
                disabled={recordingStatus !== 'idle'}
              >
                <Camera size={ICON_SIZE * 1.5} />
              </button>
            )}

            {/* Video recording buttons */}
            {showRecord && (
              <>
                {recordingStatus === 'idle' && (
                  <button
                    className="control-button record-button"
                    onClick={startRecording}
                    title={t('startRecording')}
                  >
                    <Video size={ICON_SIZE} />
                  </button>
                )}
                {recordingStatus === 'recording' && (
                  <>
                    <button
                      className="control-button pause-button"
                      onClick={pauseRecording}
                      title={t('pauseRecording')}
                    >
                      <Pause size={ICON_SIZE} />
                    </button>
                    <button
                      className="control-button stop-button"
                      onClick={stopRecording}
                      title={t('stopRecording')}
                    >
                      <Square size={ICON_SIZE} />
                    </button>
                  </>
                )}
                {recordingStatus === 'paused' && (
                  <>
                    <button
                      className="control-button resume-button"
                      onClick={resumeRecording}
                      title={t('resumeRecording')}
                    >
                      <Video size={ICON_SIZE} />
                    </button>
                    <button
                      className="control-button stop-button"
                      onClick={stopRecording}
                      title={t('stopRecording')}
                    >
                      <Square size={ICON_SIZE} />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SimpleCamera;
