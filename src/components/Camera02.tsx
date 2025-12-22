import React, { useRef, useEffect, useState } from 'react';
import { Camera, Circle, Square } from 'lucide-react';

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
        videoRef.current.play();
      }
      drawVideoToCanvas();
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
    <div className="fixed inset-0 bg-black">
      <div className="relative w-full h-full">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ objectFit: 'contain' }}
        />
        
        {isRecording && (
          <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full">
            <Circle className="w-4 h-4 fill-current animate-pulse" />
            <span className="font-semibold">録画中</span>
          </div>
        )}

        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-4">
          <button
            onClick={takePhoto}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors shadow-lg"
          >
            <Camera className="w-5 h-5" />
            写真を撮る
          </button>

          {!isRecording ? (
            <button
              onClick={startRecording}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors shadow-lg"
            >
              <Circle className="w-5 h-5" />
              録画開始
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors shadow-lg"
            >
              <Square className="w-5 h-5" />
              録画停止
            </button>
          )}
        </div>

        <video
          ref={videoRef}
          style={{ visibility: 'hidden' }}
          playsInline
          muted
        />
      </div>
    </div>
  );
}