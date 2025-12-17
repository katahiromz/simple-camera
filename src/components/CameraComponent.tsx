// CameraComponent.tsx --- Reusable camera component using react-webcam
import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Camera, SwitchCamera, Settings } from 'lucide-react';
import './CameraComponent.css';
import { useTranslation } from 'react-i18next';

// Supported resolutions
export type CameraResolution = '720p' | '480p' | '360p';

// Resolution configuration mapping
const RESOLUTION_CONFIG: Record<CameraResolution, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '480p': { width: 640, height: 480 },
  '360p': { width: 640, height: 360 },
};

// Props interface for the CameraComponent
export interface CameraComponentProps {
  // Whether to show the capture button
  showCaptureButton?: boolean;
  // Whether to show the camera switch button
  showSwitchButton?: boolean;
  // Whether to show the resolution toggle button
  showResolutionButton?: boolean;
  // Initial facing mode
  initialFacingMode?: 'user' | 'environment';
  // Initial resolution
  initialResolution?: CameraResolution;
  // Callback when a photo is captured
  onCapture?: (imageSrc: string) => void;
  // Callback when camera is ready
  onReady?: () => void;
  // Callback when an error occurs
  onError?: (error: string | DOMException) => void;
  // Custom CSS class name
  className?: string;
  // Photo quality (0-1)
  photoQuality?: number;
  // Mirror mode for front camera
  mirrored?: boolean;
}

/**
 * CameraComponent - A reusable camera component using react-webcam
 * 
 * Features:
 * - Front/back camera switching
 * - Photo capture functionality
 * - Resolution toggling (720p, 480p, 360p)
 * - TypeScript support with full type definitions
 * - Responsive design
 * - Error handling
 * - i18n support
 */
const CameraComponent: React.FC<CameraComponentProps> = ({
  showCaptureButton = true,
  showSwitchButton = true,
  showResolutionButton = true,
  initialFacingMode = 'environment',
  initialResolution = '720p',
  onCapture,
  onReady,
  onError,
  className = '',
  photoQuality = 0.92,
  mirrored = true,
}) => {
  const { t } = useTranslation();
  const webcamRef = useRef<Webcam>(null);
  
  // State management
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(initialFacingMode);
  const [resolution, setResolution] = useState<CameraResolution>(initialResolution);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // Get video constraints based on current settings
  const getVideoConstraints = useCallback(() => {
    const config = RESOLUTION_CONFIG[resolution];
    return {
      width: config.width,
      height: config.height,
      facingMode: facingMode,
    };
  }, [facingMode, resolution]);

  // Handle camera ready
  const handleUserMedia = useCallback(() => {
    setIsReady(true);
    setError(null);
    if (onReady) {
      onReady();
    }
  }, [onReady]);

  // Handle camera error
  const handleUserMediaError = useCallback((err: string | DOMException) => {
    console.error('Camera error:', err);
    const errorMessage = typeof err === 'string' ? err : err.message || 'Camera access failed';
    setError(errorMessage);
    setIsReady(false);
    if (onError) {
      onError(err);
    }
  }, [onError]);

  // Switch between front and back camera
  const switchCamera = useCallback(() => {
    setFacingMode(prevMode => prevMode === 'user' ? 'environment' : 'user');
    setIsReady(false); // Reset ready state while switching
  }, []);

  // Toggle resolution
  const toggleResolution = useCallback(() => {
    setResolution(prevResolution => {
      const resolutions: CameraResolution[] = ['720p', '480p', '360p'];
      const currentIndex = resolutions.indexOf(prevResolution);
      const nextIndex = (currentIndex + 1) % resolutions.length;
      return resolutions[nextIndex];
    });
    setIsReady(false); // Reset ready state while changing resolution
  }, []);

  // Capture photo
  const capturePhoto = useCallback(() => {
    if (!webcamRef.current || !isReady) {
      console.warn('Camera not ready for capture');
      return;
    }

    setIsCapturing(true);
    try {
      // Capture screenshot from webcam
      const imageSrc = webcamRef.current.getScreenshot({
        width: RESOLUTION_CONFIG[resolution].width,
        height: RESOLUTION_CONFIG[resolution].height,
      });

      if (imageSrc && onCapture) {
        onCapture(imageSrc);
      }

      // Auto-download if no callback provided
      if (imageSrc && !onCapture) {
        const link = document.createElement('a');
        link.href = imageSrc;
        link.download = `photo_${new Date().getTime()}.jpg`;
        link.click();
      }
    } catch (error) {
      console.error('Photo capture failed:', error);
      handleUserMediaError(error instanceof Error ? error.message : 'Capture failed');
    } finally {
      // Reset capturing state after a short delay for visual feedback
      setTimeout(() => setIsCapturing(false), 200);
    }
  }, [isReady, resolution, onCapture, handleUserMediaError]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Space or Enter to capture
      if ((event.key === ' ' || event.key === 'Enter') && showCaptureButton) {
        event.preventDefault();
        capturePhoto();
      }
      // 'S' to switch camera
      if (event.key === 's' || event.key === 'S') {
        if (showSwitchButton) {
          event.preventDefault();
          switchCamera();
        }
      }
      // 'R' to toggle resolution
      if (event.key === 'r' || event.key === 'R') {
        if (showResolutionButton) {
          event.preventDefault();
          toggleResolution();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [capturePhoto, switchCamera, toggleResolution, showCaptureButton, showSwitchButton, showResolutionButton]);

  return (
    <div className={`camera-component ${className}`}>
      {/* Webcam display */}
      <div className="camera-component__viewport">
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          screenshotQuality={photoQuality}
          videoConstraints={getVideoConstraints()}
          onUserMedia={handleUserMedia}
          onUserMediaError={handleUserMediaError}
          mirrored={facingMode === 'user' && mirrored}
          className="camera-component__webcam"
        />
        
        {/* Capture flash effect */}
        {isCapturing && <div className="camera-component__flash" />}
      </div>

      {/* Error overlay */}
      {error && (
        <div className="camera-component__error-overlay">
          <p className="camera-component__error-text">{error}</p>
          <p className="camera-component__error-hint">
            {t('ac_no_camera_permission_2') || 'Please grant camera permissions and refresh the page'}
          </p>
        </div>
      )}

      {/* Controls */}
      {isReady && !error && (
        <div className="camera-component__controls">
          {/* Resolution toggle button */}
          {showResolutionButton && (
            <button
              className="camera-component__button camera-component__button--resolution"
              onClick={toggleResolution}
              aria-label={`Current resolution: ${resolution}`}
              title={`Resolution: ${resolution} (press R)`}
            >
              <Settings size={24} />
              <span className="camera-component__button-label">{resolution}</span>
            </button>
          )}

          {/* Capture button */}
          {showCaptureButton && (
            <button
              className="camera-component__button camera-component__button--capture"
              onClick={capturePhoto}
              aria-label="Take photo"
              title="Capture photo (press Space)"
            >
              <Camera size={32} />
            </button>
          )}

          {/* Switch camera button */}
          {showSwitchButton && (
            <button
              className="camera-component__button camera-component__button--switch"
              onClick={switchCamera}
              aria-label="Switch camera"
              title="Switch camera (press S)"
            >
              <SwitchCamera size={24} />
            </button>
          )}
        </div>
      )}

      {/* Loading indicator */}
      {!isReady && !error && (
        <div className="camera-component__loading">
          <div className="camera-component__spinner" />
          <p>{t('ac_starting_camera') || 'Starting camera...'}</p>
        </div>
      )}
    </div>
  );
};

export default CameraComponent;
