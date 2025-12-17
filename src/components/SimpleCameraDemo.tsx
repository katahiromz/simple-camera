// SimpleCameraDemo.tsx --- Demo app showing usage of the react-webcam based CameraComponent
import React, { useState } from 'react';
import CameraComponent from './CameraComponent';
import { X } from 'lucide-react';
import './SimpleCameraDemo.css';
import './i18n.ts'; // Import i18n configuration

/**
 * SimpleCameraDemo - Demonstrates how to use the CameraComponent
 * 
 * This component shows practical usage examples of the react-webcam based
 * CameraComponent with different configurations.
 */
const SimpleCameraDemo: React.FC = () => {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [captureCount, setCaptureCount] = useState(0);

  // Handle photo capture
  const handleCapture = (imageSrc: string) => {
    console.log('Photo captured!');
    setCapturedImage(imageSrc);
    setCaptureCount(prev => prev + 1);
  };

  // Handle camera ready
  const handleReady = () => {
    console.log('Camera is ready!');
  };

  // Handle camera error
  const handleError = (error: string | DOMException) => {
    console.error('Camera error:', error);
  };

  // Close preview
  const closePreview = () => {
    setCapturedImage(null);
  };

  return (
    <div className="simple-camera-demo">
      <div className="simple-camera-demo__header">
        <h1>react-webcam Camera Component Demo</h1>
        <p>A simple, reusable camera component with switching, capture, and resolution control</p>
        {captureCount > 0 && (
          <p className="simple-camera-demo__counter">
            Photos captured: {captureCount}
          </p>
        )}
      </div>

      <div className="simple-camera-demo__camera">
        <CameraComponent
          showCaptureButton={true}
          showSwitchButton={true}
          showResolutionButton={true}
          initialFacingMode="environment"
          initialResolution="720p"
          onCapture={handleCapture}
          onReady={handleReady}
          onError={handleError}
          photoQuality={0.92}
          mirrored={true}
        />
      </div>

      {/* Captured image preview */}
      {capturedImage && (
        <div className="simple-camera-demo__preview-overlay">
          <div className="simple-camera-demo__preview-container">
            <button
              className="simple-camera-demo__close-button"
              onClick={closePreview}
              aria-label="Close preview"
            >
              <X size={24} />
            </button>
            <img
              src={capturedImage}
              alt="Captured"
              className="simple-camera-demo__preview-image"
            />
            <div className="simple-camera-demo__preview-actions">
              <a
                href={capturedImage}
                download={`photo_${new Date().getTime()}.jpg`}
                className="simple-camera-demo__download-button"
              >
                Download
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Usage instructions */}
      <div className="simple-camera-demo__instructions">
        <h2>Features & Keyboard Shortcuts</h2>
        <ul>
          <li><strong>Space/Enter:</strong> Capture photo</li>
          <li><strong>S:</strong> Switch between front/back camera</li>
          <li><strong>R:</strong> Toggle resolution (720p → 480p → 360p)</li>
          <li><strong>Auto-mirror:</strong> Front camera view is automatically mirrored</li>
          <li><strong>Responsive:</strong> Works on desktop, tablet, and mobile</li>
        </ul>
      </div>
    </div>
  );
};

export default SimpleCameraDemo;
