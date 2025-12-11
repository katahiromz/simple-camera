import React, { useRef, useState, useEffect, useCallback } from 'react';
import './App.css';

const IS_PRODUCTION = import.meta.env.MODE === 'production'; // 製品版か？
const IS_JAPAN_OR_KOREA = true; // 日本か韓国か？ 判定が面倒臭いので常に仮定

// アプリケーションのベースパスを取得
const BASE_URL = import.meta.env.BASE_URL;

// カメラのシャッター音。
const cameraShutterSoundUrl = `${BASE_URL}camera-shutter-sound.mp3`;

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

  useEffect(() => {
    zoomRef.current = zoom;
    panOffsetRef.current = panOffset;
    if (IS_JAPAN_OR_KOREA) { // 日本と韓国ではシャッタ―音を鳴らさなければならない。
      cameraShutterSoundRef.current = new Audio(cameraShutterSoundUrl);
    }
  }, [zoom, panOffset]);

  // --- カメラアクセスロジック ---
  useEffect(() => {
    let currentStream = null;

    // Android の権限が付与されるまで待機する
    const waitForAndroidPermissions = async () => {
      // Android アプリ内で実行されているか確認
      if (typeof window.android !== 'undefined' && typeof window.android.hasMediaPermissions === 'function') {
        // 権限チェック（最大30秒間、500msごとに確認）
        const PERMISSION_POLL_INTERVAL_MS = 500;
        const PERMISSION_TIMEOUT_MS = 30000;
        const maxAttempts = PERMISSION_TIMEOUT_MS / PERMISSION_POLL_INTERVAL_MS;
        
        for (let i = 0; i < maxAttempts; i++) {
          try {
            if (window.android.hasMediaPermissions()) {
              return true; // 権限が付与されている
            }
          } catch (e) {
            console.warn('権限チェックエラー:', e);
          }
          // 待機
          await new Promise(resolve => setTimeout(resolve, PERMISSION_POLL_INTERVAL_MS));
        }
        console.warn('Android 権限の取得がタイムアウトしました');
        return false;
      }
      // Android アプリ外（ブラウザ等）では即座に続行
      return true;
    };

    // カメラを要求する(再帰関数)
    const requestCamera = async (facingMode, audio, retry = 0) => {
      if (retry >= 4) return null; // 修正: 失敗時は null を返す
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

      // Android の権限が付与されるまで待機
      const permissionsGranted = await waitForAndroidPermissions();
      if (!permissionsGranted) {
        console.error('Android の権限が付与されませんでした');
        return;
      }

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

  // 写真撮影
  const takePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');

    if (IS_JAPAN_OR_KOREA) { // 日本と韓国ではシャッタ―音を鳴らさなければならない。
      // シャッター音の前に音量の保存と調整
      try {
        android.onStartShutterSound();
      } catch (e) {}

      // シャッター音の再生
      cameraShutterSoundRef.current?.play().catch(e => console.error("シャッター音再生エラー:", e));

      // シャッター音の後に音量の調整
      try {
        android.onEndShutterSound();
      } catch (e) {}
    }

    ctx.drawImage(videoRef.current, 0, 0);

    const link = document.createElement('a');
    link.download = `photo_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // 録画の開始／停止
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // 録画開始
  const startRecording = () => {
    if (!stream) return;
    chunksRef.current = []; // 録画用データをクリア

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
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `video_${Date.now()}.webm`;
      link.click();
      URL.revokeObjectURL(url);
    };

    // 録画開始
    mediaRecorderRef.current.start();
    setIsRecording(true);
  };

  // 録画停止
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
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