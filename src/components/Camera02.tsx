import React, { useRef, useEffect, useState } from 'react';
import { Camera, Circle, Square } from 'lucide-react';
import './Camera02.css';

export default function Camera02() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const animationRef = useRef(null);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().then(() => {
            drawVideoToCanvas();
          }).catch(err => {
            console.error('ビデオの再生に失敗しました:', err);
          });
        };
      }
    } catch (err) {
      console.error('カメラへのアクセスに失敗しました:', err);
      alert('カメラへのアクセスが拒否されました。ブラウザの設定を確認してください。');
    }
  };

  const drawVideoToCanvas = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    const draw = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      animationRef.current = requestAnimationFrame(draw);
    };
    draw();
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const takePhoto = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `photo_${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const startRecording = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasStream = canvas.captureStream(30);
    
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach(track => canvasStream.addTrack(track));
    }

    const recorder = new MediaRecorder(canvasStream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 2500000
    });

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `video_${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setRecordedChunks([]);
    };

    recorder.start();
    setMediaRecorder(recorder);
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="camera02-root">
      <canvas
        ref={canvasRef}
        className="camera02-canvas"
        style={{ objectFit: 'contain' }}
      />

      <div className="camera02-controls">
        <button className="camera02-button" onClick={takePhoto}>
          <Camera size={48} />
        </button>

        {!isRecording ? (
          <button className="camera02-button" onClick={startRecording}>
            <Circle size={48} />
          </button>
        ) : (
          <button className="camera02-button camera02-button-recording" onClick={stopRecording}>
            <Square size={48} />
          </button>
        )}
      </div>

      <video
        ref={videoRef}
        className="camera02-video"
        playsInline
        muted
      />
    </div>
  );
}