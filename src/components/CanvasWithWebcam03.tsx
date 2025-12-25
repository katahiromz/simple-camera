// webcam03-with-canvas.tsx
import React, { useRef, useState, useCallback, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import Webcam03, { FacingMode } from './Webcam03';
import Webcam03Controls from './Webcam03Controls';
import { PermissionManager, PermissionStatusValue } from './permission-watcher';
import { isAndroidApp, clamp, generateFileName, playSound, photoFormatToExtension, videoFormatToExtension, formatTime, getMaxOffset } from './utils';
import { saveFile } from './utils';

/* lucide-reactのアイコンを使用: https://lucide.dev/icons/ */
import { Camera } from 'lucide-react';

const ENABLE_USER_ZOOMING = true; // ユーザーによるズームを有効にするか？
const ENABLE_USER_PANNING = true; // ユーザーによるパン操作を有効にするか？
const ENABLE_SOUND_EFFECTS = true; // 効果音を有効にするか？
const ENABLE_CAMERA_SWITCH = true; // ユーザーによるカメラ切り替えを有効にするか？
const ENABLE_PANNING_REGISTANCE = true; // パン操作に抵抗を導入するか？
const SHOW_RECORDING_TIME = true; // 録画時間を表示するか？
const SHOW_CONTROLS = true; // コントロール パネルを表示するか？
const SHOW_ERROR = true; // エラーを表示するか？
const SHOW_TAKE_PHOTO = true; // 写真撮影ボタンを表示するか？
const SHOW_RECORDING = true; // 録画開始・録画停止ボタンを表示するか？
const USE_MIDDLE_BUTTON_FOR_PANNING = true; // パン操作にマウスの中央ボタンを使用するか？
const MIN_ZOOM = 1.0; // ズーム倍率の最小値
const MAX_ZOOM = 4.0; // ズーム倍率の最大値
const ZOOM_DELTA = 0.2; // ズーム倍率のステップ
const MOUSE_WHEEL_SPEED = 0.004; // マウスホイールの速度
const MOUSE_WHEEL_PAN_SPEED = 0.1; // マウスホイールによるパンの速度
const PAN_SPEED = 10; // パンの速度
const BACKGROUND_IS_WHITE = false; // 背景は白か？

// CanvasWithWebcam03のprops
interface CanvasWithWebcam03Props {
  shutterSoundUrl?: string;
  videoStartSoundUrl?: string;
  videoCompleteSoundUrl?: string;
  onUserMedia?: (stream: MediaStream) => void;
  onUserMediaError?: (error: string | DOMException) => void;
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
  showRecordingTime?: boolean;
  showTakePhoto?: boolean;
  showRecording?: boolean;
  showCameraSwitch?: boolean;
};

// カメラ付きキャンバスのハンドル
interface CanvasWithWebcam03Handle {
  canvas?: HTMLCanvasElement;
  controls?: HTMLElement;
  getZoomRatio?: () => number;
  setZoomRatio?: (ratio: number) => void;
  startRecording?: () => void;
  stopRecording?: () => void;
  zoomIn?: () => void;
  zoomOut?: () => void;
  isRecording?: () => boolean;
  getPan?: () => { x: number, y: number };
  setPan?: (newPanX: number, newPanY: number) => void;
  getRealFacingMode?: () => string | null;
  panLeft?: () => void;
  panRight?: () => void;
  panUp?: () => void;
  panDown?: () => void;
};

// タッチ距離を計算
const getDistance = (touches: React.TouchList | TouchList) => {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
};

// 抵抗付きの値制限
const applyResistance = (current: number, limit: number) => {
  const RESISTANCE = 0.8; // 境界外での移動効率
  if (current > limit) {
    // 右/下側の境界を超えた場合
    const overflow = current - limit;
    return limit + (overflow * RESISTANCE);
  } else if (current < -limit) {
    // 左/上側の境界を超えた場合
    const overflow = current + limit;
    return -limit + (overflow * RESISTANCE);
  }
  return current;
};

// カメラ付きキャンバス CanvasWithWebcam03 の本体
const CanvasWithWebcam03 = forwardRef<CanvasWithWebcam03Handle, CanvasWithWebcam03Props>((
  {
    shutterSoundUrl = null,
    videoStartSoundUrl = null,
    videoCompleteSoundUrl = null,
    onUserMedia = null,
    onUserMediaError = null,
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
    showRecordingTime = true,
    showTakePhoto = true,
    showRecording = true,
    showCameraSwitch = true,
    ...rest
  },
  ref
) => {
  const webcamRef = useRef(null); // Webcam03への参照
  const canvasRef = useRef(null); // キャンバスへの参照
  const controlsRef = useRef(null); // コントロール パネル (Webcam03Controls)への参照
  const animationRef = useRef(null); // アニメーションフレーム要求への参照
  const mediaRecorderRef = useRef<MediaRecorder | null>(null); // メディア レコーダー
  const chunksRef = useRef<Blob[]>([]); // 録画用のchunkデータ
  const [errorString, setErrorString] = useState<string | null>(null); // エラー文字列
  const [isRecordingNow, setIsRecordingNow] = useState(false); // 録画中か？
  const [zoomValue, setZoomValue] = useState(1.0); // ズーム倍率
  const zoomRef = useRef(zoomValue); // ズーム参照
  const [recordingTime, setRecordingTime] = useState(0); // 録画時間量
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // パン操作用
  const offsetRef = useRef(offset); // パン操作用
  const isDragging = useRef(false); // パン操作用
  const lastPos = useRef({ x: 0, y: 0 }); // パン操作用
  const initialPinchDistance = useRef<number | null>(null); // 初期のピンチング距離
  const initialZoomAtPinchStart = useRef<number>(1.0); // ピンチング開始時のズーム倍率
  const [facingMode, setFacingMode] = useState<FacingMode>('environment'); // カメラの前面・背面
  const [isSwitching, setIsSwitching] = useState(false); // カメラ切り替え中？
  const [isInitialized, setIsInitialized] = useState(false); // 初期化済みか？

  // videoConstraints をメモ化する (重要)
  const videoConstraints = useMemo(() => ({
    facingMode: { ideal: facingMode },
  }), [facingMode]);

  // 常にoffsetRefをoffset stateに合わせる
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

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

  // ズーム変更時にオフセットを境界内に戻す
  useEffect(() => {
    if (!ENABLE_USER_PANNING) return;
    if (!webcamRef.current?.video) return;
    const video = webcamRef.current.video;

    setOffset(prev => {
      const max = getMaxOffset(video.videoWidth, video.videoHeight, zoomValue);
      return {
        x: Math.max(-max.x, Math.min(max.x, prev.x)),
        y: Math.max(-max.y, Math.min(max.y, prev.y))
      };
    });
  }, [zoomValue]);

  // シャッター音
  useEffect(() => {
    if (!ENABLE_SOUND_EFFECTS) return;
    try {
      if (shutterSoundUrl) {
        shutterAudioRef.current = new Audio(shutterSoundUrl);
        shutterAudioRef.current.load();
      }
    } catch (err) {
      console.error('Failed to initialize shutter audio:', err);
    }
    return () => {
      shutterAudioRef.current = null;
    };
  }, [shutterSoundUrl]);


  // ビデオ録画開始音
  useEffect(() => {
    if (!ENABLE_SOUND_EFFECTS) return;
    try {
      if (videoStartSoundUrl) {
        videoStartAudioRef.current = new Audio(videoStartSoundUrl);
        videoStartAudioRef.current.load();
      }
    } catch (err) {
      console.error('Failed to initialize shutter audio:', err);
    }
    return () => {
      videoStartAudioRef.current = null;
    };
  }, [videoStartSoundUrl]);

  // ビデオ録画完了音
  useEffect(() => {
    if (!ENABLE_SOUND_EFFECTS) return;
    try {
      if (videoCompleteSoundUrl) {
        videoCompleteAudioRef.current = new Audio(videoCompleteSoundUrl);
        videoCompleteAudioRef.current.load();
      }
    } catch (err) {
      console.error('Failed to initialize shutter audio:', err);
    }
    return () => {
      videoCompleteAudioRef.current = null;
    };
  }, [videoCompleteSoundUrl]);

  // カメラとマイクの監視を管理
  useEffect(() => {
    // インスタンスの生成
    const cameraManager = new PermissionManager('camera' as PermissionName);
    const micManager = new PermissionManager('microphone' as PermissionName);

    // 購読開始
    const unsubscribeCamera = cameraManager.subscribe((status) => {
      setCameraPermission(status);
      if (status === 'denied') {
        setErrorString("カメラの使用が拒否されています。アプリまたはブラウザの設定から許可してください。");
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

  // アニメーションフレームを次々と描画する関数
  const draw = useCallback(() => {
    if (webcamRef.current?.video && canvasRef.current) {
      const video = webcamRef.current.video;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) { // ビデオに十分なデータがある？
        // キャンバスをビデオのサイズに合わせる
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        let currentZoom = zoomRef.current;
        if (currentZoom === 1.0 && offsetRef.current.x == 0 && offsetRef.current.y == 0) {
          // ズームなし、パンなし？
          // イメージをそのまま転送
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } else { // ズームありか、パンあり？
          // 背景を塗りつぶす
          if (BACKGROUND_IS_WHITE) {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }

          // ソースのサイズ
          const sourceWidth = video.videoWidth / currentZoom;
          const sourceHeight = video.videoHeight / currentZoom;

          // Offsetを含めた中央基準の計算
          const maxOffsetX = (video.videoWidth - sourceWidth) / 2;
          const maxOffsetY = (video.videoHeight - sourceHeight) / 2;

          /// ソースの位置
          const sourceX = maxOffsetX + offsetRef.current.x;
          const sourceY = maxOffsetY + offsetRef.current.y;

          // イメージを拡大縮小して転送
          ctx.drawImage(
            video,
            sourceX, sourceY, sourceWidth, sourceHeight,
            0, 0, canvas.width, canvas.height
          );
        }

        // ちょっと図形を描いてみる
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

    // 次のアニメーション フレームを要求
    animationRef.current = requestAnimationFrame(draw);
  }, []);

  // アニメーション フレームを起動・終了
  useEffect(() => {
    animationRef.current = requestAnimationFrame(draw);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [draw]);

  // 写真を撮る
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
      setErrorString("写真撮影に失敗しました");
    }
  }, []);

  // --- 録画開始機能 ---

  // 録画開始
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

  // 録画停止
  const stopRecording = useCallback(() => {
    console.log('stopRecording');
    if (mediaRecorderRef.current && isRecordingNow) {
      mediaRecorderRef.current.stop();
      setIsRecordingNow(false);
    }
  }, [isRecordingNow]);

  // --- カメラ(前面・背面)切り替え ---
  const toggleCamera = useCallback(() => {
    console.log('toggleCamera');
    if (isRecordingNow) return;

    // 切り替え中ステートをON
    setIsSwitching(true);

    // パンとズームをリセット（カメラが変わると画角が変わるため）
    setZoomValue(1.0);
    setOffset({ x: 0, y: 0 });

    setFacingMode(prev => {
      // カメラが起動し、映像が安定するまで少し待ってから非表示にする（0.75秒程度）
      setTimeout(() => {
        setIsSwitching(false);
      }, 750);

      return (prev === "user" ? "environment" : "user");
    });
  }, [isRecordingNow]);

  // --- PC: マウスホイールでズーム ---
  const handleWheel = (event: WheelEvent) => {
    if (event.ctrlKey) { // Ctrl + ホイール
      event.preventDefault();
      if (!ENABLE_USER_ZOOMING)
        return;
      // 現在の zoomValue state を取得するために setZoomValue の関数形式を使用
      setZoomValue(prevZoom => {
        const delta = -event.deltaY * MOUSE_WHEEL_SPEED;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom + delta));
        return newZoom;
      });

      if (ENABLE_PANNING_REGISTANCE) {
        setOffset(prev => {
          return clampPan(prev.x, prev.y);
        });
      }
    } else if (event.shiftKey) { // Shift+ホイール
      setOffset(prev => {
        return clampPan(prev.x - event.deltaY * MOUSE_WHEEL_PAN_SPEED, prev.y);
      });
    } else {
      setOffset(prev => {
        return clampPan(prev.x, prev.y - event.deltaY * MOUSE_WHEEL_PAN_SPEED);
      });
    }
  };

  // マウスのボタンが押された／タッチが開始された
  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!ENABLE_USER_PANNING && !ENABLE_USER_ZOOMING) return;

    if (ENABLE_USER_ZOOMING && ('touches' in e) && e.touches.length === 2) {
      // ピンチ操作開始
      isDragging.current = false; // パンを優先させない
      initialPinchDistance.current = getDistance(e.touches);
      initialZoomAtPinchStart.current = zoomRef.current;

      // 二本指の中間点を初期位置として保存
      lastPos.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };

      return;
    }

    // 1本指ならパン操作へ

    if (USE_MIDDLE_BUTTON_FOR_PANNING && !('touches' in e)) {
      if (e.button != 1) return; // 中央ボタン？
    }

    if (e.button == 2) return; // 右ボタンは無視

    isDragging.current = true;
    const pos = 'touches' in e ? e.touches[0] : e;
    lastPos.current = { x: pos.clientX, y: pos.clientY };
  };

  // パン操作(平行移動)を制限する関数
  const clampPan = (x: number, y: number, newZoom: number | null = null) => {
    const video = webcamRef.current.video;
    const max = getMaxOffset(video.videoWidth, video.videoHeight, newZoom ? newZoom : zoomRef.current);
    return { x: clamp(-max.x, x, max.x), y: clamp(-max.y, y, max.y) };
  };

  // 境界での抵抗を考慮したパン制限関数
  const clampPanWithResistance = useCallback((x: number, y: number, newZoom: number | null = null) => {
    if (!ENABLE_PANNING_REGISTANCE)
      return clampPan(x, y, newZoom);

    const video = webcamRef.current?.video;
    if (!video) return { x, y };

    const max = getMaxOffset(video.videoWidth, video.videoHeight, newZoom ? newZoom : zoomRef.current);

    return {
      x: applyResistance(x, max.x),
      y: applyResistance(y, max.y)
    };
  }, []);

  // マウスが動いた／タッチが動いた
  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!ENABLE_USER_ZOOMING && !ENABLE_USER_PANNING) return;
    const video = webcamRef.current?.video;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // 1. 二本指操作（ズーム ＋ パン）
    if ('touches' in e && e.touches.length === 2) {
      if (initialPinchDistance.current === null) return;

      e.preventDefault();

      // --- ズーム計算 ---
      const currentDistance = getDistance(e.touches);
      const pinchScale = currentDistance / initialPinchDistance.current;
      const oldZoom = zoomRef.current;
      const newZoom = clamp(
        MIN_ZOOM,
        initialZoomAtPinchStart.current * pinchScale,
        MAX_ZOOM
      );

      // --- 中心点の移動（パン）計算 ---
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      // 前回の中心点からの移動量を計算（lastPos に中心点を保存しておく必要があるため handleMouseDown も後述の通り修正）
      const dx = centerX - lastPos.current.x;
      const dy = centerY - lastPos.current.y;

      // ビデオ座標系への変換
      const scaleX = video.videoWidth / canvas.clientWidth;
      const scaleY = video.videoHeight / canvas.clientHeight;
      const moveX = mirrored ? -dx * scaleX : dx * scaleX;
      const moveY = dy * scaleY;

      // --- 状態の更新 ---

      if (ENABLE_USER_ZOOMING)
        setZoomValue(newZoom);

      if (ENABLE_USER_PANNING) {
        setOffset(prev => {
          // A. 高度なズーム補正（指の間の位置を固定する）
          const rect = canvas.getBoundingClientRect();
          let relX = (centerX - rect.left) / rect.width;
          let relY = (centerY - rect.top) / rect.height;
          if (mirrored) relX = 1 - relX;

          const focalX = (relX - 0.5) * video.videoWidth;
          const focalY = (relY - 0.5) * video.videoHeight;
          const zoomFactor = (1 / oldZoom - 1 / newZoom);

          // B. 二本の指の移動によるパン
          // ズーム補正分に、指自体の移動(moveX, moveY)を加算する
          const nextX = prev.x + focalX * zoomFactor - moveX;
          const nextY = prev.y + focalY * zoomFactor - moveY;

          return clampPanWithResistance(nextX, nextY, newZoom);
        });
      }

      // 次回計算用に中心点を保存
      lastPos.current = { x: centerX, y: centerY };
      return;
    }

    // 2. パン処理 (1本指またはマウス)
    if (!ENABLE_USER_PANNING || !isDragging.current || (!ENABLE_PANNING_REGISTANCE && zoomRef.current <= 1.0)) return;

    e.preventDefault();

    const pos = 'touches' in e ? (e as TouchEvent).touches[0] : (e as MouseEvent);
    const dx = pos.clientX - lastPos.current.x;
    const dy = pos.clientY - lastPos.current.y;

    // 1. 画面上のピクセル移動量をビデオの座標系（解像度）に変換
    // キャンバスの表示サイズとビデオの実際の解像度の比率を考慮
    const scaleX = video.videoWidth / canvas.clientWidth;
    const scaleY = video.videoHeight / canvas.clientHeight;

    // 2. 左右反転(mirrored)している場合は、X軸の移動方向を補正
    const moveX = mirrored ? -dx * scaleX : dx * scaleX;
    const moveY = dy * scaleY;

    setOffset(prev => {
      const nextX = prev.x - moveX, nextY = prev.y - moveY;
      return clampPanWithResistance(nextX, nextY);
    });

    lastPos.current = { x: pos.clientX, y: pos.clientY };
  }, [mirrored, clampPanWithResistance]);

  // マウスのボタンが離された／タッチが離された
  const handleMouseUp = (e: MouseEvent | TouchEvent) => {
    isDragging.current = false;
    initialPinchDistance.current = null;

    setOffset(prev => {
      return clampPan(prev.x, prev.y);
    });
  };

  // スタイルの整理
  const combinedCanvasStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
    objectFit: 'contain', // 映像全体を表示（余白は黒）。隙間なく埋めるなら 'cover'
    display: 'block',
    ...style,
    // 左右反転の処理を最後に結合
    transform: `${style?.transform || ""} ${mirrored ? "scaleX(-1)" : ""}`.trim(),
  };

  // イベントリスナーの設定
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // PCホイール
    const target = eventTarget ? eventTarget : canvas;
    target.addEventListener('wheel', handleWheel, { passive: false });

    // マウスイベント
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove); // 枠外対応
    window.addEventListener('mouseup', handleMouseUp);

    // タッチイベント
    canvas.addEventListener('touchstart', handleMouseDown, { passive: false });
    canvas.addEventListener('touchmove', handleMouseMove, { passive: false });
    canvas.addEventListener('touchend', handleMouseUp);

    return () => {
      target.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('touchstart', handleMouseDown);
      canvas.removeEventListener('touchmove', handleMouseMove);
      canvas.removeEventListener('touchend', handleMouseUp);
    };
  }, [handleMouseMove, eventTarget]);

  // ズーム倍率の取得
  const getZoomRatio = () => {
    return zoomValue;
  };
  // ズーム倍率の設定
  const setZoomRatio = (ratio: number) => {
    const newRatio = clamp(MIN_ZOOM, ratio, MAX_ZOOM);
    setZoomValue(newRatio);
  };

  // ズームイン
  const zoomIn = useCallback(() => {
    if (!ENABLE_USER_ZOOMING)
      return;
    const newValue = clamp(MIN_ZOOM, zoomValue + ZOOM_DELTA, MAX_ZOOM);
    setZoomValue(newValue);
  }, [zoomValue]);

  // ズームアウト
  const zoomOut = useCallback(() => {
    if (!ENABLE_USER_ZOOMING)
      return;
    const newValue = clamp(MIN_ZOOM, zoomValue - ZOOM_DELTA, MAX_ZOOM);
    setOffset(prev => {
      return clampPan(prev.x, prev.y, newValue);
    });
    setZoomValue(newValue);
  }, [zoomValue, clampPan]);

  // 録画中かを返す
  const isRecording = useCallback(() => {
    return isRecordingNow;
  }, [isRecordingNow]);

  // パンを返す
  const getPan = useCallback(() => {
    return offset;
  }, [offset]);
  // パンを設定する
  const setPan = useCallback((newPanX: number, newPanY: number) => {
    setOffset({ x: clamp(-max.x, newPanX, max.x), y: clamp(-max.y, newPanY, max.y) });
  }, []);

  // 本当の facingMode (前面・背面)を返す
  const getRealFacingMode = useCallback((): string | null => {
    return webcamRef.current?.getRealFacingMode();
  }, []);

  const onUserMediaBridge = useCallback((stream: MediaStream) => {
    setIsInitialized(true);
    setErrorString('');
    if (onUserMedia) onUserMedia(stream);
  }, [onUserMedia]);

  const onUserMediaErrorBridge = useCallback((error: string | DOMException) => {
    setIsInitialized(true);
    setErrorString(error.toString());
    if (onUserMediaError) onUserMediaError(error);
  }, [onUserMediaError]);

  // キーボードでパンを操作する？
  const panLeft = useCallback(() => {
    setOffset(prev => {
      return clampPan(prev.x - PAN_SPEED, prev.y);
    });
  }, [clampPan]);
  const panRight = useCallback(() => {
    setOffset(prev => {
      return clampPan(prev.x + PAN_SPEED, prev.y);
    });
  }, [clampPan]);
  const panUp = useCallback(() => {
    setOffset(prev => {
      return clampPan(prev.x, prev.y - PAN_SPEED);
    });
  }, [clampPan]);
  const panDown = useCallback(() => {
    setOffset(prev => {
      return clampPan(prev.x, prev.y + PAN_SPEED);
    });
  }, [clampPan]);

  useImperativeHandle(ref, () => ({
    canvas: canvasRef.current,
    controls: controlsRef.current,
    getZoomRatio: getZoomRatio.bind(this),
    setZoomRatio: setZoomRatio.bind(this),
    getPan: getPan.bind(this),
    setPan: setPan.bind(this),
    takePhoto: takePhoto.bind(this),
    startRecording: startRecording.bind(this),
    stopRecording: stopRecording.bind(this),
    isRecording: isRecording.bind(this),
    zoomIn: zoomIn.bind(this),
    zoomOut: zoomOut.bind(this),
    getRealFacingMode: getRealFacingMode.bind(this),
    panLeft: panLeft.bind(this),
    panRight: panRight.bind(this),
    panUp: panUp.bind(this),
    panDown: panDown.bind(this),
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

      {/* カメラのメッセージ */}
      {(!isInitialized || isSwitching) && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          padding: '15px 30px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          borderRadius: '30px',
          zIndex: 30, // コントロールより前面に
          fontSize: '16px',
          fontWeight: 'bold',
          pointerEvents: 'none', // クリックを透過させる
          display: 'flex',
          alignItems: 'center',
          textAlign: 'center',
          border: '1px solid white',
        }}>
          {(!isInitialized ? (
            <span><Camera size={50} color="white" /> <br />カメラ起動中...</span>
          ) : (
            <span><Camera size={50} color="white" /> <br />カメラを切り替え中...</span>
          ))}
        </div>
      )}

      {/* 権限エラーまたはその他のエラー表示 */}
      {SHOW_ERROR && (errorString || cameraPermission === 'denied') && (
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
          {errorString ? (
            errorString
          ) : (
            <span>カメラのアクセス権限が必要です。設定を確認してください。</span>
          )}
        </div>
      )}

      {/* 録画時間表示 */}
      {SHOW_RECORDING_TIME && showRecordingTime && isRecordingNow && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '10px',
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
          videoConstraints={videoConstraints}
          muted={true}
          onUserMedia={onUserMediaBridge}
          onUserMediaError={onUserMediaErrorBridge}
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
          {SHOW_CONTROLS && showControls ? (() => (
            <Webcam03Controls
              ref={controlsRef}
              isRecording={isRecordingNow}
              takePhoto={takePhoto}
              startRecording={startRecording}
              stopRecording={stopRecording}
              toggleCamera={toggleCamera}
              showTakePhoto={SHOW_TAKE_PHOTO && showTakePhoto}
              showRecording={SHOW_RECORDING && showRecording}
              showCameraSwitch={ENABLE_CAMERA_SWITCH && showCameraSwitch}
            />
          )) : (() => (<></>))}
        </Webcam03>
      )}
    </div>
  );
});

export default CanvasWithWebcam03;