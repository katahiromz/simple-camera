import React, { useRef, useState, useCallback } from 'react';
import { Camera, Video, Square, AlertCircle, SwitchCamera } from 'lucide-react';

// Controls コンポーネント
interface Camera03ControlsProps {
  isRecording: boolean;
  takePhoto: () => void;
  startRecording: () => void;
  stopRecording: () => void;
  toggleCamera: () => void;
}

const Camera03Controls: React.FC<Camera03ControlsProps> = ({
  isRecording, takePhoto, startRecording, stopRecording, toggleCamera
}) => {
  return (
    <div style={{
      position: 'absolute',
      bottom: '8px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: '20px',
      zIndex: 10
    }}>
      <button 
        onClick={toggleCamera} 
        disabled={isRecording}
        style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          border: '3px solid white',
          backgroundColor: isRecording ? '#666' : '#4C50AF',
          cursor: isRecording ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isRecording ? 0.5 : 1
        }}
      >
        <SwitchCamera size={30} color="white" />
      </button>

      <button 
        onClick={takePhoto} 
        disabled={isRecording}
        style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          border: '3px solid white',
          backgroundColor: isRecording ? '#666' : '#4CAF50',
          cursor: isRecording ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isRecording ? 0.5 : 1
        }}
      >
        <Camera size={30} color="white" />
      </button>

      {!isRecording ? (
        <button 
          onClick={startRecording}
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            border: '3px solid white',
            backgroundColor: '#2196F3',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Video size={30} color="white" />
        </button>
      ) : (
        <button 
          onClick={stopRecording}
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            border: '3px solid white',
            backgroundColor: '#f44336',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'pulse 1.5s infinite'
          }}
        >
          <Square size={30} color="white" />
        </button>
      )}
    </div>
  );
};

export default Camera03Controls;
