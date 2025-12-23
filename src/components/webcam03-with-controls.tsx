import React, { useRef, useState, useCallback } from 'react';
import Webcam03, { WebcamCanvasHandle } from './webcam03';
import Camera03Controls from './webcam03-controls';

/* ボタン付きカメラ コンポーネント */
export default function Camera03WithControls() {
  const webcamRef = useRef<WebcamCanvasHandle>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const handleUserMedia = useCallback((stream: MediaStream) => {
    console.log("Camera started successfully", stream);
    setCameraReady(true);
    setError(null);
  }, []);

  const handleUserMediaError = useCallback((err: string | DOMException) => {
    console.error("Camera error:", err);
    if (err instanceof DOMException) {
      if (err.name === 'NotAllowedError') {
        setError('カメラへのアクセスが拒否されました。ブラウザの設定を確認してください。');
      } else if (err.name === 'NotFoundError') {
        setError('カメラが見つかりません。');
      } else {
        setError(`カメラエラー: ${err.message}`);
      }
    } else {
      setError(`エラー: ${err}`);
    }
    setCameraReady(false);
  }, []);

  const takePhoto = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      const link = document.createElement('a');
      link.href = imageSrc;
      link.download = `photo_${Date.now()}.webp`;
      link.click();
      console.log("Photo taken");
    } else {
      console.error("Failed to take photo");
    }
  }, []);

  const handleStartRecording = useCallback(() => {
    const stream = webcamRef.current?.video?.srcObject as MediaStream;
    if (!stream) {
      console.error("No stream available");
      return;
    }

    setIsRecording(true);

    const mimeType = MediaRecorder.isTypeSupported('video/webm') 
      ? 'video/webm' 
      : 'video/mp4';

    console.log("Starting recording with mimeType:", mimeType);

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
        console.log("Chunk received:", event.data.size, "bytes");
      }
    };

    recorder.onstop = () => {
      console.log("Recording stopped, chunks:", chunks.length);
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `video_${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      console.log("Video saved");
    };

    recorder.start();
    console.log("Recording started");
  }, []);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      console.log("Stopping recording");
    }
  }, []);

  return (
    <div style={{ 
      width: '100%', 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center',
      backgroundColor: '#000',
      position: 'relative'
    }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {error && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#f44336',
          color: 'white',
          padding: '15px 25px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 20,
          maxWidth: '80%'
        }}>
          <AlertCircle size={24} />
          <span>{error}</span>
        </div>
      )}

      {!cameraReady && !error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'white',
          fontSize: '18px',
          zIndex: 20
        }}>
          カメラを起動中...
        </div>
      )}

      <div style={{ 
        position: 'relative', 
        width: '100%', 
        maxWidth: '800px',
        aspectRatio: '16/9'
      }}>
        <Webcam03 
          ref={webcamRef}
          mirrored={true}
          onUserMedia={handleUserMedia}
          onUserMediaError={handleUserMediaError}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '8px'
          }}
        >
          {() => cameraReady && (
            <Camera03Controls 
              isRecording={isRecording}
              takePhoto={takePhoto}
              startRecording={handleStartRecording}
              stopRecording={handleStopRecording}
            />
          )}
        </Webcam03>
      </div>
    </div>
  );
}
