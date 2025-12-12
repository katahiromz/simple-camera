import React, { useRef, useState, useEffect, useCallback } from 'react';
import './App.css';

const IS_PRODUCTION = import.meta.env.MODE === 'production'; // 製品版か？
const IS_JAPAN_OR_KOREA = true; // 日本か韓国か？ 判定が面倒臭いので常に仮定

// アプリケーションのベースパスを取得
const BASE_URL = import.meta.env.BASE_URL;

// カメラのシャッター音。
const cameraShutterSoundUrl = `${BASE_URL}camera-shutter-sound.mp3`;
// ビデオ録画開始の音。
const videoStartedSoundUrl = `${BASE_URL}video-started.mp3`;
// ビデオ録画完了の音。
const videoCompletedSoundUrl = `${BASE_URL}video-completed.mp3`;

// Androidアプリ内で実行されているか確認
const isAndroidApp = typeof window.android !== 'undefined';

const MAX_RECORDING_SECONDS = 2 * 60 * 60; // 最大録画時間（2時間）

function App() {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]); // 録画用チャンクデータ

  // 状態管理
  const [stream, setStream] = useState(null); // ストリーム
  const [isRecording, setIsRecording] = useState(false); // 録画中か？
  const [zoom, setZoom] = useState(1); // ズーム倍率
  const [capabilities] = useState({ min: 1, max: 8 }); // ズーム倍率などのカメラの能力
  const [recordingTime, setRecordingTime] = useState(0); // 録画時間 (秒)
  const timerIntervalRef = useRef(null); // タイマーID
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 }); // X, Yオフセット (CSS適用用)
  const panStartRef = useRef({ x: 0, y: 0 }); // パン開始時の座標
  const panOffsetRef = useRef(panOffset); // 最新の panOffset を保持

  // カメラの向き ('environment': 背面, 'user': 前面)
  const [facingMode, setFacingMode] = useState('environment');

  const touchDistanceRef = useRef(null); // タッチ操作関連
  const zoomRef = useRef(zoom); // ズーム倍率参照

  const isDraggingRef = useRef(false); // マウスドラッグ中かどうか
  const dragStartMousePosRef = useRef({ x: 0, y: 0 }); // ドラッグ開始時のマウス座標

  const isAudioEnabled = useRef(false); // 音声が利用可能か？

  const cameraShutterSoundRef = useRef(null); // シャッター音参照
  const videoStartedSoundRef = useRef(null); // 録画開始の音
  const videoCompletedSoundRef = useRef(null); // 録画完了の音

  useEffect(() => {
    zoomRef.current = zoom;
    panOffsetRef.current = panOffset;
    if (IS_JAPAN_OR_KOREA) { // 日本と韓国ではシャッタ―音を鳴らさなければならない。
      cameraShutterSoundRef.current = new Audio(cameraShutterSoundUrl);
      videoStartedSoundRef.current = new Audio(videoStartedSoundUrl);
      videoCompletedSoundRef.current = new Audio(videoCompletedSoundUrl);
    }
  }, [zoom, panOffset]);

  // 初回のみストレージ権限を要求
  useEffect(() => {
    const requestStoragePermission = async () => {
      if (isAndroidApp && typeof window.android.requestStoragePermission === 'function') {
        try {
          await window.android.requestStoragePermission();
          console.log('ストレージ権限の要求が完了しました');
        } catch (e) {
          console.warn('ストレージ権限の要求に失敗:', e);
        }
      }
    };
    requestStoragePermission();
  }, []); // 初回マウント時のみ実行

  // --- カメラアクセスロジック ---

  useEffect(() => {
    let currentStream = null;

    // カメラを要求する(再帰関数)
    const requestCamera = async (facingMode, audio, retry = 0) => {
      if (retry >= 4) return null;
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facingMode,
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: audio
        });
        isAudioEnabled.current = audio;
        return mediaStream;
      } catch (err) {
        if (err.name === 'NotFoundError') { // 見つからなかった
          if (audio)
            return requestCamera(facingMode, false, retry + 1);
          switch (facingMode) {
          case 'user':
            return requestCamera('environment', true, retry + 1);
          case 'environment':
            break;
          default:
            console.warn(`未知のfacingMode: ${facingMode}`);
          }
          return requestCamera('user', true, retry + 1);
        }
        // NotFoundError以外のエラー(PermissionDeniedErrorなど)
        console.error("カメラへのアクセスに失敗しました:", err);
        alert(`カメラへのアクセスに失敗しました: ${err.name}`);
      }
      return null;
    };

    // カメラをセットアップ
    const setupCamera = async () => {
      // ストリームを停止
      if (stream)
        stream.getTracks().forEach(track => track.stop());

      const mediaStream = await requestCamera(facingMode, true);
      if (!mediaStream) return; // カメラアクセス失敗時は終了

      currentStream = mediaStream;
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      setZoom(1);
    };
    setupCamera();

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [facingMode]);

  // ズーム適用関数
  const applyZoom = useCallback((newZoom) => {
    // newZoom が数値でない場合は安全側に倒す
    const numericZoom = Number(newZoom);
    if (Number.isNaN(numericZoom)) return capabilities.min;
    const { min, max } = capabilities;
    const clampedZoom = Math.max(min, Math.min(numericZoom, max));
    return clampedZoom;
  }, [capabilities]);

  // ホイール操作 (Ctrl + ホイール)
  const handleWheel = useCallback((e) => {
    if (e.ctrlKey) {
      e.preventDefault(); // デフォルト動作を防止
      const sensitivity = 0.3; // 感度調整用定数
      const delta = (e.deltaY > 0) ? -sensitivity : sensitivity; // ズーム倍率の差分
      const targetZoom = zoomRef.current + delta; // ズーム倍率の候補
      const clampedZoom = applyZoom(targetZoom); // 制限されたズーム倍率

      if (clampedZoom <= 1.0) { // ズームが100%以下なら
        setPanOffset({ x: 0, y: 0 }); // パンをゼロにリセット
      } else {
        // ズーム変更時にパンオフセットを新しい範囲内に制限
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        const maxPanX = (clampedZoom - 1) * containerWidth / 2;
        const maxPanY = (clampedZoom - 1) * containerHeight / 2;

        const currentPan = panOffsetRef.current;
        const newOffsetX = Math.max(-maxPanX, Math.min(currentPan.x, maxPanX));
        const newOffsetY = Math.max(-maxPanY, Math.min(currentPan.y, maxPanY));

        setPanOffset({ x: newOffsetX, y: newOffsetY });
      }

      setZoom(clampedZoom); // ズーム倍率を更新
    }
  }, [applyZoom]);

  // ピンチ操作用の距離計算
  const getDistance = (touches) => {
    return Math.hypot(
      touches[0].pageX - touches[1].pageX,
      touches[0].pageY - touches[1].pageY
    );
  };

  // ピンチ操作 (タッチイベント)
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      e.preventDefault(); // デフォルト動作を防止
      touchDistanceRef.current = getDistance(e.touches); // 距離を計算

      // パン開始位置を記録。二本の指の中点座標を計算
      const centerX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
      const centerY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
      panStartRef.current = {
        x: centerX - panOffsetRef.current.x, // 初期オフセットを考慮した開始点
        y: centerY - panOffsetRef.current.y
      };
    }
  }, []);

  // ピンチ操作 (タッチムーブ)
  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2) {
      e.preventDefault(); // デフォルト動作を防止

      const newDistance = getDistance(e.touches); // 距離を計算

      if (touchDistanceRef.current) { // タッチ距離情報があれば
        // --- ズーム処理 ---
        const distanceDiff = newDistance - touchDistanceRef.current;
        const zoomFactor = distanceDiff * 0.01;
        const targetZoom = zoomRef.current + zoomFactor;
        const clampedZoom = applyZoom(targetZoom);
        touchDistanceRef.current = newDistance; // 次の動きのために距離を更新
        setZoom(clampedZoom); // ステートを更新
        // --- ズーム処理ここまで ---

        // --- パン処理 (ズーム中も並行して行う) ---
        if (clampedZoom <= 1.0) { // ズームが1.0以下？
          setPanOffset({ x: 0, y: 0 }); // パンをリセット
        } else {
          // 二本の指の中点座標を計算
          const centerX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
          const centerY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
          // 移動量
          let newOffsetX = centerX - panStartRef.current.x;
          let newOffsetY = centerY - panStartRef.current.y;
          // コンテナのサイズ
          const containerWidth = containerRef.current.clientWidth;
          const containerHeight = containerRef.current.clientHeight;
          // ズームによるはみ出し量の半分が最大移動距離となる
          const maxPanX = (clampedZoom - 1) * containerWidth / 2;
          const maxPanY = (clampedZoom - 1) * containerHeight / 2;
          // 新しいパン オフセット
          newOffsetX = Math.max(-maxPanX, Math.min(newOffsetX, maxPanX));
          newOffsetY = Math.max(-maxPanY, Math.min(newOffsetY, maxPanY));
          setPanOffset({ x: newOffsetX, y: newOffsetY });
        }
        // --- パン処理ここまで ---
      }
    }
  }, [applyZoom, zoomRef, panStartRef]);

  // --- マウスドラッグ操作 ---
  const handleMouseDown = useCallback((e) => {
    // 中央ボタン (1) でドラッグを開始し、かつズームされている場合のみ許可
    if (e.button !== 1 || zoomRef.current <= 1.0) return;

    e.preventDefault(); // デフォルト動作を防止
    isDraggingRef.current = true; // ドラッグ中にする

    // ドラッグ開始時のマウス座標を記録
    dragStartMousePosRef.current = { x: e.pageX, y: e.pageY };

    // ドラッグ開始時の映像オフセットを記録
    panStartRef.current = panOffsetRef.current;
  }, []);

  // マウスが動いた
  const handleMouseMove = useCallback((e) => {
    if (!isDraggingRef.current || zoomRef.current <= 1.0) {
      if (zoomRef.current <= 1.0 && (panOffsetRef.current.x !== 0 || panOffsetRef.current.y !== 0)) {
        setPanOffset({ x: 0, y: 0 });
      }
      return;
    }

    e.preventDefault(); // デフォルト動作を防止

    // マウス移動量
    const dx = e.pageX - dragStartMousePosRef.current.x;
    const dy = e.pageY - dragStartMousePosRef.current.y;
    // 前回のオフセット(panStartRef)に移動量を加算
    let newOffsetX = panStartRef.current.x + dx;
    let newOffsetY = panStartRef.current.y + dy;
    // パンの範囲を制限するロジック (タッチ操作と共通)
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    // パンの最大値
    const maxPanX = (zoomRef.current - 1) * containerWidth / 2;
    const maxPanY = (zoomRef.current - 1) * containerHeight / 2;
    // 制限済みパン
    newOffsetX = Math.max(-maxPanX, Math.min(newOffsetX, maxPanX));
    newOffsetY = Math.max(-maxPanY, Math.min(newOffsetY, maxPanY));

    setPanOffset({ x: newOffsetX, y: newOffsetY });
  }, []); // Refのみに依存するため、依存配列は空で安定

  // マウスボタンが上がった
  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
    }
  }, []);

  // ズーム倍率とパンをリセットする
  const resetZoomAndPan = useCallback(() => {
    setZoom(applyZoom(1));
    setPanOffset({ x: 0, y: 0 });
  }, [applyZoom]);

  // --- useEffect によるリスナー登録 ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // イベントリスナーを登録（passiveはfalse）
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('mousedown', handleMouseDown, { passive: false });
    container.addEventListener('mousemove', handleMouseMove, { passive: false });
    container.addEventListener('mouseup', handleMouseUp, { passive: false });
    // 必要な時にイベントリスナーを登録解除
    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleWheel, handleTouchStart, handleTouchMove, handleMouseDown, handleMouseMove, handleMouseUp]);

  // --- その他の関数 ---

  // カメラの切り替え
  const switchCamera = () => {
    if (isRecording) return;
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  // 日時付きのファイル名を取得する
  const getFileNameWithDateTime = (prefix = "photo_", extension = ".png", date = new Date()) => {
    const dateTimeString = new Date().toLocaleString();
    // ファイル名に好ましくない文字は置き換える
    const fileName = `${prefix}${dateTimeString.replace(/[:. ]/g, '-')}${extension}`;
    return fileName;
  };

  // フォールバック用のダウンロード関数
  const downloadFallback = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 写真撮影
  const takePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');

    if (IS_JAPAN_OR_KOREA) { // 日本と韓国ではシャッタ―音を鳴らさなければならない
      // 音の前に音量の保存と調整
      try {
        window.android.onStartShutterSound();
      } catch (e) {}

      // シャッター音の再生
      cameraShutterSoundRef.current?.play().catch(e => console.error("シャッター音再生エラー:", e));

      // 音の後に音量の復元
      try {
        window.android.onEndShutterSound();
      } catch (e) {}
    }

    ctx.drawImage(videoRef.current, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) {
        console.error('画像のBlobの作成に失敗しました');
        return;
      }

      // 写真のファイル名
      const fileName = getFileNameWithDateTime("photo_", ".png");

      if (isAndroidApp) { // Androidアプリ内の場合
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result.split(',')[1];
          // AndroidネイティブのJavaScript Interfaceを呼び出してファイルを保存
          if (typeof window.android.saveImageToGallery === 'function') {
            try {
              window.android.saveImageToGallery(base64data, fileName);
              console.log('画像を保存しました:', fileName);
            } catch (e) {
              console.error('画像保存エラー:', e);
              // フォールバック: ダウンロードリンクを使用
              downloadFallback(blob, fileName);
            }
          } else {
            // メソッドが存在しない場合はフォールバック
            downloadFallback(blob, fileName);
          }
        };
        reader.readAsDataURL(blob);
      } else {
        // ブラウザの場合は通常のダウンロード
        downloadFallback(blob, fileName);
      }
    }, 'image/png');
  };

  // 録画の開始／停止
  const toggleRecording = () => {
    if (isRecording) {
      // 停止
      stopRecording();
    } else {
      // 開始
      startRecording();
    }
  };

  // ビデオをギャラリーに保存(Android専用)
  const saveVideoToGallery = (blob, fileName) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Base64エンコードされた文字列（データURI）を取得
      const base64Data = reader.result.split(',')[1];
      // Kotlin側の関数を呼び出す
      try {
        window.android.saveVideoToGallery(base64Data, fileName);
        alert(`動画をギャラリーに保存しました: ${fileName}`);
      } catch (error) {
        console.error('AndroidInterface 呼び出しエラー:', error);
        alert('動画の保存に失敗しました: ${error}');
      }
    };
    reader.readAsDataURL(blob); // BlobをBase64に変換
  };

  // 録画開始
  const startRecording = () => {
    if (!stream) return;
    chunksRef.current = []; // 録画用データをクリア

    // 既存のタイマーがあればクリア
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    setRecordingTime(0); // 録画時間をリセット

    // タイマーを開始
    const startTime = Date.now();
    timerIntervalRef.current = setInterval(() => {
        const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
        setRecordingTime(elapsedTime);

      // 経過時間が上限に達したら自動的に停止
      if (elapsedTime >= MAX_RECORDING_SECONDS) {
        stopRecording();
        alert(`録画時間が上限 (${formatTime(MAX_RECORDING_SECONDS)}) に達したため、自動的に停止しました。`);
      }
    }, 1000); // 1秒ごとに更新

    // メディアレコーダーを作成
    const options = { mimeType: 'video/webm; codecs=vp9' };
    try {
      mediaRecorderRef.current = new MediaRecorder(stream, options);
    } catch (e) {
      mediaRecorderRef.current = new MediaRecorder(stream);
    }

    // 必要な時に録画データを追加する
    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    // 録画を停止したときに、動画ファイルをダウンロード
    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/mp4' });
      // 写真のファイル名
      const fileName = getFileNameWithDateTime("video_", ".mp4");
      if (isAndroidApp) { // Androidアプリ内の場合?
        saveVideoToGallery(blob, fileName);
      } else { // ブラウザの場合
        downloadFallback(blob, fileName);
      }
    };

    // 録画開始
    mediaRecorderRef.current.start();
    setIsRecording(true);

    // 録画開始時に音を鳴らす
    if (IS_JAPAN_OR_KOREA) {
      // 音の前に音量の保存と調整
      try {
        window.android.onStartShutterSound();
      } catch (e) {}

      // 録画完了音の再生
      videoStartedSoundRef.current?.play().catch(e => console.error("ビデオ録画開始音再生エラー:", e));

      // 音の後に音量の復元
      try {
        window.android.onEndShutterSound();
      } catch (e) {}
    }
  };

  // 録画停止
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    // タイマーを停止
    if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
    }
    setRecordingTime(0); // 録画時間をリセット

    // 録画完了時に音を鳴らす
    if (IS_JAPAN_OR_KOREA) {
      // 音の前に音量の保存と調整
      try {
        window.android.onStartShutterSound();
      } catch (e) {}

      // 録画完了音の再生
      videoCompletedSoundRef.current?.play().catch(e => console.error("ビデオ録画完了音再生エラー:", e));

      // 音の後に音量の復元
      try {
        window.android.onEndShutterSound();
      } catch (e) {}
    }
  };

  // 録画時間を "MM:SS" 形式にフォーマットする関数
  const formatTime = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600); // 時間を計算
    const remainingSeconds = totalSeconds % 3600;
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const pad = (num) => num.toString().padStart(2, '0');

    if (hours > 0) {
      // 1時間以上の場合: H:MM:SS (例: 1:05:30)
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    } else {
      // 1時間未満の場合: MM:SS (例: 05:30)
      return `${pad(minutes)}:${pad(seconds)}`;
    }
  };

  return (
    <div
      ref={containerRef}
      className="camera-container"
    >
      {/* ビデオ */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`video-feed ${facingMode === 'user' ? 'mirrored' : ''}`}
        style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})` }}
      />

      {/* ズーム倍率表示 */}
      <div className="zoom-controls">
        <span className="zoom-display">{(zoom * 100).toFixed(0) + '%'}</span>
        {zoom !== 1 && (
          <button className="reset-zoom-btn" onClick={resetZoomAndPan}>
            1:1
          </button>
        )}
      </div>

      {/* ★ 録画時間表示エリアの追加 */}
      {isRecording && (
        <div className="recording-time-display">
          {formatTime(recordingTime)}
        </div>
      )}

      {/* カメラ切り替えボタン (右上) */}
      <button
        className="btn switch-camera-btn"
        onClick={switchCamera}
        disabled={isRecording}
      >
        ↕
      </button>

      {/* コントロール */}
      <div className="controls">
        <button className="btn photo-btn" onClick={takePhoto} disabled={isRecording}>
          📷
        </button>

        <button
          className={`btn video-btn ${isRecording ? 'recording' : ''}`}
          onClick={toggleRecording}
        >
          {isRecording ? '⏹' : '🎥'}
        </button>
      </div>
    </div>
  );
}

export default App;