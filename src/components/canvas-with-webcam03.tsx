// webcam03-with-canvas.tsx
import React, { useRef, useState, useCallback, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import Webcam03 from './webcam03';
import Webcam03Controls from './webcam03-controls';
import { PermissionManager, PermissionStatusValue } from './permission-watcher';
import { isAndroidApp, clamp, generateFileName, playSound, photoFormatToExtension, videoFormatToExtension, formatTime } from './utils';
import { saveFile } from './utils';

const MOUSE_WHEEL_DELTA = 0.004;
const ENABLE_USER_ZOOMING = true;
const MIN_ZOOM = 1.0; // ズーム倍率の最小値
const MAX_ZOOM = 4.0; // ズーム倍率の最大値
const ENABLE_SOUND_EFFECTS = true; // 効果音を有効にするか？

interface CanvasWithWebcam03Props {
  shutterSoundUrl?: string;
  videoStartSoundUrl?: string;
  videoCompleteSoundUrl?: string;
  audio?: boolean;
  className?: string;
  style?: React.CSSProperties;
  mirrored?: boolean;
  photoFormat?: "image/png" | "image/webp" | "image/jpeg";
  photoQuality?: number;
  recordingFormat?: "video/webm" | "video/mp4";
  downloadFile?: (blob: Blob, fileName: string, mimeType: string, isVideo: boolean) => void;
  eventTarget?: HTMLElement;
  showControls?: boolean;
  showTime?: boolean;
};

interface CanvasWithWebcam03Handle {
  canvas?: HTMLCanvasElement;
  getZoomRatio?: () => number;
  setZoomRatio?: (ratio: number) => void;
  startRecording?: () => void;
  stopRecording?: () => void;
  zoomIn?: () => void;
  zoomOut?: () => void;
  isRecording?: () => boolean;
};

const CanvasWithWebcam03 = forwardRef<CanvasWithWebcam03Handle, CanvasWithWebcam03Props>((
  {
    shutterSoundUrl = null,
    videoStartSoundUrl = null,
    videoCompleteSoundUrl = null,
    audio = true,
    mirrored = true,
    photoFormat = "image/png",
    photoQuality = 0.92,
    recordingFormat = "video/webm",
    style,
    className,
    saveFile = null,
    downloadFile = null,
    eventTarget = null,
    showControls = true,
    showTime = true,
    ...rest
  },
  ref
) => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRecordingNow, setIsRecordingNow] = useState(false);
  const [zoomValue, setZoomValue] = useState(1.0); // ズーム倍率
  const zoomRef = useRef(zoomValue); // ズーム参照
  const [recordingTime, setRecordingTime] = useState(0); // 録画時間量

  // 録画タイマー
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecordingNow]);

  // --- 権限状態の管理 ---
  const [cameraPermission, setCameraPermission] = useState<PermissionStatusValue>('prompt');
  const [micPermission, setMicPermission] = useState<PermissionStatusValue>('prompt');
  // マイクを有効にするかどうかのフラグ
  const [isMicEnabled, setIsMicEnabled] = useState(true);

  // シャッター音など
  const shutterAudioRef = useRef<HTMLAudioElement | null>(null); // シャッター音の Audio オブジェクト
  const videoStartAudioRef = useRef<HTMLAudioElement | null>(null); // 動画録画開始音の Audio オブジェクト
  const videoCompleteAudioRef = useRef<HTMLAudioElement | null>(null); // 動画録画完了音の Audio オブジェクト

  // 現在のzoomValueの値を常にzoomRefに保持（タッチイベントで使用）
  useEffect(() => {
    zoomRef.current = zoomValue;
    //console.log('zoomValue:', zoomValue);
  }, [zoomValue]);

  // シャッター音などの初期化
  useEffect(() => {
    if (!ENABLE_SOUND_EFFECTS) return;
    try {
      // シャッター音
      if (shutterSoundUrl) {
        shutterAudioRef.current = new Audio(shutterSoundUrl);
        shutterAudioRef.current.load();
      }
    } catch (error) {
      console.error('Failed to initialize shutter audio:', error);
    }
    return () => {
      shutterAudioRef.current = null;
    };
  }, [shutterSoundUrl]);
  useEffect(() => {
    if (!ENABLE_SOUND_EFFECTS) return;
    try {
      // ビデオ録画開始音
      if (videoStartSoundUrl) {
        videoStartAudioRef.current = new Audio(videoStartSoundUrl);
        videoStartAudioRef.current.load();
      }
    } catch (error) {
      console.error('Failed to initialize shutter audio:', error);
    }
    return () => {
      videoStartAudioRef.current = null;
    };
  }, [videoStartSoundUrl]);
  useEffect(() => {
    if (!ENABLE_SOUND_EFFECTS) return;
    try {
      // ビデオ録画完了音
      if (videoCompleteSoundUrl) {
        videoCompleteAudioRef.current = new Audio(videoCompleteSoundUrl);
        videoCompleteAudioRef.current.load();
      }
    } catch (error) {
      console.error('Failed to initialize shutter audio:', error);
    }
    return () => {
      videoCompleteAudioRef.current = null;
    };
  }, [videoCompleteSoundUrl]);

  useEffect(() => {
    // インスタンスの生成
    const cameraManager = new PermissionManager('camera' as PermissionName);
    const micManager = new PermissionManager('microphone' as PermissionName);

    // 購読開始
    const unsubscribeCamera = cameraManager.subscribe((status) => {
      setCameraPermission(status);
      if (status === 'denied') {
        setError("カメラの使用が拒否されています。ブラウザの設定から許可してください。");
      }
    });

    const unsubscribeMic = micManager.subscribe((status) => {
      setMicPermission(status);
      // マイクが拒否されている場合は強制的に無効化
      setIsMicEnabled(status !== 'denied');
    });

    return () => {
      unsubscribeCamera();
      unsubscribeMic();
    };
  }, []);

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

        let currentZoom = zoomRef.current;
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

    if (ENABLE_SOUND_EFFECTS) {
      // シャッター音再生
      playSound(shutterAudioRef.current);
    }

    try {
      const extension = photoFormatToExtension(photoFormat);
      const fileName = generateFileName('photo_', extension);
      canvasRef.current.toBlob((blob) => {
        if (downloadFile)
          downloadFile(blob, fileName, blob.type, false);
        else
          saveFile(blob, fileName, blob.type, false);
        console.log("Photo taken");
      }, photoFormat, photoQuality);
    } catch (err) {
      console.error("Failed to take photo:", err);
      setError("写真撮影に失敗しました");
    }
  }, []);

  // --- 録画開始機能 ---
  const startRecording = useCallback(() => {
    console.log('startRecording');
    if (!canvasRef.current) return;

    if (ENABLE_SOUND_EFFECTS) {
      playSound(videoStartAudioRef.current);
    }

    chunksRef.current = [];

    // Canvasからストリームを取得 (30fps)
    const stream = canvasRef.current.captureStream(30);

    // 必要に応じてWebcamからの音声トラックを追加
    if (isMicEnabled && webcamRef.current?.video?.srcObject) {
      const audioTracks = (webcamRef.current.video.srcObject as MediaStream).getAudioTracks();
      audioTracks.forEach(track => stream.addTrack(track));
    }

    const options = { mimeType: recordingFormat };
    const mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      console.log('onstop');
      if (ENABLE_SOUND_EFFECTS) {
        playSound(videoCompleteAudioRef.current);
      }
      const blob = new Blob(chunksRef.current, { type: recordingFormat });
      const extension = videoFormatToExtension(recordingFormat);
      const fileName = generateFileName('video_', extension);
      if (downloadFile)
        downloadFile(blob, fileName, blob.type, true);
      else
        saveFile(blob, fileName, blob.type, true);
    };

    mediaRecorder.start();
    mediaRecorderRef.current = mediaRecorder;
    setIsRecordingNow(true);
    setRecordingTime(0);
  }, []);

  // --- 録画停止機能 ---
  const stopRecording = useCallback(() => {
    console.log('stopRecording');
    if (mediaRecorderRef.current && isRecordingNow) {
      mediaRecorderRef.current.stop();
      setIsRecordingNow(false);
    }
  }, [isRecordingNow]);

  // --- PC: マウスホイールでズーム ---
  const handleWheel = (event: WheelEvent) => {
    if (event.ctrlKey) { // Ctrl + ホイール
      event.preventDefault();
      if (!ENABLE_USER_ZOOMING)
        return;
      // 現在の zoomValue state を取得するために setZoomValue の関数形式を使用
      setZoomValue(prevZoom => {
        const delta = -event.deltaY * MOUSE_WHEEL_DELTA;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom + delta));
        return newZoom;
      });
    }
  };

  // スタイルの整理
  const combinedCanvasStyle: React.CSSProperties = {
    maxWidth: '100%',
    maxHeight: '100%',
    backgroundColor: '#000',
    objectFit: 'contain', // 映像全体を表示（余白は黒）。隙間なく埋めるなら 'cover'
    display: 'block',
    ...style,
    // 左右反転の処理を最後に結合
    transform: `${style?.transform || ""} ${mirrored ? "scaleX(-1)" : ""}`.trim(),
  };

  // イベントリスナーの設定
  useEffect(() => {
    const target = eventTarget ? eventTarget : canvasRef.current;
    if (!target) return;

    // リスナー登録 (passive: false)
    target.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      target.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel, eventTarget]);

  const getZoomRatio = () => {
    return zoomValue;
  };
  const setZoomRatio = (ratio: number) => {
    const newRatio = clamp(MIN_ZOOM, ratio, MAX_ZOOM);
    setZoomValue(newRatio);
  };

  const ZOOM_DELTA = 0.2;

  const zoomIn = useCallback(() => {
    if (!ENABLE_USER_ZOOMING)
      return;
    const newValue = clamp(MIN_ZOOM, zoomValue + ZOOM_DELTA, MAX_ZOOM);
    setZoomValue(newValue);
  }, [zoomValue]);

  const zoomOut = useCallback(() => {
    if (!ENABLE_USER_ZOOMING)
      return;
    const newValue = clamp(MIN_ZOOM, zoomValue - ZOOM_DELTA, MAX_ZOOM);
    setZoomValue(newValue);
  }, [zoomValue]);

  const isRecording = useCallback(() => {
    return isRecordingNow;
  }, [isRecordingNow]);

  useImperativeHandle(ref, () => ({
    canvas: canvasRef.current,
    getZoomRatio: getZoomRatio.bind(this),
    setZoomRatio: setZoomRatio.bind(this),
    takePhoto: takePhoto.bind(this),
    startRecording: startRecording.bind(this),
    stopRecording: stopRecording.bind(this),
    isRecording: isRecording.bind(this),
    zoomIn: zoomIn.bind(this),
    zoomOut: zoomOut.bind(this),
  }));

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* キャンバス */}
      <canvas
        ref={canvasRef}
        style={combinedCanvasStyle}
        className={className}
        {...rest}
      />

      {/* 権限エラーまたはその他のエラー表示 */}
      {(cameraPermission === 'denied') && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 20px',
          backgroundColor: 'rgba(244, 67, 54, 0.9)',
          color: 'white',
          borderRadius: '5px',
          zIndex: 20,
          textAlign: 'center'
        }}>
          カメラのアクセス権限が必要です。設定を確認してください。
        </div>
      )}

      {/* 録画時間表示 */}
      {showTime && isRecordingNow && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '10px',
          color: 'red',
          pointerEvents: 'none',
          color: "#f66",
          fontWeight: 'bold',
          padding: '3px',
          border: '2px solid #f66',
          borderRadius: '20px',
        }}>
          {formatTime(recordingTime)}
        </div>
      )}

      {/* カメラ権限が拒否されていない場合のみWebcamを起動 */}
      {cameraPermission !== 'denied' && (
        <Webcam03 
          ref={webcamRef}
          audio={audio && isMicEnabled}
          muted={true}
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
          {showControls ? (() => (
            <Webcam03Controls
              isRecording={isRecordingNow}
              takePhoto={takePhoto}
              startRecording={startRecording}
              stopRecording={stopRecording}
            />
          )) : (() => (<></>))}
        </Webcam03>
      )}
    </div>
  );
});

export default CanvasWithWebcam03;