import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, Circle, Video, Square } from 'lucide-react';
import './Camera02.css';

const isAndroidApp = typeof window.android !== 'undefined';
const MOUSE_WHEEL_DELTA = 0.004;
const MIN_ZOOM = 1.0; // ズーム倍率の最小値
const MAX_ZOOM = 4.0; // ズーム倍率の最大値

// アプリケーションのベースパスを取得
const BASE_URL = import.meta.env.BASE_URL;

const shutterSoundUrl = `${BASE_URL}ac-camera-shutter-sound.mp3`;
const videoStartSoundUrl = `${BASE_URL}ac-video-started.mp3`;
const videoCompleteSoundUrl = `${BASE_URL}ac-video-completed.mp3`;

const TOUCH_MOVE_RATIO = 1.5;

const getDistance = (t1: Touch, t2: Touch) => {
  return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
};

const getCenter = (t1: Touch, t2: Touch) => {
  return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
};

// 効果音を再生するかどうか決める関数
const mustPlaySound = (): boolean => {
  return true;
};

// 音声を再生する
const playSound = (audio: HTMLAudioElement | null) => {
  if (!audio) {
    console.assert(false);
  }
  // 可能ならばシステム音量を変更する
  try {
    if (isAndroidApp)
      window.android.onStartShutterSound();
  } catch (error) {
    alert(error);
  }

  try {
    if (audio) {
      audio.addEventListener('ended', (event) => { // 再生終了時
        // 可能ならばシステム音量を元に戻す
        try {
          if (isAndroidApp)
            window.android.onEndShutterSound();
        } catch (error) {
          alert(error);
        }
      });
      // 再生位置をリセットしてから再生
      audio.currentTime = 0;
      audio.play();
    }
  } catch (error) {
    console.warn('sound playback failed:', error);
  }
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
  const shutterAudioRef = useRef<HTMLAudioElement | null>(null); // シャッター音の Audio オブジェクト
  const videoStartAudioRef = useRef<HTMLAudioElement | null>(null); // 動画録画開始音の Audio オブジェクト
  const videoCompleteAudioRef = useRef<HTMLAudioElement | null>(null); // 動画録画完了音の Audio オブジェクト

  // 現在のzoomの値を常にzoomRefに保持（タッチイベントで使用）
  useEffect(() => {
    zoomRef.current = zoom;
    //console.log('zoom:', zoom);
  }, [zoom]);

  // シャッター音などの初期化
  useEffect(() => {
    // Audioオブジェクトを作成し、Refに保持
    try {
      // シャッター音
      if (shutterSoundUrl) {
        shutterAudioRef.current = new Audio(shutterSoundUrl);
        shutterAudioRef.current.load();
      }
      // ビデオ録画開始音
      if (videoStartSoundUrl) {
        videoStartAudioRef.current = new Audio(videoStartSoundUrl);
        videoStartAudioRef.current.load();
      }
      // ビデオ録画完了音
      if (videoCompleteSoundUrl) {
        videoCompleteAudioRef.current = new Audio(videoCompleteSoundUrl);
        videoCompleteAudioRef.current.load();
      }
    } catch (error) {
      console.error('Failed to initialize shutter audio:', error);
    }
  }, []); // 依存配列が空なのでマウント時に一度だけ実行される

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

  const draw = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      let currentZoom = zoomRef.current;
      // カメラ映像を描画
      if (currentZoom === 1.0) { // ズームなし？
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } else { // ズームあり？
        // ズーム時は中央部分を切り取って拡大描画
        const sourceWidth = video.videoWidth / currentZoom;
        const sourceHeight = video.videoHeight / currentZoom;
        const sourceX = (video.videoWidth - sourceWidth) / 2;
        const sourceY = (video.videoHeight - sourceHeight) / 2;

        ctx.drawImage(
          video,
          sourceX, sourceY, sourceWidth, sourceHeight,  // ソース（切り取り範囲）
          0, 0, canvas.width, canvas.height             // キャンバス全体に描画
        );
      }

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
  }, []);

  const drawVideoToCanvas = useCallback(() => {
    draw();
  }, []);

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

    // シャッター音再生
    if (mustPlaySound()) {
      playSound(shutterAudioRef.current);
    }

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

    // ビデオ録画開始音を再生
    if (mustPlaySound()) {
      playSound(videoStartAudioRef.current);
    }

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

    recorder.onstop = () => { // レコーダー停止時の処理
      // ビデオ録画完了音を再生
      if (mustPlaySound()) {
        playSound(videoCompleteAudioRef.current);
      }

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
        style={{ objectFit:'contain' }}
      />

      <div className="camera02-controls">
        <button className="camera02-button" onClick={takePhoto}>
          <Camera size={48} />
        </button>

        {!isRecording ? (
          <button className="camera02-button" onClick={startRecording}>
            <Video size={48} />
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