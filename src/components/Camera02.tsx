import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, Circle, Square } from 'lucide-react';
import './Camera02.css';

const isAndroidApp = typeof window.android !== 'undefined';
const MOUSE_WHEEL_DELTA = 0.004;
const MIN_ZOOM = 1.0; // ズーム倍率の最小値
const MAX_ZOOM = 4.0; // ズーム倍率の最大値

const TOUCH_MOVE_RATIO = 1.5;

const getDistance = (t1: Touch, t2: Touch) => {
  return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
};

const getCenter = (t1: Touch, t2: Touch) => {
  return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
};

export default function Camera02() {
  // states
  const [stream, setStream] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [zoom, setZoomState] = useState(1.0); // ズーム倍率
  // refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const initialZoomRef = useRef(1.0); // ピンチ開始時のズーム倍率
  const lastTouchDistanceRef = useRef(0); // タッチ距離
  const lastTouchCenterRef = useRef({ x: 0, y: 0 }); // タッチ中心
  const initialTouchDistanceRef = useRef(0); // ピンチ開始時の距離
  const initialTouchCenterRef = useRef({ x: 0, y: 0 }); // ピンチ開始時の中心座標
  const zoomRef = useRef(zoom); // ズーム参照

  // 現在のzoomの値を常にzoomRefに保持（タッチイベントで使用）
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

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

        // カメラ映像を描画
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 丸を描画
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(canvas.width / 4, canvas.height / 3, 80, 0, Math.PI * 2);
        ctx.stroke();
        
        // 四角を描画
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
        ctx.lineWidth = 5;
        ctx.strokeRect(canvas.width / 2, canvas.height / 2, 150, 150);
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

  const downloadFallback = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // メディアをギャラリーに保存(Android専用)
  const saveMediaForAndroid = (blob: Blob, fileName: string, mimeType: string, isVideo: boolean) => {
    console.assert(isAndroidApp);
    const reader = new FileReader();
    reader.onloadend = () => {
      console.log("reader.onloadend");
      const result = reader.result;
      const base64data = result.substr(result.indexOf('base64,') + 7);
      // Kotlin側の関数を呼び出す
      try {
        window.android.saveMediaToGallery(base64data, fileName, mimeType, isVideo);
        if (isVideo)
          console.log('Saved video:', fileName);
        else
          console.log('Saved image:', fileName);
      } catch (error) {
        console.assert(false);
        console.error('android インタフェース呼び出しエラー:', error);
        downloadFallback(blob, fileName);
      }
    };
    reader.readAsDataURL(blob); // BlobをBase64に変換
  };

  const takePhoto = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      const filename = `photo_${Date.now()}.png`;
      if (isAndroidApp) {
        try {
          saveMediaForAndroid(blob, filename, 'image/png', false);
        } catch (e) {
          console.warn(e);
          downloadFallback(blob, filename);
        }
      } else {
        downloadFallback(blob, filename);
      }
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
      const filename = `video_${Date.now()}.webm`;
      if (isAndroidApp) {
        try {
          saveMediaForAndroid(blob, filename, 'video/webm', true);
        } catch (e) {
          console.warn(e);
          downloadFallback(blob, filename);
        }
      } else {
        downloadFallback(blob, filename);
      }
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

  // --- PC: マウスホイールでズーム ---
  const handleWheel = (event: WheelEvent) => {
    if (event.ctrlKey) { // Ctrl + ホイール
      event.preventDefault();
      // 現在の zoom state を取得するために setZoomState の関数形式を使用
      setZoomState(prevZoom => {
        const delta = -event.deltaY * MOUSE_WHEEL_DELTA;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom + delta));
        return newZoom;
      });
    }
  };

  // --- Touch: ピンチズーム ---

  const handleTouchStart = useCallback((event: TouchEvent) => {
    if (event.touches.length === 2) {
      event.preventDefault();
      const distance = getDistance(event.touches[0], event.touches[1]);
      const center = getCenter(event.touches[0], event.touches[1]);
      lastTouchDistanceRef.current = distance;
      lastTouchCenterRef.current = center;
      // ピンチ開始時の状態を記録
      initialTouchDistanceRef.current = distance;
      initialTouchCenterRef.current = center;
      initialZoomRef.current = zoomRef.current;
    }
  }, []);

  const handleTouchMove = useCallback((event: TouchEvent) => {
    if (event.touches.length === 2) { // 2本指操作
      event.preventDefault();

      // 距離と中心を計算
      const t1 = event.touches[0], t2 = event.touches[1];
      const currentDist = getDistance(t1, t2);
      const currentCenter = getCenter(t1, t2);

      // ズーム倍率を計算
      let newZoom = zoomRef.current;
      if (initialTouchDistanceRef.current > 0) {
        // 初期距離との比率に基づいて新しいズーム倍率を計算し、境界値にクランプ
        const zoomRatio = currentDist / initialTouchDistanceRef.current;
        newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, initialZoomRef.current * zoomRatio));
        // ズームを更新
        setZoomState(newZoom);
      }

      // 次のフレームのために現在の値を保存
      lastTouchDistanceRef.current = currentDist;
      lastTouchCenterRef.current = currentCenter;
    }
  }, [zoomRef]);

  const handleTouchEnd = useCallback((event: TouchEvent) => {
    ;
  }, []);

  // イベントリスナーの設定
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // リスナー登録 (passive: false)
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleWheel]);

  return (
    <div className="camera02-root">
      <canvas
        ref={canvasRef}
        className="camera02-canvas"
        style={{ objectFit:'contain', scale:(zoom * 100) + '%' }}
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