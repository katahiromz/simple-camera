// webcam03-with-canvas.tsx
import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import Webcam03 from './webcam03';
import Webcam03Controls from './webcam03-controls';

const Webcam03WithCanvas = () => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef();
  // 録画用のRef
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const render = useCallback(() => {
    if (webcamRef.current?.video && canvasRef.current) {
      const video = webcamRef.current.video;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (canvas.width > 2 && canvas.height > 2) {
          // 円を描画
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(canvas.width / 4, canvas.height / 3, 80, 0, Math.PI * 2);
          ctx.stroke();
          
          // 四角形を描画
          ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
          ctx.lineWidth = 5;
          ctx.strokeRect(canvas.width / 2, canvas.height / 2, 150, 150);
        }
      }
    }
    animationRef.current = requestAnimationFrame(render);
  }, []);

  useEffect(() => {
    render();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [render]);

  const takePhoto = useCallback(() => {
    console.log('takePhoto');
    if (!canvasRef.current) {
      console.error("Canvas not ready");
      return;
    }

    try {
      const imageSrc = canvasRef.current.toDataURL('image/webp', 1.0);
      const link = document.createElement('a');
      link.href = imageSrc;
      link.download = `photo_${Date.now()}.webp`;
      link.click();
      console.log("Photo taken");
    } catch (err) {
      console.error("Failed to take photo:", err);
      setError("写真撮影に失敗しました");
    }
  }, []);

  // --- 録画開始機能 ---
  const startRecording = useCallback(() => {
    console.log('startRecording');
    if (!canvasRef.current) return;

    chunksRef.current = [];
    // Canvasからストリームを取得 (30fps)
    const stream = canvasRef.current.captureStream(30);
    
    // 必要に応じてWebcamからの音声トラックを追加
    if (webcamRef.current?.video?.srcObject) {
      const audioTracks = (webcamRef.current.video.srcObject as MediaStream).getAudioTracks();
      audioTracks.forEach(track => stream.addTrack(track));
    }

    const options = { mimeType: 'video/webm; codecs=vp9' };
    const mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      console.log('onstop');
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `video_${Date.now()}.webm`;
      link.click();
      URL.revokeObjectURL(url);
    };

    mediaRecorder.start();
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
  }, []);

  // --- 録画停止機能 ---
  const stopRecording = useCallback(() => {
    console.log('stopRecording');
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  return (
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      height: '100vh',
      backgroundColor: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {error && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 20px',
          backgroundColor: 'rgba(244, 67, 54, 0.9)',
          color: 'white',
          borderRadius: '5px',
          zIndex: 20
        }}>
          {error}
        </div>
      )}
      
      <canvas 
        ref={canvasRef} 
        style={{ 
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain'
        }} 
      />
      
      <Webcam03 
        ref={webcamRef} 
        style={{
          position: 'absolute',
          top: '0',
          left: '0',
          width: '1px', 
          height: '1px',
          opacity: 0,
          pointerEvents: 'none',
          overflow: 'hidden'
        }}
      >
        {() => (
          <Webcam03Controls
            isRecording={isRecording}
            takePhoto={takePhoto}
            startRecording={startRecording}
            stopRecording={stopRecording}
          />
        )}
      </Webcam03>
    </div>
  );
};

export default Webcam03WithCanvas;