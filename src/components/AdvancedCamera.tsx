// AdvancedCamera.tsx
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, Mic, MicOff, Video, VideoOff, RefreshCw, SwitchCamera, CameraOff} from 'lucide-react'; // lucide-reactを使用
import './AdvancedCamera.css';

// 汎用関数群
import {
  calculateVideoRenderMetrics,
  calculateMaxPanOffsets,
  generateFileName,
  formatTime,
  RenderMetrics
} from './utils';

// 国際化(i18n)
import './i18n.ts';
import { useTranslation } from 'react-i18next';

const IS_PRODUCTION = import.meta.env.MODE === 'production'; // 製品版か？

// アプリケーションのベースパスを取得
const BASE_URL = import.meta.env.BASE_URL;

// Androidアプリ内で実行されているか確認
const isAndroidApp = typeof window.android !== 'undefined';

// ステータス定義
type CameraStatus = 'initializing' | 'ready' | 'noPermission' | 'noDevice' | 'switching';

// ストリームを渡すための関数型
type userMediaFn = (MediaStream) => null;

// イメージを処理するための関数型
type userImageProcessFn = (
  canvas: HTMLCanvasElement, // キャンバス
  video: HTMLVideoElement, // ビデオ
  ctx: CanvasRenderingContext2D, // 描画コンテキスト
  x: number, // 転送先X座標
  y: number, // 転送先Y座標
  width: number, // 転送先の幅
  height: number, // 転送先の高さ
  zoom: number, // ズーム倍率(0.0～1.0)
  pan: { x: number, y: number }, // パン(平行移動量、ピクセル単位)
) => null;

// 便利なプロパティ
interface AdvancedCameraProps {
  audio?: boolean; // 音声を有効にするか?
  showTakePhoto?: boolean; // 写真撮影ボタンを表示するか？
  showMic?: boolean; // マイクボタンを表示するか？
  showRecord?: boolean; // ビデオ撮影ボタンを表示するか？
  showControls?: boolean; // コントロールパネルを表示するか？
  photoQuality?: number; // 写真の品質(0.0～1.0)
  photoFormat?: string; // 写真の形式
  onUserMedia?: userMediaFn; // ストリームを返す関数
  onImageProcess?: userImageProcessFn; // イメージを処理する関数
  dummyImageSrc?: string | null; // 非本番環境で使用するダミー画像のパス
};

const AdvancedCamera: React.FC<AdvancedCameraProps> = ({
  audio = true,
  showTakePhoto = true,
  showMic = true,
  showRecord = true,
  showControls = true,
  photoQuality = 0.92,
  photoFormat = 'image/jpeg',
  onUserMedia = null,
  onImageProcess = null,
  dummyImageSrc = null,
}) => {
  const ICON_SIZE = 32; // アイコンサイズ
  const MIN_ZOOM = 1.0; // ズーム倍率の最小値
  const MAX_ZOOM = 4.0; // ズーム倍率の最大値
  const { t } = useTranslation(); // 翻訳用

  // --- Refs ---
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animeRequestRef = useRef<number>(); // アニメーションの要求
  const shutterAudioRef = useRef<HTMLAudioElement | null>(null); // シャッター音の Audio オブジェクト
  const videoStartAudioRef = useRef<HTMLAudioElement | null>(null); // 動画録画開始音の Audio オブジェクト
  const videoCompleteAudioRef = useRef<HTMLAudioElement | null>(null); // 動画録画完了音の Audio オブジェクト
  const dummyImageRef = useRef<HTMLImageElement | null>(null); // ダミー画像の Image オブジェクト

  // タッチ操作用のRef
  const lastTouchDistanceRef = useRef(0);
  const lastTouchCenterRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // --- State ---
  // 状態管理
  const [status, setStatus] = useState<CameraStatus>('initializing'); // カメラの状態
  const [zoom, setZoomState] = useState(1.0); // ズーム倍率
  const [pan, setPanState] = useState({ x: 0, y: 0 }); // パン（平行移動量）
  const [isRecording, setIsRecording] = useState(false); // 録画中？
  const [recordingTime, setRecordingTime] = useState(0); // 録画時間量
  const [micEnabled, setMicEnabled] = useState(true); // マイク有効？
  const [hasMic, setHasMic] = useState(false); // マイクがあるか？
  const [renderMetrics, setRenderMetrics] = useState<RenderMetrics>({ renderWidth: 0, renderHeight: 0, offsetX: 0, offsetY: 0 }); // 描画に使う寸法情報
  const [isDummyImageLoaded, setIsDummyImageLoaded] = useState(false); // ダミー画像がロードされたか？

  // カメラの種類(背面／前面)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(() => {
    try {
      const saved = localStorage.getItem('AdvancedCamera_facingMode');
      if (saved === 'user' || saved === 'environment') {
        return saved;
      }
    } catch (error) {
      console.warn('Failed to load facingMode from localStorage:', error);
    }
    return 'environment'; // デフォルト値
  });
  // facingModeが変更されたらlocalStorageに保存
  useEffect(() => {
    try {
      localStorage.setItem('AdvancedCamera_facingMode', facingMode);
    } catch (error) {
      console.warn('Failed to save facingMode to localStorage:', error);
    }
  }, [facingMode]);

  // renderMetricsのRefを追加（パフォーマンス最適化用）
  const renderMetricsRef = useRef<RenderMetrics>(renderMetrics);
  useEffect(() => {
    renderMetricsRef.current = renderMetrics;
  }, [renderMetrics]);

  // マイク設定の読み込み
  useEffect(() => {
    if (!audio) {
      setMicEnabled(false);
      return;
    }
    const savedMic = localStorage.getItem('AdvancedCamera_micEnabled');
    if (savedMic !== null) {
      setMicEnabled(savedMic === 'true');
    }
  }, []);

  // シャッター音などの初期化
  useEffect(() => {
    // Audioオブジェクトを作成し、Refに保持
    try {
      shutterAudioRef.current = new Audio(`${BASE_URL}camera-shutter-sound.mp3`);
      shutterAudioRef.current.load(); 
      videoStartAudioRef.current = new Audio(`${BASE_URL}video-started.mp3`);
      videoStartAudioRef.current.load(); 
      videoCompleteAudioRef.current = new Audio(`${BASE_URL}video-completed.mp3`);
      videoCompleteAudioRef.current.load(); 
    } catch (error) {
      console.error('Failed to initialize shutter audio:', error);
    }
  }, []); // 依存配列が空なのでマウント時に一度だけ実行される

  // ダミー画像の初期化（非本番環境のみ）
  useEffect(() => {
    if (!IS_PRODUCTION && dummyImageSrc) {
      const img = new Image();
      img.onload = () => {
        dummyImageRef.current = img;
        setIsDummyImageLoaded(true);
        console.log('Dummy image loaded for non-production environment:', {
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      };
      img.onerror = (error) => {
        console.error('Failed to load dummy image:', error);
        setIsDummyImageLoaded(false);
      };
      img.src = dummyImageSrc;
    }
  }, [dummyImageSrc]); // ダミー画像のパスが変更されたら再ロード

  const VOLUME = 0.5; // 音量

  // 音声を再生する
  const playSound = (audio: HTMLAudioElement | null) => {
    // 可能ならばシステム音量を変更する
    try {
      window.android.onStartShutterSound(VOLUME);
    } catch (error) {}

    try {
      if (audio) {
        // 再生位置をリセットしてから再生
        audio.volume = VOLUME;
        audio.currentTime = 0;
        audio.play();
      }
    } catch (error) {
      console.warn('sound playback failed:', error);
    }

    // 可能ならばシステム音量を元に戻す
    try {
      window.android.onEndShutterSound();
    } catch (error) {}
  }

  // --- 描画メトリクスを計算・設定する関数を分離 ---
  const updateRenderMetrics = useCallback((objectFit: 'cover' | 'contain') => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let sourceWidth: number;
    let sourceHeight: number;

    if (!IS_PRODUCTION && dummyImageRef.current && isDummyImageLoaded) {
      // 非本番環境ではダミー画像のサイズを使用
      sourceWidth = dummyImageRef.current.naturalWidth;
      sourceHeight = dummyImageRef.current.naturalHeight;
    } else if (video) {
      // 本番環境ではビデオのサイズを使用
      sourceWidth = video.videoWidth;
      sourceHeight = video.videoHeight;
    } else {
      return;
    }

    const metrics = calculateVideoRenderMetrics(
      sourceWidth,
      sourceHeight,
      canvas.width,
      canvas.height,
      'contain'
    );
    setRenderMetrics(metrics);
  }, [isDummyImageLoaded]);

  // --- 初期化 & カメラ取得フロー ---
  const initCamera = useCallback(async () => {
    setStatus('initializing');

    // 新しいストリームのロードに備え、描画メトリクスとパンをリセットする
    setRenderMetrics({ renderWidth: 0, renderHeight: 0, offsetX: 0, offsetY: 0 });
    setPanState({ x: 0, y: 0 }); // パン位置もリセット
    setZoomState(1.0); // ズームもリセット

    // 非本番環境ではダミー画像を使用
    if (!IS_PRODUCTION && dummyImageRef.current && isDummyImageLoaded) {
      console.log('Using dummy image in non-production environment');
      updateRenderMetrics('contain');
      setStatus('ready');
      setHasMic(false); // ダミー画像使用時はマイクなし
      return;
    }

    // 制約候補の構築 (理想から順に)
    const constraintsCandidates = [
      { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { min: 10, max: 30 }, facingMode: { exact: facingMode } },
      { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { min: 10, max: 30 }, facingMode: { exact: facingMode } },
      { width: { min: 320 }, height: { min: 240 }, frameRate: { min: 10, max: 30 }, facingMode: { exact: facingMode } },
      { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { min: 10, max: 30 } },
      { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { min: 10, max: 30 } },
      { width: { min: 320 }, height: { min: 240 }, frameRate: { min: 10, max: 30 } },
    ];

    let videoStream: MediaStream | null = null;

    try {
      // 制約候補でループ
      for (const constraint of constraintsCandidates) {
        try {
          videoStream = await navigator.mediaDevices.getUserMedia({
            video: constraint,
            audio: false // まず映像のみ取得
          });
          if (videoStream) break;
        } catch (error) {
          console.warn('Constraint failed:', constraint);
          continue;
        }
      }

      if (!videoStream) {
        throw new Error('No suitable camera device found');
      }

      if (videoRef.current) {
        videoRef.current.srcObject = videoStream;
        streamRef.current = videoStream;

        if (onUserMedia)
          onUserMedia(videoStream);

        // 実際に使用されているカメラのfacingModeを取得
        try {
          const videoTrack = videoStream.getVideoTracks()[0];
          const settings = videoTrack.getSettings();
          if (settings.facingMode) {
            // 実際のfacingModeで状態を更新
            const actualFacingMode = settings.facingMode as 'user' | 'environment';
            if (actualFacingMode !== facingMode) {
              console.log(`Actual camera facing mode: ${actualFacingMode}`);
              setFacingMode(actualFacingMode);
            }
          }
        } catch (error) {
          console.warn('Failed to get camera facing mode:', error);
        }

        // readyへの遷移を onloadedmetadata に委ねる (Promiseで待機)
        await new Promise<void>((resolve) => {
          const video = videoRef.current;

          // 既にメタデータがロード済みの場合 (非常に稀)
          if (video.readyState >= 2) {
            updateRenderMetrics('contain');
            resolve();
            return;
          }

          // メタデータがロードされたら
          video.onloadedmetadata = () => {
            updateRenderMetrics('contain'); // 描画メトリクスを更新
            video.onloadedmetadata = null; // ハンドラを解除 (二重発火防止)
            resolve();
          };
        });
      }

      // マイクの確認
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setHasMic(true);
        // マイクストリームは録画時に結合するのでここでは保持せずトラックだけ確認して閉じる
        audioStream.getTracks().forEach(t => t.stop());
      } catch (error) {
        setHasMic(false);
      }

      setStatus('ready');
    } catch (error: any) {
      console.error('Camera Init Error:', error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setStatus('noPermission');
      } else {
        setStatus('noDevice');
      }
    }
  }, [updateRenderMetrics, facingMode, isDummyImageLoaded]);

  // 「アプリの再起動」ボタン用
  const handleRestart = () => {
    initCamera();
  };

  // カメラ切り替え
  const switchCamera = () => {
    if (isRecording) return; // 録画中は切り替え不可
    
    // 非本番環境でダミー画像を使用している場合は切り替え不可
    if (!IS_PRODUCTION && dummyImageRef.current && isDummyImageLoaded) {
      console.log('Camera switching is disabled when using dummy image');
      return;
    }
    
    setStatus('switching');
    
    // 現在のストリームを停止
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // facing mode を切り替え
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);
    
    // 新しいカメラで初期化（initCameraは facingMode の変更を検知して自動実行される）
  };

  // facingMode が変更されたら initCamera を実行する
  useEffect(() => {
    if (status === 'switching') {
      initCamera();
    }
  }, [facingMode, initCamera]);

  useEffect(() => {
    // 非本番環境でダミー画像が指定されている場合は、ロードを待つ
    if (!IS_PRODUCTION && dummyImageSrc && !isDummyImageLoaded) {
      console.log('Waiting for dummy image to load...');
      return;
    }
    
    initCamera();
    // クリーンアップ
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animeRequestRef.current) {
        cancelAnimationFrame(animeRequestRef.current);
      }
    };
  }, [initCamera, isDummyImageLoaded, dummyImageSrc]);

  // --- サイズ監視とレンダリング ---

  // ResizeObserverとデバウンス
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    let timeoutId: NodeJS.Timeout;
    // キャンバスサイズ変更後にメトリクスを更新
    const observer = new ResizeObserver((entries) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!isRecording && canvasRef.current) {
          const entry = entries[0];
          const width = entry.contentRect.width;
          const height = entry.contentRect.height;

          // 描画メトリクスとパンをリセットする
          setRenderMetrics({ renderWidth: 0, renderHeight: 0, offsetX: 0, offsetY: 0 });
          setPanState({ x: 0, y: 0 }); // パン位置もリセット
          setZoomState(1.0); // ズームもリセット

          // キャンバスの内部解像度をコンテナサイズに合わせる
          if (canvasRef.current) {
            canvasRef.current.width = width;
            canvasRef.current.height = height;
          }

          updateRenderMetrics('contain'); // 内部サイズ変更後に描画メトリクスを再計算
        }
      }, 500);
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isRecording, updateRenderMetrics]);

  // デフォルトのイメージ処理関数
  const onDefaultImageProcess = (canvas, video, ctx, x, y, width, height, zoom, pan) => {
    // 画面クリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ズームとパンの適用(object-fit: cover/contain再現)
    // 中心を基準にスケーリングするために translate -> scale -> translate back
    ctx.translate(canvas.width / 2 + pan.x, canvas.height / 2 + pan.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    // 非本番環境ではダミー画像を、本番環境ではビデオを転送
    const source = (!IS_PRODUCTION && dummyImageRef.current && isDummyImageLoaded) 
      ? dummyImageRef.current 
      : video;
    
    // イメージを転送
    ctx.drawImage(source, x, y, width, height);
  };

  // requestAnimationFrameによる描画ループ
  const draw = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas || status !== 'ready') return;

    // 非本番環境でダミー画像を使用する場合
    const useDummyImage = !IS_PRODUCTION && dummyImageRef.current && isDummyImageLoaded;
    
    // ビデオまたはダミー画像のいずれかが利用可能である必要がある
    if (!useDummyImage && !video) return;

    // renderMetricsが初期値(0)の場合は描画をスキップする
    // これにより、正しいメトリクスが計算されるまでの間、不正なフレームの描画を防ぐ
    if (renderMetrics.renderWidth === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 毎フレームのメトリクス再計算を削除。状態の renderMetrics を直接使用
    const { renderWidth, renderHeight, offsetX, offsetY } = renderMetrics;

    ctx.save();

    try {
      if (onImageProcess) {
        onImageProcess(canvas, video, ctx, offsetX, offsetY, renderWidth, renderHeight, zoom, pan);
      } else {
        onDefaultImageProcess(canvas, video, ctx, offsetX, offsetY, renderWidth, renderHeight, zoom, pan);
      }
    } catch (error) {
      // drawImage失敗はconsole.warnのみ
      console.warn('drawImage failed', error);
    }

    ctx.restore();

    animeRequestRef.current = requestAnimationFrame(draw);
  }, [status, zoom, pan, renderMetrics, isDummyImageLoaded]);

  useEffect(() => {
    if (status === 'ready') {
      animeRequestRef.current = requestAnimationFrame(draw);
    }
    return () => {
      if (animeRequestRef.current) cancelAnimationFrame(animeRequestRef.current);
    };
  }, [status, draw]);


  // --- ズーム・パンロジック ---
  const MOUSE_WHEEL_DELTA = 0.004;

  // パンの制限ロジック
  const clampPan = (newPanX: number, newPanY: number, zoomRatio: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };

    const { maxPanX, maxPanY } = calculateMaxPanOffsets(
      zoomRatio,
      renderMetricsRef.current,
      canvasRef.current.width,
      canvasRef.current.height
    );

    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, newPanX)),
      y: Math.max(-maxPanY, Math.min(maxPanY, newPanY))
    };
  };

  // パンをずらす
  const shiftPan = (dx, dy) => {
      const clamped = clampPan(pan.x + dx, pan.y + dy, zoom);
      setPanState(clamped);
  };

  // --- PC: マウスホイールでズーム ---
  const handleWheel = (event: WheelEvent) => {
    if (event.ctrlKey) { // Ctrl + ホイール
      event.preventDefault();
      // 現在の zoom state を取得するために setZoomState の関数形式を使用
      setZoomState(prevZoom => {
      const delta = -event.deltaY * MOUSE_WHEEL_DELTA;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom + delta));
      const clamped = clampPan(pan.x, pan.y, newZoom);
      setPanState(clamped);
      return newZoom;
      });
    }
  };

  // --- PC: マウスドラッグでパン ---
  let isDragging = false;
  let lastMouseX = 0, lastMouseY = 0;

  const handleMouseDown = useCallback((event: MouseEvent) => {
    console.log("mouse button down");
    if (event.button === 1) { // 中央ボタン
      event.preventDefault();
      isDraggingRef.current = true;
      lastMousePosRef.current = { x: event.clientX, y: event.clientY };
    }
  }, []);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isDraggingRef.current) return;
    console.log("mouse dragging");
    event.preventDefault();
    
    const dx = event.clientX - lastMousePosRef.current.x;
    const dy = event.clientY - lastMousePosRef.current.y;
    
    setPanState(prevPan => 
      clampPan(prevPan.x + dx, prevPan.y + dy, zoom)
    );
    
    lastMousePosRef.current = { x: event.clientX, y: event.clientY };
  }, [clampPan, zoom]);

  const handleMouseUp = useCallback(() => {
    console.log("mouse button up");
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
  }, []);

  // --- Touch: ピンチズーム & パン ---

  const getDistance = (t1: Touch, t2: Touch) => {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  };

  const getCenter = (t1: Touch, t2: Touch) => {
    return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
  };

  const handleTouchStart = useCallback((event: TouchEvent) => {
    if (event.touches.length === 2) {
      console.log("touch start");
      event.preventDefault();
      lastTouchDistanceRef.current = getDistance(event.touches[0], event.touches[1]);
      lastTouchCenterRef.current = getCenter(event.touches[0], event.touches[1]);
    }
  }, []);

  const handleTouchMove = useCallback((event: TouchEvent) => {
    if (event.touches.length === 2) { // 2本指操作
      console.log("touch move");
      event.preventDefault();

      setZoomState(prevZoom => {
        const t1 = event.touches[0], t2 = event.touches[1];
        const newDist = getDistance(t1, t2);
        const zoomDelta = (newDist - lastTouchDistanceRef.current) * 0.01;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom + zoomDelta));

        // パン処理 (ズーム後の新しい値を使用)
        const newCenter = getCenter(t1, t2);
        const dx = newCenter.x - lastTouchCenterRef.current.x;
        const dy = newCenter.y - lastTouchCenterRef.current.y;
        setPanState(prevPan => clampPan(prevPan.x + dx, prevPan.y + dy, newZoom));

        lastTouchDistanceRef.current = newDist;
        lastTouchCenterRef.current = newCenter;

        return newZoom;
      });
    }
  }, [clampPan]);

  // イベントリスナーの設定
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // リスナー登録 (passive: false)
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mousedown', handleMouseDown, { passive: false });
    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleMouseUp, { passive: false });
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp, handleTouchStart, handleTouchMove]);

  // フォールバック用のダウンロード関数
  const downloadFallback = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = fileName;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 画像の保存(Android用)
  const saveImageToGallery = (blob, fileName) => {
    console.assert(isAndroidApp);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result.split(',')[1];
      if (typeof window.android.saveImageToGallery === 'function') {
        try {
          window.android.saveImageToGallery(base64data, fileName);
          console.log('Saved image:', fileName);
        } catch (error) {
          console.assert(false);
          console.error('android インタフェース呼び出しエラー:', error);
          downloadFallback(blob, fileName);
        }
      } else {
        console.assert(false);
        downloadFallback(blob, fileName);
      }
    };
    reader.readAsDataURL(blob);
  };

  // --- 写真撮影ロジック ---
  const takePhoto = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    // シャッター音再生
    playSound(shutterAudioRef.current);

    try {
      // 映像が実際に描画されている領域を計算
      const { renderWidth, renderHeight, offsetX, offsetY } = renderMetrics;
      
      // ズームとパンを考慮した描画領域を計算
      const zoomedWidth = renderWidth * zoom;
      const zoomedHeight = renderHeight * zoom;
      
      // 切り取り領域の計算（キャンバス座標系）
      const cropX = Math.max(0, (canvas.width - zoomedWidth) / 2 - pan.x);
      const cropY = Math.max(0, (canvas.height - zoomedHeight) / 2 - pan.y);
      const cropWidth = Math.min(zoomedWidth, canvas.width);
      const cropHeight = Math.min(zoomedHeight, canvas.height);

      // 新しいキャンバスを作成して、映像部分のみを描画
      const photoCanvas = document.createElement('canvas');
      photoCanvas.width = cropWidth;
      photoCanvas.height = cropHeight;
      const photoCtx = photoCanvas.getContext('2d');
      
      if (!photoCtx) {
        console.error('Failed to get photo canvas context');
        alert(t('ac_taking_photo_failed'));
        return;
      }

      // 元のキャンバスから映像部分のみを切り取ってコピー
      photoCtx.drawImage(
        canvas,
        cropX, cropY, cropWidth, cropHeight,  // 元のキャンバスの切り取り領域
        0, 0, cropWidth, cropHeight            // 新しいキャンバスの描画領域
      );

      // 新しいキャンバスを Blob (JPEG) として保存
      photoCanvas.toBlob((blob) => {
        if (!blob) {
          console.error('Failed to create photo blob');
          alert(t('ac_taking_photo_failed'));
          return;
        }

        // 拡張子
        let extension;
        switch (photoFormat) {
        case 'image/png': extension = 'png'; break;
        case 'image/tiff': extension = 'tif'; break;
        case 'image/webp': extension = 'webp'; break;
        case 'image/jpeg': default: extension = 'jpg'; break;
        }

        // ファイル名
        const fileName = generateFileName(t('ac_text_photo') + '_', extension);

        if (isAndroidApp) {
          saveImageToGallery(blob, fileName);
        } else {
          downloadFallback(blob, fileName);
        }
      }, photoFormat, photoQuality); // JPEG形式
    } catch (error) {
      console.error('Photo capture failed', error);
      alert(t('ac_taking_photo_failed'));
    }
  };

  // --- 録画・マイク制御 ---

  // マイク切り替え
  const toggleMic = () => {
    const newState = audio && !micEnabled;
    setMicEnabled(newState);
    // 設定保存
    localStorage.setItem('AdvancedCamera_micEnabled', String(newState));
  };

  // ビデオをギャラリーに保存(Android専用)
  const saveVideoToGallery = (blob, fileName) => {
    console.assert(isAndroidApp);
    const reader = new FileReader();
    reader.onloadend = () => {
      // Base64エンコードされた文字列（データURI）を取得
      const base64Data = reader.result.split(',')[1];
      // Kotlin側の関数を呼び出す
      try {
        window.android.saveVideoToGallery(base64Data, fileName);
        console.log('保存完了:' + fileName);
      } catch (error) {
        console.error('android インタフェース呼び出しエラー:', error);
        alert(t('ac_saving_movie_failed', { error: error }));
      }
    };
    reader.readAsDataURL(blob); // BlobをBase64に変換
  };

  // 録画開始
  const startRecording = async () => {
    try {
      if (!canvasRef.current) return; // キャンバスがない？

      // ビデオ録画開始音を再生
      playSound(videoStartAudioRef.current);

      // 映像ストリーム
      const canvasStream = canvasRef.current.captureStream(30);
      const tracks = [...canvasStream.getVideoTracks()];

      // 音声ストリーム
      if (hasMic && micEnabled) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          tracks.push(...audioStream.getAudioTracks());
        } catch (error) {
          console.warn('Mic access failed during record start', error);
        }
      }

      // 結合
      const combinedStream = new MediaStream(tracks);

      // フォーマット確認
      let mimeType = 'video/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/mp4'; // fallback
      }

      const recorder = new MediaRecorder(combinedStream, { mimeType });
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      // 停止時・エラー時のダウンロード処理
      recorder.onstop = () => {
        // トラック停止
        combinedStream.getTracks().forEach(t => t.stop());
        setIsRecording(false);
        setRecordingTime(0);

        // ビデオ録画完了音を再生
        playSound(videoCompleteAudioRef.current);

        const extension = mimeType.includes('mp4') ? 'mp4' : 'webm'; // 拡張子
        const fileName = generateFileName(t('ac_text_video') + '_', extension); // ファイル名
        const blob = new Blob(chunks, { type: mimeType });
        if (isAndroidApp) {
          saveVideoToGallery(blob, fileName);
        } else {
          downloadFallback(blob, fileName);
        }
      };

      // ストリーム切断検知
      combinedStream.getVideoTracks()[0].onended = () => {
        recorder.stop();
        setStatus('noDevice');
        alert(t('ac_recording_disconnected'));
      };

      // エラー時の処理
      recorder.onerror = (error) => {
        console.error('MediaRecorder Error', error);
        recorder.stop();
        alert(t('ac_recording_error', error.toString()));
      };

      recorder.start(1000); // 1秒ごとにチャンク作成
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (error) {
      console.error('Recording start failed', error);
      alert(t('ac_recording_cannot_start', error));
    }
  };

  // 録画停止
  const stopRecording = async () => {
    mediaRecorderRef.current?.stop();
  };

  // 録画開始・停止の切り替え
  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // 録画タイマー
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);


  // --- アクセシビリティ (キーボード操作) ---
  //
  const KEYBOARD_PAN_DELTA = 20;
  const KEYBOARD_ZOOM_DELTA = 0.1;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch(event.key) {
      case ' ': // Space: 写真撮影
        if (event.ctrlKey && event.shiftKey) { // Ctrl+Shift+Space: 写真撮影
          event.preventDefault();
          takePhoto();
        }
        break;
      case 'r': case 'R':
        if (event.ctrlKey && event.shiftKey) { // Ctrl+Shift+R: 録画の開始／終了
          event.preventDefault();
          toggleRecording();
        }
        break;
      case '+': // +: ズームイン
      case ';': // (日本語キーボード対応用)
        event.preventDefault();
        const newZoomIn = Math.min(MAX_ZOOM, zoom + KEYBOARD_ZOOM_DELTA);
        setZoomState(newZoomIn);
        break;
      case '-': // -: ズームアウト
        event.preventDefault();
        const newZoomOut = Math.max(MIN_ZOOM, zoom - KEYBOARD_ZOOM_DELTA);
        setZoomState(newZoomOut);
        break;
      // パン操作 (Ctrl + 矢印)
      case 'ArrowUp':
        if (event.ctrlKey) {
          event.preventDefault();
          shiftPan(0, +KEYBOARD_PAN_DELTA);
        }
        break;
      case 'ArrowDown':
        if (event.ctrlKey) {
          event.preventDefault();
          shiftPan(0, -KEYBOARD_PAN_DELTA);
        }
        break;
      case 'ArrowLeft':
        if (event.ctrlKey) {
          event.preventDefault();
          shiftPan(KEYBOARD_PAN_DELTA, 0);
        }
        break;
      case 'ArrowRight':
        if (event.ctrlKey) {
          event.preventDefault();
          shiftPan(-KEYBOARD_PAN_DELTA, 0);
        }
        break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clampPan]);

  const onContextMenu = (event) => {
    // 製品版の場合はコンテキストメニューを禁止
    if (IS_PRODUCTION)
      event.preventDefault();
  };

  return (
    <div className="advanced-camera" ref={containerRef} onContextMenu={onContextMenu}>
      {/* 非表示の Video 要素 */}
      <video ref={videoRef} className="advanced-camera__video-source" autoPlay playsInline muted />

      {/* 描画用 Canvas */}
      <canvas
        ref={canvasRef}
        className="advanced-camera__viewport"
        tabIndex={0}
        aria-label="Camera Viewport"
      />

      {/* UI オーバーレイ */}
      {status === 'initializing' && (
        <div className="advanced-camera__overlay">
          <RefreshCw className="spin" size={48} />
          <p className="advanced-camera__overlay-text">{t('ac_starting_camera')}</p>
        </div>
      )}
      {status === 'switching' && (
        <div className="advanced-camera__overlay">
          <RefreshCw className="spin" size={48} />
          <p className="advanced-camera__overlay-text">{t('ac_switching_camera')}</p>
        </div>
      )}
      {status === 'noPermission' && (
        <div className="advanced-camera__overlay">
          <VideoOff size={48} color="red" />
          <p className="advanced-camera__overlay-text">
            {t('ac_no_camera_permission')}
          </p>
          <p className="advanced-camera__overlay-description">
            {t('ac_no_camera_permission_2')}
          </p>
          {/* 再起動ボタン */}
          <button className="advanced-camera__restart-btn" onClick={handleRestart}>
            {t('ac_restart_app')}
          </button>
        </div>
      )}
      {status === 'noDevice' && (
        <div className="advanced-camera__overlay">
          <CameraOff size={48} color="red" />
          <p className="advanced-camera__overlay-text">{t('ac_no_camera_found')}</p>
          <p className="advanced-camera__overlay-description">{t('ac_no_camera_found_2')}</p>
          {/* 再起動ボタン */}
          <button className="advanced-camera__restart-btn" onClick={handleRestart}>
            {t('ac_restart_app')}
          </button>
        </div>
      )}

      {/* 録画中タイマー */}
      {isRecording && status === 'ready' && (
        <div className="advanced-camera__timer">
          {formatTime(recordingTime)}
        </div>
      )}

      {/* ズーム倍率表示 */}
      {status === 'ready' && (
        <div className="advanced-camera__zoom-display">
          {zoom.toFixed(1)}x
        </div>
      )}


      {/* コントロールパネル */}
      {status === 'ready' && showControls && (
        <div className={`advanced-camera__controls ${isRecording ? 'advanced-camera__controls--recording' : ''}`}>

          {/* 1. マイクON/OFF ボタン */}
          {showMic && (
            <button
              className={`advanced-camera__button advanced-camera__button--microphone ${hasMic && micEnabled ? 'advanced-camera__button--mic-on' : 'advanced-camera__button--mic-off'}`}
              onClick={toggleMic}
              disabled={!hasMic || isRecording || (!IS_PRODUCTION && isDummyImageLoaded)}
              aria-label={micEnabled ? t('ac_mute_microphone') : t('ac_enable_microphone')}
            >
              {hasMic && micEnabled ? <Mic size={ICON_SIZE} /> : <MicOff size={ICON_SIZE} />}
            </button>
          )}

          {/* 2. 写真撮影 ボタン */}
          {showTakePhoto && (
            <button
              className="advanced-camera__button advanced-camera__button--photo"
              onClick={takePhoto}
              aria-label={t('ac_take_photo')}
            >
              <Camera size={ICON_SIZE} />
            </button>
          )}

          {/* 3. 録画/停止 ボタン */}
          {showRecord && (
            <button
              className={`advanced-camera__button advanced-camera__button--record ${isRecording ? 'is-recording' : ''}`}
              onClick={toggleRecording}
              aria-label={isRecording ? t('ac_stop_recording') : t('ac_start_recording')}
            >
              <Video size={ICON_SIZE} />
            </button>
          )}
          </div>
      )}

      {/* 「カメラ切り替え」ボタン */}
      {status === 'ready' && showControls && (
        <button
          className="advanced-camera__button advanced-camera__button--switch"
          onClick={switchCamera}
          disabled={isRecording || (!IS_PRODUCTION && isDummyImageLoaded)}
          aria-label={t('ac_switch_camera')}
        >
          <SwitchCamera size={ICON_SIZE} />
        </button>
      )}
    </div>
  );
};

export default AdvancedCamera;